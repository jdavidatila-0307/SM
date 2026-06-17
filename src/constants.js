// ============================================================
// PARÁMETROS BASE DEL SIMULADOR — versión 2.0
// Todos los valores son editables por el admin en runtime.
// Este archivo solo provee los defaults para la primera carga.
// ============================================================

// ── 1. Configuración general ─────────────────────────────────
const PARAMS = {
  // Generales
  moneda:               'Bs',
  trimestresPorAnio:    4,

  // Financieros iniciales por equipo
  capitalInicial:           150_000,
  cajaInicial:               50_000,
  activosFijosIniciales:     80_000,
  inventarioInicialUnid:          0,
  cxcInicial:                     0,
  deudaInicial:                   0,
  capacidadMaxProduccion:    20_000,

  // Costos fijos operativos (por trimestre)
  gastoAdminFijo:             8_000,
  gastoFijoPlanta:            5_000,
  depreciacionTrimestral:     2_000,
  costoAlmacenamientoUnidad:   0.10,

  // Ventas y cobranzas
  pctVentasContado:            0.70,
  pctVentasCredito:            0.30,
  plazoCobro:                     1,   // trimestres

  // Financiamiento
  tasaPrestamoOperativo:       0.04,
  tasaPrestamoInversion:       0.03,
  tasaSobregiro:               0.06,
  comisionAperturaPrestamo:    0.01,
  plazoPrestamoOperativo:         2,   // trimestres
  plazoPrestamoInversion:         4,

  // Fuerza de ventas
  vendedoresIniciales:            2,
  sueldoTrimestralVendedor:   2_400,
  costoContratacionVendedor:    500,
  costoDespidoVendedor:         800,

  // Investigación de mercado
  costoInvestigacionBasica:   4_000,
  costoInvestigacionPremium:  7_500,

  // Innovación
  factorInnovacionProducto:   0.333,  // fracción del (monto/unid) que incrementa CU
  factorInnovacionProceso:    0.333,  // fracción que REDUCE CU

  // Marketing — saturación y aporte al atractivo
  umbralSaturacionMkt:        8_000,  // Bs por canal donde la saturación tiende a 1
  maxAportePublicidad:            2,  // aporte máximo de un canal saturado al atractivo (puntos)
};

// ── 2. Tipos de producto ──────────────────────────────────────
const TIPOS_PRODUCTO = {
  'Básico':        { costoBase: 2.10 },
  'Antibacterial': { costoBase: 2.60 },
  'Cosmético':     { costoBase: 3.20 },
  'Dermatológico': { costoBase: 3.80 },
  'Natural':       { costoBase: 3.40 },
  'Institucional': { costoBase: 2.90 },
};

// ── 3. Canales de distribución ───────────────────────────────
const CANALES = {
  'Mercado':       { costoAdicionalUnitario: 0.20, comisionPct: 0.08, factorImpactoVendedores: 0.40, bonoAtractivo: 2 },
  'Supermercado':  { costoAdicionalUnitario: 0.45, comisionPct: 0.15, factorImpactoVendedores: 0.70, bonoAtractivo: 2 },
  'Farmacia':      { costoAdicionalUnitario: 0.60, comisionPct: 0.18, factorImpactoVendedores: 0.80, bonoAtractivo: 2 },
  'Digital':       { costoAdicionalUnitario: 0.35, comisionPct: 0.10, factorImpactoVendedores: 0.20, bonoAtractivo: 2 },
  'Institucional': { costoAdicionalUnitario: 0.25, comisionPct: 0.12, factorImpactoVendedores: 1.00, bonoAtractivo: 2 },
};

// ── 4. Segmentos de mercado ───────────────────────────────────
const SEGMENTOS = [
  { nombre: 'Masivo popular',     demandaBase: 40_000, pctContrabando: 0.30, indiceExterno: 7.80, tendencia: 'Estable',          descripcion: 'Alta sensibilidad al precio' },
  { nombre: 'Masivo aspiracional', demandaBase: 18_000, pctContrabando: 0.20, indiceExterno: 6.50, tendencia: 'Creciente',        descripcion: 'Busca marca accesible y calidad' },
  { nombre: 'Funcional familiar', demandaBase: 16_000, pctContrabando: 0.15, indiceExterno: 5.80, tendencia: 'Creciente',         descripcion: 'Prioriza protección e higiene' },
  { nombre: 'Cosmético',          demandaBase: 14_000, pctContrabando: 0.10, indiceExterno: 6.20, tendencia: 'Estable',           descripcion: 'Valora fragancia e imagen' },
  { nombre: 'Dermatológico',      demandaBase: 10_000, pctContrabando: 0.05, indiceExterno: 5.50, tendencia: 'Creciente',         descripcion: 'Requiere cuidado especializado' },
  { nombre: 'Natural',            demandaBase: 12_000, pctContrabando: 0.12, indiceExterno: 6.00, tendencia: 'Alto crecimiento',  descripcion: 'Ingredientes naturales y diferenciación' },
  { nombre: 'Institucional',      demandaBase: 10_000, pctContrabando: 0.03, indiceExterno: 5.20, tendencia: 'Estable',           descripcion: 'Compra por volumen y condiciones' },
];

// ── 5. Matriz de afinidad producto × segmento ────────────────
// Escala: +3 ajuste perfecto, +1 aceptable, 0 neutro, -2 mal ajuste
// Filas = productos (misma secuencia que TIPOS_PRODUCTO)
// Columnas = segmentos (misma secuencia que SEGMENTOS)
const AFINIDAD_MATRIX = {
  //                      Mas.Pop  Mas.Asp  Func.Fam  Cosm.  Derm.  Nat.  Inst.
  'Básico':        [       3,       1,       2,       -2,    -2,    -1,    0  ],
  'Antibacterial': [       2,       1,       3,        0,     1,     0,    1  ],
  'Cosmético':     [      -2,       2,       0,        3,     1,     1,   -2  ],
  'Dermatológico': [      -2,       0,       1,        1,     3,     1,   -2  ],
  'Natural':       [      -1,       1,       1,        1,     1,     3,   -2  ],
  'Institucional': [      -2,      -2,       0,       -2,    -2,    -2,    3  ],
};

// ── 5b. Matriz de afinidad medio (canal de comunicación) × segmento ──
// Pondera cuánto pesa cada canal de comunicación según el segmento objetivo.
// Lanzamiento NEUTRO: todos los valores en 1.0 (sin efecto diferencial todavía).
const AFINIDAD_MEDIO_SEGMENTO = {
  'publicidad':          { 'Masivo popular': 1.0, 'Masivo aspiracional': 1.0, 'Funcional familiar': 1.0, 'Cosmético': 1.0, 'Dermatológico': 1.0, 'Natural': 1.0, 'Institucional': 1.0 },
  'promocion':           { 'Masivo popular': 1.0, 'Masivo aspiracional': 1.0, 'Funcional familiar': 1.0, 'Cosmético': 1.0, 'Dermatológico': 1.0, 'Natural': 1.0, 'Institucional': 1.0 },
  'eventos':             { 'Masivo popular': 1.0, 'Masivo aspiracional': 1.0, 'Funcional familiar': 1.0, 'Cosmético': 1.0, 'Dermatológico': 1.0, 'Natural': 1.0, 'Institucional': 1.0 },
  'marketingRedes':      { 'Masivo popular': 1.0, 'Masivo aspiracional': 1.0, 'Funcional familiar': 1.0, 'Cosmético': 1.0, 'Dermatológico': 1.0, 'Natural': 1.0, 'Institucional': 1.0 },
  'relacionesPublicas':  { 'Masivo popular': 1.0, 'Masivo aspiracional': 1.0, 'Funcional familiar': 1.0, 'Cosmético': 1.0, 'Dermatológico': 1.0, 'Natural': 1.0, 'Institucional': 1.0 },
};

// ── 6. Competencia externa por segmento ──────────────────────
const COMPETENCIA_EXTERNA = [
  { segmento: 'Masivo popular',    nombre: 'Contrabando genérico',  precio: 2.80, calidad: 3, marketing: 0,     participacionRef: 0.35 },
  { segmento: 'Natural',           nombre: 'Marca natural local',   precio: 7.20, calidad: 8, marketing: 6_000, participacionRef: 0.35 },
  { segmento: 'Cosmético',         nombre: 'Marca líder cosmética', precio: 7.80, calidad: 8, marketing: 9_000, participacionRef: 0.40 },
];

module.exports = { PARAMS, TIPOS_PRODUCTO, CANALES, SEGMENTOS, AFINIDAD_MATRIX, AFINIDAD_MEDIO_SEGMENTO, COMPETENCIA_EXTERNA };
