'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

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

class MasaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'masa';
    this.version = 'reflejo-0.1.0';
  }

  // ================= RPC del bus (una línea por op) =================
  onGramajeCalcularRequest(e) { return this._atender(e, 'gramaje_calcular', 'masa.gramaje.calcular.response', d => this._gramajeCalcular(d)); }
  onRendimientoCalcularRequest(e) { return this._atender(e, 'rendimiento_calcular', 'masa.rendimiento.calcular.response', d => this._rendimientoCalcular(d)); }
  onReamasadoCalcularRequest(e) { return this._atender(e, 'reamasado_calcular', 'masa.reamasado.calcular.response', d => this._reamasadoCalcular(d)); }
  onReglasLeerRequest(e) { return this._atender(e, 'reglas_leer', 'masa.reglas.leer.response', d => this._reglasLeer(d)); }
  onReglasActualizarRequest(e) { return this._atender(e, 'reglas_actualizar', 'masa.reglas.actualizar.response', d => this._reglasActualizar(d)); }

  // ================= store =================
  async _leerReglas(project_id) {
    const f = await this._leerJson(project_id, REGLAS_PATH);
    return (f && f.esquema === 'reglas-masa-v1') ? f : { ...DEFAULT_REGLAS };
  }

  _diametroDe(formato) {
    return DIAMETROS[formato] ?? null;
  }

  // FormulaGramaje: declarado manda; si no, escala cuadrática por área.
  _gramajePara(reglas, formato) {
    const gramajes = reglas.gramajes_formato || {};
    const declarado = gramajes[formato];
    if (typeof declarado === 'number' && declarado > 0) {
      return { gramos: declarado, metodo: 'declarado' };
    }
    const ref = reglas.referencia_declarada || {};
    const diam = this._diametroDe(formato);
    const refDiam = this._diametroDe(ref.formato);
    if (diam && refDiam && typeof ref.gramos === 'number' && ref.gramos > 0) {
      return { gramos: this._round(ref.gramos * (diam * diam) / (refDiam * refDiam)), metodo: 'interpolado' };
    }
    return { gramos: null, metodo: 'pendiente' };
  }

  // ================= proyecciones =================
  async _gramajeCalcular(input) {
    const { project_id, formato } = input || {};
    if (!formato) return this._invalid('formato');
    const reglas = await this._leerReglas(project_id);
    const g = this._gramajePara(reglas, formato);
    return { status: 200, data: { formato, gramaje_gramos: g.gramos, metodo: g.metodo } };
  }

  async _rendimientoCalcular(input) {
    const { project_id, formato, kilos } = input || {};
    if (!formato) return this._invalid('formato');
    if (typeof kilos !== 'number' || kilos <= 0) return this._invalid('kilos');
    const reglas = await this._leerReglas(project_id);
    const g = this._gramajePara(reglas, formato);
    if (!g.gramos) {
      return { status: 200, data: { formato, kilos, bolas: null, gramos_sobrantes: null, metodo: 'pendiente', nota: 'gramaje del formato sin declarar: declara gramajes_formato o la referencia' } };
    }
    const totalGramos = kilos * 1000;
    const bolas = Math.floor(totalGramos / g.gramos);
    return {
      status: 200,
      data: {
        formato,
        gramaje_gramos: g.gramos,
        kilos,
        bolas,
        gramos_sobrantes: this._round(totalGramos - bolas * g.gramos),
        metodo: g.metodo
      }
    };
  }

  async _reamasadoCalcular(input) {
    const { project_id, excedente_gramos, tanda_original_gramos } = input || {};
    if (typeof excedente_gramos !== 'number' || excedente_gramos < 0) return this._invalid('excedente_gramos');
    if (typeof tanda_original_gramos !== 'number' || tanda_original_gramos <= 0) return this._invalid('tanda_original_gramos');
    const reglas = await this._leerReglas(project_id);
    const limitePct = reglas.reamasado_limite_pct;
    if (typeof limitePct !== 'number') {
      return { status: 200, data: { decision: 'pendiente_declaracion', nota: 'reamasado_limite_pct sin declarar', excedente_gramos, tanda_original_gramos } };
    }
    const limiteGramos = tanda_original_gramos * limitePct / 100;
    const dentro = excedente_gramos <= limiteGramos;
    return {
      status: 200,
      data: {
        decision: dentro ? 'REAMASAR_CON_MASA_NUEVA' : 'FUERA_DEL_CIRCUITO',
        dentro_limite: dentro,
        limite_gramos: this._round(limiteGramos),
        excedente_gramos
      }
    };
  }

  async _reglasLeer(input) {
    const { project_id } = input || {};
    const f = await this._leerJson(project_id, REGLAS_PATH);
    const reglas = (f && f.esquema === 'reglas-masa-v1') ? f : { ...DEFAULT_REGLAS };
    return { status: 200, data: { reglas, fuente: f ? 'persistida' : 'default' } };
  }

  async _reglasActualizar(input) {
    const { project_id, cambios } = input || {};
    if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return this._invalid('cambios');
    const actuales = await this._leerReglas(project_id);
    const error = this._validarCambios(cambios);
    if (error) return error;

    const nuevas = { ...actuales, ...cambios };
    // merge profundo de los bloques anidados (los campos presentes reemplazan)
    for (const bloque of ['gramajes_formato', 'ventana_uso', 'receta', 'referencia_declarada', 'agenda']) {
      if (cambios[bloque] && typeof cambios[bloque] === 'object') {
        nuevas[bloque] = { ...(actuales[bloque] || {}), ...cambios[bloque] };
      }
    }

    const existia = await this._leerJson(project_id, REGLAS_PATH);
    if (existia) {
      await this._editarJson(project_id, REGLAS_PATH, [{ op: 'replace', path: '', value: nuevas }]);
    } else {
      await this._rpc('fs.write.request', { project_id, path: REGLAS_PATH, content: JSON.stringify(nuevas, null, 2) });
    }
    this.eventBus?.publish('masa.reglas.actualizadas', { project_id, reglas: nuevas });
    return { status: 200, data: { reglas: nuevas } };
  }

  _validarCambios(cambios) {
    const err = (field, message) => ({ status: 400, error: 'INVALID_INPUT', message, field });
    if (cambios.gramajes_formato) {
      for (const [formato, v] of Object.entries(cambios.gramajes_formato)) {
        if (v !== null && (typeof v !== 'number' || v <= 0)) return err(`gramajes_formato.${formato}`, 'gramaje debe ser número > 0 o null');
      }
    }
    if (cambios.ventana_uso) {
      const { min_horas, max_horas } = cambios.ventana_uso;
      if (typeof min_horas !== 'number' || min_horas <= 0) return err('ventana_uso.min_horas', 'min_horas debe ser número > 0');
      if (typeof max_horas !== 'number' || max_horas <= 0) return err('ventana_uso.max_horas', 'max_horas debe ser número > 0');
      if (min_horas >= max_horas) return err('ventana_uso', 'ventana.min debe ser < ventana.max');
    }
    if (cambios.reamasado_limite_pct !== undefined) {
      const pct = cambios.reamasado_limite_pct;
      if (pct !== null && (typeof pct !== 'number' || pct < 0 || pct > 100)) return err('reamasado_limite_pct', 'debe ser número en [0, 100] o null');
    }
    if (cambios.referencia_declarada) {
      const { formato, gramos } = cambios.referencia_declarada;
      if (!this._diametroDe(formato)) return err('referencia_declarada.formato', 'formato de referencia debe tener diámetro conocido');
      if (typeof gramos !== 'number' || gramos <= 0) return err('referencia_declarada.gramos', 'gramos debe ser número > 0');
    }
    if (cambios.receta) {
      for (const [campo, v] of Object.entries(cambios.receta)) {
        if (v !== null && (typeof v !== 'number' || v < 0)) return err(`receta.${campo}`, 'debe ser porcentaje ≥ 0 o null');
      }
    }
    return null;
  }
}

module.exports = MasaReflejo;
