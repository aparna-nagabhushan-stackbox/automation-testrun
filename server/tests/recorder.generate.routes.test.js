const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

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

function freshApp(claudeClient) {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stacktest-recgen-'));
  delete require.cache[require.resolve('../db')];
  delete require.cache[require.resolve('../routes/recorder')];
  const createRecorderRouter = require('../routes/recorder');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
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
    const started = await fetch(base + '/inpage/start', { method: 'POST', headers: AUTH_HEADERS });
    const { sessionId } = await started.json();
    await fetch(base + `/inpage/${sessionId}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ type: 'click', selector: '#pwd', url: 'http://x' }] }),
    });

    const res = await fetch(base + `/inpage/${sessionId}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
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

    const started = await fetch(base + '/inpage/start', { method: 'POST', headers: AUTH_HEADERS });
    const { sessionId } = await started.json();
    await fetch(base + `/inpage/${sessionId}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [
        { type: 'click', selector: '#submit', url: 'http://x' },
        { type: 'click', selector: '.zone-override-dd' },
      ] }),
    });

    const res = await fetch(base + `/inpage/${sessionId}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
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

test('inpage generate: a project with existing blocks but zero matches gets no naming suffix (distinct from an empty-library project reaching the same no-suffix outcome)', async () => {
  const LOGIN_CODE = `await page.click('#submit');`;
  const client = fakeClient({
    summary: 'Fills a totally unrelated field.',
    steps: [
      { description: 'Fill unrelated field', selector: "'#other-field'", confidence: 'high' },
    ],
    code: `await page.fill('#other-field', 'x');`,
    testData: {},
  });
  const { server, port } = await listen(freshApp(client));
  try {
    const base = `http://localhost:${port}/api/recorder`;
    // Project already has a registered block ("Login"), but this recording's
    // one selector never appears in it — segmentByBlocks yields a single
    // all-new segment, so newSteps.length === steps.length (100% new)
    // even though blocks.length > 0. This is the `noBlockMatched` path
    // (steps.length matches but via "everything's new", not "library is
    // empty") — the naming suffix must stay off here too, same as test 1,
    // but for a different underlying reason (steps.length === newSteps.length
    // here vs. blocks.length === 0 in test 1).
    require('../db').createBlock({ project: 'Inbound', name: 'Login', code: LOGIN_CODE, createdBy: 'a@stackbox.xyz' });

    const started = await fetch(base + '/inpage/start', { method: 'POST', headers: AUTH_HEADERS });
    const { sessionId } = await started.json();
    await fetch(base + `/inpage/${sessionId}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [
        { type: 'fill', selector: '#other-field', value: 'x', url: 'http://x' },
      ] }),
    });

    const res = await fetch(base + `/inpage/${sessionId}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
      body: JSON.stringify({ project: 'Inbound', flowName: 'Operator login' }),
    });
    const body = await res.json();
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
    const res = await fetch(base + `/inpage/${sessionId}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS }, body: '{}' });
    assert.equal(res.status, 500);
  } finally {
    server.close();
  }
});
