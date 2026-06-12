/**
 * auth.js — va en la carpeta src/
 * CORRECCIONES:
 *   - verifyPassword lanza errores descriptivos (diagnóstico en logs)
 *   - requireAdmin acepta 'admin', 'superadmin' y 'profesor'
 *   - requireSuperAdmin nuevo (solo superadmin)
 */
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
  if (!stored || typeof stored !== 'string') {
    throw new Error('password_hash ausente o inválido en la base de datos');
  }
  const parts = stored.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Formato de hash inválido (partes: ${parts.length})`);
  }
  const [salt, hash] = parts;
  const attempt  = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  const hashBuf  = Buffer.from(hash,    'hex');
  const attBuf   = Buffer.from(attempt, 'hex');
  if (hashBuf.length !== attBuf.length) {
    throw new Error(
      `Buffer length mismatch: stored=${hashBuf.length}B computed=${attBuf.length}B ` +
      `(posible diferencia de KEY_LEN entre hashPassword y verifyPassword)`
    );
  }
  return crypto.timingSafeEqual(hashBuf, attBuf);
}

function requireAuth(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'No autenticado' });
  next();
}

// CORREGIDO: acepta los tres roles de administración
function requireAdmin(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'No autenticado' });
  const rolesAdmin = ['admin', 'superadmin', 'profesor'];
  if (!rolesAdmin.includes(req.session.rol)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
}

// NUEVO: solo superadmin
function requireSuperAdmin(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'No autenticado' });
  if (req.session.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Acceso solo para superadministrador' });
  }
  next();
}

function requireEquipo(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'No autenticado' });
  if (req.session.rol !== 'equipo') return res.status(403).json({ error: 'Solo para equipos' });
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  requireEquipo,
};
