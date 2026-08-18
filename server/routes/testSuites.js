const express = require('express');
const db = require('../db');
const { triggerAutomationRun } = require('../services/automationRun');

const router = express.Router();

const EXECUTION_TYPES = ['manual', 'automated', 'both'];
const RUN_TYPES = ['manual', 'automated', 'both'];
const RESULT_STATUSES = ['pass', 'fail', 'blocked', 'skipped', 'not_run'];

function suiteIdParam(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : null;
}

// Coverage split + latest-run status, computed on read rather than stored —
// keeps db.js a plain datastore and this the one place that knows what a
// suite "looks like" to the UI.
function runResultCounts(run) {
  const relevant = run.results.filter((r) => r.status !== 'skipped');
  return { passed: relevant.filter((r) => r.status === 'pass').length, total: relevant.length };
}

function suiteSummary(suite) {
  const coverage = { manual: 0, automated: 0, both: 0 };
  suite.testCases.forEach((tc) => { coverage[tc.executionType] = (coverage[tc.executionType] || 0) + 1; });
  const runs = db.getRunsBySuite(suite.id);
  const latestRun = runs[0] || null;
  return {
    id: suite.id, name: suite.name, description: suite.description,
    module: suite.module, environment: suite.environment,
    createdBy: suite.createdBy, createdAt: suite.createdAt, updatedAt: suite.updatedAt,
    testCaseCount: suite.testCases.length, coverage,
    latestRun: latestRun ? {
      id: latestRun.id, runType: latestRun.runType, status: latestRun.status,
      startedAt: latestRun.startedAt, completedAt: latestRun.completedAt,
      ...runResultCounts(latestRun),
    } : null,
  };
}

router.get('/', (req, res) => {
  const { module: moduleFilter, environment } = req.query;
  let suites = db.getTestSuites();
  if (moduleFilter) suites = suites.filter((s) => s.module === moduleFilter);
  if (environment) suites = suites.filter((s) => s.environment === environment);
  res.json({ suites: suites.map(suiteSummary) });
});

router.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Suite name is required.' });
  if (name.length > 200) return res.status(400).json({ error: 'Suite name must be 200 characters or fewer.' });
  const suite = db.createTestSuite({
    name,
    description: (req.body?.description || '').toString(),
    module: (req.body?.module || '').toString(),
    environment: (req.body?.environment || '').toString(),
    createdBy: req.user.email,
  });
  res.json({ suite: suiteSummary(suite) });
});

router.get('/:id', (req, res) => {
  const id = suiteIdParam(req);
  const suite = id !== null && db.findTestSuiteById(id);
  if (!suite) return res.status(404).json({ error: 'No such test suite.' });
  res.json({ suite: { ...suiteSummary(suite), testCases: suite.testCases } });
});

router.patch('/:id', (req, res) => {
  const id = suiteIdParam(req);
  if (id === null || !db.findTestSuiteById(id)) return res.status(404).json({ error: 'No such test suite.' });
  const updates = {};
  ['name', 'description', 'module', 'environment'].forEach((key) => {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key].toString();
  });
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) return res.status(400).json({ error: 'Suite name is required.' });
    if (trimmed.length > 200) return res.status(400).json({ error: 'Suite name must be 200 characters or fewer.' });
    updates.name = trimmed;
  }
  const suite = db.updateTestSuite(id, updates);
  res.json({ suite: suiteSummary(suite) });
});

router.delete('/:id', (req, res) => {
  const id = suiteIdParam(req);
  if (id === null || !db.deleteTestSuite(id)) return res.status(404).json({ error: 'No such test suite.' });
  res.json({ ok: true });
});

router.post('/:id/test-cases', (req, res) => {
  const id = suiteIdParam(req);
  if (id === null || !db.findTestSuiteById(id)) return res.status(404).json({ error: 'No such test suite.' });
  const items = Array.isArray(req.body?.testCases) ? req.body.testCases : [];
  if (!items.length) return res.status(400).json({ error: 'testCases must be a non-empty array.' });
  for (const item of items) {
    if (!item.testCaseId) return res.status(400).json({ error: 'Each item needs a testCaseId.' });
    if (item.executionType && !EXECUTION_TYPES.includes(item.executionType)) {
      return res.status(400).json({ error: `executionType must be one of: ${EXECUTION_TYPES.join(', ')}` });
    }
  }
  const suite = db.addTestCasesToSuite(id, items);
  res.json({ suite: { ...suiteSummary(suite), testCases: suite.testCases } });
});

router.patch('/:id/test-cases/:testCaseId', (req, res) => {
  const id = suiteIdParam(req);
  const { executionType } = req.body || {};
  if (!EXECUTION_TYPES.includes(executionType)) {
    return res.status(400).json({ error: `executionType must be one of: ${EXECUTION_TYPES.join(', ')}` });
  }
  const suite = id !== null && db.updateSuiteTestCaseType(id, req.params.testCaseId, executionType);
  if (!suite) return res.status(404).json({ error: 'No such test suite or test case in it.' });
  res.json({ suite: { ...suiteSummary(suite), testCases: suite.testCases } });
});

router.delete('/:id/test-cases/:testCaseId', (req, res) => {
  const id = suiteIdParam(req);
  const suite = id !== null && db.removeTestCaseFromSuite(id, req.params.testCaseId);
  if (!suite) return res.status(404).json({ error: 'No such test suite.' });
  res.json({ suite: { ...suiteSummary(suite), testCases: suite.testCases } });
});

router.get('/:id/runs', (req, res) => {
  const id = suiteIdParam(req);
  if (id === null || !db.findTestSuiteById(id)) return res.status(404).json({ error: 'No such test suite.' });
  const runs = db.getRunsBySuite(id).map((r) => ({
    id: r.id, runType: r.runType, status: r.status, environment: r.environment,
    triggeredBy: r.triggeredBy, startedAt: r.startedAt, completedAt: r.completedAt,
    ...runResultCounts(r),
  }));
  res.json({ runs });
});

router.post('/:id/runs', (req, res) => {
  const id = suiteIdParam(req);
  const suite = id !== null && db.findTestSuiteById(id);
  if (!suite) return res.status(404).json({ error: 'No such test suite.' });
  const { runType, environment } = req.body || {};
  if (!RUN_TYPES.includes(runType)) return res.status(400).json({ error: `runType must be one of: ${RUN_TYPES.join(', ')}` });
  const lane = (tc) => runType === 'both' ? true : tc.executionType === runType || tc.executionType === 'both';
  const testCases = suite.testCases.filter(lane);
  if (!testCases.length) return res.status(400).json({ error: `No test cases in this suite are tagged for a ${runType} run.` });
  const run = db.createSuiteRun({
    suiteId: id, runType, environment: environment || suite.environment,
    triggeredBy: req.user.email, testCases,
  });
  if (runType === 'automated' || runType === 'both') triggerAutomationRun(id, run.id);
  res.json({ run });
});

router.get('/:id/runs/:runId', (req, res) => {
  const id = suiteIdParam(req);
  const runId = Number(req.params.runId);
  const run = db.findSuiteRunById(runId);
  if (id === null || !run || run.suiteId !== id) return res.status(404).json({ error: 'No such run.' });
  res.json({ run });
});

router.post('/:id/runs/:runId/results', (req, res) => {
  const id = suiteIdParam(req);
  const runId = Number(req.params.runId);
  const existing = db.findSuiteRunById(runId);
  if (id === null || !existing || existing.suiteId !== id) return res.status(404).json({ error: 'No such run.' });
  const results = Array.isArray(req.body?.results) ? req.body.results : [];
  for (const r of results) {
    if (!RESULT_STATUSES.includes(r.status)) {
      return res.status(400).json({ error: `status must be one of: ${RESULT_STATUSES.join(', ')}` });
    }
  }
  const run = db.upsertSuiteRunResults(runId, results, req.user.email);
  res.json({ run });
});

router.post('/:id/runs/:runId/complete', (req, res) => {
  const id = suiteIdParam(req);
  const runId = Number(req.params.runId);
  const existing = db.findSuiteRunById(runId);
  if (id === null || !existing || existing.suiteId !== id) return res.status(404).json({ error: 'No such run.' });
  const run = db.completeSuiteRun(runId);
  res.json({ run });
});

module.exports = router;
