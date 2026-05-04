/**
 * storage.js — va en la carpeta src/
 * CORRECCIONES:
 *   - findUserByEmailOrId usa ILIKE (búsqueda de email sin distinguir mayúsculas)
 *   - createUser maneja graciosamente la columna password_plain si no existe en BD
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ============================================================
//  FUNCIONES DE USUARIOS
// ============================================================
async function findUserById(id) {
  const res = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function findUserByEmailOrId(identifier) {
  // ILIKE hace la búsqueda de email insensible a mayúsculas/minúsculas
  // Ej: "Prof@Email.com" y "prof@email.com" son equivalentes
  const res = await pool.query(
    'SELECT * FROM usuarios WHERE id = $1 OR email ILIKE $1',
    [identifier]
  );
  return res.rows[0] || null;
}

async function createUser(id, nombre, email, passwordHash, passwordPlain, rol) {
  // Intentar con password_plain. Si la columna no existe en BD,
  // reintentar sin ella para no bloquear la creación del profesor.
  try {
    await pool.query(
      `INSERT INTO usuarios (id, nombre, email, password_hash, password_plain, rol)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, nombre, email, passwordHash, passwordPlain, rol]
    );
  } catch (e) {
    if (e.message && e.message.includes('password_plain')) {
      console.warn('[storage] columna password_plain inexistente — insertando sin ella');
      await pool.query(
        `INSERT INTO usuarios (id, nombre, email, password_hash, rol)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, nombre, email, passwordHash, rol]
      );
    } else {
      throw e;
    }
  }
}

async function listUsers(rol = null) {
  const query  = rol ? 'SELECT * FROM usuarios WHERE rol = $1' : 'SELECT * FROM usuarios';
  const params = rol ? [rol] : [];
  const res = await pool.query(query, params);
  return res.rows;
}

async function deleteUser(id) {
  await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
}

// ============================================================
//  FUNCIONES DE SIMULACIONES
// ============================================================
async function createSimulacion(ownerId, simData) {
  const {
    id, nombre, descripcion, codigoAcceso, estado, creadaAt,
    config, parametros, tiposProducto, canales, segmentos,
    afinidadMatrix, competenciaExterna, rondas, users
  } = simData;
  await pool.query(
    `INSERT INTO simulaciones (
      id, owner_id, nombre, descripcion, codigo_acceso, estado, creada_at,
      config, parametros, tipos_producto, canales, segmentos,
      afinidad_matrix, competencia_externa, rondas, users
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [id, ownerId, nombre, descripcion, codigoAcceso, estado, creadaAt,
     config, parametros, tiposProducto, canales, segmentos,
     afinidadMatrix, competenciaExterna, rondas, users]
  );
}

async function getSimulacion(id, ownerId = null) {
  let query = 'SELECT * FROM simulaciones WHERE id = $1';
  const params = [id];
  if (ownerId) { query += ' AND owner_id = $2'; params.push(ownerId); }
  const res = await pool.query(query, params);
  return res.rows[0] || null;
}

async function listSimulaciones(ownerId = null) {
  let query = 'SELECT * FROM simulaciones';
  const params = [];
  if (ownerId) { query += ' WHERE owner_id = $1'; params.push(ownerId); }
  query += ' ORDER BY creada_at DESC';
  const res = await pool.query(query, params);
  return res.rows;
}

async function updateSimulacion(id, updates, ownerId = null) {
  const allowedFields = [
    'nombre', 'descripcion', 'estado', 'codigo_acceso', 'config',
    'parametros', 'tipos_producto', 'canales', 'segmentos',
    'afinidad_matrix', 'competencia_externa', 'rondas', 'users'
  ];
  const setClauses = [];
  const values = [];
  let idx = 1;
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = $${idx}`);
      values.push(updates[field]);
      idx++;
    }
  }
  if (setClauses.length === 0) return;
  values.push(id);
  if (ownerId) {
    values.push(ownerId);
    await pool.query(
      `UPDATE simulaciones SET ${setClauses.join(', ')} WHERE id = $${idx} AND owner_id = $${idx+1}`,
      values
    );
  } else {
    await pool.query(
      `UPDATE simulaciones SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );
  }
}

async function deleteSimulacion(id, ownerId = null) {
  let query = 'DELETE FROM simulaciones WHERE id = $1';
  const params = [id];
  if (ownerId) { query += ' AND owner_id = $2'; params.push(ownerId); }
  await pool.query(query, params);
}

// ============================================================
//  EQUIPOS (dentro de una simulación)
// ============================================================
async function getEquipos(simulacionId, ownerId = null) {
  const sim = await getSimulacion(simulacionId, ownerId);
  if (!sim) return [];
  return sim.users || [];
}

async function addEquipo(simulacionId, equipo, ownerId = null) {
  const sim = await getSimulacion(simulacionId, ownerId);
  if (!sim) throw new Error('Simulación no encontrada');
  const users = sim.users || [];
  users.push(equipo);
  await updateSimulacion(simulacionId, { users }, ownerId);
}

async function findUserInSimulacion(simulacionId, userId, ownerId = null) {
  const equipos = await getEquipos(simulacionId, ownerId);
  return equipos.find(e => e.id === userId);
}

// ============================================================
//  RONDAS
// ============================================================
async function getRonda(simulacionId, n, ownerId = null) {
  const sim = await getSimulacion(simulacionId, ownerId);
  if (!sim) return null;
  const rondas = sim.rondas || {};
  return rondas[String(n)];
}

async function updateRonda(simulacionId, n, data, ownerId = null) {
  const sim = await getSimulacion(simulacionId, ownerId);
  if (!sim) throw new Error('Simulación no encontrada');
  const rondas = sim.rondas || {};
  rondas[String(n)] = { ...rondas[String(n)], ...data };
  await updateSimulacion(simulacionId, { rondas }, ownerId);
}

function defaultDecision(equipoId, equipoNombre, params) {
  const p = params || {};
  return {
    equipo: equipoId, equipoNombre,
    producto: 'Básico', segmentoObjetivo: 'Masivo popular',
    canalPrincipal: 'Mercado', canalSecundario: 'Ninguno',
    calidad: 5, precioVenta: 3.60, produccion: 18000,
    publicidad: 3000, promocion: 2000, eventos: 1000,
    marketingRedes: 1000, relacionesPublicas: 1000,
    contratarVendedores: 0, despedirVendedores: 0,
    tipoPrestamo: 'Ninguno', montoPrestamo: 0, plazoPrestamo: 2, amortizacion: 0,
    innovacion: false, tipoInnovacion: '', montoInnovacion: 0,
    tipoInvestigacion: 'No',
    vendedoresIniciales: p.vendedoresIniciales || 2,
    cajaInicial: p.cajaInicial || 50000,
    activosFijosIniciales: p.activosFijosIniciales || 80000,
    cxcInicial: p.cxcInicial || 0,
    deudaInicial: p.deudaInicial || 0,
    inventarioInicial: p.inventarioInicialUnid || 0,
    resultadoAcumuladoAnterior: 0,
    submitted: false, submittedAt: null
  };
}

async function ensureRonda(simulacionId, n, ownerId = null) {
  let ronda = await getRonda(simulacionId, n, ownerId);
  if (!ronda) {
    const sim = await getSimulacion(simulacionId, ownerId);
    if (!sim) throw new Error('Simulación no encontrada');
    const equipos = await getEquipos(simulacionId, ownerId);
    const rondaBase = {
      estado: 'open', abiertaAt: new Date().toISOString(),
      ejecutadaAt: null, decisiones: {}, resultados: {},
      mercadoSegmentos: [], atractivoEquipos: {}, dashboard: {}
    };
    if (n > 1) {
      const prevRonda = await getRonda(simulacionId, n-1, ownerId);
      if (prevRonda) {
        for (const eq of equipos) {
          const decPrev = prevRonda.decisiones[eq.id];
          if (decPrev) {
            const nuevaDec = { ...decPrev };
            nuevaDec.submitted = false; nuevaDec.submittedAt = null;
            nuevaDec.contratarVendedores = 0; nuevaDec.despedirVendedores = 0;
            nuevaDec.tipoPrestamo = 'Ninguno'; nuevaDec.montoPrestamo = 0; nuevaDec.amortizacion = 0;
            nuevaDec.innovacion = false; nuevaDec.tipoInnovacion = ''; nuevaDec.montoInnovacion = 0;
            nuevaDec.tipoInvestigacion = 'No';
            const resPrev = prevRonda.resultados[eq.id];
            if (resPrev) {
              nuevaDec.cajaInicial          = Math.max(0, resPrev.cajaFinal);
              nuevaDec.cxcInicial           = Math.max(0, resPrev.cxcFinal);
              nuevaDec.deudaInicial         = Math.max(0, resPrev.deudaFinal);
              nuevaDec.inventarioInicial    = Math.max(0, resPrev.inventarioFinal);
              nuevaDec.vendedoresIniciales  = Math.max(1, resPrev.vendedoresFinales);
              nuevaDec.activosFijosIniciales= Math.max(0, resPrev.activosFijosNetos || 78000);
              nuevaDec.resultadoAcumuladoAnterior = resPrev.resultadoAcumulado;
            }
            rondaBase.decisiones[eq.id] = nuevaDec;
          } else {
            rondaBase.decisiones[eq.id] = defaultDecision(eq.id, eq.nombre, sim.parametros);
          }
        }
      } else {
        for (const eq of equipos)
          rondaBase.decisiones[eq.id] = defaultDecision(eq.id, eq.nombre, sim.parametros);
      }
    } else {
      for (const eq of equipos)
        rondaBase.decisiones[eq.id] = defaultDecision(eq.id, eq.nombre, sim.parametros);
    }
    await updateRonda(simulacionId, n, rondaBase, ownerId);
    ronda = rondaBase;
  }
  return ronda;
}

// ============================================================
//  CONFIGURACIÓN
// ============================================================
async function getSimConfig(simulacionId, ownerId = null) {
  const sim = await getSimulacion(simulacionId, ownerId);
  if (!sim) return null;
  return {
    params: sim.parametros, tiposProducto: sim.tipos_producto,
    canales: sim.canales, segmentos: sim.segmentos,
    afinidadMatrix: sim.afinidad_matrix, competenciaExterna: sim.competencia_externa
  };
}

async function updateSimConfig(simulacionId, config, ownerId = null) {
  const updates = {};
  if (config.parametros       !== undefined) updates.parametros        = config.parametros;
  if (config.tiposProducto    !== undefined) updates.tipos_producto     = config.tiposProducto;
  if (config.canales          !== undefined) updates.canales            = config.canales;
  if (config.segmentos        !== undefined) updates.segmentos          = config.segmentos;
  if (config.afinidadMatrix   !== undefined) updates.afinidad_matrix    = config.afinidadMatrix;
  if (config.competenciaExterna !== undefined) updates.competencia_externa = config.competenciaExterna;
  await updateSimulacion(simulacionId, updates, ownerId);
}

// Generadores
function genSimId()  { return 'sim_' + Date.now().toString(36); }
function genCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'MKT-' + Array.from({length:4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = {
  findUserById, findUserByEmailOrId, createUser, listUsers, deleteUser,
  createSimulacion, getSimulacion, listSimulaciones, updateSimulacion, deleteSimulacion,
  getEquipos, addEquipo, findUserInSimulacion,
  getRonda, updateRonda, ensureRonda, defaultDecision,
  getSimConfig, updateSimConfig,
  genSimId, genCodigo
};
