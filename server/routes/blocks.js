const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

router.get('/', (req, res) => {
  const project = (req.query.project || '').toString();
  res.json({ blocks: project ? db.getBlocksByProject(project) : db.getBlocks() });
});

router.post('/', requireAdmin, (req, res) => {
  const { project, name, code } = req.body || {};
  if (!project || !name || !code) return res.status(400).json({ error: 'project, name, and code are required.' });
  res.json({ block: db.createBlock({ project, name, code, createdBy: req.user.email }) });
});

module.exports = router;
