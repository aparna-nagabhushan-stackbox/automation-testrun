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

test('promote requires admin and creates a locked block from the linked generation raw code', async () => {
  const { app, db } = freshApp('admin');
  // Block matching runs over raw recorder output, so the block has to store the
  // raw recording — not Claude's role-based rewrite, which would never match.
  db.upsertGeneration({
    recordingId: 'r1',
    code: "await page.getByTestId('x').click();",
    rawCode: 'await page.click("#x");',
  });
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

test('promote falls back to the cleaned code for a generation recorded before rawCode existed', async () => {
  const { app, db } = freshApp('admin');
  db.upsertGeneration({ recordingId: 'r1', code: 'await page.click("#legacy");' });
  const entry = db.createReviewEntry({ project: 'Inbound', recordingId: 'r1', reason: 'weak locator', flaggedSteps: [1] });
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://localhost:${port}/api/review-queue/${entry.id}/promote`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockName: 'Login' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.block.code, 'await page.click("#legacy");');
  } finally {
    server.close();
  }
});

test('promote trims the block name and rejects an over-long or blank one', async () => {
  const { app, db } = freshApp('admin');
  db.upsertGeneration({ recordingId: 'r1', code: 'x', rawCode: 'x' });
  const entry = db.createReviewEntry({ project: 'Inbound', recordingId: 'r1', reason: 'weak locator', flaggedSteps: [1] });
  const { server, port } = await listen(app);
  const promote = (blockName) => fetch(`http://localhost:${port}/api/review-queue/${entry.id}/promote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockName }),
  });
  try {
    assert.equal((await promote('   ')).status, 400);
    assert.equal((await promote('L'.repeat(61))).status, 400);
    const ok = await promote('  Login flow  ');
    assert.equal((await ok.json()).block.name, 'Login flow');
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
