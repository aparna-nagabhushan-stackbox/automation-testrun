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
