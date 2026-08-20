'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { ConfigCustodio, validarSchema } = require('../_shared/config-custodio');

const REGLAS_PATH = 'marca.json';

// Contrato marca-v1 — null = política por declarar (el dueño puebla).
const DEFAULT_REGLAS = {
  esquema: 'marca-v1',
  voz: {
    tono: null,
    valores: [],
    tradicion_referencia: null
  },
  presencia: {
    canales: []
  },
  clientes: {
    lista: []
  },
  fidelizacion: {
    activa: false,
    puntos_por_euro: null,
    recompensas: []
  }
};

const round = (x, n = 2) => {
  const f = Math.pow(10, n);
  return Math.round(x * f) / f;
};

// =============================================================
// Validadores declarativos de la custodia — por campo del cambio,
// validan SOLO lo que viene (campos ausentes no se tocan).
// =============================================================
const VALIDADORES_CUSTODIA = {
  voz: (v) => {
    if (v.tono !== null && typeof v.tono !== 'string') {
      return { field: 'voz.tono', message: 'debe ser string o null' };
    }
    if (v.valores !== undefined && !Array.isArray(v.valores)) {
      return { field: 'voz.valores', message: 'debe ser array' };
    }
    return null;
  },
  presencia: (v) => {
    if (v.canales !== undefined && !Array.isArray(v.canales)) {
      return { field: 'presencia.canales', message: 'debe ser array' };
    }
    return null;
  },
  clientes: (v) => {
    if (v.lista !== undefined && !Array.isArray(v.lista)) {
      return { field: 'clientes.lista', message: 'debe ser array' };
    }
    return null;
  },
  fidelizacion: (v) => {
    if (v.activa !== undefined && typeof v.activa !== 'boolean') {
      return { field: 'fidelizacion.activa', message: 'debe ser boolean' };
    }
    if (v.puntos_por_euro !== null && (typeof v.puntos_por_euro !== 'number' || v.puntos_por_euro <= 0)) {
      return { field: 'fidelizacion.puntos_por_euro', message: 'debe ser número > 0 o null' };
    }
    if (v.recompensas !== undefined && !Array.isArray(v.recompensas)) {
      return { field: 'fidelizacion.recompensas', message: 'debe ser array' };
    }
    return null;
  }
};

// =============================================================
// Tabla FORMULAS — el registro de conversores puros del módulo.
// =============================================================
const FORMULAS = {
  voz: {
    descripcion: 'Voz de marca: tono, valores y tradición de referencia.',
    schema: {},
    fn: (reglas) => {
      return { status: 200, data: { voz: reglas.voz ?? null } };
    }
  },
  presencia: {
    descripcion: 'Presencia digital: canales activos.',
    schema: {},
    fn: (reglas) => {
      return { status: 200, data: { canales: reglas.presencia?.canales ?? [] } };
    }
  },
  cliente: {
    descripcion: 'Consulta de un cliente por contacto (teléfono o email).',
    schema: { contacto: { tipo: 'string', requerido: true } },
    fn: (reglas, input) => {
      const lista = reglas.clientes?.lista ?? [];
      const cliente = lista.find(c => c.contacto === input.contacto) ?? null;
      if (!cliente) {
        return { status: 200, data: { contacto: input.contacto, cliente: null, metodo: 'no_encontrado' } };
      }
      return { status: 200, data: { contacto: input.contacto, cliente, metodo: 'encontrado' } };
    }
  },
  fidelizacion: {
    descripcion: 'Puntos y recompensas de un cliente (si la fidelización está activa).',
    schema: { contacto: { tipo: 'string', requerido: true } },
    fn: (reglas, input) => {
      const fidel = reglas.fidelizacion ?? {};
      if (!fidel.activa) {
        return { status: 200, data: { contacto: input.contacto, activa: false, nota: 'fidelización desactivada' } };
      }
      const lista = reglas.clientes?.lista ?? [];
      const cliente = lista.find(c => c.contacto === input.contacto) ?? null;
      const puntos = cliente?.puntos ?? 0;
      return { status: 200, data: { contacto: input.contacto, activa: true, puntos, puntos_por_euro: fidel.puntos_por_euro, recompensas: fidel.recompensas ?? [] } };
    }
  }
};

class MarcaClienteReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marca-cliente';
    this.version = 'reflejo-0.1.0';
    this._custodio = ConfigCustodio.crear(this, {
      esquema: 'marca-v1',
      path: REGLAS_PATH,
      defaultConfig: DEFAULT_REGLAS,
      bloques: ['voz', 'presencia', 'clientes', 'fidelizacion'],
      validadores: VALIDADORES_CUSTODIA,
      evento: 'marca.reglas.actualizadas',
      campoDatos: 'reglas'
    });
  }

  // ================= RPC del bus (una línea por op — dispatch por id) =================
  onVozObtenerRequest(e) { return this._atender(e, 'voz_obtener', 'marca.voz.obtener.response', d => this._calcular('voz', d)); }
  onPresenciaObtenerRequest(e) { return this._atender(e, 'presencia_obtener', 'marca.presencia.obtener.response', d => this._calcular('presencia', d)); }
  onClienteObtenerRequest(e) { return this._atender(e, 'cliente_obtener', 'marca.cliente.obtener.response', d => this._calcular('cliente', d)); }
  onFidelizacionObtenerRequest(e) { return this._atender(e, 'fidelizacion_obtener', 'marca.fidelizacion.obtener.response', d => this._calcular('fidelizacion', d)); }
  onReglasLeerRequest(e) { return this._atender(e, 'reglas_leer', 'marca.reglas.leer.response', d => this._reglasLeer(d)); }
  onReglasActualizarRequest(e) { return this._atender(e, 'reglas_actualizar', 'marca.reglas.actualizar.response', d => this._custodio.actualizar(d.project_id, d.cambios)); }

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

module.exports = MarcaClienteReflejo;
