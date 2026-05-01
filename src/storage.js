/**
 * Almacenamiento persistente — v3.0 Multi-Simulación
 */
const fs   = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');
const CONST = require('./constants');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

// ── Decisión vacía ────────────────────────────────────────────
function defaultDecision(equipoId, equipoNombre, params) {
  const p = params || CONST.PARAMS;
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
    vendedoresIniciales: p.vendedoresIniciales,
    cajaInicial: p.cajaInicial, activosFijosIniciales: p.activosFijosIniciales,
    cxcInicial: p.cxcInicial, deudaInicial: p.deudaInicial,
    inventarioInicial: p.inventarioInicialUnid, resultadoAcumuladoAnterior: 0,
    submitted: false, submittedAt: null,
  };
}

// ── Genera ID y código únicos ─────────────────────────────────
function genSimId()   { return 'sim_' + Date.now().toString(36); }
function genCodigo()  {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'MKT-' + Array.from({length:4}, ()=>chars[Math.floor(Math.random()*chars.length)]).join('');
}

// ── Crea una simulación vacía ─────────────────────────────────
function createSimData(nombre, descripcion='', totalRounds=20, baseParams=null) {
  return {
    nombre, descripcion,
    creadaAt: new Date().toISOString(),
    estado: 'activa',   // 'activa' | 'archivada'
    codigoAcceso: genCodigo(),
    config: { currentRound: 1, totalRounds, roundState: 'pending' },
    parametros:         baseParams?.parametros        || { ...CONST.PARAMS },
    tiposProducto:      baseParams?.tiposProducto     || Object.fromEntries(Object.entries(CONST.TIPOS_PRODUCTO).map(([k,v])=>[k,{...v}])),
    canales:            baseParams?.canales            || Object.fromEntries(Object.entries(CONST.CANALES).map(([k,v])=>[k,{...v}])),
    segmentos:          baseParams?.segmentos          || CONST.SEGMENTOS.map(s=>({...s})),
    afinidadMatrix:     baseParams?.afinidadMatrix     || JSON.parse(JSON.stringify(CONST.AFINIDAD_MATRIX)),
    competenciaExterna: baseParams?.competenciaExterna || CONST.COMPETENCIA_EXTERNA.map(c=>({...c})),
    users:  [],
    rondas: {},
  };
}

// ── DB raíz vacía ─────────────────────────────────────────────
function createEmptyDB() {
  const simId = genSimId();
  const sim   = createSimData('Simulación Principal', 'Simulación inicial del sistema');
  sim.users.push({
    id: 'admin', nombre: 'Administrador',
    password: hashPassword('admin123'), passwordPlain: 'admin123',
    rol: 'admin', miembros: [],
  });
  return {
    admin: { id:'admin', nombre:'Administrador', password: hashPassword('admin123'), passwordPlain:'admin123', rol:'admin' },
    simulaciones: { [simId]: sim },
  };
}

// ── Migración desde formato v2 (sin simulaciones) ─────────────
function migrateV2(oldDB) {
  console.log('[storage] Migrando base de datos v2 → v3 (multi-simulación)...');
  const simId = genSimId();
  const sim = {
    nombre: 'Simulación Principal',
    descripcion: 'Migrada automáticamente desde versión anterior',
    creadaAt: new Date().toISOString(),
    estado: 'activa',
    codigoAcceso: genCodigo(),
    config: { ...oldDB.config },
    parametros:         oldDB.parametros        || { ...CONST.PARAMS },
    tiposProducto:      oldDB.tiposProducto     || Object.fromEntries(Object.entries(CONST.TIPOS_PRODUCTO).map(([k,v])=>[k,{...v}])),
    canales:            oldDB.canales            || Object.fromEntries(Object.entries(CONST.CANALES).map(([k,v])=>[k,{...v}])),
    segmentos:          oldDB.segmentos          || CONST.SEGMENTOS.map(s=>({...s})),
    afinidadMatrix:     oldDB.afinidadMatrix     || JSON.parse(JSON.stringify(CONST.AFINIDAD_MATRIX)),
    competenciaExterna: oldDB.competenciaExterna || CONST.COMPETENCIA_EXTERNA.map(c=>({...c})),
    users:  (oldDB.users || []).filter(u => u.rol === 'equipo'),
    rondas: oldDB.rondas || {},
  };
  const adminUser = (oldDB.users || []).find(u => u.rol === 'admin') || 
    { id:'admin', nombre:'Administrador', password: hashPassword('admin123'), passwordPlain:'admin123', rol:'admin' };
  return {
    admin: { id: adminUser.id, nombre: adminUser.nombre, password: adminUser.password, passwordPlain: adminUser.passwordPlain||'admin123', rol:'admin' },
    simulaciones: { [simId]: sim },
  };
}

// ── Load / Save ───────────────────────────────────────────────
function load() {
  if (!fs.existsSync(DB_PATH)) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const db = createEmptyDB();
    save(db);
    return db;
  }
  let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  // Detectar formato v2 (sin campo simulaciones)
  if (!db.simulaciones) {
    db = migrateV2(db);
    save(db);
  }
  // Asegurar admin global
  if (!db.admin) {
    db.admin = { id:'admin', nombre:'Administrador', password: hashPassword('admin123'), passwordPlain:'admin123', rol:'admin' };
    save(db);
  }
  return db;
}

function save(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

// ── Helpers de simulación ─────────────────────────────────────
function getSim(db, simId)  { return db.simulaciones[simId] || null; }
function listSims(db)       { return Object.entries(db.simulaciones).map(([id, s]) => ({ id, ...s })); }

function createSim(db, nombre, descripcion='', totalRounds=20, copyFromSimId=null) {
  const simId = genSimId();
  const base = copyFromSimId ? db.simulaciones[copyFromSimId] : null;
  db.simulaciones[simId] = createSimData(nombre, descripcion, totalRounds,
    base ? { parametros: base.parametros, tiposProducto: base.tiposProducto,
              canales: base.canales, segmentos: base.segmentos,
              afinidadMatrix: base.afinidadMatrix, competenciaExterna: base.competenciaExterna } : null
  );
  return simId;
}

// ── Helpers de equipo (dentro de una simulación) ──────────────
function getEquipos(sim)        { return (sim.users || []).filter(u => u.rol === 'equipo'); }
function findUserInSim(sim, id) { return (sim.users || []).find(u => u.id === id); }

// Busca un usuario en TODAS las simulaciones (para login)
function findUserGlobal(db, idOrNombre) {
  const inp = idOrNombre.trim().toLowerCase();
  // Admin global
  if (db.admin.id === inp || db.admin.nombre.toLowerCase() === inp)
    return { user: db.admin, simId: null };
  // Equipos en simulaciones
  for (const [simId, sim] of Object.entries(db.simulaciones)) {
    const u = (sim.users||[]).find(u =>
      u.id.toLowerCase() === inp || u.nombre.toLowerCase() === inp
    );
    if (u) return { user: u, simId };
  }
  return null;
}

function getRonda(sim, n)    { return sim.rondas[String(n)] || null; }
function getSimConfig(sim)   {
  return {
    params: sim.parametros, tiposProducto: sim.tiposProducto,
    canales: sim.canales, segmentos: sim.segmentos,
    afinidadMatrix: sim.afinidadMatrix, competenciaExterna: sim.competenciaExterna,
  };
}

function ensureRonda(sim, n) {
  const key = String(n);
  if (!sim.rondas[key]) {
    sim.rondas[key] = {
      estado: 'open', abiertaAt: new Date().toISOString(),
      ejecutadaAt: null, decisiones: {}, resultados: {},
      mercadoSegmentos: [], atractivoEquipos: {}, dashboard: {},
    };
    getEquipos(sim).forEach(eq => {
      const prev = sim.rondas[String(n-1)];
      if (prev?.decisiones?.[eq.id]) {
        const d = { ...prev.decisiones[eq.id] };
        const r = prev.resultados?.[eq.id];
        d.submitted = false; d.submittedAt = null;
        d.contratarVendedores = 0; d.despedirVendedores = 0;
        d.tipoPrestamo = 'Ninguno'; d.montoPrestamo = 0; d.amortizacion = 0;
        d.innovacion = false; d.tipoInnovacion = ''; d.montoInnovacion = 0;
        d.tipoInvestigacion = 'No';
        if (r) {
          d.cajaInicial               = Math.max(0, r.cajaFinal);
          d.cxcInicial                = Math.max(0, r.cxcFinal);
          d.deudaInicial              = Math.max(0, r.deudaFinal);
          d.inventarioInicial         = Math.max(0, r.inventarioFinal);
          d.vendedoresIniciales       = Math.max(1, r.vendedoresFinales);
          d.activosFijosIniciales     = Math.max(0, r.activosFijosNetos || r.afNetos || 78000);
          d.resultadoAcumuladoAnterior = r.resultadoAcumulado;
        }
        sim.rondas[key].decisiones[eq.id] = d;
      } else {
        sim.rondas[key].decisiones[eq.id] = defaultDecision(eq.id, eq.nombre, sim.parametros);
      }
    });
  }
  return sim.rondas[key];
}

function addEquipo(sim, equipo) {
  sim.users.push(equipo);
  const ronda = ensureRonda(sim, sim.config.currentRound);
  if (!ronda.decisiones[equipo.id]) {
    ronda.decisiones[equipo.id] = defaultDecision(equipo.id, equipo.nombre, sim.parametros);
  }
}

module.exports = {
  load, save,
  getSim, listSims, createSim, genSimId, genCodigo,
  getEquipos, findUserInSim, findUserGlobal,
  getRonda, ensureRonda, addEquipo, defaultDecision, getSimConfig,
};
