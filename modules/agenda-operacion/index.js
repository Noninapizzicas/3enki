'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { ConfigCustodio, validarSchema } = require('../_shared/config-custodio');

const REGLAS_PATH = 'agenda.json';

// Contrato agenda-v1 — null = política por declarar (el dueño puebla).
const DEFAULT_REGLAS = {
  esquema: 'agenda-v1',
  horario: {
    desayuno: { abre: null, cierra: null },
    comida: { abre: null, cierra: null },
    merienda: { abre: null, cierra: null },
    cena: { abre: null, cierra: null }
  },
  ciclo_diario: {
    tareas: [
      { tarea: 'amasar', franja: 'desayuno', orden: 1 },
      { tarea: 'hornear', franja: 'comida', orden: 2 },
      { tarea: 'montar', franja: 'comida', orden: 3 },
      { tarea: 'limpiar', franja: 'cena', orden: 4 }
    ]
  },
  prediccion: {
    senal_dia_anterior: true,
    factor_ajuste: null
  }
};

const FRANJAS = ['desayuno', 'comida', 'merienda', 'cena'];

const franjaValida = (franja) => FRANJAS.includes(franja);

const round = (x, n = 2) => {
  const f = Math.pow(10, n);
  return Math.round(x * f) / f;
};

// =============================================================
// Validadores declarativos de la custodia — por campo del cambio,
// validan SOLO lo que viene (campos ausentes no se tocan).
// =============================================================
const VALIDADORES_CUSTODIA = {
  horario: (v) => {
    for (const [franja, ventana] of Object.entries(v)) {
      if (!FRANJAS.includes(franja)) {
        return { field: `horario.${franja}`, message: 'franja desconocida' };
      }
      if (ventana.abre !== null && typeof ventana.abre !== 'string') {
        return { field: `horario.${franja}.abre`, message: 'debe ser hora HH:MM o null' };
      }
      if (ventana.cierra !== null && typeof ventana.cierra !== 'string') {
        return { field: `horario.${franja}.cierra`, message: 'debe ser hora HH:MM o null' };
      }
    }
    return null;
  },
  ciclo_diario: (v) => {
    if (!Array.isArray(v.tareas)) {
      return { field: 'ciclo_diario.tareas', message: 'debe ser array' };
    }
    for (const t of v.tareas) {
      if (!t.tarea || typeof t.tarea !== 'string') {
        return { field: 'ciclo_diario.tareas', message: 'cada tarea necesita nombre' };
      }
      if (t.franja && !FRANJAS.includes(t.franja)) {
        return { field: `ciclo_diario.tareas.${t.tarea}.franja`, message: 'franja desconocida' };
      }
    }
    return null;
  },
  prediccion: (v) => {
    if (v.senal_dia_anterior !== undefined && typeof v.senal_dia_anterior !== 'boolean') {
      return { field: 'prediccion.senal_dia_anterior', message: 'debe ser boolean' };
    }
    if (v.factor_ajuste !== null && (typeof v.factor_ajuste !== 'number' || v.factor_ajuste <= 0)) {
      return { field: 'prediccion.factor_ajuste', message: 'debe ser número > 0 o null' };
    }
    return null;
  }
};

// =============================================================
// Tabla FORMULAS — el registro de conversores puros del módulo.
// Añadir una fórmula = añadir UNA entrada (schema de entrada + fn),
// sin tocar handlers. Las fn reciben las reglas ya leídas (DI).
// =============================================================
const FORMULAS = {
  horario: {
    descripcion: 'Horario de apertura para una franja (desayuno/comida/merienda/cena).',
    schema: { franja: { tipo: 'string', requerido: true } },
    fn: (reglas, input) => {
      if (!franjaValida(input.franja)) {
        return { status: 400, error: 'INVALID_INPUT', message: `franja '${input.franja}' desconocida`, field: 'franja' };
      }
      const ventana = reglas.horario?.[input.franja] ?? null;
      if (!ventana) {
        return { status: 200, data: { franja: input.franja, abre: null, cierra: null, metodo: 'pendiente', nota: 'franja sin declarar' } };
      }
      return { status: 200, data: { franja: input.franja, abre: ventana.abre, cierra: ventana.cierra, metodo: 'declarado' } };
    }
  },
  ciclo: {
    descripcion: 'Ciclo-diario: tareas recurrentes del día, opcionalmente filtradas por franja.',
    schema: { franja: { tipo: 'string', requerido: false } },
    fn: (reglas, input) => {
      if (input.franja && !franjaValida(input.franja)) {
        return { status: 400, error: 'INVALID_INPUT', message: `franja '${input.franja}' desconocida`, field: 'franja' };
      }
      const tareas = reglas.ciclo_diario?.tareas ?? [];
      const filtradas = input.franja ? tareas.filter(t => t.franja === input.franja) : tareas;
      return { status: 200, data: { franja: input.franja ?? 'todas', tareas: filtradas } };
    }
  },
  demanda: {
    descripcion: 'Predicción de demanda para una franja (señal: venta del día anterior).',
    schema: {
      franja: { tipo: 'string', requerido: true },
      venta_dia_anterior: { tipo: 'number', min: 0, requerido: true }
    },
    fn: (reglas, input) => {
      if (!franjaValida(input.franja)) {
        return { status: 400, error: 'INVALID_INPUT', message: `franja '${input.franja}' desconocida`, field: 'franja' };
      }
      const pred = reglas.prediccion ?? {};
      if (pred.senal_dia_anterior === false) {
        return { status: 200, data: { franja: input.franja, prediccion: null, metodo: 'sin_senal', nota: 'predicción desactivada' } };
      }
      const factor = typeof pred.factor_ajuste === 'number' ? pred.factor_ajuste : 1;
      const prediccion = round(input.venta_dia_anterior * factor);
      return { status: 200, data: { franja: input.franja, venta_dia_anterior: input.venta_dia_anterior, factor, prediccion, metodo: 'dia_anterior' } };
    }
  }
};

class AgendaOperacionReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'agenda-operacion';
    this.version = 'reflejo-0.1.0';
    this._custodio = ConfigCustodio.crear(this, {
      esquema: 'agenda-v1',
      path: REGLAS_PATH,
      defaultConfig: DEFAULT_REGLAS,
      bloques: ['horario', 'ciclo_diario', 'prediccion'],
      validadores: VALIDADORES_CUSTODIA,
      evento: 'agenda.reglas.actualizadas',
      campoDatos: 'reglas'
    });
  }

  // ================= RPC del bus (una línea por op — dispatch por id) =================
  onHorarioObtenerRequest(e) { return this._atender(e, 'horario_obtener', 'agenda.horario.obtener.response', d => this._calcular('horario', d)); }
  onCicloObtenerRequest(e) { return this._atender(e, 'ciclo_obtener', 'agenda.ciclo.obtener.response', d => this._calcular('ciclo', d)); }
  onDemandaPredecirRequest(e) { return this._atender(e, 'demanda_predecir', 'agenda.demanda.predecir.response', d => this._calcular('demanda', d)); }
  onReglasLeerRequest(e) { return this._atender(e, 'reglas_leer', 'agenda.reglas.leer.response', d => this._reglasLeer(d)); }
  onReglasActualizarRequest(e) { return this._atender(e, 'reglas_actualizar', 'agenda.reglas.actualizar.response', d => this._custodio.actualizar(d.project_id, d.cambios)); }

  // ================= dispatcher de fórmulas =================
  async _calcular(id, input) {
    const formula = FORMULAS[id];
    if (!formula) {
      return { status: 400, error: 'INVALID_INPUT', message: `fórmula '${id}' desconocida`, field: 'id' };
    }
    const error = validarSchema(formula.schema, input);
    if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };

    const { project_id } = input || {};
    const { config: reglas } = await this._custodio.leer(project_id);
    return formula.fn(reglas, input);
  }

  // ================= proyecciones =================
  async _reglasLeer(input) {
    const { config: reglas, fuente } = await this._custodio.leer(input?.project_id);
    return { status: 200, data: { reglas, fuente } };
  }
}

module.exports = AgendaOperacionReflejo;
