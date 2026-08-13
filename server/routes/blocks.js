const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

router.get('/', (req, res) => {
  const project = (req.query.project || '').toString();
  res.json({ blocks: project ? db.getBlocksByProject(project) : db.getBlocks() });
});

router.post('/', requireAdmin, (req, res) => {
  const { project, code } = req.body || {};
  // Trimmed and length-capped to match createProject's handling — a block name
  // is rendered into the block library for every user on the project.
  const name = (req.body?.name || '').toString().trim();
  if (!project || !name || !code) return res.status(400).json({ error: 'project, name, and code are required.' });
  if (name.length > 60) return res.status(400).json({ error: 'Block name must be 60 characters or fewer.' });
  res.json({ block: db.createBlock({ project, name, code, createdBy: req.user.email }) });
});

module.exports = router;
