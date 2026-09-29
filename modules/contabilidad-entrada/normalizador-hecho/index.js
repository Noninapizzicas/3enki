/**
 * contabilidad-entrada/normalizador-hecho — CONVERSOR STATELESS (A2, hoja del plan).
 *
 * UNICA puerta de formato: homogeneiza el hecho de cada vertical a la FORMA ASENTABLE
 * del dominio. La regla de forma es DECLARABLE (`regla_forma`: por campo canonico, su
 * ruta en el crudo + requeridos); sin declararla, la regla es identidad por nombre
 * canonico y se declara asi en la salida — nunca se cablea una forma legal.
 *
 * Invariantes:
 *  - Dato ausente = desconocido: los campos que no llegan ni se declaran quedan `null`
 *    y se listan en `abierto` (nada se estima).
 *  - No escribe ni deduplica: solo da forma. Asentar es B2; la idempotencia, A7.
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A2 del plan-construccion y diseno-oop.md (CLASE NormalizadorHecho).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Forma asentable del Hecho. Su origen en el crudo es declarable (regla_forma).
const CAMPOS_HECHO = [
  'fecha', 'importe', 'moneda', 'tercero', 'referencia', 'concepto',
  'lineas_impuesto', 'tipo', 'vertical'
];

class NormalizadorHecho extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'normalizador-hecho';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onNormalizarRequest(e) {
    return this._atender(e, 'normalizar', 'normalizador-hecho.normalizar.response', async (d) => {
      const res = this._normalizar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.hecho_normalizado', {
          project_id: res.data.project_id,
          hecho: res.data.hecho,
          clave_natural: res.data.hecho.clave_natural,
          abierto: res.data.abierto,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('normalizador-hecho.normalizar.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget del flujo de entrada: el puerto vertical publico un hecho crudo.
  onHechoCrudo(e) {
    const d = (e && (e.data || e)) || {};
    const payload = d.crudo || d;
    const res = this._normalizar({
      project_id: d.project_id,
      crudo: payload,
      regla_forma: d.regla_forma,
      correlation_id: d.correlation_id
    });
    if (res.status === 200) {
      this.eventBus?.publish('contabilidad.hecho_normalizado', {
        project_id: res.data.project_id,
        hecho: res.data.hecho,
        clave_natural: res.data.hecho.clave_natural,
        abierto: res.data.abierto,
        correlation_id: d.correlation_id
      });
    } else {
      this.eventBus?.publish('normalizador-hecho.normalizar.failed', res);
    }
    return res;
  }

  // ── proyeccion determinista: crudo → Hecho asentable ──
  _normalizar(input = {}) {
    const crudo = input.crudo || input.hecho_crudo;
    if (!crudo || typeof crudo !== 'object') return this._invalid('crudo');

    const pid = input.project_id || this.project_id || null;
    // El crudo puede venir envuelto por el puerto ({vertical,tipo,payload,...}) o plano.
    const payload = (crudo.payload && typeof crudo.payload === 'object') ? crudo.payload : crudo;
    const vertical = crudo.vertical != null ? String(crudo.vertical) : null;
    const tipo_crudo = crudo.tipo != null ? String(crudo.tipo) : null;

    const regla = (input.regla_forma || crudo.regla_forma);
    const regla_declarada = Boolean(regla && typeof regla === 'object');
    const mapa = regla_declarada && regla.campos && typeof regla.campos === 'object' ? regla.campos : {};
    const requeridos = Array.isArray(regla?.requeridos) ? regla.requeridos.map(String) : [];

    const hecho = {};
    const abierto = [];
    for (const campo of CAMPOS_HECHO) {
      // Ruta declarada (soporta 'a.b') o identidad por nombre canonico.
      const ruta = mapa[campo] != null ? String(mapa[campo]) : campo;
      const val = this._leerRuta(payload, ruta);
      if (val === undefined || val === null || val === '') {
        hecho[campo] = null;
        abierto.push(campo);          // [ABIERTO] — no se estima
      } else {
        hecho[campo] = val;
      }
    }

    // Vertical y tipo: del sobre si el crudo los trae, si no del payload.
    hecho.vertical = vertical || hecho.vertical;
    hecho.tipo = tipo_crudo || hecho.tipo;
    // El sobre puede aportarlos aunque el payload no: lo que quedo resuelto sale de abierto.
    if (hecho.vertical && abierto.includes('vertical')) abierto.splice(abierto.indexOf('vertical'), 1);
    if (hecho.tipo && abierto.includes('tipo')) abierto.splice(abierto.indexOf('tipo'), 1);
    if (!hecho.vertical) abierto.push('vertical');
    if (!hecho.tipo) abierto.push('tipo');

    // Clave natural: la declara el crudo o la declara la regla; NO se inventa.
    hecho.clave_natural = crudo.clave_natural != null ? String(crudo.clave_natural) : null;
    if (!hecho.clave_natural) {
      const ruta_clave = regla_declarada && regla.clave_natural ? String(regla.clave_natural) : null;
      if (ruta_clave) {
        const v = this._leerRuta(payload, ruta_clave);
        hecho.clave_natural = v != null && v !== '' ? String(v) : null;
      }
      if (!hecho.clave_natural) abierto.push('clave_natural');
    }

    // Requeridos declarados que falten → la normalizacion no es utilizable.
    const faltan_requeridos = requeridos.filter((c) => hecho[c] === undefined || hecho[c] === null || hecho[c] === '');

    return {
      status: 200,
      data: {
        project_id: pid,
        regla_declarada,
        requeridos_faltantes: faltan_requeridos,
        abierto,
        hecho
      }
    };
  }

  _leerRuta(obj, ruta) {
    if (!obj || !ruta) return undefined;
    return String(ruta).split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
  }

  toolNormalizar(params) { return this._normalizar(params); }
}

module.exports = NormalizadorHecho;
