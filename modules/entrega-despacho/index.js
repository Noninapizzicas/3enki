'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { ConfigCustodio, validarSchema } = require('../_shared/config-custodio');

const REGLAS_PATH = 'entrega-despacho.json';

// Contrato entrega-despacho-v1 — null = política por declarar (el dueño del proyecto puebla).
const DEFAULT_REGLAS = {
  esquema: 'entrega-despacho-v1',
  reparto: {
    activo: false,
    radio_km: null,
    coste: null,
    minutos_por_km: null
  },
  estimacion: {
    minutos_preparacion_base: null,
    minutos_por_item: null
  }
};

const round = (x, n = 2) => {
  const f = Math.pow(10, n);
  return Math.round(x * f) / f;
};

// =============================================================
// Validadores declarativos de la custodia (idéntica forma a entrega).
// =============================================================
const VALIDADORES_CUSTODIA = {
  reparto: (v) => {
    if (v.activo !== undefined && typeof v.activo !== 'boolean') {
      return { field: 'reparto.activo', message: 'debe ser boolean' };
    }
    for (const campo of ['radio_km', 'coste', 'minutos_por_km']) {
      if (v[campo] !== null && (typeof v[campo] !== 'number' || v[campo] < 0)) {
        return { field: `reparto.${campo}`, message: 'debe ser número ≥ 0 o null' };
      }
    }
    return null;
  },
  estimacion: (v) => {
    for (const campo of ['minutos_preparacion_base', 'minutos_por_item']) {
      if (v[campo] !== null && (typeof v[campo] !== 'number' || v[campo] < 0)) {
        return { field: `estimacion.${campo}`, message: 'debe ser número ≥ 0 o null' };
      }
    }
    return null;
  }
};

// =============================================================
// Tabla FORMULAS.
// =============================================================
const FORMULAS = {
  tiempo: {
    descripcion: 'Estimación de tiempo total (preparación + entrega) para un pedido.',
    schema: {
      num_items: { tipo: 'number', min: 0, requerido: true },
      km: { tipo: 'number', min: 0, requerido: false }
    },
    fn: (reglas, input) => {
      const est = reglas.estimacion ?? {};
      const base = est.minutos_preparacion_base;
      const porItem = est.minutos_por_item;
      if (typeof base !== 'number' || typeof porItem !== 'number') {
        return { status: 200, data: { minutos_preparacion: null, minutos_entrega: null, minutos_total: null, metodo: 'pendiente', nota: 'estimación sin declarar' } };
      }
      const preparacion = base + porItem * input.num_items;
      let entrega = 0;
      const rep = reglas.reparto ?? {};
      if (rep.activo && typeof rep.minutos_por_km === 'number' && typeof input.km === 'number') {
        entrega = rep.minutos_por_km * input.km;
      }
      return { status: 200, data: { minutos_preparacion: round(preparacion), minutos_entrega: round(entrega), minutos_total: round(preparacion + entrega), metodo: 'declarado' } };
    }
  },
  reparto: {
    descripcion: 'Política de reparto/entrega: radio, coste, tiempo por km.',
    schema: {},
    fn: (reglas) => {
      return { status: 200, data: { reparto: reglas.reparto ?? null } };
    }
  }
};

class EntregaDespachoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'entrega-despacho';
    this.version = 'reflejo-0.1.0';
    this._custodio = ConfigCustodio.crear(this, {
      esquema: 'entrega-despacho-v1',
      path: REGLAS_PATH,
      defaultConfig: DEFAULT_REGLAS,
      bloques: ['reparto', 'estimacion'],
      validadores: VALIDADORES_CUSTODIA,
      evento: 'entrega-despacho.reglas.actualizadas',
      campoDatos: 'reglas'
    });
  }

  // ================= RPC del bus (una línea por op — dispatch por id) =================
  onTiempoEstimarRequest(e) { return this._atender(e, 'tiempo_estimar', 'entrega-despacho.tiempo.estimar.response', d => this._calcular('tiempo', d)); }
  onRepartoObtenerRequest(e) { return this._atender(e, 'reparto_obtener', 'entrega-despacho.reparto.obtener.response', d => this._calcular('reparto', d)); }
  onReglasLeerRequest(e) { return this._atender(e, 'reglas_leer', 'entrega-despacho.reglas.leer.response', d => this._reglasLeer(d)); }
  onReglasActualizarRequest(e) { return this._atender(e, 'reglas_actualizar', 'entrega-despacho.reglas.actualizar.response', d => this._custodio.actualizar(d.project_id, d.cambios)); }

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

module.exports = EntregaDespachoReflejo;
