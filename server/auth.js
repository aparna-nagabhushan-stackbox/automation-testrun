const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required — set it before starting the server (see .env.example).');
}
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || '@stackbox.xyz').toLowerCase();
const COOKIE_NAME = 'auth_token';
const TOKEN_TTL = '7d';

function isAllowedEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(ALLOWED_DOMAIN);
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function setAuthCookie(res, user) {
  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Not logged in.' });
  req.user = payload;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = {
  ALLOWED_DOMAIN, COOKIE_NAME,
  isAllowedEmail, hashPassword, verifyPassword,
  setAuthCookie, clearAuthCookie, requireAuth, requireAdmin, generateToken,
};
