const { ejecutarSimulador } = require('./engine');
const {
  calcularTendencia,
  calcularCoherenciaOperativoFinanciera,
  contarPalabras,
  limitarTexto,
  descomponerMarketingEfectivo,
} = require('./examenes.helpers');

const CAMPOS_MARKETING = [
  'producto',
  'segmentoObjetivo',
  'calidad',
  'precioVenta',
  'canalPrincipal',
  'canalSecundario',
  'publicidad',
  'promocion',
  'eventos',
  'marketingRedes',
  'relacionesPublicas',
  'produccion',
  'tipoPrestamo',
  'montoPrestamo',
  'plazoPrestamo',
  'amortizacion',
];

const CAMPOS_BLOQUEADOS_MARKETING = [
  'innovacion',
  'tipoInnovacion',
  'montoInnovacion',
  'tipoInvestigacion',
  'contratarVendedores',
  'despedirVendedores',
];

const CAMPOS_ANALISIS = [
  'impactoEstadoResultados',
  'impactoBalanceGeneral',
  'impactoFlujoCaja',
  'kpisEsperados',
  'riesgosFinancieros',
];

function construirDecisionMarketing(base, input = {}) {
  const decision = { ...base };
  for (const campo of CAMPOS_MARKETING) {
    if (input[campo] !== undefined) decision[campo] = input[campo];
  }

  for (const campo of ['producto', 'segmentoObjetivo', 'canalPrincipal', 'canalSecundario', 'tipoPrestamo']) {
    decision[campo] = String(decision[campo] || '').trim();
  }
  for (const campo of [
    'calidad',
    'precioVenta',
    'publicidad',
    'promocion',
    'eventos',
    'marketingRedes',
    'relacionesPublicas',
    'produccion',
    'montoPrestamo',
    'plazoPrestamo',
    'amortizacion',
  ]) {
    decision[campo] = Math.max(0, Number(decision[campo] || 0));
  }
  decision.calidad = Math.max(1, Math.min(10, decision.calidad || 1));
  decision.submitted = true;
  decision.submittedAt = new Date().toISOString();
  return decision;
}

function validarInputMarketing(input = {}, opts = {}) {
  const body = input || {};
  const decisionInput = body.decisionExamen || {};
  const extrasDecision = Object.keys(decisionInput).filter(k => !CAMPOS_MARKETING.includes(k));
  if (extrasDecision.length) {
    const err = new Error(`Campos no permitidos en decisionExamen: ${extrasDecision.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const decisionExamen = {};
  for (const campo of CAMPOS_MARKETING) {
    if (decisionInput[campo] !== undefined) decisionExamen[campo] = decisionInput[campo];
  }

  const justificacionEstrategica = limitarTexto(body.justificacionEstrategica, 5000);
  const analisisFinanciero = {};
  const fuenteAnalisis = body.analisisFinanciero || {};
  for (const campo of CAMPOS_ANALISIS) {
    analisisFinanciero[campo] = limitarTexto(fuenteAnalisis[campo], 3000);
  }

  if (opts.enviar) {
    if (contarPalabras(justificacionEstrategica) < 60) {
      const err = new Error('Justificacion estrategica insuficiente');
      err.status = 400;
      throw err;
    }
    const incompletos = CAMPOS_ANALISIS.filter(c => contarPalabras(analisisFinanciero[c]) < 8);
    if (incompletos.length) {
      const err = new Error(`Analisis financiero insuficiente: ${incompletos.join(', ')}`);
      err.status = 400;
      throw err;
    }
  }

  return { decisionExamen, justificacionEstrategica, analisisFinanciero };
}

function _puntos(nombre, max, valor, comentario) {
  const puntos = Math.max(0, Math.min(max, Math.round(valor)));
  return { nombre, max, puntos, comentario };
}

function evaluarRubricaMarketing(contexto) {
  const {
    decisionExamen,
    resultadoSimulado,
    estadoHeredado,
    justificacionEstrategica,
    analisisFinanciero,
    tendencia,
    descomposicionMarketing,
  } = contexto;
  const resultadoBase = estadoHeredado.resultado || {};
  const baseDecision = estadoHeredado.decision || {};
  const palabrasJust = contarPalabras(justificacionEstrategica);
  const palabrasAnalisis = Object.values(analisisFinanciero || {}).reduce((s, t) => s + contarPalabras(t), 0);
  const deltaVentas = (resultadoSimulado.ventasNetas || 0) - (resultadoBase.ventasNetas || 0);
  const deltaUtilidad = (resultadoSimulado.utilidadNeta || 0) - (resultadoBase.utilidadNeta || 0);
  const deltaAtractivo = (resultadoSimulado.atractivo || 0) - (resultadoBase.atractivo || 0);
  const precio = decisionExamen.precioVenta || 0;
  const calidad = decisionExamen.calidad || 0;
  const mix = descomposicionMarketing?.componentes || {};
  const canalesConGasto = Object.values(mix).filter(c => (c.gasto || 0) > 0);
  const canalesSaturados = canalesConGasto.filter(c => c.clasificacion === 'saturado').length;
  const aporteMix = descomposicionMarketing?.totalMktEfectivo || 0;
  const canalPrincipalOk = Boolean(decisionExamen.canalPrincipal && decisionExamen.canalPrincipal !== 'Ninguno');
  const canalSecundarioDiferente = decisionExamen.canalSecundario &&
    decisionExamen.canalSecundario !== 'Ninguno' &&
    decisionExamen.canalSecundario !== decisionExamen.canalPrincipal;

  const items = [
    _puntos(
      'Coherencia STP producto-segmento-precio',
      25,
      (decisionExamen.producto ? 5 : 0) +
        (decisionExamen.segmentoObjetivo ? 5 : 0) +
        (precio > 0 ? 5 : 0) +
        (calidad >= 4 ? 5 : 2) +
        (deltaAtractivo >= 0 ? 5 : Math.max(0, 5 + deltaAtractivo)),
      `Delta atractivo: ${deltaAtractivo.toFixed(2)}`
    ),
    _puntos(
      'Eficiencia del mix promocional',
      15,
      Math.min(15, (canalesConGasto.length * 2) + (aporteMix * 2) - (canalesSaturados * 2)),
      `Aporte mix: ${aporteMix.toFixed(2)}; canales con gasto: ${canalesConGasto.length}`
    ),
    _puntos(
      'Coherencia de canal y vendedores',
      10,
      (canalPrincipalOk ? 5 : 0) +
        (canalSecundarioDiferente ? 2 : 0) +
        ((baseDecision.contratarVendedores || 0) >= 0 && (baseDecision.despedirVendedores || 0) >= 0 ? 3 : 0),
      `Canal principal: ${decisionExamen.canalPrincipal || 'sin canal'}`
    ),
    _puntos(
      'Correccion de tendencia comercial',
      10,
      (deltaVentas >= 0 ? 4 : 1) +
        (deltaUtilidad >= 0 ? 3 : 1) +
        ((tendencia?.ventasNetas?.direccion === 'baja' && deltaVentas > 0) ? 3 : 1),
      `Delta ventas: ${deltaVentas.toFixed(2)}; delta utilidad: ${deltaUtilidad.toFixed(2)}`
    ),
    _puntos(
      'Analisis financiero de la decision',
      20,
      Math.min(20, Math.floor(palabrasAnalisis / 12)) +
        (resultadoSimulado.cajaFinal >= 0 ? 3 : 0) +
        (resultadoSimulado.utilidadNeta >= resultadoBase.utilidadNeta ? 3 : 0),
      `Palabras analisis: ${palabrasAnalisis}`
    ),
    _puntos(
      'Justificacion estrategica escrita',
      10,
      Math.min(10, Math.floor(palabrasJust / 10)),
      `Palabras justificacion: ${palabrasJust}`
    ),
    _puntos(
      'Coherencia operativo-financiera',
      10,
      calcularCoherenciaOperativoFinanciera(decisionExamen, resultadoSimulado),
      `Caja final: ${resultadoSimulado.cajaFinal || 0}`
    ),
  ];

  const total = items.reduce((s, i) => s + i.puntos, 0);
  return { total, items };
}

function calcularExamenMarketing(contexto) {
  const { sim, equipoId, rondaActivacion, estadoHeredado, input } = contexto;
  const rondas = sim.rondas || {};
  const rondaBase = estadoHeredado.rondaBase;
  const baseData = rondas[String(rondaBase)];
  const simCfg = {
    params: sim.parametros,
    tiposProducto: sim.tipos_producto || sim.tiposProducto,
    canales: sim.canales,
    segmentos: sim.segmentos,
    afinidadMatrix: sim.afinidad_matrix || sim.afinidadMatrix,
    competenciaExterna: sim.competencia_externa || sim.competenciaExterna,
  };
  const decisionExamen = construirDecisionMarketing(estadoHeredado.decision, input.decisionExamen);
  const decisiones = Object.values(baseData.decisiones || {}).map(d =>
    d.equipo === equipoId ? { ...decisionExamen } : { ...d }
  );
  const simulado = ejecutarSimulador(decisiones, simCfg);
  const resultadoSimulado = simulado.resultados.find(r => r.equipo === equipoId);
  if (!resultadoSimulado) {
    const err = new Error('No se pudo obtener resultado simulado del examen');
    err.status = 500;
    throw err;
  }
  const tendencia = calcularTendencia(sim, equipoId, rondaActivacion, ['ventasNetas', 'utilidadNeta', 'shareReal', 'atractivo', 'cajaFinal']);
  const descomposicionMarketing = descomponerMarketingEfectivo(decisionExamen, decisionExamen.segmentoObjetivo, simCfg.params);
  const rubrica = evaluarRubricaMarketing({
    decisionExamen,
    resultadoSimulado,
    estadoHeredado,
    justificacionEstrategica: input.justificacionEstrategica,
    analisisFinanciero: input.analisisFinanciero,
    tendencia,
    descomposicionMarketing,
  });
  return {
    decisionExamen,
    resultadoSimulado,
    rubrica,
    notaFinal: rubrica.total,
    tendencia,
    descomposicionMarketing,
  };
}

module.exports = {
  CAMPOS_MARKETING,
  CAMPOS_BLOQUEADOS_MARKETING,
  CAMPOS_ANALISIS,
  construirDecisionMarketing,
  validarInputMarketing,
  evaluarRubricaMarketing,
  calcularExamenMarketing,
};
