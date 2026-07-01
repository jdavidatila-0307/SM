const crypto = require('crypto');
const { contarPalabras, limitarTexto } = require('./examenes.helpers');

const IDS_OPCIONES = ['A', 'B', 'C', 'D', 'E'];

function _num(valor, decimales = 2) {
  const n = Number(valor || 0);
  const factor = 10 ** decimales;
  return Math.round(n * factor) / factor;
}

function _hash(valor) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(valor || {}))
    .digest('hex')
    .slice(0, 16);
}

function _riesgo({ cajaFinal, utilidadNeta, saturacion }) {
  if (cajaFinal < 0) return 'Liquidez critica';
  if (cajaFinal < 1000) return 'Caja ajustada';
  if (utilidadNeta < 0) return 'Rentabilidad negativa';
  if (saturacion >= 0.9) return 'Saturacion publicitaria';
  if (saturacion >= 0.75) return 'Saturacion moderada';
  return 'Controlado';
}

function _mixPublicidad(decision = {}, descomposicionMarketing = {}) {
  const componentes = descomposicionMarketing.componentes || {};
  const claves = ['publicidad', 'promocion', 'eventos', 'marketingRedes', 'relacionesPublicas'];
  const gasto = claves.reduce((s, k) => s + Math.max(0, Number(decision[k] || 0)), 0);
  const conGasto = claves
    .map(k => componentes[k])
    .filter(c => c && (c.gasto || 0) > 0);
  const saturacion = conGasto.length
    ? conGasto.reduce((s, c) => s + Number(c.saturacion || 0), 0) / conGasto.length
    : 0;
  return { gasto, saturacion };
}

function construirMetricasPublicidad({ decisionExamen, resultadoSimulado, estadoHeredado, descomposicionMarketing }) {
  const base = estadoHeredado?.resultado || {};
  const mix = _mixPublicidad(decisionExamen, descomposicionMarketing);
  const deltaVentas = (resultadoSimulado.ventasNetas || 0) - (base.ventasNetas || 0);
  const roas = mix.gasto > 0 ? deltaVentas / mix.gasto : 0;
  const metricas = {
    ventasNetas: _num(resultadoSimulado.ventasNetas),
    utilidadNeta: _num(resultadoSimulado.utilidadNeta),
    cajaFinal: _num(resultadoSimulado.cajaFinal),
    roas: _num(roas, 3),
    saturacion: _num(mix.saturacion, 3),
  };
  return {
    ...metricas,
    riesgo: _riesgo(metricas),
    gastoMix: _num(mix.gasto),
    deltaVentas: _num(deltaVentas),
  };
}

function _opcion(tipo, metricas, ajustes = {}) {
  const ventasNetas = _num(metricas.ventasNetas * (ajustes.ventas ?? 1));
  const utilidadNeta = _num(metricas.utilidadNeta * (ajustes.utilidad ?? 1));
  const cajaFinal = _num(
    ajustes.cajaAbsoluta !== undefined
      ? ajustes.cajaAbsoluta
      : metricas.cajaFinal * (ajustes.caja ?? 1)
  );
  const roas = _num(metricas.roas * (ajustes.roas ?? 1), 3);
  const saturacion = _num(Math.max(0, Math.min(0.99, ajustes.saturacion ?? metricas.saturacion)), 3);
  return {
    tipo,
    ventasNetas,
    utilidadNeta,
    cajaFinal,
    roas,
    saturacion,
    riesgo: ajustes.riesgo || _riesgo({ cajaFinal, utilidadNeta, saturacion }),
  };
}

function _shuffleDeterministico(opciones, seed) {
  return opciones
    .map((op, idx) => ({
      op,
      orden: crypto.createHash('sha256').update(`${seed}:${idx}:${op.tipo}`).digest('hex'),
    }))
    .sort((a, b) => a.orden.localeCompare(b.orden))
    .map((x, idx) => ({ ...x.op, id: IDS_OPCIONES[idx] }));
}

function generarAnalisisFinancieroPublicidad({ decisionExamen, resultadoSimulado, estadoHeredado, descomposicionMarketing }) {
  const metricas = construirMetricasPublicidad({ decisionExamen, resultadoSimulado, estadoHeredado, descomposicionMarketing });
  const decisionParaHash = { ...decisionExamen };
  delete decisionParaHash.submittedAt;
  const decisionHash = _hash(decisionParaHash);
  const resultadoHash = _hash({
    ventasNetas: resultadoSimulado.ventasNetas,
    utilidadNeta: resultadoSimulado.utilidadNeta,
    cajaFinal: resultadoSimulado.cajaFinal,
    costoUnitario: resultadoSimulado.costoUnitario,
    shareReal: resultadoSimulado.shareReal,
    descomposicionMarketing,
  });
  const cajaIliquida = Math.min(metricas.cajaFinal * 0.2, 500);
  const opciones = _shuffleDeterministico([
    _opcion('correcta', metricas),
    _opcion('optimista', metricas, { ventas: 1.18, utilidad: 1.22, caja: 1.2, roas: 1.25, saturacion: Math.max(0, metricas.saturacion - 0.08), riesgo: 'Escenario optimista' }),
    _opcion('pesimista', metricas, { ventas: 0.82, utilidad: 0.75, caja: 0.72, roas: 0.7, saturacion: Math.min(0.99, metricas.saturacion + 0.1), riesgo: 'Demanda menor a la esperada' }),
    _opcion('iliquida', metricas, { ventas: 1.02, utilidad: 0.95, cajaAbsoluta: cajaIliquida, roas: 0.95, saturacion: metricas.saturacion, riesgo: 'Utilidad razonable con caja debil' }),
    _opcion('incoherente', metricas, { ventas: 0.62, utilidad: 1.35, caja: 1.45, roas: -0.4, saturacion: 0.98, riesgo: 'Incoherente con saturacion alta' }),
  ], `${decisionHash}:${resultadoHash}`);
  const correcta = opciones.find(o => o.tipo === 'correcta');

  return {
    version: 1,
    generadoAt: new Date().toISOString(),
    decisionHash,
    resultadoHash,
    opciones,
    opcionCorrecta: correcta?.id || null,
    opcionSeleccionada: null,
    justificacionFinancieraBreve: '',
  };
}

function validarSeleccionFinancieraPublicidad(input = {}, opts = {}) {
  const fuente = input.analisisFinancieroSeleccion || {};
  const opcionSeleccionada = fuente.opcionSeleccionada == null
    ? null
    : String(fuente.opcionSeleccionada).trim().toUpperCase();
  const justificacionFinancieraBreve = limitarTexto(fuente.justificacionFinancieraBreve, 1000);
  if (opts.enviar) {
    if (!IDS_OPCIONES.includes(opcionSeleccionada)) {
      const err = new Error('Debe seleccionar un escenario financiero');
      err.status = 400;
      throw err;
    }
    if (contarPalabras(justificacionFinancieraBreve) < 12) {
      const err = new Error('Justificacion financiera breve insuficiente');
      err.status = 400;
      throw err;
    }
  }
  return { opcionSeleccionada, justificacionFinancieraBreve };
}

function calificarSeleccionFinancieraPublicidad(analisisFinancieroSeleccion, decisionExamen, descomposicionMarketing) {
  const seleccion = analisisFinancieroSeleccion || {};
  const opciones = seleccion.opciones || [];
  const correcta = opciones.find(o => o.id === seleccion.opcionCorrecta);
  const elegida = opciones.find(o => o.id === seleccion.opcionSeleccionada);
  const palabras = contarPalabras(seleccion.justificacionFinancieraBreve);
  const mix = _mixPublicidad(decisionExamen, descomposicionMarketing);
  const gastoAlto = mix.gasto > 0;
  const saturacionAlta = mix.saturacion >= 0.75;
  const seleccionCorrecta = elegida && correcta && elegida.id === correcta.id;
  const cercaniaRoas = correcta && elegida ? Math.abs((elegida.roas || 0) - (correcta.roas || 0)) : Infinity;
  const cercaniaSat = correcta && elegida ? Math.abs((elegida.saturacion || 0) - (correcta.saturacion || 0)) : Infinity;
  const cercaniaCaja = correcta && elegida ? Math.abs((elegida.cajaFinal || 0) - (correcta.cajaFinal || 0)) : Infinity;
  const baseCaja = Math.max(1, Math.abs(correcta?.cajaFinal || 0));

  const items = {
    seleccionCorrecta: seleccionCorrecta ? 10 : 0,
    interpretacionRoasSaturacion: seleccionCorrecta ? 3 : cercaniaRoas <= 0.25 && cercaniaSat <= 0.15 ? 2 : cercaniaRoas <= 0.5 ? 1 : 0,
    interpretacionCajaRiesgo: seleccionCorrecta ? 3 : cercaniaCaja / baseCaja <= 0.2 || elegida?.riesgo === correcta?.riesgo ? 2 : cercaniaCaja / baseCaja <= 0.45 ? 1 : 0,
    coherenciaDecision: gastoAlto && (!saturacionAlta || elegida?.tipo === 'correcta') ? 2 : gastoAlto ? 1 : 0,
    justificacionBreve: palabras >= 20 ? 2 : palabras >= 12 ? 1 : 0,
  };
  const total = Object.values(items).reduce((s, n) => s + n, 0);
  return {
    total,
    max: 20,
    items,
    opcionSeleccionada: seleccion.opcionSeleccionada || null,
    seleccionCorrecta: Boolean(seleccionCorrecta),
    comentario: seleccionCorrecta
      ? 'Seleccion financiera correcta'
      : 'La seleccion financiera no coincide con el escenario simulado mas probable',
  };
}

function sanitizarAnalisisFinancieroSeleccion(analisis) {
  if (!analisis) return analisis;
  const { opcionCorrecta, ...seguro } = analisis;
  return {
    ...seguro,
    opciones: (seguro.opciones || []).map(({ tipo, ...op }) => op),
  };
}

module.exports = {
  construirMetricasPublicidad,
  generarAnalisisFinancieroPublicidad,
  validarSeleccionFinancieraPublicidad,
  calificarSeleccionFinancieraPublicidad,
  sanitizarAnalisisFinancieroSeleccion,
};
