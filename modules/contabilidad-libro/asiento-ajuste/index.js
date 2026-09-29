/**
 * contabilidad-libro/asiento-ajuste — PUENTE STATELESS (B5, hoja del plan).
 *
 * **EL CAMINO POR EL QUE LA CORRECCIÓN DEL ASESOR ENTRA AL LIBRO SIN BORRAR.**
 * La corrección SUMA: nunca sobrescribe ni borra el asiento original (invariante 3).
 * Este módulo NO almacena — el almacén es escritor-diario (B2) y traza-asiento (B4);
 * aquí solo se cruza el ajuste del asesor hacia el diario.
 *
 * Puente puro: no custodia el ajuste ni lo muta. Se dispara con
 * `contabilidad.firma_registrada` (fire-and-forget: la firma del asesor registrada)
 * y con `asiento-ajuste.entrar.request` (RPC). El ajuste SALIENTE se publica como
 * `contabilidad.asiento_ajuste_recibido`; el diario lo AÑADE — la corrección suma.
 *
 * Invariantes:
 *  - La corrección SUMA: el ajuste trae su `base` (asiento original) pero NUNCA lo
 *    reemplaza; se emite como un asiento NUEVO con `rectifica_a`.
 *  - La traza queda intacta: el puente no toca la traza (B4).
 *  - La ley entra como DATO: el motivo/criterio del ajuste es declarable, no se cablea.
 *  - Determinista: el mismo ajuste + misma base → misma clave de corrección.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja B5 del plan-construccion y diseno-oop.md (CLASE AsientoAjuste).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AsientoAjuste extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'asiento-ajuste';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una línea, delega a _atender) ──
  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'asiento-ajuste.entrar.response', async (d) => {
      const res = this._entrar(d);
      if (res.status === 200) {
        // Exito → el ajuste SALE hacia el libro. El diario lo AÑADIRA; la corrección suma.
        this.eventBus?.publish('contabilidad.asiento_ajuste_recibido', {
          project_id: res.data.project_id,
          ajuste: res.data.ajuste,
          rectifica_a: res.data.rectifica_a,
          clave_correccion: res.data.clave_correccion,
          suma: true,
          correlation_id: d.correlation_id
        });
      } else {
        // Ajuste malformado / sin base / descuadre → par determinista.
        this.eventBus?.publish('asiento-ajuste.entrar.failed', res);
      }
      return res;
    });
  }

  // ── fire-and-forget: la firma del asesor quedó registrada → el ajuste firmado entra ──
  onFirmaRegistrada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id || !d.ajuste) return null;
    return this._entrar({
      project_id: d.project_id,
      ajuste: d.ajuste,
      base: d.base || d.asiento_original || null,
      motivo: d.motivo || 'firma_asesor',
      firmado_por: d.firmado_por || d.quien || null,
      correlation_id: d.correlation_id
    });
  }

  // ── proyección de cruce: ajuste del asesor → asiento de corrección (la corrección SUMA) ──
  _entrar(input = {}) {
    const pid = input.project_id || this.project_id || null;

    // ── 1 · LA FORMA: el ajuste existe y trae apuntes. ──
    const ajuste = input.ajuste || input.a;
    if (!ajuste || typeof ajuste !== 'object') return this._invalid('ajuste');
    const apuntes = Array.isArray(ajuste.apuntes) ? ajuste.apuntes : null;
    if (!apuntes || apuntes.length === 0) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'un ajuste sin apuntes no corrige nada', { motivo: 'apuntes_vacios' });
    }

    const normalizados = [];
    for (const ap of apuntes) {
      if (!ap || typeof ap !== 'object') {
        return this._errorResponse(422, 'PRECONDITION_FAILED', 'apunte de ajuste malformado', { apunte: ap });
      }
      const cuenta = ap.cuenta != null ? String(ap.cuenta).trim() : '';
      if (!cuenta) return this._errorResponse(422, 'PRECONDITION_FAILED', 'apunte de ajuste sin cuenta', { apunte: ap });
      const debe = this._num(ap.debe);
      const haber = this._num(ap.haber);
      if (debe === null || haber === null) {
        return this._errorResponse(422, 'PRECONDITION_FAILED',
          'importe de ajuste inválido (debe/haber)', { cuenta, debe: ap.debe, haber: ap.haber });
      }
      normalizados.push({ cuenta, debe, haber });
    }

    // ── 2 · La corrección también cuadra: Σ debe = Σ haber (invariante 1). ──
    const suma_debe = this._round(normalizados.reduce((s, x) => s + x.debe, 0), 2);
    const suma_haber = this._round(normalizados.reduce((s, x) => s + x.haber, 0), 2);
    const descuadre = this._round(suma_debe - suma_haber, 2);
    if (Math.abs(descuadre) > 0.01) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'el ajuste no cuadra: suma debe != suma haber (la corrección también cuadra o es un error)',
        { suma_debe, suma_haber, descuadre, motivo: 'descuadre_partida_doble' });
    }

    // ── 3 · LA BASE: el asiento original que se corrige. NUNCA se reemplaza. ──
    const base = input.base || ajuste.base || ajuste.rectifica_a || null;
    const rectifica_a = base && typeof base === 'object'
      ? (base.clave_natural != null ? String(base.clave_natural)
        : (base.numero != null ? String(base.numero) : null))
      : (base != null ? String(base) : null);

    // ── 4 · LA CORRECCIÓN como asiento NUEVO (append-only): motivo/criterio declarables. ──
    const motivo = input.motivo != null ? String(input.motivo)
      : (ajuste.motivo != null ? String(ajuste.motivo) : 'ajuste_asesor');
    const firmado_por = input.firmado_por != null ? String(input.firmado_por)
      : (ajuste.firmado_por != null ? String(ajuste.firmado_por) : null);
    // Clave de corrección determinista: la misma corrección sobre la misma base NO se duplica.
    const clave_correccion = [
      'AJUSTE',
      rectifica_a != null ? rectifica_a : '',
      motivo,
      normalizados.map(x => `${x.cuenta}:${x.debe.toFixed(2)}:${x.haber.toFixed(2)}`).join(',')
    ].join('|');

    const asiento_correccion = {
      // Marca de corrección: el diario lo AÑADIRÁ con su propio numero (un hecho = un asiento).
      tipo: 'asiento-ajuste',
      rectifica_a,
      base_preservada: true,          // el original NO se borra ni se muta
      suma: true,                     // la corrección SUMA
      clave_natural: clave_correccion,
      concepto: ajuste.concepto != null ? String(ajuste.concepto) : (input.concepto != null ? String(input.concepto) : null),
      fecha: ajuste.fecha != null ? String(ajuste.fecha) : (input.fecha != null ? String(input.fecha) : new Date().toISOString()),
      sociedad: ajuste.sociedad != null ? String(ajuste.sociedad) : null,
      motivo,
      firmado_por,
      apuntes: normalizados,
      suma_debe,
      suma_haber,
      traza: { intacta: true, puente: 'asiento-ajuste' }
    };

    // ── 5 · El ajuste SALE hacia el escritor del diario POR EVENTO; es él quien AÑADE. ──
    // El puente no escribe en el libro: cruza el ajuste. Si el diario no responde,
    // se declara `encaminado:false` (no se finge que se escribió).
    const encaminado = this._encaminar(pid, asiento_correccion, input);

    return {
      status: 200,
      data: {
        project_id: pid,
        ajuste: asiento_correccion,
        rectifica_a,
        clave_correccion,
        suma: true,
        original_preservado: true,
        encaminado,
        motivo
      }
    };
  }

  // Publica el ajuste hacia el diario (fire-and-forget) y responde si el bus está disponible.
  _encaminar(pid, asiento, input) {
    try {
      if (!this.eventBus?.publish) return false;
      this.eventBus.publish('contabilidad.asiento_ajuste_recibido', {
        project_id: pid,
        ajuste: asiento,
        rectifica_a: asiento.rectifica_a,
        clave_correccion: asiento.clave_natural,
        suma: true,
        correlation_id: input.correlation_id
      });
      return true;
    } catch (_) {
      return false;   // se declara, no se oculta
    }
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolEntrar(params) { return this._entrar(params); }
}

module.exports = AsientoAjuste;
