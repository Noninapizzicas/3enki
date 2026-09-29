/**
 * contabilidad-entrada/factura-rectificativa — REFLEJO STATELESS (O2, hoja del plan).
 *
 * DERIVA la rectificativa de una factura YA emitida: la correccion comercial POSTERIOR a la
 * emision (abono / devolucion / descuento / anulacion) que NO BORRA NADA.
 *
 * Ley de hierro (append-only): el ORIGINAL NO SE MUTA. Esta clase no toca la factura emitida
 * (O1, `emision-factura-venta`): solo produce el documento RECTIFICATIVO que CORRIGE POR SUMA.
 * Un asiento original no se reescribe; la correccion entra como documento NUEVO que referencia
 * al original por su clave natural/serie+numero.
 *
 * ATRIBUTOS del diseno: `original:FacturaEmitida`, `motivo:ParametroDeclarable`.
 *   METODOS: calcular(original, motivo):FacturaEmitida.
 *   REGLA: correccion comercial POSTERIOR a la emision (abono/devolucion/descuento) que NO
 *          borra nada. != ajuste interno B5 (`asiento-ajuste`), que es del asesor al libro.
 *
 * Invariantes:
 *  - EL ORIGINAL NO SE BORRA NI SE MUTA: se devuelve intacto y la rectificativa SUMA.
 *  - DETERMINISTA: mismo original + mismo motivo → misma rectificativa (una sola respuesta).
 *  - Dato ausente = desconocido: sin base corregible (importe/lineas del original) NO se fabrica
 *    una rectificativa con un 0; se declara `abierto:true` y lo que falta.
 *  - El MOTIVO/TIPO de correccion es DECLARABLE: sin declararlo, se emite la rectificativa y se
 *    declara el hueco (`motivo:null`) — jamas se inventa la razon de la correccion.
 *  - NO escribe, NO persiste: la rectificativa es un DERIVADO en memoria; quien la asienta es el
 *    custodio del libro.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja O2 del plan-construccion y diseno-oop.md (CLASE FacturaRectificativa).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tipos de correccion comercial DECLARABLES (la lista no decide, solo reconoce lo declarado).
const TIPOS_CORRECCION = new Set(['ABONO', 'DEVOLUCION', 'DESCUENTO', 'ANULACION']);

class FacturaRectificativa extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'factura-rectificativa';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'factura-rectificativa.calcular.response', async (d) => {
      const res = this._calcular(d);
      if (res.status === 200) {
        // Exito → evento de dominio: la correccion SUMA; el original queda intacto.
        this.eventBus?.publish('contabilidad.factura_rectificada', {
          project_id: res.data.project_id,
          rectificativa: res.data.rectificativa,
          referencia_original: res.data.referencia_original,
          original_intacta: res.data.original_intacta,
          corrige_por_suma: res.data.corrige_por_suma,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('factura-rectificativa.calcular.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion determinista: calcular(original, motivo) → FacturaRectificativa ──
  _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const original = input.original || input.factura || input.factura_original;
    if (!original || typeof original !== 'object') return this._invalid('original');

    // La REFERENCIA al original: por serie+numero o por clave natural. Sin referencia NO se
    // rectifica (una correccion que no dice a que corrige no es una rectificativa).
    const referencia_original = this._referencia(original);
    if (!referencia_original.serie && !referencia_original.numero && !referencia_original.clave_natural) {
      return this._invalid('original.serie|numero|clave_natural');
    }

    // La BASE corregible: el importe total del original, o la suma de sus lineas. Nunca se
    // supone un importe: si no hay base computable, no se fabrica la rectificativa.
    const base = this._base(original);
    const motivo = input.motivo != null ? String(input.motivo).trim() : null;
    const tipo_correccion = this._tipo(input.tipo_correccion != null ? input.tipo_correccion : input.tipo);

    if (base === null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          rectificativa: null,
          referencia_original,
          original_intacta: true,
          corrige_por_suma: true,
          abierto: true,
          faltan: ['original.importe|original.lineas'],
          motivo_declarado: motivo,
          motivo_no_emitida: 'el original no declara base corregible (importe total o lineas): no se fabrica una rectificativa con un 0 que nadie emitio'
        }
      };
    }

    // La RECTIFICATIVA: espejo del original con el SIGNO cambiado. NO muta el original.
    const lineas = this._lineas(original);
    const rectificativa = {
      id: `rect_${pid}_${referencia_original.clave_natural || (referencia_original.serie || 'S') + '-' + (referencia_original.numero || '?')}`,
      tipo: 'RECTIFICATIVA',
      serie: input.serie != null ? String(input.serie) : (referencia_original.serie ? String(referencia_original.serie) + '-R' : null),
      numero: input.numero != null ? String(input.numero) : null,
      tipo_correccion,
      motivo,
      // TRAZABILIDAD: a que corrige, con su clave natural.
      referencia_original,
      // LA CORRECCION SUMA: el importe es el espejo negativo de la base corregible.
      base_corregida: base,
      importe: this._round(-base, 2),
      signo: 'CORRIGE_POR_SUMA',
      lineas: lineas ? lineas.map((l) => ({ ...l, importe: l.importe === null ? null : this._round(-l.importe, 2) })) : null,
      // El original NO se borra: se declara su integridad explicitamente.
      original_intacta: true,
      no_borra: true,
      asienta: false,
      asienta_por: 'escritor-diario (B2, custodio del libro)',
      derivada_en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        rectificativa,
        referencia_original,
        original_intacta: true,
        corrige_por_suma: true,
        // El original viaja SIN TOCAR: esta hoja solo DERIVA; no lo reescribe.
        original,
        abierto: {
          motivo: motivo ? null : 'el motivo de la correccion no esta declarado: se emite la rectificativa y se declara el hueco',
          tipo_correccion: tipo_correccion ? null : 'el tipo de correccion no esta declarado (ABONO|DEVOLUCION|DESCUENTO|ANULACION)'
        },
        faltan: [
          ...(motivo ? [] : ['motivo']),
          ...(tipo_correccion ? [] : ['tipo_correccion'])
        ]
      }
    };
  }

  _referencia(original) {
    return {
      serie: original.serie != null ? String(original.serie) : null,
      numero: original.numero != null ? String(original.numero) : null,
      clave_natural: original.clave_natural != null ? String(original.clave_natural) : null,
      nif: original.nif != null ? String(original.nif) : (original.tercero && original.tercero.nif != null ? String(original.tercero.nif) : null)
    };
  }

  // Base corregible: importe/total declarado, o suma de lineas. null si no hay nada computable.
  _base(original) {
    const directo = this._num(original.importe != null ? original.importe : (original.total != null ? original.total : original.base));
    if (directo !== null) return directo;
    const lineas = this._lineas(original);
    if (!lineas || lineas.length === 0) return null;
    let suma = 0;
    let hay = false;
    for (const l of lineas) {
      if (l.importe === null) continue;
      suma += l.importe;
      hay = true;
    }
    return hay ? this._round(suma, 2) : null;
  }

  _lineas(original) {
    const raw = original.lineas || original.line_items || original.detalle;
    if (!Array.isArray(raw)) return null;
    return raw.map((l) => ({
      concepto: l && l.concepto != null ? String(l.concepto) : null,
      cantidad: l && l.cantidad != null ? this._num(l.cantidad) : null,
      importe: l ? this._num(l.importe != null ? l.importe : l.total) : null
    }));
  }

  _tipo(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const t = String(raw).toUpperCase().trim();
    return TIPOS_CORRECCION.has(t) ? t : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = FacturaRectificativa;
