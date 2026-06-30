const TIPOS_EXAMEN = ['marketing', 'innovacion', 'publicidad'];

function normalizarConfigExamenes(config = {}) {
  const baseExamen = {
    habilitadoDesdeRonda: 10,
    activado: false,
    rondaActivacion: null,
  };
  const actual = config || {};
  const examenes = actual.examenes || {};
  const normalizado = {
    ...actual,
    examenes: {
      marketing: { ...baseExamen, ...(examenes.marketing || {}) },
      innovacion: { ...baseExamen, ...(examenes.innovacion || {}) },
      publicidad: { ...baseExamen, ...(examenes.publicidad || {}) },
    },
    rondasPractica: Array.isArray(actual.rondasPractica) ? actual.rondasPractica : [],
  };
  for (const tipo of TIPOS_EXAMEN) {
    const ex = normalizado.examenes[tipo];
    ex.habilitadoDesdeRonda = Number.isFinite(+ex.habilitadoDesdeRonda) ? +ex.habilitadoDesdeRonda : 10;
    ex.activado = Boolean(ex.activado);
    ex.rondaActivacion = ex.rondaActivacion === null || ex.rondaActivacion === undefined
      ? null
      : +ex.rondaActivacion;
  }
  return normalizado;
}

function validarTipoExamen(tipo) {
  if (!TIPOS_EXAMEN.includes(tipo)) {
    const err = new Error('Tipo de examen no permitido');
    err.status = 400;
    throw err;
  }
  return tipo;
}

function _rondasSimuladasAntesDe(sim, rondaActivacion) {
  const rondas = sim.rondas || {};
  return Object.keys(rondas)
    .map(n => parseInt(n, 10))
    .filter(n => Number.isFinite(n) && n < rondaActivacion && rondas[String(n)]?.estado === 'simulated')
    .sort((a, b) => a - b);
}

function prepararEstadoHeredado(sim, equipoId, rondaActivacion) {
  const rondas = sim.rondas || {};
  const simuladas = _rondasSimuladasAntesDe(sim, rondaActivacion);
  const rondaBase = simuladas[simuladas.length - 1];
  if (!rondaBase) {
    const err = new Error('No existe una ronda simulada anterior');
    err.status = 400;
    throw err;
  }
  const data = rondas[String(rondaBase)];
  const decision = data?.decisiones?.[equipoId];
  const resultado = data?.resultados?.[equipoId];
  if (!decision || !resultado) {
    const err = new Error('El equipo no tiene estado heredado completo');
    err.status = 404;
    throw err;
  }
  return {
    rondaBase,
    decision: { ...decision },
    resultado: { ...resultado },
  };
}

function calcularTendencia(sim, equipoId, rondaActivacion, variables = []) {
  const rondas = sim.rondas || {};
  const simuladas = _rondasSimuladasAntesDe(sim, rondaActivacion).slice(-3);
  return variables.reduce((acc, variable) => {
    const serie = simuladas
      .map(n => ({ ronda: n, valor: rondas[String(n)]?.resultados?.[equipoId]?.[variable] }))
      .filter(p => typeof p.valor === 'number');
    const primero = serie[0]?.valor ?? null;
    const ultimo = serie[serie.length - 1]?.valor ?? null;
    acc[variable] = {
      serie,
      delta: primero === null || ultimo === null ? null : +(ultimo - primero).toFixed(2),
      direccion: primero === null || ultimo === null ? 'sin-datos' : ultimo > primero ? 'sube' : ultimo < primero ? 'baja' : 'estable',
    };
    return acc;
  }, {});
}

function calcularCoherenciaOperativoFinanciera(decision, resultado) {
  let puntos = 0;
  if ((decision.produccion || 0) > 0) puntos += 2;
  if ((resultado.cajaFinal || 0) >= 0) puntos += 2;
  if ((resultado.sobregiro || 0) <= Math.max(1, (resultado.ventasNetas || 0) * 0.1)) puntos += 2;
  if ((resultado.inventarioFinal || 0) <= Math.max(1, (decision.produccion || 0) * 0.4)) puntos += 2;
  if ((decision.montoPrestamo || 0) <= Math.max(0, (decision.montoInnovacion || 0) + (resultado.pagoProduccion || 0))) puntos += 2;
  return Math.max(0, Math.min(10, puntos));
}

function limitarTexto(valor, max) {
  const texto = typeof valor === 'string' ? valor : '';
  return texto.slice(0, max);
}

function contarPalabras(texto) {
  return String(texto || '').trim().split(/\s+/).filter(Boolean).length;
}

module.exports = {
  TIPOS_EXAMEN,
  normalizarConfigExamenes,
  validarTipoExamen,
  prepararEstadoHeredado,
  calcularTendencia,
  calcularCoherenciaOperativoFinanciera,
  limitarTexto,
  contarPalabras,
};
