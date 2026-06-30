'use strict';
// ─────────────────────────────────────────────────────────────
//  SIMULADOR MARKETING — FRONTEND UNIFICADO
//  Maneja: Login · Admin · Equipo
// ─────────────────────────────────────────────────────────────

const fmt = {
  bs:  v => `Bs ${(+v||0).toLocaleString('es-BO',{maximumFractionDigits:0})}`,
  num: v => (+v||0).toLocaleString('es-BO',{maximumFractionDigits:0}),
  pct: v => `${((+v||0)*100).toFixed(2)}%`,
  d:   (v,n=2) => (+v||0).toFixed(n),
  dt:  s => s ? new Date(s).toLocaleString('es-BO',{dateStyle:'short',timeStyle:'short'}) : '—',
};

let charts = {};
let state = { me: null, ref: null, decisiones: null, resultados: null };

// ── Utilidades globales de contraseña ──────────────────────
window.toggleInputPw = (inputId, btn) => {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const isHidden = inp.type === 'password';
  inp.type = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? '🔒' : '👁';
  btn.title = isHidden ? 'Ocultar' : 'Mostrar/ocultar';
};

// ── Toast ──────────────────────────────────────────────────
function toast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 3000);
}

// ── API ────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Error de red');
  return data;
}

// ── Screens ────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.style.display = 'none';
    s.classList.add('hidden');
  });
  const s = document.getElementById(id);
  s.style.display = 'flex';
  s.classList.remove('hidden');
}

// ── Nav (views inside a screen) ────────────────────────────
function setupNav(screenId) {
  const screen = document.getElementById(screenId);
  screen.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      screen.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      screen.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(btn.dataset.view)?.classList.add('active');
      const titles = {
        'admin-simulaciones':'Simulaciones', 'admin-dashboard':'Dashboard', 'admin-equipos':'Equipos',
        'admin-rondas':'Control de Rondas', 'admin-resultados':'Resultados',
        'admin-mercado':'Mercado', 'admin-parametros':'Parámetros',
        'admin-segmentos':'Segmentos',
        'eq-hoja':'Hoja de Decisión', 'eq-financiero':'Estados Financieros',
        'eq-resultados':'KPIs', 'eq-creditos':'Mis Créditos', 'eq-reportes':'Investigación y Ranking',
        'admin-creditos':'Reporte de Créditos', 'admin-afinidad':'Matriz de Afinidad', 'admin-competencia':'Competencia Externa',
        'admin-posicionamiento':'Mapa de Posicionamiento', 'eq-posicionamiento':'Mapa de Posicionamiento',
      };
      const tt = document.getElementById(screenId === 'screen-admin' ? 'adminTopTitle' : 'equipoTopTitle');
      if (tt) tt.textContent = titles[btn.dataset.view] || '';
      if (btn.dataset.view === 'admin-simulaciones') loadAdminSimulaciones();
      if (btn.dataset.view === 'eq-hoja') loadHojaDecision();
      if (btn.dataset.view === 'eq-financiero') loadEquipoFinanciero();
      if (btn.dataset.view === 'eq-resultados') loadEquipoResultados();
      if (btn.dataset.view === 'eq-creditos') loadEquipoCreditos();
      if (btn.dataset.view === 'eq-posicionamiento') loadEquipoPosicionamiento();
      if (btn.dataset.view === 'eq-reportes') loadEquipoReportes();
      if (btn.dataset.view === 'eq-dashboard') loadEquipoDashboard();
      if (btn.dataset.view === 'admin-afinidad') loadAdminAfinidad();
      if (btn.dataset.view === 'admin-competencia') loadAdminCompetencia();
      if (btn.dataset.view === 'admin-creditos') loadAdminCreditos();
      if (btn.dataset.view === 'admin-posicionamiento') loadAdminPosicionamiento();
      if (btn.dataset.view === 'admin-dashboard') loadAdminDashboard();
      if (btn.dataset.view === 'admin-equipos') loadAdminEquipos();
      if (btn.dataset.view === 'admin-rondas') loadAdminRondas();
      if (btn.dataset.view === 'admin-resultados') loadAdminResultados();
      if (btn.dataset.view === 'admin-mercado') loadAdminMercado();
      if (btn.dataset.view === 'admin-parametros') loadAdminParametros();
      if (btn.dataset.view === 'admin-segmentos') loadAdminSegmentos();
      if (btn.dataset.view === 'admin-profesores') loadAdminProfesores();
      if (btn.dataset.view === 'eq-manual') { buildManual(); }
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════
function initLogin() {
  document.getElementById('loginId').addEventListener('keydown', e => e.key==='Enter' && doLogin());
  document.getElementById('loginPass').addEventListener('keydown', e => e.key==='Enter' && doLogin());
  document.getElementById('btnLogin').addEventListener('click', doLogin);
  const btnManual = document.getElementById('btnVerManualLogin');
  if (btnManual) btnManual.addEventListener('click', buildManual);
  initRegistroUI();
}

async function doLogin() {
  const id   = document.getElementById('loginId').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl  = document.getElementById('loginError');
  const hintEl = document.getElementById('loginHint');
  errEl.textContent = '';
  if (hintEl) hintEl.style.display = 'none';
  const btn = document.getElementById('btnLogin');
  btn.textContent = 'Ingresando...'; btn.disabled = true;
  try {
    const data = await api('POST','/auth/login',{id,password:pass});
    state.me = data;
    if (data.rol === 'admin' || data.rol === 'superadmin' || data.rol === 'profesor') await initAdmin();
    else await initEquipo();
  } catch(e) {
    errEl.textContent = e.message;
    // BUG #5 CORREGIDO: hint contextual si el identificador no parece email
    if (hintEl && !id.includes('@') && e.message.toLowerCase().includes('contraseña')) {
      hintEl.textContent = '💡 ¿Eres profesor? Intenta ingresar con tu correo electrónico.';
      hintEl.style.display = 'block';
    }
  } finally {
    btn.textContent = 'Ingresar →'; btn.disabled = false;
  }
}

// ── Registro ───────────────────────────────────────────────
let numMiembros = 0;

function buildMiembroRow(idx) {
  return `
    <div class="miembro-row" id="miembro_${idx}">
      <div class="miembro-header">
        <span class="miembro-num">Integrante ${idx + 1}</span>
        ${idx > 0 ? `<button class="btn btn-ghost btn-sm btn-remove-miembro" data-idx="${idx}">✕ Quitar</button>` : ''}
      </div>
      <div class="miembro-grid">
        <div class="form-group">
          <label class="form-label">Apellido Paterno <span class="req">*</span></label>
          <input class="form-input" data-miembro="${idx}" data-campo="apellidoPaterno" placeholder="Ej: García"/>
        </div>
        <div class="form-group">
          <label class="form-label">Apellido Materno <span class="req">*</span></label>
          <input class="form-input" data-miembro="${idx}" data-campo="apellidoMaterno" placeholder="Ej: López"/>
        </div>
        <div class="form-group" style="grid-column:span 2">
          <label class="form-label">Nombres <span class="req">*</span></label>
          <input class="form-input" data-miembro="${idx}" data-campo="nombres" placeholder="Ej: Juan Carlos"/>
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input class="form-input" data-miembro="${idx}" data-campo="telefono" placeholder="Ej: 70012345" type="tel"/>
        </div>
        <div class="form-group">
          <label class="form-label">Nro. de Registro <span class="req">*</span></label>
          <input class="form-input" data-miembro="${idx}" data-campo="nroRegistro" placeholder="Ej: 20210345"/>
        </div>
      </div>
    </div>`;
}

function addMiembroRow() {
  if (numMiembros >= 5) { toast('Máximo 5 integrantes por equipo', 'info'); return; }
  const container = document.getElementById('miembrosContainer');
  const div = document.createElement('div');
  div.innerHTML = buildMiembroRow(numMiembros);
  container.appendChild(div.firstElementChild);
  numMiembros++;
  // bind remove buttons
  container.querySelectorAll('.btn-remove-miembro').forEach(btn => {
    btn.onclick = () => {
      document.getElementById(`miembro_${btn.dataset.idx}`)?.remove();
    };
  });
}

function getMiembrosData() {
  const container = document.getElementById('miembrosContainer');
  const rows = container.querySelectorAll('.miembro-row');
  return Array.from(rows).map(row => {
    const get = campo => row.querySelector(`[data-campo="${campo}"]`)?.value?.trim() || '';
    return {
      apellidoPaterno: get('apellidoPaterno'),
      apellidoMaterno: get('apellidoMaterno'),
      nombres:         get('nombres'),
      telefono:        get('telefono'),
      nroRegistro:     get('nroRegistro'),
    };
  });
}

// Pantalla de confirmación de credenciales post-registro
function showCredencialesConfirmacion(nombre, loginNombre, passwordTexto, onContinue) {
  const card = document.getElementById('cardRegistro');
  card.innerHTML = `
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:48px;margin-bottom:8px">✅</div>
      <h2 style="font-size:1.1rem;font-weight:700;color:var(--accent5)">¡Equipo registrado!</h2>
      <p style="font-size:.84rem;color:var(--text2);margin-top:6px">${nombre}</p>
    </div>

    <div style="background:rgba(255,209,102,.08);border:2px solid rgba(255,209,102,.4);border-radius:var(--r-lg);padding:20px;margin-bottom:16px">
      <p style="font-family:var(--font-mono);font-size:.68rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">⚠ GUARDA ESTOS DATOS — LOS NECESITAS PARA REINGRESAR</p>

      <div style="margin-bottom:12px">
        <label style="font-size:.74rem;color:var(--text3);display:block;margin-bottom:4px">Para ingresar usa:</label>
        <div style="display:flex;align-items:center;gap:8px">
          <input readonly style="flex:1;padding:8px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);color:var(--accent3);font-family:var(--font-mono);font-size:.9rem;font-weight:700" value="${loginNombre}" id="credNombre"/>
          <button class="btn btn-ghost btn-sm" onclick="copiarCred('credNombre','nombre')">📋</button>
        </div>
        <p style="font-size:.7rem;color:var(--text3);margin-top:4px">Puedes ingresar con el nombre de tu equipo</p>
      </div>

      <div>
        <label style="font-size:.74rem;color:var(--text3);display:block;margin-bottom:4px">Contraseña:</label>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="pw-input-wrap" style="flex:1">
            <input readonly id="credPass" type="password" style="width:100%;padding:8px 36px 8px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);color:var(--text);font-family:var(--font-mono);font-size:.9rem" value="${passwordTexto}"/>
            <button type="button" class="btn-eye-input" onclick="toggleInputPw('credPass',this)">👁</button>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="copiarCred('credPass','contraseña')">📋</button>
        </div>
      </div>
    </div>

    <p style="font-size:.78rem;color:var(--text3);text-align:center;margin-bottom:16px">
      Anota o fotografía estos datos ahora.<br>El profesor también puede verlos en su panel de administración.
    </p>

    <button class="btn btn-success btn-full" id="btnEntrarSimulador">Entrar al Simulador →</button>
  `;

  document.getElementById('btnEntrarSimulador').addEventListener('click', () => {
    onContinue();
  });
}

window.copiarCred = (inputId, label) => {
  const el = document.getElementById(inputId);
  if (!el) return;
  const val = el.value;
  navigator.clipboard?.writeText(val).then(() => {
    toast(`✓ ${label} copiado al portapapeles`, 'success');
  }).catch(() => {
    // fallback para contextos sin clipboard API
    el.type = 'text';
    el.select();
    document.execCommand('copy');
    toast(`✓ ${label} copiado`, 'success');
  });
};
function initRegistroUI() {
  // Mostrar/ocultar cards
  document.getElementById('btnIrRegistro').addEventListener('click', () => {
    document.getElementById('cardLogin').style.display = 'none';
    document.getElementById('cardRegistro').style.display = 'block';
    if (numMiembros === 0) { addMiembroRow(); } // primer integrante
  });
  document.getElementById('btnVolverLogin').addEventListener('click', () => {
    document.getElementById('cardRegistro').style.display = 'none';
    document.getElementById('cardLogin').style.display = 'block';
  });
  document.getElementById('btnAgregarMiembro').addEventListener('click', addMiembroRow);
  document.getElementById('btnRegistrar').addEventListener('click', doRegistro);
  document.getElementById('regPassword').addEventListener('keydown', e => e.key==='Enter' && doRegistro());
}

// ── Validar código de simulación en tiempo real ─────────────
let _codigoTimer = null;
window.validarCodigo = (val) => {
  const el = document.getElementById('codigoStatus');
  if (!el) return;
  clearTimeout(_codigoTimer);
  if (val.length < 4) { el.textContent = ''; return; }
  _codigoTimer = setTimeout(async () => {
    try {
      const r = await api('POST','/auth/validar-codigo',{codigo:val});
      el.innerHTML = r.valido
        ? `<span style="color:var(--accent5)">✓ Simulación encontrada: <strong>${r.nombre}</strong></span>`
        : `<span style="color:var(--accent4)">✗ Código no válido o simulación archivada</span>`;
    } catch { el.textContent = ''; }
  }, 400);
};

async function doRegistro() {
  const errEl = document.getElementById('registroError');
  errEl.textContent = '';
  const nombreEquipo    = document.getElementById('regNombreEquipo').value.trim();
  const password        = document.getElementById('regPassword').value;
  const passwordConf    = document.getElementById('regPasswordConfirm').value;
  const codigoSimulacion= (document.getElementById('regCodigo')?.value||'').trim().toUpperCase();
  const miembros        = getMiembrosData();

  if (!nombreEquipo)             return errEl.textContent = 'El nombre del equipo es requerido.';
  if (!password)                 return errEl.textContent = 'La contraseña es requerida.';
  if (password.length < 4)       return errEl.textContent = 'La contraseña debe tener al menos 4 caracteres.';
  if (password !== passwordConf) return errEl.textContent = 'Las contraseñas no coinciden.';
  if (!codigoSimulacion)         return errEl.textContent = 'El código de simulación es requerido. Solicítalo a tu profesor.';

  const btn = document.getElementById('btnRegistrar');
  btn.textContent = 'Registrando...'; btn.disabled = true;
  try {
    const data = await api('POST', '/auth/registro', { nombreEquipo, miembros, password, codigoSimulacion });
    state.me = data;
    showCredencialesConfirmacion(data.nombre, data.nombre, data.passwordPlain || password, () => {
      initEquipo();
    });
  } catch(e) {
    errEl.textContent = e.message;
    btn.textContent = '✓ Registrar Equipo'; btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════
async function initAdmin() {
  showScreen('screen-admin');
  setupNav('screen-admin');
  document.getElementById('btnAdminLogout').addEventListener('click', doLogout);
  // Mostrar gestión de simulaciones como pantalla de inicio
  await loadAdminSimulaciones();
}

// ── Admin Simulaciones ─────────────────────────────────────
async function loadAdminSimulaciones() {
  const el = document.getElementById('adminSimulacionesContent');
  if (!el) return;
  el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>`;
  try {
    const sims = await api('GET','/admin/simulaciones');
    const activas   = sims.filter(s=>s.estado==='activa');
    const archivadas = sims.filter(s=>s.estado==='archivada');

    const simCard = (sim) => {
      const stateColors = {pending:'var(--text3)',open:'var(--accent5)',locked:'var(--accent3)','pre-sim':'var(--accent3)',simulated:'var(--accent2)'};
      const stateLabels = {pending:'⏸ Pendiente',open:'🟢 Abierta',locked:'🔒 Cerrada','pre-sim':'📊 Pre-sim','simulated':'✅ Simulada'};
      return `
        <div class="result-round-card" style="margin-bottom:14px">
          <div class="result-round-header" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div>
              <h3 style="margin:0">${sim.nombre}</h3>
              ${sim.descripcion?`<div style="font-size:.76rem;color:var(--text3);margin-top:2px">${sim.descripcion}</div>`:''}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="badge ${sim.estado==='activa'?'badge-ok':'badge-pending'}">${sim.estado==='activa'?'✅ Activa':'📦 Archivada'}</span>
              <span style="font-size:.74rem;font-family:var(--font-mono);color:${stateColors[sim.roundState]||'var(--text3)'}">${stateLabels[sim.roundState]||sim.roundState}</span>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
            <div style="padding:10px 16px;border-right:1px solid var(--border)"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Equipos</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;margin-top:3px">${sim.totalEquipos}</div></div>
            <div style="padding:10px 16px;border-right:1px solid var(--border)"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Ronda actual</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;margin-top:3px">${sim.currentRound}/${sim.totalRounds}</div></div>
            <div style="padding:10px 16px;border-right:1px solid var(--border)"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Código de acceso</div><div style="font-family:var(--font-mono);font-size:.9rem;font-weight:700;margin-top:3px;color:var(--accent3);letter-spacing:2px">${sim.codigoAcceso||'—'}</div></div>
            <div style="padding:10px 16px"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Creada</div><div style="font-size:.78rem;margin-top:3px">${sim.creadaAt?new Date(sim.creadaAt).toLocaleDateString('es-BO'):'-'}</div></div>
          </div>
          <div style="padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap">
             ${sim.estado==='activa'
              ? `<button class="btn btn-success btn-sm" onclick="seleccionarSim('${sim.id}','${sim.nombre.replace(/'/g,"\\'")}')">▶ Acceder a esta simulación</button>
                 <button class="btn btn-ghost btn-sm" onclick="copiarCodigo('${sim.codigoAcceso||''}')">📋 Copiar código</button>
                 <button class="btn btn-ghost btn-sm" onclick="archivarSim('${sim.id}')">📦 Archivar</button>
                 <button class="btn btn-ghost btn-sm" onclick="recalcularSimulacion('${sim.id}','${sim.nombre.replace(/'/g,"\\'")}')" title="Recálculo completo desde R1 con verificación de balance (descuadrePatrimonio ≤ 0.01)">🔄 Recalcular</button>
                 <button class="btn btn-ghost btn-sm" onclick="eliminarSim('${sim.id}','${sim.nombre.replace(/'/g,"\\'")}')" style="color:var(--accent4)">✕ Eliminar</button>`
              : `<button class="btn btn-ghost btn-sm" onclick="activarSim('${sim.id}')">♻ Reactivar</button>
                 <button class="btn btn-ghost btn-sm" onclick="recalcularSimulacion('${sim.id}','${sim.nombre.replace(/'/g,"\\'")}')" title="Recálculo completo desde R1 con verificación de balance (descuadrePatrimonio ≤ 0.01)">🔄 Recalcular</button>
                 <button class="btn btn-ghost btn-sm" onclick="eliminarSim('${sim.id}','${sim.nombre.replace(/'/g,"\\'")}')" style="color:var(--accent4)">✕ Eliminar</button>`}
          </div>
        </div>`;
    };
    
    el.innerHTML = `
      <div class="section-header">
        <h2>🎮 Gestión de Simulaciones</h2>
        <p>Cada simulación es un juego independiente con sus propios equipos, rondas y resultados.</p>
      </div>

      <div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap">
        <button class="btn btn-success" onclick="showCrearSimulacion()">+ Nueva Simulación</button>
        <button class="btn btn-ghost" onclick="loadAdminSimulaciones()">↺ Actualizar</button>
      </div>

      <div id="crearSimForm" style="display:none;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px;margin-bottom:24px">
        <h3 style="margin:0 0 16px">Nueva Simulación</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label class="form-label">Nombre <span style="color:var(--accent4)">*</span></label>
            <input class="form-input" id="newSimNombre" placeholder="Ej: Sección A — Mañana">
          </div>
          <div>
            <label class="form-label">Rondas totales</label>
            <input class="form-input" id="newSimRondas" type="number" min="1" max="20" value="20">
          </div>
          <div style="grid-column:span 2">
            <label class="form-label">Descripción (opcional)</label>
            <input class="form-input" id="newSimDesc" placeholder="Ej: COM400A Trimestre I 2026 — Sección matutina">
          </div>
          <div style="grid-column:span 2">
            <label class="form-label">Copiar parámetros de (opcional)</label>
            <select class="form-input" id="newSimCopyFrom">
              <option value="">— Usar parámetros por defecto —</option>
              ${activas.map(s=>`<option value="${s.id}">${s.nombre}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-success" onclick="crearSimulacion()">✓ Crear Simulación</button>
          <button class="btn btn-ghost" onclick="document.getElementById('crearSimForm').style.display='none'">Cancelar</button>
        </div>
      </div>

      ${activas.length > 0 ? `
        <h3 style="margin-bottom:12px">Simulaciones activas (${activas.length})</h3>
        ${activas.map(simCard).join('')}
      ` : '<p style="color:var(--text3);font-size:.84rem">No hay simulaciones activas. Crea una nueva para comenzar.</p>'}

      ${archivadas.length > 0 ? `
        <details style="margin-top:24px">
          <summary style="cursor:pointer;font-weight:600;color:var(--text2);font-size:.9rem;padding:8px 0">
            📦 Simulaciones archivadas (${archivadas.length})
          </summary>
          <div style="margin-top:12px">
            ${archivadas.map(simCard).join('')}
          </div>
        </details>
      ` : ''}
    `;
  } catch(e) {
    el.innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
}

window.showCrearSimulacion = () => {
  document.getElementById('crearSimForm').style.display = 'block';
  document.getElementById('newSimNombre').focus();
};

window.crearSimulacion = async () => {
  const nombre = document.getElementById('newSimNombre').value.trim();
  if (!nombre) return toast('El nombre es requerido', 'error');
  const desc       = document.getElementById('newSimDesc').value.trim();
  const totalRounds= parseInt(document.getElementById('newSimRondas').value)||20;
  const copyFromSimId = document.getElementById('newSimCopyFrom').value||null;
  try {
    const r = await api('POST','/admin/simulaciones',{nombre,descripcion:desc,totalRounds,copyFromSimId});
    toast(`✓ Simulación creada — Código: ${r.codigoAcceso}`, 'success');
    document.getElementById('crearSimForm').style.display = 'none';
    await loadAdminSimulaciones();
  } catch(e) { toast(e.message,'error'); }
};

window.seleccionarSim = async (simId, nombre) => {
  try {
    await api('POST','/admin/seleccionar-sim',{simId});
    state.currentSimId = simId;
    state.currentSimNombre = nombre;
    // Cargar config de la simulación seleccionada
    state.ref = await api('GET','/admin/config');
    toast(`📊 Simulación activa: ${nombre}`, 'success');
    // Actualizar badge en el header
    const badge = document.getElementById('simBadge');
    if (badge) badge.textContent = `📊 ${nombre}`;
    // Ir al dashboard
    document.querySelector('[data-view="admin-dashboard"]')?.click();
  } catch(e) { toast(e.message,'error'); }
};

window.archivarSim = async (simId) => {
  if (!confirm('¿Archivar esta simulación? Podrás reactivarla después.')) return;
  try {
    await api('POST',`/admin/simulaciones/${simId}/archivar`);
    toast('Simulación archivada','success');
    await loadAdminSimulaciones();
  } catch(e) { toast(e.message,'error'); }
};

window.activarSim = async (simId) => {
  try {
    await api('POST',`/admin/simulaciones/${simId}/activar`);
    toast('Simulación reactivada','success');
    await loadAdminSimulaciones();
  } catch(e) { toast(e.message,'error'); }
};

window.eliminarSim = async (simId, nombre) => {
  if (!confirm(`¿ELIMINAR PERMANENTEMENTE la simulación "${nombre}"?\n\nSe eliminarán todos los equipos, rondas y resultados. Esta acción NO se puede deshacer.`)) return;
  try {
    await api('DELETE',`/admin/simulaciones/${simId}`);
    toast('Simulación eliminada','success');
    await loadAdminSimulaciones();
  } catch(e) { toast(e.message,'error'); }
};

window.copiarCodigo = (codigo) => {
  navigator.clipboard?.writeText(codigo).then(() => toast(`✓ Código ${codigo} copiado`,'success'))
    .catch(() => toast(`Código: ${codigo}`,'success'));
};

// ── Admin Dashboard ────────────────────────────────────────
// Guard: check if a simulation is selected before loading admin views
function requireSimSelected(elId) {
  if (!state.currentSimId) {
    const el = document.getElementById(elId);
    if (el) el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎮</div>
        <p style="margin-bottom:16px">Debes seleccionar una simulación primero.</p>
        <button class="btn btn-primary" onclick="document.querySelector('[data-view=admin-simulaciones]')?.click()">
          Ir a Gestión de Simulaciones →
        </button>
      </div>`;
    return false;
  }
  return true;
}

async function loadAdminDashboard() {
  if (!requireSimSelected('adminDashboardContent')) return;
  // Actualizar badge de simulación en sidebar
  const badge = document.getElementById('simBadge');
  if (badge && state.currentSimNombre) badge.textContent = `📊 ${state.currentSimNombre}`;

  const ronda = await api('GET','/admin/ronda');
  document.getElementById('adminRoundBadge').textContent = `Ronda ${ronda.currentRound}/${ronda.totalRounds}`;

  const pct = ronda.total > 0 ? Math.round(ronda.enviados/ronda.total*100) : 0;
  const estadoBadge = ronda.roundState === 'simulated'
    ? '<span class="badge badge-simulated">Simulada</span>'
    : ronda.roundState === 'open'
    ? '<span class="badge badge-open">🟢 Abierta</span>'
    : ronda.roundState === 'locked'
    ? '<span class="badge badge-alert">🔒 Cerrada</span>'
    : ronda.roundState === 'pre-sim'
    ? '<span class="badge badge-presim">📊 Pre-simulación</span>'
    : '<span class="badge badge-pending">⏸ Pendiente</span>';

  // Build bottom section depending on state
  let bottomHTML = '';
  if (ronda.roundState === 'simulated') {
    try {
      const rd = await api('GET', `/admin/resultados/${ronda.currentRound}`);
      bottomHTML = buildAdminResultsHTML(rd);
      bottomHTML += buildAdminChartsHTML(rd, ronda.currentRound);
    } catch {}
  } else if (ronda.roundState === 'pre-sim') {
    // Show pre-sim confirmation progress
    try {
      const psData = await api('GET', '/api/presim');
      const pctConf = psData.total > 0 ? Math.round(psData.confirmados/psData.total*100) : 0;
      bottomHTML = `
        <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">
          📊 Confirmaciones de Demanda Estimada — Ronda ${ronda.currentRound}
        </div>
        <div class="progress-wrap" style="margin-bottom:16px">
          <div class="progress-label">
            <span>Equipos que confirmaron su demanda</span>
            <strong>${psData.confirmados} de ${psData.total}</strong>
          </div>
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pctConf}%;background:var(--accent3)"></div></div>
        </div>
        <div class="table-wrap" style="margin-bottom:16px">
          <table>
            <thead><tr>
              <th>Equipo</th><th>Segmento</th><th>Producto</th>
              <th style="text-align:right">Demanda asignada</th>
              <th style="text-align:right">Ventas estimadas</th>
              <th style="text-align:right">Market share</th>
              <th style="text-align:center">Estado</th>
              <th style="text-align:center">Acción</th>
            </tr></thead>
            <tbody>
              ${psData.detalle.map(r => `
                <tr>
                  <td><strong>${r.equipoNombre||r.equipo}</strong></td>
                  <td style="font-size:.78rem">${r.segmento}</td>
                  <td style="font-size:.78rem">${r.producto}</td>
                  <td class="num">${fmt.num(r.demandaAsignada)}</td>
                  <td class="num">${fmt.num(r.ventasEstimadas)}</td>
                  <td class="num">${fmt.pct(r.shareEstimado)}</td>
                  <td style="text-align:center">
                    ${r.confirmado
                      ? `<span class="badge badge-ok">✓ ${r.forzadoPor==='admin'?'Forzado':'Confirmado'}</span>`
                      : '<span class="badge badge-pending">⏳ Pendiente</span>'}
                  </td>
                  <td style="text-align:center">
                    ${!r.confirmado
                      ? `<button class="btn btn-ghost btn-sm" onclick="forzarConfirmacion('${r.equipo}')">Forzar</button>`
                      : '—'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch(e) { bottomHTML = `<p style="color:var(--accent4)">${e.message}</p>`; }
  } else {
    // Show team submission status
    const equipos = await api('GET','/admin/equipos');
    bottomHTML = `
      <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Estado de Entregas — Ronda ${ronda.currentRound}</div>
      <div class="team-status-grid">
        ${equipos.length === 0
          ? '<p style="color:var(--text3);font-size:.84rem">Sin equipos registrados. Ve a <strong>Equipos</strong> para crear equipos.</p>'
          : equipos.map(eq => `
              <div class="team-status-card">
                <div class="team-status-dot" style="background:${eq.submitted ? 'var(--success)' : 'var(--warning)'}"></div>
                <div>
                  <div style="font-weight:600;font-size:.82rem">${eq.nombre}</div>
                  <div style="font-size:.7rem;color:var(--text3)">${eq.submitted ? '✓ ' + fmt.dt(eq.submittedAt) : '⏳ Pendiente'}</div>
                </div>
              </div>`).join('')}
      </div>`;
  }

  document.getElementById('adminDashboardContent').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Ronda Actual</div>
        <div class="stat-value">${ronda.currentRound}<span style="font-size:.9rem;color:var(--text3)">/${ronda.totalRounds}</span></div>
        <div class="stat-sub">${estadoBadge}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Equipos Registrados</div>
        <div class="stat-value">${ronda.total}</div>
        <div class="stat-sub">hasta 30 equipos</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Entregas Recibidas</div>
        <div class="stat-value">${ronda.enviados}<span style="font-size:.9rem;color:var(--text3)">/${ronda.total}</span></div>
        <div class="stat-sub">${pct}% listos</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Progreso Simulador</div>
        <div class="stat-value">${Math.round((ronda.currentRound-1)/ronda.totalRounds*100)}%</div>
        <div class="stat-sub">${ronda.currentRound-1} de ${ronda.totalRounds} rondas</div>
      </div>
    </div>

    <div class="progress-wrap">
      <div class="progress-label">
        <span>Entregas esta ronda</span>
        <strong>${ronda.enviados} de ${ronda.total} equipos</strong>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap">
      ${ronda.roundState === 'pending'
        ? `<button class="btn btn-success" id="btnActivarDash">▶ Activar Hoja de Decisiones — Ronda ${ronda.currentRound}</button>`
        : ronda.roundState === 'open'
        ? `<button class="btn btn-warning" id="btnPreSimDash">📊 Pre-simular (notificar demanda)</button>
           <button class="btn btn-ghost"   id="btnCerrarDash">🔒 Cerrar envíos</button>`
        : ronda.roundState === 'locked'
        ? `<button class="btn btn-warning" id="btnPreSimDash">📊 Pre-simular (notificar demanda)</button>
           <button class="btn btn-primary" id="btnSimularDash">⚡ Ejecutar Simulación (sin pre-sim)</button>`
        : ronda.roundState === 'pre-sim'
        ? `<button class="btn btn-primary" id="btnSimularDash">⚡ Ejecutar Simulación Final — Ronda ${ronda.currentRound}</button>
           <button class="btn btn-ghost"   id="btnForzarTodosDash">⏩ Forzar confirmaciones pendientes</button>`
        : ronda.currentRound < ronda.totalRounds
        ? `<button class="btn btn-success" id="btnSiguienteDash">→ Abrir Ronda ${ronda.currentRound + 1}</button>`
        : `<span class="badge badge-simulated" style="padding:8px 16px">🏆 Simulación completada — 20 rondas</span>`}
      <button class="btn btn-ghost" id="btnRefreshDash">↺ Actualizar</button>
    </div>

    ${bottomHTML}
  `;

  document.getElementById('btnActivarDash')?.addEventListener('click', doActivarRonda);
  document.getElementById('btnPreSimDash')?.addEventListener('click', doPreSimular);
  document.getElementById('btnSimularDash')?.addEventListener('click', () => doSimular(ronda.currentRound));
  document.getElementById('btnCerrarDash')?.addEventListener('click',  doCerrarRonda);
  document.getElementById('btnForzarTodosDash')?.addEventListener('click', doForzarTodos);
  document.getElementById('btnSiguienteDash')?.addEventListener('click', doSiguienteRonda);
  document.getElementById('btnRefreshDash')?.addEventListener('click', loadAdminDashboard);

  if (ronda.roundState === 'simulated') renderAdminCharts();
}

function buildAdminResultsHTML(rd) {
  if (!rd.resultados?.length) return '';
  const rows = rd.resultados.map(r => `
    <tr>
      <td><strong>${r.equipoNombre}</strong></td>
      <td>${r.segmento}</td>
      <td class="num">${fmt.num(r.ventasReales)}</td>
      <td class="num">${fmt.pct(r.shareReal)}</td>
      <td class="num ${r.ebit>=0?'pos':'neg'}">${fmt.bs(r.ebit)}</td>
      <td class="num ${r.utilidadNeta>=0?'pos':'neg'}">${fmt.bs(r.utilidadNeta)}</td>
      <td class="num ${r.cajaFinal>=0?'pos':'neg'}">${fmt.bs(r.cajaFinal)}
        <span class="badge ${r.alertaCaja==='ALERTA'?'badge-alert':'badge-ok'}">${r.alertaCaja}</span>
      </td>
      <td class="num">${fmt.d(r.roiMarketing,2)}x</td>
    </tr>`).join('');
  return `
    <div class="table-wrap" style="margin-top:4px">
      <table>
        <thead><tr><th>Equipo</th><th>Segmento</th><th>Ventas (unid)</th><th>Market Share</th><th>EBIT</th><th>Utilidad neta</th><th>Caja final</th><th>ROI Mkt</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function doPreSimular() {
  const ronda = await api('GET', '/admin/ronda');
  if (!confirm(`¿Ejecutar pre-simulación para la Ronda ${ronda.currentRound}?\n\nEl simulador calculará la demanda estimada de cada equipo y se la notificará para que confirmen. Luego podrás ejecutar la simulación final.`)) return;
  try {
    const res = await api('POST', '/admin/ronda/pre-simular');
    toast(`📊 Pre-simulación ejecutada — ${res.equiposCalculados} equipos notificados`, 'success');
    await loadAdminDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

async function doForzarTodos() {
  if (!confirm('¿Forzar la confirmación de todos los equipos pendientes?\n\nSe marcará como confirmado por el administrador.')) return;
  try {
    await api('POST', '/admin/presim/forzar-todos');
    toast('⏩ Todas las confirmaciones forzadas', 'success');
    await loadAdminDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

window.forzarConfirmacion = async (equipoId) => {
  try {
    await api('POST', `/admin/presim/forzar/${equipoId}`);
    toast('✓ Confirmación forzada', 'success');
    await loadAdminDashboard();
  } catch(e) { toast(e.message, 'error'); }
};

async function doActivarRonda() {
  const ronda = await api('GET', '/admin/ronda');
  if (!confirm(`¿Activar la Hoja de Decisiones para la Ronda ${ronda.currentRound}?

Los equipos podrán ver y completar sus decisiones.`)) return;
  try {
    await api('POST', '/admin/ronda/activar');
    toast(`✓ Ronda ${ronda.currentRound} activada — los equipos ya pueden ingresar decisiones`, 'success');
    await loadAdminDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

async function doCerrarRonda() {
  if (!confirm('¿Cerrar el envío de decisiones?\n\nLos equipos ya no podrán enviar ni modificar. Podrás ejecutar la simulación.')) return;
  try {
    await api('POST', '/admin/ronda/cerrar');
    toast('🔒 Envío de decisiones cerrado', 'info');
    await loadAdminDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

async function doSimular(n) {
  if (!confirm(`¿Ejecutar simulación de la Ronda ${n}?

Los equipos que no enviaron sus decisiones serán incluidos con los valores actuales.`)) return;
  try {
    const r = await api('POST','/admin/simular');
    toast(`✓ Ronda ${n} simulada — ${r.equiposSimulados} equipos`, 'success');
    await loadAdminDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

async function doSiguienteRonda() {
  const ronda = await api('GET','/admin/ronda');
  if (!confirm(`¿Abrir Ronda ${ronda.currentRound+1}?

Las decisiones de la ronda anterior se pre-cargarán para cada equipo.`)) return;
  try {
    await api('POST','/admin/ronda/siguiente');
    toast('✓ Nueva ronda abierta', 'success');
    await loadAdminDashboard();
  } catch(e) { toast(e.message,'error'); }
}

// ── Admin Equipos ──────────────────────────────────────────
async function loadAdminEquipos() {
  if (!requireSimSelected('equiposContent')) return;
  const equipos = await api('GET','/admin/equipos');

  const rows = equipos.map(eq => {
    const miembros = (eq.miembros || []);
    const miembrosHTML = miembros.length
      ? miembros.map(m => `
          <div class="miembro-chip">
            <span class="miembro-nombre"><strong>${m.apellidoPaterno} ${m.apellidoMaterno}</strong>, ${m.nombres}</span>
            <span class="miembro-meta">📋 ${m.nroRegistro}${m.telefono ? ' · 📞 ' + m.telefono : ''}</span>
          </div>`).join('')
      : '<span style="color:var(--text3);font-size:.78rem">Sin integrantes</span>';

    const pwId  = `pw_${eq.id.replace(/[^a-z0-9]/gi,'_')}`;
    const pass  = eq.passwordPlain;
    const pwCell = pass
      ? `<div class="pw-cell">
           <span class="pw-dots" id="${pwId}_dots">••••••••</span>
           <span class="pw-plain hidden" id="${pwId}_plain" style="font-family:var(--font-mono);font-size:.82rem;color:var(--accent3)">${pass}</span>
           <button class="btn-eye" title="Mostrar/ocultar" onclick="togglePw('${pwId}')">👁</button>
         </div>`
      : `<span style="font-size:.76rem;color:var(--text3)">— usa 🔑 para asignar —</span>`;

    return `
      <tr>
        <td>
          <div style="font-weight:700;margin-bottom:2px">${eq.nombre}</div>
          <div style="font-family:var(--font-mono);font-size:.68rem;color:var(--text3);user-select:all">${eq.id}</div>
        </td>
        <td>${pwCell}</td>
        <td><div class="miembros-list">${miembrosHTML}</div></td>
        <td style="text-align:center">${miembros.length}</td>
        <td><span class="badge ${eq.submitted?'badge-sent':'badge-pending'}">${eq.submitted?'✓ Enviado':'⏳ Pendiente'}</span></td>
        <td style="font-size:.78rem;color:var(--text3)">${fmt.dt(eq.registradoAt)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="cambiarPassword('${eq.id}','${eq.nombre}')">🔑 Clave</button>
          ${eq.submitted ? `<button class="btn btn-ghost btn-sm" onclick="resetEnvio('${eq.id}','${eq.nombre}')" title="Permite al equipo modificar sus decisiones">↺ Resetear</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="eliminarEquipo('${eq.id}','${eq.nombre}')">✕</button>
        </td>
      </tr>`;
  }).join('');

  document.getElementById('equiposTableWrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Equipo / ID de acceso</th>
          <th>Contraseña</th>
          <th>Integrantes</th>
          <th style="text-align:center">#</th>
          <th>Estado ronda</th>
          <th>Registrado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${rows.length ? rows : '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:30px">Sin equipos registrados</td></tr>'}</tbody>
    </table>`;

  document.getElementById('btnExportarEquipos')?.addEventListener('click', () => exportarEquipos(equipos));
}

window.togglePw = (pwId) => {
  const dots  = document.getElementById(pwId + '_dots');
  const plain = document.getElementById(pwId + '_plain');
  if (!dots || !plain) return;
  const showing = !plain.classList.contains('hidden');
  dots.classList.toggle('hidden', !showing);
  plain.classList.toggle('hidden', showing);
};

function exportarEquipos(equipos) {
  const lines = ['Equipo,Contraseña,Apellido Paterno,Apellido Materno,Nombres,Teléfono,Nro. Registro,ID Acceso'];
  equipos.forEach(eq => {
    const pass = eq.passwordPlain || '';
    if (!eq.miembros?.length) {
      lines.push(`"${eq.nombre}","${pass}",,,,,,"${eq.id}"`);
    } else {
      eq.miembros.forEach(m => {
        lines.push(`"${eq.nombre}","${pass}","${m.apellidoPaterno}","${m.apellidoMaterno}","${m.nombres}","${m.telefono||''}","${m.nroRegistro}","${eq.id}"`);
      });
    }
  });
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'equipos_simulador.csv';
  a.click(); URL.revokeObjectURL(url);
  toast('CSV descargado con contraseñas', 'success');
}

document.getElementById('btnNuevoEquipo')?.addEventListener('click', () => {
  document.getElementById('modalNuevoEquipo').classList.remove('hidden');
});
document.getElementById('btnCancelarEquipo')?.addEventListener('click', () => {
  document.getElementById('modalNuevoEquipo').classList.add('hidden');
});
document.getElementById('btnGuardarEquipo')?.addEventListener('click', async () => {
  const nombre   = document.getElementById('nuevoNombre').value.trim();
  const miembros = document.getElementById('nuevoMiembros').value.split(',').map(s=>s.trim()).filter(Boolean);
  const password = document.getElementById('nuevoPassword').value;
  if (!nombre || !password) return toast('Completa nombre y contraseña','error');
  if (password.length < 4) return toast('Contraseña muy corta (mín 4 chars)','error');
  try {
    const r = await api('POST','/admin/equipos',{nombre,miembros,password});
    toast(`✓ Equipo "${nombre}" creado · ID: ${r.id}`,'success');
    document.getElementById('modalNuevoEquipo').classList.add('hidden');
    ['nuevoNombre','nuevoMiembros','nuevoPassword'].forEach(id => document.getElementById(id).value = '');
    await loadAdminEquipos();
  } catch(e) { toast(e.message,'error'); }
});

window.resetEnvio = async (id, nombre) => {
  if (!confirm(`¿Resetear el envío de "${nombre}"?\n\nEl equipo podrá modificar y volver a enviar sus decisiones.`)) return;
  try {
    await api('POST', `/admin/equipos/${id}/reset-envio`);
    toast(`✓ Envío de "${nombre}" reseteado`, 'success');
    await loadAdminEquipos();
  } catch(e) { toast(e.message, 'error'); }
};

window.eliminarEquipo = async (id, nombre) => {
  if (!confirm(`¿Eliminar equipo "${nombre}"? Esta acción no se puede deshacer.`)) return;
  try {
    await api('DELETE',`/admin/equipos/${id}`);
    toast(`Equipo eliminado`,'info');
    await loadAdminEquipos();
  } catch(e) { toast(e.message,'error'); }
};

window.cambiarPassword = async (id, nombre) => {
  const p = prompt(`Nueva contraseña para "${nombre}":`);
  if (!p || p.length < 4) return;
  try {
    await api('PUT',`/admin/equipos/${id}/password`,{password:p});
    toast('✓ Contraseña actualizada','success');
  } catch(e) { toast(e.message,'error'); }
};

// ── Admin Rondas ───────────────────────────────────────────
async function loadAdminRondas() {
  if (!requireSimSelected('rondasContent')) return;
  const ronda = await api('GET','/admin/ronda');
  const hist  = await api('GET','/admin/historial');
  document.getElementById('adminRoundBadge').textContent = `Ronda ${ronda.currentRound}/${ronda.totalRounds}`;

  const estadoActualBadge =
    ronda.roundState === 'simulated' ? '<span class="badge badge-simulated">✅ Simulada</span>' :
    ronda.roundState === 'pre-sim'   ? '<span class="badge badge-presim">📊 Pre-simulación</span>' :
    ronda.roundState === 'locked'    ? '<span class="badge badge-alert">🔒 Cerrada</span>' :
    ronda.roundState === 'open'      ? '<span class="badge badge-open">🟢 Abierta</span>' :
    '<span class="badge badge-pending">⏸ Pendiente</span>';

  const histRows = hist.map(h => {
    const estadoBadge = h.estado === 'simulated'
      ? '<span class="badge badge-simulated">✅ Simulada</span>'
      : '<span class="badge badge-open">🟢 Activa</span>';
    return `
      <tr>
        <td><strong>Ronda ${h.ronda}</strong></td>
        <td>${estadoBadge}</td>
        <td>${h.enviados}/${h.total}</td>
        <td>${fmt.dt(h.ejecutadaAt)}</td>
        <td>${h.estado==='simulated'
          ? `<button class="btn btn-ghost btn-sm" onclick="verResultadosRonda(${h.ronda})">Ver →</button>`
          : '—'}</td>
      </tr>`;
  }).join('');

  const botonesControl = ronda.roundState === 'pending'
    ? `<button class="btn btn-success" id="btnActivarRonda">▶ Activar Hoja de Decisiones — Ronda ${ronda.currentRound}</button>`
    : ronda.roundState === 'open'
    ? `<button class="btn btn-warning"  id="btnPreSimRonda">📊 Pre-simular (notificar demanda a equipos)</button>
       <button class="btn btn-ghost"    id="btnCerrarRonda">🔒 Cerrar envíos</button>`
    : ronda.roundState === 'locked'
    ? `<button class="btn btn-warning"  id="btnPreSimRonda">📊 Pre-simular (notificar demanda a equipos)</button>
       <button class="btn btn-primary"  id="btnSimularRonda">⚡ Ejecutar Simulación (sin pre-sim)</button>`
    : ronda.roundState === 'pre-sim'
    ? `<button class="btn btn-primary"  id="btnSimularRonda">⚡ Ejecutar Simulación Final — Ronda ${ronda.currentRound}</button>
       <button class="btn btn-ghost"    id="btnForzarTodosRonda">⏩ Forzar confirmaciones pendientes</button>`
    : ronda.roundState === 'simulated'
    ? `<button class="btn btn-success"  id="btnNextRonda">→ Abrir Ronda ${ronda.currentRound + 1}</button>`
    : '';

  // Bloque de progreso pre-sim (solo visible en estado pre-sim)
  let preSimBlock = '';
  if (ronda.roundState === 'pre-sim') {
    try {
      const ps = await api('GET', '/api/presim');
      const pct = ps.total > 0 ? Math.round(ps.confirmados/ps.total*100) : 0;
      preSimBlock = `
        <div class="progress-wrap" style="margin-bottom:16px">
          <div class="progress-label">
            <span>📊 Equipos que confirmaron su demanda estimada</span>
            <strong>${ps.confirmados} de ${ps.total}</strong>
          </div>
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;background:var(--accent3)"></div></div>
        </div>
        <div class="table-wrap" style="margin-bottom:20px">
          <table>
            <thead><tr>
              <th>Equipo</th><th>Segmento</th>
              <th style="text-align:right">Demanda asignada</th>
              <th style="text-align:right">Ventas estimadas</th>
              <th style="text-align:right">Share</th>
              <th style="text-align:center">Confirmación</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${ps.detalle.map(r => `
                <tr>
                  <td><strong>${r.equipoNombre||r.equipo}</strong></td>
                  <td style="font-size:.78rem">${r.segmento}</td>
                  <td class="num">${fmt.num(r.demandaAsignada)}</td>
                  <td class="num">${fmt.num(r.ventasEstimadas)}</td>
                  <td class="num">${fmt.pct(r.shareEstimado)}</td>
                  <td style="text-align:center">
                    ${r.confirmado
                      ? `<span class="badge badge-ok">✓ ${r.forzadoPor==='admin'?'Forzado':'Confirmado'}</span>`
                      : '<span class="badge badge-pending">⏳ Pendiente</span>'}
                  </td>
                  <td>${!r.confirmado
                    ? `<button class="btn btn-ghost btn-sm" onclick="forzarConfirmacion('${r.equipo}')">Forzar</button>`
                    : ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch {}
  }

  document.getElementById('rondasContent').innerHTML = `
    <div class="stat-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-label">Ronda actual</div>
        <div class="stat-value">${ronda.currentRound}</div>
        <div class="stat-sub">${estadoActualBadge}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Entregas</div>
        <div class="stat-value">${ronda.enviados}/${ronda.total}</div>
        <div class="stat-sub">decisiones enviadas</div>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      ${botonesControl}
    </div>

    ${preSimBlock}

    <div class="table-wrap">
      <table>
        <thead><tr><th>Ronda</th><th>Estado</th><th>Entregas</th><th>Ejecutada</th><th></th></tr></thead>
        <tbody>${histRows || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">Sin historial</td></tr>'}</tbody>
      </table>
    </div>`;

  document.getElementById('btnActivarRonda')?.addEventListener('click', doActivarRonda);
  document.getElementById('btnPreSimRonda')?.addEventListener('click', doPreSimular);
  document.getElementById('btnSimularRonda')?.addEventListener('click', () => doSimular(ronda.currentRound));
  document.getElementById('btnCerrarRonda')?.addEventListener('click', doCerrarRonda);
  document.getElementById('btnForzarTodosRonda')?.addEventListener('click', doForzarTodos);
  document.getElementById('btnNextRonda')?.addEventListener('click', doSiguienteRonda);
}

window.verResultadosRonda = async (n) => {
  document.querySelector('[data-view="admin-resultados"]').click();
  await loadAdminResultados(n);
};

// ── Admin Resultados ───────────────────────────────────────
async function loadAdminResultados(rondaNum) {
  if (!requireSimSelected('adminResultadosContent')) return;
  const ronda = await api('GET','/admin/ronda');
  const n = rondaNum || (ronda.roundState === 'simulated' ? ronda.currentRound : ronda.currentRound - 1);

  // Build round selector
  const hist = await api('GET','/admin/historial');
  const simuladas = hist.filter(h => h.estado === 'simulated');
  if (!simuladas.length) {
    document.getElementById('adminResultadosContent').innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>No hay rondas simuladas aún</p></div>`;
    return;
  }

  const selectorHTML = `<div class="ronda-selector">
    ${simuladas.map(h => `<button class="ronda-btn simulated ${h.ronda===n?'active':''}" onclick="loadAdminResultados(${h.ronda})">Ronda ${h.ronda}</button>`).join('')}
  </div>`;

  let content = selectorHTML;
  if (n && n > 0) {
    try {
      const rd = await api('GET',`/admin/resultados/${n}`);
      content += buildAdminResultsHTML(rd);
      content += buildAdminChartsHTML(rd, n);
    } catch { content += `<p style="color:var(--text3)">Sin datos para ronda ${n}</p>`; }
  }
  document.getElementById('adminResultadosContent').innerHTML = content;
  renderAdminCharts();
}

window.loadAdminResultados = loadAdminResultados;

function buildAdminChartsHTML(rd, n) {
  return `
    <div class="charts-row">
      <div class="chart-card"><h4>EBIT por Equipo (Bs)</h4><div class="chart-wrap"><canvas id="chartAdminEBIT_${n}"></canvas></div></div>
      <div class="chart-card"><h4>Market Share (%)</h4><div class="chart-wrap"><canvas id="chartAdminShare_${n}"></canvas></div></div>
    </div>`;
}

function renderAdminCharts() {
  document.querySelectorAll('[id^="chartAdmin"]').forEach(canvas => {
    const id = canvas.id;
    const n = parseInt(id.split('_')[1]);
    if (!n) return;
    api('GET',`/admin/resultados/${n}`).then(rd => {
      const labels = rd.resultados.map(r => r.equipoNombre);
      const colors = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06FFA5','#84CC16','#F97316'];
      const defOpts = { responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}, scales:{x:{ticks:{color:'#9BA3C4',font:{family:'Space Mono',size:9}},grid:{color:'#2A2F45'}},y:{ticks:{color:'#9BA3C4',font:{family:'Space Mono',size:9}},grid:{color:'#2A2F45'}}} };
      if (id.includes('EBIT')) {
        new Chart(canvas, { type:'bar', data:{ labels, datasets:[{data:rd.resultados.map(r=>r.ebit), backgroundColor:rd.resultados.map(r=>r.ebit>=0?'#06FFA5':'#FF6B6B'), borderRadius:4}]}, options:{...defOpts} });
      } else {
        new Chart(canvas, { type:'bar', data:{ labels, datasets:[{data:rd.resultados.map(r=>+(r.shareReal*100).toFixed(2)), backgroundColor:colors.slice(0,labels.length), borderRadius:4}]}, options:{...defOpts} });
      }
    }).catch(()=>{});
  });
}

// ── Admin Mercado ──────────────────────────────────────────
async function loadAdminMercado() {
  if (!requireSimSelected('mercadoContent')) return;
  const ref = state.ref || await api('GET','/admin/config');
  const segs = ref.mercadoSegmentos;
  const tend = t => t==='Alto crecimiento'?'badge-high':t==='Creciente'?'badge-grow':'badge-stable';
  const rows = segs.map(s => `
    <tr>
      <td><strong>${s.nombre}</strong></td>
      <td class="num">${fmt.pct(s.participacion)}</td>
      <td class="num">${fmt.bs(s.mercadoFormal)}</td>
      <td class="num">${fmt.bs(s.precioRetailProm)}</td>
      <td class="num">${fmt.num(s.demandaFormalUnid)}</td>
      <td>${s.canalPreferido}</td>
      <td><span class="badge ${tend(s.tendencia)}">${s.tendencia}</span></td>
    </tr>`).join('');
  document.getElementById('adminMercadoContent').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Segmento</th><th>Participación</th><th>Mercado formal (Bs)</th><th>P° retail prom.</th><th>Demanda formal (unid)</th><th>Canal preferido</th><th>Tendencia</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ══════════════════════════════════════════════════════════
// ADMIN — PARÁMETROS
// ══════════════════════════════════════════════════════════
async function loadAdminParametros() {
  if (!requireSimSelected('adminParametrosContent')) return;
  const data = await api('GET', '/admin/config');
  const p  = data.parametros;
  const tp = data.tiposProducto;
  const can = data.canales;

  const pf = (label, key, hint='', step='any') => `
    <div class="param-row">
      <label class="param-label">${label}</label>
      <input class="param-input" type="number" step="${step}" data-pkey="${key}" value="${p[key]??''}"/>
      ${hint?`<span class="param-hint">${hint}</span>`:''}
    </div>`;

  document.getElementById('adminParametrosContent').innerHTML = `
    <div class="param-grid">

      <div class="param-card">
        <div class="param-card-title">💼 Capital Inicial por Equipo</div>
        ${pf('Capital inicial (Bs)','capitalInicial')}
        ${pf('Caja inicial (Bs)','cajaInicial')}
        ${pf('Activos fijos iniciales (Bs)','activosFijosIniciales')}
        ${pf('Inventario inicial (unid)','inventarioInicialUnid','0 = sin stock')}
        ${pf('CxC inicial (Bs)','cxcInicial')}
        ${pf('Deuda inicial (Bs)','deudaInicial')}
        ${pf('Capacidad máx producción (unid)','capacidadMaxProduccion')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🏭 Costos Fijos Operativos</div>
        ${pf('Gasto administrativo fijo (Bs)','gastoAdminFijo','Por trimestre')}
        ${pf('Gasto fijo de planta (Bs)','gastoFijoPlanta','Por trimestre')}
        ${pf('Depreciación trimestral (Bs)','depreciacionTrimestral')}
        ${pf('Costo almacenamiento / unid (Bs)','costoAlmacenamientoUnidad','Bs/unid final')}
      </div>

      <div class="param-card">
        <div class="param-card-title">💳 Ventas y Cobranzas</div>
        ${pf('% Ventas al contado','pctVentasContado','0.70 = 70%')}
        ${pf('% Ventas a crédito','pctVentasCredito','0.30 = 30%')}
        ${pf('Plazo cobro (trimestres)','plazoCobro','1 = siguiente trimestre','1')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🏦 Financiamiento</div>
        ${pf('Tasa préstamo operativo (trim.)','tasaPrestamoOperativo','0.04 = 4%')}
        ${pf('Tasa préstamo inversión (trim.)','tasaPrestamoInversion','0.03 = 3%')}
        ${pf('Tasa sobregiro (trim.)','tasaSobregiro','0.06 = 6%')}
        ${pf('Comisión apertura préstamo','comisionAperturaPrestamo','0.01 = 1%')}
        ${pf('Plazo préstamo operativo (trim.)','plazoPrestamoOperativo','','1')}
        ${pf('Plazo préstamo inversión (trim.)','plazoPrestamoInversion','','1')}
      </div>

      <div class="param-card">
        <div class="param-card-title">👥 Fuerza de Ventas</div>
        ${pf('Vendedores iniciales por equipo','vendedoresIniciales','','1')}
        ${pf('Sueldo trimestral / vendedor (Bs)','sueldoTrimestralVendedor')}
        ${pf('Costo contratación / vendedor (Bs)','costoContratacionVendedor')}
        ${pf('Costo despido / vendedor (Bs)','costoDespidoVendedor')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🔍 Investigación de Mercado</div>
        ${pf('Reporte Básico (Bs)','costoInvestigacionBasica')}
        ${pf('Reporte Premium (Bs)','costoInvestigacionPremium')}
      </div>

      <div class="param-card">
        <div class="param-card-title">💡 Innovación</div>
        ${pf('Factor innovación Producto','factorInnovacionProducto','0.333 = 1/3 del monto/unid')}
        ${pf('Factor innovación Proceso','factorInnovacionProceso','0.333 = reducción de CU')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🧪 Costo Base por Producto (Bs/unid)</div>
        ${Object.entries(tp).map(([n,v])=>`
          <div class="param-row">
            <label class="param-label">${n}</label>
            <input class="param-input" type="number" step="0.01" data-tp="${n}" value="${v.costoBase}"/>
          </div>`).join('')}
      </div>

      <div class="param-card" style="grid-column:span 2">
        <div class="param-card-title">📦 Canales — Costos y Comisiones</div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Canal</th>
              <th>Costo adicional/unid (Bs)</th>
              <th>Comisión sobre ventas</th>
              <th>Factor impacto vendedores</th>
              <th>Bono atractivo</th>
            </tr></thead>
            <tbody>
              ${Object.entries(can).map(([n,v])=>`
                <tr>
                  <td><strong>${n}</strong></td>
                  <td><input class="param-input" type="number" step="0.01" data-canal="${n}" data-canal-field="costoAdicionalUnitario" value="${v.costoAdicionalUnitario}" style="width:90px"/></td>
                  <td><input class="param-input" type="number" step="0.01" data-canal="${n}" data-canal-field="comisionPct" value="${v.comisionPct}" style="width:90px"/></td>
                  <td><input class="param-input" type="number" step="0.01" data-canal="${n}" data-canal-field="factorImpactoVendedores" value="${v.factorImpactoVendedores}" style="width:90px"/></td>
                  <td><input class="param-input" type="number" step="0.1"  data-canal="${n}" data-canal-field="bonoAtractivo" value="${v.bonoAtractivo}" style="width:90px"/></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
    <div class="param-actions">
      <button class="btn btn-primary" id="btnSaveParams">💾 Guardar Parámetros</button>
      <span class="param-warning">⚠ Los cambios aplican desde la próxima simulación</span>
    </div>`;

  document.getElementById('btnSaveParams').addEventListener('click', saveParametros);
}

async function saveParametros() {
  const parametros = {};
  document.querySelectorAll('[data-pkey]').forEach(el => { parametros[el.dataset.pkey] = +el.value; });

  const tiposProducto = {};
  document.querySelectorAll('[data-tp]').forEach(el => { tiposProducto[el.dataset.tp] = { costoBase: +el.value }; });

  const canales = {};
  document.querySelectorAll('[data-canal]').forEach(el => {
    if (!canales[el.dataset.canal]) canales[el.dataset.canal] = {};
    canales[el.dataset.canal][el.dataset.canalField] = +el.value;
  });

  try {
    await api('PUT','/admin/parametros',    { parametros });
    await api('PUT','/admin/tiposproducto', { tiposProducto });
    await api('PUT','/admin/canales',       { canales });
    toast('✓ Parámetros guardados','success');
    state.ref = await api('GET','/admin/config');
  } catch(e) { toast(e.message,'error'); }
}


// ══════════════════════════════════════════════════════════
// ADMIN — SEGMENTOS
// ══════════════════════════════════════════════════════════
let segmentosLocal = [];

async function loadAdminSegmentos() {
  if (!requireSimSelected('segmentosContent')) return;
  segmentosLocal = await api('GET', '/admin/segmentos');
  renderSegmentosEditor();
}

function renderSegmentosEditor() {
  const tendOpts = ['Estable','Creciente','Alto crecimiento','Decreciente'];
  const tabs = segmentosLocal.map((s,i) => `<button class="seg-tab ${i===0?'active':''}" data-seg="${i}">${s.nombre}</button>`).join('');

  const panels = segmentosLocal.map((s,i) => `
    <div class="seg-panel ${i===0?'active':''}" id="segPanel_${i}">
      <div class="seg-rename-row">
        <label class="param-label" style="color:var(--accent3);font-weight:700">✏️ Nombre del segmento</label>
        <input class="param-input seg-nombre-input" style="font-weight:700;font-size:.95rem;max-width:340px"
          data-seg-idx="${i}" data-seg-field="nombre" value="${s.nombre}"/>
      </div>
      <div class="seg-fields-grid">
        <div class="param-card">
          <div class="param-card-title">📊 Mercado</div>
          <div class="param-row"><label class="param-label">Demanda base (unidades)</label>
            <input class="param-input" type="number" step="1000" data-seg-idx="${i}" data-seg-field="demandaBase" value="${s.demandaBase}"/></div>
          <div class="param-row"><label class="param-label">% Contrabando (0–1)</label>
            <input class="param-input" type="number" step="0.01" min="0" max="1" data-seg-idx="${i}" data-seg-field="pctContrabando" value="${s.pctContrabando}"/>
            <span class="param-hint">Demanda formal = Demanda base × (1 − %)</span></div>
          <div class="param-row"><label class="param-label">Índice externo (competidores)</label>
            <input class="param-input" type="number" step="0.1" data-seg-idx="${i}" data-seg-field="indiceExterno" value="${s.indiceExterno}"/>
            <span class="param-hint">Atractivo agregado de competidores externos</span></div>
          <div class="param-row"><label class="param-label">Tendencia</label>
            <select class="param-input" data-seg-idx="${i}" data-seg-field="tendencia">
              ${tendOpts.map(t=>`<option ${t===s.tendencia?'selected':''}>${t}</option>`).join('')}
            </select></div>
          <div class="param-row"><label class="param-label">Descripción</label>
            <input class="param-input" type="text" data-seg-idx="${i}" data-seg-field="descripcion" value="${s.descripcion||''}"/></div>
        </div>
      </div>
      <div style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:var(--r);font-family:var(--font-mono);font-size:.78rem;color:var(--accent2)">
        Demanda formal = <strong id="demFormal_${i}">${Math.round(s.demandaBase*(1-s.pctContrabando)).toLocaleString('es-BO')}</strong> unidades
      </div>
    </div>`).join('');

  document.getElementById('adminSegmentosContent').innerHTML = `
    <div class="seg-tabs-bar">${tabs}</div>
    <div class="seg-panels">${panels}</div>
    <div class="param-actions">
      <button class="btn btn-primary" id="btnSaveSegs">💾 Guardar Segmentos</button>
      <button class="btn btn-ghost"   id="btnResetSegs">↺ Recargar</button>
    </div>`;

  document.querySelectorAll('.seg-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.seg-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`segPanel_${btn.dataset.seg}`)?.classList.add('active');
    });
  });

  document.querySelectorAll('[data-seg-idx][data-seg-field]').forEach(el => {
    el.addEventListener('input', () => {
      const idx = +el.dataset.segIdx;
      const field = el.dataset.segField;
      const val = el.tagName==='SELECT' ? el.value : (el.type==='number' ? +el.value : el.value);
      segmentosLocal[idx][field] = val;
      if (field==='nombre') document.querySelectorAll('.seg-tab')[idx].textContent = val||`Seg ${idx+1}`;
      if (field==='demandaBase' || field==='pctContrabando') {
        const seg = segmentosLocal[idx];
        const df = Math.round(seg.demandaBase*(1-seg.pctContrabando));
        const el2 = document.getElementById(`demFormal_${idx}`);
        if (el2) el2.textContent = df.toLocaleString('es-BO');
      }
    });
  });

  document.getElementById('btnSaveSegs').addEventListener('click', saveSegmentos);
  document.getElementById('btnResetSegs').addEventListener('click', loadAdminSegmentos);
}

async function saveSegmentos() {
  try {
    for (const s of segmentosLocal) {
      if (!s.nombre?.trim()) return toast('Todos los segmentos deben tener nombre','error');
    }
    await api('PUT','/admin/segmentos',{ segmentos: segmentosLocal });
    toast('✓ Segmentos guardados','success');
  } catch(e) { toast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════
// ADMIN — MATRIZ AFINIDAD
// ══════════════════════════════════════════════════════════
let afinidadLocal = null;
let segmentosForAfinidad = [];

async function loadAdminAfinidad() {
  if (!requireSimSelected('afinidadContent')) return;
  const [afData, segData] = await Promise.all([
    api('GET','/admin/afinidad'),
    api('GET','/admin/segmentos'),
  ]);
  afinidadLocal = afData;
  segmentosForAfinidad = segData;
  renderAfinidadEditor();
}

function renderAfinidadEditor() {
  const productos = Object.keys(afinidadLocal);
  const segNombres = segmentosForAfinidad.map(s => s.nombre);

  const colorCell = v => {
    if (v >= 3)  return 'background:rgba(6,255,165,.15);color:var(--accent5)';
    if (v >= 1)  return 'background:rgba(78,205,196,.1);color:var(--accent2)';
    if (v === 0) return 'background:var(--bg3);color:var(--text3)';
    return 'background:rgba(255,107,107,.12);color:var(--accent4)';
  };

  const headerCols = segNombres.map(n=>`<th style="padding:8px 6px;font-size:.68rem;text-align:center;white-space:nowrap;max-width:90px;overflow:hidden">${n}</th>`).join('');

  const rows = productos.map(prod => {
    const vals = afinidadLocal[prod] || [];
    const cells = segNombres.map((_, j) => {
      const v = vals[j] ?? 0;
      return `<td style="padding:4px;text-align:center">
        <input type="number" min="-3" max="3" step="1"
          data-af-prod="${prod}" data-af-seg="${j}"
          value="${v}"
          style="width:52px;text-align:center;padding:4px;border-radius:4px;border:1px solid var(--border2);${colorCell(v)};font-family:var(--font-mono);font-size:.82rem;outline:none"/>
      </td>`;
    }).join('');
    return `<tr><td style="padding:8px 12px;font-weight:600;white-space:nowrap">${prod}</td>${cells}</tr>`;
  }).join('');

  document.getElementById('adminAfinidadContent').innerHTML = `
    <div class="table-wrap">
      <table style="border-collapse:collapse;width:100%">
        <thead>
          <tr>
            <th style="padding:8px 12px;text-align:left;background:var(--bg3)">Producto \\ Segmento</th>
            ${headerCols}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;font-size:.78rem;color:var(--text3);display:flex;gap:16px;flex-wrap:wrap">
      <span style="color:var(--accent5)">■ +3 Ajuste perfecto</span>
      <span style="color:var(--accent2)">■ +1 Aceptable</span>
      <span style="color:var(--text3)">■ 0 Neutro</span>
      <span style="color:var(--accent4)">■ -2 Mal ajuste</span>
    </div>
    <div class="param-actions">
      <button class="btn btn-primary" id="btnSaveAfinidad">💾 Guardar Matriz</button>
      <button class="btn btn-ghost"   id="btnResetAfinidad">↺ Recargar</button>
    </div>`;

  // Bind: update color on change
  document.querySelectorAll('[data-af-prod]').forEach(inp => {
    inp.addEventListener('input', () => {
      const prod = inp.dataset.afProd;
      const j    = +inp.dataset.afSeg;
      const v    = +inp.value;
      if (afinidadLocal[prod]) afinidadLocal[prod][j] = v;
      inp.style.cssText = `width:52px;text-align:center;padding:4px;border-radius:4px;border:1px solid var(--border2);${colorCell(v)};font-family:var(--font-mono);font-size:.82rem;outline:none`;
    });
  });

  document.getElementById('btnSaveAfinidad').addEventListener('click', async () => {
    try {
      await api('PUT','/admin/afinidad',{ afinidadMatrix: afinidadLocal });
      toast('✓ Matriz guardada','success');
    } catch(e) { toast(e.message,'error'); }
  });
  document.getElementById('btnResetAfinidad').addEventListener('click', loadAdminAfinidad);
}

// ══════════════════════════════════════════════════════════
// ADMIN — COMPETENCIA EXTERNA
// ══════════════════════════════════════════════════════════
let competenciaLocal = [];

async function loadAdminCompetencia() {
  if (!requireSimSelected('competenciaContent')) return;
  competenciaLocal = await api('GET','/admin/competencia');
  renderCompetenciaEditor();
}

function renderCompetenciaEditor() {
  const segNombres = ['Masivo popular','Masivo aspiracional','Funcional familiar','Cosmético','Dermatológico','Natural','Institucional'];

  const rows = competenciaLocal.map((c,i) => `
    <tr>
      <td>
        <select class="param-input" data-comp="${i}" data-comp-field="segmento" style="min-width:160px">
          ${segNombres.map(s=>`<option ${s===c.segmento?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input class="param-input" type="text"   data-comp="${i}" data-comp-field="nombre"           value="${c.nombre}"           style="min-width:160px"/></td>
      <td><input class="param-input" type="number" data-comp="${i}" data-comp-field="precio"           value="${c.precio}"           step="0.1" style="width:80px"/></td>
      <td><input class="param-input" type="number" data-comp="${i}" data-comp-field="calidad"          value="${c.calidad}"          step="0.5" min="1" max="10" style="width:70px"/></td>
      <td><input class="param-input" type="number" data-comp="${i}" data-comp-field="marketing"        value="${c.marketing}"        step="500"  style="width:90px"/></td>
      <td><input class="param-input" type="number" data-comp="${i}" data-comp-field="participacionRef" value="${c.participacionRef}" step="0.01" min="0" max="1" style="width:80px"/></td>
      <td><button class="btn btn-danger btn-sm" onclick="eliminarCompetidor(${i})">✕</button></td>
    </tr>`).join('');

  document.getElementById('adminCompetenciaContent').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Segmento dominante</th><th>Nombre del competidor</th>
          <th>Precio (Bs)</th><th>Calidad (1-10)</th>
          <th>Marketing (Bs)</th><th>Participación ref.</th><th></th>
        </tr></thead>
        <tbody id="compRows">${rows}</tbody>
      </table>
    </div>
    <div class="param-actions">
      <button class="btn btn-ghost" id="btnAddComp">+ Agregar competidor</button>
      <button class="btn btn-primary" id="btnSaveComp">💾 Guardar</button>
    </div>
    <p class="param-hint" style="margin-top:8px">
      Estos actores externos influyen en el índice externo de cada segmento y aparecen en reportes de investigación de mercado.
    </p>`;

  document.querySelectorAll('[data-comp][data-comp-field]').forEach(el => {
    el.addEventListener('input', () => {
      const i = +el.dataset.comp;
      const f = el.dataset.compField;
      competenciaLocal[i][f] = el.type==='number' ? +el.value : el.value;
    });
  });

  document.getElementById('btnAddComp').addEventListener('click', () => {
    competenciaLocal.push({ segmento:'Masivo popular', nombre:'Nuevo competidor', precio:3.00, calidad:5, marketing:0, participacionRef:0.10 });
    renderCompetenciaEditor();
  });

  document.getElementById('btnSaveComp').addEventListener('click', async () => {
    try {
      await api('PUT','/admin/competencia',{ competencia: competenciaLocal });
      toast('✓ Competencia guardada','success');
    } catch(e) { toast(e.message,'error'); }
  });
}

window.eliminarCompetidor = (i) => {
  competenciaLocal.splice(i,1);
  renderCompetenciaEditor();
};


// ═══════════════════════════════════════════════════════════
//  EQUIPO
// ═══════════════════════════════════════════════════════════
async function initEquipo() {
  showScreen('screen-equipo');
  setupNav('screen-equipo');
  document.getElementById('equipoNombreSidebar').textContent = state.me.nombre;
  document.getElementById('btnEquipoLogout').addEventListener('click', doLogout);
  document.getElementById('btnPrintHoja').addEventListener('click', printHoja);

  // Show/hide print button only on hoja view
  document.querySelectorAll('#screen-equipo .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('btnPrintHoja').style.display = btn.dataset.view === 'eq-hoja' ? '' : 'none';
    });
  });

  // ── BUG CORREGIDO: /api/decisiones lanzaba 400 si la sesión perdió
  //    simulacionId (ej: relogin después de expiración de cookie).
  //    Ahora muestra mensaje claro en lugar de romper toda la inicialización.
  try {
    const decData = await api('GET', '/api/decisiones');
    state.ref = decData.referencia || null;
    state.decisiones = decData.decision;
    await loadHojaDecision();
  } catch(e) {
    const wrap = document.getElementById('decisionFormWrap');
    if (wrap) {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;text-align:center">
          <div style="font-size:48px;margin-bottom:12px">⚠️</div>
          <h3 style="margin-bottom:8px">Sesión sin simulación activa</h3>
          <p style="color:var(--text3);font-size:.88rem;margin-bottom:20px">
            Tu sesión expiró o fue iniciada sin un código de simulación.<br>
            Cierra sesión y vuelve a ingresar con tu nombre de equipo y contraseña,<br>
            o solicita al profesor que reactive tu acceso.
          </p>
          <button class="btn btn-primary" onclick="doLogout()">Cerrar sesión →</button>
        </div>`;
    }
  }
}

// ── Decision Form ──────────────────────────────────────────
async function loadDecisionForm() {
  const data = await api('GET','/api/decisiones');
  state.decisiones = data.decision;
  const n = data.ronda;
  const isSimulated = data.roundState === 'simulated';
  const isPending   = data.roundState === 'pending';
  const isLocked    = data.roundState === 'locked';
  const submitted   = data.decision.submitted;
  const isEditable  = !isSimulated && !isPending && !isLocked && !submitted;

  document.getElementById('decRondaNum').textContent = n;
  document.getElementById('equipoRoundBadge').textContent = `Ronda ${n}/20`;
  document.getElementById('equipoStateBadge').textContent =
    isSimulated ? '🔒 Simulada'
    : isPending  ? '⏸ Pendiente'
    : isLocked   ? '🔒 Cerrada'
    : submitted  ? '✓ Enviada'
    : '🟢 Abierta';

  const msg = isSimulated
    ? '🔒 Esta ronda ya fue simulada. Los resultados están en "Mis Resultados".'
    : isPending
    ? '⏸ El profesor aún no ha habilitado las decisiones para este trimestre. Espera su indicación.'
    : isLocked
    ? '🔒 El profesor cerró el envío de decisiones. Ya no puedes modificar.'
    : submitted
    ? '✅ Decisiones enviadas. Esperando que el profesor ejecute la simulación.'
    : '🟢 Ingresa tus decisiones y presiona Enviar cuando estés listo.';

  const bannerClass = isSimulated ? 'simulated'
    : isPending  ? 'pending'
    : isLocked   ? 'simulated'
    : submitted  ? 'submitted'
    : 'open';
  document.getElementById('decEstadoMsg').innerHTML = msg;

  const d = state.decisiones;
  const ref = state.ref;
  const disabled = isEditable ? '' : 'disabled';

  const segOpts = ref.segmentos.map(s => `<option ${s.nombre===d.segmentoObjetivo?'selected':''}>${s.nombre}</option>`).join('');
  const prodOpts = ref.tiposProducto.map(t => `<option value="${t.nombre}" ${t.nombre===d.tipoProducto?'selected':''}>${t.nombre} (Bs ${t.costoBase})</option>`).join('');
  const canalOpts = ref.canales.map(c => `<option ${c.nombre===d.canal?'selected':''}>${c.nombre}</option>`).join('');

  const inp = (field, val, extra='') => `<input class="form-input editable" data-field="${field}" ${disabled} ${extra} value="${val ?? ''}"/>`;
  const sel = (field, opts) => `<select class="form-select editable" data-field="${field}" ${disabled}>${opts}</select>`;
  const chk = (field, val, label, cost) => `
    <label class="check-label">
      <input type="checkbox" data-field="${field}" ${val?'checked':''} ${disabled}/>
      ${label}<span class="check-cost">${cost}</span>
    </label>`;

  document.getElementById('decisionFormWrap').innerHTML = `
    <div class="status-banner ${bannerClass}">${msg}</div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">1 · Producto y Segmento</span></div>
      <div class="decision-card-body">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">🎯 Segmento objetivo</label>${sel('segmentoObjetivo',segOpts)}</div>
          <div class="form-group"><label class="form-label">🧪 Tipo de producto</label>${sel('tipoProducto',prodOpts)}</div>
          <div class="form-group"><label class="form-label">⭐ Calidad (1–10)</label>${inp('calidad',d.calidad,'type="number" min="1" max="10" step="1"')}<span class="form-hint">+4% costo/punto sobre 5</span></div>
          <div class="form-group"><label class="form-label">💡 Diferenciación (1–10)</label>${inp('diferenciacion',d.diferenciacion,'type="number" min="1" max="10" step="1"')}<span class="form-hint">+3% costo/punto sobre 5</span></div>
        </div>
      </div>
    </div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">2 · Precios y Canal</span></div>
      <div class="decision-card-body">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">💰 Precio consumidor (Bs)</label>${inp('precioConsumidor',d.precioConsumidor,'type="number" min="1" step="0.5"')}</div>
          <div class="form-group"><label class="form-label">🏪 Precio canal (Bs)</label>${inp('precioCanal',d.precioCanal,'type="number" min="1" step="0.5"')}<span class="form-hint">Debe ser menor al precio consumidor</span></div>
          <div class="form-group"><label class="form-label">📦 Canal de distribución</label>${sel('canal',canalOpts)}</div>
        </div>
      </div>
    </div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">3 · Marketing y Fuerza de Ventas</span></div>
      <div class="decision-card-body">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">📢 Marketing (Bs)</label>${inp('marketing',d.marketing,'type="number" min="0" step="500"')}<span class="form-hint">Rendimientos decrecientes (ln)</span></div>
          <div class="form-group"><label class="form-label">👥 Vendedores actuales</label><input class="form-input" value="${d.vendedoresIniciales}" readonly/></div>
          <div class="form-group"><label class="form-label">➕ Contratar</label>${inp('contratarVendedores',d.contratarVendedores,'type="number" min="0" step="1"')}<span class="form-hint">Bs 500/vendedor</span></div>
          <div class="form-group"><label class="form-label">➖ Despedir</label>${inp('despedirVendedores',d.despedirVendedores,'type="number" min="0" step="1"')}<span class="form-hint">Bs 700/vendedor</span></div>
          <div class="form-group"><label class="form-label">💵 Comisión (%)</label>${inp('comision',d.comision,'type="number" min="0" max="0.5" step="0.005"')}<span class="form-hint">Ej: 0.03 = 3%</span></div>
        </div>
      </div>
    </div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">4 · Producción</span></div>
      <div class="decision-card-body">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">🏭 Producción (unidades)</label>${inp('produccion',d.produccion,'type="number" min="0" step="500"')}<span class="form-hint">1,500 unid/operario · Descuento escala hasta 18%</span></div>
          <div class="form-group"><label class="form-label">📦 Inventario inicial (unid)</label><input class="form-input" value="${fmt.num(d.inventarioInicial)}" readonly/><span class="form-hint">Propagado automáticamente</span></div>
        </div>
      </div>
    </div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">5 · Finanzas</span></div>
      <div class="decision-card-body">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">💵 Caja inicial</label><input class="form-input" value="${fmt.bs(d.cajaInicial)}" readonly/></div>
          <div class="form-group"><label class="form-label">📈 Préstamo nuevo (Bs)</label>${inp('prestamoNuevo',d.prestamoNuevo,'type="number" min="0" step="1000"')}</div>
          <div class="form-group"><label class="form-label">📉 Amortización (Bs)</label>${inp('amortizacion',d.amortizacion,'type="number" min="0" step="1000"')}</div>
          <div class="form-group"><label class="form-label">% Ventas a crédito</label>${inp('pctVentasCredito',d.pctVentasCredito,'type="number" min="0" max="1" step="0.05"')}</div>
          <div class="form-group"><label class="form-label">% Compras a crédito</label>${inp('pctComprasCredito',d.pctComprasCredito,'type="number" min="0" max="1" step="0.05"')}</div>
        </div>
      </div>
    </div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">6 · Investigación de Mercado</span></div>
      <div class="decision-card-body">
        <div class="check-grid">
          ${chk('compraSegmentacion',d.compraSegmentacion,'📊 Segmentación','Bs 1,000')}
          ${chk('compraPrecios',d.compraPrecios,'💲 Precios','Bs 1,200')}
          ${chk('compraCompetencia',d.compraCompetencia,'🔍 Competencia','Bs 1,500')}
          ${chk('compraCanales',d.compraCanales,'📦 Canales','Bs 800')}
        </div>
        <p class="form-hint" style="margin-top:10px">Los reportes comprados se mostrarán en la pestaña "Reportes" después de la simulación.</p>
      </div>
    </div>
  `;

  // Bind inputs
  document.querySelectorAll('#decisionFormWrap [data-field]').forEach(el => {
    const ev = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      let val = el.type === 'checkbox' ? el.checked
              : el.type === 'number'   ? +el.value
              : el.tagName === 'SELECT' ? el.value.replace(/\s*\(Bs[\d.]+\)\s*$/, '')
              : el.value;
      if (el.tagName === 'SELECT' && el.dataset.field === 'tipoProducto') {
        val = el.value.replace(/\s*\(Bs[\d.\s]+\)\s*$/, '').trim();
      }
      state.decisiones[el.dataset.field] = val;
    });
  });

  // Toggle buttons visibility
  document.getElementById('btnGuardar').style.display = isEditable ? '' : 'none';
  document.getElementById('btnEnviar').style.display  = isEditable ? '' : 'none';
}

async function guardarDecision() {
  try {
    await api('POST','/api/decisiones/guardar',{ decision: state.decisiones });
    toast('💾 Decisiones guardadas','success');
  } catch(e) { toast(e.message,'error'); }
}

async function enviarDecision() {
  if (!confirm('¿Enviar decisiones al simulador?\n\nPodrás ver tus resultados cuando el profesor ejecute la simulación.')) return;
  try {
    await api('POST','/api/decisiones/enviar',{ decision: state.decisiones });
    toast('✅ Decisiones enviadas correctamente','success');
    await loadDecisionForm();
  } catch(e) { toast(e.message,'error'); }
}

// ── Hoja de Decisión ──────────────────────────────────────
// Estado local de la hoja (se comparte con el formulario principal)
// ══════════════════════════════════════════════════════════
// HOJA DE DECISIÓN — 20 rondas
// Estado local: no se usa hojaRondaActiva dentro de plantillas
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// HOJA DE DECISIÓN — diseño simple y directo, sin caché
// Carga siempre fresco desde el servidor al abrir la vista
// ══════════════════════════════════════════════════════════

let hojaRondaActual = 1;   // ronda que está mostrando el selector

async function loadHojaDecision() {
  const cont = document.getElementById('hojaContent');
  const sel  = document.getElementById('hojaRondaSelector');
  if (!cont) { console.error('hojaContent no encontrado'); return; }

  cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Cargando hoja de decisión…</div>';

  let decData, resData;
  try {
    [decData, resData] = await Promise.all([
      api('GET', '/api/decisiones'),
      api('GET', '/api/resultados'),
    ]);
  } catch(e) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p style="color:var(--accent4)">Error de conexión: ${e.message}</p></div>`;
    return;
  }

  hojaRondaActual = decData.ronda;

  // Construir navegación de rondas
  const simuladas = new Set((resData.historial || []).map(h => h.ronda));
  let navHTML = '';
  for (let i = 1; i <= 20; i++) {
    const isCurrent = i === decData.ronda;
    const isSim     = simuladas.has(i);
    const isFuture  = i > decData.ronda;
    const cls = isCurrent ? 'active' : isSim ? 'done' : '';
    navHTML += `<button class="hoja-round-btn ${cls}" ${isFuture?'disabled':''} onclick="hojaIrRonda(${i})">T${i}</button>`;
  }
  if (sel) sel.innerHTML = navHTML;

  // Renderizar ronda actual
  await hojaRenderRonda(decData.ronda, decData.decision, decData.roundState, null);
}

// Navegar a otra ronda desde el selector
window.hojaIrRonda = async (n) => {
  hojaRondaActual = n;
  document.querySelectorAll('.hoja-round-btn').forEach((b, i) => b.classList.toggle('active', i+1===n));

  const cont = document.getElementById('hojaContent');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Cargando…</div>';

  try {
    // Ronda actual: cargar decisión editable
    const decData = await api('GET', '/api/decisiones');
    if (n === decData.ronda) {
      await hojaRenderRonda(n, decData.decision, decData.roundState, null);
      return;
    }
    // Ronda pasada: cargar resultado + decisión del historial
    const resData = await api('GET', '/api/resultados');
    const item = resData.historial?.find(h => h.ronda === n);
    if (item) {
      await hojaRenderRonda(n, item.decision || {}, 'simulated', item.resultado);
    } else {
      cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Sin datos para la ronda ${n}</p></div>`;
    }
  } catch(e) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p style="color:var(--accent4)">${e.message}</p></div>`;
  }
};

// Renderiza la hoja para una ronda específica
async function hojaRenderRonda(n, decision, roundState, resultado) {
  const cont = document.getElementById('hojaContent');
  if (!cont) return;
  decision = decision || {};

  if (roundState === 'pending') {
    cont.innerHTML = `
      <div class="round-pending-banner">
        <div style="font-size:2.5rem;margin-bottom:14px">⏸</div>
        <h3 style="font-size:1rem;font-weight:700;color:var(--accent3);margin-bottom:8px">Ronda ${n} — Aún no habilitada</h3>
        <p style="color:var(--text2);font-size:.88rem;line-height:1.7;max-width:400px;margin:0 auto">
          El profesor no ha activado la hoja de decisiones para este trimestre.<br>
          <strong>Regresa cuando el profesor indique que está disponible.</strong>
        </p>
        <button class="btn btn-ghost" style="margin-top:20px" onclick="loadHojaDecision()">↺ Verificar estado</button>
      </div>`;
    return;
  }

  // ── ESTADO PRE-SIM: el profesor calculó la demanda, el equipo debe confirmar ──
  if (roundState === 'pre-sim') {
    try {
      const psData = await api('GET', '/api/presim');
      const ps = psData.presim;
      const yaConfirmado = ps.confirmado;

      cont.innerHTML = `
        <div style="max-width:620px;margin:0 auto;padding:20px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:2.5rem;margin-bottom:10px">📊</div>
            <h3 style="font-size:1.05rem;font-weight:700;color:var(--accent3)">Ronda ${n} — Tu Demanda Estimada</h3>
            <p style="color:var(--text2);font-size:.84rem;margin-top:6px">
              El profesor ejecutó el cálculo de demanda. Revisa los datos y confirma que los recibiste.
            </p>
          </div>

          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;margin-bottom:16px">
            <div style="background:var(--bg3);padding:10px 18px;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px">
              Resultados del cálculo de mercado
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
              <div style="padding:16px 20px;border-right:1px solid var(--border);border-bottom:1px solid var(--border)">
                <div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Segmento objetivo</div>
                <div style="font-weight:700;color:var(--text)">${ps.segmento}</div>
              </div>
              <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
                <div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Producto</div>
                <div style="font-weight:700;color:var(--text)">${ps.producto}</div>
              </div>
              <div style="padding:16px 20px;border-right:1px solid var(--border);border-bottom:1px solid var(--border)">
                <div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Demanda formal del segmento</div>
                <div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:var(--accent2)">${fmt.num(ps.demandaFormal)} unid</div>
              </div>
              <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
                <div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Tu market share estimado</div>
                <div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:var(--accent3)">${fmt.pct(ps.shareEstimado)}</div>
              </div>
              <div style="padding:16px 20px;border-right:1px solid var(--border);border-bottom:1px solid var(--border)">
                <div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Demanda asignada a tu empresa</div>
                <div style="font-family:var(--font-mono);font-size:1.4rem;font-weight:700;color:var(--accent5)">${fmt.num(ps.demandaAsignada)} unid</div>
              </div>
              <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
                <div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Inventario disponible</div>
                <div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:var(--text)">${fmt.num(ps.inventarioDisponible)} unid</div>
                <div style="font-size:.7rem;color:var(--text3)">Inventario inicial ${fmt.num(ps.inventarioInicial)} + Producción ${fmt.num(ps.produccion)}</div>
              </div>
              <div style="padding:16px 20px;border-right:1px solid var(--border)">
                <div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">✅ Ventas que se registrarán</div>
                <div style="font-family:var(--font-mono);font-size:1.4rem;font-weight:700;color:var(--accent5)">${fmt.num(ps.ventasEstimadas)} unid</div>
                <div style="font-size:.7rem;color:var(--text3)">= min(demanda asignada, inventario disponible)</div>
              </div>
              <div style="padding:16px 20px">
                <div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Inventario final estimado</div>
                <div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:${ps.inventarioFinalEst > ps.produccion*0.2 ? 'var(--accent4)' : 'var(--text)'}">${fmt.num(ps.inventarioFinalEst)} unid</div>
                ${ps.inventarioFinalEst > ps.produccion*0.2 ? '<div style="font-size:.7rem;color:var(--accent4)">⚠ Exceso de inventario (&gt;20% de producción)</div>' : ''}
              </div>
            </div>
          </div>

          <div style="background:rgba(255,209,102,.08);border:1px solid rgba(255,209,102,.3);border-radius:var(--r);padding:12px 16px;margin-bottom:20px;font-size:.82rem;color:var(--text2)">
            <strong style="color:var(--accent3)">ℹ️ ¿Qué significa esto?</strong><br>
            Estos son los valores que el simulador usará cuando el profesor ejecute la simulación final. 
            El cálculo considera tu atractivo competitivo frente a los demás equipos y la demanda real del segmento.
            <strong>No puedes modificar estos valores</strong> — son el resultado de tus decisiones ya enviadas.
          </div>

          ${yaConfirmado
            ? `<div style="text-align:center;padding:16px;background:rgba(6,255,165,.08);border:1px solid rgba(6,255,165,.3);border-radius:var(--r)">
                <span style="font-size:1.5rem">✅</span>
                <p style="color:var(--accent5);font-weight:700;margin-top:6px">Ya confirmaste la recepción de este dato</p>
                <p style="color:var(--text2);font-size:.82rem;margin-top:4px">Espera a que el profesor ejecute la simulación final.</p>
               </div>`
            : `<button class="btn btn-success btn-full" style="padding:14px;font-size:.95rem" id="btnConfirmarPresim">
                ✓ Confirmar — Recibí mi demanda estimada
               </button>
               <p style="text-align:center;font-size:.74rem;color:var(--text3);margin-top:8px">
                 Al confirmar le indicas al profesor que viste estos datos y está listo para simular.
               </p>`
          }
        </div>`;

      if (!yaConfirmado) {
        document.getElementById('btnConfirmarPresim')?.addEventListener('click', async () => {
          try {
            await api('POST', '/api/presim/confirmar');
            toast('✅ Confirmado correctamente', 'success');
            await hojaRenderRonda(n, decision, roundState, resultado);
          } catch(e) { toast(e.message, 'error'); }
        });
      }
    } catch(e) {
      cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p style="color:var(--accent4)">${e.message}</p></div>`;
    }
    return;
  }

  const ref = state.ref;
  if (!ref) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Error: datos de referencia no cargados. <button class="btn btn-ghost btn-sm" onclick="location.reload()">Recargar</button></p></div>`;
    return;
  }

  const j = decision.justificaciones || {};
  const isEditable = roundState === 'open' && !decision.submitted;
  const isLocked   = roundState === 'locked';

  const inp = (field, val, type='number', extra='') =>
    isEditable
      ? `<input class="hoja-input editable" data-hoja-field="${field}" type="${type}" value="${val??''}" ${extra}/>`
      : `<span class="hoja-value-ro">${val??'—'}</span>`;

  const sel = (field, opts) =>
    isEditable
      ? `<select class="hoja-select editable" data-hoja-field="${field}">${opts}</select>`
      : `<span class="hoja-value-ro">${decision[field]||'—'}</span>`;

  const ta = (jfield, ph) =>
    isEditable
      ? `<textarea class="hoja-textarea editable" data-hoja-just="${jfield}" placeholder="${ph}">${j[jfield]||''}</textarea>`
      : `<span style="color:var(--text3);font-size:.76rem;font-style:italic">${j[jfield]||'—'}</span>`;

  const chk = (field, label) =>
    isEditable
      ? `<input type="checkbox" data-hoja-field="${field}" ${decision[field]?'checked':''} style="width:16px;height:16px;accent-color:var(--accent)"/> ${label}`
      : `<span class="hoja-value-ro">${decision[field]?'✓ Sí':'✗ No'}</span> ${label}`;

  const segOpts    = ref.segmentos.map(s=>`<option ${s.nombre===decision.segmentoObjetivo?'selected':''}>${s.nombre}</option>`).join('');
  const prodOpts   = ref.tiposProducto.map(t=>`<option ${t.nombre===decision.producto?'selected':''}>${t.nombre} (Bs ${t.costoBase})</option>`).join('');
  // canales puede ser array [{nombre,...}] o objeto {nombre:{...}}
  const _canalNames = Array.isArray(ref.canales)
    ? ref.canales.map(c => c.nombre)
    : Object.keys(ref.canales || {});
  const canalOpts  = ['Ninguno', ..._canalNames].map(c => `<option ${c===decision.canalPrincipal?'selected':''}>${c}</option>`).join('');
  const canal2Opts = ['Ninguno', ..._canalNames].map(c => `<option ${c===decision.canalSecundario?'selected':''}>${c}</option>`).join('');
  const tipoPresOpts = ['Ninguno','Operativo','Inversión'].map(t=>`<option ${t===decision.tipoPrestamo?'selected':''}>${t}</option>`).join('');
  const tipoInnOpts  = ['Producto','Proceso','Canal'].map(t=>`<option ${t===decision.tipoInnovacion?'selected':''}>${t}</option>`).join('');
  const tipoInvOpts  = ['No','Básica','Premium'].map(t=>`<option ${t===decision.tipoInvestigacion?'selected':''}>${t}</option>`).join('');

  const p = ref.parametros || {};
  const estadoBadge = roundState==='simulated' ? '<span class="badge badge-simulated">🔒 Simulada</span>'
    : isLocked ? '<span class="badge badge-alert">🔒 Cerrada</span>'
    : decision.submitted ? '<span class="badge badge-sent">✓ Enviada</span>'
    : '<span class="badge badge-open">🟢 Abierta</span>';

  cont.innerHTML = `
  <div class="hoja-wrap">
    <div class="hoja-team-header">
      <span class="hoja-team-nombre">📋 ${state.me?.nombre||''}</span>
      <span class="hoja-team-ronda">Trimestre ${n} / 20</span>
      <span class="hoja-team-estado">${estadoBadge}</span>
    </div>

    <!-- S1: PRODUCTO Y SEGMENTO -->
    <div class="hoja-section">
      <div class="hoja-section-title">1 · Producto y Segmento Objetivo</div>
      <table class="hoja-table">
        <thead><tr><th>Decisión</th><th>Tu elección</th><th>Referencia</th><th>Justificación</th></tr></thead>
        <tbody>
          <tr><td class="hoja-label">🎯 Segmento objetivo</td>
              <td>${sel('segmentoObjetivo',segOpts)}</td>
              <td class="hoja-ref">7 segmentos disponibles</td>
              <td>${ta('segmentoProducto','¿Por qué este segmento?')}</td></tr>
          <tr><td class="hoja-label">🧪 Tipo de producto</td>
              <td>${sel('producto',prodOpts)}</td>
              <td class="hoja-ref">Costo base varía por tipo</td>
              <td></td></tr>
          <tr><td class="hoja-label">📦 Canal principal</td>
              <td>${sel('canalPrincipal',canalOpts)}</td>
              <td class="hoja-ref">Define costo, comisión e impacto vendedores</td>
              <td>${ta('canal','¿Por qué este canal?')}</td></tr>
          <tr><td class="hoja-label">📦 Canal secundario</td>
              <td>${sel('canalSecundario',canal2Opts)}</td>
              <td class="hoja-ref">Opcional — promedia con canal principal</td>
              <td></td></tr>
          <tr><td class="hoja-label">⭐ Calidad (1–10)</td>
              <td>${inp('calidad',decision.calidad,'number','min="1" max="10" step="1"')}</td>
              <td class="hoja-ref">+0.20 Bs/unid de CU por punto · Afecta atractivo</td>
              <td></td></tr>
          <tr><td class="hoja-label">💰 Precio de venta (Bs)</td>
              <td>${inp('precioVenta',decision.precioVenta,'number','min="0.1" step="0.1"')}</td>
              <td class="hoja-ref">Precio al consumidor final. Afecta atractivo competitivo.</td>
              <td>${ta('precios','¿Estrategia de precio?')}</td></tr>
          <tr><td class="hoja-label">🏭 Producción (unidades)</td>
              <td>${inp('produccion',decision.produccion,'number',`min="0" max="${p.capacidadMaxProduccion||20000}" step="100"`)}</td>
              <td class="hoja-ref">Máx: ${fmt.num(p.capacidadMaxProduccion||20000)} unid</td>
              <td>${ta('produccion','¿Cómo estimaste la demanda?')}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- S2: MARKETING DESAGREGADO -->
    <div class="hoja-section">
      <div class="hoja-section-title">2 · Marketing y Fuerza de Ventas</div>
      <table class="hoja-table">
        <thead><tr><th>Rubro</th><th>Monto (Bs)</th><th>Referencia</th><th>Justificación</th></tr></thead>
        <tbody>
          <tr><td class="hoja-label">📣 Publicidad</td>
              <td>${inp('publicidad',decision.publicidad,'number','min="0" step="500"')}</td>
              <td class="hoja-ref">Impacto en atractivo competitivo</td>
              <td>${ta('marketing','¿Cómo distribuiste el presupuesto?')}</td></tr>
          <tr><td class="hoja-label">🎁 Promoción</td>
              <td>${inp('promocion',decision.promocion,'number','min="0" step="500"')}</td>
              <td class="hoja-ref">Alta eficacia en segmentos masivos</td><td></td></tr>
          <tr><td class="hoja-label">🎪 Eventos</td>
              <td>${inp('eventos',decision.eventos,'number','min="0" step="500"')}</td>
              <td class="hoja-ref">Eficacia media; fortalece posicionamiento</td><td></td></tr>
          <tr><td class="hoja-label">📱 Marketing en redes</td>
              <td>${inp('marketingRedes',decision.marketingRedes,'number','min="0" step="500"')}</td>
              <td class="hoja-ref">Alta eficacia en segmentos Natural y Cosmético</td><td></td></tr>
          <tr><td class="hoja-label">📰 Relaciones públicas</td>
              <td>${inp('relacionesPublicas',decision.relacionesPublicas,'number','min="0" step="500"')}</td>
              <td class="hoja-ref">Alta eficacia en segmentos diferenciados</td><td></td></tr>
          <tr style="border-top:2px solid var(--border2)">
            <td class="hoja-label">👥 Vendedores actuales</td>
            <td><span class="hoja-value-ro">${decision.vendedoresIniciales||0}</span></td>
            <td class="hoja-ref">Propagado de ronda anterior</td><td></td></tr>
          <tr><td class="hoja-label">➕ Contratar vendedores</td>
              <td>${inp('contratarVendedores',decision.contratarVendedores,'number','min="0" max="10" step="1"')}</td>
              <td class="hoja-ref">Bs ${fmt.num(p.costoContratacionVendedor||500)} c/u · Sueldo Bs ${fmt.num(p.sueldoTrimestralVendedor||2400)}/trim.</td><td></td></tr>
          <tr><td class="hoja-label">➖ Despedir vendedores</td>
              <td>${inp('despedirVendedores',decision.despedirVendedores,'number','min="0" step="1"')}</td>
              <td class="hoja-ref">Bs ${fmt.num(p.costoDespidoVendedor||800)} c/u</td><td></td></tr>
        </tbody>
      </table>
    </div>

    <!-- S3: FINANCIAMIENTO -->
    <div class="hoja-section">
      <div class="hoja-section-title">3 · Financiamiento</div>
      <table class="hoja-table">
        <thead><tr><th>Decisión</th><th>Tu elección</th><th>Referencia</th><th>Justificación</th></tr></thead>
        <tbody>
          <tr><td class="hoja-label">🏦 Tipo de préstamo</td>
              <td>${sel('tipoPrestamo',tipoPresOpts)}</td>
              <td class="hoja-ref">Operativo: ${fmt.pct(p.tasaPrestamoOperativo||0.04)} trim. · Inversión: ${fmt.pct(p.tasaPrestamoInversion||0.03)} trim.</td>
              <td>${ta('finanzas','¿Necesitas financiamiento? ¿Por qué?')}</td></tr>
          <tr><td class="hoja-label">💵 Monto (Bs)</td>
              <td>${inp('montoPrestamo',decision.montoPrestamo,'number','min="0" step="1000"')}</td>
              <td class="hoja-ref">Comisión apertura: ${fmt.pct(p.comisionAperturaPrestamo||0.01)}</td><td></td></tr>
          <tr><td class="hoja-label">⏳ Plazo (trimestres)</td>
              <td>${inp('plazoPrestamo',decision.plazoPrestamo,'number','min="1" max="8" step="1"')}</td>
              <td class="hoja-ref">Op: ${p.plazoPrestamoOperativo||2} trim. · Inv: ${p.plazoPrestamoInversion||4} trim.</td><td></td></tr>
          <tr><td class="hoja-label">📉 Amortización (Bs)</td>
              <td>${inp('amortizacion',decision.amortizacion,'number','min="0" step="1000"')}</td>
              <td class="hoja-ref">Pago de deuda existente. No exceder deuda total.</td><td></td></tr>
        </tbody>
      </table>
      <div style="padding:8px 14px;background:var(--bg3);font-size:.78rem;color:var(--text2)">
        <strong>Situación financiera actual:</strong>
        Caja Bs ${fmt.bs(decision.cajaInicial)} · CxC Bs ${fmt.bs(decision.cxcInicial)} · Deuda Bs ${fmt.bs(decision.deudaInicial)} · Inventario ${fmt.num(decision.inventarioInicial)} unid
      </div>
    </div>

    <!-- S4: INNOVACIÓN -->
    <div class="hoja-section">
      <div class="hoja-section-title">4 · Innovación</div>
      <table class="hoja-table">
        <thead><tr><th>Decisión</th><th>Tu elección</th><th>Referencia</th><th>Justificación</th></tr></thead>
        <tbody>
          <tr><td class="hoja-label">💡 ¿Innovar este trimestre?</td>
              <td><label style="display:flex;align-items:center;gap:8px;cursor:pointer">${chk('innovacion','Sí, innovar')}</label></td>
              <td class="hoja-ref">Afecta costo unitario o atractivo según tipo</td>
              <td>${ta('innovacion','¿Por qué innovar y en qué?')}</td></tr>
          <tr><td class="hoja-label">🔧 Tipo de innovación</td>
              <td>${sel('tipoInnovacion',tipoInnOpts)}</td>
              <td class="hoja-ref">Producto: +CU · Proceso: −CU · Canal: +atractivo</td><td></td></tr>
          <tr><td class="hoja-label">💰 Inversión en innovación (Bs)</td>
              <td>${inp('montoInnovacion',decision.montoInnovacion,'number','min="0" step="1000"')}</td>
              <td class="hoja-ref">Se desembolsa este trimestre (gasto operativo)</td><td></td></tr>
        </tbody>
      </table>
    </div>

    <!-- S5: INVESTIGACIÓN DE MERCADO -->
    <div class="hoja-section">
      <div class="hoja-section-title">5 · Investigación de Mercado</div>
      <table class="hoja-table">
        <thead><tr><th>Decisión</th><th>Tu elección</th><th>Qué incluye</th><th>Justificación</th></tr></thead>
        <tbody>
          <tr><td class="hoja-label">🔍 Tipo de reporte</td>
              <td>${sel('tipoInvestigacion',tipoInvOpts)}</td>
              <td class="hoja-ref">
                <strong>Básico Bs ${fmt.num(p.costoInvestigacionBasica||4000)}:</strong> tamaño de mercado, precios, alertas<br>
                <strong>Premium Bs ${fmt.num(p.costoInvestigacionPremium||7500)}:</strong> + participación, sensibilidad, recomendaciones
              </td>
              <td>${ta('investigacion','¿Por qué comprar este reporte?')}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- S6: RESUMEN DE VALORES -->
    <div class="hoja-section">
      <div class="hoja-section-title">6 · Resumen de Valores</div>
      <div class="hoja-resumen-grid" id="hojaResumen">${hojaResumenV2(decision)}</div>
    </div>

    ${resultado ? hojaKpiHTML(resultado) : ''}

    <div class="hoja-actions">
      ${isEditable
        ? `<button class="btn btn-ghost" id="btnHojaGuardar">💾 Guardar borrador</button>
           <button class="btn btn-success" id="btnHojaEnviar">✓ Enviar decisiones</button>`
        : `<span style="color:var(--text3);font-size:.82rem">
             ${roundState==='simulated' ? '🔒 Simulada — ver Estados Financieros en el menú 📊'
               : roundState==='pending' ? '⏸ Esperando activación del profesor.'
               : isLocked ? '🔒 Envío cerrado.'
               : '✅ Enviada — esperando simulación.'}
           </span>`}
    </div>
  </div>`;

  if (isEditable) {
    cont.querySelectorAll('[data-hoja-field]').forEach(el => {
      el.addEventListener(el.type==='checkbox'?'change':'input', () => {
        const v = el.type==='checkbox' ? el.checked
                : el.type==='number'   ? +el.value
                : el.tagName==='SELECT'? el.value.replace(/\s*\(Bs[\s\d.]+\)\s*$/,'').trim()
                : el.value;
        decision[el.dataset.hojaField] = v;
        if (state.decisiones) state.decisiones[el.dataset.hojaField] = v;
        const r = document.getElementById('hojaResumen');
        if (r) r.innerHTML = hojaResumenV2(decision);
      });
    });
    cont.querySelectorAll('[data-hoja-just]').forEach(el => {
      el.addEventListener('input', () => {
        if (!decision.justificaciones) decision.justificaciones = {};
        decision.justificaciones[el.dataset.hojaJust] = el.value;
        if (state.decisiones?.justificaciones) state.decisiones.justificaciones[el.dataset.hojaJust] = el.value;
      });
    });
    document.getElementById('btnHojaGuardar')?.addEventListener('click', async () => {
      try { await api('POST','/api/decisiones/guardar',{decision}); toast('💾 Guardado','success'); }
      catch(e) { toast(e.message,'error'); }
    });
    document.getElementById('btnHojaEnviar')?.addEventListener('click', async () => {
      if (!confirm('¿Enviar decisiones?\n\nEl profesor ejecutará la simulación cuando todos los equipos hayan enviado.')) return;
      try {
        await api('POST','/api/decisiones/enviar',{decision});
        toast('✅ Enviado','success');
        await loadHojaDecision();
      } catch(e) { toast(e.message,'error'); }
    });
  }
}

function hojaResumenV2(d) {
  if (!d) return '';
  const rows = [
    ['Producto',        d.producto],
    ['Segmento',        d.segmentoObjetivo],
    ['Canal principal', d.canalPrincipal],
    ['Canal secundario',d.canalSecundario||'Ninguno'],
    ['Calidad',         d.calidad],
    ['Precio venta',    `Bs ${d.precioVenta??0}`],
    ['Producción',      fmt.num(d.produccion??0)+' unid'],
    ['Publicidad',      fmt.bs(d.publicidad??0)],
    ['Promoción',       fmt.bs(d.promocion??0)],
    ['Eventos',         fmt.bs(d.eventos??0)],
    ['Mkt redes',       fmt.bs(d.marketingRedes??0)],
    ['RRPP',            fmt.bs(d.relacionesPublicas??0)],
    ['Contratar vend.', d.contratarVendedores??0],
    ['Despedir vend.',  d.despedirVendedores??0],
    ['Préstamo tipo',   d.tipoPrestamo||'Ninguno'],
    ['Monto préstamo',  fmt.bs(d.montoPrestamo??0)],
    ['Amortización',    fmt.bs(d.amortizacion??0)],
    ['Innovación',      d.innovacion?`Sí — ${d.tipoInnovacion}`:'No'],
    ['Monto innovación',fmt.bs(d.montoInnovacion??0)],
    ['Investigación',   d.tipoInvestigacion||'No'],
  ];
  return rows.map(([l,v])=>`
    <div class="hoja-resumen-row">
      <span class="hoja-resumen-label">${l}</span>
      <span class="hoja-resumen-val">${v??'—'}</span>
    </div>`).join('');
}

// KPI rápido al final de la hoja (cuando la ronda está simulada)
function hojaKpiHTML(r) {
  if (!r) return '';
  return `
  <div class="hoja-section">
    <div class="hoja-section-title" style="color:var(--accent5)">📊 Resultados del Trimestre (resumen)</div>
    <div class="hoja-resumen-grid">
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Ventas reales</span><span class="hoja-resumen-val">${fmt.num(r.ventasReales)} unid</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Market share</span><span class="hoja-resumen-val">${fmt.pct(r.shareReal)}</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Ventas netas</span><span class="hoja-resumen-val">${fmt.bs(r.ventasNetas)}</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Utilidad bruta</span><span class="hoja-resumen-val" style="color:${r.utilidadBruta>=0?'var(--accent2)':'var(--accent4)'}">${fmt.bs(r.utilidadBruta)}</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Utilidad neta</span><span class="hoja-resumen-val" style="color:${r.utilidadNeta>=0?'var(--accent5)':'var(--accent4)'}">${fmt.bs(r.utilidadNeta)}</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Caja final</span><span class="hoja-resumen-val" style="color:${r.cajaFinal>=0?'var(--accent2)':'var(--accent4)'}">${fmt.bs(r.cajaFinal)} <span class="badge ${r.alertaCaja==='ALERTA'?'badge-alert':'badge-ok'}">${r.alertaCaja}</span></span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Costo unitario</span><span class="hoja-resumen-val">Bs ${fmt.d(r.costoUnitario,3)}</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Inventario final</span><span class="hoja-resumen-val">${fmt.num(r.inventarioFinal)} unid</span></div>
    </div>
    <p style="padding:8px 14px;font-size:.78rem;color:var(--text2)">Ver <strong>📊 Estados Financieros</strong> para P&L completo, Balance General y Flujo de Efectivo.</p>
  </div>`;
}

async function loadEquipoResultados() {
  const data = await api('GET','/api/resultados');
  const el = document.getElementById('equipoResultadosContent');
  if (!el) return;

  if (!data.historial?.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Aún no hay rondas simuladas.</p></div>`;
    return;
  }

  const latest = data.historial[data.historial.length - 1];
  const nav = data.historial.map(h=>`<button class="ronda-btn simulated" onclick="mostrarKpiRonda(${h.ronda})">Ronda ${h.ronda}</button>`).join('');
  el.innerHTML = `<div class="ronda-selector">${nav}</div><div id="kpiDetalle"></div>`;
  mostrarKpiRonda(latest.ronda, data.historial);
}

window.mostrarKpiRonda = (n, historial) => {
  document.querySelectorAll('#equipoResultadosContent .ronda-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace('Ronda ',''))===n);
  });
  if (!historial) { api('GET','/api/resultados').then(d=>mostrarKpiRonda(n,d.historial)); return; }
  const item = historial.find(h=>h.ronda===n);
  if (!item) return;
  const r = item.resultado;

  // ── Calculated KPIs ──
  const mgBruto   = r.ventasNetas>0 ? (r.utilidadBruta/r.ventasNetas*100).toFixed(2) : '—';
  const mgNeto    = r.ventasNetas>0 ? (r.utilidadNeta/r.ventasNetas*100).toFixed(2)  : '—';
  const endeud    = r.totalActivos>0 ? (r.deudaFinal/r.totalActivos*100).toFixed(2)  : '0.00';
  const invProd   = r.produccion>0 ? (r.inventarioFinal/r.produccion*100).toFixed(1) : '0.0';
  const vendFin   = r.vendedoresFinales || 0;
  const ventasPorVend = vendFin>0 ? fmt.num(Math.round(r.ventasReales/vendFin)) : '—';
  const ingrPorVend  = vendFin>0 ? fmt.bs(Math.round(r.ventasNetas/vendFin))   : '—';
  const utilPorUnid  = r.ventasReales>0 ? fmt.d((r.ventasNetas-r.costoVentas)/r.ventasReales,3) : '—';
  const liquidez  = r.deudaFinal>0 ? fmt.d((r.cajaFinal+r.cxcFinal+r.invFinalValorizado)/r.deudaFinal,2) : '∞';

  const kpiRow = (label, value, color='') =>
    `<tr><td style="padding:8px 14px;color:var(--text2);font-size:.82rem">${label}</td>
         <td style="padding:8px 14px;font-family:var(--font-mono);font-size:.82rem;text-align:right;color:${color||'var(--text)'}">${value}</td></tr>`;

  document.getElementById('kpiDetalle').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-top:14px">

      <div class="result-round-card">
        <div class="result-round-header"><h3>📦 Ventas y Producción</h3></div>
        <table style="width:100%;border-collapse:collapse">
          ${kpiRow('Ventas en unidades',           fmt.num(r.ventasReales))}
          ${kpiRow('Producción',                   fmt.num(r.produccion))}
          ${kpiRow('Inventario final (unidades)',  fmt.num(r.inventarioFinal))}
          ${kpiRow('Inventario / Producción',      invProd+'%', +invProd>20?'var(--accent4)':'var(--accent5)')}
          ${kpiRow('Participación en segmento',    fmt.pct(r.shareReal), r.shareReal>0.3?'var(--accent5)':'var(--accent3)')}
        </table>
      </div>

      <div class="result-round-card">
        <div class="result-round-header"><h3>💰 Rentabilidad</h3></div>
        <table style="width:100%;border-collapse:collapse">
          ${kpiRow('Margen bruto',                 mgBruto+'%', +mgBruto<0?'var(--accent4)':'var(--accent5)')}
          ${kpiRow('Margen neto',                  mgNeto+'%',  +mgNeto<0?'var(--accent4)':'var(--accent5)')}
          ${kpiRow('Costo unitario (Bs)',           fmt.d(r.costoUnitario,3))}
          ${kpiRow('Precio de venta (Bs)',          fmt.d(r.precioVenta||0,2))}
          ${kpiRow('Utilidad por unidad vendida',  utilPorUnid)}
        </table>
      </div>

      <div class="result-round-card">
        <div class="result-round-header"><h3>👥 Fuerza de Ventas</h3></div>
        <table style="width:100%;border-collapse:collapse">
          ${kpiRow('Vendedores finales',            vendFin)}
          ${kpiRow('Ventas por vendedor (unid)',    ventasPorVend)}
          ${kpiRow('Ingresos netos por vendedor',   ingrPorVend)}
        </table>
      </div>

      <div class="result-round-card">
        <div class="result-round-header"><h3>🏦 Situación Financiera</h3></div>
        <table style="width:100%;border-collapse:collapse">
          ${kpiRow('Endeudamiento (Deuda/Activos)', endeud+'%', +endeud>50?'var(--accent4)':+endeud>30?'var(--accent3)':'var(--accent5)')}
          ${kpiRow('Liquidez corriente',            liquidez)}
          ${kpiRow('Caja final',                    fmt.bs(r.cajaFinal), r.cajaFinal<=0?'var(--accent4)':'var(--accent5)')}
          ${kpiRow('Sobregiro',                     r.sobregiro>0?fmt.bs(r.sobregiro):'—', r.sobregiro>0?'var(--accent4)':'')}
          ${kpiRow('Deuda total',                   fmt.bs(r.deudaFinal))}
        </table>
      </div>

    </div>`;
};

// ─── Estados Financieros Completos ───────────────────────────
async function loadEquipoFinanciero() {
  const el = document.getElementById('eq-financiero-content');
  const nav = document.getElementById('eq-financiero-nav');
  if (!el) return;

  const data = await api('GET','/api/resultados');
  if (!data.historial?.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Sin rondas simuladas aún.</p></div>`;
    return;
  }

  const latest = data.historial[data.historial.length-1].ronda;
  if (nav) {
    nav.innerHTML = data.historial.map(h =>
      `<button class="ronda-btn simulated" onclick="mostrarFinanciero(${h.ronda})">${h.ronda===latest?'<strong>':''}Ronda ${h.ronda}${h.ronda===latest?'</strong>':''}</button>`
    ).join('');
  }

  // Store historial globally for tab switching
  window._finHistorial = data.historial;
  mostrarFinanciero(latest);
}

window.mostrarFinanciero = (n) => {
  document.querySelectorAll('#eq-financiero-nav .ronda-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace(/\D+/g,''))===n);
  });
  const item = (window._finHistorial||[]).find(h=>h.ronda===n);
  const el = document.getElementById('eq-financiero-content');
  if (!item || !el) return;
  const r = item.resultado;

  el.innerHTML = `
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <button class="btn btn-ghost" id="tabPL" onclick="showFinTab('pl')" style="background:var(--accent);color:#fff">📋 Estado de Resultados</button>
    <button class="btn btn-ghost" id="tabBG" onclick="showFinTab('bg')">🏦 Balance General</button>
    <button class="btn btn-ghost" id="tabFC" onclick="showFinTab('fc')">💧 Flujo de Efectivo</button>
    <span style="flex:1"></span>
    <button class="btn btn-ghost" onclick="descargarFinancieroExcel(${n})">📊 Descargar Excel</button>
    <button class="btn btn-ghost" onclick="descargarFinancieroPDF(${n})">📄 Descargar PDF</button>
  </div>

  <!-- Estado de Resultados -->
  <div id="finPL">
    <div class="result-round-card">
      <div class="result-round-header"><h3>Estado de Resultados — Ronda ${n}</h3></div>
      <div style="padding:16px 20px">
        ${finRow('Ventas brutas',              r.ventasBrutas,         false, 'neutral')}
        ${finRow('(−) Comisiones canal',       -r.comisiones,          false, 'neg')}
        ${finRowSub('= Ventas netas',          r.ventasNetas,          true)}
        ${finRow('(−) Costo de ventas',        -r.costoVentas,         false, 'neg')}
        ${finRowSub('= Utilidad bruta',        r.utilidadBruta,        true)}
        <div style="height:6px"></div>
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border)">Gastos Operativos</div>
        ${finRow('Publicidad',                 -r.publicidad,          false,'neg')}
        ${finRow('Promoción',                  -r.promocion,           false,'neg')}
        ${finRow('Eventos',                    -r.eventos,             false,'neg')}
        ${finRow('Marketing en redes',         -r.marketingRedes,      false,'neg')}
        ${finRow('Relaciones públicas',        -r.relacionesPublicas,  false,'neg')}
        ${finRow('Fuerza de ventas',           -r.costoVendedores,     false,'neg')}
        ${finRow('Gasto administrativo fijo',  -r.gastoAdminFijo,      false,'neg')}
        ${finRow('Gasto fijo de planta',       -r.gastoFijoPlanta,     false,'neg')}
        ${finRow('Depreciación',               -r.depreciacion,        false,'neg')}
        ${finRow('Almacenamiento inventario',  -r.costoAlmacenamiento, false,'neg')}
        ${r.gastoInnovacion>0 ? finRow('Innovación',-(r.gastoInnovacion), false,'neg') : ''}
        ${finRow('Intereses préstamo',         -r.interesesPrestamo,   false,'neg')}
        ${r.interesSobregiro>0 ? finRow('Intereses sobregiro',-(r.interesSobregiro), false,'neg') : ''}
        ${finRow('Comisión apertura préstamo', -r.comisionApertura,    false,'neg')}
        <div style="height:4px;border-top:2px solid var(--border2)"></div>
        ${finRowSub('= Utilidad neta',         r.utilidadNeta,         true)}
      </div>
    </div>
  </div>

  <!-- Balance General -->
  <div id="finBG" style="display:none">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="result-round-card">
        <div class="result-round-header"><h3>Activos</h3></div>
        <div style="padding:16px 20px">
          ${finRow('Caja',                    r.cajaFinal,           false,'pos')}
          ${finRow('Cuentas por cobrar (CxC)', r.cxcFinal,           false,'neutral')}
          ${finRow('Inventarios',              r.invFinalValorizado,  false,'neutral')}
          ${finRow('Activos fijos netos',      r.afNetos,            false,'neutral')}
          <div style="height:4px;border-top:2px solid var(--border2)"></div>
          ${finRowSub('= Total Activos',       r.totalActivos,        true)}
        </div>
      </div>
      <div>
        <div class="result-round-card" style="margin-bottom:12px">
          <div class="result-round-header"><h3>Pasivos</h3></div>
          <div style="padding:16px 20px">
            ${finRow('Deuda total (préstamos)', r.deudaFinal,        false,'neg')}
            <div style="height:4px;border-top:2px solid var(--border2)"></div>
            ${finRowSub('= Total Pasivos',      r.deudaFinal,         true)}
          </div>
        </div>
        <div class="result-round-card">
          <div class="result-round-header"><h3>Patrimonio</h3></div>
          <div style="padding:16px 20px">
            ${finRow('Capital contable',        r.capitalContable,    false,'neutral')}
            ${finRow('Resultado acumulado',     r.resultadoAcumulado, false, r.resultadoAcumulado>=0?'pos':'neg')}
            <div style="height:4px;border-top:2px solid var(--border2)"></div>
            ${finRowSub('= Patrimonio',         r.patrimonio,         true)}
          </div>
        </div>
        <div style="margin-top:8px;padding:8px 12px;background:${Math.abs(r.totalActivos-r.deudaFinal-r.patrimonio)<1?'rgba(6,255,165,.08)':'rgba(255,107,107,.08)'};border-radius:var(--r);font-size:.78rem;font-family:var(--font-mono)">
          ${Math.abs(r.totalActivos-r.deudaFinal-r.patrimonio)<1?'✓ Balance cuadra':'⚠ Verificar balance'}
          (Activos = ${fmt.bs(r.totalActivos)} | P+P = ${fmt.bs(r.deudaFinal + r.patrimonio)})
        </div>
      </div>
    </div>
  </div>

  <!-- Flujo de Efectivo -->
  <div id="finFC" style="display:none">
    <div class="result-round-card">
      <div class="result-round-header"><h3>Flujo de Efectivo — Ronda ${n}</h3></div>
      <div style="padding:16px 20px">
        ${finRow('Caja inicial',               r.cajaInicial,          false,'neutral')}
        <div style="height:6px"></div>
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent2);text-transform:uppercase;letter-spacing:1px;padding:4px 0">Entradas</div>
        ${finRow('Cobros al contado + CxC cobrado', r.cobrosContado,   false,'pos')}
        ${r.ingresoPrestamo>0 ? finRow('Ingreso préstamo', r.ingresoPrestamo, false,'pos') : ''}
        ${r.sobregiro>0 ? finRow('Sobregiro tomado', r.sobregiro, false,'pos') : ''}
        <div style="height:6px"></div>
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent4);text-transform:uppercase;letter-spacing:1px;padding:4px 0">Salidas</div>
        ${finRow('Pago producción',            -r.pagoProduccion,       false,'neg')}
        ${finRow('Pago marketing total',       -r.pagoMktTotal,         false,'neg')}
        ${r.pagoInnovacion>0 ? finRow('Pago innovación', -r.pagoInnovacion, false,'neg') : ''}
        ${finRow('Pago gastos administrativos',-r.pagoAdmin,            false,'neg')}
        ${finRow('Pago gastos de planta',      -r.pagoPlanta,           false,'neg')}
        ${finRow('Pago intereses',             -r.pagoIntereses,        false,'neg')}
        ${r.pagoApertura>0 ? finRow('Pago comisión apertura', -r.pagoApertura, false,'neg') : ''}
        ${finRow('Pago almacenamiento',        -r.pagoAlmacen,          false,'neg')}
        <div style="height:4px;border-top:2px solid var(--border2)"></div>
        ${finRowSub('= Caja final',            r.cajaFinal,             true)}
        ${r.sobregiro>0 ? `<div style="padding:6px 0;font-size:.76rem;color:var(--accent4)">⚠ Sobregiro activado: Bs ${fmt.num(r.sobregiro)} · Interés: Bs ${fmt.num(r.interesSobregiro||0)}</div>` : ''}
      </div>
    </div>
  </div>`;
};

function finRow(label, value, bold=false, type='neutral') {
  const col = type==='pos' ? 'var(--accent5)' : type==='neg' ? 'var(--accent4)' : 'var(--text)';
  const w = bold ? 'font-weight:700' : '';
  return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:.83rem;${w}">
    <span style="color:var(--text2)">${label}</span>
    <span style="font-family:var(--font-mono);font-size:.8rem;color:${col}">${fmt.bs(value)}</span>
  </div>`;
}

function finRowSub(label, value, bold=false) {
  const col = value>=0 ? 'var(--accent5)' : 'var(--accent4)';
  return `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:.85rem;font-weight:700;margin-top:2px">
    <span>${label}</span>
    <span style="font-family:var(--font-mono);color:${col}">${fmt.bs(value)}</span>
  </div>`;
}

window.showFinTab = (tab) => {
  ['pl','bg','fc'].forEach(t => {
    const el = document.getElementById(`fin${t.toUpperCase()}`);
    if (el) el.style.display = t===tab ? '' : 'none';
  });
  const labels = {pl:'tabPL',bg:'tabBG',fc:'tabFC'};
  Object.entries(labels).forEach(([t,id]) => {
    const btn = document.getElementById(id);
    if (btn) { btn.style.background = t===tab?'var(--accent)':''; btn.style.color = t===tab?'#fff':''; }
  });
};

// ─── Descarga de Estados Financieros (Excel / PDF) ───────────────
function _finGetItem(n) {
  return (window._finHistorial||[]).find(h => h.ronda === n) || null;
}

// Fuente ÚNICA de datos para Excel y PDF: replica línea por línea lo que pinta
// mostrarFinanciero(). Gastos/deducciones van con signo negativo (sumables).
function _buildEstadosFinancieros(r) {
  const resultados = [
    ['Ventas brutas',              r.ventasBrutas],
    ['(−) Comisiones canal',       -r.comisiones],
    ['= Ventas netas',             r.ventasNetas],
    ['(−) Costo de ventas',        -r.costoVentas],
    ['= Utilidad bruta',           r.utilidadBruta],
    ['Publicidad',                 -r.publicidad],
    ['Promoción',                  -r.promocion],
    ['Eventos',                    -r.eventos],
    ['Marketing en redes',         -r.marketingRedes],
    ['Relaciones públicas',        -r.relacionesPublicas],
    ['Fuerza de ventas',           -r.costoVendedores],
    ['Gasto administrativo fijo',  -r.gastoAdminFijo],
    ['Gasto fijo de planta',       -r.gastoFijoPlanta],
    ['Depreciación',               -r.depreciacion],
    ['Almacenamiento inventario',  -r.costoAlmacenamiento],
  ];
  if (r.gastoInnovacion > 0) resultados.push(['Innovación', -r.gastoInnovacion]);
  resultados.push(['Intereses préstamo', -r.interesesPrestamo]);
  if (r.interesSobregiro > 0) resultados.push(['Intereses sobregiro', -r.interesSobregiro]);
  resultados.push(['Comisión apertura préstamo', -r.comisionApertura]);
  resultados.push(['= Utilidad neta', r.utilidadNeta]);

  const cuadra = Math.abs(r.totalActivos - r.deudaFinal - r.patrimonio) < 1;
  const balance = [
    ['ACTIVOS', ''],
    ['Caja',                      r.cajaFinal],
    ['Cuentas por cobrar (CxC)',  r.cxcFinal],
    ['Inventarios',               r.invFinalValorizado],
    ['Activos fijos netos',       r.afNetos],
    ['= Total Activos',           r.totalActivos],
    ['PASIVOS', ''],
    ['Deuda total (préstamos)',   r.deudaFinal],
    ['= Total Pasivos',           r.deudaFinal],
    ['PATRIMONIO', ''],
    ['Capital contable',          r.capitalContable],
    ['Resultado acumulado',       r.resultadoAcumulado],
    ['= Patrimonio',              r.patrimonio],
    ['Chequeo de cuadre',         cuadra ? '✓ Balance cuadra' : '⚠ Verificar balance'],
  ];

  const flujo = [
    ['Caja inicial',                       r.cajaInicial],
    ['Cobros al contado + CxC cobrado',    r.cobrosContado],
  ];
  if (r.ingresoPrestamo > 0) flujo.push(['Ingreso préstamo', r.ingresoPrestamo]);
  if (r.sobregiro > 0)       flujo.push(['Sobregiro tomado', r.sobregiro]);
  flujo.push(['Pago producción',            -r.pagoProduccion]);
  flujo.push(['Pago marketing total',       -r.pagoMktTotal]);
  if (r.pagoInnovacion > 0) flujo.push(['Pago innovación', -r.pagoInnovacion]);
  flujo.push(['Pago gastos administrativos', -r.pagoAdmin]);
  flujo.push(['Pago gastos de planta',       -r.pagoPlanta]);
  flujo.push(['Pago intereses',              -r.pagoIntereses]);
  if (r.pagoApertura > 0) flujo.push(['Pago comisión apertura', -r.pagoApertura]);
  flujo.push(['Pago almacenamiento',         -r.pagoAlmacen]);
  flujo.push(['= Caja final',                r.cajaFinal]);

  return { resultados, balance, flujo };
}

function _finFileName(r, n, ext) {
  const safe = (r.equipoNombre || r.equipo || 'equipo').replace(/[^\w\-]+/g, '_');
  return `Estado_Financiero_R${n}_${safe}.${ext}`;
}

window.descargarFinancieroExcel = (n) => {
  if (typeof XLSX === 'undefined') { toast('Librería Excel no disponible (sin conexión al CDN)', 'error'); return; }
  const item = _finGetItem(n);
  if (!item) { toast('No hay datos de esa ronda', 'error'); return; }
  const r = item.resultado;
  const est = _buildEstadosFinancieros(r);
  const wb = XLSX.utils.book_new();
  const hoja = (titulo, rows) => {
    const ws = XLSX.utils.aoa_to_sheet([[titulo, ''], ['Concepto', 'Monto (Bs)'], ...rows]);
    ws['!cols'] = [{ wch: 34 }, { wch: 16 }];
    return ws;
  };
  XLSX.utils.book_append_sheet(wb, hoja(`Estado de Resultados — Ronda ${n}`, est.resultados), 'Estado de Resultados');
  XLSX.utils.book_append_sheet(wb, hoja(`Balance General — Ronda ${n}`, est.balance), 'Balance General');
  XLSX.utils.book_append_sheet(wb, hoja(`Flujo de Efectivo — Ronda ${n}`, est.flujo), 'Flujo de Efectivo');
  XLSX.writeFile(wb, _finFileName(r, n, 'xlsx'));
};

window.descargarFinancieroPDF = (n) => {
  if (!window.jspdf || !window.jspdf.jsPDF) { toast('Librería PDF no disponible (sin conexión al CDN)', 'error'); return; }
  const item = _finGetItem(n);
  if (!item) { toast('No hay datos de esa ronda', 'error'); return; }
  const r = item.resultado;
  const est = _buildEstadosFinancieros(r);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const money = v => (typeof v === 'number')
    ? v.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v;
  doc.setFontSize(14);
  doc.text(`Estado Financiero — Ronda ${n}`, 14, 16);
  doc.setFontSize(10);
  doc.text(`Equipo: ${r.equipoNombre || r.equipo || '—'}`, 14, 23);
  doc.text(`Segmento: ${r.segmento || '—'}  ·  Producto: ${r.producto || '—'}`, 14, 28);
  if (item.ejecutadaAt) doc.text(`Fecha: ${new Date(item.ejecutadaAt).toLocaleString('es-BO')}`, 14, 33);
  let y = 40;
  const tabla = (titulo, rows) => {
    doc.autoTable({
      startY: y,
      head: [[titulo, 'Monto (Bs)']],
      body: rows.map(([c, v]) => [c, money(v)]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [40, 40, 60] },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  };
  tabla('Estado de Resultados', est.resultados);
  tabla('Balance General', est.balance);
  tabla('Flujo de Efectivo', est.flujo);
  doc.save(_finFileName(r, n, 'pdf'));
};

window.mostrarRondaResultado = async (n, historial) => {
  // Update active btn
  document.querySelectorAll('#equipoResultadosContent .ronda-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace('Ronda ','')) === n);
  });

  if (!historial) {
    const data = await api('GET','/api/resultados');
    historial = data.historial;
  }
  const item = historial.find(h => h.ronda === n);
  if (!item) return;
  const r = item.resultado;

  document.getElementById('resultadoRondaDetalle').innerHTML = `
    <div class="result-round-card">
      <div class="result-round-header">
        <h3>Ronda ${n} — ${r.segmento} · ${r.tipoProducto}</h3>
        <span style="font-size:.74rem;color:var(--text3)">${fmt.dt(item.ejecutadaAt)}</span>
      </div>
      <div class="kpi-grid">
        <div>
          <div class="kpi-row"><span class="kpi-label">Demanda estimada</span><span class="kpi-value">${fmt.num(r.demandaEstimada)} unid</span></div>
          <div class="kpi-row"><span class="kpi-label">Ventas reales</span><span class="kpi-value warn">${fmt.num(r.ventasReales)} unid</span></div>
          <div class="kpi-row"><span class="kpi-label">Inventario final</span><span class="kpi-value">${fmt.num(r.inventarioFinal)} unid</span></div>
          <div class="kpi-row"><span class="kpi-label">Ingresos</span><span class="kpi-value">${fmt.bs(r.ingresos)}</span></div>
          <div class="kpi-row"><span class="kpi-label">Costo de ventas</span><span class="kpi-value">${fmt.bs(r.costoVentas)}</span></div>
          <div class="kpi-row"><span class="kpi-label">EBIT</span><span class="kpi-value ${r.ebit>=0?'up':'down'}">${fmt.bs(r.ebit)}</span></div>
          <div class="kpi-row"><span class="kpi-label">Utilidad neta</span><span class="kpi-value ${r.utilidadNeta>=0?'up':'down'}">${fmt.bs(r.utilidadNeta)}</span></div>
        </div>
        <div>
          <div class="kpi-row"><span class="kpi-label">Caja final</span><span class="kpi-value ${r.cajaFinal>=0?'up':'down'}">${fmt.bs(r.cajaFinal)} <span class="badge ${r.alertaCaja==='ALERTA'?'badge-alert':'badge-ok'}">${r.alertaCaja}</span></span></div>
          <div class="kpi-row"><span class="kpi-label">CxC final</span><span class="kpi-value">${fmt.bs(r.cxcFinal)}</span></div>
          <div class="kpi-row"><span class="kpi-label">Deuda final</span><span class="kpi-value">${fmt.bs(r.deudaFinal)}</span></div>
          <div class="kpi-row"><span class="kpi-label">Market share seg.</span>
            <div class="share-bar-wrap">
              <div class="share-bar-bg"><div class="share-bar-fill" style="width:${Math.min(100,r.shareReal*100)}%"></div></div>
              <span class="share-val">${fmt.pct(r.shareReal)}</span>
            </div>
          </div>
          <div class="kpi-row"><span class="kpi-label">Costo unitario</span><span class="kpi-value">Bs ${fmt.d(r.costoUnitario,3)}</span></div>
          <div class="kpi-row"><span class="kpi-label">ROI Marketing</span><span class="kpi-value ${r.roiMarketing>=1?'up':'down'}">${fmt.d(r.roiMarketing,2)}x</span></div>
          <div class="kpi-row"><span class="kpi-label">Dotación (Op/Adm/Vend)</span><span class="kpi-value">${r.operarios}/${r.admins}/${r.vendedoresFinales}</span></div>
        </div>
      </div>
    </div>
    ${buildEvoChart(historial)}
  `;
  renderEvoCharts(historial);
};

function buildEvoChart(historial) {
  if (historial.length < 2) return '';
  return `<div class="charts-row" style="margin-top:16px">
    <div class="chart-card"><h4>Evolución EBIT (Bs)</h4><div class="chart-wrap"><canvas id="chartEvo"></canvas></div></div>
    <div class="chart-card"><h4>Evolución Caja (Bs)</h4><div class="chart-wrap"><canvas id="chartCajaEvo"></canvas></div></div>
  </div>`;
}

function renderEvoCharts(historial) {
  ['chartEvo','chartCajaEvo'].forEach(id => {
    const c = document.getElementById(id);
    if (!c) return;
    const labels = historial.map(h => `R${h.ronda}`);
    const defOpts = { responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}, scales:{x:{ticks:{color:'#9BA3C4',font:{family:'Space Mono',size:9}},grid:{color:'#2A2F45'}},y:{ticks:{color:'#9BA3C4',font:{family:'Space Mono',size:9}},grid:{color:'#2A2F45'}}} };
    const isEBIT = id === 'chartEvo';
    const values = historial.map(h => isEBIT ? h.resultado.ebit : h.resultado.cajaFinal);
    new Chart(c, { type:'line', data:{ labels, datasets:[{data:values, borderColor:isEBIT?'#6C63FF':'#4ECDC4', backgroundColor:isEBIT?'rgba(108,99,255,.1)':'rgba(78,205,196,.1)', fill:true, tension:.3, pointRadius:4}]}, options:defOpts });
  });
}

// ── Equipo Reportes ────────────────────────────────────────
async function loadEquipoReportes() {
  const data = await api('GET','/api/resultados');
  const el = document.getElementById('reportesContent');
  if (!el) return;

  if (!data.historial?.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>Aún no hay rondas simuladas.</p></div>`;
    return;
  }

  const rondas = data.historial;
  const sel = `<div class="ronda-selector">${rondas.map(h=>`<button class="ronda-btn simulated" onclick="mostrarReporteRonda(${h.ronda})">Ronda ${h.ronda}</button>`).join('')}</div>`;
  el.innerHTML = sel + `<div id="reporteDetalle"></div>`;
  mostrarReporteRonda(rondas[rondas.length-1].ronda, data.historial);
}

window.mostrarReporteRonda = async (n, historialCache) => {
  document.querySelectorAll('#reportesContent .ronda-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace('Ronda ',''))===n);
  });
  const det = document.getElementById('reporteDetalle');
  if (!det) return;
  try {
    const [repData, resData] = await Promise.all([
      api('GET', `/api/reportes/${n}`),
      api('GET', '/api/resultados'),
    ]);
    const rep = repData.reportes;
    const historial = historialCache || resData.historial;
    const item = historial?.find(h=>h.ronda===n);
    const miResult = item?.resultado;

    let html = '';

    // ── RANKING ANÓNIMO (siempre visible) ──────────────────
    if (miResult) {
      const allRes = await api('GET', `/api/dashboard/${n}`);
      const posicion = allRes.ranking.findIndex(r=>r.esYo) + 1;
      const total = allRes.ranking.length;
      const rows = allRes.ranking.map((r,i) => `
        <tr style="${r.esYo?'background:rgba(108,99,255,.08);font-weight:700':''}">
          <td style="text-align:center;font-family:var(--font-mono)">${i+1}</td>
          <td>${r.esYo?'⭐ <strong>Mi equipo</strong>':'Equipo '+(i+1)}</td>
          <td class="num ${r.utilidadNeta>=0?'pos':'neg'}">${fmt.bs(r.utilidadNeta)}</td>
          <td class="num">${fmt.num(r.ventas)}</td>
          <td class="num">${fmt.pct(r.share)}</td>
          <td class="num ${r.caja<=0?'neg':'pos'}">${fmt.bs(r.caja)}</td>
        </tr>`).join('');
      html += `
        <div class="result-round-card" style="margin-bottom:16px">
          <div class="result-round-header">
            <h3>🏆 Ranking — Ronda ${n}</h3>
            <span class="badge ${posicion===1?'badge-ok':'badge-pending'}">Tu posición: ${posicion}/${total}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Equipo</th><th>Utilidad neta</th><th>Ventas (unid)</th><th>Market share</th><th>Caja final</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <p style="padding:8px 16px;font-size:.74rem;color:var(--text3)">Los demás equipos aparecen anónimos. Para ver participación detallada, compra el reporte Premium.</p>
        </div>`;
    }

    // ── INVESTIGACIÓN COMPRADA ─────────────────────────────
    if (!rep.investigacion) {
      html += `<div class="result-round-card">
        <div class="result-round-header"><h3>📊 Investigación de Mercado — Ronda ${n}</h3></div>
        <div style="padding:24px;text-align:center;color:var(--text3)">
          <div style="font-size:2rem;margin-bottom:10px">📭</div>
          <p style="margin-bottom:10px">No compraste reporte de investigación en la ronda ${n}.</p>
          <p style="font-size:.78rem">Puedes comprar <strong>Básico (Bs 4,000)</strong> o <strong>Premium (Bs 7,500)</strong> en tu próxima hoja de decisión.</p>
        </div>
      </div>`;
    } else {
      const inv = rep.investigacion;
      // Mercado
      const mktRows = inv.mercado.map(s=>`<tr>
        <td><strong>${s.segmento}</strong></td>
        <td class="num">${fmt.num(s.demandaBase)}</td>
        <td class="num warn">${s.contrabando}</td>
        <td class="num pos">${fmt.num(s.mercadoFormal)}</td>
        <td><span class="badge ${s.tendencia==='Alto crecimiento'?'badge-high':s.tendencia==='Creciente'?'badge-grow':'badge-stable'}">${s.tendencia}</span></td>
      </tr>`).join('');
      const precRows = inv.precios.map(s=>`<tr>
        <td><strong>${s.segmento}</strong></td>
        <td class="num">${s.precioMin!=null?'Bs '+s.precioMin:'—'}</td>
        <td class="num">${s.precioProm!=null?'Bs '+s.precioProm:'—'}</td>
        <td class="num">${s.precioMax!=null?'Bs '+s.precioMax:'—'}</td>
      </tr>`).join('');

      html += `
        <div class="result-round-card" style="margin-bottom:16px">
          <div class="result-round-header"><h3>📊 ${inv.titulo} — Ronda ${n}</h3></div>
          <div style="padding:16px 20px">
            <p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">Tamaño de Mercado</p>
            <div class="table-wrap" style="margin-bottom:16px">
              <table><thead><tr><th>Segmento</th><th>Demanda total</th><th>Contrabando</th><th>Mercado formal</th><th>Tendencia</th></tr></thead>
              <tbody>${mktRows}</tbody></table>
            </div>
            <p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">Precios Observados</p>
            <div class="table-wrap" style="margin-bottom:16px">
              <table><thead><tr><th>Segmento</th><th>Precio mínimo</th><th>Precio promedio</th><th>Precio máximo</th></tr></thead>
              <tbody>${precRows}</tbody></table>
            </div>
            <p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:8px">Alertas</p>
            <ul style="list-style:none;padding:0">
              ${inv.alertas.map(a=>`<li style="padding:5px 0;border-bottom:1px solid var(--border);font-size:.82rem;color:var(--accent3)">⚠ ${a}</li>`).join('')}
            </ul>`;

      // Premium additions
      if (inv.tipo === 'Premium') {
        const partRows = inv.participacion.map(p=>`<tr>
          <td><strong>${p.segmento}</strong></td>
          <td class="num">${p.equiposCompitiendo}</td>
          <td class="num">${fmt.pct(p.shareMaximo)}</td>
          <td class="num">${fmt.pct(p.sharePromedio)}</td>
        </tr>`).join('');
        const sensRows = inv.sensibilidad.map(s=>`<tr>
          <td><strong>${s.segmento}</strong></td>
          <td>${s.precio}</td><td>${s.calidad}</td><td>${s.redes}</td><td>${s.canal}</td>
        </tr>`).join('');

        html += `
            <p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin:16px 0 8px">PREMIUM — Participación de Mercado</p>
            <div class="table-wrap" style="margin-bottom:16px">
              <table><thead><tr><th>Segmento</th><th>Equipos</th><th>Share máx.</th><th>Share prom.</th></tr></thead>
              <tbody>${partRows}</tbody></table>
            </div>
            <p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:8px">Sensibilidad del Consumidor</p>
            <div class="table-wrap" style="margin-bottom:16px">
              <table><thead><tr><th>Segmento</th><th>Precio</th><th>Calidad</th><th>Redes</th><th>Canal</th></tr></thead>
              <tbody>${sensRows}</tbody></table>
            </div>
            <p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:8px">Recomendaciones Estratégicas</p>
            ${inv.recomendaciones.map(rec=>`
              <div style="background:var(--bg3);border-left:3px solid var(--accent);padding:10px 14px;border-radius:0 var(--r) var(--r) 0;margin-bottom:8px;font-size:.82rem">
                <strong style="color:var(--accent2)">${rec.estrategia}</strong><br>
                Precio: ${rec.precio} · Prioridad: ${rec.prioridad}<br>
                Producción: ${rec.produccion}<br>
                Meta inventario: ${rec.meta}
              </div>`).join('')}`;
      }
      html += `</div></div>`;
    }

    document.getElementById('reporteDetalle').innerHTML = html;
  } catch(e) {
    document.getElementById('reporteDetalle').innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
};

// ── Créditos del Equipo ────────────────────────────────────
async function loadEquipoCreditos() {
  const el = document.getElementById('eq-creditos-content');
  if (!el) return;
  el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>`;
  try {
    const data = await api('GET', '/api/resultados');
    renderCreditosEquipo(el, data.historial || [], data.currentRound, data.roundState, data.tasas || {});
  } catch(e) {
    el.innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
}

function renderCreditosEquipo(el, historial, currentRound, roundState, tasas = {}) {
  if (!historial.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div><p>Sin rondas simuladas aún.</p></div>`;
    return;
  }

  // Libro de deuda por ronda construido con los datos REALES del backend
  // (no un cronograma teórico monto/plazo).
  const filas = historial.map(item => {
    const d = item.decision || {};
    const r = item.resultado || {};
    const deudaInicial = d.deudaInicial ?? 0;
    const ingreso      = r.ingresoPrestamo || 0;
    const amortizacion = d.amortizacion || 0;
    const interes      = r.interesesPrestamo || 0;
    const interesSob   = r.interesSobregiro || 0;
    const sobregiro    = r.sobregiro || 0;
    const saldoFinal   = r.deudaFinal ?? 0;
    // Tasa EXACTA desde params según el tipo de préstamo vigente esa ronda
    // (préstamo nuevo si lo hay; si no, el tipo heredado propagado).
    const tipoVigente  = (d.tipoPrestamo && d.tipoPrestamo !== 'Ninguno')
      ? d.tipoPrestamo : (d.tipoPrestamoPrevio || 'Inversión');
    const tasaAplicada = tipoVigente === 'Operativo'
      ? (tasas.operativo ?? 0) : (tasas.inversion ?? 0);
    // "Pagado" = la ronda registró amortización real (no por nº de ronda)
    const amortizo     = amortizacion > 0;
    return { ronda: item.ronda, deudaInicial, ingreso, amortizacion, interes,
             interesSob, sobregiro, saldoFinal, tasaAplicada, amortizo };
  }).filter(f => f.deudaInicial > 0 || f.ingreso > 0 || f.saldoFinal > 0 || f.sobregiro > 0);

  if (!filas.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>Sin préstamos ni sobregiros registrados.</p></div>`;
    return;
  }

  const rows = filas.map(f => `
    <tr>
      <td style="text-align:center;font-family:var(--font-mono)">${f.ronda}</td>
      <td class="num">${fmt.bs(f.deudaInicial)}</td>
      <td class="num">${f.ingreso>0?fmt.bs(f.ingreso):'—'}</td>
      <td class="num">${f.amortizacion>0?fmt.bs(f.amortizacion):'—'}</td>
      <td class="num">${fmt.bs(f.interes)}${f.interes>0?` <span style="color:var(--text3);font-size:.8em">(${fmt.pct(f.tasaAplicada)})</span>`:''}</td>
      <td class="num">${f.sobregiro>0?fmt.bs(f.sobregiro):'—'}</td>
      <td class="num" style="font-weight:700">${fmt.bs(f.saldoFinal)}</td>
      <td style="text-align:center">${f.amortizo ? '<span class="badge badge-ok">✓ Amortizó</span>' : '<span class="badge badge-pending">⏳ Sin pago</span>'}</td>
    </tr>`).join('');

  const deudaTotal      = historial[historial.length-1]?.resultado?.deudaFinal || 0;
  const totalIntereses  = filas.reduce((s,f)=> s + f.interes + f.interesSob, 0);
  const totalAmortizado = filas.reduce((s,f)=> s + f.amortizacion, 0);

  el.innerHTML = `
    <div class="stat-grid" style="margin-bottom:20px">
      <div class="stat-card"><div class="stat-label">Deuda actual</div><div class="stat-value" style="color:${deudaTotal>0?'var(--accent4)':'var(--accent5)'}">${fmt.bs(deudaTotal)}</div></div>
      <div class="stat-card"><div class="stat-label">Total amortizado</div><div class="stat-value" style="color:var(--accent2)">${fmt.bs(totalAmortizado)}</div></div>
      <div class="stat-card"><div class="stat-label">Intereses pagados</div><div class="stat-value" style="color:var(--accent3)">${fmt.bs(Math.round(totalIntereses*100)/100)}</div></div>
    </div>
    <div class="result-round-card">
      <div class="result-round-header"><h3>💳 Libro de deuda por ronda</h3></div>
      <div class="table-wrap" style="border-radius:0">
        <table>
          <thead><tr><th>Ronda</th><th>Deuda inicial</th><th>Nuevo préstamo</th><th>Amortización</th><th>Interés (tasa ef.)</th><th>Sobregiro</th><th>Saldo final</th><th>Estado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Créditos Admin ─────────────────────────────────────────
async function loadAdminCreditos() {
  if (!requireSimSelected('adminCreditosContent')) return;
  const el = document.getElementById('adminCreditosContent');
  if (!el) return;
  el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>`;

  try {
    const [equipos, historialResp] = await Promise.all([
      api('GET', '/admin/equipos'),
      api('GET', '/admin/historial'),
    ]);

    if (!historialResp.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div><p>Sin rondas simuladas aún.</p></div>`;
      return;
    }

    // Load all simulated rounds
    const rondaData = {};
    for (const h of historialResp.filter(h=>h.estado==='simulated')) {
      try {
        const r = await api('GET', `/admin/resultados/${h.ronda}`);
        rondaData[h.ronda] = r;
      } catch {}
    }

    // Tasas reales (mismas para todas las rondas)
    const tasas = Object.values(rondaData)[0]?.tasas || {};

    // Build per-equipo credit summary
    const tabs = equipos.map((eq,i) => `<button class="seg-tab ${i===0?'active':''}" data-eq="${eq.id}" onclick="showAdminCreditoEquipo('${eq.id}')">${eq.nombre}</button>`).join('');

    const panels = equipos.map((eq,i) => {
      const historialEquipo = Object.entries(rondaData).map(([ronda, rd]) => {
        const res = rd.resultados?.find(r => r.equipo === eq.id);
        return res ? { ronda: parseInt(ronda), resultado: res } : null;
      }).filter(Boolean).sort((a,b)=>a.ronda-b.ronda);

      // Libro de deuda por ronda con datos REALES del motor (sin cronograma teórico).
      // deudaInicial se reconstruye como el deudaFinal de la ronda anterior.
      let deudaPrev = 0;
      const filas = historialEquipo.map(({ronda, resultado: r}) => {
        const deudaInicial = deudaPrev;
        const ingreso      = r.ingresoPrestamo || 0;
        const amortizacion = r.pagoAmortizacion || 0;    // amortización real
        const interes      = r.interesesPrestamo || 0;
        const interesSob   = r.interesSobregiro || 0;
        const sobregiro    = r.sobregiro || 0;
        const saldoFinal   = r.deudaFinal ?? 0;
        // tipo ya resuelto por el backend (préstamo nuevo o heredado)
        const tipoVigente  = r.tipoPrestamo || 'Inversión';
        const tasaAplicada = tipoVigente === 'Operativo'
          ? (tasas.operativo ?? 0) : (tasas.inversion ?? 0);
        const amortizo     = amortizacion > 0;
        deudaPrev = saldoFinal;
        return { ronda, deudaInicial, ingreso, amortizacion, interes, interesSob,
                 sobregiro, saldoFinal, tasaAplicada, amortizo };
      }).filter(f => f.deudaInicial > 0 || f.ingreso > 0 || f.saldoFinal > 0 || f.sobregiro > 0);

      if (!filas.length) {
        return `<div class="seg-panel ${i===0?'active':''}" id="eqCredit_${eq.id}">
          <div class="empty-state"><div class="empty-icon">✅</div><p>Sin préstamos para ${eq.nombre}.</p></div>
        </div>`;
      }

      const rows = filas.map(f => `
        <tr>
          <td style="text-align:center;font-family:var(--font-mono)">${f.ronda}</td>
          <td class="num">${fmt.bs(f.deudaInicial)}</td>
          <td class="num">${f.ingreso>0?fmt.bs(f.ingreso):'—'}</td>
          <td class="num">${f.amortizacion>0?fmt.bs(f.amortizacion):'—'}</td>
          <td class="num">${fmt.bs(f.interes)}${f.interes>0?` <span style="color:var(--text3);font-size:.8em">(${fmt.pct(f.tasaAplicada)})</span>`:''}</td>
          <td class="num">${f.sobregiro>0?fmt.bs(f.sobregiro):'—'}</td>
          <td class="num" style="font-weight:700">${fmt.bs(f.saldoFinal)}</td>
          <td style="text-align:center">${f.amortizo ? '<span class="badge badge-ok">✓ Amortizó</span>' : '<span class="badge badge-pending">⏳ Sin pago</span>'}</td>
        </tr>`).join('');

      const ultimaDeuda     = historialEquipo[historialEquipo.length-1]?.resultado?.deudaFinal || 0;
      const totalIntereses  = filas.reduce((s,f)=> s + f.interes + f.interesSob, 0);
      const totalAmortizado = filas.reduce((s,f)=> s + f.amortizacion, 0);

      return `<div class="seg-panel ${i===0?'active':''}" id="eqCredit_${eq.id}">
        <div class="stat-grid" style="margin-bottom:16px">
          <div class="stat-card"><div class="stat-label">Deuda actual</div><div class="stat-value" style="color:${ultimaDeuda>0?'var(--accent4)':'var(--accent5)'}">${fmt.bs(ultimaDeuda)}</div></div>
          <div class="stat-card"><div class="stat-label">Total amortizado</div><div class="stat-value" style="color:var(--accent2)">${fmt.bs(totalAmortizado)}</div></div>
          <div class="stat-card"><div class="stat-label">Intereses pagados</div><div class="stat-value" style="color:var(--accent3)">${fmt.bs(Math.round(totalIntereses*100)/100)}</div></div>
        </div>
        <div class="result-round-card">
          <div class="result-round-header"><h3>💳 Libro de deuda por ronda — ${eq.nombre}</h3></div>
          <div class="table-wrap" style="border-radius:0">
            <table>
              <thead><tr><th>Ronda</th><th>Deuda inicial</th><th>Nuevo préstamo</th><th>Amortización</th><th>Interés (tasa ef.)</th><th>Sobregiro</th><th>Saldo final</th><th>Estado</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="seg-tabs-bar">${tabs}</div><div class="seg-panels">${panels}</div>`;
  } catch(e) {
    el.innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
}

window.showAdminCreditoEquipo = (id) => {
  document.querySelectorAll('#adminCreditosContent .seg-tab').forEach(b => b.classList.toggle('active', b.dataset.eq===id));
  document.querySelectorAll('#adminCreditosContent .seg-panel').forEach(p => p.classList.toggle('active', p.id==='eqCredit_'+id));
};

// ═══════════════════════════════════════════════════════════
//  Mapa de Posicionamiento Perceptual (precio vs calidad)
// ═══════════════════════════════════════════════════════════
const POS_SEG_COLORS = {
  'Masivo popular':      '#6C63FF',
  'Masivo aspiracional': '#4ECDC4',
  'Funcional familiar':  '#FFD166',
  'Cosmético':           '#FF6B9D',
  'Dermatológico':       '#06D6A0',
  'Natural':             '#83C341',
  'Institucional':       '#F4A259',
};
const POS_SEG_FALLBACK = '#9AA0A6';   // segmentos personalizados fuera del catálogo

function _posHexA(hex, a){
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;
}

// Mini-plugin: líneas de cuadrante en precio/calidad promedio + etiquetas
function _posCuadrantesPlugin(avgP, avgQ){
  return { id:'posCuadrantes', afterDraw(chart){
    const {ctx, chartArea:a, scales} = chart;
    if (!a || !scales.x || !scales.y) return;
    const x = scales.x.getPixelForValue(avgP);
    const y = scales.y.getPixelForValue(avgQ);
    ctx.save();
    ctx.strokeStyle = 'rgba(150,150,150,.45)';
    ctx.setLineDash([5,4]); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom);
    ctx.moveTo(a.left, y); ctx.lineTo(a.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(120,120,120,.6)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Relación calidad-precio', a.left+8, a.top+16);
    ctx.fillText('Liderazgo en costos',     a.left+8, a.bottom-8);
    ctx.textAlign = 'right';
    ctx.fillText('Diferenciación premium',  a.right-8, a.top+16);
    ctx.fillText('Zona de riesgo',          a.right-8, a.bottom-8);
    ctx.restore();
  }};
}

// puntos: [{ esYo, label, precioVenta, calidad, shareReal, atractivo, segmento }]
function renderPosicionamiento(canvasId, puntos, { anonimo }){
  window._posCharts = window._posCharts || {};
  if (window._posCharts[canvasId]) window._posCharts[canvasId].destroy();
  if (!puntos.length) return;

  const avgP = puntos.reduce((s,p)=>s+(p.precioVenta||0),0) / puntos.length;
  const avgQ = puntos.reduce((s,p)=>s+(p.calidad||0),0)     / puntos.length;

  // Un dataset por segmento → leyenda = segmentos, color por segmento
  const segs = [...new Set(puntos.map(p=>p.segmento))];
  const datasets = segs.map(seg => {
    const base = POS_SEG_COLORS[seg] || POS_SEG_FALLBACK;
    const ptos = puntos.filter(p=>p.segmento===seg);
    return {
      label: seg,
      data: ptos.map(p => ({
        x: p.precioVenta, y: p.calidad,
        r: Math.max(6, Math.sqrt(Math.max(0, p.shareReal||0)) * 55),   // área ∝ share
        _meta: p,
      })),
      backgroundColor: ptos.map(p => _posHexA(base, (anonimo && !p.esYo) ? 0.28 : 0.75)),
      borderColor:     ptos.map(p => (anonimo && p.esYo) ? '#ffffff' : base),
      borderWidth:     ptos.map(p => (anonimo && p.esYo) ? 3 : 1),
    };
  });

  window._posCharts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'bubble',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { title:{display:true, text:'Precio (Bs)'}, min:0 },
        y: { title:{display:true, text:'Calidad (1–10)'}, min:0, max:10 },
      },
      plugins: {
        legend: { position:'bottom' },
        tooltip: { callbacks: { label: (ctx) => {
          const m = ctx.raw._meta;
          return [ m.label,
                   `Precio: Bs ${m.precioVenta}`,
                   `Calidad: ${m.calidad}`,
                   `Share: ${((m.shareReal||0)*100).toFixed(1)}%`,
                   `Atractivo: ${(m.atractivo||0).toFixed(1)}` ];
        }}},
      },
    },
    plugins: [ _posCuadrantesPlugin(avgP, avgQ) ],
  });
}

// ── Posicionamiento Admin (nombres reales, usa /admin/resultados/:n) ──
async function loadAdminPosicionamiento(){
  if (!requireSimSelected('posAdminSelector')) return;
  const sel = document.getElementById('posAdminSelector');
  try {
    const hist = await api('GET','/admin/historial');
    const sims = hist.filter(h=>h.estado==='simulated');
    if (!sims.length){
      sel.innerHTML = `<div class="empty-state"><div class="empty-icon">🗺️</div><p>Sin rondas simuladas aún.</p></div>`;
      return;
    }
    const data = {};
    for (const h of sims){
      try { const r = await api('GET', `/admin/resultados/${h.ronda}`); data[h.ronda] = r.resultados || []; } catch {}
    }
    window._posAdmin = data;
    const rondas = Object.keys(data).map(Number).sort((a,b)=>a-b);
    const latest = rondas[rondas.length-1];
    sel.innerHTML = rondas.map(n =>
      `<button class="ronda-btn simulated" onclick="mostrarPosAdmin(${n})">Ronda ${n}</button>`).join('');
    mostrarPosAdmin(latest);
  } catch(e){
    sel.innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
}
window.mostrarPosAdmin = (n) => {
  document.querySelectorAll('#posAdminSelector .ronda-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.textContent.replace(/\D+/g,''))===n));
  const resultados = (window._posAdmin||{})[n] || [];
  const puntos = resultados.map(r => ({ esYo:false, label:r.equipoNombre||r.equipo,
    precioVenta:r.precioVenta, calidad:r.calidad, shareReal:r.shareReal,
    atractivo:r.atractivo, segmento:r.segmento }));
  renderPosicionamiento('posAdminChart', puntos, { anonimo:false });
};

// ── Posicionamiento Equipo (anonimizado vía /api/posicionamiento/:n) ──
async function loadEquipoPosicionamiento(){
  const sel = document.getElementById('posEqSelector');
  if (!sel) return;
  try {
    const data = await api('GET','/api/resultados');
    if (!data.historial?.length){
      sel.innerHTML = `<div class="empty-state"><div class="empty-icon">🗺️</div><p>Sin rondas simuladas aún.</p></div>`;
      return;
    }
    const rondas = data.historial.map(h=>h.ronda);
    const latest = rondas[rondas.length-1];
    sel.innerHTML = rondas.map(n =>
      `<button class="ronda-btn simulated" onclick="mostrarPosEq(${n})">Ronda ${n}</button>`).join('');
    mostrarPosEq(latest);
  } catch(e){
    sel.innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
}
window.mostrarPosEq = async (n) => {
  document.querySelectorAll('#posEqSelector .ronda-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.textContent.replace(/\D+/g,''))===n));
  try {
    const data = await api('GET', `/api/posicionamiento/${n}`);
    renderPosicionamiento('posEqChart', data.puntos || [], { anonimo:true });
  } catch(e){
    document.getElementById('posEqSelector').insertAdjacentHTML('beforeend',
      `<span style="color:var(--accent4);padding:8px">${e.message}</span>`);
  }
};


// ── Dashboard Anónimo del Equipo ───────────────────────────
async function loadEquipoDashboard() {
  const el = document.getElementById('eq-dashboard-content');
  if (!el) return;

  const data = await api('GET', '/api/resultados');
  const last = data.historial?.[data.historial.length - 1];

  if (!last) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Aún no hay rondas simuladas.</p></div>`;
    return;
  }

  // Get anonymous comparison from server
  try {
    const cmp = await api('GET', `/api/dashboard/${last.ronda}`);
    renderEquipoDashboard(el, cmp, last.resultado, data.historial);
  } catch {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Dashboard disponible tras la primera simulación.</p></div>`;
  }
}

function renderEquipoDashboard(el, cmp, miResultado, historial) {
  const miPos = cmp.ranking.findIndex(r => r.esYo) + 1;
  const totalEq = cmp.ranking.length;

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Tu posición (EBIT)</div>
        <div class="stat-value" style="color:var(--accent3)">${miPos}°<span style="font-size:.9rem;color:var(--text3)">/${totalEq}</span></div>
        <div class="stat-sub">en ronda ${cmp.ronda}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tu EBIT</div>
        <div class="stat-value" style="color:${miResultado.ebit>=0?'var(--accent5)':'var(--accent4)'}">${fmt.bs(miResultado.ebit)}</div>
        <div class="stat-sub">EBIT mercado: ${fmt.bs(cmp.stats.ebitPromedio)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tu Market Share</div>
        <div class="stat-value" style="color:var(--accent2)">${fmt.pct(miResultado.shareReal)}</div>
        <div class="stat-sub">en tu segmento</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tu Caja Final</div>
        <div class="stat-value" style="color:${miResultado.cajaFinal>=0?'var(--accent2)':'var(--accent4)'}">${fmt.bs(miResultado.cajaFinal)}</div>
        <div class="stat-sub"><span class="badge ${miResultado.alertaCaja==='ALERTA'?'badge-alert':'badge-ok'}">${miResultado.alertaCaja}</span></div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h4>EBIT Comparativo — Anónimo (Ronda ${cmp.ronda})</h4>
        <div class="chart-wrap"><canvas id="chartCmpEBIT"></canvas></div>
      </div>
      <div class="chart-card">
        <h4>Tu Evolución EBIT (todas las rondas)</h4>
        <div class="chart-wrap"><canvas id="chartMiEBIT"></canvas></div>
      </div>
    </div>

    <div class="table-wrap" style="margin-top:20px">
      <table>
        <thead><tr><th>#</th><th>Empresa</th><th>EBIT</th><th>Ventas (unid)</th><th>Market Share</th><th>Caja</th></tr></thead>
        <tbody>
          ${cmp.ranking.map((r,i) => `
            <tr style="${r.esYo?'background:rgba(108,99,255,.07);':''}">
              <td class="num"><strong>${i+1}</strong></td>
              <td><strong>${r.esYo ? '★ Tu empresa' : `Empresa ${String.fromCharCode(65+i)}`}</strong></td>
              <td class="num ${r.ebit>=0?'pos':'neg'}">${fmt.bs(r.ebit)}</td>
              <td class="num">${fmt.num(r.ventas)}</td>
              <td class="num">
                <div class="share-bar-wrap">
                  <div class="share-bar-bg"><div class="share-bar-fill" style="width:${Math.min(100,r.share*100)}%;background:${r.esYo?'var(--accent)':'var(--border2)'}"></div></div>
                  <span class="share-val">${fmt.pct(r.share)}</span>
                </div>
              </td>
              <td class="num ${r.caja>=0?'pos':'neg'}">${fmt.bs(r.caja)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Charts
  const defOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{color:'#9BA3C4',font:{family:'Space Mono',size:9}},grid:{color:'#2A2F45'}},y:{ticks:{color:'#9BA3C4',font:{family:'Space Mono',size:9}},grid:{color:'#2A2F45'}}} };

  new Chart(document.getElementById('chartCmpEBIT'), {
    type:'bar',
    data:{ labels: cmp.ranking.map((_,i) => i===miPos-1?'★ Yo':`E${String.fromCharCode(65+i)}`),
      datasets:[{ data: cmp.ranking.map(r=>r.ebit),
        backgroundColor: cmp.ranking.map(r => r.esYo ? '#6C63FF' : (r.ebit>=0?'rgba(6,255,165,.4)':'rgba(255,107,107,.4)')),
        borderRadius:4 }]},
    options: defOpts,
  });

  if (historial.length > 1) {
    new Chart(document.getElementById('chartMiEBIT'), {
      type:'line',
      data:{ labels: historial.map(h=>`R${h.ronda}`),
        datasets:[{ data: historial.map(h=>h.resultado.ebit),
          borderColor:'#6C63FF', backgroundColor:'rgba(108,99,255,.1)', fill:true, tension:.3, pointRadius:4 }]},
      options: defOpts,
    });
  }
}
function buildManual() {
  window.open('/manual.html', '_blank');
}

// ── Imprimir Hoja de Decisión ──────────────────────────────
function printHoja() {
  const content = document.getElementById('hojaContent');
  if (!content) return;

  const win = window.open('', '_blank', 'width=1100,height=800');
  win.document.write(`<!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8"/>
    <title>Hoja de Decisión — ${state.me?.nombre} — Ronda ${hojaRondaActual}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',sans-serif;font-size:11px;color:#111;background:#fff;padding:16px}
      h1{font-size:15px;margin-bottom:4px}
      .sub{font-size:10px;color:#666;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:10.5px}
      th{background:#2a2f45;color:#fff;padding:5px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.8px}
      td{padding:5px 8px;border:1px solid #ddd;vertical-align:top}
      tr:nth-child(even) td{background:#f9f9ff}
      .sec-title{background:#4a4080;color:#fff;padding:5px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:10px 0 0}
      .readonly{color:#666;font-style:italic}
      textarea,select,input{border:none;background:transparent;font-family:inherit;font-size:inherit;width:100%;padding:0}
      @media print{body{padding:0}button{display:none!important}}
    </style>
  </head><body>
    <h1>📋 Hoja de Decisión — ${state.me?.nombre}</h1>
    <div class="sub">Trimestre ${hojaRondaActual} / 20 &nbsp;·&nbsp; Simulador de Marketing &nbsp;·&nbsp; Mercado Boliviano de Jaboncillos</div>
    ${content.innerHTML}
    <script>setTimeout(()=>window.print(),400)<\/script>
  </body></html>`);
  win.document.close();
}

// ============================
// ADMIN - Gestión de Profesores
// ============================

async function loadAdminProfesores() {
  const container = document.getElementById('profesoresContent');
  if (!container) return;
  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>';
  try {
    const profesores = await api('GET', '/admin/usuarios');
    renderProfesores(container, profesores);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

function renderProfesores(container, profesores) {
  // El botón "Crear profesor" usa onclick="crearProfesor()" (función global window.crearProfesor).
  // No se usa addEventListener para evitar problemas de timing al reconstruir el DOM.

  if (!profesores.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👨‍🏫</div>
        <p>No hay profesores registrados. Crea el primero abajo.</p>
      </div>
      ${formAgregarProfesor()}
    `;
    return;
  }

  // BUG #4 CORREGIDO: muestra password_plain con toggle + botón copiar credenciales
  const rows = profesores.map(prof => {
    const pwId = `pw_${prof.id}`;
    const pw   = prof.password_plain || '(ver con superadmin)';
    return `
      <tr>
        <td>
          <strong>${escapeHtml(prof.nombre)}</strong><br>
          <span style="font-size:.7rem;color:var(--text3)">${prof.id}</span>
        </td>
        <td>${escapeHtml(prof.email || '—')}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <input id="${pwId}" type="password" value="${escapeHtml(pw)}" readonly
              style="border:none;background:var(--bg2);padding:3px 8px;border-radius:6px;
                     font-family:monospace;font-size:.8rem;width:110px;color:var(--text1)">
            <button class="btn btn-ghost btn-sm"
              onclick="toggleInputPw('${pwId}',this)" title="Mostrar/ocultar">👁</button>
            <button class="btn btn-ghost btn-sm" title="Copiar credenciales"
              onclick="navigator.clipboard.writeText('Email: ${escapeHtml(prof.email)} | Contraseña: ${escapeHtml(pw)}').then(()=>toast('Credenciales copiadas','success'))">📋</button>
          </div>
        </td>
        <td style="font-size:.78rem">${fmt.dt(prof.creado_at)}</td>
        <td style="text-align:center">
          <button class="btn btn-danger btn-sm"
            onclick="eliminarProfesor('${prof.id}','${escapeHtml(prof.nombre)}')">✕ Eliminar</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrap" style="margin-bottom:24px">
      <table style="width:100%">
        <thead>
          <tr>
            <th>Nombre / ID</th>
            <th>Email (usar para login)</th>
            <th>Contraseña</th>
            <th>Registrado</th>
            <th style="width:100px">Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${formAgregarProfesor()}
  `;
}

// ── FIX: función global para crear profesor (evita depender de addEventListener) ──
window.crearProfesor = async () => {
  const nombre   = (document.getElementById('profNombre')?.value || '').trim();
  const email    = (document.getElementById('profEmail')?.value || '').trim();
  const password = document.getElementById('profPassword')?.value || '';
  const btn      = document.getElementById('btnCrearProfesor');

  if (!nombre || !email || !password) {
    toast('Complete todos los campos', 'error');
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }
  try {
    const resultado = await api('POST', '/admin/usuarios', { nombre, email, password });
    const pw = resultado.password_plain || password;
    toast(`✓ Profesor "${nombre}" creado  |  Email: ${email}  |  Contraseña: ${pw}`, 'success');
    // Copiar automáticamente al portapapeles
    navigator.clipboard?.writeText(`Email: ${email} | Contraseña: ${pw}`).catch(() => {});
    loadAdminProfesores();
  } catch (err) {
    toast(`Error al crear profesor: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Crear profesor'; }
  }
};

function formAgregarProfesor() {
  return `
    <div class="param-card" style="margin-top:16px">
      <div class="param-card-title">➕ Agregar nuevo profesor</div>
      <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end">
        <div style="flex:2; min-width:150px">
          <label class="form-label">Nombre completo</label>
          <input type="text" id="profNombre" class="form-input" placeholder="Ej: Prof. Juan Pérez">
        </div>
        <div style="flex:2; min-width:150px">
          <label class="form-label">Correo electrónico</label>
          <input type="email" id="profEmail" class="form-input" placeholder="juan@ejemplo.com">
        </div>
        <div style="flex:1; min-width:120px">
          <label class="form-label">Contraseña</label>
          <div class="pw-input-wrap">
            <input type="password" id="profPassword" class="form-input" placeholder="******">
            <button type="button" class="btn-eye-input" onclick="toggleInputPw('profPassword',this)">👁</button>
          </div>
        </div>
        <div>
          <button type="button" id="btnCrearProfesor" class="btn btn-primary"
            onclick="crearProfesor()">✓ Crear profesor</button>
        </div>
      </div>
      <p style="font-size:.72rem;color:var(--text3);margin-top:8px">
        ℹ️ El profesor ingresará con su correo electrónico y la contraseña que definas aquí.
      </p>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

window.eliminarProfesor = async (id, nombre) => {
  if (!confirm(`¿Eliminar profesor "${nombre}"? Se eliminarán también sus simulaciones. Esta acción no se puede deshacer.`)) return;
  try {
    await api('DELETE', `/admin/usuarios/${id}`);
    toast(`Profesor "${nombre}" eliminado`, 'success');
    loadAdminProfesores();
  } catch (err) {
    toast(err.message, 'error');
  }
};

// ── Logout ─────────────────────────────────────────────────
async function doLogout() {
  await api('POST','/auth/logout');
  state = { me:null, ref:null, decisiones:null, resultados:null };
  showScreen('screen-login');
  document.getElementById('loginId').value = '';
  document.getElementById('loginPass').value = '';
}

// ── RECALCULADOR ────────────────────────────────────────────
async function recalcularSimulacion(simId, nombre) {
  if (!confirm(`¿Recalcular "${nombre}" desde la Ronda 1?\n\nSe sobrescribirán los resultados actuales, con verificación de balance por ronda (se detiene sin escribir si alguna ronda no cuadra).`)) return;
  try {
    toast('Recalculando...', 'info');
    const res = await api('POST', '/admin/recalcular-completa', { simId });
    const nRondas = res.rondasProcesadas?.length ?? 0;
    const motivo = res.detenidoEn?.motivo;
    // Motivos NORMALES de parada: fin natural de la cadena. Cualquier otro motivo
    // (o ausencia de motivo) es inesperado → se marca con ⚠️ aunque sea HTTP 200.
    const motivosNormales = ['cadena-completa', 'siguiente-no-simulada'];
    if (motivo && motivosNormales.includes(motivo)) {
      toast(`✓ "${nombre}": ${nRondas} rondas recalculadas (fin: ${motivo}).`, 'success');
    } else {
      toast(`⚠️ "${nombre}": ${nRondas} rondas recalculadas, pero se detuvo por un motivo inesperado: ${motivo || 'desconocido'}. Revisa el estado de la simulación.`, 'error');
    }
    if (state.currentSimId === simId) {
      document.querySelector('[data-view="admin-dashboard"]')?.click();
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function recalcularTodas() {
  if (!confirm('¿Recalcular TODAS las simulaciones del sistema? Esta operación puede tardar varios segundos.')) return;
  try {
    toast('Recalculando todas las simulaciones...', 'info');
    const res = await api('POST', '/admin/recalcular-todas');
    toast(`✓ ${res.simulaciones.length} simulaciones procesadas.`, 'success');
    loadAdminSimulaciones();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  INIT — check existing session
// ═══════════════════════════════════════════════════════════
async function init() {
  initLogin();
  try {
    const me = await api('GET', '/auth/me');
    state.me = me;
    // ── BUG CRÍTICO CORREGIDO: 'admin' solo era el único rol aceptado.
    //    'superadmin' y 'profesor' caían a initEquipo() causando 400 en
    //    /api/decisiones → excepción → vuelta al login en cada recarga.
    if (me.rol === 'admin' || me.rol === 'superadmin' || me.rol === 'profesor') {
      await initAdmin();
    } else {
      await initEquipo();
    }
  } catch {
    showScreen('screen-login');
  }
}

document.addEventListener('DOMContentLoaded', init);
