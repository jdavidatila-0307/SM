/**
 * Sesiones simples usando cookies + Map en memoria
 * Usa crypto.randomBytes nativo — sin dependencias externas
 */
const crypto = require('crypto');

const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 horas

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function destroySession(token) {
  sessions.delete(token);
}

// Middleware: parsea cookie "sid" y puebla req.session
function sessionMiddleware(req, res, next) {
  const raw = req.headers.cookie || '';
  const sid = raw.split(';').map(c => c.trim()).find(c => c.startsWith('sid='));
  const token = sid ? sid.split('=')[1] : null;
  const s = getSession(token);
  req.sessionToken = token;
  req.session = s || null;
  req.setSession = (userId) => {
    const t = createSession(userId);
    res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; Path=/; SameSite=Lax`);
    return t;
  };
  req.destroySession = () => {
    if (req.sessionToken) destroySession(req.sessionToken);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  };
  next();
}

module.exports = { sessionMiddleware };
