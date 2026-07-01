const { ejecutarSimulador } = require('./engine');
const {
  calcularTendencia,
  calcularCoherenciaOperativoFinanciera,
  contarPalabras,
  limitarTexto,
  descomponerMarketingEfectivo,
} = require('./examenes.helpers');
const {
  generarAnalisisFinancieroPublicidad,
  validarSeleccionFinancieraPublicidad,
  calificarSeleccionFinancieraPublicidad,
} = require('./examenes.finanzas');

const CAMPOS_PUBLICIDAD = [
  'publicidad',
  'promocion',
  'eventos',
  'marketingRedes',
  'relacionesPublicas',
  'canalPrincipal',
  'canalSecundario',
  'precioVenta',
  'produccion',
  'tipoPrestamo',
  'montoPrestamo',
  'plazoPrestamo',
  'amortizacion',
];

const CAMPOS_BLOQUEADOS_PUBLICIDAD = [
  'producto',
  'segmentoObjetivo',
  'calidad',
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

function construirDecisionPublicidad(base, input = {}) {
  const decision = { ...base };
  for (const campo of CAMPOS_PUBLICIDAD) {
    if (input[campo] !== undefined) decision[campo] = input[campo];
  }

  for (const campo of ['canalPrincipal', 'canalSecundario', 'tipoPrestamo']) {
    decision[campo] = String(decision[campo] || '').trim();
  }
  for (const campo of [
    'publicidad',
    'promocion',
    'eventos',
    'marketingRedes',
    'relacionesPublicas',
    'precioVenta',
    'produccion',
    'montoPrestamo',
    'plazoPrestamo',
    'amortizacion',
  ]) {
    decision[campo] = Math.max(0, Number(decision[campo] || 0));
  }
  decision.submitted = true;
  decision.submittedAt = new Date().toISOString();
  return decision;
}

function validarInputPublicidad(input = {}, opts = {}) {
  const body = input || {};
  const decisionInput = body.decisionExamen || {};
  const extrasDecision = Object.keys(decisionInput).filter(k => !CAMPOS_PUBLICIDAD.includes(k));
  if (extrasDecision.length) {
    const err = new Error(`Campos no permitidos en decisionExamen: ${extrasDecision.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const decisionExamen = {};
  for (const campo of CAMPOS_PUBLICIDAD) {
    if (decisionInput[campo] !== undefined) decisionExamen[campo] = decisionInput[campo];
  }

  const justificacionEstrategica = limitarTexto(body.justificacionEstrategica, 5000);
  const analisisFinanciero = {};
  const fuenteAnalisis = body.analisisFinanciero || {};
  for (const campo of CAMPOS_ANALISIS) {
    analisisFinanciero[campo] = limitarTexto(fuenteAnalisis[campo], 3000);
  }
  const analisisFinancieroSeleccion = validarSeleccionFinancieraPublicidad(body, opts);

  if (opts.enviar) {
    if (contarPalabras(justificacionEstrategica) < 60) {
      const err = new Error('Justificacion estrategica insuficiente');
      err.status = 400;
      throw err;
    }
  }

  return { decisionExamen, justificacionEstrategica, analisisFinanciero, analisisFinancieroSeleccion };
}

function _puntos(nombre, max, valor, comentario) {
  const puntos = Math.max(0, Math.min(max, Math.round(valor)));
  return { nombre, max, puntos, comentario };
}

function evaluarRubricaPublicidad(contexto) {
  const {
    decisionExamen,
    resultadoSimulado,
    estadoHeredado,
    justificacionEstrategica,
    analisisFinanciero,
    analisisFinancieroSeleccion,
    calificacionFinanciera,
    tendencia,
    descomposicionMarketing,
  } = contexto;
  const resultadoBase = estadoHeredado.resultado || {};
  const palabrasJust = contarPalabras(justificacionEstrategica);
  const palabrasAnalisis = Object.values(analisisFinanciero || {}).reduce((s, t) => s + contarPalabras(t), 0);
  const deltaVentas = (resultadoSimulado.ventasNetas || 0) - (resultadoBase.ventasNetas || 0);
  const deltaUtilidad = (resultadoSimulado.utilidadNeta || 0) - (resultadoBase.utilidadNeta || 0);
  const deltaCaja = (resultadoSimulado.cajaFinal || 0) - (resultadoBase.cajaFinal || 0);
  const deltaAtractivo = (resultadoSimulado.atractivo || 0) - (resultadoBase.atractivo || 0);
  const mix = descomposicionMarketing?.componentes || {};
  const componentes = Object.values(mix);
  const canalesConGasto = componentes.filter(c => (c.gasto || 0) > 0);
  const canalesSaturados = canalesConGasto.filter(c => c.clasificacion === 'saturado').length;
  const aporteTotal = descomposicionMarketing?.totalMktEfectivo || 0;
  const aporteMarginalProm = canalesConGasto.length
    ? canalesConGasto.reduce((s, c) => s + (c.aporteMarginal || 0), 0) / canalesConGasto.length
    : 0;
  const gastoMix = canalesConGasto.reduce((s, c) => s + (c.gasto || 0), 0);
  const retornoPorBs = gastoMix > 0 ? Math.max(0, deltaVentas) / gastoMix : 0;
  const canalOk = Boolean(decisionExamen.canalPrincipal && decisionExamen.canalPrincipal !== 'Ninguno');
  const financiero = calificacionFinanciera ||
    calificarSeleccionFinancieraPublicidad(analisisFinancieroSeleccion, decisionExamen, descomposicionMarketing);

  const items = [
    _puntos(
      'Coherencia campaña-segmento-canal',
      20,
      (canalOk ? 6 : 0) +
        (decisionExamen.canalSecundario && decisionExamen.canalSecundario !== decisionExamen.canalPrincipal ? 3 : 0) +
        (deltaAtractivo >= 0 ? 6 : 2) +
        (canalesConGasto.length >= 2 ? 5 : canalesConGasto.length * 2),
      `Delta atractivo: ${deltaAtractivo.toFixed(2)}; canales con gasto: ${canalesConGasto.length}`
    ),
    _puntos(
      'Eficiencia del mix publicitario',
      20,
      Math.min(20, (aporteTotal * 3) + (canalesConGasto.length * 2) - (canalesSaturados * 3)),
      `Aporte mix: ${aporteTotal.toFixed(2)}; saturados: ${canalesSaturados}`
    ),
    _puntos(
      'Control de saturacion y aporte marginal',
      15,
      (canalesSaturados === 0 ? 6 : Math.max(0, 6 - canalesSaturados * 2)) +
        Math.min(6, aporteMarginalProm * 24000) +
        (descomposicionMarketing?.mejorRendimiento ? 3 : 0),
      `Aporte marginal promedio: ${aporteMarginalProm.toFixed(6)}`
    ),
    _puntos(
      'Retorno comercial esperado',
      15,
      (deltaVentas >= 0 ? 5 : 1) +
        (deltaUtilidad >= 0 ? 4 : 1) +
        (deltaCaja >= 0 ? 3 : 0) +
        Math.min(3, retornoPorBs),
      `Delta ventas: ${deltaVentas.toFixed(2)}; delta utilidad: ${deltaUtilidad.toFixed(2)}`
    ),
    _puntos(
      'Seleccion financiera cuantitativa',
      20,
      financiero.total,
      `${financiero.comentario}; opcion seleccionada: ${financiero.opcionSeleccionada || 'sin seleccion'}`
    ),
    _puntos(
      'Justificacion estrategica escrita',
      10,
      Math.min(10, Math.floor(palabrasJust / 10)),
      `Palabras justificacion: ${palabrasJust}; tendencia ventas: ${tendencia?.ventasNetas?.direccion || 'sin-datos'}`
    ),
  ];

  const total = items.reduce((s, i) => s + i.puntos, 0);
  return { total, items };
}

function calcularExamenPublicidad(contexto) {
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
  const decisionExamen = construirDecisionPublicidad(estadoHeredado.decision, input.decisionExamen);
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
  const tendencia = calcularTendencia(sim, equipoId, rondaActivacion, ['ventasNetas', 'utilidadNeta', 'atractivo', 'cajaFinal']);
  const descomposicionMarketing = descomponerMarketingEfectivo(decisionExamen, decisionExamen.segmentoObjetivo, simCfg.params);
  const generado = generarAnalisisFinancieroPublicidad({
    decisionExamen,
    resultadoSimulado,
    estadoHeredado,
    descomposicionMarketing,
  });
  const analisisFinancieroSeleccion = {
    ...generado,
    opcionSeleccionada: input.analisisFinancieroSeleccion?.opcionSeleccionada || null,
    justificacionFinancieraBreve: input.analisisFinancieroSeleccion?.justificacionFinancieraBreve || '',
  };
  const calificacionFinanciera = calificarSeleccionFinancieraPublicidad(
    analisisFinancieroSeleccion,
    decisionExamen,
    descomposicionMarketing
  );
  const rubrica = evaluarRubricaPublicidad({
    decisionExamen,
    resultadoSimulado,
    estadoHeredado,
    justificacionEstrategica: input.justificacionEstrategica,
    analisisFinanciero: input.analisisFinanciero,
    analisisFinancieroSeleccion,
    calificacionFinanciera,
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
    analisisFinancieroSeleccion,
    calificacionFinanciera,
  };
}

module.exports = {
  CAMPOS_PUBLICIDAD,
  CAMPOS_BLOQUEADOS_PUBLICIDAD,
  CAMPOS_ANALISIS,
  construirDecisionPublicidad,
  validarInputPublicidad,
  evaluarRubricaPublicidad,
  calcularExamenPublicidad,
};
