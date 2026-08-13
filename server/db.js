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

module.exports = {
  getUsers, saveUsers, findUserByEmail, createUser, updateUserPassword, updateUserRole, deleteUser,
  getInvites, saveInvites, findInviteByToken, createInvite, markInviteAccepted,
  getProjects, saveProjects, findProjectByName, createProject,
  getBlocks, saveBlocks, getBlocksByProject, createBlock,
  getReviewQueue, saveReviewQueue, createReviewEntry, removePendingReviewEntries, updateReviewEntryStatus,
  getGenerations, saveGenerations, upsertGeneration, getGenerationByRecordingId,
};
