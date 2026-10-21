/**
 * contabilidad-libro/control-calidad-muestreo — REFLEJO STATELESS (L8, hoja del plan).
 *
 * Selecciona lo que exige OJO HUMANO por SEÑALES DURAS. La regla que lo define:
 *   EXCEPCION + MUESTRA, NO revisar todo.
 * Revisar cada asiento no escala y ademas entrena a mirar sin ver. Este modulo elige que
 * mirar: (1) los que disparan una señal dura (importe alto, descuadre ya detectado,
 * cuenta sin declarar, rectificativo/ajuste); (2) una MUESTRA aleatoria-pero-determinista
 * del resto. No revisa: SELECCIONA.
 *
 * ATRIBUTOS del diseno: `reglas:UmbralDeMuestreo`.
 * Invariante: seleccion DETERMINISTA (misma entrada + mismos umbrales → misma seleccion).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA → sin ui_handler.
 * Ver hoja L8 del plan-construccion y diseno-oop.md (CLASE ControlCalidadMuestreo).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Umbrales por defecto (declarables): importe a partir del cual un asiento exige ojo humano,
// y fraccion de muestra del resto. NO son criterios de negocio cableados: son defaults
// sustituibles por los que declare el jefe.
const UMBRAL_IMPORTE = 10000;
const FRACCION_MUESTRA = 0.05;

// Señales DURAS que marcan un asiento para revision (estructurales, no de negocio).
const SENALES_DURAS = ['rectificativo', 'ajuste', 'descuadre', 'cuenta_sin_declarar', 'fuera_de_periodo'];

class ControlCalidadMuestreo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'control-calidad-muestreo';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onSeleccionarRequest(e) {
    return this._atender(e, 'seleccionar', 'control-calidad-muestreo.seleccionar.response', async (d) => {
      const res = this._seleccionar(d);
      // Reflejo: selecciona; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('control-calidad-muestreo.seleccionar.failed', res);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): vigilan el flujo y marcan lo que exige ojo humano ──
  onAsientoAsentado(e) {
    // El asiento entra al control; no se recalcula nada mas: solo se observa la señal.
    this._ultimo = this._ultimo || [];
    const d = (e && (e.data || e)) || {};
    if (d.asiento) this._ultimo.push(d.asiento);
    if (this._ultimo.length > 500) this._ultimo.shift();
  }

  onContrapartidaReglaDeclarada(e) {
    // Una regla de contrapartida cambio (nueva/aprendida/ratificada): es una señal de
    // "conviene mirar los asientos que la usan". Se registra la marca; no se decide por ella.
    const d = (e && (e.data || e)) || {};
    this._reglas_marcadas = this._reglas_marcadas || [];
    if (d.clave || d.regla) this._reglas_marcadas.push({ clave: d.clave || null, ratificada: d.ratificada === true, en: d.en || null });
    if (this._reglas_marcadas.length > 500) this._reglas_marcadas.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // _seleccionar(input) → { status, data }  ·  excepcion + muestra (determinista)
  // ══════════════════════════════════════════════════════════════════════
  _seleccionar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Umbrales DECLARABLES (reglas:UmbralDeMuestreo); si no vienen, se usan los defaults.
    const umbral = Number.isFinite(Number(input.umbral_importe)) ? Number(input.umbral_importe) : UMBRAL_IMPORTE;
    const fraccion = Number.isFinite(Number(input.fraccion_muestra)) ? Number(input.fraccion_muestra) : FRACCION_MUESTRA;

    // El universo a muestrear: asientos declarados, o los observados via el bus.
    const asientos = Array.isArray(input.asientos) ? input.asientos
      : (this._ultimo || []).map((a) => a);
    if (asientos.length === 0) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'control-calidad-muestreo',
          excepciones: [],
          muestra: [],
          num_revisar: 0,
          umbrales: { importe: umbral, fraccion_muestra: fraccion },
          determinista: true,
          abierto: { asientos: 'no hay asientos declarados ni observados: nada que seleccionar (no se inventa la cola de revision)' }
        }
      };
    }

    // 1 · EXCEPCION: por señal DURA. No es un criterio de negocio: son marcas estructurales.
    const excepciones = [];
    const resto = [];
    for (const a of asientos) {
      const senales = this._senalesDuras(a, umbral);
      if (senales.length > 0) excepciones.push({ asiento: a, senales });
      else resto.push(a);
    }

    // 2 · MUESTRA del resto: por hash determinista de clave+umbral (mismo input → misma muestra).
    const n = Math.ceil(resto.length * Math.max(0, Math.min(1, fraccion)));
    const muestra = resto
      .map((a) => ({ a, h: this._hash(`${this._claveDe(a)}|${umbral}|${fraccion}`) }))
      .sort((x, y) => (x.h < y.h ? -1 : x.h > y.h ? 1 : 0))
      .slice(0, n)
      .map((x) => x.a);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'control-calidad-muestreo',
        excepciones,
        muestra,
        num_asientos: asientos.length,
        num_excepciones: excepciones.length,
        num_muestra: muestra.length,
        num_revisar: excepciones.length + muestra.length,
        // La regla del diseno: excepcion + muestra, NO revisar todo.
        revisa_todo: false,
        umbrales: { importe: umbral, fraccion_muestra: fraccion },
        determinista: true,
        abierto: {
          umbrales_declarados: (input.umbral_importe !== undefined || input.fraccion_muestra !== undefined)
            ? null : 'se usaron los umbrales por defecto (el jefe no los declaro): son sustituibles'
        }
      }
    };
  }

  // Señales DURAS (estructurales) que exigen ojo humano. No son juicios de negocio.
  _senalesDuras(a, umbral) {
    const senales = [];
    if (!a || typeof a !== 'object') return senales;
    for (const s of SENALES_DURAS) if (a[s] === true) senales.push(s);
    const suma = Number.isFinite(Number(a.suma_debe)) ? Number(a.suma_debe)
      : (this._sumaLineas(a.lineas));
    if (suma >= umbral) senales.push('importe_alto');
    return senales;
  }

  _sumaLineas(lineas) {
    if (!Array.isArray(lineas)) return 0;
    return lineas.reduce((t, l) => t + (Number(l?.debe) || 0), 0);
  }

  _claveDe(a) {
    return (a && (a.huella || a.id || a.numero)) != null ? String(a.huella || a.id || a.numero) : JSON.stringify(a || {});
  }

  _hash(s) {
    return crypto.createHash('sha1').update(String(s)).digest('hex');
  }

  // ── Tools ──
  toolSeleccionar(params) { return this._seleccionar(params); }
}

module.exports = ControlCalidadMuestreo;
