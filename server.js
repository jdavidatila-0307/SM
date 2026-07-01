/**
 * SIMULADOR DE MARKETING v3.0 — Multi-Simulación
 * Con persistencia PostgreSQL y soporte para múltiples profesores.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// FORZAR ACEPTACIÓN DE CERTIFICADOS SSL AUTOFIRMADOS (solo para este entorno)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { hashPassword, verifyPassword } = require('./src/auth');
const storage  = require('./src/storage');
const { ejecutarSimulador, calcularMercadoSegmentos, calcularPreSimulacion, normalizarDecision, sembrarSaldosIniciales } = require('./src/engine');
const { generarReportes } = require('./src/reports');
const { normalizarConfigExamenes, prepararEstadoHeredado } = require('./src/examenes.helpers');
const { validarInputInnovacion, calcularExamenInnovacion } = require('./src/examenes.innovacion');
const { validarInputMarketing, calcularExamenMarketing } = require('./src/examenes.marketing');
const { validarInputPublicidad, calcularExamenPublicidad } = require('./src/examenes.publicidad');
const { sanitizarAnalisisFinancieroSeleccion } = require('./src/examenes.finanzas');

const PORT = process.env.PORT || 3000;
console.log('[server] DATABASE_URL definida?', process.env.DATABASE_URL ? 'Sí' : 'No');
const PUB_DIR = path.join(__dirname, 'public');

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
  if (res.headersSent) {
    console.error(`⚠️ Intento de enviar respuesta ${status} después de que ya se enviaron los headers. Petición ignorada. URL: ${res.req?.url}`);
    return;
  }
  res.writeHead(status, { 'Content-Type':'application/json' });
  res.end(JSON.stringify(data));
}

// ── Middleware de sesión ─────────────────────────────────────
function getSession(req) {
  const raw = req.headers.cookie || '';
  const sid = raw.split(';').map(c=>c.trim()).find(c=>c.startsWith('sid='));
  const token = sid ? sid.split('=')[1] : null;
  return token ? sessions.get(token) : null;
}

// ── Función auxiliar para obtener la simulación actual ────────
async function getCurrentSimulation(session) {
  if (!session || !session.simulacionId) return null;

  // Los EQUIPOS no están en la tabla 'usuarios' — están en simulaciones.users JSONB.
  // Para equipos: obtener la simulación directamente por ID (ya tienen simulacionId en sesión).
  if (session.rol === 'equipo') {
    const sim = await storage.getSimulacion(session.simulacionId);
    return sim || null;
  }

  // Para admin / superadmin / profesor: verificar usuario + permisos de ownership
  const user = await storage.findUserById(session.userId);
  if (!user) return null;
  const ownerId = (user.rol === 'superadmin') ? null : session.userId;
  const sim = await storage.getSimulacion(session.simulacionId, ownerId);
  if (!sim) { session.simulacionId = null; return null; }
  return sim;
}

// ── Recálculo encadenado (lógica única compartida por los endpoints) ──
// Recalcula desde `inicio` hacia adelante: la ronda `inicio` se recomputa con sus
// decisiones TAL CUAL (ancla); cada ronda 'simulated' siguiente se re-siembra desde
// el resultado fresco de la anterior (engine.sembrarSaldosIniciales) y se recomputa.
// VERIFICA |descuadrePatrimonio| <= 0.01 EN MEMORIA antes de persistir cada ronda:
// si falla, no escribe esa ronda y se detiene. Idempotente. Devuelve { status, body }.
async function recalcularEnCadena(simId, inicio, ownerId) {
  const simToFix = await storage.getSimulacion(simId, ownerId);
  if (!simToFix) return { status: 404, body: { error: 'Simulación no encontrada o no autorizada' } };
  const rondas = simToFix.rondas || {};
  if (!rondas[String(inicio)]) return { status: 404, body: { error: `Ronda ${inicio} no existe` } };
  if (rondas[String(inicio)].estado !== 'simulated') {
    return { status: 400, body: { error: `Ronda ${inicio} no está simulada (estado: ${rondas[String(inicio)].estado})` } };
  }
  const simCfg = {
    params: simToFix.parametros, tiposProducto: simToFix.tipos_producto, canales: simToFix.canales,
    segmentos: simToFix.segmentos, afinidadMatrix: simToFix.afinidad_matrix, competenciaExterna: simToFix.competencia_externa,
  };
  const equipos = simToFix.users || [];
  const TOL = 0.01; // piso de redondeo aprobado (TAREA B)
  const rondasProcesadas = [], detalle = [];
  let detenidoEn = null, propagacionFinal = null, N = inicio, guard = 0;

  while (guard++ < 200) {
    const rondaData = rondas[String(N)];
    const decisiones = equipos.filter(eq => rondaData.decisiones?.[eq.id]).map(eq => ({ ...rondaData.decisiones[eq.id] }));
    if (!decisiones.length) { detenidoEn = { ronda: N, motivo: 'sin-decisiones' }; break; }

    let result;
    try { result = ejecutarSimulador(decisiones, simCfg); }
    catch (e) { return { status: 500, body: { error: e.message, rondasProcesadas, detalle } }; }

    // Verificar EN MEMORIA antes de persistir: |descuadrePatrimonio| <= 0.01.
    const verificacion = result.resultados.map(r => ({
      equipo: r.equipo, equipoNombre: r.equipoNombre,
      descuadrePatrimonio: r.descuadrePatrimonio,
      totalActivos: r.totalActivos, totalPasivos: r.totalPasivos, patrimonio: r.patrimonio,
      capitalContable: r.capitalContable, resultadoAcumulado: r.resultadoAcumulado,
      balanceOk: Math.abs(r.descuadrePatrimonio || 0) <= TOL,
    }));
    const fallo = verificacion.find(v => !v.balanceOk);
    if (fallo) {
      return { status: 422, body: {
        ok: false,
        error: `Balance no cuadra en ronda ${N}, equipo ${fallo.equipoNombre || fallo.equipo} (descuadrePatrimonio ${fallo.descuadrePatrimonio} Bs). No se escribió nada de esta ronda.`,
        falloEn: { ronda: N, ...fallo }, rondasProcesadas, detalle,
      } };
    }

    // Balance OK → persistir SOLO esta ronda (merge).
    const resultadosMap = { ...(rondaData.resultados || {}) };
    result.resultados.forEach(r => { resultadosMap[r.equipo] = r; });
    const reportes = {};
    for (const d of decisiones) {
      reportes[d.equipo] = generarReportes(d, result.mercadoSegmentos, result.atractivoEquipos, resultadosMap, simCfg);
    }
    await storage.updateRonda(simId, N, {
      mercadoSegmentos: result.mercadoSegmentos, atractivoEquipos: result.atractivoEquipos,
      dashboard: result.dashboard, resultados: resultadosMap, reportes,
    }, ownerId);
    rondasProcesadas.push(N);
    detalle.push({ ronda: N, balanceOk: true, verificacion });

    // Propagar saldos a la ronda siguiente (fuente única).
    const sigNum = N + 1;
    const rondaSig = rondas[String(sigNum)];
    if (!rondaSig || !rondaSig.decisiones) { detenidoEn = { ronda: N, motivo: 'cadena-completa' }; break; }
    const resMap = {};
    result.resultados.forEach(r => { resMap[r.equipo] = r; });
    let propagados = 0;
    for (const eq of equipos) {
      const decSig = rondaSig.decisiones[eq.id];
      const resAnt = resMap[eq.id];
      if (!decSig || !resAnt) continue;
      sembrarSaldosIniciales(decSig, resAnt, simCfg.params);
      propagados++;
    }
    await storage.updateRonda(simId, sigNum, { decisiones: rondaSig.decisiones }, ownerId);
    propagacionFinal = { ronda: sigNum, saldosPropagados: propagados };

    if (rondaSig.estado === 'simulated') { N = sigNum; continue; } // sigue la cadena
    detenidoEn = { ronda: sigNum, motivo: 'siguiente-no-simulada' }; // re-sembrada, no recalculada
    break;
  }

  return { status: 200, body: { ok: true, simId, rondaInicio: inicio, rondasProcesadas, detalle, detenidoEn, propagacionFinal } };
}

// ── Ruta principal ─────────────────────────────────────────────
function _ultimaRondaSimuladaAntesDe(sim, rondaActivacion) {
  const rondas = sim.rondas || {};
  return Object.keys(rondas)
    .map(n => parseInt(n, 10))
    .filter(n => Number.isFinite(n) && n < rondaActivacion && rondas[String(n)]?.estado === 'simulated')
    .sort((a, b) => a - b)
    .pop() || null;
}

function _examenInnovacionBase(estadoHeredado) {
  return {
    estadoHeredado,
    decisionExamen: {},
    justificacionEstrategica: '',
    analisisFinanciero: {
      impactoEstadoResultados: '',
      impactoBalanceGeneral: '',
      impactoFlujoCaja: '',
      kpisEsperados: '',
      riesgosFinancieros: '',
    },
    resultadoSimulado: {},
    rubrica: {},
    notaFinal: null,
    submitted: false,
    submittedAt: null,
  };
}

function _getExamenInnovacion(ronda, equipoId, estadoHeredado) {
  return {
    ..._examenInnovacionBase(estadoHeredado),
    ...(ronda.examenes?.innovacion?.[equipoId] || {}),
    estadoHeredado,
  };
}

async function _guardarExamenInnovacion(sim, rondaActivacion, equipoId, examen) {
  const ronda = await storage.getRonda(sim.id, rondaActivacion);
  if (!ronda) {
    const err = new Error('Ronda de activacion no encontrada');
    err.status = 404;
    throw err;
  }
  const examenes = {
    ...(ronda.examenes || {}),
    innovacion: {
      ...((ronda.examenes || {}).innovacion || {}),
      [equipoId]: examen,
    },
  };
  await storage.updateRonda(sim.id, rondaActivacion, { examenes });
}

function _examenMarketingBase(estadoHeredado) {
  return {
    estadoHeredado,
    decisionExamen: {},
    justificacionEstrategica: '',
    analisisFinanciero: {
      impactoEstadoResultados: '',
      impactoBalanceGeneral: '',
      impactoFlujoCaja: '',
      kpisEsperados: '',
      riesgosFinancieros: '',
    },
    resultadoSimulado: {},
    rubrica: {},
    notaFinal: null,
    tendencia: {},
    descomposicionMarketing: {},
    submitted: false,
    submittedAt: null,
  };
}

function _getExamenMarketing(ronda, equipoId, estadoHeredado) {
  return {
    ..._examenMarketingBase(estadoHeredado),
    ...(ronda.examenes?.marketing?.[equipoId] || {}),
    estadoHeredado,
  };
}

async function _guardarExamenMarketing(sim, rondaActivacion, equipoId, examen) {
  const ronda = await storage.getRonda(sim.id, rondaActivacion);
  if (!ronda) {
    const err = new Error('Ronda de activacion no encontrada');
    err.status = 404;
    throw err;
  }
  const examenes = {
    ...(ronda.examenes || {}),
    marketing: {
      ...((ronda.examenes || {}).marketing || {}),
      [equipoId]: examen,
    },
  };
  await storage.updateRonda(sim.id, rondaActivacion, { examenes });
}

function _examenPublicidadBase(estadoHeredado) {
  return {
    estadoHeredado,
    decisionExamen: {},
    justificacionEstrategica: '',
    analisisFinanciero: {
      impactoEstadoResultados: '',
      impactoBalanceGeneral: '',
      impactoFlujoCaja: '',
      kpisEsperados: '',
      riesgosFinancieros: '',
    },
    analisisFinancieroSeleccion: {
      version: 1,
      generadoAt: null,
      decisionHash: '',
      resultadoHash: '',
      opciones: [],
      opcionCorrecta: null,
      opcionSeleccionada: null,
      justificacionFinancieraBreve: '',
    },
    resultadoSimulado: {},
    rubrica: {},
    notaFinal: null,
    calificacionFinanciera: null,
    tendencia: {},
    descomposicionMarketing: {},
    submitted: false,
    submittedAt: null,
  };
}

function _sanitizarExamenPublicidadParaCliente(examen) {
  if (!examen) return examen;
  return {
    ...examen,
    analisisFinancieroSeleccion: sanitizarAnalisisFinancieroSeleccion(examen.analisisFinancieroSeleccion),
  };
}

function _getExamenPublicidad(ronda, equipoId, estadoHeredado) {
  return {
    ..._examenPublicidadBase(estadoHeredado),
    ...(ronda.examenes?.publicidad?.[equipoId] || {}),
    estadoHeredado,
  };
}

async function _guardarExamenPublicidad(sim, rondaActivacion, equipoId, examen) {
  const ronda = await storage.getRonda(sim.id, rondaActivacion);
  if (!ronda) {
    const err = new Error('Ronda de activacion no encontrada');
    err.status = 404;
    throw err;
  }
  const examenes = {
    ...(ronda.examenes || {}),
    publicidad: {
      ...((ronda.examenes || {}).publicidad || {}),
      [equipoId]: examen,
    },
  };
  await storage.updateRonda(sim.id, rondaActivacion, { examenes });
}

function _sendExamError(res, err) {
  return send(res, err.status || 500, { error: err.status ? err.message : 'Error interno del servidor' });
}

async function route(req, res, body) {
  const url    = req.url.split('?')[0];
  const method = req.method;
  const session = getSession(req);
  const s = session || null;

  const isAdmin = () => s?.rol === 'admin' || s?.rol === 'superadmin' || s?.rol === 'profesor';
  const isSuperAdmin = () => s?.rol === 'superadmin';
  const isEquipo = () => s?.rol === 'equipo';
  const needAdmin = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    if (!isAdmin()) { send(res, 403, { error: 'Acceso denegado' }); return true; }
    return false;
  };
  const needSuperAdmin = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    if (!isSuperAdmin()) { send(res, 403, { error: 'Acceso solo para superadmin' }); return true; }
    return false;
  };
  const needEquipo = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    if (!isEquipo()) { send(res, 403, { error: 'Solo para equipos' }); return true; }
    return false;
  };
  const needAuth = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    return false;
  };

  // ═══ VERSION (público — para verificar qué código corre en el deploy) ═══
  if (url === '/version' && method === 'GET') {
    const C = require('./src/constants');
    return send(res, 200, {
      commit: '3e62502',
      umbralSaturacionMkt: C.PARAMS.umbralSaturacionMkt,
      maxAportePublicidad: C.PARAMS.maxAportePublicidad,
      timestamp: new Date().toISOString(),
    });
  }

  // ═══ AUTH ════════════════════════════════════════════════════
  if (url === '/auth/login' && method === 'POST') {
    const { id, password } = body;
    if (!id || !password) return send(res, 400, { error: 'Credenciales requeridas' });
    const identifier = id.trim();
    console.log(`[LOGIN] intento | identifier: "${identifier}"`);

    // ── 1. Buscar en tabla 'usuarios' (superadmin, profesor) ──────
    let user = await storage.findUserByEmailOrId(identifier);
    let sessionSimulacionId = null;

    // ── 2. Si no encontrado, buscar equipo por nombre en simulaciones ──
    //    Necesario porque los equipos NO están en 'usuarios' y Render
    //    reinicia el servidor (perdiendo sesiones en memoria).
    if (!user) {
      const found = await storage.findEquipoByNombre(identifier);
      if (found) {
        user = {
          id:            found.equipo.id,
          nombre:        found.equipo.nombre,
          rol:           'equipo',
          password_hash: found.equipo.password,
        };
        sessionSimulacionId = found.simulacionId;
        console.log(`[LOGIN] equipo encontrado | id: ${user.id} | sim: ${sessionSimulacionId}`);
      }
    }

    if (!user) {
      console.log(`[LOGIN] 401 — no encontrado: "${identifier}"`);
      return send(res, 401, { error: 'Usuario o contraseña incorrectos' });
    }

    console.log(`[LOGIN] usuario encontrado | id: ${user.id} | rol: ${user.rol}`);

    if (!user.password_hash) {
      console.error(`[LOGIN] ERROR — password_hash NULL para ${user.id}`);
      return send(res, 500, { error: 'Error de configuración de cuenta. Contacta al administrador.' });
    }

    let ok = false;
    try {
      ok = verifyPassword(password, user.password_hash);
    } catch(e) {
      console.error(`[LOGIN] ERROR en verifyPassword | ${user.id} | ${e.message}`);
      return send(res, 500, { error: 'Error interno de verificación. Contacta al administrador.' });
    }

    if (!ok) {
      console.log(`[LOGIN] 401 — contraseña incorrecta | ${user.id}`);
      return send(res, 401, { error: 'Usuario o contraseña incorrectos' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
      userId:       user.id,
      nombre:       user.nombre,
      rol:          user.rol,
      simulacionId: sessionSimulacionId,   // null para admin, simId para equipo
      createdAt:    Date.now()
    });
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax`);
    console.log(`[LOGIN] éxito | id: ${user.id} | rol: ${user.rol}`);
    return send(res, 200, { ok: true, rol: user.rol, id: user.id, nombre: user.nombre });
  }

  if (url === '/auth/logout' && method === 'POST') {
    const token = getSession(req)?.token;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  if (url === '/auth/registro' && method === 'POST') {
    const { nombreEquipo, miembros, password, codigoSimulacion } = body;
    if (!nombreEquipo?.trim()) return send(res, 400, { error: 'Nombre del equipo requerido' });
    if (!password || password.length < 4) return send(res, 400, { error: 'Contraseña de al menos 4 caracteres' });
    if (!Array.isArray(miembros) || !miembros.length) return send(res, 400, { error: 'Al menos un integrante' });
    if (!codigoSimulacion?.trim()) return send(res, 400, { error: 'Código de simulación requerido' });
    const codigo = codigoSimulacion.trim().toUpperCase();
    const sims = await storage.listSimulaciones();
    const sim = sims.find(s => s.codigo_acceso === codigo && s.estado === 'activa');
    if (!sim) return send(res, 404, { error: `Código "${codigo}" no válido o simulación inactiva` });
    const simId = sim.id;
    for (let i = 0; i < miembros.length; i++) {
      const m = miembros[i];
      if (!m.apellidoPaterno?.trim()) return send(res, 400, { error: `Integrante ${i+1}: falta Apellido Paterno` });
      if (!m.apellidoMaterno?.trim()) return send(res, 400, { error: `Integrante ${i+1}: falta Apellido Materno` });
      if (!m.nombres?.trim())         return send(res, 400, { error: `Integrante ${i+1}: faltan Nombres` });
      if (!m.nroRegistro?.trim())     return send(res, 400, { error: `Integrante ${i+1}: falta Nro. Registro` });
    }
    const nombreLower = nombreEquipo.trim().toLowerCase();
    const equipos = await storage.getEquipos(simId);
    if (equipos.some(eq => eq.nombre.toLowerCase() === nombreLower))
      return send(res, 409, { error: `Ya existe el equipo "${nombreEquipo.trim()}" en esta simulación` });
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
    await storage.addEquipo(simId, equipo);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { userId: id, rol: 'equipo', simulacionId: simId, createdAt: Date.now() });
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax`);
    return send(res, 200, { ok: true, id, nombre: equipo.nombre, rol: 'equipo', passwordPlain: password,
      simulacionNombre: sim.nombre, codigoSimulacion: codigo });
  }

  if (url === '/auth/me' && method === 'GET') {
    console.log('[AUTH/ME] Petición recibida, sesión:', s ? 'activa' : 'no');
    if (needAuth()) return;
    console.log('[AUTH/ME] Usuario autenticado, rol:', s.rol);
    if (s.rol === 'equipo') {
      const sim = await storage.getSimulacion(s.simulacionId);
      const equipo = sim?.users?.find(u => u.id === s.userId);
      if (!equipo) return send(res, 401, { error: 'Sesión inválida' });
      return send(res, 200, { id: equipo.id, nombre: equipo.nombre, rol: equipo.rol, miembros: equipo.miembros||[],
        simulacionId: s.simulacionId });
    } else {
      const user = await storage.findUserById(s.userId);
      if (!user) return send(res, 401, { error: 'Sesión inválida' });
      return send(res, 200, { id: user.id, nombre: user.nombre, rol: user.rol, miembros: [] });
    }
  }

  if (url === '/auth/validar-codigo' && method === 'POST') {
    const { codigo } = body;
    if (!codigo) return send(res, 400, { error: 'Código requerido' });
    const sims = await storage.listSimulaciones();
    const sim = sims.find(s => s.codigo_acceso?.toUpperCase() === codigo.trim().toUpperCase() && s.estado === 'activa');
    if (!sim) return send(res, 200, { valido: false });
    return send(res, 200, { valido: true, nombre: sim.nombre, simId: sim.id });
  }

  // ═══ ADMIN — Gestión de Simulaciones ═════════════════════════
  if (url === '/admin/simulaciones' && method === 'GET') {
    if (needAdmin()) return;
    const user = await storage.findUserById(s.userId);
    let simulaciones;
    if (user.rol === 'superadmin') {
      simulaciones = await storage.listSimulaciones();
    } else {
      simulaciones = await storage.listSimulaciones(s.userId);
    }
    const out = await Promise.all(simulaciones.map(async sim => {
      const equipos = await storage.getEquipos(sim.id);
      return {
        id: sim.id, nombre: sim.nombre, descripcion: sim.descripcion||'',
        estado: sim.estado, creadaAt: sim.creada_at,
        codigoAcceso: sim.codigo_acceso,
        currentRound: sim.config?.currentRound || 1,
        totalRounds: sim.config?.totalRounds || 20,
        roundState: sim.config?.roundState || 'pending',
        totalEquipos: equipos.length,
      };
    }));
    return send(res, 200, out);
  }

  if (url === '/admin/simulaciones' && method === 'POST') {
    if (needAdmin()) return;
    const { nombre, descripcion, totalRounds, copyFromSimId } = body;
    if (!nombre?.trim()) return send(res, 400, { error: 'Nombre de simulación requerido' });
    const user = await storage.findUserById(s.userId);
    if (!user) return send(res, 401, { error: 'Sesión inválida. Vuelve a iniciar sesión.' });
    const ownerId = user.id;
    const simId = storage.genSimId();
    const codigoAcceso = storage.genCodigo();
    let baseSim = null;
    if (copyFromSimId) {
      baseSim = await storage.getSimulacion(copyFromSimId, user.rol !== 'superadmin' ? ownerId : null);
      if (!baseSim && user.rol === 'superadmin') baseSim = await storage.getSimulacion(copyFromSimId);
    }
    const simData = {
      id: simId,
      nombre,
      descripcion: descripcion || '',
      codigoAcceso,
      estado: 'activa',
      creadaAt: new Date().toISOString(),
      config: { currentRound: 1, totalRounds: totalRounds || 20, roundState: 'pending' },
      parametros: baseSim?.parametros || require('./src/constants').PARAMS,
      tiposProducto: baseSim?.tipos_producto || require('./src/constants').TIPOS_PRODUCTO,
      canales: baseSim?.canales || require('./src/constants').CANALES,
      segmentos: baseSim?.segmentos || require('./src/constants').SEGMENTOS,
      afinidadMatrix: baseSim?.afinidad_matrix || require('./src/constants').AFINIDAD_MATRIX,
      competenciaExterna: baseSim?.competencia_externa || require('./src/constants').COMPETENCIA_EXTERNA,
      rondas: {},
      users: [],
    };
    await storage.createSimulacion(ownerId, simData);
    return send(res, 200, { ok: true, simId, codigoAcceso });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+$/) && method === 'PUT') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    const updates = {};
    if (body.nombre !== undefined) updates.nombre = body.nombre.trim();
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion;
    if (body.estado !== undefined) updates.estado = body.estado;
    if (body.codigoAcceso !== undefined) updates.codigo_acceso = body.codigoAcceso.trim().toUpperCase();
    await storage.updateSimulacion(simId, updates, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+\/archivar$/) && method === 'POST') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    await storage.updateSimulacion(simId, { estado: 'archivada' }, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+\/activar$/) && method === 'POST') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    await storage.updateSimulacion(simId, { estado: 'activa' }, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+$/) && method === 'DELETE') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    await storage.deleteSimulacion(simId, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/seleccionar-sim' && method === 'POST') {
    if (needAdmin()) return;
    const { simId } = body;
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    const sess = sessions.get(req._sessionToken);
    if (sess) sess.simulacionId = simId;
    return send(res, 200, { ok: true, simId, nombre: sim.nombre });
  }

  // ═══ ADMIN — Gestión de profesores (solo superadmin) ════════
  if (url === '/admin/usuarios' && method === 'GET') {
    if (needSuperAdmin()) return;
    const profesores = await storage.listUsers('profesor');
    return send(res, 200, profesores);
  }

  if (url === '/admin/usuarios' && method === 'POST') {
    if (needSuperAdmin()) return;
    const { nombre, email, password } = body;
    if (!nombre || !email || !password) return send(res, 400, { error: 'Faltan datos' });
    const id = `prof_${Date.now().toString(36)}`;
    const hash = hashPassword(password);
    try {
      await storage.createUser(id, nombre, email, hash, password, 'profesor');
      console.log(`[PROFESOR] creado | id: ${id} | email: ${email}`);
    } catch(e) {
      console.error(`[PROFESOR] ERROR al crear | ${e.message}`);
      return send(res, 500, { error: `Error al guardar profesor: ${e.message}` });
    }
    // Devolver password_plain para que el panel lo muestre al superadmin
    return send(res, 200, { id, nombre, email, password_plain: password });
  }

  if (url.match(/^\/admin\/usuarios\/[^/]+$/) && method === 'DELETE') {
    if (needSuperAdmin()) return;
    const profId = url.split('/')[3];
    await storage.deleteUser(profId);
    return send(res, 200, { ok: true });
  }

  // ═══ Todas las rutas siguientes requieren contexto de simulación ═══
  const sim = await getCurrentSimulation(s);
  if (!sim && (s?.rol === 'superadmin' || s?.rol === 'profesor' || s?.rol === 'equipo')) {
    if (url.startsWith('/admin/') || url.startsWith('/api/')) {
      return send(res, 400, { error: 'Selecciona una simulación primero' });
    }
  }

  // ─── ADMIN — Equipos ─────────────────────────────────────────
  if (url === '/admin/equipos' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    const equipos = await storage.getEquipos(sim.id);
    const out = equipos.map(eq => {
      const dec = ronda?.decisiones[eq.id];
      return { id:eq.id, nombre:eq.nombre, miembros:eq.miembros||[],
        submitted:dec?.submitted||false, submittedAt:dec?.submittedAt||null,
        registradoAt:eq.registradoAt||null, passwordPlain:eq.passwordPlain||null };
    });
    return send(res, 200, out);
  }

  if (url === '/admin/equipos' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const { nombre, miembros, password } = body;
    if (!nombre || !password) return send(res, 400, { error: 'Nombre y contraseña requeridos' });
    const base = nombre.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const id = `eq_${Date.now().toString(36)}_${base}`;
    await storage.addEquipo(sim.id, { id, nombre, password:hashPassword(password), passwordPlain:password,
      rol:'equipo', miembros: Array.isArray(miembros)?miembros:[] });
    return send(res, 200, { ok: true, id, nombre });
  }

  if (url.match(/^\/admin\/equipos\/[^/]+\/reset-envio$/) && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (sim.config.roundState === 'simulated') return send(res, 400, { error: 'Ya simulada' });
    const dec = ronda.decisiones[eqId];
    if (!dec) return send(res, 404, { error: 'Sin decisiones' });
    dec.submitted = false; dec.submittedAt = null;
    await storage.updateRonda(sim.id, sim.config.currentRound, { decisiones: ronda.decisiones });
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/equipos\/[^/]+\/password$/) && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    const equipos = await storage.getEquipos(sim.id);
    const eq = equipos.find(e => e.id === eqId);
    if (!eq) return send(res, 404, { error: 'No encontrado' });
    eq.password = hashPassword(body.password);
    eq.passwordPlain = body.password;
    await storage.updateSimulacion(sim.id, { users: equipos });
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/equipos\/[^/]+$/) && method === 'DELETE') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    let equipos = await storage.getEquipos(sim.id);
    const idx = equipos.findIndex(e => e.id === eqId);
    if (idx === -1) return send(res, 404, { error: 'No encontrado' });
    equipos.splice(idx, 1);
    await storage.updateSimulacion(sim.id, { users: equipos });
    return send(res, 200, { ok: true });
  }

  // ─── ADMIN — Rondas ───────────────────────────────────────────
  if (url === '/admin/ronda' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const cfg = sim.config;
    const ronda = await storage.getRonda(sim.id, cfg.currentRound);
    const equipos = await storage.getEquipos(sim.id);
    const enviados = ronda ? equipos.filter(eq => ronda.decisiones[eq.id]?.submitted).length : 0;
    return send(res, 200, { currentRound:cfg.currentRound, totalRounds:cfg.totalRounds,
      roundState:cfg.roundState, total:equipos.length, enviados,
      abiertaAt:ronda?.abiertaAt, ejecutadaAt:ronda?.ejecutadaAt });
  }

  if (url === '/admin/ronda/activar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    if (sim.config.roundState !== 'pending') return send(res, 400, { error: 'No está pendiente' });
    sim.config.roundState = 'open';
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (ronda) ronda.estado = 'open';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    await storage.updateRonda(sim.id, sim.config.currentRound, { estado: 'open' });
    return send(res, 200, { ok: true, currentRound: sim.config.currentRound });
  }

  if (url === '/admin/ronda/cerrar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    if (sim.config.roundState !== 'open') return send(res, 400, { error: 'No está abierta' });
    sim.config.roundState = 'locked';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/ronda/pre-simular' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (!['open','locked'].includes(sim.config.roundState)) return send(res, 400, { error: 'Estado incorrecto' });
    if (ronda.estado === 'simulated') return send(res, 400, { error: 'Ya simulada' });
    const equipos = await storage.getEquipos(sim.id);
    const decisiones = equipos.filter(eq => ronda.decisiones[eq.id]).map(eq => ({...ronda.decisiones[eq.id]}));
    if (!decisiones.length) return send(res, 400, { error: 'Sin decisiones' });
    try {
      const simCfg = {
        params: sim.parametros,
        tiposProducto: sim.tipos_producto,
        canales: sim.canales,
        segmentos: sim.segmentos,
        afinidadMatrix: sim.afinidad_matrix,
        competenciaExterna: sim.competencia_externa
      };
      const preResult = calcularPreSimulacion(decisiones, simCfg);
      const preSimulacion = {};
      preResult.resultado.forEach(r => { preSimulacion[r.equipo] = { ...r, confirmado: false }; });
      await storage.updateRonda(sim.id, n, { preSimulacion, preSimMercado: preResult.mercadoSegmentos });
      sim.config.roundState = 'pre-sim';
      await storage.updateSimulacion(sim.id, { config: sim.config });
      return send(res, 200, { ok: true, equiposCalculados: preResult.resultado.length, detalle: preResult.resultado });
    } catch(e) { return send(res, 500, { error: e.message }); }
  }

  if (url === '/api/presim' && method === 'GET') {
    if (needAuth()) return;
    if (!sim) return send(res, 404, { error: 'Sin simulación' });
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda?.preSimulacion) return send(res, 404, { error: 'Sin datos de pre-simulación' });
    if (s.rol === 'superadmin' || s.rol === 'profesor') {
      const equipos = await storage.getEquipos(sim.id);
      const eqMap = {};
      equipos.forEach(eq => { eqMap[eq.id] = eq.nombre; });
      const detalle = Object.values(ronda.preSimulacion).map(r => ({...r, equipoNombre: eqMap[r.equipo]||r.equipo}));
      return send(res, 200, { roundState: sim.config.roundState, total: detalle.length,
        confirmados: detalle.filter(r=>r.confirmado).length, detalle, mercadoSegmentos: ronda.preSimMercado||[] });
    } else {
      const miDato = ronda.preSimulacion[s.userId];
      if (!miDato) return send(res, 404, { error: 'Sin datos para tu equipo' });
      return send(res, 200, { roundState: sim.config.roundState, presim: miDato, mercadoSegmentos: ronda.preSimMercado||[] });
    }
  }

  if (url === '/api/presim/confirmar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda?.preSimulacion) return send(res, 400, { error: 'Sin pre-simulación activa' });
    if (sim.config.roundState !== 'pre-sim') return send(res, 400, { error: 'No hay pre-simulación activa' });
    if (!ronda.preSimulacion[s.userId]) return send(res, 404, { error: 'Sin datos para tu equipo' });
    ronda.preSimulacion[s.userId].confirmado = true;
    ronda.preSimulacion[s.userId].confirmadoAt = new Date().toISOString();
    await storage.updateRonda(sim.id, sim.config.currentRound, { preSimulacion: ronda.preSimulacion });
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/presim\/forzar\/[^/]+$/) && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[4];
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda?.preSimulacion?.[eqId]) return send(res, 404, { error: 'Equipo no encontrado' });
    ronda.preSimulacion[eqId].confirmado = true;
    ronda.preSimulacion[eqId].forzadoPor = 'admin';
    ronda.preSimulacion[eqId].confirmadoAt = new Date().toISOString();
    await storage.updateRonda(sim.id, sim.config.currentRound, { preSimulacion: ronda.preSimulacion });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/presim/forzar-todos' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda?.preSimulacion) return send(res, 400, { error: 'Sin pre-simulación activa' });
    for (const r of Object.values(ronda.preSimulacion)) {
      if (!r.confirmado) { r.confirmado = true; r.forzadoPor = 'admin'; r.confirmadoAt = new Date().toISOString(); }
    }
    await storage.updateRonda(sim.id, sim.config.currentRound, { preSimulacion: ronda.preSimulacion });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/simular' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (ronda.estado === 'simulated') return send(res, 400, { error: 'Ya simulada' });
    if (!['open','locked','pre-sim'].includes(sim.config.roundState)) return send(res, 400, { error: 'Estado incorrecto' });
    if (sim.config.roundState === 'pre-sim') {
      const pendientes = Object.values(ronda.preSimulacion||{}).filter(r => !r.confirmado);
      if (pendientes.length > 0) return send(res, 400, { error: `Faltan ${pendientes.length} equipo(s) por confirmar.` });
    }
    const equipos = await storage.getEquipos(sim.id);
    if (!equipos.length) return send(res, 400, { error: 'Sin equipos' });
    const decisiones = equipos.filter(eq => ronda.decisiones[eq.id]).map(eq => ({...ronda.decisiones[eq.id]}));
    if (!decisiones.length) return send(res, 400, { error: 'Sin decisiones' });
    try {
      const simCfg = {
        params: sim.parametros,
        tiposProducto: sim.tipos_producto,
        canales: sim.canales,
        segmentos: sim.segmentos,
        afinidadMatrix: sim.afinidad_matrix,
        competenciaExterna: sim.competencia_externa
      };
      const result = ejecutarSimulador(decisiones, simCfg);
      ronda.estado = 'simulated';
      ronda.ejecutadaAt = new Date().toISOString();
      ronda.mercadoSegmentos = result.mercadoSegmentos;
      ronda.atractivoEquipos = result.atractivoEquipos;
      ronda.dashboard = result.dashboard;
      result.resultados.forEach(r => { ronda.resultados[r.equipo] = r; });
      const reportes = {};
      for (const d of decisiones) {
        reportes[d.equipo] = generarReportes(d, result.mercadoSegmentos, result.atractivoEquipos, ronda.resultados, simCfg);
      }
      ronda.reportes = reportes;
      sim.config.roundState = 'simulated';
      await storage.updateSimulacion(sim.id, { config: sim.config });
      await storage.updateRonda(sim.id, n, {
        estado: ronda.estado,
        ejecutadaAt: ronda.ejecutadaAt,
        mercadoSegmentos: ronda.mercadoSegmentos,
        atractivoEquipos: ronda.atractivoEquipos,
        dashboard: ronda.dashboard,
        resultados: ronda.resultados,
        reportes: ronda.reportes
      });
      return send(res, 200, { ok: true, ronda: n, equiposSimulados: decisiones.length });
    } catch(e) { return send(res, 500, { error: e.message }); }
  }

  if (url === '/admin/ronda/siguiente' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    if (sim.config.roundState !== 'simulated') return send(res, 400, { error: 'Simula primero' });
    const next = sim.config.currentRound + 1;
    if (next > sim.config.totalRounds) return send(res, 400, { error: 'Todas las rondas completadas' });
    sim.config.currentRound = next;
    sim.config.roundState = 'pending';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    await storage.ensureRonda(sim.id, next);
    return send(res, 200, { ok: true, currentRound: next });
  }

  if (url.match(/^\/admin\/resultados\/\d+$/) && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || ronda.estado !== 'simulated') return send(res, 404, { error: 'Sin resultados' });
    const equipos = await storage.getEquipos(sim.id);
    const eqMap = {};
    equipos.forEach(eq => { eqMap[eq.id] = eq.nombre; });
    const resultados = Object.values(ronda.resultados).map(r => ({...r, equipoNombre: eqMap[r.equipo]||r.equipo}));
    return send(res, 200, { ronda: n, estado: ronda.estado, ejecutadaAt: ronda.ejecutadaAt,
      resultados, mercadoSegmentos: ronda.mercadoSegmentos, dashboard: ronda.dashboard,
      tasas: {
        operativo: sim.parametros.tasaPrestamoOperativo,
        inversion: sim.parametros.tasaPrestamoInversion,
        sobregiro: sim.parametros.tasaSobregiro,
      } });
  }

  if (url === '/admin/historial' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const hist = [];
    for (let i = 1; i <= sim.config.currentRound; i++) {
      const r = await storage.getRonda(sim.id, i);
      if (!r) continue;
      const equipos = await storage.getEquipos(sim.id);
      hist.push({ ronda:i, estado:r.estado, ejecutadaAt:r.ejecutadaAt,
        enviados: equipos.filter(e => r.decisiones[e.id]?.submitted).length, total: equipos.length });
    }
    return send(res, 200, hist);
  }

  // ─── ADMIN — Examenes ─────────────────────────────────────
  if (url === '/admin/examenes' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    const config = normalizarConfigExamenes(sim.config);
    return send(res, 200, {
      currentRound: config.currentRound,
      totalRounds: config.totalRounds,
      roundState: config.roundState,
      examenes: config.examenes,
      rondasPractica: config.rondasPractica,
    });
  }

  if (url === '/admin/examenes/innovacion/activar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.innovacion;
      const currentRound = +config.currentRound;
      if (ex.activado) {
        return send(res, 400, { error: 'El examen de innovacion ya esta activado' });
      }
      if (currentRound < ex.habilitadoDesdeRonda) {
        return send(res, 400, { error: `El examen de innovacion se habilita desde la ronda ${ex.habilitadoDesdeRonda}` });
      }
      const rondaBase = _ultimaRondaSimuladaAntesDe(sim, currentRound);
      if (!rondaBase) {
        return send(res, 400, { error: 'No existe una ronda simulada anterior' });
      }
      ex.activado = true;
      ex.rondaActivacion = currentRound;
      await storage.updateSimulacion(sim.id, { config });
      return send(res, 200, { ok: true, tipo: 'innovacion', rondaActivacion: currentRound, rondaBase });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  // ─── ADMIN — Config ───────────────────────────────────────────
  if (url === '/admin/examenes/marketing/activar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.marketing;
      const currentRound = +config.currentRound;
      if (ex.activado) {
        return send(res, 400, { error: 'El examen de marketing ya esta activado' });
      }
      if (currentRound < ex.habilitadoDesdeRonda) {
        return send(res, 400, { error: `El examen de marketing se habilita desde la ronda ${ex.habilitadoDesdeRonda}` });
      }
      const rondaBase = _ultimaRondaSimuladaAntesDe(sim, currentRound);
      if (!rondaBase) {
        return send(res, 400, { error: 'No existe una ronda simulada anterior' });
      }
      ex.activado = true;
      ex.rondaActivacion = currentRound;
      await storage.updateSimulacion(sim.id, { config });
      return send(res, 200, { ok: true, tipo: 'marketing', rondaActivacion: currentRound, rondaBase });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  if (url === '/admin/examenes/publicidad/activar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.publicidad;
      const currentRound = +config.currentRound;
      if (ex.activado) {
        return send(res, 400, { error: 'El examen de publicidad ya esta activado' });
      }
      if (currentRound < ex.habilitadoDesdeRonda) {
        return send(res, 400, { error: `El examen de publicidad se habilita desde la ronda ${ex.habilitadoDesdeRonda}` });
      }
      const rondaBase = _ultimaRondaSimuladaAntesDe(sim, currentRound);
      if (!rondaBase) {
        return send(res, 400, { error: 'No existe una ronda simulada anterior' });
      }
      ex.activado = true;
      ex.rondaActivacion = currentRound;
      await storage.updateSimulacion(sim.id, { config });
      return send(res, 200, { ok: true, tipo: 'publicidad', rondaActivacion: currentRound, rondaBase });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  if (url === '/admin/config' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, {
      parametros: sim.parametros,
      tiposProducto: sim.tipos_producto,
      canales: sim.canales,
      segmentos: sim.segmentos,
      afinidadMatrix: sim.afinidad_matrix,
      competenciaExterna: sim.competencia_externa,
      mercadoSegmentos: calcularMercadoSegmentos(sim.parametros, sim.segmentos),
    });
  }

  if (url === '/admin/parametros' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { parametros } = body;
    if (!parametros) return send(res, 400, { error: 'Datos requeridos' });
    const newParams = { ...sim.parametros, ...parametros };
    await storage.updateSimulacion(sim.id, { parametros: newParams });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/tiposproducto' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { tiposProducto } = body;
    if (!tiposProducto) return send(res, 400, { error: 'Datos requeridos' });
    const newTipos = { ...sim.tipos_producto };
    for (const k of Object.keys(newTipos)) {
      if (tiposProducto[k]?.costoBase !== undefined) newTipos[k].costoBase = +tiposProducto[k].costoBase;
    }
    await storage.updateSimulacion(sim.id, { tipos_producto: newTipos });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/canales' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { canales } = body;
    if (!canales) return send(res, 400, { error: 'Datos requeridos' });
    const newCanales = { ...sim.canales };
    for (const k of Object.keys(newCanales)) {
      if (!canales[k]) continue;
      for (const f of ['costoAdicionalUnitario','comisionPct','factorImpactoVendedores','bonoAtractivo']) {
        if (canales[k][f] !== undefined) newCanales[k][f] = +canales[k][f];
      }
    }
    await storage.updateSimulacion(sim.id, { canales: newCanales });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/segmentos' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, sim.segmentos);
  }
  if (url === '/admin/segmentos' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { segmentos } = body;
    if (!Array.isArray(segmentos)) return send(res, 400, { error: 'Array requerido' });
    const newSegmentos = segmentos.map(s => ({
      nombre: String(s.nombre||'').trim(),
      demandaBase: +s.demandaBase,
      pctContrabando: +s.pctContrabando,
      indiceExterno: +s.indiceExterno,
      tendencia: String(s.tendencia||''),
      descripcion: String(s.descripcion||''),
    }));
    await storage.updateSimulacion(sim.id, { segmentos: newSegmentos });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/afinidad' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, sim.afinidad_matrix);
  }
  if (url === '/admin/afinidad' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { afinidadMatrix } = body;
    if (!afinidadMatrix) return send(res, 400, { error: 'Datos requeridos' });
    const newAfinidad = { ...sim.afinidad_matrix };
    for (const prod of Object.keys(newAfinidad)) {
      if (Array.isArray(afinidadMatrix[prod])) newAfinidad[prod] = afinidadMatrix[prod].map(v => +v);
    }
    await storage.updateSimulacion(sim.id, { afinidad_matrix: newAfinidad });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/competencia' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, sim.competencia_externa);
  }
  if (url === '/admin/competencia' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { competencia } = body;
    if (!Array.isArray(competencia)) return send(res, 400, { error: 'Array requerido' });
    const newCompetencia = competencia.map(c => ({
      segmento: String(c.segmento||''),
      nombre: String(c.nombre||''),
      precio: +c.precio,
      calidad: +c.calidad,
      marketing: +c.marketing,
      participacionRef: +c.participacionRef,
    }));
    await storage.updateSimulacion(sim.id, { competencia_externa: newCompetencia });
    return send(res, 200, { ok: true });
  }

  
  // ═══ RECALCULADOR ═══════════════
  // DEPRECATED: usar /admin/recalcular-completa (recálculo desde R1 con verificación
  // de balance |descuadrePatrimonio| <= 0.01 antes de persistir). Este endpoint NO
  // tiene gate de balance y aún lo referencia un botón del panel (public/app.js).
  // Se conserva por compatibilidad/reversión; ya usa la fuente única de propagación.
    if (url === '/admin/recalcular-simulacion' && method === 'POST') {
    if (needAdmin()) return;
    const { simId } = body;
    if (!simId) return send(res, 400, { error: 'simId requerido' });

    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const simToFix = await storage.getSimulacion(simId, ownerId);
    if (!simToFix) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });

    const simCfg = {
      params: simToFix.parametros,
      tiposProducto: simToFix.tipos_producto,
      canales: simToFix.canales,
      segmentos: simToFix.segmentos,
      afinidadMatrix: simToFix.afinidad_matrix,
      competenciaExterna: simToFix.competencia_externa
    };

    const rondas = simToFix.rondas || {};
    const equipos = simToFix.users || [];
    const resumen = [];

    // Ordenar rondas numéricamente
    const rondasOrdenadas = Object.entries(rondas)
      .filter(([, r]) => r.estado === 'simulated')
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

    // Variables para propagar saldos entre rondas
    let ultimosResultados = null; // guardará los resultados de la ronda anterior
    let ultimaRondaSimulada = null; // nº de la última ronda recalculada OK

    for (const [rondaNumStr, rondaData] of rondasOrdenadas) {
      const rondaNum = parseInt(rondaNumStr);
      // Reconstruir decisiones con saldos iniciales correctos
      const decisiones = [];
      for (const eq of equipos) {
        const dec = rondaData.decisiones[eq.id];
        if (!dec) continue;
        // Si hay resultados de la ronda anterior, sembrar saldos iniciales (fuente única)
        if (ultimosResultados && ultimosResultados[eq.id]) {
          sembrarSaldosIniciales(dec, ultimosResultados[eq.id], simCfg.params);
        }
        decisiones.push({ ...dec });
      }

      if (decisiones.length === 0) continue;

      try {
        const result = ejecutarSimulador(decisiones, simCfg);
        // Guardar resultados en la ronda
        rondaData.mercadoSegmentos = result.mercadoSegmentos;
        rondaData.atractivoEquipos = result.atractivoEquipos;
        rondaData.dashboard = result.dashboard;
        rondaData.resultados = {};
        result.resultados.forEach(r => { rondaData.resultados[r.equipo] = r; });

        const reportes = {};
        for (const d of decisiones) {
          reportes[d.equipo] = generarReportes(d, result.mercadoSegmentos, result.atractivoEquipos, rondaData.resultados, simCfg);
        }
        rondaData.reportes = reportes;

        // Persistir la ronda recalculada
        await storage.updateRonda(simId, rondaNum, rondaData, ownerId);

        // Guardar estos resultados para la siguiente iteración
        ultimosResultados = rondaData.resultados;
        ultimaRondaSimulada = rondaNum;
        resumen.push({ ronda: rondaNum, equipos: decisiones.length, ok: true });
      } catch (e) {
        resumen.push({ ronda: rondaNum, error: e.message });
      }
    }

    // ── Propagar saldos a la ronda ABIERTA siguiente ──────────────
    // El loop solo recalcula rondas 'simulated'. La ronda siguiente (open/pending)
    // tiene sus saldos iniciales sembrados por ensureRonda desde los resultados VIEJOS.
    // Hay que re-sembrarlos con ultimosResultados para no romper el encadenamiento.
    if (ultimosResultados && ultimaRondaSimulada !== null) {
      const siguienteNum = ultimaRondaSimulada + 1;
      const rondaSiguiente = rondas[String(siguienteNum)];
      if (rondaSiguiente && rondaSiguiente.estado !== 'simulated' && rondaSiguiente.decisiones) {
        let propagados = 0;
        for (const eq of equipos) {
          const decSig = rondaSiguiente.decisiones[eq.id];
          const resAnt = ultimosResultados[eq.id];
          if (!decSig || !resAnt) continue;
          sembrarSaldosIniciales(decSig, resAnt, simCfg.params); // fuente única
          propagados++;
        }
        if (propagados > 0) {
          await storage.updateRonda(simId, siguienteNum, { decisiones: rondaSiguiente.decisiones }, ownerId);
          resumen.push({ ronda: siguienteNum, saldosPropagados: propagados });
        }
      }
    }

    return send(res, 200, { ok: true, simId, rondasReparadas: resumen.length, detalle: resumen });
  }

  // ─── Recálculo COMPLETO desde Ronda 1 (botón del panel del profesor) ───
  // Alias explícito de la lógica encadenada con rondaInicio = 1. Verifica
  // |descuadrePatrimonio| <= 0.01 antes de persistir cada ronda; idempotente.
  if (url === '/admin/recalcular-completa' && method === 'POST') {
    if (needAdmin()) return;
    const { simId } = body;
    if (!simId) return send(res, 400, { error: 'simId requerido' });
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const { status, body: payload } = await recalcularEnCadena(simId, 1, ownerId);
    return send(res, status, payload);
  }

  // ─── Recálculo en CADENA desde rondaInicio (recálculo PARCIAL) ───
  // Misma lógica única que recalcular-completa, pero arrancando en una ronda
  // arbitraria (p.ej. fix quirúrgico VIVE5/R9). Verifica |descuadrePatrimonio| <= 0.01
  // antes de persistir cada ronda y se detiene al primer fallo.
  if (url === '/admin/recalcular-cadena' && method === 'POST') {
    if (needAdmin()) return;
    const { simId, rondaInicio } = body;
    if (!simId || rondaInicio == null) return send(res, 400, { error: 'simId y rondaInicio requeridos' });
    const inicio = parseInt(rondaInicio);
    if (!Number.isInteger(inicio) || inicio < 1) return send(res, 400, { error: 'rondaInicio inválida' });
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const { status, body: payload } = await recalcularEnCadena(simId, inicio, ownerId);
    return send(res, status, payload);
  }

  // ─── EQUIPO — Examenes ───────────────────────────────────────
  if (url === '/api/examenes' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    const config = normalizarConfigExamenes(sim.config);
    return send(res, 200, {
      currentRound: config.currentRound,
      roundState: config.roundState,
      examenes: {
        innovacion: config.examenes.innovacion,
        marketing: config.examenes.marketing,
        publicidad: config.examenes.publicidad,
      },
    });
  }

  if (url === '/api/examenes/innovacion' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const equipoId = s.userId;
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.innovacion;
      if (!ex.activado || !ex.rondaActivacion) {
        return send(res, 404, { error: 'Examen de innovacion no activado' });
      }
      const ronda = await storage.getRonda(sim.id, ex.rondaActivacion);
      if (!ronda) return send(res, 404, { error: 'Ronda de activacion no encontrada' });
      const estadoHeredado = prepararEstadoHeredado(sim, equipoId, ex.rondaActivacion);
      const examen = _getExamenInnovacion(ronda, equipoId, estadoHeredado);
      return send(res, 200, {
        tipo: 'innovacion',
        rondaActivacion: ex.rondaActivacion,
        examen,
      });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  if (url === '/api/examenes/innovacion/guardar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const equipoId = s.userId;
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.innovacion;
      if (!ex.activado || !ex.rondaActivacion) {
        return send(res, 404, { error: 'Examen de innovacion no activado' });
      }
      const ronda = await storage.getRonda(sim.id, ex.rondaActivacion);
      if (!ronda) return send(res, 404, { error: 'Ronda de activacion no encontrada' });
      const estadoHeredado = prepararEstadoHeredado(sim, equipoId, ex.rondaActivacion);
      const actual = _getExamenInnovacion(ronda, equipoId, estadoHeredado);
      if (actual.submitted) return send(res, 400, { error: 'El examen ya fue enviado' });
      const input = validarInputInnovacion(body, { enviar: false });
      const examen = {
        ...actual,
        decisionExamen: { ...(actual.decisionExamen || {}), ...input.decisionExamen },
        justificacionEstrategica: input.justificacionEstrategica,
        analisisFinanciero: input.analisisFinanciero,
        submitted: false,
        submittedAt: null,
      };
      await _guardarExamenInnovacion(sim, ex.rondaActivacion, equipoId, examen);
      return send(res, 200, { ok: true, examen });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  if (url === '/api/examenes/innovacion/enviar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const equipoId = s.userId;
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.innovacion;
      if (!ex.activado || !ex.rondaActivacion) {
        return send(res, 404, { error: 'Examen de innovacion no activado' });
      }
      const ronda = await storage.getRonda(sim.id, ex.rondaActivacion);
      if (!ronda) return send(res, 404, { error: 'Ronda de activacion no encontrada' });
      const estadoHeredado = prepararEstadoHeredado(sim, equipoId, ex.rondaActivacion);
      const actual = _getExamenInnovacion(ronda, equipoId, estadoHeredado);
      if (actual.submitted) return send(res, 400, { error: 'El examen ya fue enviado' });
      const parcial = validarInputInnovacion(body, { enviar: false });
      const combinado = {
        decisionExamen: { ...(actual.decisionExamen || {}), ...parcial.decisionExamen },
        justificacionEstrategica: parcial.justificacionEstrategica || actual.justificacionEstrategica,
        analisisFinanciero: {
          ...(actual.analisisFinanciero || {}),
          ...Object.fromEntries(Object.entries(parcial.analisisFinanciero || {}).filter(([, v]) => v)),
        },
      };
      const input = validarInputInnovacion(combinado, { enviar: true });
      const calculado = calcularExamenInnovacion({
        sim,
        equipoId,
        rondaActivacion: ex.rondaActivacion,
        estadoHeredado,
        input,
      });
      const examen = {
        ...actual,
        estadoHeredado,
        decisionExamen: calculado.decisionExamen,
        justificacionEstrategica: input.justificacionEstrategica,
        analisisFinanciero: input.analisisFinanciero,
        resultadoSimulado: calculado.resultadoSimulado,
        rubrica: calculado.rubrica,
        notaFinal: calculado.notaFinal,
        tendencia: calculado.tendencia,
        submitted: true,
        submittedAt: new Date().toISOString(),
      };
      await _guardarExamenInnovacion(sim, ex.rondaActivacion, equipoId, examen);
      return send(res, 200, { ok: true, examen });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  // ─── EQUIPO — Decisiones ──────────────────────────────────────
  if (url === '/api/examenes/marketing' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const equipoId = s.userId;
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.marketing;
      if (!ex.activado || !ex.rondaActivacion) {
        return send(res, 404, { error: 'Examen de marketing no activado' });
      }
      const ronda = await storage.getRonda(sim.id, ex.rondaActivacion);
      if (!ronda) return send(res, 404, { error: 'Ronda de activacion no encontrada' });
      const estadoHeredado = prepararEstadoHeredado(sim, equipoId, ex.rondaActivacion);
      const examen = _getExamenMarketing(ronda, equipoId, estadoHeredado);
      return send(res, 200, {
        tipo: 'marketing',
        rondaActivacion: ex.rondaActivacion,
        examen,
      });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  if (url === '/api/examenes/marketing/guardar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const equipoId = s.userId;
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.marketing;
      if (!ex.activado || !ex.rondaActivacion) {
        return send(res, 404, { error: 'Examen de marketing no activado' });
      }
      const ronda = await storage.getRonda(sim.id, ex.rondaActivacion);
      if (!ronda) return send(res, 404, { error: 'Ronda de activacion no encontrada' });
      const estadoHeredado = prepararEstadoHeredado(sim, equipoId, ex.rondaActivacion);
      const actual = _getExamenMarketing(ronda, equipoId, estadoHeredado);
      if (actual.submitted) return send(res, 400, { error: 'El examen ya fue enviado' });
      const input = validarInputMarketing(body, { enviar: false });
      const examen = {
        ...actual,
        decisionExamen: { ...(actual.decisionExamen || {}), ...input.decisionExamen },
        justificacionEstrategica: input.justificacionEstrategica,
        analisisFinanciero: input.analisisFinanciero,
        submitted: false,
        submittedAt: null,
      };
      await _guardarExamenMarketing(sim, ex.rondaActivacion, equipoId, examen);
      return send(res, 200, { ok: true, examen });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  if (url === '/api/examenes/marketing/enviar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const equipoId = s.userId;
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.marketing;
      if (!ex.activado || !ex.rondaActivacion) {
        return send(res, 404, { error: 'Examen de marketing no activado' });
      }
      const ronda = await storage.getRonda(sim.id, ex.rondaActivacion);
      if (!ronda) return send(res, 404, { error: 'Ronda de activacion no encontrada' });
      const estadoHeredado = prepararEstadoHeredado(sim, equipoId, ex.rondaActivacion);
      const actual = _getExamenMarketing(ronda, equipoId, estadoHeredado);
      if (actual.submitted) return send(res, 400, { error: 'El examen ya fue enviado' });
      const parcial = validarInputMarketing(body, { enviar: false });
      const combinado = {
        decisionExamen: { ...(actual.decisionExamen || {}), ...parcial.decisionExamen },
        justificacionEstrategica: parcial.justificacionEstrategica || actual.justificacionEstrategica,
        analisisFinanciero: {
          ...(actual.analisisFinanciero || {}),
          ...Object.fromEntries(Object.entries(parcial.analisisFinanciero || {}).filter(([, v]) => v)),
        },
      };
      const input = validarInputMarketing(combinado, { enviar: true });
      const calculado = calcularExamenMarketing({
        sim,
        equipoId,
        rondaActivacion: ex.rondaActivacion,
        estadoHeredado,
        input,
      });
      const examen = {
        ...actual,
        estadoHeredado,
        decisionExamen: calculado.decisionExamen,
        justificacionEstrategica: input.justificacionEstrategica,
        analisisFinanciero: input.analisisFinanciero,
        resultadoSimulado: calculado.resultadoSimulado,
        rubrica: calculado.rubrica,
        notaFinal: calculado.notaFinal,
        tendencia: calculado.tendencia,
        descomposicionMarketing: calculado.descomposicionMarketing,
        submitted: true,
        submittedAt: new Date().toISOString(),
      };
      await _guardarExamenMarketing(sim, ex.rondaActivacion, equipoId, examen);
      return send(res, 200, { ok: true, examen });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  if (url === '/api/examenes/publicidad' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const equipoId = s.userId;
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.publicidad;
      if (!ex.activado || !ex.rondaActivacion) {
        return send(res, 404, { error: 'Examen de publicidad no activado' });
      }
      const ronda = await storage.getRonda(sim.id, ex.rondaActivacion);
      if (!ronda) return send(res, 404, { error: 'Ronda de activacion no encontrada' });
      const estadoHeredado = prepararEstadoHeredado(sim, equipoId, ex.rondaActivacion);
      const examen = _getExamenPublicidad(ronda, equipoId, estadoHeredado);
      return send(res, 200, {
        tipo: 'publicidad',
        rondaActivacion: ex.rondaActivacion,
        examen: _sanitizarExamenPublicidadParaCliente(examen),
      });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  if (url === '/api/examenes/publicidad/guardar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const equipoId = s.userId;
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.publicidad;
      if (!ex.activado || !ex.rondaActivacion) {
        return send(res, 404, { error: 'Examen de publicidad no activado' });
      }
      const ronda = await storage.getRonda(sim.id, ex.rondaActivacion);
      if (!ronda) return send(res, 404, { error: 'Ronda de activacion no encontrada' });
      const estadoHeredado = prepararEstadoHeredado(sim, equipoId, ex.rondaActivacion);
      const actual = _getExamenPublicidad(ronda, equipoId, estadoHeredado);
      if (actual.submitted) return send(res, 400, { error: 'El examen ya fue enviado' });
      const input = validarInputPublicidad(body, { enviar: false });
      const calculado = calcularExamenPublicidad({
        sim,
        equipoId,
        rondaActivacion: ex.rondaActivacion,
        estadoHeredado,
        input: {
          ...input,
          decisionExamen: { ...(actual.decisionExamen || {}), ...input.decisionExamen },
        },
      });
      const examen = {
        ...actual,
        estadoHeredado,
        decisionExamen: calculado.decisionExamen,
        justificacionEstrategica: input.justificacionEstrategica,
        analisisFinanciero: input.analisisFinanciero,
        analisisFinancieroSeleccion: {
          ...calculado.analisisFinancieroSeleccion,
          opcionSeleccionada: actual.analisisFinancieroSeleccion?.decisionHash &&
            actual.analisisFinancieroSeleccion.decisionHash !== calculado.analisisFinancieroSeleccion.decisionHash
              ? null
              : calculado.analisisFinancieroSeleccion.opcionSeleccionada,
        },
        resultadoSimulado: calculado.resultadoSimulado,
        tendencia: calculado.tendencia,
        descomposicionMarketing: calculado.descomposicionMarketing,
        calificacionFinanciera: null,
        rubrica: {},
        notaFinal: null,
        submitted: false,
        submittedAt: null,
      };
      await _guardarExamenPublicidad(sim, ex.rondaActivacion, equipoId, examen);
      return send(res, 200, { ok: true, examen: _sanitizarExamenPublicidadParaCliente(examen) });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  if (url === '/api/examenes/publicidad/enviar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    try {
      const equipoId = s.userId;
      const config = normalizarConfigExamenes(sim.config);
      const ex = config.examenes.publicidad;
      if (!ex.activado || !ex.rondaActivacion) {
        return send(res, 404, { error: 'Examen de publicidad no activado' });
      }
      const ronda = await storage.getRonda(sim.id, ex.rondaActivacion);
      if (!ronda) return send(res, 404, { error: 'Ronda de activacion no encontrada' });
      const estadoHeredado = prepararEstadoHeredado(sim, equipoId, ex.rondaActivacion);
      const actual = _getExamenPublicidad(ronda, equipoId, estadoHeredado);
      if (actual.submitted) return send(res, 400, { error: 'El examen ya fue enviado' });
      const parcial = validarInputPublicidad(body, { enviar: false });
      const combinado = {
        decisionExamen: { ...(actual.decisionExamen || {}), ...parcial.decisionExamen },
        justificacionEstrategica: parcial.justificacionEstrategica || actual.justificacionEstrategica,
        analisisFinanciero: {
          ...(actual.analisisFinanciero || {}),
          ...Object.fromEntries(Object.entries(parcial.analisisFinanciero || {}).filter(([, v]) => v)),
        },
        analisisFinancieroSeleccion: parcial.analisisFinancieroSeleccion,
      };
      const input = validarInputPublicidad(combinado, { enviar: true });
      const calculado = calcularExamenPublicidad({
        sim,
        equipoId,
        rondaActivacion: ex.rondaActivacion,
        estadoHeredado,
        input,
      });
      if (!actual.analisisFinancieroSeleccion?.decisionHash ||
          actual.analisisFinancieroSeleccion.decisionHash !== calculado.analisisFinancieroSeleccion.decisionHash) {
        return send(res, 400, { error: 'Debe guardar borrador para generar escenarios financieros actualizados antes de enviar' });
      }
      const examen = {
        ...actual,
        estadoHeredado,
        decisionExamen: calculado.decisionExamen,
        justificacionEstrategica: input.justificacionEstrategica,
        analisisFinanciero: input.analisisFinanciero,
        analisisFinancieroSeleccion: calculado.analisisFinancieroSeleccion,
        resultadoSimulado: calculado.resultadoSimulado,
        rubrica: calculado.rubrica,
        notaFinal: calculado.notaFinal,
        calificacionFinanciera: calculado.calificacionFinanciera,
        tendencia: calculado.tendencia,
        descomposicionMarketing: calculado.descomposicionMarketing,
        submitted: true,
        submittedAt: new Date().toISOString(),
      };
      await _guardarExamenPublicidad(sim, ex.rondaActivacion, equipoId, examen);
      return send(res, 200, { ok: true, examen: _sanitizarExamenPublicidadParaCliente(examen) });
    } catch (e) {
      return _sendExamError(res, e);
    }
  }

  if (url === '/api/decisiones' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const n = sim.config.currentRound;
    let ronda = await storage.getRonda(sim.id, n);
    if (!ronda) {
      ronda = await storage.ensureRonda(sim.id, n);
    }
    if (!ronda.decisiones[equipoId]) {
      const equipos = await storage.getEquipos(sim.id);
      const eq = equipos.find(e => e.id === equipoId);
      ronda.decisiones[equipoId] = storage.defaultDecision(equipoId, eq?.nombre||equipoId, sim.parametros);
      await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });
    }
    const cfg = {
      params: sim.parametros,
      tiposProducto: sim.tipos_producto,
      canales: sim.canales,
      segmentos: sim.segmentos,
      afinidadMatrix: sim.afinidad_matrix,
      competenciaExterna: sim.competencia_externa
    };
    return send(res, 200, {
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
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (ronda.estado === 'simulated') return send(res, 400, { error: 'Ronda simulada' });
    if (sim.config.roundState === 'pending') return send(res, 400, { error: 'Ronda no habilitada' });

    // ★ VALIDACIÓN DE PRECIO: evita atractivos excesivamente negativos
    if (body.decision && body.decision.precioVenta > 20) {
      return send(res, 400, { error: 'El precio máximo permitido es de 20 Bs. Ajusta tu estrategia.' });
    }
    if (body.decision && body.decision.precioVenta <= 0) {
      return send(res, 400, { error: 'El precio de venta debe ser mayor a 0 Bs.' });
    }

    const cur = ronda.decisiones[equipoId] || {};
    // Normalizar nombres de catálogo antes de persistir
    const decNorm = normalizarDecision(
      { ...body.decision },
      sim.tipos_producto,
      sim.canales,
      sim.segmentos
    );
    ronda.decisiones[equipoId] = { ...cur, ...decNorm, equipo: equipoId, submitted: cur.submitted||false };
    await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });
    return send(res, 200, { ok: true });
  }

  if (url === '/api/decisiones/enviar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (ronda.estado === 'simulated') return send(res, 400, { error: 'Ronda simulada' });
    if (sim.config.roundState === 'pending') return send(res, 400, { error: 'Ronda no habilitada' });

    // ★ VALIDACIÓN DE PRECIO: evita atractivos excesivamente negativos
    if (body.decision && body.decision.precioVenta > 20) {
      return send(res, 400, { error: 'El precio máximo permitido es de 20 Bs. Ajusta tu estrategia.' });
    }
    if (body.decision && body.decision.precioVenta <= 0) {
      return send(res, 400, { error: 'El precio de venta debe ser mayor a 0 Bs.' });
    }

    const cur = ronda.decisiones[equipoId] || {};
    // Normalizar nombres de catálogo antes de persistir
    const decNorm = normalizarDecision(
      { ...body.decision },
      sim.tipos_producto,
      sim.canales,
      sim.segmentos
    );
    ronda.decisiones[equipoId] = { ...cur, ...decNorm, equipo: equipoId, submitted: true, submittedAt: new Date().toISOString() };
    await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });
    return send(res, 200, { ok: true });
  }

  if (url === '/api/resultados' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const historial = [];
    for (let i = 1; i <= sim.config.currentRound; i++) {
      const r = await storage.getRonda(sim.id, i);
      if (!r || r.estado !== 'simulated') continue;
      const resultado = r.resultados[equipoId];
      if (!resultado) continue;
      historial.push({ ronda:i, ejecutadaAt:r.ejecutadaAt, resultado,
        decision: r.decisiones?.[equipoId]||null, reportes: r.reportes?.[equipoId]||{} });
    }
    return send(res, 200, {
      currentRound: sim.config.currentRound, roundState: sim.config.roundState, historial,
      tasas: {
        operativo: sim.parametros.tasaPrestamoOperativo,
        inversion: sim.parametros.tasaPrestamoInversion,
        sobregiro: sim.parametros.tasaSobregiro,
      },
    });
  }

  if (url.match(/^\/api\/reportes\/\d+$/) && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || ronda.estado !== 'simulated') return send(res, 404, { error: 'Sin resultados' });
    return send(res, 200, { ronda: n, reportes: ronda.reportes?.[s.userId]||{} });
  }

  if (url.match(/^\/api\/dashboard\/\d+$/) && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || ronda.estado !== 'simulated') return send(res, 404, { error: 'Sin resultados' });
    const resultados = Object.values(ronda.resultados);
    const sorted = resultados.sort((a,b) => b.utilidadNeta - a.utilidadNeta);
    const ranking = sorted.map(r => ({ esYo: r.equipo===s.userId, utilidadNeta:r.utilidadNeta, ventas:r.ventasReales, share:r.shareReal, caja:r.cajaFinal }));
    const ebits = resultados.map(r => r.utilidadNeta);
    return send(res, 200, { ronda: n, ranking, stats: { ebitPromedio: ebits.reduce((a,b)=>a+b,0)/ebits.length, totalEquipos: ebits.length } });
  }

  if (url.match(/^\/api\/posicionamiento\/\d+$/) && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || ronda.estado !== 'simulated') return send(res, 404, { error: 'Sin resultados' });
    // TODO futuro: condicionar este endpoint a una inversión en
    // investigación de mercado (campo tipoInvestigacion o nuevo campo
    // inversionInvestigacionMercado), siguiendo el modelo de Markstrat
    // donde la información competitiva tiene un costo.
    // Orden estable por id → etiqueta "Competidor N" consistente entre rondas.
    // Nunca se expone r.equipo (id real) de otros equipos al estudiante.
    const resultados = Object.values(ronda.resultados)
      .sort((a,b) => String(a.equipo).localeCompare(String(b.equipo)));
    let comp = 0;
    const puntos = resultados.map(r => {
      const esYo = r.equipo === s.userId;
      if (!esYo) comp++;
      return {
        esYo,
        label: esYo ? 'Tu equipo' : `Competidor ${comp}`,
        precioVenta: r.precioVenta,
        calidad:     r.calidad,
        shareReal:   r.shareReal,
        atractivo:   r.atractivo,
        segmento:    r.segmento,
      };
    });
    return send(res, 200, { ronda: n, puntos });
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  🧼  SimMkt v3.0 — Multi-Simulación  ·  UAGRM             ║`);
  console.log(`║  → http://localhost:${PORT}  (admin / admin123)                ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
});
