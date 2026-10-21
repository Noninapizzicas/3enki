'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { ConfigCustodio, validarSchema } = require('../_shared/config-custodio');

const REGLAS_PATH = 'masa.json';

// Contrato reglas-masa-v1 — null = política por declarar (el dueño puebla).
const DEFAULT_REGLAS = {
  esquema: 'reglas-masa-v1',
  gramajes_formato: {
    disco_33_cm: 315,
    disco_30_cm: null,
    disco_28_cm: null,
    pan_bocata: null,
    pan_hotdog: null,
    cuenco_cazuela: null
  },
  referencia_declarada: { formato: 'disco_33_cm', gramos: 315 },
  receta: { hidratacion_pct: null, harina_pct: null, agua_pct: null, sal_pct: null, madre_pct: null },
  ventana_uso: { min_horas: 24, max_horas: 72 },
  reamasado_limite_pct: null,
  agenda: { decision_martes: null }
};

// Formatos con diámetro conocido — los únicos interpolables por área.
const DIAMETROS = { disco_28_cm: 28, disco_30_cm: 30, disco_33_cm: 33 };

const round = (x, n = 2) => {
  const f = Math.pow(10, n);
  return Math.round(x * f) / f;
};

// =============================================================
// Validadores declarativos de la custodia — por campo del cambio,
// validan SOLO lo que viene (campos ausentes no se tocan).
// =============================================================
const VALIDADORES_CUSTODIA = {
  gramajes_formato: (v) => {
    for (const [formato, valor] of Object.entries(v)) {
      if (valor !== null && (typeof valor !== 'number' || valor <= 0)) {
        return { field: `gramajes_formato.${formato}`, message: 'gramaje debe ser número > 0 o null' };
      }
    }
    return null;
  },
  ventana_uso: (v) => {
    if (v.min_horas !== undefined && (typeof v.min_horas !== 'number' || v.min_horas <= 0)) {
      return { field: 'ventana_uso.min_horas', message: 'min_horas debe ser número > 0' };
    }
    if (v.max_horas !== undefined && (typeof v.max_horas !== 'number' || v.max_horas <= 0)) {
      return { field: 'ventana_uso.max_horas', message: 'max_horas debe ser número > 0' };
    }
    if (v.min_horas !== undefined && v.max_horas !== undefined && v.min_horas >= v.max_horas) {
      return { field: 'ventana_uso', message: 'ventana.min debe ser < ventana.max' };
    }
    return null;
  },
  reamasado_limite_pct: (v) => {
    if (v !== null && (typeof v !== 'number' || v < 0 || v > 100)) {
      return { field: 'reamasado_limite_pct', message: 'debe ser número en [0, 100] o null' };
    }
    return null;
  },
  referencia_declarada: (v) => {
    if (!DIAMETROS[v.formato]) {
      return { field: 'referencia_declarada.formato', message: 'formato de referencia debe tener diámetro conocido' };
    }
    if (typeof v.gramos !== 'number' || v.gramos <= 0) {
      return { field: 'referencia_declarada.gramos', message: 'gramos debe ser número > 0' };
    }
    return null;
  },
  receta: (v) => {
    for (const [campo, valor] of Object.entries(v)) {
      if (valor !== null && (typeof valor !== 'number' || valor < 0)) {
        return { field: `receta.${campo}`, message: 'debe ser porcentaje ≥ 0 o null' };
      }
    }
    return null;
  }
};

// =============================================================
// Tabla FORMULAS — el registro de conversores puros del módulo.
// Añadir una fórmula = añadir UNA entrada (schema de entrada + fn),
// sin tocar handlers. Las fn reciben las reglas ya leídas (DI).
// =============================================================
const gramajePara = (reglas, formato) => {
  const gramajes = reglas.gramajes_formato || {};
  const declarado = gramajes[formato];
  if (typeof declarado === 'number' && declarado > 0) {
    return { gramos: declarado, metodo: 'declarado' };
  }
  const ref = reglas.referencia_declarada || {};
  const diam = DIAMETROS[formato] ?? null;
  const refDiam = DIAMETROS[ref.formato] ?? null;
  if (diam && refDiam && typeof ref.gramos === 'number' && ref.gramos > 0) {
    return { gramos: round(ref.gramos * (diam * diam) / (refDiam * refDiam)), metodo: 'interpolado' };
  }
  return { gramos: null, metodo: 'pendiente' };
};

const FORMULAS = {
  gramaje: {
    descripcion: 'Gramaje para un formato: declarado o interpolado por área desde la referencia.',
    schema: { formato: { tipo: 'string', requerido: true } },
    fn: (reglas, input) => {
      const g = gramajePara(reglas, input.formato);
      return { status: 200, data: { formato: input.formato, gramaje_gramos: g.gramos, metodo: g.metodo } };
    }
  },
  rendimiento: {
    descripcion: 'Kilos de masa → nº de bolas/tandas para un formato (lo consume agrupacion-tanda A3).',
    schema: {
      formato: { tipo: 'string', requerido: true },
      kilos: { tipo: 'number', min: 0, exclusivo: true, requerido: true }
    },
    fn: (reglas, input) => {
      const g = gramajePara(reglas, input.formato);
      if (!g.gramos) {
        return {
          status: 200,
          data: {
            formato: input.formato, kilos: input.kilos, bolas: null, gramos_sobrantes: null,
            metodo: 'pendiente', nota: 'gramaje del formato sin declarar: declara gramajes_formato o la referencia'
          }
        };
      }
      const totalGramos = input.kilos * 1000;
      const bolas = Math.floor(totalGramos / g.gramos);
      return {
        status: 200,
        data: {
          formato: input.formato,
          gramaje_gramos: g.gramos,
          kilos: input.kilos,
          bolas,
          gramos_sobrantes: round(totalGramos - bolas * g.gramos),
          metodo: g.metodo
        }
      };
    }
  },
  reamasado: {
    descripcion: 'Decisión de reamasado del excedente (política M5, límite configurable).',
    schema: {
      excedente_gramos: { tipo: 'number', min: 0, requerido: true },
      tanda_original_gramos: { tipo: 'number', min: 0, exclusivo: true, requerido: true }
    },
    fn: (reglas, input) => {
      const limitePct = reglas.reamasado_limite_pct;
      if (typeof limitePct !== 'number') {
        return {
          status: 200,
          data: {
            decision: 'pendiente_declaracion', nota: 'reamasado_limite_pct sin declarar',
            excedente_gramos: input.excedente_gramos, tanda_original_gramos: input.tanda_original_gramos
          }
        };
      }
      const limiteGramos = input.tanda_original_gramos * limitePct / 100;
      const dentro = input.excedente_gramos <= limiteGramos;
      return {
        status: 200,
        data: {
          decision: dentro ? 'REAMASAR_CON_MASA_NUEVA' : 'FUERA_DEL_CIRCUITO',
          dentro_limite: dentro,
          limite_gramos: round(limiteGramos),
          excedente_gramos: input.excedente_gramos
        }
      };
    }
  }
};

class MasaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'masa';
    this.version = 'reflejo-0.1.0';
    this._custodio = ConfigCustodio.crear(this, {
      esquema: 'reglas-masa-v1',
      path: REGLAS_PATH,
      defaultConfig: DEFAULT_REGLAS,
      bloques: ['gramajes_formato', 'ventana_uso', 'receta', 'referencia_declarada', 'agenda'],
      validadores: VALIDADORES_CUSTODIA,
      evento: 'masa.reglas.actualizadas',
      campoDatos: 'reglas'
    });
  }

  // ================= RPC del bus (una línea por op — dispatch por id) =================
  onGramajeCalcularRequest(e) { return this._atender(e, 'gramaje_calcular', 'masa.gramaje.calcular.response', d => this._calcular('gramaje', d)); }
  onRendimientoCalcularRequest(e) { return this._atender(e, 'rendimiento_calcular', 'masa.rendimiento.calcular.response', d => this._calcular('rendimiento', d)); }
  onReamasadoCalcularRequest(e) { return this._atender(e, 'reamasado_calcular', 'masa.reamasado.calcular.response', d => this._calcular('reamasado', d)); }
  onReglasLeerRequest(e) { return this._atender(e, 'reglas_leer', 'masa.reglas.leer.response', d => this._reglasLeer(d)); }
  onReglasActualizarRequest(e) { return this._atender(e, 'reglas_actualizar', 'masa.reglas.actualizar.response', d => this._custodio.actualizar(d.project_id, d.cambios)); }

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

module.exports = MasaReflejo;
