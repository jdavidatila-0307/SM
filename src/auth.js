const crypto = require('crypto');

const ITERATIONS = 100_000;
const KEY_LEN    = 64;
const DIGEST     = 'sha256';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

function requireAuth(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'No autenticado' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'No autenticado' });
  if (req.session.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

function requireEquipo(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'No autenticado' });
  if (req.session.rol !== 'equipo') return res.status(403).json({ error: 'Solo para equipos' });
  next();
}

module.exports = { hashPassword, verifyPassword, requireAuth, requireAdmin, requireEquipo };
