const { ejecutarSimulador } = require('./engine');
const {
  calcularTendencia,
  calcularCoherenciaOperativoFinanciera,
  limitarTexto,
  contarPalabras,
} = require('./examenes.helpers');

const CAMPOS_INNOVACION = [
  'innovacion',
  'tipoInnovacion',
  'montoInnovacion',
  'tipoInvestigacion',
  'produccion',
  'tipoPrestamo',
  'montoPrestamo',
  'plazoPrestamo',
  'amortizacion',
];

const CAMPOS_ANALISIS = [
  'impactoEstadoResultados',
  'impactoBalanceGeneral',
  'impactoFlujoCaja',
  'kpisEsperados',
  'riesgosFinancieros',
];

function construirDecisionInnovacion(base, input = {}) {
  const decision = { ...base };
  for (const campo of CAMPOS_INNOVACION) {
    if (input[campo] !== undefined) decision[campo] = input[campo];
  }
  decision.innovacion = Boolean(decision.innovacion);
  decision.tipoInnovacion = String(decision.tipoInnovacion || '').trim();
  decision.tipoInvestigacion = String(decision.tipoInvestigacion || 'No').trim();
  for (const campo of ['montoInnovacion', 'produccion', 'montoPrestamo', 'plazoPrestamo', 'amortizacion']) {
    decision[campo] = Math.max(0, Number(decision[campo] || 0));
  }
  decision.submitted = true;
  decision.submittedAt = new Date().toISOString();
  return decision;
}

function validarInputInnovacion(input = {}, opts = {}) {
  const body = input || {};
  const decisionInput = body.decisionExamen || {};
  const extrasDecision = Object.keys(decisionInput).filter(k => !CAMPOS_INNOVACION.includes(k));
  if (extrasDecision.length) {
    const err = new Error(`Campos no permitidos en decisionExamen: ${extrasDecision.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const decisionExamen = {};
  for (const campo of CAMPOS_INNOVACION) {
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

function evaluarRubricaInnovacion(contexto) {
  const { decisionExamen, resultadoSimulado, estadoHeredado, justificacionEstrategica, analisisFinanciero, tendencia } = contexto;
  const resultadoBase = estadoHeredado.resultado || {};
  const palabrasJust = contarPalabras(justificacionEstrategica);
  const palabrasAnalisis = Object.values(analisisFinanciero || {}).reduce((s, t) => s + contarPalabras(t), 0);
  const mejoraAtractivo = (resultadoSimulado.atractivo || 0) - (resultadoBase.atractivo || 0);
  const variacionCosto = (resultadoSimulado.costoUnitario || 0) - (resultadoBase.costoUnitario || 0);

  const items = [
    _puntos(
      'Coherencia tipo de innovacion vs situacion competitiva',
      25,
      (decisionExamen.innovacion ? 10 : 0) +
        (decisionExamen.tipoInnovacion ? 5 : 0) +
        (decisionExamen.montoInnovacion > 0 ? 5 : 0) +
        (mejoraAtractivo >= 0 ? 5 : Math.max(0, 5 + mejoraAtractivo)),
      `Delta atractivo: ${mejoraAtractivo.toFixed(2)}`
    ),
    _puntos(
      'Uso de investigacion previa',
      15,
      decisionExamen.tipoInvestigacion === 'Premium' ? 15 : decisionExamen.tipoInvestigacion === 'Basica' || decisionExamen.tipoInvestigacion === 'Básica' ? 10 : 4,
      `Investigacion: ${decisionExamen.tipoInvestigacion || 'No'}`
    ),
    _puntos(
      'Correccion de tendencia costo/atractivo',
      15,
      (mejoraAtractivo >= 0 ? 8 : 3) + (variacionCosto <= Math.max(1, (resultadoBase.costoUnitario || 0) * 0.25) ? 7 : 3),
      `Costo unitario delta: ${variacionCosto.toFixed(2)}`
    ),
    _puntos(
      'Viabilidad financiera de la innovacion',
      20,
      (resultadoSimulado.cajaFinal >= 0 ? 6 : 0) +
        (resultadoSimulado.sobregiro > 0 ? 1 : 5) +
        (resultadoSimulado.deudaFinal <= Math.max(1, (resultadoSimulado.totalActivos || 0) * 0.7) ? 5 : 2) +
        (Math.abs((resultadoSimulado.totalActivos || 0) - (resultadoSimulado.deudaFinal || 0) - (resultadoSimulado.patrimonio || 0)) < 1 ? 4 : 0),
      `Caja final: ${resultadoSimulado.cajaFinal || 0}`
    ),
    _puntos(
      'Justificacion escrita',
      15,
      Math.min(15, Math.floor(palabrasJust / 8) + Math.floor(palabrasAnalisis / 25)),
      `Palabras justificacion: ${palabrasJust}; analisis: ${palabrasAnalisis}`
    ),
    _puntos(
      'Coherencia operativo-financiera',
      10,
      calcularCoherenciaOperativoFinanciera(decisionExamen, resultadoSimulado),
      `Tendencia utilidad: ${tendencia?.utilidadNeta?.direccion || 'sin-datos'}`
    ),
  ];

  const total = items.reduce((s, i) => s + i.puntos, 0);
  return { total, items };
}

function calcularExamenInnovacion(contexto) {
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
  const decisionExamen = construirDecisionInnovacion(estadoHeredado.decision, input.decisionExamen);
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
  const tendencia = calcularTendencia(sim, equipoId, rondaActivacion, ['utilidadNeta', 'costoUnitario', 'atractivo', 'cajaFinal']);
  const rubrica = evaluarRubricaInnovacion({
    decisionExamen,
    resultadoSimulado,
    estadoHeredado,
    justificacionEstrategica: input.justificacionEstrategica,
    analisisFinanciero: input.analisisFinanciero,
    tendencia,
  });
  return {
    decisionExamen,
    resultadoSimulado,
    rubrica,
    notaFinal: rubrica.total,
    tendencia,
  };
}

module.exports = {
  CAMPOS_INNOVACION,
  CAMPOS_ANALISIS,
  construirDecisionInnovacion,
  validarInputInnovacion,
  evaluarRubricaInnovacion,
  calcularExamenInnovacion,
};
