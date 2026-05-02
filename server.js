/**
 * SIMULADOR DE MARKETING v3.0 — Multi-Simulación
 * Con persistencia PostgreSQL (asíncrona) y fallback a JSON.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const { hashPassword, verifyPassword } = require('./src/auth');
const storage  = require('./src/storage');
const { ejecutarSimulador, calcularMercadoSegmentos, calcularPreSimulacion } = require('./src/engine');
const { generarReportes } = require('./src/reports');

const PORT = process.env.PORT || 3000;
console.log('[server] DATABASE_URL definida?', process.env.DATABASE_URL ? 'Sí' : 'No');
const PUB_DIR = path.join(__dirname, 'public');

let DB = null; // se llenará asíncronamente

// ── Static MIME ───────────────────────────────────────────────
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.png':'image/png', '.ico':'image/x-icon',
};

// ── Session store ─────────────────────────────────────────────
const sessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k,v] of sessions) if (now - v.createdAt > 8*60*60*1000) sessions.delete(k);
}, 60*60*1000);

// ── Helpers ───────────────────────────────────────────────────
function readBody(req) {
  return new Promise((res,rej) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch { res({}); } });
    req.on('error', rej);
  });
}
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json' });
  res.end(JSON.stringify(data));
}
const ok  = (res, data) => send(res, 200, data);
const err = (res, s, m) => send(res, s, { error: m });

// ── Inicialización asíncrona de la base de datos ─────────────
async function initDB() {
  DB = await storage.load();
  // Asegurar ronda inicial en cada simulación activa
  for (const sim of Object.values(DB.simulaciones)) {
    if (sim.estado === 'activa') await storage.ensureRonda(sim, sim.config.currentRound);
  }
  await storage.save(DB);
  console.log('[server] Base de datos inicializada correctamente');
}
initDB().catch(e => console.error('[server] Error fatal inicializando DB:', e));

// ── Middleware de sesión ─────────────────────────────────────
function getSession(req) {
  const raw = req.headers.cookie || '';
  const sid = raw.split(';').map(c=>c.trim()).find(c=>c.startsWith('sid='));
  const token = sid ? sid.split('=')[1] : null;
  return token ? sessions.get(token) : null;
}

// ── Ruta principal (ya estaba, pero asegurando que DB esté cargada) ──
async function route(req, res, body) {
  // Esperar a que DB esté inicializada (si no lo está, reintentar)
  if (!DB) {
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (DB) { clearInterval(check); resolve(); }
      }, 100);
    });
  }

  const url    = req.url.split('?')[0];
  const method = req.method;
  const session = getSession(req);
  const s = session || null;

  const isAdmin  = () => s?.rol === 'admin';
  const isEquipo = () => s?.rol === 'equipo';
  const needAdmin  = () => { if (!s) { err(res,401,'No autenticado'); return true; } if (!isAdmin()) { err(res,403,'Acceso denegado'); return true; } return false; };
  const needEquipo = () => { if (!s) { err(res,401,'No autenticado'); return true; } if (!isEquipo()) { err(res,403,'Solo para equipos'); return true; } return false; };
  const needAuth   = () => { if (!s) { err(res,401,'No autenticado'); return true; } return false; };

  const getSimCtx = () => {
    if (s?.rol === 'equipo') return DB.simulaciones[s.simulacionId];
    if (s?.rol === 'admin' && s.simulacionId) return DB.simulaciones[s.simulacionId];
    return null;
  };

  // ═══ AUTH ════════════════════════════════════════════════════
  if (url === '/auth/login' && method === 'POST') {
    const { id, password } = body;
    if (!id || !password) return err(res, 400, 'Credenciales requeridas');
    const found = await storage.findUserGlobal(DB, id.trim());
    if (!found) return err(res, 401, 'Usuario o contraseña incorrectos');
    const { user, simId } = found;
    let lok = false;
    try { lok = verifyPassword(password, user.password); } catch {}
    if (!lok) return err(res, 401, 'Usuario o contraseña incorrectos');
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { userId: user.id, rol: user.rol, simulacionId: simId, createdAt: Date.now() });
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax`);
    return ok(res, { ok:true, rol: user.rol, id: user.id, nombre: user.nombre, simulacionId: simId });
  }

  if (url === '/auth/logout' && method === 'POST') {
    const token = getSession(req)?.token;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
    return ok(res, { ok:true });
  }

  if (url === '/auth/registro' && method === 'POST') {
    const { nombreEquipo, miembros, password, codigoSimulacion } = body;
    if (!nombreEquipo?.trim()) return err(res, 400, 'Nombre del equipo requerido');
    if (!password || password.length < 4) return err(res, 400, 'Contraseña de al menos 4 caracteres');
    if (!Array.isArray(miembros) || !miembros.length) return err(res, 400, 'Al menos un integrante');
    if (!codigoSimulacion?.trim()) return err(res, 400, 'Código de simulación requerido');
    const codigo = codigoSimulacion.trim().toUpperCase();
    const simEntry = Object.entries(DB.simulaciones).find(([,sim]) =>
      sim.codigoAcceso?.toUpperCase() === codigo && sim.estado === 'activa'
    );
    if (!simEntry) return err(res, 404, `Código "${codigo}" no válido`);
    const [simId, sim] = simEntry;
    for (let i = 0; i < miembros.length; i++) {
      const m = miembros[i];
      if (!m.apellidoPaterno?.trim()) return err(res, 400, `Integrante ${i+1}: falta Apellido Paterno`);
      if (!m.apellidoMaterno?.trim()) return err(res, 400, `Integrante ${i+1}: falta Apellido Materno`);
      if (!m.nombres?.trim())         return err(res, 400, `Integrante ${i+1}: faltan Nombres`);
      if (!m.nroRegistro?.trim())     return err(res, 400, `Integrante ${i+1}: falta Nro. Registro`);
    }
    const nombreLower = nombreEquipo.trim().toLowerCase();
    const equipos = await storage.getEquipos(sim);
    if (equipos.some(eq => eq.nombre.toLowerCase() === nombreLower))
      return err(res, 409, `Ya existe el equipo "${nombreEquipo.trim()}"`);
    const base = nombreLower.replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const id   = `eq_${simId.slice(4)}_${base}_${Date.now().toString(36)}`;
    const equipo = {
      id, nombre: nombreEquipo.trim(), simulacionId: simId,
      password: hashPassword(password), passwordPlain: password,
      rol: 'equipo', registradoAt: new Date().toISOString(),
      miembros: miembros.map(m => ({
        apellidoPaterno: m.apellidoPaterno.trim(), apellidoMaterno: m.apellidoMaterno.trim(),
        nombres: m.nombres.trim(), telefono: (m.telefono||'').trim(), nroRegistro: m.nroRegistro.trim()
      }))
    };
    await storage.addEquipo(sim, equipo);
    await storage.save(DB);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { userId: id, rol: 'equipo', simulacionId: simId, createdAt: Date.now() });
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax`);
    return ok(res, { ok:true, id, nombre: equipo.nombre, rol:'equipo', passwordPlain: password,
      simulacionNombre: sim.nombre, codigoSimulacion: codigo });
  }

  if (url === '/auth/me' && method === 'GET') {
    if (needAuth()) return;
    const u = s.rol === 'admin' ? DB.admin : (() => {
      const sim = DB.simulaciones[s.simulacionId];
      return sim ? storage.findUserInSim(sim, s.userId) : null;
    })();
    if (!u) return err(res, 401, 'Sesión inválida');
    return ok(res, { id: u.id, nombre: u.nombre, rol: u.rol, miembros: u.miembros||[],
      simulacionId: s.simulacionId || null });
  }

  if (url === '/auth/validar-codigo' && method === 'POST') {
    const { codigo } = body;
    if (!codigo) return err(res, 400, 'Código requerido');
    const entry = Object.entries(DB.simulaciones).find(([,sim]) =>
      sim.codigoAcceso?.toUpperCase() === codigo.trim().toUpperCase() && sim.estado === 'activa'
    );
    if (!entry) return ok(res, { valido: false });
    return ok(res, { valido: true, nombre: entry[1].nombre, simId: entry[0] });
  }

  // ═══ ADMIN — Gestión de Simulaciones ═════════════════════════
  if (url === '/admin/simulaciones' && method === 'GET') {
    if (needAdmin()) return;
    const sims = await storage.listSims(DB);
    const out = await Promise.all(sims.map(async sim => {
      const equipos = await storage.getEquipos(sim);
      return {
        id: sim.id, nombre: sim.nombre, descripcion: sim.descripcion||'',
        estado: sim.estado, creadaAt: sim.creadaAt,
        codigoAcceso: sim.codigoAcceso,
        currentRound: sim.config.currentRound, totalRounds: sim.config.totalRounds,
        roundState: sim.config.roundState,
        totalEquipos: equipos.length,
      };
    }));
    return ok(res, out);
  }

  if (url === '/admin/simulaciones' && method === 'POST') {
    if (needAdmin()) return;
    const { nombre, descripcion, totalRounds, copyFromSimId } = body;
    if (!nombre?.trim()) return err(res, 400, 'Nombre de simulación requerido');
    const simId = await storage.createSim(DB, nombre.trim(), descripcion||'',
      parseInt(totalRounds)||20, copyFromSimId||null);
    await storage.save(DB);
    return ok(res, { ok:true, simId, codigoAcceso: DB.simulaciones[simId].codigoAcceso });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+$/) && method === 'PUT') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const sim = await storage.getSim(DB, simId);
    if (!sim) return err(res, 404, 'Simulación no encontrada');
    if (body.nombre)      sim.nombre      = body.nombre.trim();
    if (body.descripcion !== undefined) sim.descripcion = body.descripcion;
    if (body.estado)      sim.estado      = body.estado;
    if (body.codigoAcceso) sim.codigoAcceso = body.codigoAcceso.trim().toUpperCase();
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+\/archivar$/) && method === 'POST') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const sim = await storage.getSim(DB, simId);
    if (!sim) return err(res, 404, 'Simulación no encontrada');
    sim.estado = 'archivada';
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+\/activar$/) && method === 'POST') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const sim = await storage.getSim(DB, simId);
    if (!sim) return err(res, 404, 'Simulación no encontrada');
    sim.estado = 'activa';
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+$/) && method === 'DELETE') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    if (!DB.simulaciones[simId]) return err(res, 404, 'No encontrada');
    delete DB.simulaciones[simId];
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/admin/seleccionar-sim' && method === 'POST') {
    if (needAdmin()) return;
    const { simId } = body;
    const sim = await storage.getSim(DB, simId);
    if (!sim) return err(res, 404, 'Simulación no encontrada');
    const sess = sessions.get(req._sessionToken);
    if (sess) sess.simulacionId = simId;
    return ok(res, { ok:true, simId, nombre: sim.nombre });
  }

  // ═══ Todas las rutas siguientes requieren contexto de simulación ═══
  const sim = getSimCtx();

  // ─── ADMIN — Equipos ─────────────────────────────────────────
  if (url === '/admin/equipos' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Selecciona una simulación primero');
    const ronda = await storage.getRonda(sim, sim.config.currentRound);
    const equipos = await storage.getEquipos(sim);
    const out = equipos.map(eq => {
      const dec = ronda?.decisiones[eq.id];
      return { id:eq.id, nombre:eq.nombre, miembros:eq.miembros||[],
        submitted:dec?.submitted||false, submittedAt:dec?.submittedAt||null,
        registradoAt:eq.registradoAt||null, passwordPlain:eq.passwordPlain||null };
    });
    return ok(res, out);
  }

  if (url === '/admin/equipos' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Selecciona una simulación primero');
    const { nombre, miembros, password } = body;
    if (!nombre || !password) return err(res, 400, 'Nombre y contraseña requeridos');
    const base = nombre.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const id = `eq_${Date.now().toString(36)}_${base}`;
    await storage.addEquipo(sim, { id, nombre, password:hashPassword(password), passwordPlain:password,
      rol:'equipo', miembros: Array.isArray(miembros)?miembros:[] });
    await storage.save(DB);
    return ok(res, { ok:true, id, nombre });
  }

  if (url.match(/^\/admin\/equipos\/[^/]+\/reset-envio$/) && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const eqId = url.split('/')[3];
    const ronda = await storage.getRonda(sim, sim.config.currentRound);
    if (!ronda) return err(res, 400, 'Sin ronda');
    if (sim.config.roundState === 'simulated') return err(res, 400, 'Ya simulada');
    const dec = ronda.decisiones[eqId];
    if (!dec) return err(res, 404, 'Sin decisiones');
    dec.submitted = false; dec.submittedAt = null;
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url.match(/^\/admin\/equipos\/[^/]+\/password$/) && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const eqId = url.split('/')[3];
    const u = await storage.findUserInSim(sim, eqId);
    if (!u) return err(res, 404, 'No encontrado');
    u.password = hashPassword(body.password); u.passwordPlain = body.password;
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url.match(/^\/admin\/equipos\/[^/]+$/) && method === 'DELETE') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const eqId = url.split('/')[3];
    const idx = sim.users.findIndex(u => u.id === eqId && u.rol === 'equipo');
    if (idx === -1) return err(res, 404, 'No encontrado');
    sim.users.splice(idx, 1);
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  // ─── ADMIN — Rondas ───────────────────────────────────────────
  if (url === '/admin/ronda' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Selecciona una simulación primero');
    const cfg = sim.config;
    const ronda = await storage.getRonda(sim, cfg.currentRound);
    const equipos = await storage.getEquipos(sim);
    const enviados = ronda ? equipos.filter(eq => ronda.decisiones[eq.id]?.submitted).length : 0;
    return ok(res, { currentRound:cfg.currentRound, totalRounds:cfg.totalRounds,
      roundState:cfg.roundState, total:equipos.length, enviados,
      abiertaAt:ronda?.abiertaAt, ejecutadaAt:ronda?.ejecutadaAt });
  }

  if (url === '/admin/ronda/activar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    if (sim.config.roundState !== 'pending') return err(res, 400, 'No está pendiente');
    sim.config.roundState = 'open';
    const ronda = await storage.getRonda(sim, sim.config.currentRound);
    if (ronda) ronda.estado = 'open';
    await storage.save(DB);
    return ok(res, { ok:true, currentRound: sim.config.currentRound });
  }

  if (url === '/admin/ronda/cerrar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    if (sim.config.roundState !== 'open') return err(res, 400, 'No está abierta');
    sim.config.roundState = 'locked';
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/admin/ronda/pre-simular' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim, n);
    if (!ronda) return err(res, 400, 'Sin ronda');
    if (!['open','locked'].includes(sim.config.roundState)) return err(res, 400, 'Estado incorrecto');
    if (ronda.estado === 'simulated') return err(res, 400, 'Ya simulada');
    const equipos = await storage.getEquipos(sim);
    const decisiones = equipos.filter(eq => ronda.decisiones[eq.id]).map(eq => ({...ronda.decisiones[eq.id]}));
    if (!decisiones.length) return err(res, 400, 'Sin decisiones');
    try {
      const simCfg = await storage.getSimConfig(sim);
      const preResult = calcularPreSimulacion(decisiones, simCfg);
      ronda.preSimulacion = {};
      preResult.resultado.forEach(r => { ronda.preSimulacion[r.equipo] = { ...r, confirmado: false }; });
      ronda.preSimMercado = preResult.mercadoSegmentos;
      sim.config.roundState = 'pre-sim';
      await storage.save(DB);
      return ok(res, { ok:true, equiposCalculados: preResult.resultado.length, detalle: preResult.resultado });
    } catch(e) { return err(res, 500, e.message); }
  }

  if (url === '/api/presim' && method === 'GET') {
    if (needAuth()) return;
    if (!sim) return err(res, 404, 'Sin simulación');
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim, n);
    if (!ronda?.preSimulacion) return err(res, 404, 'Sin datos de pre-simulación');
    if (s.rol === 'admin') {
      const eqMap = {};
      const equipos = await storage.getEquipos(sim);
      equipos.forEach(eq => { eqMap[eq.id] = eq.nombre; });
      const detalle = Object.values(ronda.preSimulacion).map(r => ({...r, equipoNombre: eqMap[r.equipo]||r.equipo}));
      return ok(res, { roundState: sim.config.roundState, total: detalle.length,
        confirmados: detalle.filter(r=>r.confirmado).length, detalle, mercadoSegmentos: ronda.preSimMercado||[] });
    } else {
      const miDato = ronda.preSimulacion[s.userId];
      if (!miDato) return err(res, 404, 'Sin datos para tu equipo');
      return ok(res, { roundState: sim.config.roundState, presim: miDato, mercadoSegmentos: ronda.preSimMercado||[] });
    }
  }

  if (url === '/api/presim/confirmar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const ronda = await storage.getRonda(sim, sim.config.currentRound);
    if (!ronda?.preSimulacion) return err(res, 400, 'Sin pre-simulación activa');
    if (sim.config.roundState !== 'pre-sim') return err(res, 400, 'No hay pre-simulación activa');
    if (!ronda.preSimulacion[s.userId]) return err(res, 404, 'Sin datos para tu equipo');
    ronda.preSimulacion[s.userId].confirmado = true;
    ronda.preSimulacion[s.userId].confirmadoAt = new Date().toISOString();
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url.match(/^\/admin\/presim\/forzar\/[^/]+$/) && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const eqId = url.split('/')[4];
    const ronda = await storage.getRonda(sim, sim.config.currentRound);
    if (!ronda?.preSimulacion?.[eqId]) return err(res, 404, 'Equipo no encontrado');
    ronda.preSimulacion[eqId].confirmado = true;
    ronda.preSimulacion[eqId].forzadoPor = 'admin';
    ronda.preSimulacion[eqId].confirmadoAt = new Date().toISOString();
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/admin/presim/forzar-todos' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const ronda = await storage.getRonda(sim, sim.config.currentRound);
    if (!ronda?.preSimulacion) return err(res, 400, 'Sin pre-simulación activa');
    for (const r of Object.values(ronda.preSimulacion)) {
      if (!r.confirmado) { r.confirmado = true; r.forzadoPor = 'admin'; r.confirmadoAt = new Date().toISOString(); }
    }
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/admin/simular' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim, n);
    if (!ronda) return err(res, 400, 'Sin ronda');
    if (ronda.estado === 'simulated') return err(res, 400, 'Ya simulada');
    if (!['open','locked','pre-sim'].includes(sim.config.roundState)) return err(res, 400, 'Estado incorrecto');
    if (sim.config.roundState === 'pre-sim') {
      const pendientes = Object.values(ronda.preSimulacion||{}).filter(r => !r.confirmado);
      if (pendientes.length > 0) return err(res, 400, `Faltan ${pendientes.length} equipo(s) por confirmar.`);
    }
    const equipos = await storage.getEquipos(sim);
    if (!equipos.length) return err(res, 400, 'Sin equipos');
    const decisiones = equipos.filter(eq => ronda.decisiones[eq.id]).map(eq => ({...ronda.decisiones[eq.id]}));
    if (!decisiones.length) return err(res, 400, 'Sin decisiones');
    try {
      const simCfg = await storage.getSimConfig(sim);
      const result = ejecutarSimulador(decisiones, simCfg);
      ronda.estado = 'simulated'; ronda.ejecutadaAt = new Date().toISOString();
      ronda.mercadoSegmentos = result.mercadoSegmentos;
      ronda.atractivoEquipos = result.atractivoEquipos;
      ronda.dashboard = result.dashboard;
      result.resultados.forEach(r => { ronda.resultados[r.equipo] = r; });
      ronda.reportes = {};
      for (const d of decisiones) {
        ronda.reportes[d.equipo] = generarReportes(d, result.mercadoSegmentos, result.atractivoEquipos, ronda.resultados, simCfg);
      }
      sim.config.roundState = 'simulated';
      await storage.save(DB);
      return ok(res, { ok:true, ronda: n, equiposSimulados: decisiones.length });
    } catch(e) { return err(res, 500, e.message); }
  }

  if (url === '/admin/ronda/siguiente' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    if (sim.config.roundState !== 'simulated') return err(res, 400, 'Simula primero');
    const next = sim.config.currentRound + 1;
    if (next > sim.config.totalRounds) return err(res, 400, 'Todas las rondas completadas');
    sim.config.currentRound = next; sim.config.roundState = 'pending';
    await storage.ensureRonda(sim, next);
    await storage.save(DB);
    return ok(res, { ok:true, currentRound: next });
  }

  if (url.match(/^\/admin\/resultados\/\d+$/) && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim, n);
    if (!ronda || ronda.estado !== 'simulated') return err(res, 404, 'Sin resultados');
    const equipos = await storage.getEquipos(sim);
    const eqMap = {};
    equipos.forEach(eq => { eqMap[eq.id] = eq.nombre; });
    const resultados = Object.values(ronda.resultados).map(r => ({...r, equipoNombre: eqMap[r.equipo]||r.equipo}));
    return ok(res, { ronda: n, estado: ronda.estado, ejecutadaAt: ronda.ejecutadaAt,
      resultados, mercadoSegmentos: ronda.mercadoSegmentos, dashboard: ronda.dashboard });
  }

  if (url === '/admin/historial' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const hist = [];
    for (let i = 1; i <= sim.config.currentRound; i++) {
      const r = await storage.getRonda(sim, i);
      if (!r) continue;
      const equipos = await storage.getEquipos(sim);
      hist.push({ ronda:i, estado:r.estado, ejecutadaAt:r.ejecutadaAt,
        enviados: equipos.filter(e => r.decisiones[e.id]?.submitted).length, total: equipos.length });
    }
    return ok(res, hist);
  }

  // ─── ADMIN — Config ───────────────────────────────────────────
  if (url === '/admin/config' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    return ok(res, {
      parametros: sim.parametros, tiposProducto: sim.tiposProducto,
      canales: sim.canales, segmentos: sim.segmentos,
      afinidadMatrix: sim.afinidadMatrix, competenciaExterna: sim.competenciaExterna,
      mercadoSegmentos: calcularMercadoSegmentos(sim.parametros, sim.segmentos),
    });
  }

  if (url === '/admin/parametros' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const { parametros } = body;
    if (!parametros) return err(res, 400, 'Datos requeridos');
    for (const k of Object.keys(sim.parametros)) {
      if (parametros[k] !== undefined && typeof parametros[k] === 'number') sim.parametros[k] = parametros[k];
    }
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/admin/tiposproducto' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const { tiposProducto } = body;
    if (!tiposProducto) return err(res, 400, 'Datos requeridos');
    for (const k of Object.keys(sim.tiposProducto)) {
      if (tiposProducto[k]?.costoBase !== undefined) sim.tiposProducto[k].costoBase = +tiposProducto[k].costoBase;
    }
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/admin/canales' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const { canales } = body;
    if (!canales) return err(res, 400, 'Datos requeridos');
    for (const k of Object.keys(sim.canales)) {
      if (!canales[k]) continue;
      for (const f of ['costoAdicionalUnitario','comisionPct','factorImpactoVendedores','bonoAtractivo']) {
        if (canales[k][f] !== undefined) sim.canales[k][f] = +canales[k][f];
      }
    }
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/admin/segmentos' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    return ok(res, sim.segmentos);
  }
  if (url === '/admin/segmentos' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const { segmentos } = body;
    if (!Array.isArray(segmentos)) return err(res, 400, 'Array requerido');
    sim.segmentos = segmentos.map(s => ({
      nombre: String(s.nombre||'').trim(),
      demandaBase: +s.demandaBase,
      pctContrabando: +s.pctContrabando,
      indiceExterno: +s.indiceExterno,
      tendencia: String(s.tendencia||''),
      descripcion: String(s.descripcion||''),
    }));
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/admin/afinidad' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    return ok(res, sim.afinidadMatrix);
  }
  if (url === '/admin/afinidad' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const { afinidadMatrix } = body;
    if (!afinidadMatrix) return err(res, 400, 'Datos requeridos');
    for (const prod of Object.keys(sim.afinidadMatrix)) {
      if (Array.isArray(afinidadMatrix[prod])) sim.afinidadMatrix[prod] = afinidadMatrix[prod].map(v => +v);
    }
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/admin/competencia' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    return ok(res, sim.competenciaExterna);
  }
  if (url === '/admin/competencia' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const { competencia } = body;
    if (!Array.isArray(competencia)) return err(res, 400, 'Array requerido');
    sim.competenciaExterna = competencia.map(c => ({
      segmento: String(c.segmento||''),
      nombre: String(c.nombre||''),
      precio: +c.precio,
      calidad: +c.calidad,
      marketing: +c.marketing,
      participacionRef: +c.participacionRef,
    }));
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  // ─── EQUIPO — Decisiones ──────────────────────────────────────
  if (url === '/api/decisiones' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const equipoId = s.userId;
    const n = sim.config.currentRound;
    let ronda = await storage.getRonda(sim, n);
    if (!ronda) {
      ronda = await storage.ensureRonda(sim, n);
      await storage.save(DB);
    }
    if (!ronda.decisiones[equipoId]) {
      const eq = await storage.findUserInSim(sim, equipoId);
      ronda.decisiones[equipoId] = storage.defaultDecision(equipoId, eq?.nombre||equipoId, sim.parametros);
      await storage.save(DB);
    }
    const cfg = await storage.getSimConfig(sim);
    return ok(res, {
      ronda: n,
      roundState: sim.config.roundState,
      decision: ronda.decisiones[equipoId],
      referencia: {
        segmentos: cfg.segmentos,
        tiposProducto: Object.keys(cfg.tiposProducto).map(k => ({ nombre:k, costoBase: cfg.tiposProducto[k].costoBase })),
        canales: Object.keys(cfg.canales).map(k => ({ nombre:k, ...cfg.canales[k] })),
        parametros: {
          costoInvestigacionBasica: cfg.params.costoInvestigacionBasica,
          costoInvestigacionPremium: cfg.params.costoInvestigacionPremium,
          costoContratacionVendedor: cfg.params.costoContratacionVendedor,
          costoDespidoVendedor: cfg.params.costoDespidoVendedor,
          sueldoTrimestralVendedor: cfg.params.sueldoTrimestralVendedor,
          gastoAdminFijo: cfg.params.gastoAdminFijo,
          gastoFijoPlanta: cfg.params.gastoFijoPlanta,
          capacidadMaxProduccion: cfg.params.capacidadMaxProduccion,
          tasaPrestamoOperativo: cfg.params.tasaPrestamoOperativo,
          tasaPrestamoInversion: cfg.params.tasaPrestamoInversion,
          plazoPrestamoOperativo: cfg.params.plazoPrestamoOperativo,
          plazoPrestamoInversion: cfg.params.plazoPrestamoInversion,
          comisionAperturaPrestamo: cfg.params.comisionAperturaPrestamo,
        },
      },
    });
  }

  if (url === '/api/decisiones/guardar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const equipoId = s.userId;
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim, n);
    if (!ronda) return err(res, 400, 'Sin ronda');
    if (ronda.estado === 'simulated') return err(res, 400, 'Ronda simulada');
    if (sim.config.roundState === 'pending') return err(res, 400, 'Ronda no habilitada');
    const cur = ronda.decisiones[equipoId] || {};
    ronda.decisiones[equipoId] = { ...cur, ...body.decision, equipo: equipoId, submitted: cur.submitted||false };
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/api/decisiones/enviar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const equipoId = s.userId;
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim, n);
    if (!ronda) return err(res, 400, 'Sin ronda');
    if (ronda.estado === 'simulated') return err(res, 400, 'Ronda simulada');
    if (sim.config.roundState === 'pending') return err(res, 400, 'Ronda no habilitada');
    const cur = ronda.decisiones[equipoId] || {};
    ronda.decisiones[equipoId] = { ...cur, ...body.decision, equipo: equipoId, submitted: true, submittedAt: new Date().toISOString() };
    await storage.save(DB);
    return ok(res, { ok:true });
  }

  if (url === '/api/resultados' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const equipoId = s.userId;
    const historial = [];
    for (let i = 1; i <= sim.config.currentRound; i++) {
      const r = await storage.getRonda(sim, i);
      if (!r || r.estado !== 'simulated') continue;
      const resultado = r.resultados[equipoId];
      if (!resultado) continue;
      historial.push({ ronda:i, ejecutadaAt:r.ejecutadaAt, resultado,
        decision: r.decisiones?.[equipoId]||null, reportes: r.reportes?.[equipoId]||{} });
    }
    return ok(res, { currentRound: sim.config.currentRound, roundState: sim.config.roundState, historial });
  }

  if (url.match(/^\/api\/reportes\/\d+$/) && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim, n);
    if (!ronda || ronda.estado !== 'simulated') return err(res, 404, 'Sin resultados');
    return ok(res, { ronda:n, reportes: ronda.reportes?.[s.userId]||{} });
  }

  if (url.match(/^\/api\/dashboard\/\d+$/) && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return err(res, 400, 'Sin simulación');
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim, n);
    if (!ronda || ronda.estado !== 'simulated') return err(res, 404, 'Sin resultados');
    const resultados = Object.values(ronda.resultados);
    const sorted = resultados.sort((a,b) => b.utilidadNeta - a.utilidadNeta);
    const ranking = sorted.map(r => ({ esYo: r.equipo===s.userId, utilidadNeta:r.utilidadNeta, ventas:r.ventasReales, share:r.shareReal, caja:r.cajaFinal }));
    const ebits = resultados.map(r => r.utilidadNeta);
    return ok(res, { ronda:n, ranking, stats: { ebitPromedio: ebits.reduce((a,b)=>a+b,0)/ebits.length, totalEquipos: ebits.length } });
  }

  return null;
}

// ── Servidor HTTP ─────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // Sesión
  const raw = req.headers.cookie || '';
  const sid = raw.split(';').map(c=>c.trim()).find(c=>c.startsWith('sid='));
  const token = sid ? sid.split('=')[1] : null;
  req.session = token ? (sessions.get(token) || null) : null;
  req._sessionToken = token;

  const url = req.url.split('?')[0];

  // Archivos estáticos
  if (req.method === 'GET' && !url.startsWith('/auth') && !url.startsWith('/admin') && !url.startsWith('/api')) {
    let filePath = url === '/' ? path.join(PUB_DIR, 'index.html') : path.join(PUB_DIR, url);
    if (!filePath.startsWith(PUB_DIR)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    return fs.createReadStream(path.join(PUB_DIR, 'index.html')).pipe(res);
  }

  let body = {};
  try { body = await readBody(req); } catch {}

  try {
    const handled = await route(req, res, body);
    if (handled === null) send(res, 404, { error: 'Ruta no encontrada' });
  } catch(e) {
    console.error('Error en ruta:', e.message);
    send(res, 500, { error: 'Error interno del servidor' });
  }
});

server.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  🧼  SimMkt v3.0 — Multi-Simulación  ·  UAGRM             ║`);
  console.log(`║  → http://localhost:${PORT}  (admin / admin123)                ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
});
