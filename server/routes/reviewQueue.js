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
  // Trimmed and length-capped to match createProject's handling — a block name
  // is rendered into the block library for every user on the project.
  const blockName = (req.body?.blockName || '').toString().trim();
  if (!blockName) return res.status(400).json({ error: 'blockName is required.' });
  if (blockName.length > 60) return res.status(400).json({ error: 'Block name must be 60 characters or fewer.' });

  const entry = db.getReviewQueue().find((e) => e.id === Number(req.params.id));
  if (!entry) return res.status(404).json({ error: 'No review entry with that id.' });

  const generation = db.getGenerationByRecordingId(entry.recordingId);
  if (!generation) return res.status(404).json({ error: 'No generated code found for this entry.' });

  // The RAW recording, not Claude's cleaned code: block matching extracts an
  // interaction sequence from raw recorder output, so a block whose code is
  // the cleaned/role-rewritten version would never match a future recording.
  // Older generation records predate `rawCode`, hence the fallback.
  const code = generation.rawCode || generation.code;
  const block = db.createBlock({ project: entry.project, name: blockName, code, createdBy: req.user.email });
  db.updateReviewEntryStatus(entry.id, 'promoted');
  res.json({ block });
});

module.exports = router;
