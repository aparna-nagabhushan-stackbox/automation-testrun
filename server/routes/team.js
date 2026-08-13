const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

// 'admin' is the only role the backend actually enforces anywhere (invite
// generation, team management). The other four are real, persisted labels
// an admin can assign, but nothing else in the app currently branches on
// them — there's no fine-grained permission engine yet.
const ASSIGNABLE_ROLES = ['admin', 'viewer', 'developer', 'tester', 'content_manager'];

// Any logged-in user can see who else has access — matches the read access
// the org already has via the Admin invites list, just reshaped for the
// Team Members page.
router.get('/users', requireAuth, (req, res) => {
  const users = db.getUsers()
    .map(u => ({ email: u.email, role: u.role, createdAt: u.createdAt }))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json({ users });
});

// Admin: change someone's role.
router.patch('/users/:email', requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body || {};
  if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Not a valid role.' });
  const user = db.updateUserRole(req.params.email, role);
  if (!user) return res.status(404).json({ error: 'No account with that email.' });
  res.json({ user: { email: user.email, role: user.role, createdAt: user.createdAt } });
});

// Admin: remove someone from the team. Can't remove yourself, and can't
// remove the last remaining admin (would lock everyone out of team mgmt).
router.delete('/users/:email', requireAuth, requireAdmin, (req, res) => {
  const email = req.params.email.toLowerCase();
  if (email === req.user.email.toLowerCase()) return res.status(400).json({ error: "You can't remove yourself." });
  const target = db.findUserByEmail(email);
  if (!target) return res.status(404).json({ error: 'No account with that email.' });
  if (target.role === 'admin') {
    const adminCount = db.getUsers().filter(u => u.role === 'admin').length;
    if (adminCount <= 1) return res.status(400).json({ error: "Can't remove the last admin." });
  }
  db.deleteUser(email);
  res.json({ ok: true });
});

module.exports = router;
