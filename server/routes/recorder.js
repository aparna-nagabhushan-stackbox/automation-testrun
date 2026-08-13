// Wraps Playwright's own codegen recorder: spawns a real browser on THIS
// machine (wherever the server process lives), watches every click/type/
// navigation, and writes out ready-to-run Playwright code when the user
// closes that browser window. Only works for whoever is running the server
// locally — a teammate hitting a centrally-hosted copy of this server
// wouldn't see a browser open on their own screen.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { requireAuth } = require('../auth');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const { generateFromCode } = require('../services/claudeGenerate');
const { maskSensitiveFields, maskSensitiveValuesInCode } = require('../services/dataMasking');
const { segmentByBlocks, segmentForStepIndex, extractSelectors } = require('../services/blockMatcher');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

// By default codegen launches a fresh throwaway browser context each time —
// blank history, no saved cookies/logins — which reads as "incognito" even
// though it isn't literally Chrome's incognito mode. `--load-storage` /
// `--save-storage` carry cookies and localStorage over between recording
// sessions so you don't have to sign in again every time.
// (Playwright also has a `--user-data-dir` flag for a truly persistent
// profile, but as of v1.62 it makes codegen emit broken code — a
// `browser.newContext()` call followed by a reference to an undefined
// `page` variable — so storage-state carryover is used instead.)
module.exports = function createRecorderRouter(deps = {}) {
  const claudeClient = deps.claudeClient !== undefined
    ? deps.claudeClient
    : (process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null);
  const router = express.Router();

  const RECORDER_PROFILE_DIR = path.join(__dirname, '..', 'recorder-profile');
fs.mkdirSync(RECORDER_PROFILE_DIR, { recursive: true });
const RECORDER_STORAGE_STATE = path.join(RECORDER_PROFILE_DIR, 'state.json');

// Invoke Playwright's CLI entry script directly with `node`, rather than
// the .bin/playwright(.cmd) shim through a shell — on Windows that shim can
// only be run with `shell: true`, which passes the URL (user input)
// through shell string interpolation and opens the door to command
// injection. Spawning `node <cli.js> ...` needs no shell at all, so args
// reach the process as a real argv array no matter what characters they
// contain.
const PLAYWRIGHT_CLI = path.join(__dirname, '..', '..', 'node_modules', 'playwright', 'cli.js');

// sessionId -> { child, outFile, stderr, ownerEmail }
const sessions = new Map();

router.post('/', requireAuth, (req, res) => {
  const url = (req.body?.url || 'http://localhost:3000').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'URL must start with http:// or https://' });
  if (!fs.existsSync(PLAYWRIGHT_CLI)) return res.status(500).json({ error: 'Playwright CLI not found — run npm install first.' });

  const sessionId = crypto.randomBytes(8).toString('hex');
  const outFile = path.join(RECORDINGS_DIR, sessionId + '.js');

  const args = [PLAYWRIGHT_CLI, 'codegen', url, '-o', outFile, '--target', 'javascript', '--save-storage', RECORDER_STORAGE_STATE];
  if (fs.existsSync(RECORDER_STORAGE_STATE)) args.push('--load-storage', RECORDER_STORAGE_STATE);

  const child = spawn(process.execPath, args, {
    cwd: path.join(__dirname, '..', '..'),
  });

  const session = { child, outFile, stderr: '', ownerEmail: req.user.email };
  child.stderr.on('data', d => { session.stderr += d.toString(); });
  sessions.set(sessionId, session);

  child.on('exit', () => {
    // Leave the session in the map so /status can still report the result;
    // it self-cleans a few minutes after the browser closes.
    setTimeout(() => sessions.delete(sessionId), 5 * 60 * 1000);
  });

  res.json({ sessionId });
});

router.get('/:id/status', requireAuth, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'No recording session with that id (it may have already expired).' });

  const stillRunning = session.child.exitCode === null && !session.child.killed;
  if (stillRunning) return res.json({ done: false });

  if (fs.existsSync(session.outFile)) {
    const code = fs.readFileSync(session.outFile, 'utf8');
    return res.json({ done: true, code });
  }
  res.json({ done: true, code: null, error: session.stderr.trim() || 'The recorder closed without producing any code — did the browser window get closed before you clicked anything?' });
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'No recording session with that id.' });
  if (session.child.exitCode === null) session.child.kill();
  res.json({ ok: true });
});

// Write a recorded script into tests/recorded/ as a real .spec.js file, so
// it can be opened and run directly in VS Code (or `npx playwright test`) —
// separate from the in-app Test Case entry, which only stores the code as
// text.
const RECORDED_TESTS_DIR = path.join(__dirname, '..', '..', 'tests', 'recorded');

router.post('/save-file', requireAuth, (req, res) => {
  const { code, name } = req.body || {};
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'No code to save.' });

  const safeName = (name || 'recorded-' + Date.now())
    .toString()
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || ('recorded-' + Date.now());

  fs.mkdirSync(RECORDED_TESTS_DIR, { recursive: true });
  const filePath = path.join(RECORDED_TESTS_DIR, safeName + '.spec.js');
  // Belt-and-suspenders: make sure the sanitized name didn't somehow escape
  // the recordings directory (e.g. via a name that sanitizes down to "..").
  if (path.dirname(filePath) !== RECORDED_TESTS_DIR) return res.status(400).json({ error: 'Invalid file name.' });

  fs.writeFileSync(filePath, code);
  res.json({ path: 'tests/recorded/' + safeName + '.spec.js' });
});

// ── In-tab recorder ──
// Records real clicks/typing in a browser tab you already have open,
// instead of the separate window codegen launches. Works by dropping a
// small script (via bookmarklet) into that page; the script watches DOM
// events and posts them here as they happen. This is a genuinely different
// mechanism from codegen above — no automation control over the tab, just
// a content script reporting what it sees — so selector quality is more
// basic (id / data-testid / text / a CSS nth-child fallback) than
// Playwright's own recorder produces, and it only sees one page's worth of
// activity at a time: a full-page navigation (not an SPA route change)
// unloads the injected script, so recording a multi-page flow means
// re-clicking the bookmarklet on each new page — the events still append
// to the same session either way.
const inpageSessions = new Map(); // sessionId -> { events: [], ownerEmail, createdAt }

router.post('/inpage/start', requireAuth, (req, res) => {
  const sessionId = crypto.randomBytes(8).toString('hex');
  inpageSessions.set(sessionId, { events: [], ownerEmail: req.user.email, createdAt: Date.now() });

  const origin = `${req.protocol}://${req.get('host')}`;
  const bookmarklet = buildBookmarklet(origin, sessionId);
  res.json({ sessionId, bookmarklet });
});

// Cross-origin ingest endpoint: the recorded page lives on whatever site
// you're recording, a different origin than this server, so CORS has to be
// opened explicitly here. No session cookie is required (or sent) — the
// random sessionId is the only thing tying events to a recording.
router.options('/inpage/:sessionId/events', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});
router.post('/inpage/:sessionId/events', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  const session = inpageSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Unknown or expired recording session.' });
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  session.events.push(...events);
  res.json({ ok: true, count: session.events.length });
});

router.get('/inpage/:sessionId/code', requireAuth, (req, res) => {
  const session = inpageSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Unknown or expired recording session.' });
  res.json({ code: eventsToPlaywrightCode(session.events), eventCount: session.events.length });
});

router.post('/inpage/:sessionId/clear', requireAuth, (req, res) => {
  inpageSessions.delete(req.params.sessionId);
  res.json({ ok: true });
});

function jsStringLiteral(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
}

function eventsToPlaywrightCode(events) {
  const lines = [];
  let lastUrl = null;
  for (const ev of events) {
    if (ev.url && ev.url !== lastUrl) {
      lines.push(`  await page.goto(${jsStringLiteral(ev.url)});`);
      lastUrl = ev.url;
    }
    if (!ev.selector) continue;
    if (ev.type === 'click') {
      lines.push(`  await page.click(${jsStringLiteral(ev.selector)});`);
    } else if (ev.type === 'fill') {
      lines.push(`  await page.fill(${jsStringLiteral(ev.selector)}, ${jsStringLiteral(ev.value ?? '')});`);
    } else if (ev.type === 'select') {
      lines.push(`  await page.selectOption(${jsStringLiteral(ev.selector)}, ${jsStringLiteral(ev.value ?? '')});`);
    } else if (ev.type === 'check') {
      lines.push(`  await page.${ev.checked ? 'check' : 'uncheck'}(${jsStringLiteral(ev.selector)});`);
    } else if (ev.type === 'enter') {
      lines.push(`  await page.press(${jsStringLiteral(ev.selector)}, 'Enter');`);
    }
  }
  const body = lines.length ? lines.join('\n') : '  // No interactions were recorded yet.';
  return `const { chromium } = require('playwright');\n\n(async () => {\n  const browser = await chromium.launch({ headless: false });\n  const page = await browser.newPage();\n${body}\n\n  await browser.close();\n})();\n`;
}

// Builds a `javascript:` bookmarklet URI. The injected script:
//  - guards against double-injection with a window flag
//  - shows a small floating "Recording" badge so it's obvious it's active
//  - captures clicks and form input in the CAPTURE phase (so it still sees
//    the event even if the page's own handler calls stopPropagation)
//  - builds a best-effort selector per element: #id > [data-testid] >
//    name attribute > a CSS nth-of-type path
//  - posts each event to this server as it happens
function buildBookmarklet(origin, sessionId) {
  const injected = `
(function(){
  if (window.__stacktestRecording) return;
  window.__stacktestRecording = true;
  var ORIGIN = ${JSON.stringify(origin)};
  var SESSION = ${JSON.stringify(sessionId)};

  function cssSelector(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    var testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
    if (testId) return '[data-testid="' + testId + '"]';
    if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (!parent) { parts.unshift(tag); break; }
      var siblings = Array.prototype.filter.call(parent.children, function(c){ return c.tagName === node.tagName; });
      var idx = siblings.indexOf(node) + 1;
      parts.unshift(tag + (siblings.length > 1 ? ':nth-of-type(' + idx + ')' : ''));
      if (node.id) { parts[0] = tag + '#' + CSS.escape(node.id); break; }
      node = parent;
    }
    return parts.join(' > ');
  }

  function send(ev) {
    ev.url = location.href;
    fetch(ORIGIN + '/api/recorder/inpage/' + SESSION + '/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [ev] }),
    }).catch(function(){});
  }

  document.addEventListener('click', function(e) {
    var sel = cssSelector(e.target);
    if (sel) send({ type: 'click', selector: sel });
  }, true);

  document.addEventListener('change', function(e) {
    var el = e.target;
    var sel = cssSelector(el);
    if (!sel) return;
    if (el.tagName === 'SELECT') send({ type: 'select', selector: sel, value: el.value });
    else if (el.type === 'checkbox' || el.type === 'radio') send({ type: 'check', selector: sel, checked: el.checked });
    else send({ type: 'fill', selector: sel, value: el.value });
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var sel = cssSelector(e.target);
      if (sel) send({ type: 'enter', selector: sel });
    }
  }, true);

  var badge = document.createElement('div');
  badge.textContent = '\\u23fa StackTest recording…';
  badge.style.cssText = 'position:fixed;bottom:16px;right:16px;background:#c62828;color:#fff;padding:8px 14px;border-radius:20px;font:600 12px sans-serif;z-index:2147483647;box-shadow:0 2px 8px rgba(0,0,0,.3)';
  document.body.appendChild(badge);
  send({ type: 'click', selector: null }); // announce presence / seed the initial URL
})();
`.trim();
  return 'javascript:' + encodeURIComponent(injected);
}

  const LEADING_VERBS = /^(click|type|fill|select|check|uncheck|confirm|press|enter|choose|open)\s+/i;
  function slugify(s) {
    return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  // "Click zone override dropdown" -> "zone_override" — strips the leading
  // action verb and keeps the next couple of meaningful words, so the
  // auto-generated name reads like the mockup's `..._zone_override` suffix
  // instead of repeating the whole step description.
  function shortLabel(description) {
    const stripped = String(description || '').replace(LEADING_VERBS, '');
    return slugify(stripped.trim().split(/\s+/).slice(0, 2).join(' '));
  }
  // The distinguishing suffix (first new step's short label) is only useful
  // when the recording is a genuine PARTIAL match against the block
  // library — some steps reused, some new — so the suffix highlights the
  // part that's actually different. When newSteps.length === steps.length,
  // either the whole flow is new because the library is empty (nothing to
  // contrast against) or every known block failed to match (the same
  // "nothing meaningfully matched" case `noBlockMatched` below already
  // captures) — either way there's no partial-match story to tell, so no
  // suffix is added.
  function buildTestCaseName({ project, flowName, newSteps, totalSteps }) {
    const parts = [slugify(project), slugify(flowName)];
    if (newSteps.length && newSteps.length < totalSteps) parts.push(shortLabel(newSteps[0].description));
    return parts.filter(Boolean).join('_');
  }

  // Masks the recorded code's secrets, but only accepts the result if it still
  // extracts to the identical interaction sequence — a block's whole job is to
  // match future recordings, so masking must never be allowed to change what it
  // matches on. See the call site for why this can (very rarely) fail.
  function maskRawCodeIfSafe(rawCode, testData, maskedTestData, recordingId) {
    const masked = maskSensitiveValuesInCode(rawCode, testData, maskedTestData);
    if (masked === rawCode) return rawCode;
    const before = extractSelectors(rawCode);
    const after = extractSelectors(masked);
    if (after.length === before.length && after.every((key, i) => key === before[i])) return masked;
    console.warn(
      `[recorder] recording ${recordingId}: masking a sensitive value would change its extracted `
      + 'interaction sequence, so the raw recording is being stored unmasked to keep block matching '
      + 'correct. A block promoted from it will contain that value in plaintext.'
    );
    return rawCode;
  }

  async function runGenerate({ project, flowName, recordingId, rawCode }, res) {
    if (!claudeClient) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server — AI generation is unavailable.' });
    if (!rawCode) return res.status(400).json({ error: 'No recorded code to generate from.' });

    const blocks = project ? db.getBlocksByProject(project) : [];
    const segments = segmentByBlocks(rawCode, blocks);
    const matchedBlockNames = [...new Set(segments.filter((s) => s.blockId).map((s) => s.blockName))];

    const generated = await generateFromCode(claudeClient, { rawCode, matchedBlockNames });
    const testData = maskSensitiveFields(generated.testData);
    // The cleaned code carries the typed-in values inline, so it has to be
    // masked too — otherwise a password reaches disk in plaintext here and,
    // on promote, inside a shared block.
    const code = maskSensitiveValuesInCode(generated.code, generated.testData, testData);

    // Block attribution is looked up per generated step by POSITION, not by
    // selector text — Claude only owns the natural-language layer
    // (description, confidence, cleaned code); which steps belong to a known
    // block is computed deterministically from the same segments used for
    // naming. See segmentForStepIndex for why position rather than selector.
    const steps = generated.steps.map((s) => {
      const segment = segmentForStepIndex(segments, s.index);
      return {
        ...s,
        blockId: segment ? segment.blockId : null,
        blockName: segment ? segment.blockName : null,
      };
    });

    const lowConfidenceSteps = steps.filter((s) => s.confidence === 'low').map((s) => s.index);
    const newSteps = steps.filter((s) => !s.blockId);
    // Only flag "no matching block" when there are blocks to match against
    // and truly none of them matched — a project's very first recording
    // shouldn't be forced into review just because its block library is empty.
    const noBlockMatched = blocks.length > 0 && newSteps.length === steps.length;
    const needsReview = lowConfidenceSteps.length > 0 || noBlockMatched;

    const testCaseName = buildTestCaseName({ project, flowName, newSteps, totalSteps: steps.length });

    const result = {
      recordingId, project: project || '', flowName: flowName || '', testCaseName,
      summary: generated.summary, steps, code, testData,
      matchedBlockNames, needsReview,
    };
    // `rawCode` is kept alongside the cleaned code so that promoting this
    // generation into a block stores the RAW recording. Block matching always
    // runs extraction over raw recorder output, so a block's code has to be in
    // that same representation to ever match — Claude's cleaned code prefers
    // role-based locators and is a different shape. The response below still
    // only exposes the masked `code` — rawCode is not surfaced to the client
    // until (and unless) it is promoted into a block.
    //
    // Once promoted, though, that code IS readable by every logged-in user via
    // GET /api/blocks, so the same secret masking is applied to it. Masking
    // rewrites value arguments (the second argument to `.fill()`), not selector
    // or locator arguments, so the extracted interaction sequence — the only
    // thing matching depends on — is normally untouched. The equality check
    // proves that per recording rather than assuming it: if a masked value's
    // literal text also happens to appear inside a selector or locator (say a
    // recorded PIN that is also the element's visible text, `getByText('1234')`)
    // the keys would shift and this block would stop matching, so the original
    // is kept instead. That block then retains a plaintext value, hence the
    // warning — rare, but worth being able to spot in the server log.
    db.upsertGeneration({ ...result, rawCode: maskRawCodeIfSafe(rawCode, generated.testData, testData, recordingId) });

    // Re-generating the same recording replaces its generation (upsert), so it
    // must replace its review entry too — otherwise clicking "Generate Code"
    // twice leaves two pending entries for one recording. Done unconditionally
    // so a re-generation that no longer needs review clears the stale entry.
    db.removePendingReviewEntries(recordingId);

    if (needsReview) {
      db.createReviewEntry({
        project: project || '', recordingId,
        reason: lowConfidenceSteps.length > 0 ? 'weak locator' : 'no matching block',
        flaggedSteps: lowConfidenceSteps.length > 0 ? lowConfidenceSteps : newSteps.map((s) => s.index),
      });
    }

    res.json(result);
  }

  router.post('/:id/generate', requireAuth, async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'No recording session with that id.' });
    if (!fs.existsSync(session.outFile)) return res.status(400).json({ error: 'No recorded code for this session yet.' });
    try {
      await runGenerate({
        project: req.body?.project || '', flowName: req.body?.flowName || '',
        recordingId: req.params.id, rawCode: fs.readFileSync(session.outFile, 'utf8'),
      }, res);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/inpage/:sessionId/generate', requireAuth, async (req, res) => {
    const session = inpageSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Unknown or expired recording session.' });
    try {
      await runGenerate({
        project: req.body?.project || '', flowName: req.body?.flowName || '',
        recordingId: req.params.sessionId, rawCode: eventsToPlaywrightCode(session.events),
      }, res);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
