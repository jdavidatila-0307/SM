const crypto = require('crypto');

const ITERATIONS = 100_000;
const KEY_LEN    = 64;
const DIGEST     = 'sha256';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

// ── BUG #2 CORREGIDO: verifyPassword lanza errores descriptivos ──
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') {
    throw new Error('password_hash ausente o inválido en la base de datos');
  }
  const parts = stored.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Formato de password_hash inválido. Partes encontradas: ${parts.length}`);
  }
  const [salt, hash] = parts;
  const attempt = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  const hashBuf    = Buffer.from(hash,    'hex');
  const attemptBuf = Buffer.from(attempt, 'hex');
  if (hashBuf.length !== attemptBuf.length) {
    throw new Error(
      `Longitudes de buffer incompatibles: stored=${hashBuf.length}B, computed=${attemptBuf.length}B. ` +
      `Posible inconsistencia de KEY_LEN entre hashPassword y verifyPassword.`
    );
  }
  return crypto.timingSafeEqual(hashBuf, attemptBuf);
}

function requireAuth(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'No autenticado' });
  next();
}

// ── BUG #3 CORREGIDO: acepta 'admin', 'superadmin' y 'profesor' ──
function requireAdmin(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'No autenticado' });
  const rolesAdmin = ['admin', 'superadmin', 'profesor'];
  if (!rolesAdmin.includes(req.session.rol)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
}

// ── BUG #3 NUEVO: middleware exclusivo para superadmin ──
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
