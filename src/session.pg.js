const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SESSION_TTL_HOURS = 8;

async function createSession(userId, rol, simulacionId = null) {
  const token = crypto.randomBytes(32).toString('hex');

  await pool.query(
    `INSERT INTO sesiones (token, user_id, rol, simulacion_id, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' hours')::interval)`,
    [token, userId, rol, simulacionId, SESSION_TTL_HOURS]
  );

  return token;
}

async function getSession(token) {
  if (!token) return null;

  const res = await pool.query(
    `SELECT user_id AS "userId",
            rol,
            simulacion_id AS "simulacionId",
            created_at AS "createdAt",
            expires_at AS "expiresAt"
     FROM sesiones
     WHERE token = $1
       AND expires_at > now()`,
    [token]
  );

  return res.rows[0] || null;
}

async function destroySession(token) {
  if (!token) return;
  await pool.query('DELETE FROM sesiones WHERE token = $1', [token]);
}

async function cleanupExpiredSessions() {
  await pool.query('DELETE FROM sesiones WHERE expires_at <= now()');
}

module.exports = {
  createSession,
  getSession,
  destroySession,
  cleanupExpiredSessions
};