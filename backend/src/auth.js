const crypto = require('crypto');
const config = require('./config');

// In-memory session store (single-process, simple)
const sessions = new Map();

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(token)
    .digest('hex');

  sessions.set(sessionId, { createdAt: Date.now() });
  return sessionId;
}

function validateSession(sessionId) {
  if (!sessionId) return false;
  if (!sessions.has(sessionId)) return false;
  // Sessions expire after 7 days of inactivity
  const session = sessions.get(sessionId);
  if (Date.now() - session.createdAt > 7 * 24 * 60 * 60 * 1000) {
    sessions.delete(sessionId);
    return false;
  }
  // Touch session
  session.createdAt = Date.now();
  return true;
}

function destroySession(sessionId) {
  sessions.delete(sessionId);
}

function requireAuth(req, res, next) {
  const sessionId = req.signedCookies?.veille_sess;
  if (!sessionId || !validateSession(sessionId)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { createSession, validateSession, destroySession, requireAuth };
