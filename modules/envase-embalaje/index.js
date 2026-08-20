'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { ConfigCustodio, validarSchema } = require('../_shared/config-custodio');

const REGLAS_PATH = 'envase.json';

// Contrato envase-v1 — null = política por declarar (el dueño puebla).
const DEFAULT_REGLAS = {
  esquema: 'envase-v1',
  eleccion: {
    para_llevar: null,
    cazuela: null,
    pizza: null
  },
  stock: {
    envases: []
  }
};

const TIPOS = ['para_llevar', 'cazuela', 'pizza'];

const tipoValido = (tipo) => TIPOS.includes(tipo);

// =============================================================
// Validadores declarativos de la custodia.
// =============================================================
const VALIDADORES_CUSTODIA = {
  eleccion: (v) => {
    for (const [tipo, envase] of Object.entries(v)) {
      if (!tipoValido(tipo)) {
        return { field: `eleccion.${tipo}`, message: 'tipo de producto desconocido' };
      }
      if (envase !== null && typeof envase !== 'string') {
        return { field: `eleccion.${tipo}`, message: 'debe ser nombre de envase o null' };
      }
    }
    return null;
  },
  stock: (v) => {
    if (v.envases !== undefined && !Array.isArray(v.envases)) {
      return { field: 'stock.envases', message: 'debe ser array' };
    }
    for (const e of v.envases ?? []) {
      if (!e.nombre || typeof e.nombre !== 'string') {
        return { field: 'stock.envases', message: 'cada envase necesita nombre' };
      }
      if (e.disponible !== undefined && (typeof e.disponible !== 'number' || e.disponible < 0)) {
        return { field: `stock.envases.${e.nombre}.disponible`, message: 'debe ser número ≥ 0' };
      }
      if (e.minimo !== undefined && (typeof e.minimo !== 'number' || e.minimo < 0)) {
        return { field: `stock.envases.${e.nombre}.minimo`, message: 'debe ser número ≥ 0' };
      }
    }
    return null;
  }
};

// =============================================================
// Tabla FORMULAS.
// =============================================================
const FORMULAS = {
  eleccion: {
    descripcion: 'Elección de envase para un tipo de producto (para_llevar, cazuela, pizza).',
    schema: { tipo: { tipo: 'string', requerido: true } },
    fn: (reglas, input) => {
      if (!tipoValido(input.tipo)) {
        return { status: 400, error: 'INVALID_INPUT', message: `tipo '${input.tipo}' desconocido`, field: 'tipo' };
      }
      const envase = reglas.eleccion?.[input.tipo] ?? null;
      if (!envase) {
        return { status: 200, data: { tipo: input.tipo, envase: null, metodo: 'pendiente', nota: 'envase sin declarar' } };
      }
      return { status: 200, data: { tipo: input.tipo, envase, metodo: 'declarado' } };
    }
  },
  stock: {
    descripcion: 'Stock de un envase (disponible, mínimo).',
    schema: { nombre: { tipo: 'string', requerido: true } },
    fn: (reglas, input) => {
      const envases = reglas.stock?.envases ?? [];
      const envase = envases.find(e => e.nombre === input.nombre) ?? null;
      if (!envase) {
        return { status: 200, data: { nombre: input.nombre, disponible: null, minimo: null, metodo: 'no_declarado' } };
      }
      return { status: 200, data: { nombre: input.nombre, disponible: envase.disponible ?? null, minimo: envase.minimo ?? null, metodo: 'declarado' } };
    }
  }
};

class EnvaseEmbalajeReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'envase-embalaje';
    this.version = 'reflejo-0.1.0';
    this._custodio = ConfigCustodio.crear(this, {
      esquema: 'envase-v1',
      path: REGLAS_PATH,
      defaultConfig: DEFAULT_REGLAS,
      bloques: ['eleccion', 'stock'],
      validadores: VALIDADORES_CUSTODIA,
      evento: 'envase.reglas.actualizadas',
      campoDatos: 'reglas'
    });
  }

  // ================= RPC del bus (una línea por op — dispatch por id) =================
  onEleccionObtenerRequest(e) { return this._atender(e, 'eleccion_obtener', 'envase.eleccion.obtener.response', d => this._calcular('eleccion', d)); }
  onStockObtenerRequest(e) { return this._atender(e, 'stock_obtener', 'envase.stock.obtener.response', d => this._calcular('stock', d)); }
  onReglasLeerRequest(e) { return this._atender(e, 'reglas_leer', 'envase.reglas.leer.response', d => this._reglasLeer(d)); }
  onReglasActualizarRequest(e) { return this._atender(e, 'reglas_actualizar', 'envase.reglas.actualizar.response', d => this._custodio.actualizar(d.project_id, d.cambios)); }

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

module.exports = EnvaseEmbalajeReflejo;
