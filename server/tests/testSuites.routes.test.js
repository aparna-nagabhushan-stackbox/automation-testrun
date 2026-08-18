const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function freshApp() {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stacktest-suites-'));
  delete require.cache[require.resolve('../db')];
  delete require.cache[require.resolve('../routes/testSuites')];
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { email: 'a@stackbox.xyz', role: 'user' }; next(); });
  app.use('/api/test-suites', require('../routes/testSuites'));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

async function json(res) {
  return res.json();
}

test('create suite, add test cases with execution types, see coverage in list', async () => {
  const { server, port } = await listen(freshApp());
  try {
    const base = `http://localhost:${port}/api/test-suites`;
    const create = await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Login Regression', module: 'WMS-AUTH', environment: 'UAT-01' }),
    });
    const { suite } = await json(create);
    assert.equal(suite.name, 'Login Regression');
    assert.equal(suite.testCaseCount, 0);

    await fetch(`${base}/${suite.id}/test-cases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCases: [
        { testCaseId: 'TC-1', executionType: 'manual' },
        { testCaseId: 'TC-2', executionType: 'automated' },
        { testCaseId: 'TC-3', executionType: 'both' },
      ] }),
    });

    const list = await fetch(base);
    const { suites } = await json(list);
    assert.equal(suites.length, 1);
    assert.equal(suites[0].testCaseCount, 3);
    assert.deepEqual(suites[0].coverage, { manual: 1, automated: 1, both: 1 });
  } finally {
    server.close();
  }
});

test('rename via PATCH, and validation rejects an empty name', async () => {
  const { server, port } = await listen(freshApp());
  try {
    const base = `http://localhost:${port}/api/test-suites`;
    const { suite } = await json(await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Original' }),
    }));

    const renamed = await fetch(`${base}/${suite.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });
    assert.equal((await json(renamed)).suite.name, 'Renamed');

    const rejected = await fetch(`${base}/${suite.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    assert.equal(rejected.status, 400);
  } finally {
    server.close();
  }
});

test('running a suite creates a run, results can be posted, and completing computes status', async () => {
  const { server, port } = await listen(freshApp());
  try {
    const base = `http://localhost:${port}/api/test-suites`;
    const { suite } = await json(await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Smoke' }),
    }));
    await fetch(`${base}/${suite.id}/test-cases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCases: [
        { testCaseId: 'TC-1', executionType: 'manual' },
        { testCaseId: 'TC-2', executionType: 'manual' },
      ] }),
    });

    const runRes = await fetch(`${base}/${suite.id}/runs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runType: 'manual' }),
    });
    const { run } = await json(runRes);
    assert.equal(run.status, 'running');
    assert.equal(run.results.length, 2);
    assert.ok(run.results.every((r) => r.status === 'not_run'));

    await fetch(`${base}/${suite.id}/runs/${run.id}/results`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: [
        { testCaseId: 'TC-1', status: 'pass' },
        { testCaseId: 'TC-2', status: 'fail' },
      ] }),
    });

    const completed = await json(await fetch(`${base}/${suite.id}/runs/${run.id}/complete`, { method: 'POST' }));
    assert.equal(completed.run.status, 'partial');
    assert.ok(completed.run.completedAt);

    const list = await json(await fetch(base));
    assert.equal(list.suites[0].latestRun.status, 'partial');
  } finally {
    server.close();
  }
});

test('running a suite for a lane with no tagged test cases is rejected', async () => {
  const { server, port } = await listen(freshApp());
  try {
    const base = `http://localhost:${port}/api/test-suites`;
    const { suite } = await json(await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Manual only' }),
    }));
    await fetch(`${base}/${suite.id}/test-cases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCases: [{ testCaseId: 'TC-1', executionType: 'manual' }] }),
    });

    const res = await fetch(`${base}/${suite.id}/runs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runType: 'automated' }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('deleting a suite cascades to its runs', async () => {
  const { server, port } = await listen(freshApp());
  try {
    const base = `http://localhost:${port}/api/test-suites`;
    const { suite } = await json(await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Temp' }),
    }));
    await fetch(`${base}/${suite.id}/test-cases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCases: [{ testCaseId: 'TC-1', executionType: 'manual' }] }),
    });
    const { run } = await json(await fetch(`${base}/${suite.id}/runs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runType: 'manual' }),
    }));

    await fetch(`${base}/${suite.id}`, { method: 'DELETE' });

    const runDetail = await fetch(`${base}/${suite.id}/runs/${run.id}`);
    assert.equal(runDetail.status, 404);
  } finally {
    server.close();
  }
});
