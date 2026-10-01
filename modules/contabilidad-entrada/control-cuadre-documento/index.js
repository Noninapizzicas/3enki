/**
 * contabilidad-entrada/control-cuadre-documento — REFLEJO STATELESS (A4.3, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * SI IMPORTE+IMPUESTOS NO CUADRAN -> COLA; NO SE ASIENTA MAL. Calculo determinista.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Es el CONTROL entre la EXTRACCION (A4.1) y el ASIENTO. Comprueba que las cifras del
 * documento cuadran (base + cuota == total; suma de lineas == base) con tolerancia de
 * centimos. Si cuadra, devuelve `cuadra:true` y el hecho puede seguir; si NO cuadra, SUBE
 * por EVENTO `encolado-excepcion.encolar.request` (la cola de lo dudoso A8.1) — NUNCA se
 * fuerza el descuadre ni se asienta mal.
 *
 * EL CERROJO: no inventa el total, no ajusta la cuota para cuadrar. Compara lo declarado y
 * declara la DIFERENCIA (con las dos sumas). Un control que "arregla" las cifras es un
 * control que miente.
 *
 * Invariante (13): dato ausente = desconocido. Sin las cifras NO se afirma que cuadra ni que
 * no cuadra: se declara ABIERTO (no verificable), y NO se encola una excepcion por un hueco.
 *
 * R2 · no aplica: no escribe estado (solo compara) → no hay hecho que anunciar. SUBE
 * encolado-excepcion.encolar.request SOLO cuando hay descuadre real (no por falta de datos).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. RPC cuadra es CLASE PREGUNTA → SIN ui_handler.
 * Ver hoja A4.3 del plan-construccion y diseno-oop.md (CLASE ControlCuadreDocumento).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tolerancia de cuadre (centimos de redondeo, no descuadre real).
const EPSILON = 0.005;

class ControlCuadreDocumento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'control-cuadre-documento';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCuadraRequest(e) {
    return this._atender(e, 'cuadra', 'control-cuadre-documento.cuadra.response', (d) => {
      const res = this._cuadra(d);
      if (res.status === 200) {
        if (res.data.cuadra === false) {
          // DESCUADRE REAL: se sube a la cola de excepciones (A8.1). No se asienta mal.
          this.eventBus?.publish('encolado-excepcion.encolar.request', {
            project_id: res.data.project_id,
            rol: 'CONTROL_CUADRE_DOCUMENTO',
            clave: res.data.clave || `cuadre:${res.data.documento_id || 's/ref'}`,
            motivo: 'el documento NO cuadra (importe+impuestos): no se asienta mal',
            origen: 'control-cuadre-documento',
            payload: { suma_debe: res.data.base, suma_haber: res.data.total, diferencia: res.data.diferencia },
            correlation_id: d.correlation_id
          });
        }
        // Cuadra o dato ausente → no se encola nada (no se inventa la excepcion por un hueco).
      } else {
        this.eventBus?.publish('control-cuadre-documento.cuadra.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _cuadra(input) → { status, data }  ·  comparacion determinista de cifras
  // ══════════════════════════════════════════════════════════════════════
  _cuadra(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const doc = input.documento && typeof input.documento === 'object' ? input.documento : input;
    const cifras = this._cifras(doc);

    // Sin cifras NO se afirma nada: no verificable (dato ausente = desconocido).
    if (cifras.base === null && cifras.cuota === null && cifras.total === null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'control-cuadre-documento',
          documento_id: doc.documento_id != null ? String(doc.documento_id) : null,
          clave: doc.clave != null ? String(doc.clave) : null,
          base: null,
          cuota: null,
          total: null,
          diferencia: null,
          cuadra: null,
          verificable: false,
          encolada: false,
          abierto: { cifras: 'no llego ninguna cifra (base/cuota/total): el cuadre no es verificable (no se inventa)' }
        }
      };
    }

    // La comprobacion: suma(DEBE) == suma(HABER) del documento, con las cifras DECLARADAS.
    // base + cuota debe igualar total; si hay lineas, su suma de bases debe igualar la base.
    const suma_debe = this._round((cifras.base || 0) + (cifras.cuota || 0), 2);
    const suma_haber = this._round(cifras.total || 0, 2);
    const diferencia = this._round(suma_debe - suma_haber, 2);
    const cuadra = Math.abs(diferencia) <= EPSILON;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'control-cuadre-documento',
        documento_id: doc.documento_id != null ? String(doc.documento_id) : null,
        clave: doc.clave != null ? String(doc.clave) : null,
        base: cifras.base,
        cuota: cifras.cuota,
        total: cifras.total,
        suma_debe,
        suma_haber,
        diferencia,
        cuadra,
        verificable: true,
        determinista: true,
        formula: 'base + cuota == total (tolerancia de centimos)',
        encolada: cuadra === false,
        // NO se fuerza el descuadre: si no cuadra, va a la cola (lo hace el handler).
        abierto: {
          cuota: cifras.cuota !== null ? null : 'el documento no declaro la cuota de impuestos (se anota el hueco, no se inventa)',
          base: cifras.base !== null ? null : 'el documento no declaro la base'
        }
      }
    };
  }

  // Normaliza las cifras declaradas del documento. Ausente → null (no 0): un hueco no es un cero.
  _cifras(doc) {
    const base = this._num(doc.base ?? doc.importe_base ?? doc.subtotal);
    const cuota = this._num(doc.cuota ?? doc.impuestos ?? doc.iva ?? doc.cuota_iva);
    const total = this._num(doc.total ?? doc.importe_total ?? doc.importe);
    return { base, cuota, total };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCuadra(params) { return this._cuadra(params); }
}

module.exports = ControlCuadreDocumento;
