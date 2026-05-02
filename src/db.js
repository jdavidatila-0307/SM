const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
    ca: null,
    checkServerIdentity: () => undefined
  },
  connectionTimeoutMillis: 5000,
});

// Añadir evento de error para depuración
pool.on('error', (err) => {
  console.error('[db] Error inesperado en pool:', err.message);
});

module.exports = pool;