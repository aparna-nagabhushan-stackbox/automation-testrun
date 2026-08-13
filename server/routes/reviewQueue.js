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
  const { blockName } = req.body || {};
  if (!blockName) return res.status(400).json({ error: 'blockName is required.' });

  const entry = db.getReviewQueue().find((e) => e.id === Number(req.params.id));
  if (!entry) return res.status(404).json({ error: 'No review entry with that id.' });

  const generation = db.getGenerationByRecordingId(entry.recordingId);
  if (!generation) return res.status(404).json({ error: 'No generated code found for this entry.' });

  const block = db.createBlock({ project: entry.project, name: blockName, code: generation.code, createdBy: req.user.email });
  db.updateReviewEntryStatus(entry.id, 'promoted');
  res.json({ block });
});

module.exports = router;
