const express = require('express');
const db = require('../db');
const {
  isAllowedEmail, hashPassword, verifyPassword,
  setAuthCookie, clearAuthCookie, requireAuth, ALLOWED_DOMAIN,
} = require('../auth');

const router = express.Router();

function publicUser(user) {
  return { email: user.email, role: user.role };
}

// Whether the app has no accounts yet — frontend uses this to show a
// "create the first admin account" screen instead of a normal login form.
router.get('/bootstrap-status', (req, res) => {
  res.json({ needsBootstrap: db.getUsers().length === 0, allowedDomain: ALLOWED_DOMAIN });
});

// One-time: creates the first account, always as admin. Locked out once any
// user exists, so it can't be replayed later to mint extra admins.
router.post('/bootstrap', async (req, res) => {
  if (db.getUsers().length > 0) {
    return res.status(403).json({ error: 'Setup already completed. Ask an existing admin for an invite.' });
  }
  const { email, password } = req.body || {};
  if (!isAllowedEmail(email)) return res.status(400).json({ error: `Email must end with ${ALLOWED_DOMAIN}` });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const passwordHash = await hashPassword(password);
  const user = db.createUser({ email, passwordHash, role: 'admin' });
  setAuthCookie(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = email && db.findUserByEmail(email);
  const ok = user && await verifyPassword(password || '', user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });
  setAuthCookie(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.findUserByEmail(req.user.email);
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
  res.json({ user: publicUser(user) });
});

module.exports = router;
