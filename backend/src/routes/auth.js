const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const config = require('../config');
const { createSession, destroySession, requireAuth } = require('../auth');

// ---------------------------------------------------------------------------
// In-memory rate limiter for POST /api/auth/login
// Limits: 5 attempts per 15 minutes per IP
// ---------------------------------------------------------------------------
const loginAttempts = new Map();

function loginRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + 15 * 60 * 1000 };
    loginAttempts.set(ip, record);
  }

  if (record.count >= 5) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return res.status(429).json({
      error: 'Trop de tentatives de connexion. Réessayez plus tard.',
      retryAfter,
    });
  }

  record.count++;
  next();
}

// Periodic cleanup of expired rate-limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts) {
    if (now > record.resetAt) {
      loginAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post('/login', loginRateLimit, (req, res) => {
  const { password } = req.body;

  // Timing-safe password comparison: short-circuit on empty / length mismatch,
  // then use crypto.timingSafeEqual for the actual comparison
  if (!password || typeof password !== 'string' || password.length !== config.appPassword.length) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const pwBuf = Buffer.from(password);
  const appPwBuf = Buffer.from(config.appPassword);
  if (pwBuf.length !== appPwBuf.length || !crypto.timingSafeEqual(pwBuf, appPwBuf)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const sessionId = createSession();
  res.cookie('veille_sess', sessionId, {
    httpOnly: true,
    signed: true,
    sameSite: 'strict',
    secure: config.secureCookie,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return res.json({ success: true });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const sessionId = req.signedCookies?.veille_sess;
  if (sessionId) {
    destroySession(sessionId);
  }
  res.clearCookie('veille_sess', { path: '/' });
  return res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  return res.json({ authenticated: true });
});

module.exports = router;
