const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function publicProject(p) {
  return { name: p.name, createdBy: p.createdBy, createdAt: p.createdAt };
}

// Any logged-in user can see the shared project list — it's just a naming
// convention layered on top of manual test cases, not a permissions boundary.
router.get('/', requireAuth, (req, res) => {
  const projects = db.getProjects().sort((a, b) => a.name.localeCompare(b.name));
  res.json({ projects: projects.map(publicProject) });
});

// Any logged-in user can create one too.
router.post('/', requireAuth, (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Project name is required.' });
  if (name.length > 60) return res.status(400).json({ error: 'Project name must be 60 characters or fewer.' });
  if (db.findProjectByName(name)) return res.status(400).json({ error: 'A project with this name already exists.' });

  const project = db.createProject({ name, createdBy: req.user.email });
  res.json({ project: publicProject(project) });
});

module.exports = router;
