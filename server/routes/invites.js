const express = require('express');
const db = require('../db');
const {
  isAllowedEmail, hashPassword, setAuthCookie,
  requireAuth, requireAdmin, generateToken, ALLOWED_DOMAIN,
} = require('../auth');

const router = express.Router();

function publicUser(user) {
  return { email: user.email, role: user.role };
}
function publicInvite(invite) {
  return {
    email: invite.email,
    type: invite.type,
    createdAt: invite.createdAt,
    status: invite.acceptedAt ? 'accepted' : 'pending',
    acceptedAt: invite.acceptedAt,
  };
}
function inviteLink(req, token) {
  return `${req.protocol}://${req.get('host')}/?invite=${token}`;
}

// Admin: create an invite (new account) or a reset link (existing account).
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { email, type } = req.body || {};
  const kind = type === 'reset' ? 'reset' : 'invite';

  if (kind === 'invite') {
    if (!isAllowedEmail(email)) return res.status(400).json({ error: `Email must end with ${ALLOWED_DOMAIN}` });
    if (db.findUserByEmail(email)) return res.status(400).json({ error: 'That person already has an account — generate a reset link instead.' });
  } else {
    if (!email || !db.findUserByEmail(email)) return res.status(400).json({ error: 'No account exists with that email.' });
  }

  const token = generateToken();
  const invite = db.createInvite({ email, token, type: kind, invitedBy: req.user.email });
  res.json({ invite: publicInvite(invite), link: inviteLink(req, token) });
});

// Admin: list every invite/reset link ever generated, to see what's pending.
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const invites = db.getInvites().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ invites: invites.map(publicInvite) });
});

// Public: look up a token so the frontend can show "Set a password for
// <email>" before the user submits anything.
router.get('/:token', (req, res) => {
  const invite = db.findInviteByToken(req.params.token);
  if (!invite) return res.status(404).json({ error: 'This link is invalid.' });
  if (invite.acceptedAt) return res.status(410).json({ error: 'This link has already been used.' });
  res.json({ email: invite.email, type: invite.type });
});

// Public: consume the token, set the password, log the user in.
router.post('/accept', async (req, res) => {
  const { token, password } = req.body || {};
  const invite = token && db.findInviteByToken(token);
  if (!invite) return res.status(404).json({ error: 'This link is invalid.' });
  if (invite.acceptedAt) return res.status(410).json({ error: 'This link has already been used.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const passwordHash = await hashPassword(password);
  let user;
  if (invite.type === 'reset') {
    user = db.updateUserPassword(invite.email, passwordHash);
    if (!user) return res.status(404).json({ error: 'The account for this link no longer exists.' });
  } else {
    if (db.findUserByEmail(invite.email)) return res.status(400).json({ error: 'An account with this email already exists.' });
    user = db.createUser({ email: invite.email, passwordHash, role: 'viewer' });
  }

  db.markInviteAccepted(token);
  setAuthCookie(res, user);
  res.json({ user: publicUser(user) });
});

module.exports = router;
