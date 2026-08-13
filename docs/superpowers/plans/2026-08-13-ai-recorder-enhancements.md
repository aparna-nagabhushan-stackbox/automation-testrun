# AI Recorder Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing "AI Recorder" page in the StackTest dashboard (nav id `nav-automation-builder`, page id `page-automation-builder`) — in place, no new nav item — so both of its recording modes (in-tab bookmarklet and Playwright-codegen "new window") also produce, via Claude: numbered plain-English steps with confidence flags, a "what this test does" summary, cleaned code, and masked test data. Add a project-scoped, admin-managed, locked block library and a pending review queue for anything low-confidence or unmatched to a block, per AI-RECORDER-BUILD-SPEC.md.

**Architecture:** Purely additive to real files already read and understood:
- **Recording engine** — untouched. `server/routes/recorder.js`'s existing spawn/poll/cancel (window mode) and bookmarklet event-capture (in-tab mode) keep working exactly as they do today; this plan only adds a `/generate` step that runs *after* a recording already has code.
- **Auth/roles** — reuses `requireAuth`/`requireAdmin` from `server/auth.js` and the client-side `currentUser.role === 'admin'` idiom already used elsewhere in `index.html`.
- **Storage** — reuses the `server/db.js` JSON-file pattern (`readJson`/`writeJson`, numeric auto-increment `id`), adding `blocks.json`, `reviewQueue.json`, `generations.json` the same way `projects.json` already works.
- **Project scoping** — reuses the app-wide `selectedProjectName()` (the same function that already scopes automation test cases by `tc.project`) instead of inventing a new project-bar UI or a new per-project config store. No new project model.
- **Frontend** — new markup and functions inside the existing `#page-automation-builder` div and `<script>` block, following the file's existing conventions (`api()`, inline-styled cards/badges, `table-card`) — no new build step, no new CSS framework, no dark theme (the spec's `qa-platform-mockup.html` tokens are not used — they'd clash with this app's actual light UI).
- **Testing** — backend logic gets real tests using Node's built-in `node:test` (zero new dependency) plus `supertest`-free raw `fetch`-against-`http.Server` route tests (also zero new dependency, since this repo has no test framework yet and Node 18+ ships a global `fetch`). The frontend gets new assertions appended to the existing `tests/verify-dashboard.ts` Playwright E2E script.

**Tech Stack:** Existing stack unchanged. New: `@anthropic-ai/sdk` (dependency). No new devDependencies — `node:test` and Node's global `fetch` cover all new backend tests without adding `supertest`.

**Spec:** [../../../AI-RECORDER-BUILD-SPEC.md](../../../AI-RECORDER-BUILD-SPEC.md)

## Global Constraints

- The existing recording mechanics in `server/routes/recorder.js` (the `sessions`/`inpageSessions` maps, `eventsToPlaywrightCode`, the bookmarklet builder) are never rewritten — only wrapped in a factory (for test injection) and added to.
- Every block, generation, and review-queue entry is scoped by **project name**, read from `selectedProjectName()` client-side and sent as `project` in the request body/query — never leaked across projects in list endpoints.
- Sensitive test-data fields (password, otp, secret, token) are masked to `$env:VAR_NAME` before being written to disk — never persisted in plaintext (spec §3.4).
- Admin-gated writes (`POST /api/blocks`, `POST /api/review-queue/:id/approve`, `POST /api/review-queue/:id/promote`) use the real `requireAdmin` middleware — not a new header-based scheme.
- Claude calls use a forced tool call (`tool_choice: {type: 'tool', name: 'generate_test'}`) so the response is always structured JSON (spec §3.3).
- The existing "Recorded script" textarea (`#recorder-code`) and "Add as Test Case" flow (`saveRecordedCodeAsTestCase`) keep working unchanged — the new AI insights card is additive, not a replacement.

---

## File Structure

```
automation-hub/
  AI-RECORDER-BUILD-SPEC.md          # Task 13 — copied to repo root per spec's own instruction
  server/
    db.js                             # Modify — add blocks, reviewQueue, generations collections
    services/
      dataMasking.js                  # Task 1
      blockMatcher.js                 # Task 2
      claudeGenerate.js                # Task 3
    routes/
      recorder.js                     # Modify — refactor to factory, add /generate endpoints
      blocks.js                       # Task 5
      reviewQueue.js                  # Task 6
    tests/
      dataMasking.test.js
      blockMatcher.test.js
      claudeGenerate.test.js
      db.aiRecorder.test.js
      blocks.routes.test.js
      reviewQueue.routes.test.js
      recorder.generate.routes.test.js
    index.js                          # Modify — mount new routers, call recorder factory
  index.html                          # Modify — extend page-automation-builder + its <script> functions
  tests/verify-dashboard.ts           # Modify — new E2E assertions
  package.json                        # Modify — new dependency + test:unit script
  .env.example                        # Modify — document ANTHROPIC_API_KEY
```

---

### Task 1: Data masking service

**Files:**
- Create: `server/services/dataMasking.js`
- Test: `server/tests/dataMasking.test.js`

**Interfaces:**
- Produces: `maskSensitiveFields(testData: object): object`. Consumed by Task 7's recorder `/generate` endpoint before anything is persisted.

- [ ] **Step 1: Write the failing test**

`server/tests/dataMasking.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { maskSensitiveFields } = require('../services/dataMasking');

test('masks password, otp, secret, and token fields', () => {
  const masked = maskSensitiveFields({ password: 'hunter2', otpCode: '123456', apiSecret: 'x', authToken: 'y' });
  assert.equal(masked.password, '$env:PASSWORD');
  assert.equal(masked.otpCode, '$env:OTPCODE');
  assert.equal(masked.apiSecret, '$env:APISECRET');
  assert.equal(masked.authToken, '$env:AUTHTOKEN');
});

test('leaves non-sensitive fields untouched', () => {
  const masked = maskSensitiveFields({ vendorName: 'Acme Corp', email: 'user@stackbox.xyz' });
  assert.equal(masked.vendorName, 'Acme Corp');
  assert.equal(masked.email, 'user@stackbox.xyz');
});

test('handles an empty or missing testData object', () => {
  assert.deepEqual(maskSensitiveFields(undefined), {});
  assert.deepEqual(maskSensitiveFields({}), {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/dataMasking.test.js`
Expected: FAIL — `Cannot find module '../services/dataMasking'`

- [ ] **Step 3: Write the minimal implementation**

`server/services/dataMasking.js`:
```js
const SENSITIVE_PATTERNS = [/password/i, /passwd/i, /otp/i, /secret/i, /token/i];

function maskSensitiveFields(testData) {
  const masked = {};
  for (const [key, value] of Object.entries(testData || {})) {
    masked[key] = SENSITIVE_PATTERNS.some((p) => p.test(key)) ? `$env:${key.toUpperCase()}` : value;
  }
  return masked;
}

module.exports = { maskSensitiveFields };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/tests/dataMasking.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/services/dataMasking.js server/tests/dataMasking.test.js
git commit -m "feat: add sensitive test-data masking for the AI recorder"
```

---

### Task 2: Block matching service (per-step segmentation)

> **Revised 2026-08-13** — upgraded from whole-flow match-or-nothing to per-step
> segmentation, so a recording that reuses a known block for its first few
> steps and adds one genuinely new step gets credit for the reused part
> instead of being flagged "no matching block" wholesale. This is the
> mechanism behind the "steps 1–3 and 5 reused the Login block" reuse note.

**Files:**
- Create: `server/services/blockMatcher.js`
- Test: `server/tests/blockMatcher.test.js`

**Interfaces:**
- Produces: `extractSelectors(code: string): string[]`, `segmentByBlocks(code: string, blocks: Array<{id, name, code}>): Array<{selectors: string[], blockId: number|null, blockName: string|null}>`, and `blockForSelector(segments, selector: string): {blockId, blockName} | null`. Consumed by Task 7's `/generate` endpoint: `segmentByBlocks` computes which parts of a recording are already-known blocks vs. new steps, and `blockForSelector` tags each Claude-generated step with the block it belongs to (if any).

- [ ] **Step 1: Write the failing test**

`server/tests/blockMatcher.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSelectors, segmentByBlocks, blockForSelector } = require('../services/blockMatcher');

const LOGIN_CODE = `
await page.goto('http://x/login');
await page.fill('#email', 'user@stackbox.xyz');
await page.click('#submit');
`;

test('extractSelectors pulls the first argument out of each page.* call in order', () => {
  assert.deepEqual(extractSelectors(LOGIN_CODE), ["'http://x/login'", "'#email'", "'#submit'"]);
});

test('segmentByBlocks groups a known block prefix into one segment and leaves the rest as new steps', () => {
  const block = { id: 1, name: 'Login', code: LOGIN_CODE };
  const recording = LOGIN_CODE + `await page.click('.zone-override-dd');\n`;
  const segments = segmentByBlocks(recording, [block]);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].blockId, 1);
  assert.deepEqual(segments[0].selectors, ["'http://x/login'", "'#email'", "'#submit'"]);
  assert.equal(segments[1].blockId, null);
  assert.deepEqual(segments[1].selectors, ["'.zone-override-dd'"]);
});

test('segmentByBlocks returns all-new segments when no block matches', () => {
  const segments = segmentByBlocks(`await page.click('#other');`, []);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].blockId, null);
});

test('segmentByBlocks prefers the longest matching block at a given position', () => {
  const shortBlock = { id: 1, name: 'Short', code: `await page.goto('http://x/login');` };
  const longBlock = { id: 2, name: 'Login', code: LOGIN_CODE };
  const segments = segmentByBlocks(LOGIN_CODE, [shortBlock, longBlock]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].blockId, 2);
});

test('blockForSelector finds the segment containing a given selector', () => {
  const segments = [
    { selectors: ["'#email'", "'#submit'"], blockId: 1, blockName: 'Login' },
    { selectors: ["'.x'"], blockId: null, blockName: null },
  ];
  assert.deepEqual(blockForSelector(segments, "'#submit'"), { blockId: 1, blockName: 'Login' });
  assert.equal(blockForSelector(segments, "'.x'"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/blockMatcher.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

`server/services/blockMatcher.js`:
```js
const SELECTOR_CALL = /page\.(?:click|fill|check|uncheck|press|selectOption|goto)\(([^)]*)\)/g;

function extractSelectors(code) {
  const selectors = [];
  let match;
  const re = new RegExp(SELECTOR_CALL);
  while ((match = re.exec(code || ''))) {
    selectors.push(match[1].split(',')[0].trim());
  }
  return selectors;
}

// Greedily walks the recording's selector sequence left to right. At each
// position, the longest known block whose selector sequence matches the
// next N selectors wins and becomes one segment; anything that doesn't
// start a known block becomes its own one-selector "new" segment. This is
// what lets a recording reuse part of a block (e.g. a shared Login) while
// only the genuinely new steps land in review.
function segmentByBlocks(code, blocks) {
  const selectors = extractSelectors(code);
  const blockSeqs = (blocks || [])
    .map((b) => ({ block: b, seq: extractSelectors(b.code) }))
    .filter((b) => b.seq.length > 0)
    .sort((a, b) => b.seq.length - a.seq.length); // longest match wins at a given position

  const segments = [];
  let i = 0;
  while (i < selectors.length) {
    const found = blockSeqs.find(({ seq }) =>
      seq.length <= selectors.length - i && seq.every((s, j) => s === selectors[i + j])
    );
    if (found) {
      segments.push({ selectors: found.seq, blockId: found.block.id, blockName: found.block.name });
      i += found.seq.length;
    } else {
      segments.push({ selectors: [selectors[i]], blockId: null, blockName: null });
      i += 1;
    }
  }
  return segments;
}

// Looks up which segment (and therefore which block, if any) a given
// generated step's selector belongs to, so a step can be labeled "Block:
// Login" without Claude ever needing to know the block library exists.
function blockForSelector(segments, selector) {
  const seg = segments.find((s) => s.selectors.includes(selector));
  return seg && seg.blockId ? { blockId: seg.blockId, blockName: seg.blockName } : null;
}

module.exports = { extractSelectors, segmentByBlocks, blockForSelector };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/tests/blockMatcher.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/services/blockMatcher.js server/tests/blockMatcher.test.js
git commit -m "feat: detect recordings that reuse part of an existing block"
```

---

### Task 3: Claude generation service

**Files:**
- Create: `server/services/claudeGenerate.js`
- Test: `server/tests/claudeGenerate.test.js`

**Interfaces:**
- Produces: `generateFromCode(client, { rawCode, matchedBlockNames }): Promise<{ summary, steps: [{index, description, selector, confidence}], code, testData }>`. `matchedBlockNames` is an array (Task 2's `segmentByBlocks` can match more than one block in a single recording) — `client` is any object shaped like `{ messages: { create(params) } }` (matches `@anthropic-ai/sdk`'s client) — injected so tests never call the real API. Task 7's `/generate` endpoint calls this directly and separately tags each returned step with its block (if any) using `blockForSelector`, so Claude itself never needs to know the block library exists beyond this one naming hint.

- [ ] **Step 1: Write the failing test**

`server/tests/claudeGenerate.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateFromCode } = require('../services/claudeGenerate');

function fakeClient(toolInput) {
  return { messages: { create: async () => ({ content: [{ type: 'tool_use', name: 'generate_test', input: toolInput }] }) } };
}

test('maps the forced tool_use result into summary/steps/code/testData', async () => {
  const client = fakeClient({
    summary: 'Logs in and lands on the dashboard.',
    steps: [{ description: 'Fill email', selector: '#email', confidence: 'high' }],
    code: "await page.fill('#email', 'x');",
    testData: { email: 'user@stackbox.xyz' },
  });

  const result = await generateFromCode(client, { rawCode: '', matchedBlockNames: [] });

  assert.match(result.summary, /dashboard/);
  assert.deepEqual(result.steps, [{ index: 0, description: 'Fill email', selector: '#email', confidence: 'high' }]);
  assert.deepEqual(result.testData, { email: 'user@stackbox.xyz' });
});

test('throws a clear error when Claude does not return a tool_use block', async () => {
  const client = { messages: { create: async () => ({ content: [{ type: 'text', text: 'oops' }] }) } };
  await assert.rejects(() => generateFromCode(client, { rawCode: '', matchedBlockNames: [] }), /generate_test/);
});

test('includes the matched-block hint in the prompt sent to Claude', async () => {
  let capturedPrompt = '';
  const client = {
    messages: {
      create: async (params) => {
        capturedPrompt = params.messages[0].content;
        return { content: [{ type: 'tool_use', name: 'generate_test', input: { summary: 's', steps: [], code: '', testData: {} } }] };
      },
    },
  };
  await generateFromCode(client, { rawCode: 'code', matchedBlockNames: ['Login'] });
  assert.match(capturedPrompt, /Login/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/claudeGenerate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

`server/services/claudeGenerate.js`:
```js
const GENERATE_TOOL = {
  name: 'generate_test',
  description: 'Return plain-English steps with confidence flags, a plain-English summary, cleaned Playwright code, and extracted test data for a recorded browser flow.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            selector: { type: 'string' },
            confidence: { type: 'string', enum: ['low', 'high'] },
          },
          required: ['description', 'selector', 'confidence'],
        },
      },
      code: { type: 'string' },
      testData: { type: 'object', additionalProperties: { type: 'string' } },
    },
    required: ['summary', 'steps', 'code', 'testData'],
  },
};

async function generateFromCode(client, { rawCode, matchedBlockNames }) {
  const prompt = [
    'Here is a Playwright script captured by recording real browser interactions:',
    '```js\n' + rawCode + '\n```',
    matchedBlockNames && matchedBlockNames.length
      ? `These steps reuse the existing reusable block(s) "${matchedBlockNames.join('", "')}" — mention reusing them instead of inlining their steps, in the plain-English summary.`
      : '',
    'Clean up the code (prefer stable #id/data-testid/role selectors), write one numbered plain-English description per meaningful step, flag any locator that is not a stable id/data-testid/role selector as low confidence, extract any typed-in values into a testData object keyed by field name, and write a one-sentence summary of what the test does.',
  ].filter(Boolean).join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    tools: [GENERATE_TOOL],
    tool_choice: { type: 'tool', name: 'generate_test' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Claude did not return a generate_test tool call');
  }

  const result = toolUse.input;
  return {
    summary: result.summary,
    steps: result.steps.map((s, index) => ({ index, ...s })),
    code: result.code,
    testData: result.testData,
  };
}

module.exports = { generateFromCode, GENERATE_TOOL };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/tests/claudeGenerate.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/services/claudeGenerate.js server/tests/claudeGenerate.test.js
git commit -m "feat: add Claude-backed code/steps/test-data generation service"
```

---

### Task 4: `db.js` — blocks, reviewQueue, generations collections

**Files:**
- Modify: `server/db.js`
- Test: `server/tests/db.aiRecorder.test.js`

**Interfaces:**
- Produces: `getBlocks()`, `getBlocksByProject(project)`, `createBlock({project, name, code, createdBy})`; `getReviewQueue()`, `createReviewEntry({project, recordingId, reason, flaggedSteps})`, `updateReviewEntryStatus(id, status)`; `getGenerations()`, `upsertGeneration(generation)`, `getGenerationByRecordingId(recordingId)`. All follow the existing `readJson`/`writeJson` + numeric-id pattern already used by `createProject`. Consumed by Tasks 5–7's routes.

- [ ] **Step 1: Write the failing test**

`server/tests/db.aiRecorder.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function freshDb() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacktest-db-'));
  process.env.DATA_DIR = dataDir;
  delete require.cache[require.resolve('../db')];
  return require('../db');
}

test('blocks: create and list scoped to a project', () => {
  const db = freshDb();
  db.createBlock({ project: 'Inbound', name: 'Login', code: 'code-a', createdBy: 'a@stackbox.xyz' });
  db.createBlock({ project: 'Outbound', name: 'Other', code: 'code-b', createdBy: 'a@stackbox.xyz' });
  const inbound = db.getBlocksByProject('Inbound');
  assert.equal(inbound.length, 1);
  assert.equal(inbound[0].name, 'Login');
  assert.equal(inbound[0].locked, true);
});

test('review queue: create and update status', () => {
  const db = freshDb();
  const entry = db.createReviewEntry({ project: 'Inbound', recordingId: 'r1', reason: 'weak locator', flaggedSteps: [1] });
  assert.equal(entry.status, 'pending');
  const updated = db.updateReviewEntryStatus(entry.id, 'approved');
  assert.equal(updated.status, 'approved');
  assert.equal(db.updateReviewEntryStatus(9999, 'approved'), null);
});

test('generations: upsert replaces the prior generation for the same recording', () => {
  const db = freshDb();
  db.upsertGeneration({ recordingId: 'r1', summary: 'first' });
  db.upsertGeneration({ recordingId: 'r1', summary: 'second' });
  assert.equal(db.getGenerations().length, 1);
  assert.equal(db.getGenerationByRecordingId('r1').summary, 'second');
  assert.equal(db.getGenerationByRecordingId('missing'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/db.aiRecorder.test.js`
Expected: FAIL — `db.createBlock is not a function`

- [ ] **Step 3: Write the minimal implementation**

Modify `server/db.js` — add these constants right after `const PROJECTS_FILE = ...` (line 11):
```js
const BLOCKS_FILE = path.join(DATA_DIR, 'blocks.json');
const REVIEW_QUEUE_FILE = path.join(DATA_DIR, 'reviewQueue.json');
const GENERATIONS_FILE = path.join(DATA_DIR, 'generations.json');
```

Add these functions right before `module.exports` (after `createProject`):
```js
function getBlocks() {
  return readJson(BLOCKS_FILE, []);
}
function saveBlocks(blocks) {
  writeJson(BLOCKS_FILE, blocks);
}
function getBlocksByProject(project) {
  return getBlocks().filter((b) => b.project === project);
}
function createBlock({ project, name, code, createdBy }) {
  const blocks = getBlocks();
  const block = {
    id: blocks.length ? Math.max(...blocks.map((b) => b.id)) + 1 : 1,
    project, name, code, locked: true, createdBy,
    createdAt: new Date().toISOString(),
  };
  blocks.push(block);
  saveBlocks(blocks);
  return block;
}

function getReviewQueue() {
  return readJson(REVIEW_QUEUE_FILE, []);
}
function saveReviewQueue(entries) {
  writeJson(REVIEW_QUEUE_FILE, entries);
}
function createReviewEntry({ project, recordingId, reason, flaggedSteps }) {
  const entries = getReviewQueue();
  const entry = {
    id: entries.length ? Math.max(...entries.map((e) => e.id)) + 1 : 1,
    project, recordingId, reason, flaggedSteps, status: 'pending',
    createdAt: new Date().toISOString(),
  };
  entries.push(entry);
  saveReviewQueue(entries);
  return entry;
}
function updateReviewEntryStatus(id, status) {
  const entries = getReviewQueue();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.status = status;
  saveReviewQueue(entries);
  return entry;
}

function getGenerations() {
  return readJson(GENERATIONS_FILE, []);
}
function saveGenerations(generations) {
  writeJson(GENERATIONS_FILE, generations);
}
function upsertGeneration(generation) {
  const generations = getGenerations().filter((g) => g.recordingId !== generation.recordingId);
  generations.push(generation);
  saveGenerations(generations);
  return generation;
}
function getGenerationByRecordingId(recordingId) {
  return getGenerations().find((g) => g.recordingId === recordingId) || null;
}
```

Update `module.exports` at the bottom to add the new names:
```js
module.exports = {
  getUsers, saveUsers, findUserByEmail, createUser, updateUserPassword, updateUserRole, deleteUser,
  getInvites, saveInvites, findInviteByToken, createInvite, markInviteAccepted,
  getProjects, saveProjects, findProjectByName, createProject,
  getBlocks, saveBlocks, getBlocksByProject, createBlock,
  getReviewQueue, saveReviewQueue, createReviewEntry, updateReviewEntryStatus,
  getGenerations, saveGenerations, upsertGeneration, getGenerationByRecordingId,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/tests/db.aiRecorder.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full existing test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS — `db.js`'s existing exports (`getProjects`, `createUser`, etc.) are untouched, only added to.

- [ ] **Step 6: Commit**

```bash
git add server/db.js server/tests/db.aiRecorder.test.js
git commit -m "feat: add block library, review queue, and generation storage to db.js"
```

---

### Task 5: Blocks routes

**Files:**
- Create: `server/routes/blocks.js`
- Modify: `server/index.js` — mount at `/api/blocks`
- Test: `server/tests/blocks.routes.test.js`

**Interfaces:**
- Consumes: `db.getBlocksByProject`, `db.getBlocks`, `db.createBlock` (Task 4); `requireAdmin` (existing `server/auth.js`).
- Produces: `GET /api/blocks?project=` (any authed user), `POST /api/blocks` (admin only). Task 9's frontend Block library row calls the GET; Task 6's promote endpoint calls `db.createBlock` directly (not through this route).

- [ ] **Step 1: Write the failing test**

`server/tests/blocks.routes.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function freshApp(role) {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stacktest-blocks-'));
  delete require.cache[require.resolve('../db')];
  delete require.cache[require.resolve('../routes/blocks')];
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { email: 'a@stackbox.xyz', role }; next(); });
  app.use('/api/blocks', require('../routes/blocks'));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

test('admin can create a block, anyone can list it scoped to its project', async () => {
  const { server, port } = await listen(freshApp('admin'));
  try {
    const base = `http://localhost:${port}/api/blocks`;
    await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'Inbound', name: 'Login', code: 'code' }),
    });
    const res = await fetch(base + '?project=Inbound');
    const body = await res.json();
    assert.equal(body.blocks.length, 1);
    assert.equal(body.blocks[0].locked, true);
  } finally {
    server.close();
  }
});

test('non-admin cannot create a block', async () => {
  const { server, port } = await listen(freshApp('user'));
  try {
    const res = await fetch(`http://localhost:${port}/api/blocks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'Inbound', name: 'Login', code: 'code' }),
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/blocks.routes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

`server/routes/blocks.js`:
```js
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

router.get('/', (req, res) => {
  const project = (req.query.project || '').toString();
  res.json({ blocks: project ? db.getBlocksByProject(project) : db.getBlocks() });
});

router.post('/', requireAdmin, (req, res) => {
  const { project, name, code } = req.body || {};
  if (!project || !name || !code) return res.status(400).json({ error: 'project, name, and code are required.' });
  res.json({ block: db.createBlock({ project, name, code, createdBy: req.user.email }) });
});

module.exports = router;
```

Modify `server/index.js` — add near the other route requires and mounts:
```js
const blockRoutes = require('./routes/blocks');
// ...
app.use('/api/blocks', requireAuth, blockRoutes);
```
(`requireAuth` is already imported in `server/index.js` for other routes — confirm the import exists; if not, add `const { requireAuth } = require('./auth');`)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/tests/blocks.routes.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/routes/blocks.js server/index.js server/tests/blocks.routes.test.js
git commit -m "feat: add locked block library CRUD, admin-gated writes"
```

---

### Task 6: Review queue routes

**Files:**
- Create: `server/routes/reviewQueue.js`
- Modify: `server/index.js` — mount at `/api/review-queue`
- Test: `server/tests/reviewQueue.routes.test.js`

**Interfaces:**
- Consumes: `db.getReviewQueue`, `db.updateReviewEntryStatus`, `db.getGenerationByRecordingId`, `db.createBlock` (Task 4); `requireAdmin`.
- Produces: `GET /api/review-queue?project=` (any authed user), `POST /api/review-queue/:id/approve` (admin), `POST /api/review-queue/:id/promote` (admin — creates a block from the linked generation's code). Entries are created internally by Task 7's `/generate` endpoint, not through a public POST here. Task 10's frontend review-queue section calls all three.

- [ ] **Step 1: Write the failing test**

`server/tests/reviewQueue.routes.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function freshApp(role) {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stacktest-rq-'));
  delete require.cache[require.resolve('../db')];
  delete require.cache[require.resolve('../routes/reviewQueue')];
  const db = require('../db');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { email: 'a@stackbox.xyz', role }; next(); });
  app.use('/api/review-queue', require('../routes/reviewQueue'));
  return { app, db };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

test('lists entries scoped to a project', async () => {
  const { app, db } = freshApp('user');
  db.createReviewEntry({ project: 'Inbound', recordingId: 'r1', reason: 'weak locator', flaggedSteps: [1] });
  db.createReviewEntry({ project: 'Outbound', recordingId: 'r2', reason: 'weak locator', flaggedSteps: [1] });
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://localhost:${port}/api/review-queue?project=Inbound`);
    const body = await res.json();
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].recordingId, 'r1');
  } finally {
    server.close();
  }
});

test('promote requires admin and creates a locked block from the linked generation', async () => {
  const { app, db } = freshApp('admin');
  db.upsertGeneration({ recordingId: 'r1', code: 'await page.click("#x");' });
  const entry = db.createReviewEntry({ project: 'Inbound', recordingId: 'r1', reason: 'weak locator', flaggedSteps: [1] });
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://localhost:${port}/api/review-queue/${entry.id}/promote`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockName: 'Login' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.block.name, 'Login');
    assert.equal(body.block.code, 'await page.click("#x");');
    assert.equal(db.getReviewQueue().find((e) => e.id === entry.id).status, 'promoted');
  } finally {
    server.close();
  }
});

test('promote rejects non-admins', async () => {
  const { app, db } = freshApp('user');
  const entry = db.createReviewEntry({ project: 'Inbound', recordingId: 'r1', reason: 'weak locator', flaggedSteps: [1] });
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://localhost:${port}/api/review-queue/${entry.id}/promote`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockName: 'Login' }),
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/reviewQueue.routes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

`server/routes/reviewQueue.js`:
```js
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

router.get('/', (req, res) => {
  const project = (req.query.project || '').toString();
  const entries = db.getReviewQueue();
  res.json({ entries: project ? entries.filter((e) => e.project === project) : entries });
});

router.post('/:id/approve', requireAdmin, (req, res) => {
  const entry = db.updateReviewEntryStatus(Number(req.params.id), 'approved');
  if (!entry) return res.status(404).json({ error: 'No review entry with that id.' });
  res.json({ entry });
});

router.post('/:id/promote', requireAdmin, (req, res) => {
  const { blockName } = req.body || {};
  if (!blockName) return res.status(400).json({ error: 'blockName is required.' });

  const entry = db.getReviewQueue().find((e) => e.id === Number(req.params.id));
  if (!entry) return res.status(404).json({ error: 'No review entry with that id.' });

  const generation = db.getGenerationByRecordingId(entry.recordingId);
  if (!generation) return res.status(404).json({ error: 'No generated code found for this entry.' });

  const block = db.createBlock({ project: entry.project, name: blockName, code: generation.code, createdBy: req.user.email });
  db.updateReviewEntryStatus(entry.id, 'promoted');
  res.json({ block });
});

module.exports = router;
```

Modify `server/index.js`:
```js
const reviewQueueRoutes = require('./routes/reviewQueue');
// ...
app.use('/api/review-queue', requireAuth, reviewQueueRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/tests/reviewQueue.routes.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/routes/reviewQueue.js server/index.js server/tests/reviewQueue.routes.test.js
git commit -m "feat: add pending review queue with admin-gated approve/promote"
```

---

### Task 7: `recorder.js` — factory refactor + `/generate` endpoints

**Files:**
- Modify: `server/routes/recorder.js` — wrap the existing router body in a `createRecorderRouter(deps)` factory (for test-injectable Claude client) and add two new endpoints
- Modify: `server/index.js` — call the recorder module as a factory
- Test: `server/tests/recorder.generate.routes.test.js`

**Interfaces:**
- Consumes: `segmentByBlocks`, `blockForSelector` (Task 2), `generateFromCode` (Task 3), `maskSensitiveFields` (Task 1), `db.getBlocksByProject`/`upsertGeneration`/`createReviewEntry` (Task 4).
- Produces: `module.exports = function createRecorderRouter({ claudeClient } = {})` — in production, called with no args (builds a real `@anthropic-ai/sdk` client from `ANTHROPIC_API_KEY`, or `null` if unset); tests call it with a fake `claudeClient`. Two new routes: `POST /:id/generate` (codegen "new window" session) and `POST /inpage/:sessionId/generate` (in-tab bookmarklet session), both accepting `{project, flowName}` in the body and both returning `{recordingId, project, flowName, testCaseName, summary, steps, code, testData, matchedBlockNames, needsReview}`. Each `step` is additionally tagged with `blockId`/`blockName` (`null` when the step is genuinely new). Task 11's frontend calls both.
- **No existing route's behavior changes** — this is a mechanical wrap (existing `sessions`/`inpageSessions` maps and all current handlers move inside the factory function body unchanged) plus two additions.

> **Revised 2026-08-13 (pre-flight scan finding):** this task's code requires
> `@anthropic-ai/sdk`, but that dependency was originally only added in
> Task 8, which runs *after* this task — running the plan in numeric order
> would crash the whole server on module load (`Cannot find module
> '@anthropic-ai/sdk'`), not just the new tests. Fixed by moving the
> dependency install here as Step 1; Task 8 no longer installs it, only
> adds the `test:unit` script and `.env.example` docs.

- [ ] **Step 1: Add and install the `@anthropic-ai/sdk` dependency**

Modify `package.json` — add to `dependencies`:
```json
    "@anthropic-ai/sdk": "^0.32.0"
```

Run: `npm install`
Expected: `@anthropic-ai/sdk` added to `node_modules` and `package-lock.json`. Do this before writing any code in this task — the factory function below requires it at module load time.

- [ ] **Step 2: Write the failing test**

`server/tests/recorder.generate.routes.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function freshApp(claudeClient) {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stacktest-recgen-'));
  delete require.cache[require.resolve('../db')];
  delete require.cache[require.resolve('../routes/recorder')];
  const createRecorderRouter = require('../routes/recorder');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { email: 'a@stackbox.xyz', role: 'user' }; next(); });
  app.use('/api/recorder', createRecorderRouter({ claudeClient }));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

function fakeClient(toolInput) {
  return { messages: { create: async () => ({ content: [{ type: 'tool_use', name: 'generate_test', input: toolInput }] }) } };
}

test('inpage generate: masks test data and queues review when confidence is low', async () => {
  const client = fakeClient({
    summary: 'Logs in.',
    steps: [{ description: 'Fill password', selector: '#pwd', confidence: 'low' }],
    code: 'code',
    testData: { password: 'hunter2' },
  });
  const { server, port } = await listen(freshApp(client));
  try {
    const base = `http://localhost:${port}/api/recorder`;
    const started = await fetch(base + '/inpage/start', { method: 'POST' });
    const { sessionId } = await started.json();
    await fetch(base + `/inpage/${sessionId}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ type: 'click', selector: '#pwd', url: 'http://x' }] }),
    });

    const res = await fetch(base + `/inpage/${sessionId}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'Inbound', flowName: 'Operator login' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.testData.password, '$env:PASSWORD');
    assert.equal(body.needsReview, true);
    assert.equal(body.testCaseName, 'inbound_operator_login');
    assert.equal(body.steps[0].blockId, null);
  } finally {
    server.close();
  }
});

test('inpage generate: a step matching an existing block is tagged with it and skips review on its own', async () => {
  const LOGIN_CODE = `await page.click('#submit');`;
  const client = fakeClient({
    summary: 'Logs in then opens zone override.',
    steps: [
      { description: 'Click log in button', selector: "'#submit'", confidence: 'high' },
      { description: 'Click zone override dropdown', selector: "'.zone-override-dd'", confidence: 'low' },
    ],
    code: LOGIN_CODE + `\nawait page.click('.zone-override-dd');`,
    testData: {},
  });
  const { server, port } = await listen(freshApp(client));
  try {
    const base = `http://localhost:${port}/api/recorder`;
    // This test app only mounts the recorder router — seed the block
    // straight through db.js rather than via the (unmounted) /api/blocks route.
    require('../db').createBlock({ project: 'Inbound', name: 'Login', code: LOGIN_CODE, createdBy: 'a@stackbox.xyz' });

    const started = await fetch(base + '/inpage/start', { method: 'POST' });
    const { sessionId } = await started.json();
    await fetch(base + `/inpage/${sessionId}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [
        { type: 'click', selector: '#submit', url: 'http://x' },
        { type: 'click', selector: '.zone-override-dd' },
      ] }),
    });

    const res = await fetch(base + `/inpage/${sessionId}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'Inbound', flowName: 'Operator login' }),
    });
    const body = await res.json();
    assert.equal(body.steps[0].blockName, 'Login');
    assert.equal(body.steps[1].blockId, null);
    assert.equal(body.testCaseName, 'inbound_operator_login_zone_override');
  } finally {
    server.close();
  }
});

test('generate 500s with a clear error when no Claude client is configured', async () => {
  const { server, port } = await listen(freshApp(null));
  try {
    const base = `http://localhost:${port}/api/recorder`;
    const started = await fetch(base + '/inpage/start', { method: 'POST' });
    const { sessionId } = await started.json();
    const res = await fetch(base + `/inpage/${sessionId}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 500);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test server/tests/recorder.generate.routes.test.js`
Expected: FAIL — `require('../routes/recorder')` returns an Express router (not callable) since the file isn't a factory yet.

- [ ] **Step 4: Refactor `recorder.js` into a factory and add the generate endpoints**

Modify `server/routes/recorder.js` — change the top of the file (after the existing requires) from:
```js
const router = express.Router();

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
```
to:
```js
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const { generateFromCode } = require('../services/claudeGenerate');
const { maskSensitiveFields } = require('../services/dataMasking');
const { segmentByBlocks, blockForSelector } = require('../services/blockMatcher');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
```

Then wrap everything from the old `const RECORDER_PROFILE_DIR = ...` line through the old `module.exports = router;` line inside a factory — i.e. change:
```js
const RECORDER_PROFILE_DIR = path.join(__dirname, '..', 'recorder-profile');
```
to:
```js
module.exports = function createRecorderRouter(deps = {}) {
  const claudeClient = deps.claudeClient !== undefined
    ? deps.claudeClient
    : (process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null);
  const router = express.Router();

  const RECORDER_PROFILE_DIR = path.join(__dirname, '..', 'recorder-profile');
```
(the `const RECORDINGS_DIR` and `fs.mkdirSync(RECORDINGS_DIR, ...)` lines just above stay where they are, at module scope — they're static paths, no need to be inside the factory)

and change the final line of the file from:
```js
module.exports = router;
```
to:
```js
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
  function buildTestCaseName({ project, flowName, newSteps }) {
    const parts = [slugify(project), slugify(flowName)];
    if (newSteps.length) parts.push(shortLabel(newSteps[0].description));
    return parts.filter(Boolean).join('_');
  }

  async function runGenerate({ project, flowName, recordingId, rawCode }, res) {
    if (!claudeClient) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server — AI generation is unavailable.' });
    if (!rawCode) return res.status(400).json({ error: 'No recorded code to generate from.' });

    const blocks = project ? db.getBlocksByProject(project) : [];
    const segments = segmentByBlocks(rawCode, blocks);
    const matchedBlockNames = [...new Set(segments.filter((s) => s.blockId).map((s) => s.blockName))];

    const generated = await generateFromCode(claudeClient, { rawCode, matchedBlockNames });
    const testData = maskSensitiveFields(generated.testData);

    // Block attribution is looked up per generated step by selector, not by
    // index — Claude only owns the natural-language layer (description,
    // confidence, cleaned code); which steps belong to a known block is
    // computed deterministically from the same segments used for naming.
    const steps = generated.steps.map((s) => {
      const match = blockForSelector(segments, s.selector);
      return { ...s, blockId: match ? match.blockId : null, blockName: match ? match.blockName : null };
    });

    const lowConfidenceSteps = steps.filter((s) => s.confidence === 'low').map((s) => s.index);
    const newSteps = steps.filter((s) => !s.blockId);
    // Only flag "no matching block" when there are blocks to match against
    // and truly none of them matched — a project's very first recording
    // shouldn't be forced into review just because its block library is empty.
    const noBlockMatched = blocks.length > 0 && newSteps.length === steps.length;
    const needsReview = lowConfidenceSteps.length > 0 || noBlockMatched;

    const testCaseName = buildTestCaseName({ project, flowName, newSteps });

    const result = {
      recordingId, project: project || '', flowName: flowName || '', testCaseName,
      summary: generated.summary, steps, code: generated.code, testData,
      matchedBlockNames, needsReview,
    };
    db.upsertGeneration(result);

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
```

- [ ] **Step 5: Modify `server/index.js` to call the recorder module as a factory**

Change:
```js
const recorderRoutes = require('./routes/recorder');
```
to:
```js
const createRecorderRouter = require('./routes/recorder');
```
and change:
```js
app.use('/api/recorder', recorderRoutes);
```
to:
```js
app.use('/api/recorder', createRecorderRouter());
```

- [ ] **Step 6: Run the new test to verify it passes**

Run: `node --test server/tests/recorder.generate.routes.test.js`
Expected: PASS (3 tests)

- [ ] **Step 7: Run the full existing test suite to confirm the refactor didn't break the current recorder routes**

Run: `npm test`
Expected: PASS — the Playwright E2E script's existing flows (whatever it already exercises) still pass with the factory-based router mounted.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json server/routes/recorder.js server/index.js server/tests/recorder.generate.routes.test.js
git commit -m "feat: add Claude-backed /generate endpoints to both recorder modes"
```

---

### Task 8: `test:unit` script + `.env.example` wiring

> **Revised 2026-08-13 (pre-flight scan finding):** the `@anthropic-ai/sdk`
> dependency install moved to Task 7 Step 1 (this task ran after Task 7 in
> the original numbering, which meant the dependency the plan's own Task 7
> code needed wouldn't exist yet when Task 7 ran). This task now only adds
> the `test:unit` script and documents the env var.

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:** None — script/docs wiring only.

- [ ] **Step 1: Add the `test:unit` script**

Modify `package.json`:
```json
  "scripts": {
    "start": "node server/index.js",
    "dev": "node server/index.js",
    "test": "npm run test:unit && tsx tests/verify-dashboard.ts",
    "test:unit": "node --test server/tests",
    "install-browser": "playwright install chromium"
  },
```

- [ ] **Step 2: Document the new env var**

Modify `.env.example` — append:
```
# Required for the AI Recorder's Claude-backed step/summary/test-data generation.
# Get one from https://console.anthropic.com/.
ANTHROPIC_API_KEY=
```

- [ ] **Step 3: Run the full unit test suite to confirm the new script works**

Run: `npm run test:unit`
Expected: PASS — every `server/tests/*.test.js` file from Tasks 1–7 runs (Task 7 already installed `@anthropic-ai/sdk`).

- [ ] **Step 4: Commit**

```bash
git add package.json .env.example
git commit -m "chore: add test:unit script and document ANTHROPIC_API_KEY"
```

---

### Task 9: Block library row + flow name field on the AI Recorder page

> **Revised 2026-08-13** — adds a "Flow name" input alongside the block
> library row. One field, shared by both recording modes (matches the
> mockup's single toolbar), so `flowName` can be sent to `/generate`
> regardless of which mode produced the recording — see Task 11.

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `GET /api/blocks?project=` (Task 5), the existing `selectedProjectName()`.
- Produces: `let aiRecorderBlocks = []`, `async function loadAiRecorderBlocks()`, `function aiRecorderFlowName()` (reads and trims `#ai-recorder-flow-name`). Task 11's review-queue promote flow calls `loadAiRecorderBlocks` again after promoting to refresh the row; Task 11's generate wiring calls `aiRecorderFlowName()`.

- [ ] **Step 1: Add the markup**

In `index.html`, find the start of the AI Recorder page (the comment right before it):
```html
      <!-- BUILDER (AI Recorder) PAGE -->
      <div class="page" id="page-automation-builder">
        <div class="dash-header">
          <div class="home-welcome">
            <h2>🧩 AI Recorder</h2>
            <div style="color:#666;font-size:13px;margin-top:2px">Record clicks in a real browser and get back ready-to-run Playwright code.</div>
          </div>
        </div>

        <div class="seg-tabs" id="recorder-mode-tabs" style="margin-bottom:16px">
```
and insert a new row between the header and the mode tabs:
```html
      <!-- BUILDER (AI Recorder) PAGE -->
      <div class="page" id="page-automation-builder">
        <div class="dash-header">
          <div class="home-welcome">
            <h2>🧩 AI Recorder</h2>
            <div style="color:#666;font-size:13px;margin-top:2px">Record clicks in a real browser and get back ready-to-run Playwright code.</div>
          </div>
        </div>

        <div id="ai-recorder-block-lib-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"></div>

        <div class="settings-field" style="max-width:320px;margin-bottom:16px">
          <label>Flow name <span style="color:#999;font-weight:400">— used to auto-name the generated test</span></label>
          <input type="text" id="ai-recorder-flow-name" class="tc-input" placeholder="e.g. Operator login"/>
        </div>

        <div class="seg-tabs" id="recorder-mode-tabs" style="margin-bottom:16px">
```

- [ ] **Step 2: Add the JS function**

Find `function setRecorderMode(mode) {` in the `<script>` section and insert this block immediately before it:
```js
  // ── AI Recorder: block library, AI generation, review queue ──
  let aiRecorderBlocks = [];

  async function loadAiRecorderBlocks() {
    const project = selectedProjectName();
    const row = document.getElementById('ai-recorder-block-lib-row');
    if (!project) { aiRecorderBlocks = []; row.innerHTML = '<span style="font-size:12.5px;color:#999">Select a project above to see its block library.</span>'; return; }
    try {
      const { blocks } = await api('/blocks?project=' + encodeURIComponent(project));
      aiRecorderBlocks = blocks;
      row.innerHTML = blocks.length
        ? blocks.map((b) => `<span style="background:#f5f5f5;border:1px solid #ddd;border-radius:8px;padding:6px 12px;font-size:12px;color:#666">🔒 ${b.name}</span>`).join('')
        : '<span style="font-size:12.5px;color:#999">No blocks yet for this project — promote one from the review queue below once you have a recording.</span>';
    } catch (e) {
      row.textContent = 'Could not load blocks: ' + e.message;
    }
  }

  function aiRecorderFlowName() {
    return document.getElementById('ai-recorder-flow-name').value.trim();
  }

```

- [ ] **Step 3: Call it when the page is shown**

Find the `showPage` function's dispatch section (near `if (name === 'automation-tests') renderAutomationTestsPage();`) and add a sibling line:
```js
    if (name === 'automation-tests') renderAutomationTestsPage();
    if (name === 'automation-builder') loadAiRecorderBlocks();
```

- [ ] **Step 4: Manually verify**

Run: `npm start`, log in, pick a project from the existing project selector, open AI Recorder. Confirm the row shows "No blocks yet…" with no console errors. Switch projects and confirm the row updates (empty until Task 11 creates one via promote).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add block library row to the AI Recorder page"
```

---

### Task 10: AI insights card (Advanced toggle + captured steps / summary / code / test data)

> **Revised 2026-08-13** — each captured step now shows a "Block: X" tag
> when it came from a known block (from Task 7's per-step `blockId`/
> `blockName`), a reuse-note banner summarizes how many steps were reused
> vs. new, and the auto-generated `testCaseName` is displayed — mirroring
> the mockup's reuse note and "Naming applied automatically" line.

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: nothing new server-side yet (wired to real endpoints in Task 11).
- Produces: `let aiRecorderAdvanced = false`, `let aiRecorderLastGeneration = null`, `function renderAiRecorderResultPanels()`, `function aiRecorderEscapeHtml(s)`. Task 11 sets `aiRecorderLastGeneration` and calls `renderAiRecorderResultPanels()` after a successful `/generate` call.

- [ ] **Step 1: Add the markup**

Find the existing result card:
```html
        <div class="table-card" id="recorder-result-card" style="max-width:640px;display:none">
          <div class="table-card-header">
            <h3>Recorded script</h3>
          </div>
          <div style="padding:0 20px 20px">
            <textarea id="recorder-code" class="tc-input" style="width:100%;min-height:260px;font-family:monospace;font-size:12.5px;white-space:pre" readonly></textarea>
            <div style="display:flex;gap:10px;margin-top:14px">
              <button class="btn-v3-primary" onclick="saveRecordedCodeAsTestCase()">+ Add as Test Case</button>
              <button class="btn-v3-secondary" onclick="discardRecording()">Cancel</button>
            </div>
          </div>
        </div>
      </div>
      <div class="page" id="page-failed-tests">
```
and insert a new card right after it, before the closing `</div>` of the AI Recorder page:
```html
        <div class="table-card" id="recorder-result-card" style="max-width:640px;display:none">
          <div class="table-card-header">
            <h3>Recorded script</h3>
          </div>
          <div style="padding:0 20px 20px">
            <textarea id="recorder-code" class="tc-input" style="width:100%;min-height:260px;font-family:monospace;font-size:12.5px;white-space:pre" readonly></textarea>
            <div style="display:flex;gap:10px;margin-top:14px">
              <button class="btn-v3-primary" onclick="saveRecordedCodeAsTestCase()">+ Add as Test Case</button>
              <button class="btn-v3-secondary" onclick="discardRecording()">Cancel</button>
            </div>
          </div>
        </div>

        <div class="table-card" id="ai-recorder-insights-card" style="max-width:900px;display:none">
          <div class="table-card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3>AI insights</h3>
            <label style="font-size:12.5px;color:#666;display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="ai-recorder-advanced-toggle" onchange="aiRecorderAdvanced = this.checked; renderAiRecorderResultPanels();"/>
              Advanced (code) view
            </label>
          </div>
          <div id="ai-recorder-result-area" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px"></div>
        </div>

        <div class="table-card" id="ai-recorder-review-queue" style="max-width:640px;display:none"></div>
      </div>
      <div class="page" id="page-failed-tests">
```
(the `ai-recorder-review-queue` card is populated in Task 11 — it's included here so the page's closing structure only needs editing once)

- [ ] **Step 2: Add the JS functions**

Add right after `loadAiRecorderBlocks` (Task 9):
```js
  let aiRecorderAdvanced = false;
  let aiRecorderLastGeneration = null;

  function aiRecorderEscapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderAiRecorderResultPanels() {
    const card = document.getElementById('ai-recorder-insights-card');
    const area = document.getElementById('ai-recorder-result-area');
    if (!aiRecorderLastGeneration) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    const g = aiRecorderLastGeneration;

    if (aiRecorderAdvanced) {
      area.innerHTML = `
        <div><h4 style="margin:0 0 8px;font-size:13px">Code</h4>
          <pre style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:12px;margin:0;font-family:monospace;font-size:12px;white-space:pre-wrap;max-height:320px;overflow:auto">${aiRecorderEscapeHtml(g.code)}</pre>
          <button class="btn-v3-secondary" style="margin-top:8px" onclick="document.getElementById('recorder-code').value = aiRecorderLastGeneration.code;">Use this as the saved script</button>
        </div>
        <div><h4 style="margin:0 0 8px;font-size:13px">Test data</h4>
          <pre style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:12px;margin:0;font-family:monospace;font-size:12px;white-space:pre-wrap">${aiRecorderEscapeHtml(JSON.stringify(g.testData, null, 2))}</pre>
        </div>`;
    } else {
      const stepsHtml = g.steps.map((s) => `
        <div style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px">
          ${s.index + 1}. ${aiRecorderEscapeHtml(s.description)}
          <span style="font-size:11px;border-radius:999px;padding:2px 8px;margin-left:6px;
            background:${s.confidence === 'high' ? '#e8f5e9' : '#ffebee'};color:${s.confidence === 'high' ? '#2e7d32' : '#c62828'}">
            ${s.confidence === 'high' ? 'stable locator' : 'weak locator — flagged'}
          </span>
          <div style="font-size:11.5px;color:#999;margin-top:2px">
            ${s.blockName ? `Block: <code>${aiRecorderEscapeHtml(s.blockName)}</code>` : 'Not part of a block yet'}
          </div>
        </div>`).join('');
      const reusedCount = g.steps.filter((s) => s.blockName).length;
      const reuseNote = reusedCount > 0 && reusedCount < g.steps.length
        ? `<div style="margin-top:12px;padding:10px 12px;background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;font-size:11.8px;color:#1565c0">
             ↻ ${reusedCount} of ${g.steps.length} step(s) reused an existing block — only the new step(s) needed fresh code.
           </div>`
        : '';
      area.innerHTML = `
        <div><h4 style="margin:0 0 8px;font-size:13px">Captured steps</h4>${stepsHtml}</div>
        <div>
          <h4 style="margin:0 0 8px;font-size:13px">What this test does</h4>
          <div style="font-size:13px">${aiRecorderEscapeHtml(g.summary)}</div>
          ${reuseNote}
          <div style="margin-top:14px;font-size:11.8px;color:#999">
            Naming applied automatically: <code>${aiRecorderEscapeHtml(g.testCaseName)}</code>
          </div>
        </div>`;
    }
  }

```

- [ ] **Step 3: Manually verify**

Run: `npm start`, open AI Recorder. Confirm no console errors and both new cards stay hidden (`display:none`) since `aiRecorderLastGeneration` is still `null` — Task 11 wires the actual data in.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add AI insights card with advanced toggle to the AI Recorder page"
```

---

### Task 11: Wire both recording modes to `/generate`, and the pending review queue

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `POST /api/recorder/:id/generate`, `POST /api/recorder/inpage/:sessionId/generate` (Task 7); `GET /api/review-queue?project=`, `POST /api/review-queue/:id/approve`, `POST /api/review-queue/:id/promote` (Task 6).
- Produces: `async function aiRecorderRunGenerate(codegenSid, inpageSid, code)`, `async function loadAiRecorderReviewQueue()`, `async function approveAiRecorderReview(id)`, `async function promoteAiRecorderReview(id)`.

- [ ] **Step 1: Hook the window-mode recorder's `finishRecording` to call generate**

Find:
```js
  function finishRecording(result) {
    clearInterval(recorderPollTimer);
    recorderPollTimer = null;
    recorderSessionId = null;
    setRecorderUiState('idle');
    const statusEl = document.getElementById('recorder-status');
    if (result.code) {
      statusEl.style.display = 'none';
      document.getElementById('recorder-code').value = result.code;
      document.getElementById('recorder-result-card').style.display = 'block';
    } else {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `<span style="color:#c62828">${result.error || 'No code was recorded.'}</span>`;
    }
  }
```
and replace it with (capturing the session id before it's nulled, and triggering generation on success):
```js
  function finishRecording(result) {
    clearInterval(recorderPollTimer);
    recorderPollTimer = null;
    const sid = recorderSessionId;
    recorderSessionId = null;
    setRecorderUiState('idle');
    const statusEl = document.getElementById('recorder-status');
    if (result.code) {
      statusEl.style.display = 'none';
      document.getElementById('recorder-code').value = result.code;
      document.getElementById('recorder-result-card').style.display = 'block';
      aiRecorderRunGenerate(sid, null, result.code);
    } else {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `<span style="color:#c62828">${result.error || 'No code was recorded.'}</span>`;
    }
  }
```

- [ ] **Step 2: Hook the in-tab recorder's `generateInpageCode` to call generate**

Find:
```js
  async function generateInpageCode() {
    if (!inpageSessionId) return;
    const statusEl = document.getElementById('inpage-status');
    try {
      const { code, eventCount } = await api('/recorder/inpage/' + inpageSessionId + '/code');
      if (!eventCount) {
        statusEl.innerHTML = '<span style="color:#c62828">No interactions captured yet — did you click the bookmarklet on the page you want to record?</span>';
        return;
      }
      document.getElementById('recorder-code').value = code;
      document.getElementById('recorder-result-card').style.display = 'block';
      statusEl.innerHTML = `<span style="color:#2e7d32">Captured ${eventCount} interaction(s) — code is ready below.</span>`;
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#c62828">${e.message}</span>`;
    }
  }
```
and replace it with:
```js
  async function generateInpageCode() {
    if (!inpageSessionId) return;
    const statusEl = document.getElementById('inpage-status');
    try {
      const { code, eventCount } = await api('/recorder/inpage/' + inpageSessionId + '/code');
      if (!eventCount) {
        statusEl.innerHTML = '<span style="color:#c62828">No interactions captured yet — did you click the bookmarklet on the page you want to record?</span>';
        return;
      }
      document.getElementById('recorder-code').value = code;
      document.getElementById('recorder-result-card').style.display = 'block';
      statusEl.innerHTML = `<span style="color:#2e7d32">Captured ${eventCount} interaction(s) — code is ready below.</span>`;
      aiRecorderRunGenerate(null, inpageSessionId, code);
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#c62828">${e.message}</span>`;
    }
  }
```

- [ ] **Step 3: Add the generate + review-queue JS functions**

Add right after `renderAiRecorderResultPanels` (Task 10):
```js
  async function aiRecorderRunGenerate(codegenSid, inpageSid, code) {
    const statusEl = document.getElementById(codegenSid ? 'recorder-status' : 'inpage-status');
    const priorHtml = statusEl.innerHTML;
    statusEl.innerHTML = priorHtml + '<div style="color:#666;margin-top:6px">Generating steps, summary, and test data with Claude…</div>';
    try {
      const path = codegenSid ? '/recorder/' + codegenSid + '/generate' : '/recorder/inpage/' + inpageSid + '/generate';
      const generation = await api(path, { method: 'POST', body: JSON.stringify({ project: selectedProjectName() || '', flowName: aiRecorderFlowName() }) });
      aiRecorderLastGeneration = generation;
      statusEl.innerHTML = priorHtml;
      renderAiRecorderResultPanels();
      await loadAiRecorderReviewQueue();
    } catch (e) {
      statusEl.innerHTML = priorHtml + `<div style="color:#c62828;margin-top:6px">AI generation failed: ${e.message}</div>`;
    }
  }

  async function loadAiRecorderReviewQueue() {
    const project = selectedProjectName();
    const card = document.getElementById('ai-recorder-review-queue');
    if (!project) { card.style.display = 'none'; return; }

    const { entries } = await api('/review-queue?project=' + encodeURIComponent(project));
    const pending = entries.filter((e) => e.status === 'pending');
    card.style.display = 'block';
    const isAdmin = currentUser && currentUser.role === 'admin';

    if (!pending.length) {
      card.innerHTML = '<div class="table-card-header"><h3>Pending review</h3></div><div style="padding:16px;color:#999;font-size:13px">Nothing pending — every recent recording either matched a block or had high-confidence locators.</div>';
      return;
    }

    card.innerHTML = '<div class="table-card-header"><h3>Pending review</h3></div>' + pending.map((e) => `
      <div style="padding:12px 16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:13px">${aiRecorderEscapeHtml(e.recordingId)} — ${aiRecorderEscapeHtml(e.reason)}${e.flaggedSteps.length ? ' on step ' + e.flaggedSteps.map((i) => i + 1).join(', ') : ''}</span>
        ${isAdmin ? `
          <span style="display:flex;gap:8px;align-items:center">
            <button class="btn-v3-secondary" onclick="approveAiRecorderReview(${e.id})">Approve as one-off</button>
            <input type="text" id="ai-recorder-block-name-${e.id}" class="tc-input" placeholder="Block name" style="width:140px"/>
            <button class="btn-v3-primary" onclick="promoteAiRecorderReview(${e.id})">Promote to block</button>
          </span>` : ''}
      </div>`).join('');
  }

  async function approveAiRecorderReview(id) {
    try { await api('/review-queue/' + id + '/approve', { method: 'POST' }); await loadAiRecorderReviewQueue(); } catch (e) { alert(e.message); }
  }

  async function promoteAiRecorderReview(id) {
    const input = document.getElementById('ai-recorder-block-name-' + id);
    const blockName = input.value.trim();
    if (!blockName) { alert('Enter a block name first.'); return; }
    try {
      await api('/review-queue/' + id + '/promote', { method: 'POST', body: JSON.stringify({ blockName }) });
      await loadAiRecorderReviewQueue();
      await loadAiRecorderBlocks();
    } catch (e) {
      alert(e.message);
    }
  }
```

- [ ] **Step 4: Load the review queue when the page is shown**

Find the line added in Task 9's Step 3 and extend it:
```js
    if (name === 'automation-builder') loadAiRecorderBlocks();
```
to:
```js
    if (name === 'automation-builder') { loadAiRecorderBlocks(); loadAiRecorderReviewQueue(); }
```

- [ ] **Step 5: Manually verify end-to-end**

Run: `npm start` with a real `ANTHROPIC_API_KEY` in `.env`. Log in as an admin, pick a project, enter a flow name (e.g. "Operator login"), open AI Recorder. Use the in-tab bookmarklet flow (or the new-window flow) to record a small flow with a typed password field, click Generate Code / Stop Recording. Confirm:
- The "AI insights" card appears with real Captured Steps + summary, each step showing "Not part of a block yet" (no blocks exist for this project on the first pass) and the auto-generated name under the summary (e.g. `yourproject_operator_login_...`).
- Toggling "Advanced (code) view" swaps to Code + Test data, and the password shows as `$env:PASSWORD`.
- "Pending review" shows an entry (since the flow won't match any existing block yet). Type a block name, click "Promote to block", confirm the entry disappears and a new 🔒 chip appears in the block library row.
- Record the same flow again: the steps that match the newly-promoted block now show "Block: <name>" and the reuse-note banner appears ("N of M step(s) reused an existing block").
- Log in as a non-admin and confirm the pending entry still lists but with no action buttons.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: wire both recorder modes to Claude generation and the review queue"
```

---

### Task 12: Extend the existing E2E smoke test

**Files:**
- Modify: `tests/verify-dashboard.ts`

**Interfaces:** None — this is the closing verification pass using the repo's one existing testing convention (a Playwright script that bootstraps an admin, exercises the dashboard, and "fails loudly on any JS error").

- [ ] **Step 1: Read the existing test's structure**

Open `tests/verify-dashboard.ts` and find where it navigates to the AI Recorder page today (it must already do this, or at least navigate the Automation nav group, per the README's "exercises the dashboard and Admin panel" description). Locate the pattern it uses to click a nav item and assert something rendered.

- [ ] **Step 2: Add assertions for the new markup**

Following that pattern, add a check that: navigates to `#nav-automation-builder`, and asserts `#ai-recorder-block-lib-row` is present in the DOM (it always renders — either chips or the "select a project" hint — so this is a safe, live-data-independent smoke check). Do not attempt to exercise the actual record → generate flow here — it needs a live `ANTHROPIC_API_KEY` and a real browser window, which is out of scope for this smoke test.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — `test:unit` (Tasks 1–7's Node tests) and the Playwright E2E script (including the new assertion) both succeed.

- [ ] **Step 4: Commit**

```bash
git add tests/verify-dashboard.ts
git commit -m "test: verify the AI Recorder's block library row renders"
```

---

### Task 13: Spec file + README notes

**Files:**
- Create: `AI-RECORDER-BUILD-SPEC.md` (repo root, per the spec's own "How to use this file" instruction)
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Copy the spec to the repo root**

Create `AI-RECORDER-BUILD-SPEC.md` with the full spec content the user provided, plus this appended note:

```markdown

---

## Implementation note (added during planning, 2026-08-13)

This spec's original mockup file (`qa-platform-mockup.html`) never existed anywhere in the
user's filesystem — there was no separate dark-themed reference to copy CSS from. This spec
was also meant to extend the dashboard's *existing* AI Recorder page in place, not stand up
a new app or a second page.

The implementation plan at `docs/superpowers/plans/2026-08-13-ai-recorder-enhancements.md`
therefore:
- Uses this app's real, existing light/card-based visual design instead of the spec's §1
  dark tokens, which would have clashed with the rest of the dashboard.
- Reuses the existing Playwright-codegen and bookmarklet recording engines in
  `server/routes/recorder.js` instead of building a new one, adding only a Claude
  generation step on top of each.
- Reuses the existing project selector (`selectedProjectName()`) and real JWT-based admin
  roles instead of inventing new ones.
```

- [ ] **Step 2: Add a README section**

Modify `README.md` — add a new section after "## Regression testing":
```markdown
## AI Recorder — Claude-backed insights

Both AI Recorder modes (in-tab bookmarklet and Playwright-codegen "new window") now also
ask Claude to turn the recording into plain-English steps with confidence flags, a
plain-English summary, cleaned code, and masked test data. Flows that don't match an
existing block, or that have a low-confidence locator, land in a pending review queue —
an admin can approve them as one-off tests or promote them into a locked, reusable block.
See [AI-RECORDER-BUILD-SPEC.md](AI-RECORDER-BUILD-SPEC.md) for the full design and
`docs/superpowers/plans/2026-08-13-ai-recorder-enhancements.md` for the implementation plan.

Requires `ANTHROPIC_API_KEY` in `.env` — get one from
[console.anthropic.com](https://console.anthropic.com/).
```

- [ ] **Step 3: Commit**

```bash
git add AI-RECORDER-BUILD-SPEC.md README.md
git commit -m "docs: add AI Recorder build spec and README section"
```

---

## Self-Review Notes

**Spec coverage:**
- §1 visual tokens → deliberately **not** applied verbatim (see Architecture); existing app look reused instead, called out in Task 13's note.
- §2 screen structure → the existing page already has the header/toolbar/result-card pieces; Task 9 adds the block library row, Task 10 adds the toggle + steps/summary/code/test-data panels, Task 11 adds the review queue.
- §3.1 Projects → reused `selectedProjectName()`, no new project model; scoping enforced in Task 5 (`getBlocksByProject`), Task 6 (`entries.filter(e => e.project === project)`), Task 7 (`db.getBlocksByProject(project)` before matching).
- §3.2 recording engine → reused verbatim from `server/routes/recorder.js` (both modes), not rebuilt.
- §3.3 Claude generation, forced structured JSON, confidence flags, block-match suggestion → Task 3 (service) + Task 7 (wiring, block-match hint).
- §3.4 test data extraction + masking → Task 1, wired into persistence in Task 7.
- §3.5 block library, locked, admin-only create/promote, generated-script reuse → Task 5 (locked + admin-gated create), Task 2 (match detection), Task 6 (promote).
- §3.6 pending review queue, reason + flagged steps, reviewer approve/promote → Task 6 (backend), Task 11 (UI).
- §3.7 non-coder toggle, both panel sets generated regardless of toggle → Task 10 (pure UI state over the already-fetched `aiRecorderLastGeneration`).
- §4 stack choices → existing stack reused as-is (no SQLite/Postgres, no new frontend framework).
- §5 build order → followed: Tasks 1–4 (foundations) → 5–6 (CRUD APIs) → 7 (capture wiring, reusing the existing engines + Claude wiring together since both modes already produce `code` synchronously) → 9–10 (render real output) → 11 (block-matching + promotion, completed last since it depends on real generations existing).

**Placeholder scan:** no TBD/TODO markers; every step has literal code. The two deliberate design calls — reusing the existing recording engines instead of building new ones, and not applying the spec's dark visual tokens — are stated explicitly in Architecture and Task 13's spec note, not left implicit.

**Type/name consistency:** `project`, `recordingId`, `matchedBlockNames`, `needsReview`, `flaggedSteps`, `testData`, `locked`, `flowName`, `testCaseName` are introduced once (Tasks 1–4, 7) and reused with identical names through every later task's code (routes, frontend functions). `db.js` function names (`getBlocksByProject`, `createReviewEntry`, `upsertGeneration`, etc.) are defined once in Task 4 and never renamed in later tasks. Frontend function names (`loadAiRecorderBlocks`, `aiRecorderFlowName`, `aiRecorderRunGenerate`, `loadAiRecorderReviewQueue`, `renderAiRecorderResultPanels`) are each defined once (Tasks 9–11) and called by name, unchanged, from every other task that needs them.

---

## Revision Log — 2026-08-13 (post-mockup review)

A dark-themed "QualityDock" concept mockup was shared after this plan already existed. Comparing it against the plan surfaced three decisions, resolved with the user before implementation:

1. **Block matching upgraded from whole-flow to per-step segmentation** (Task 2, 7, 10). The mockup's core reuse story — "steps 1–3 and 5 reused the Login block, step 4 is new" — needs partial-match credit within one recording, not match-or-nothing against an entire block. `blockMatcher.js` now exports `segmentByBlocks`/`blockForSelector` instead of `findMatchingBlock`; `/generate` tags each step with its block (if any) and only queues review for the genuinely unmatched/low-confidence steps.
2. **Added a "Flow name" field + automatic test-case naming** (Task 9, 7, 10). One shared input above the mode tabs feeds `flowName` into `/generate`; the server derives `testCaseName` deterministically (`slugify(project)_slugify(flowName)_shortLabel(firstNewStep)`), mirroring the mockup's `inbound_operator_login_zone_override`.
3. **Project metadata (Module / Target environment / Platform) — declined.** Kept projects as bare names, per the plan's original YAGNI call: nothing reads those fields yet besides display, and the per-recording URL/target already covers the functional need.
4. **"+ Request new block" — out of scope.** No backend/frontend for this in the mockup's block library row; can be a follow-up (e.g. a Slack ping or a ClickUp ticket) once there's a real workflow for who triages it.
