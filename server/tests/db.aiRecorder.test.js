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

test('review queue: removing pending entries for a recording leaves other recordings and settled entries alone', () => {
  const db = freshDb();
  const stale = db.createReviewEntry({ project: 'Inbound', recordingId: 'r1', reason: 'weak locator', flaggedSteps: [1] });
  const settled = db.createReviewEntry({ project: 'Inbound', recordingId: 'r1', reason: 'weak locator', flaggedSteps: [1] });
  const other = db.createReviewEntry({ project: 'Inbound', recordingId: 'r2', reason: 'weak locator', flaggedSteps: [1] });
  db.updateReviewEntryStatus(settled.id, 'promoted');

  assert.equal(db.removePendingReviewEntries('r1'), 1);
  const ids = db.getReviewQueue().map((e) => e.id).sort();
  assert.deepEqual(ids, [settled.id, other.id].sort());
  assert.ok(!ids.includes(stale.id));
  // A recording with nothing pending is a no-op.
  assert.equal(db.removePendingReviewEntries('r1'), 0);
  assert.equal(db.removePendingReviewEntries('nope'), 0);
});

test('generations: upsert replaces the prior generation for the same recording', () => {
  const db = freshDb();
  db.upsertGeneration({ recordingId: 'r1', summary: 'first' });
  db.upsertGeneration({ recordingId: 'r1', summary: 'second' });
  assert.equal(db.getGenerations().length, 1);
  assert.equal(db.getGenerationByRecordingId('r1').summary, 'second');
  assert.equal(db.getGenerationByRecordingId('missing'), null);
});
