/**
 * Generador de Reportes de Investigación de Mercado v2.0
 * Básico: tamaño de mercado, precios, alertas generales
 * Premium: básico + participación, sensibilidad, recomendaciones segmento
 */

function generarReporteBasico(mercadoSegmentos, resultadosRonda, segmentosConfig) {
  const resultados = Object.values(resultadosRonda || {});
  
  // Precios observados en el mercado (de equipos que operaron)
  const preciosPorSegmento = {};
  resultados.forEach(r => {
    if (!preciosPorSegmento[r.segmento]) preciosPorSegmento[r.segmento] = [];
    preciosPorSegmento[r.segmento].push(r.precioVenta || 0);
  });

  const precios = mercadoSegmentos.map(seg => {
    const ps = preciosPorSegmento[seg.nombre] || [];
    return {
      segmento: seg.nombre,
      precioMin:  ps.length ? Math.min(...ps) : null,
      precioMax:  ps.length ? Math.max(...ps) : null,
      precioProm: ps.length ? Math.round(ps.reduce((a,b)=>a+b,0)/ps.length * 100)/100 : null,
    };
  });

  const alertas = [
    'Exceso de inventario: niveles sobre el 20% de la producción deterioran caja y rentabilidad.',
    `Presión del contrabando: el segmento Masivo popular sigue anclado a precios informales.`,
    'Riesgo de sobregiro: estrategias con innovación y alto gasto comercial requieren disciplina en producción.',
    'Canales especializados (Farmacia, Digital) elevan posicionamiento pero aumentan costos y comisiones.',
  ];

  return {
    tipo: 'Básico',
    titulo: 'Reporte de Inteligencia de Mercado — Básico',
    mercado: mercadoSegmentos.map(s => ({
      segmento: s.nombre,
      demandaBase: s.demandaBase,
      contrabando: `${Math.round(s.pctContrabando*100)}%`,
      mercadoFormal: s.demandaFormal,
      tendencia: s.tendencia,
    })),
    precios,
    alertas,
  };
}

function generarReportePremium(mercadoSegmentos, resultadosRonda, segmentosConfig) {
  const basico = generarReporteBasico(mercadoSegmentos, resultadosRonda, segmentosConfig);
  const resultados = Object.values(resultadosRonda || {});

  // Participación estimada por segmento
  const partPorSegmento = {};
  resultados.forEach(r => {
    if (!partPorSegmento[r.segmento]) partPorSegmento[r.segmento] = [];
    partPorSegmento[r.segmento].push({
      equipo: r.equipo, // anonimizado
      participacion: r.shareReal,
      ventas: r.ventasReales,
    });
  });

  const participacion = Object.entries(partPorSegmento).map(([seg, equipos]) => ({
    segmento: seg,
    equiposCompitiendo: equipos.length,
    shareMaximo: Math.max(...equipos.map(e => e.participacion)),
    sharePromedio: equipos.reduce((s,e)=>s+e.participacion,0)/equipos.length,
  }));

  // Sensibilidad (basada en params del segmento)
  const sensibilidad = mercadoSegmentos.map(s => {
    const sc = segmentosConfig.find(x => x.nombre === s.nombre) || {};
    return {
      segmento: s.nombre,
      precio:     s.pctContrabando > 0.20 ? 'Muy alta'  : s.pctContrabando > 0.10 ? 'Alta' : 'Media',
      calidad:    s.tendencia === 'Alto crecimiento' ? 'Alta' : s.tendencia === 'Creciente' ? 'Media-alta' : 'Media',
      redes:      ['Natural','Cosmético','Dermatológico'].includes(s.nombre) ? 'Alta' : 'Media-baja',
      canal:      ['Farmacia','Institucional'].includes(sc.canalPreferido||'') ? 'Alta' : 'Media',
    };
  });

  // Recomendaciones por tipo de estrategia (genéricas, no por equipo)
  const recomendaciones = [
    {
      estrategia: 'Volumen (Masivo)',
      precio: 'Bs 3,20–3,60', prioridad: 'Promoción + eficiencia de costos',
      produccion: 'Alinear a ventas esperadas 14,500–15,500 unid',
      meta: 'Inventario final < 10% de producción',
    },
    {
      estrategia: 'Diferenciación (Premium)',
      precio: 'Bs 7,10–7,50', prioridad: 'Redes sociales + reputación + calidad',
      produccion: '6,000–7,000 unid si penetración no mejora',
      meta: 'Inventario final < 20% de producción',
    },
  ];

  return {
    ...basico,
    tipo: 'Premium',
    titulo: 'Reporte de Inteligencia de Mercado — Premium',
    participacion,
    sensibilidad,
    recomendaciones,
  };
}

function generarReportes(decision, mercadoSegmentos, atractivoEquipos, resultadosRonda, simCfg) {
  const reportes = {};
  const { params, segmentos } = simCfg;

  if (decision.tipoInvestigacion === 'Básica') {
    reportes.investigacion = generarReporteBasico(mercadoSegmentos, resultadosRonda, segmentos);
  }
  if (decision.tipoInvestigacion === 'Premium') {
    reportes.investigacion = generarReportePremium(mercadoSegmentos, resultadosRonda, segmentos);
  }

  return reportes;
}

module.exports = { generarReportes, generarReporteBasico, generarReportePremium };
