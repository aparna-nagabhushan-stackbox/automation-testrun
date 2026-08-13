const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { segmentByBlocks } = require('../services/blockMatcher');

// Trimmed from a real recording this app produced (server/recordings/ is
// gitignored, so this must be self-contained — a test reading that path
// directly only passes on the machine that happened to record it, and fails
// ENOENT on every fresh clone and in CI). Kept identical to blockMatcher.test.js's
// CODEGEN_LOGIN_CODE, since both are standing in for the same real recording.
const RAW_CODEGEN = `
  await page.goto('http://localhost:3000/');
  await page.getByRole('textbox', { name: 'Enter your email' }).click();
  await page.getByRole('textbox', { name: 'Enter your email' }).fill('tanuja@stackbox.xyz');
  await page.getByRole('textbox', { name: 'Enter password' }).click();
  await page.getByRole('textbox', { name: 'Enter password' }).fill('123456789');
  await page.getByRole('button', { name: 'Login' }).click();
`;

// Deviation from the brief's literal test text: unlike blocks.js/reviewQueue.js
// (auth'd once at the index.js mount level, so a fake `req.user` middleware
// upstream of the router is enough), recorder.js's existing routes each call
// `requireAuth` directly inline — and requireAuth only trusts a real signed
// `auth_token` cookie (server/auth.js), ignoring any pre-set req.user. A fake
// req.user middleware alone 401s on /inpage/start before /generate is ever
// reached. So this harness issues a genuine signed cookie (same shape as
// auth.js's signToken) and adds cookie-parser, exercising the real,
// unmodified requireAuth rather than bypassing it.
const AUTH_COOKIE = 'auth_token=' + jwt.sign(
  { sub: '1', email: 'a@stackbox.xyz', role: 'user' },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);
const AUTH_HEADERS = { Cookie: AUTH_COOKIE };
const JSON_HEADERS = { 'Content-Type': 'application/json', ...AUTH_HEADERS };

// The review-queue router is mounted alongside the recorder one so the
// record -> review -> promote -> record-again loop can be walked through the
// real endpoints (promote only needs `req.user.role`, which the fake
// middleware below supplies as admin; recorder routes re-derive req.user from
// the signed cookie via their own requireAuth).
function freshApp(claudeClient) {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stacktest-recgen-'));
  delete require.cache[require.resolve('../db')];
  delete require.cache[require.resolve('../routes/recorder')];
  delete require.cache[require.resolve('../routes/reviewQueue')];
  const createRecorderRouter = require('../routes/recorder');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, res, next) => { req.user = { email: 'a@stackbox.xyz', role: 'admin' }; next(); });
  app.use('/api/recorder', createRecorderRouter({ claudeClient }));
  app.use('/api/review-queue', require('../routes/reviewQueue'));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

// Claude returns BARE selector strings — `#submit`, not `"'#submit'"`. Fakes
// that echoed the extractor's internal key format hid the bug where block
// attribution could never match anything Claude actually sends.
function fakeClient(toolInput) {
  return { messages: { create: async () => ({ content: [{ type: 'tool_use', name: 'generate_test', input: toolInput }] }) } };
}

// A settable fake, for tests that call /generate twice with different results.
function mutableClient(initial) {
  const holder = { input: initial };
  holder.client = { messages: { create: async () => ({ content: [{ type: 'tool_use', name: 'generate_test', input: holder.input }] }) } };
  return holder;
}

async function startInpage(base, events) {
  const started = await fetch(base + '/inpage/start', { method: 'POST', headers: AUTH_HEADERS });
  const { sessionId } = await started.json();
  await fetch(base + `/inpage/${sessionId}/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  return sessionId;
}

function generate(base, sessionId, body) {
  return fetch(base + `/inpage/${sessionId}/generate`, {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body),
  }).then((r) => r.json());
}

test('inpage generate: masks test data and queues review when confidence is low', async () => {
  const client = fakeClient({
    summary: 'Logs in.',
    steps: [{ description: 'Fill password', selector: '#pwd', confidence: 'low' }],
    code: "await page.fill('#pwd', 'hunter2');",
    testData: { password: 'hunter2' },
  });
  const { server, port } = await listen(freshApp(client));
  try {
    const base = `http://localhost:${port}/api/recorder`;
    const sessionId = await startInpage(base, [{ type: 'click', selector: '#pwd', url: 'http://x' }]);
    const body = await generate(base, sessionId, { project: 'Inbound', flowName: 'Operator login' });

    assert.equal(body.testData.password, '$env:PASSWORD');
    assert.equal(body.needsReview, true);
    assert.equal(body.testCaseName, 'inbound_operator_login');
    assert.equal(body.steps[0].blockId, null);
  } finally {
    server.close();
  }
});

test('inpage generate: the plaintext value of a masked field is scrubbed from the cleaned code too', async () => {
  const client = fakeClient({
    summary: 'Logs in.',
    steps: [
      { description: 'Go to the login page', selector: 'http://x', confidence: 'high' },
      { description: 'Fill password', selector: '#pwd', confidence: 'high' },
    ],
    code: "await page.goto('http://x');\nawait page.fill('#pwd', 'hunter2');",
    testData: { password: 'hunter2', vendor: 'Acme' },
  });
  const { server, port } = await listen(freshApp(client));
  try {
    const base = `http://localhost:${port}/api/recorder`;
    const sessionId = await startInpage(base, [{ type: 'fill', selector: '#pwd', value: 'hunter2', url: 'http://x' }]);
    const body = await generate(base, sessionId, { project: 'Inbound', flowName: 'Operator login' });

    assert.ok(!body.code.includes('hunter2'), 'cleaned code should not carry the plaintext secret');
    assert.match(body.code, /'\$env:PASSWORD'/);

    // …and what reaches disk is the masked version, not the original.
    const stored = require('../db').getGenerationByRecordingId(sessionId);
    assert.ok(!stored.code.includes('hunter2'));
    // Non-sensitive values are left alone.
    assert.equal(body.testData.vendor, 'Acme');
  } finally {
    server.close();
  }
});

test('inpage generate: the raw recording is persisted alongside the cleaned code', async () => {
  const client = fakeClient({
    summary: 'Clicks submit.',
    steps: [
      { description: 'Go to the page', selector: 'http://x', confidence: 'high' },
      { description: 'Click submit', selector: '#submit', confidence: 'high' },
    ],
    code: "// cleaned by claude\nawait page.getByRole('button', { name: 'Submit' }).click();",
    testData: {},
  });
  const { server, port } = await listen(freshApp(client));
  try {
    const base = `http://localhost:${port}/api/recorder`;
    const sessionId = await startInpage(base, [{ type: 'click', selector: '#submit', url: 'http://x' }]);
    await generate(base, sessionId, { project: 'Inbound', flowName: 'Operator login' });

    const stored = require('../db').getGenerationByRecordingId(sessionId);
    assert.match(stored.rawCode, /page\.click\('#submit'\)/, 'rawCode is the recorder output, not the cleaned code');
    assert.match(stored.code, /cleaned by claude/);
  } finally {
    server.close();
  }
});

test('the stored raw recording is masked too, and the masked version still matches as a block', async () => {
  // The raw recording becomes a promoted block's code, and GET /api/blocks
  // serves that to every logged-in user — so it gets the same masking the
  // cleaned code does, as long as masking doesn't disturb block matching.
  const holder = mutableClient({
    summary: 'Logs in.',
    steps: [
      { description: 'Go to the login page', selector: 'http://x/login', confidence: 'high' },
      { description: 'Fill the password field', selector: '#password', confidence: 'low' },
    ],
    code: "await page.goto('http://x/login');\nawait page.fill('#password', 's3cr3t-pass');",
    testData: { password: 's3cr3t-pass' },
  });
  const { server, port } = await listen(freshApp(holder.client));
  try {
    const db = require('../db');
    const base = `http://localhost:${port}/api/recorder`;
    const LOGIN_EVENTS = [{ type: 'fill', selector: '#password', value: 's3cr3t-pass', url: 'http://x/login' }];

    const first = await startInpage(base, LOGIN_EVENTS);
    await generate(base, first, { project: 'Inbound', flowName: 'Operator login' });

    const stored = db.getGenerationByRecordingId(first);
    assert.ok(!stored.rawCode.includes('s3cr3t-pass'), 'the stored raw recording must not carry the plaintext value');
    assert.match(stored.rawCode, /'\$env:PASSWORD'/);
    // Still the raw recorder representation, just with the value swapped out.
    assert.match(stored.rawCode, /page\.fill\('#password', /);

    // Promote it, then record the same flow plus one new step: the masked block
    // still matches the (unmasked) new recording, because masking only touched
    // a value argument.
    const entry = db.getReviewQueue().find((e) => e.recordingId === first);
    const promoteRes = await fetch(`http://localhost:${port}/api/review-queue/${entry.id}/promote`, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ blockName: 'Login' }),
    });
    const { block } = await promoteRes.json();
    assert.ok(!block.code.includes('s3cr3t-pass'), 'a promoted block must not carry the plaintext value');

    holder.input = {
      summary: 'Logs in, then opens the zone override dropdown.',
      steps: [
        { description: 'Go to the login page', selector: 'http://x/login', confidence: 'high' },
        { description: 'Fill the password field', selector: '#password', confidence: 'high' },
        { description: 'Click zone override dropdown', selector: '.zone-override-dd', confidence: 'low' },
      ],
      code: 'cleaned',
      testData: { password: 's3cr3t-pass' },
    };
    const second = await startInpage(base, [...LOGIN_EVENTS, { type: 'click', selector: '.zone-override-dd' }]);
    const secondGen = await generate(base, second, { project: 'Inbound', flowName: 'Operator login' });

    assert.deepEqual(secondGen.matchedBlockNames, ['Login']);
    assert.deepEqual(secondGen.steps.map((s) => s.blockName), ['Login', 'Login', null]);
  } finally {
    server.close();
  }
});

test('raw-code masking is skipped when it would change the extracted interaction sequence', async () => {
  // Pathological case: the sensitive value is ALSO the recorded selector, so
  // masking would rewrite an extraction key and quietly break matching for any
  // block promoted from this recording. Matching correctness wins; the raw
  // recording is stored unmasked (and a warning is logged).
  const client = fakeClient({
    summary: 'Types a PIN.',
    steps: [
      { description: 'Go to the page', selector: 'http://x', confidence: 'high' },
      { description: 'Click the PIN element', selector: '123456', confidence: 'low' },
    ],
    code: "await page.click('123456');",
    testData: { otp: '123456' },
  });
  const { server, port } = await listen(freshApp(client));
  try {
    const db = require('../db');
    const base = `http://localhost:${port}/api/recorder`;
    const sessionId = await startInpage(base, [{ type: 'click', selector: '123456', url: 'http://x' }]);
    const body = await generate(base, sessionId, { project: 'Inbound', flowName: 'Pin entry' });

    // No crash, normal response, testData still masked.
    assert.equal(body.testData.otp, '$env:OTP');
    const stored = db.getGenerationByRecordingId(sessionId);
    assert.match(stored.rawCode, /page\.click\('123456'\)/, 'raw code is kept as recorded so the keys still line up');
    // And the keys really are unchanged, which is the point of the fallback.
    const { extractSelectors } = require('../services/blockMatcher');
    assert.deepEqual(extractSelectors(stored.rawCode), ['http://x', '123456']);
  } finally {
    server.close();
  }
});

test('inpage generate: a step matching an existing block is tagged with it and skips review on its own', async () => {
  const LOGIN_CODE = `await page.goto('http://x');\nawait page.click('#submit');`;
  const client = fakeClient({
    summary: 'Logs in then opens zone override.',
    steps: [
      { description: 'Go to the page', selector: 'http://x', confidence: 'high' },
      { description: 'Click log in button', selector: '#submit', confidence: 'high' },
      { description: 'Click zone override dropdown', selector: '.zone-override-dd', confidence: 'low' },
    ],
    code: LOGIN_CODE + `\nawait page.click('.zone-override-dd');`,
    testData: {},
  });
  const { server, port } = await listen(freshApp(client));
  try {
    const base = `http://localhost:${port}/api/recorder`;
    // This test app doesn't mount /api/blocks — seed the block straight
    // through db.js. The block covers the recording's first two extracted
    // interactions (the goto and the #submit click), leaving the third as new.
    require('../db').createBlock({ project: 'Inbound', name: 'Login', code: LOGIN_CODE, createdBy: 'a@stackbox.xyz' });

    const sessionId = await startInpage(base, [
      { type: 'click', selector: '#submit', url: 'http://x' },
      { type: 'click', selector: '.zone-override-dd' },
    ]);
    const body = await generate(base, sessionId, { project: 'Inbound', flowName: 'Operator login' });

    assert.equal(body.steps[0].blockName, 'Login');
    assert.equal(body.steps[1].blockName, 'Login');
    assert.equal(body.steps[2].blockId, null);
    assert.equal(body.testCaseName, 'inbound_operator_login_zone_override');
  } finally {
    server.close();
  }
});

test('inpage generate: a project with existing blocks but zero matches gets no naming suffix (distinct from an empty-library project reaching the same no-suffix outcome)', async () => {
  const LOGIN_CODE = `await page.click('#submit');`;
  const client = fakeClient({
    summary: 'Fills a totally unrelated field.',
    steps: [
      { description: 'Go to the page', selector: 'http://x', confidence: 'high' },
      { description: 'Fill unrelated field', selector: '#other-field', confidence: 'high' },
    ],
    code: `await page.fill('#other-field', 'x');`,
    testData: {},
  });
  const { server, port } = await listen(freshApp(client));
  try {
    const base = `http://localhost:${port}/api/recorder`;
    // Project already has a registered block ("Login"), but this recording's
    // interactions never appear in it — segmentByBlocks yields all-new
    // segments, so newSteps.length === steps.length (100% new) even though
    // blocks.length > 0. This is the `noBlockMatched` path (steps.length
    // matches but via "everything's new", not "library is empty") — the naming
    // suffix must stay off here too, same as the first test, but for a
    // different underlying reason.
    require('../db').createBlock({ project: 'Inbound', name: 'Login', code: LOGIN_CODE, createdBy: 'a@stackbox.xyz' });

    const sessionId = await startInpage(base, [{ type: 'fill', selector: '#other-field', value: 'x', url: 'http://x' }]);
    const body = await generate(base, sessionId, { project: 'Inbound', flowName: 'Operator login' });

    assert.equal(body.steps[0].blockId, null);
    assert.equal(body.needsReview, true);
    assert.equal(body.testCaseName, 'inbound_operator_login');
  } finally {
    server.close();
  }
});

test('generate 500s with a clear error when no Claude client is configured', async () => {
  const { server, port } = await listen(freshApp(null));
  try {
    const base = `http://localhost:${port}/api/recorder`;
    const started = await fetch(base + '/inpage/start', { method: 'POST', headers: AUTH_HEADERS });
    const { sessionId } = await started.json();
    const res = await fetch(base + `/inpage/${sessionId}/generate`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
    assert.equal(res.status, 500);
  } finally {
    server.close();
  }
});

test('re-generating the same recording supersedes its pending review entry instead of duplicating it', async () => {
  const holder = mutableClient({
    summary: 'Logs in.',
    steps: [
      { description: 'Go to the page', selector: 'http://x', confidence: 'high' },
      { description: 'Click submit', selector: '#submit', confidence: 'low' },
    ],
    code: `await page.click('#submit');`,
    testData: {},
  });
  const { server, port } = await listen(freshApp(holder.client));
  try {
    const db = require('../db');
    const base = `http://localhost:${port}/api/recorder`;
    const sessionId = await startInpage(base, [{ type: 'click', selector: '#submit', url: 'http://x' }]);

    await generate(base, sessionId, { project: 'Inbound', flowName: 'Operator login' });
    await generate(base, sessionId, { project: 'Inbound', flowName: 'Operator login' });

    const pending = db.getReviewQueue().filter((e) => e.recordingId === sessionId && e.status === 'pending');
    assert.equal(pending.length, 1, 'two /generate calls on one recording must leave one pending entry');
    assert.equal(db.getGenerations().length, 1);

    // And a re-generation that no longer needs review clears the stale entry.
    holder.input = {
      summary: 'Logs in.',
      steps: [
        { description: 'Go to the page', selector: 'http://x', confidence: 'high' },
        { description: 'Click submit', selector: '#submit', confidence: 'high' },
      ],
      code: `await page.click('#submit');`,
      testData: {},
    };
    const third = await generate(base, sessionId, { project: 'Inbound', flowName: 'Operator login' });
    assert.equal(third.needsReview, false);
    assert.equal(db.getReviewQueue().filter((e) => e.status === 'pending').length, 0);
  } finally {
    server.close();
  }
});

test('end-to-end: a recording is reviewed, promoted to a block, and a later recording reuses it', async () => {
  const NAVIGATE = { description: 'Go to the login page', selector: 'http://x', confidence: 'high' };
  const FILL_USER = { description: 'Fill the username field', selector: '#user', confidence: 'high' };
  const CLICK_SUBMIT = { description: 'Click the log in button', selector: '#submit', confidence: 'low' };

  const holder = mutableClient({
    summary: 'Logs the operator in.',
    steps: [NAVIGATE, FILL_USER, CLICK_SUBMIT],
    code: "await page.goto('http://x');\nawait page.fill('#user', 'op');\nawait page.click('#submit');",
    testData: {},
  });
  const { server, port } = await listen(freshApp(holder.client));
  try {
    const db = require('../db');
    const base = `http://localhost:${port}/api/recorder`;
    const LOGIN_EVENTS = [
      { type: 'fill', selector: '#user', value: 'op', url: 'http://x' },
      { type: 'click', selector: '#submit' },
    ];

    // (a) Record a small flow with 2+ interactions and generate.
    const first = await startInpage(base, LOGIN_EVENTS);
    const firstGen = await generate(base, first, { project: 'Inbound', flowName: 'Operator login' });

    // (b) No block exists yet, so nothing is reused and it lands in review.
    assert.deepEqual(firstGen.matchedBlockNames, []);
    assert.deepEqual(firstGen.steps.map((s) => s.blockName), [null, null, null]);
    assert.equal(firstGen.needsReview, true);
    const entry = db.getReviewQueue().find((e) => e.recordingId === first);
    assert.equal(entry.status, 'pending');

    // (c) Promote it into a named block through the real endpoint.
    const promoteRes = await fetch(`http://localhost:${port}/api/review-queue/${entry.id}/promote`, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ blockName: '  Login  ' }),
    });
    const { block } = await promoteRes.json();
    assert.equal(promoteRes.status, 200);
    assert.equal(block.name, 'Login', 'block name is trimmed');
    // The block carries the RAW recording, so it is in the same representation
    // future recordings get extracted from.
    assert.match(block.code, /page\.fill\('#user', 'op'\)/);

    // (d) Record a flow that starts with the SAME interactions plus one new step.
    holder.input = {
      summary: 'Logs in, then opens the zone override dropdown.',
      steps: [
        NAVIGATE, FILL_USER, CLICK_SUBMIT,
        { description: 'Click zone override dropdown', selector: '.zone-override-dd', confidence: 'low' },
      ],
      code: "await page.goto('http://x');\nawait page.fill('#user', 'op');\nawait page.click('#submit');\nawait page.click('.zone-override-dd');",
      testData: {},
    };
    const second = await startInpage(base, [...LOGIN_EVENTS, { type: 'click', selector: '.zone-override-dd' }]);
    const secondGen = await generate(base, second, { project: 'Inbound', flowName: 'Operator login' });

    // (e) The reused steps are tagged with the block; only the new step isn't.
    assert.deepEqual(secondGen.matchedBlockNames, ['Login']);
    assert.deepEqual(secondGen.steps.map((s) => s.blockName), ['Login', 'Login', 'Login', null]);
    assert.equal(secondGen.steps[3].blockId, null);
    // The auto-name is distinguished by the one genuinely new step…
    assert.equal(secondGen.testCaseName, 'inbound_operator_login_zone_override');
    // …and only that step is what review is asked about.
    const secondEntry = db.getReviewQueue().find((e) => e.recordingId === second);
    assert.deepEqual(secondEntry.flaggedSteps, [2, 3]);
  } finally {
    server.close();
  }
});

test('end-to-end: a block promoted from a real codegen recording matches a later codegen recording', async () => {
  // The exact failure mode the old code had: both the block and the new
  // recording come from Playwright's own codegen (modern locator API).
  const { server, port } = await listen(freshApp(null));
  try {
    const db = require('../db');
    // Stand in for a codegen /generate having run: the generation keeps the raw
    // recording, and Claude's cleaned code is a different, rewritten shape.
    db.upsertGeneration({
      recordingId: 'codegen-1',
      code: "// cleaned by claude\nawait page.getByTestId('email').fill('x');",
      rawCode: RAW_CODEGEN,
    });
    const entry = db.createReviewEntry({ project: 'Inbound', recordingId: 'codegen-1', reason: 'weak locator', flaggedSteps: [0] });

    const res = await fetch(`http://localhost:${port}/api/review-queue/${entry.id}/promote`, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ blockName: 'Codegen login' }),
    });
    const { block } = await res.json();
    assert.equal(block.code, RAW_CODEGEN, 'promote stores the raw recording, not the cleaned code');

    // A later codegen recording that starts with the same interactions reuses
    // the block for that prefix and flags only the trailing new interaction.
    const later = RAW_CODEGEN + `\n  await page.getByRole('button', { name: 'Save' }).click();\n`;
    const segments = segmentByBlocks(later, db.getBlocksByProject('Inbound'));
    assert.equal(segments.length, 2);
    assert.equal(segments[0].blockName, 'Codegen login');
    assert.deepEqual(segments[1].selectors, ["getByRole('button', { name: 'Save' })"]);
  } finally {
    server.close();
  }
});
