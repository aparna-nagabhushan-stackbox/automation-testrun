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

test('block names are trimmed and length-capped', async () => {
  const { server, port } = await listen(freshApp('admin'));
  const post = (name) => fetch(`http://localhost:${port}/api/blocks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'Inbound', name, code: 'code' }),
  });
  try {
    assert.equal((await post('   ')).status, 400);
    assert.equal((await post('L'.repeat(61))).status, 400);
    const ok = await post('  Login flow  ');
    assert.equal((await ok.json()).block.name, 'Login flow');
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
