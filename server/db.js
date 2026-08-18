// Tiny JSON-file datastore. No native dependencies, so it deploys anywhere
// without a build step. Fine for this app's scale (a small internal team) —
// if this ever needs to survive redeploys on a host with an ephemeral
// filesystem, point DATA_DIR at a mounted persistent disk (see README).
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const INVITES_FILE = path.join(DATA_DIR, 'invites.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const BLOCKS_FILE = path.join(DATA_DIR, 'blocks.json');
const REVIEW_QUEUE_FILE = path.join(DATA_DIR, 'reviewQueue.json');
const GENERATIONS_FILE = path.join(DATA_DIR, 'generations.json');
const TEST_SUITES_FILE = path.join(DATA_DIR, 'testSuites.json');
const SUITE_RUNS_FILE = path.join(DATA_DIR, 'suiteRuns.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  // write-to-temp-then-rename avoids leaving a half-written file if the
  // process dies mid-write
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function getUsers() {
  return readJson(USERS_FILE, []);
}
function saveUsers(users) {
  writeJson(USERS_FILE, users);
}
function findUserByEmail(email) {
  return getUsers().find(u => u.email === email.toLowerCase()) || null;
}
function createUser({ email, passwordHash, role }) {
  const users = getUsers();
  const user = {
    id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
    email: email.toLowerCase(),
    passwordHash,
    role: role || 'user',
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}
function updateUserPassword(email, passwordHash) {
  const users = getUsers();
  const user = users.find(u => u.email === email.toLowerCase());
  if (!user) return null;
  user.passwordHash = passwordHash;
  saveUsers(users);
  return user;
}
function updateUserRole(email, role) {
  const users = getUsers();
  const user = users.find(u => u.email === email.toLowerCase());
  if (!user) return null;
  user.role = role;
  saveUsers(users);
  return user;
}
function deleteUser(email) {
  const users = getUsers();
  const idx = users.findIndex(u => u.email === email.toLowerCase());
  if (idx === -1) return false;
  users.splice(idx, 1);
  saveUsers(users);
  return true;
}

function getInvites() {
  return readJson(INVITES_FILE, []);
}
function saveInvites(invites) {
  writeJson(INVITES_FILE, invites);
}
function findInviteByToken(token) {
  return getInvites().find(i => i.token === token) || null;
}
function createInvite({ email, token, type, invitedBy }) {
  const invites = getInvites();
  const invite = {
    id: invites.length ? Math.max(...invites.map(i => i.id)) + 1 : 1,
    email: email.toLowerCase(),
    token,
    type, // 'invite' | 'reset'
    invitedBy,
    createdAt: new Date().toISOString(),
    acceptedAt: null,
  };
  invites.push(invite);
  saveInvites(invites);
  return invite;
}
function markInviteAccepted(token) {
  const invites = getInvites();
  const invite = invites.find(i => i.token === token);
  if (!invite) return null;
  invite.acceptedAt = new Date().toISOString();
  saveInvites(invites);
  return invite;
}

function getProjects() {
  return readJson(PROJECTS_FILE, []);
}
function saveProjects(projects) {
  writeJson(PROJECTS_FILE, projects);
}
function findProjectByName(name) {
  return getProjects().find(p => p.name.toLowerCase() === name.toLowerCase()) || null;
}
function createProject({ name, createdBy }) {
  const projects = getProjects();
  const project = {
    id: projects.length ? Math.max(...projects.map(p => p.id)) + 1 : 1,
    name: name.trim(),
    createdBy,
    createdAt: new Date().toISOString(),
  };
  projects.push(project);
  saveProjects(projects);
  return project;
}

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
// Drops any still-pending entries for a recording, so re-generating that
// recording supersedes its earlier review entry instead of stacking a second
// one next to it. Entries already approved/promoted are history and stay put.
function removePendingReviewEntries(recordingId) {
  const entries = getReviewQueue();
  const kept = entries.filter((e) => !(e.recordingId === recordingId && e.status === 'pending'));
  if (kept.length === entries.length) return 0;
  saveReviewQueue(kept);
  return entries.length - kept.length;
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

function getTestSuites() {
  return readJson(TEST_SUITES_FILE, []);
}
function saveTestSuites(suites) {
  writeJson(TEST_SUITES_FILE, suites);
}
function findTestSuiteById(id) {
  return getTestSuites().find((s) => s.id === id) || null;
}
function createTestSuite({ name, description, module: mod, environment, createdBy }) {
  const suites = getTestSuites();
  const now = new Date().toISOString();
  const suite = {
    id: suites.length ? Math.max(...suites.map((s) => s.id)) + 1 : 1,
    name, description: description || '', module: mod || '', environment: environment || '',
    createdBy, createdAt: now, updatedAt: now, testCases: [],
  };
  suites.push(suite);
  saveTestSuites(suites);
  return suite;
}
function updateTestSuite(id, updates) {
  const suites = getTestSuites();
  const suite = suites.find((s) => s.id === id);
  if (!suite) return null;
  ['name', 'description', 'module', 'environment'].forEach((key) => {
    if (updates[key] !== undefined) suite[key] = updates[key];
  });
  suite.updatedAt = new Date().toISOString();
  saveTestSuites(suites);
  return suite;
}
function deleteTestSuite(id) {
  const suites = getTestSuites();
  const idx = suites.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  suites.splice(idx, 1);
  saveTestSuites(suites);
  // Cascade: a suite's runs are meaningless once the suite is gone.
  saveSuiteRuns(getSuiteRuns().filter((r) => r.suiteId !== id));
  return true;
}
// items: [{testCaseId, executionType}] — upserts by testCaseId so re-adding
// an already-present test case just updates its execution type.
function addTestCasesToSuite(suiteId, items) {
  const suites = getTestSuites();
  const suite = suites.find((s) => s.id === suiteId);
  if (!suite) return null;
  items.forEach(({ testCaseId, executionType }) => {
    const existing = suite.testCases.find((tc) => tc.testCaseId === testCaseId);
    if (existing) existing.executionType = executionType || existing.executionType;
    else suite.testCases.push({ testCaseId, executionType: executionType || 'manual' });
  });
  suite.updatedAt = new Date().toISOString();
  saveTestSuites(suites);
  return suite;
}
function updateSuiteTestCaseType(suiteId, testCaseId, executionType) {
  const suites = getTestSuites();
  const suite = suites.find((s) => s.id === suiteId);
  const tc = suite && suite.testCases.find((t) => t.testCaseId === testCaseId);
  if (!tc) return null;
  tc.executionType = executionType;
  suite.updatedAt = new Date().toISOString();
  saveTestSuites(suites);
  return suite;
}
function removeTestCaseFromSuite(suiteId, testCaseId) {
  const suites = getTestSuites();
  const suite = suites.find((s) => s.id === suiteId);
  if (!suite) return null;
  suite.testCases = suite.testCases.filter((t) => t.testCaseId !== testCaseId);
  suite.updatedAt = new Date().toISOString();
  saveTestSuites(suites);
  return suite;
}

function getSuiteRuns() {
  return readJson(SUITE_RUNS_FILE, []);
}
function saveSuiteRuns(runs) {
  writeJson(SUITE_RUNS_FILE, runs);
}
function getRunsBySuite(suiteId) {
  return getSuiteRuns()
    .filter((r) => r.suiteId === suiteId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function findSuiteRunById(id) {
  return getSuiteRuns().find((r) => r.id === id) || null;
}
// testCases: the suite's [{testCaseId, executionType}] at run time — each
// gets a 'not_run' result row up front so the run always reflects every
// test case it covers, even ones no one has marked yet.
function createSuiteRun({ suiteId, runType, environment, triggeredBy, testCases }) {
  const runs = getSuiteRuns();
  const now = new Date().toISOString();
  const run = {
    id: runs.length ? Math.max(...runs.map((r) => r.id)) + 1 : 1,
    suiteId, runType, status: 'running', environment: environment || '',
    triggeredBy, startedAt: now, completedAt: null, createdAt: now,
    results: testCases.map((tc) => ({
      testCaseId: tc.testCaseId, executionType: tc.executionType,
      status: 'not_run', executedBy: null, executedAt: null,
    })),
  };
  runs.push(run);
  saveSuiteRuns(runs);
  return run;
}
// results: [{testCaseId, status}] — the single write path for both the
// manual checklist UI and (later) an automation-pipeline callback.
function upsertSuiteRunResults(runId, results, executedBy) {
  const runs = getSuiteRuns();
  const run = runs.find((r) => r.id === runId);
  if (!run) return null;
  const now = new Date().toISOString();
  results.forEach(({ testCaseId, status }) => {
    const existing = run.results.find((r) => r.testCaseId === testCaseId);
    if (!existing) return;
    existing.status = status;
    existing.executedBy = executedBy || existing.executedBy;
    existing.executedAt = now;
  });
  saveSuiteRuns(runs);
  return run;
}
function completeSuiteRun(runId) {
  const runs = getSuiteRuns();
  const run = runs.find((r) => r.id === runId);
  if (!run) return null;
  const relevant = run.results.filter((r) => r.status !== 'skipped');
  const total = relevant.length;
  const failed = relevant.filter((r) => r.status === 'fail').length;
  const passed = relevant.filter((r) => r.status === 'pass').length;
  const blocked = relevant.filter((r) => r.status === 'blocked').length;
  if (total === 0) run.status = 'blocked';
  else if (failed === total) run.status = 'failed';
  else if (passed === total) run.status = 'passed';
  else if (blocked === total) run.status = 'blocked';
  else run.status = 'partial';
  run.completedAt = new Date().toISOString();
  saveSuiteRuns(runs);
  return run;
}

module.exports = {
  getUsers, saveUsers, findUserByEmail, createUser, updateUserPassword, updateUserRole, deleteUser,
  getInvites, saveInvites, findInviteByToken, createInvite, markInviteAccepted,
  getProjects, saveProjects, findProjectByName, createProject,
  getBlocks, saveBlocks, getBlocksByProject, createBlock,
  getReviewQueue, saveReviewQueue, createReviewEntry, removePendingReviewEntries, updateReviewEntryStatus,
  getGenerations, saveGenerations, upsertGeneration, getGenerationByRecordingId,
  getTestSuites, saveTestSuites, findTestSuiteById, createTestSuite, updateTestSuite, deleteTestSuite,
  addTestCasesToSuite, updateSuiteTestCaseType, removeTestCaseFromSuite,
  getSuiteRuns, saveSuiteRuns, getRunsBySuite, findSuiteRunById, createSuiteRun,
  upsertSuiteRunResults, completeSuiteRun,
};
