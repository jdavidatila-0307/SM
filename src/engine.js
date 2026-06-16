/**
 * MOTOR DE CÁLCULO v2.1
 * Fórmulas basadas en el ejemplo integral del documento.
 * cfg = { params, tiposProducto, canales, segmentos, afinidadMatrix, competenciaExterna }
 */

// ── Helpers ────────────────────────────────────────────────────
function avg(a, b) { return (a + b) / 2; }
function roundBs(x) { return Math.round(x * 100) / 100; }

// ── Normalización de nombres ───────────────────────────────────
// Convierte variantes históricas / errores tipográficos al nombre
// canónico registrado en tiposProducto / canales / segmentos.
// Se aplica tanto en el motor como en la capa de guardado (server.js).

const ALIAS_PRODUCTO = {
  'antibacteriano': 'Antibacterial',
  'antibacteriales': 'Antibacterial',
  'cosmetico':      'Cosmético',
  'cosméticos':     'Cosmético',
  'dermatologico':  'Dermatológico',
  'dermatologicos': 'Dermatológico',
  'basico':         'Básico',
  'basicos':        'Básico',
  'naturales':      'Natural',
  'institucionales':'Institucional',
};

const ALIAS_CANAL = {
  'mercados':       'Mercado',
  'supermercados':  'Supermercado',
  'farmacias':      'Farmacia',
  'digitales':      'Digital',
  'institucionales':'Institucional',
  'ninguno':        'Ninguno',
};

const ALIAS_SEGMENTO = {
  'masivo popular':      'Masivo popular',
  'masivo aspiracional': 'Masivo aspiracional',
  'funcional familiar':  'Funcional familiar',
  'cosmético':           'Cosmético',
  'cosmetico':           'Cosmético',
  'dermatológico':       'Dermatológico',
  'dermatologico':       'Dermatológico',
  'natural':             'Natural',
  'institucional':       'Institucional',
};

/**
 * Intenta resolver el nombre recibido contra un catálogo activo (obj con claves exactas).
 * Estrategia: 1) exacto  2) alias precargado  3) búsqueda case-insensitive sin tildes.
 * Devuelve el nombre canónico si lo encuentra, o el original para que el error sea descriptivo.
 */
function resolverNombre(valor, catalogoKeys, aliasMap) {
  if (!valor) return valor;
  // 1. Coincidencia exacta
  if (catalogoKeys.includes(valor)) return valor;
  // 2. Alias explícito (sin tilde, minúsculas)
  const sinTilde = valor.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (aliasMap[sinTilde]) return aliasMap[sinTilde];
  // 3. Búsqueda fuzzy case-insensitive sin tildes sobre las claves del catálogo
  const match = catalogoKeys.find(k =>
    k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === sinTilde
  );
  return match || valor; // si no hay match, devuelve el original (el error será descriptivo)
}

/**
 * Normaliza in-place todos los campos de texto de una decisión que
 * deben coincidir con claves de los catálogos de configuración.
 * Se llama antes de cualquier cálculo.
 */
function normalizarDecision(d, tiposProducto, canales, segmentos) {
  const prodKeys = Object.keys(tiposProducto);
  const canalKeys = Object.keys(canales);
  const segKeys = segmentos.map(s => s.nombre || s);

  if (d.producto)         d.producto         = resolverNombre(d.producto,         prodKeys,  ALIAS_PRODUCTO);
  if (d.canalPrincipal)   d.canalPrincipal   = resolverNombre(d.canalPrincipal,   canalKeys, ALIAS_CANAL);
  if (d.canalSecundario && d.canalSecundario !== 'Ninguno')
                          d.canalSecundario   = resolverNombre(d.canalSecundario,  canalKeys, ALIAS_CANAL);
  if (d.segmentoObjetivo) d.segmentoObjetivo = resolverNombre(d.segmentoObjetivo, segKeys,   ALIAS_SEGMENTO);
  return d;
}

// Demanda formal = demandaBase × (1 - pctContrabando)
function calcularMercadoSegmentos(params, segmentos) {
  return segmentos.map(seg => ({
    nombre:          seg.nombre,
    demandaBase:     seg.demandaBase,
    pctContrabando:  seg.pctContrabando,
    demandaFormal:   Math.round(seg.demandaBase * (1 - seg.pctContrabando)),
    tendencia:       seg.tendencia,
    descripcion:     seg.descripcion,
    indiceExterno:   seg.indiceExterno,
  }));
}

// ── Paso 1: Fuerza de ventas ───────────────────────────────────
function calcularVendedores(d, params) {
  const vendedoresFinales = Math.max(0,
    (d.vendedoresIniciales || params.vendedoresIniciales) +
    (d.contratarVendedores || 0) -
    (d.despedirVendedores  || 0)
  );
  const costoVendedores =
    vendedoresFinales * params.sueldoTrimestralVendedor +
    (d.contratarVendedores || 0) * params.costoContratacionVendedor +
    (d.despedirVendedores  || 0) * params.costoDespidoVendedor;
  return { vendedoresFinales, costoVendedores };
}

// ── Paso 2: Gasto total de marketing ──────────────────────────
// Marketing efectivo (para atractivo) = publicidad + promocion + eventos + redes + rrpp
// Gasto total = lo anterior + costoVendedores
function calcularMarketing(d, costoVendedores) {
  const mktEfectivo =
    (d.publicidad        || 0) +
    (d.promocion         || 0) +
    (d.eventos           || 0) +
    (d.marketingRedes    || 0) +
    (d.relacionesPublicas|| 0);
  const gastoTotalMarketing = mktEfectivo + costoVendedores;
  return { mktEfectivo, gastoTotalMarketing };
}

// ── Paso 3: Costo unitario ─────────────────────────────────────
// CU = costoBase + (0.20 × calidad) + costoCanal_prom + efecto_innovacion
function calcularCostoUnitario(d, tiposProducto, canales, params) {
  const tp = tiposProducto[d.producto];
  if (!tp) throw new Error(`Producto desconocido: ${d.producto}`);

  const costoBase    = tp.costoBase;
  const costoCalidad = 0.20 * (d.calidad || 5);

  // Costo canal: promedio si hay canal secundario
  const cp = canales[d.canalPrincipal]?.costoAdicionalUnitario ?? 0;
  const cs = d.canalSecundario && d.canalSecundario !== 'Ninguno'
    ? canales[d.canalSecundario]?.costoAdicionalUnitario ?? 0
    : null;
  const costoCanal = cs !== null ? avg(cp, cs) : cp;

  // Innovación
  let efInnovacion = 0;
  if (d.innovacion && d.montoInnovacion > 0 && d.produccion > 0) {
    const baseFactor = d.montoInnovacion / d.produccion;
    if (d.tipoInnovacion === 'Producto') efInnovacion = +baseFactor * params.factorInnovacionProducto;
    if (d.tipoInnovacion === 'Proceso')  efInnovacion = -baseFactor * params.factorInnovacionProceso;
    // Canal: mejora atractivo, no afecta CU directamente
  }

  return roundBs(costoBase + costoCalidad + costoCanal + efInnovacion);
}

// ── Paso 5: Atractivo competitivo ─────────────────────────────
// A = afinidad + (0.8×calidad) + (0.0001×mktEfectivo) − (0.7×precio) + bonoCanal + impactoVendedores
function calcularAtractivo(d, segmento, afinidadMatrix, canales, vendedoresFinales) {
  const afinidad = (afinidadMatrix[d.producto]?.[segmento.idx] ?? 0);

  // Canal: promedio de bonos y factores si hay canal secundario
  const canalP = canales[d.canalPrincipal] || {};
  const canalS = d.canalSecundario && d.canalSecundario !== 'Ninguno'
    ? canales[d.canalSecundario] : null;

  const bonoCanal = canalS
    ? avg(canalP.bonoAtractivo ?? 2, canalS.bonoAtractivo ?? 2)
    : (canalP.bonoAtractivo ?? 2);

  const factorVend = canalS
    ? avg(canalP.factorImpactoVendedores ?? 0.5, canalS.factorImpactoVendedores ?? 0.5)
    : (canalP.factorImpactoVendedores ?? 0.5);

  const impactoVendedores = vendedoresFinales * factorVend;

  // Si el equipo invirtió en innovación Canal, añadir bonus
  const bonusInnovacionCanal = (d.innovacion && d.tipoInnovacion === 'Canal')
    ? (d.montoInnovacion || 0) * 0.00005
    : 0;

  // ★ PROTECCIÓN: Si el atractivo resulta negativo, se fuerza a 0
  // Un producto que genera desutilidad neta simplemente no es considerado.
  let atractivo = afinidad
    + 0.8 * (d.calidad || 5)
    + 0.0001 * (d.gastoTotalMarketing || d.mktEfectivo || 0)
    - 0.7 * (d.precioVenta || 0)
    + bonoCanal
    + impactoVendedores
    + bonusInnovacionCanal;

  if (atractivo < 0) atractivo = 0;
  return atractivo;
}

// ── Paso 5b: Participación de mercado ─────────────────────────
function calcularParticipacion(decision, equiposEnSegmento, segmentoData, afinidadMatrix, canales, vendedoresPorEquipo) {
  // Calcular atractivo de todos los equipos en este segmento
  const atractivoPorEquipo = {};
  let totalAtractivo = segmentoData.indiceExterno; // competencia externa

  equiposEnSegmento.forEach(d => {
    const a = calcularAtractivo(d, segmentoData, afinidadMatrix, canales, vendedoresPorEquipo[d.equipo]);
    atractivoPorEquipo[d.equipo] = a;
    totalAtractivo += a;
  });

  const miAtractivo = atractivoPorEquipo[decision.equipo] ?? 0;
  let share = totalAtractivo > 0 ? miAtractivo / totalAtractivo : 0;

  // ★ PROTECCIÓN: Nunca permitir share negativo (restricción contable básica).
  share = Math.max(0, share);

  return { miAtractivo, atractivoPorEquipo, share };
}

// ── Paso 6–7: Ventas, comisiones e inventario ─────────────────
function calcularVentas(d, share, demandaFormal, costoUnitario) {
  const inventarioDisponible = (d.inventarioInicial || 0) + (d.produccion || 0);
  const demandaAsignada      = Math.round(demandaFormal * share);
  // ★ PROTECCIÓN: Las ventas reales nunca pueden ser negativas.
  const ventasReales         = Math.max(0, Math.min(demandaAsignada, inventarioDisponible));
  const inventarioFinal      = inventarioDisponible - ventasReales;

  const ventasBrutas = roundBs(ventasReales * (d.precioVenta || 0));

  // Comisión: promedio si hay canal secundario
  const canalesArr = [d.canalPrincipal];
  if (d.canalSecundario && d.canalSecundario !== 'Ninguno') canalesArr.push(d.canalSecundario);

  return { inventarioDisponible, demandaAsignada, ventasReales, inventarioFinal, ventasBrutas };
}

// ── Paso 3 continuado: P&L completo ──────────────────────────
function calcularResultadosFinancieros(d, ventas, costoUnitario, gastoTotalMarketing, params, canalesCfg) {
  const { ventasBrutas, ventasReales, inventarioFinal } = ventas;

  // Comisión canal
  const canalP = canalesCfg[d.canalPrincipal] || {};
  const canalS = d.canalSecundario && d.canalSecundario !== 'Ninguno' ? canalesCfg[d.canalSecundario] : null;
  const comisionPct = canalS ? avg(canalP.comisionPct ?? 0, canalS.comisionPct ?? 0) : (canalP.comisionPct ?? 0);
  const comisiones  = roundBs(ventasBrutas * comisionPct);
  const ventasNetas = roundBs(ventasBrutas - comisiones);

  // Inventario final valorizado — DEBE declararse ANTES de costoVentas
  const invFinalValorizado  = roundBs(inventarioFinal * costoUnitario);
  const costoAlmacenamiento = roundBs(inventarioFinal * params.costoAlmacenamientoUnidad);

  // Costo de ventas por diferencia de inventario (método perpetuo / partida doble)
  // costoUnitarioAnterior debe propagarse desde el resultado de la ronda anterior
  const invInicialValorizado = roundBs(
    (d.inventarioInicial || 0) * (d.costoUnitarioAnterior || costoUnitario)
  );
  const produccionValorizada = roundBs((d.produccion || 0) * costoUnitario);
  let costoVentas = roundBs(invInicialValorizado + produccionValorizada - invFinalValorizado);
  if (costoVentas < 0) costoVentas = 0;   // seguridad, no debería ocurrir

  // Utilidad bruta — DEBE declararse antes de gastosOp y utilidadNeta
  const utilidadBruta = roundBs(ventasNetas - costoVentas);

  // Innovación (gasto operativo)
  const gastoInnovacion = d.innovacion ? (d.montoInnovacion || 0) : 0;

  // Financiamiento
  const montoP = d.montoPrestamo || 0;
  const tipoP  = d.tipoPrestamo  || 'Ninguno';
  let interesesPrestamo = 0, comisionApertura = 0;
  if (tipoP !== 'Ninguno' && montoP > 0) {
    const tasa = tipoP === 'Operativo' ? params.tasaPrestamoOperativo : params.tasaPrestamoInversion;
    interesesPrestamo = roundBs(montoP * tasa);
    comisionApertura  = roundBs(montoP * params.comisionAperturaPrestamo);
  }

  // Gastos operativos totales
  let gastosOp = roundBs(
    (d.publicidad         || 0) +
    (d.promocion          || 0) +
    (d.eventos            || 0) +
    (d.marketingRedes     || 0) +
    (d.relacionesPublicas || 0) +
    (d.costoVendedores    || 0) +
    params.gastoAdminFijo      +
    params.gastoFijoPlanta     +
    params.depreciacionTrimestral +
    costoAlmacenamiento        +
    gastoInnovacion            +
    interesesPrestamo          +
    comisionApertura
  );

  let utilidadNeta = roundBs(utilidadBruta - gastosOp);

  // Flujo de caja
  const cxcCobroEsta = roundBs((d.cxcInicial || 0) / Math.max(1, params.plazoCobro)); // cobro cuota del CxC anterior
  const cobrosContado = roundBs(ventasNetas * params.pctVentasContado + cxcCobroEsta);

  // Produccion: pago de costos de producción (solo MP y conversión, sin CxP por simplicidad)
  const pagoProduccion = roundBs((d.produccion || 0) * costoUnitario);
  const pagoMktTotal   = gastoTotalMarketing; // ya incluye vendedores
  const pagoAdmin      = params.gastoAdminFijo;
  const pagoPlanta     = params.gastoFijoPlanta;
  // Nota: depreciación no es salida de caja
  const pagoInnovacion = gastoInnovacion;
  const pagoAlmacen    = costoAlmacenamiento;
  const pagoIntereses  = interesesPrestamo;
  const pagoApertura   = comisionApertura;

  const totalPagos = roundBs(pagoProduccion + pagoMktTotal + pagoAdmin + pagoPlanta +
    pagoInnovacion + pagoAlmacen + pagoIntereses + pagoApertura);

  const cajaInicial   = d.cajaInicial || 0;
  const ingresoPrestamo = tipoP !== 'Ninguno' ? montoP : 0;

  let cajaPreliminar = roundBs(cajaInicial + cobrosContado + ingresoPrestamo - totalPagos);

  // Sobregiro automático si caja < 0
  let sobregiro = 0, interesSobregiro = 0;
  if (cajaPreliminar < 0) {
    sobregiro        = roundBs(-cajaPreliminar);
    interesSobregiro = roundBs(sobregiro * params.tasaSobregiro);
    cajaPreliminar   = 0;
    utilidadNeta     = roundBs(utilidadNeta - interesSobregiro);
    gastosOp         = roundBs(gastosOp + interesSobregiro);
  }
  const cajaFinal = cajaPreliminar;

   // CxC final = CxC anterior no cobrado + nuevas ventas a crédito
  const cxcNuevo     = roundBs(ventasNetas * params.pctVentasCredito);
  const cxcNoCobrObj = roundBs((d.cxcInicial || 0) - cxcCobroEsta);
  const cxcFinal     = roundBs(Math.max(0, cxcNoCobrObj) + cxcNuevo);

  // Deuda final = préstamos + sobregiro (el interés del sobregiro va como pasivo separado)
  const amortizacion = d.amortizacion || 0;
  const deudaPrestamos = roundBs(Math.max(0, (d.deudaInicial || 0) + ingresoPrestamo - amortizacion));
  const deudaFinal = roundBs(deudaPrestamos + sobregiro + interesSobregiro);

  // Activos fijos netos
  const afNetos = roundBs((d.activosFijosIniciales || params.activosFijosIniciales) - params.depreciacionTrimestral);

  // Balance General — debe cuadrar: Activos = Pasivos + Patrimonio
  // Pasivos = deudaFinal (préstamos + sobregiro + interés sobregiro)
  // Patrimonio = Capital + ResultadoAcumulado (resultado ya incluye la pérdida del interesSobregiro)
  const totalActivos    = roundBs(cajaFinal + cxcFinal + invFinalValorizado + afNetos);
  // capitalContable es el capital ORIGINAL que pusieron los socios — no cambia con la depreciación
  const capitalContable = roundBs(params.activosFijosIniciales + params.cajaInicial);
  const resultadoAcumulado = roundBs((d.resultadoAcumuladoAnterior || 0) + utilidadNeta);
  const patrimonio      = roundBs(capitalContable + resultadoAcumulado);
  // totalPasivos = totalActivos - patrimonio (by definition, ensures balance)
  const totalPasivos    = deudaFinal;

  return {
    // Estado de Resultados
    ventasBrutas, comisiones, ventasNetas,
    costoVentas, utilidadBruta,
    publicidad:         d.publicidad         || 0,
    promocion:          d.promocion          || 0,
    eventos:            d.eventos            || 0,
    marketingRedes:     d.marketingRedes     || 0,
    relacionesPublicas: d.relacionesPublicas || 0,
    costoVendedores:    d.costoVendedores    || 0,
    gastoAdminFijo:     params.gastoAdminFijo,
    gastoFijoPlanta:    params.gastoFijoPlanta,
    depreciacion:       params.depreciacionTrimestral,
    costoAlmacenamiento, gastoInnovacion,
    interesesPrestamo, comisionApertura, interesSobregiro,
    gastosOp, utilidadNeta,

    // Flujo de Efectivo
    cajaInicial, cobrosContado, ingresoPrestamo,
    pagoProduccion, pagoMktTotal, pagoAdmin, pagoPlanta,
    pagoInnovacion, pagoAlmacen, pagoIntereses, pagoApertura,
    totalPagos, sobregiro, cajaFinal,

    // Balance
    cxcFinal, invFinalValorizado, afNetos,
    totalActivos, deudaFinal, totalPasivos,
    capitalContable, resultadoAcumulado, patrimonio,

    // Para propagación
    inventarioFinal, vendedoresFinales: d.vendedoresFinales || d.vendedoresIniciales,
    activosFijosNetos: afNetos,
    costoUnitario, comisionPct,
  };
}

// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────
function ejecutarSimulador(decisiones, cfg) {
  const { params, tiposProducto, canales, segmentos, afinidadMatrix } = cfg;

  // Normalizar campos de texto de cada decisión antes de cualquier cálculo
  decisiones.forEach(d => normalizarDecision(d, tiposProducto, canales, segmentos));

  // Calcular demanda formal de cada segmento
  const mercadoSegmentos = calcularMercadoSegmentos(params, segmentos);
  const segmentoPorNombre = {};
  mercadoSegmentos.forEach((s, i) => { segmentoPorNombre[s.nombre] = { ...s, idx: i }; });

  // Agrupar decisiones por segmento
  const equiposPorSegmento = {};
  decisiones.forEach(d => {
    if (!equiposPorSegmento[d.segmentoObjetivo]) equiposPorSegmento[d.segmentoObjetivo] = [];
    equiposPorSegmento[d.segmentoObjetivo].push(d);
  });

  // Pre-calcular vendedores y marketing por equipo (necesarios para atractivo)
  const vendedoresPorEquipo = {};
  const mktEfectivoPorEquipo = {};
  const costoVendedoresPorEquipo = {};

  decisiones.forEach(d => {
    const { vendedoresFinales, costoVendedores } = calcularVendedores(d, params);
    vendedoresPorEquipo[d.equipo]       = vendedoresFinales;
    costoVendedoresPorEquipo[d.equipo]  = costoVendedores;
    const { mktEfectivo, gastoTotalMarketing } = calcularMarketing(d, costoVendedores);
    mktEfectivoPorEquipo[d.equipo] = mktEfectivo;
    // Inyectar en decisión para que calcularAtractivo lo use
    d.mktEfectivo         = mktEfectivo;
    d.costoVendedores     = costoVendedores;
    d.gastoTotalMarketing = gastoTotalMarketing;
    d.vendedoresFinales   = vendedoresFinales;
  });

  // Calcular atractivo y shares
  const atractivoEquipos = {};
  const sharesPorEquipo  = {};

  decisiones.forEach(d => {
    const seg = segmentoPorNombre[d.segmentoObjetivo];
    if (!seg) return;
    const equiposEnSeg = equiposPorSegmento[d.segmentoObjetivo] || [];
    const { share, miAtractivo, atractivoPorEquipo } = calcularParticipacion(
      d, equiposEnSeg, seg, afinidadMatrix, canales, vendedoresPorEquipo
    );
    atractivoEquipos[d.equipo] = miAtractivo;
    sharesPorEquipo[d.equipo]  = share;
    // Guardar todos los atractivos del segmento
    Object.assign(atractivoEquipos, atractivoPorEquipo);
  });

  // Calcular resultados financieros completos
  const resultados = decisiones.map(d => {
    const seg        = segmentoPorNombre[d.segmentoObjetivo];
    const cu         = calcularCostoUnitario(d, tiposProducto, canales, params);
    const share      = sharesPorEquipo[d.equipo] || 0;
    const demFormal  = seg?.demandaFormal || 0;
    const ventas     = calcularVentas(d, share, demFormal, cu);
    const fin        = calcularResultadosFinancieros(d, ventas, cu, d.gastoTotalMarketing, params, canales);

    return {
      equipo:          d.equipo,
      equipoNombre:    d.equipoNombre,
      segmento:        d.segmentoObjetivo,
      producto:        d.producto,
      calidad:         d.calidad,
      precioVenta:     d.precioVenta,
      produccion:      d.produccion,
      demandaFormal:   demFormal,
      demandaAsignada: ventas.demandaAsignada,
      ventasReales:    ventas.ventasReales,
      shareReal:       share,
      atractivo:       atractivoEquipos[d.equipo] || 0,
      ...fin,
      alertaCaja:      fin.cajaFinal < 500 ? 'ALERTA' : 'OK',
    };
  });

  // Dashboard agregado
  const totalVentas   = resultados.reduce((s,r) => s + r.ventasReales, 0);
  const totalIngresos = resultados.reduce((s,r) => s + r.ventasNetas,  0);
  const totalUtilidad = resultados.reduce((s,r) => s + r.utilidadNeta, 0);
  const totalCaja     = resultados.reduce((s,r) => s + r.cajaFinal,    0);

  return { mercadoSegmentos, atractivoEquipos, sharesPorEquipo, resultados,
    dashboard: { totalVentas, totalIngresos, totalUtilidad, totalCaja } };
}

/**
 * PRE-SIMULACIÓN: calcula demanda asignada y market share por equipo
 * sin procesar estados financieros. Usado para notificar a los equipos
 * antes de que el profesor ejecute la simulación completa.
 */
function calcularPreSimulacion(decisiones, cfg) {
  const { params, tiposProducto, canales, segmentos, afinidadMatrix } = cfg;

  // Normalizar campos de texto de cada decisión antes de cualquier cálculo
  decisiones.forEach(d => normalizarDecision(d, tiposProducto, canales, segmentos));

  const mercadoSegmentos = calcularMercadoSegmentos(params, segmentos);
  const segmentoPorNombre = {};
  mercadoSegmentos.forEach((s, i) => { segmentoPorNombre[s.nombre] = { ...s, idx: i }; });

  const equiposPorSegmento = {};
  decisiones.forEach(d => {
    if (!equiposPorSegmento[d.segmentoObjetivo]) equiposPorSegmento[d.segmentoObjetivo] = [];
    equiposPorSegmento[d.segmentoObjetivo].push(d);
  });

  // Pre-calcular vendedores y marketing (necesarios para atractivo)
  const vendedoresPorEquipo = {};
  decisiones.forEach(d => {
    const vf = Math.max(0,
      (d.vendedoresIniciales || params.vendedoresIniciales) +
      (d.contratarVendedores || 0) - (d.despedirVendedores || 0)
    );
    vendedoresPorEquipo[d.equipo] = vf;
    const costoVend = vf * params.sueldoTrimestralVendedor +
      (d.contratarVendedores || 0) * params.costoContratacionVendedor +
      (d.despedirVendedores  || 0) * params.costoDespidoVendedor;
    d.costoVendedores     = costoVend;
    d.mktEfectivo         = (d.publicidad||0)+(d.promocion||0)+(d.eventos||0)+(d.marketingRedes||0)+(d.relacionesPublicas||0);
    d.gastoTotalMarketing = d.mktEfectivo + costoVend;
    d.vendedoresFinales   = vf;
  });

  const resultado = decisiones.map(d => {
    const seg = segmentoPorNombre[d.segmentoObjetivo];
    if (!seg) return { equipo: d.equipo, equipoNombre: d.equipoNombre, error: 'Segmento no encontrado' };

    const equiposEnSeg = equiposPorSegmento[d.segmentoObjetivo] || [];
    const { share, miAtractivo } = calcularParticipacion(
      d, equiposEnSeg, seg, afinidadMatrix, canales, vendedoresPorEquipo
    );

    const inventarioDisponible = (d.inventarioInicial || 0) + (d.produccion || 0);
    const demandaAsignada      = Math.round(seg.demandaFormal * share);
    // ★ PROTECCIÓN: Las ventas estimadas nunca pueden ser negativas.
    const ventasEstimadas      = Math.max(0, Math.min(demandaAsignada, inventarioDisponible));
    const inventarioFinalEst   = inventarioDisponible - ventasEstimadas;

    const cu = calcularCostoUnitario(d, tiposProducto, canales, params);

    return {
      equipo:              d.equipo,
      equipoNombre:        d.equipoNombre,
      segmento:            d.segmentoObjetivo,
      producto:            d.producto,
      precioVenta:         d.precioVenta,
      shareEstimado:       share,
      atractivo:           miAtractivo,
      demandaFormal:       seg.demandaFormal,
      demandaAsignada,
      ventasEstimadas,
      inventarioInicial:   d.inventarioInicial || 0,
      produccion:          d.produccion || 0,
      inventarioDisponible,
      inventarioFinalEst,
      costoUnitario:       cu,
      confirmado:          false,   // el equipo debe confirmar que vio este dato
    };
  });

  return { mercadoSegmentos, resultado };
}

module.exports = { ejecutarSimulador, calcularMercadoSegmentos, calcularPreSimulacion, normalizarDecision };