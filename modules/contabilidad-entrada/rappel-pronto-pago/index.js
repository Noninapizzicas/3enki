/**
 * contabilidad-entrada/rappel-pronto-pago — REFLEJO STATELESS (N7, hoja del plan).
 *
 * **DESCUENTOS / RAPPELS / ANTICIPOS QUE AJUSTAN EL COSTE REAL DE LA COMPRA A LO REALMENTE PAGADO.**
 *
 * Determinista: dada la factura (o su importe declarado) y las CONDICIONES DECLARADAS, se calcula
 * el coste real (importe menos los descuentos que efectivamente se aplican) y lo que queda pendiente.
 *
 * 🔴 **LOS PORCENTAJES Y LAS CONDICIONES SON DECLARABLES — PROHIBIDO CABLEARLOS.** En este fichero
 * NO hay ningun porcentaje, ningun plazo ni ningun umbral escrito: ni "2% a 10 dias", ni "1% a 30",
 * ni tramos de rappel, ni un minimo de anticipo. Todo entra como DATO (`condiciones`):
 *   · pronto pago → {tipo:'pronto_pago', porcentaje, dias}   (el `dias` es la condicion declarada)
 *   · rappel      → {tipo:'rappel', tramos:[{desde,hasta,porcentaje}], volumen|base} o {porcentaje}
 *   · anticipo    → {tipo:'anticipo', porcentaje, dias}       (condicion declarada)
 *   · descuento   → {tipo:'descuento', porcentaje}
 * Si una condicion no declara su porcentaje, esa condicion NO es aplicable y se declara
 * (`condiciones_inaplicables`): NO se asume un porcentaje. Si NO se declara ninguna condicion, el
 * coste real es el declarado y se dice que no hay descuento — un descuento inventado rebajaria el
 * coste de la compra que el negocio no aprobo.
 *
 * 🔴 **LA CONDICION SE APLICA SOLO SI SE CUMPLE CON LO DECLARADO.** El pronto pago exige saber los
 * dias reales de pago (`dias_pago`); sin ese dato, la condicion queda PENDIENTE de dato (`abierto`),
 * no se aplica ni se descarta. El rappel por volumen exige el `volumen`/`base` declarado.
 *
 * ATRIBUTOS del diseno: `compra:Factura`, `condiciones:ParametroDeclarable`.
 * METODOS: `ajustar(f:Factura):Cuantía`.
 *
 * Invariantes:
 *  - DETERMINISTA: misma factura + mismas condiciones + mismos datos de pago → mismo coste real.
 *  - Dato ausente = desconocido: sin importe no hay coste; sin dato para aplicar una condicion esta
 *    queda pendiente; nada se estima. Los pagos declarados se leen tal cual (`total_pagado`), no se suponen.
 *  - NO escribe, NO persiste, NO muta y NO decide: el ajuste es un DERIVADO.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja N7 del plan-construccion y diseno-oop.md (CLASE RappelProntoPago).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Las CLASES de condicion que el reflejo sabe evaluar. Son IDENTIDADES de tipo (el dominio las
// nombra), NO criterios ni porcentajes: QUE se aplica y CUANTO lo declara el negocio.
const TIPOS_CONDICION = new Set(['pronto_pago', 'rappel', 'anticipo', 'descuento']);

class RappelProntoPago extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'rappel-pronto-pago';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onAjustarRequest(e) {
    return this._atender(e, 'ajustar', 'rappel-pronto-pago.ajustar.response', async (d) => {
      const res = this._ajustar(d);
      if (res.status !== 200) this.eventBus?.publish('rappel-pronto-pago.ajustar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // ajustar(f:Factura) → Cuantía (coste REAL de la compra)
  // ══════════════════════════════════════════════════════════════════════
  _ajustar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La FACTURA: declarada. Su importe es la base por defecto (o la base declarada aparte).
    const factura = input.factura && typeof input.factura === 'object' ? input.factura : null;
    const importe = this._importe(factura, input);
    if (importe === null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'rappel-pronto-pago',
          factura: this._fichaFactura(factura),
          importe: null,
          descuentos_aplicados: [],
          condiciones_inaplicables: [],
          coste_real: null,
          disponible: false,
          abierto: {
            importe: 'la factura no declara importe: no hay coste que ajustar (nada se estima)'
          }
        }
      };
    }

    // Las CONDICIONES: DECLARADAS (lista). Sin condiciones declaradas → no hay descuento que aplicar.
    const condiciones = this._condiciones(input, factura);

    const aplicados = [];
    const inaplicables = [];
    const pendientes_de_dato = [];

    for (const c of condiciones) {
      const evaluada = this._evaluar(c, importe, input, factura);
      if (evaluada.estado === 'aplicada') aplicados.push(evaluada);
      else if (evaluada.estado === 'pendiente_de_dato') pendientes_de_dato.push(evaluada);
      else inaplicables.push(evaluada);
    }

    // El DESCUENTO TOTAL: la suma de los aplicados. Sin condiciones aplicadas → 0 (no se inventa).
    const descuento_total = this._round(aplicados.reduce((s, a) => s + a.descuento, 0), 2);
    const coste_real = this._round(importe - descuento_total, 2);

    // Lo REALMENTE pagado: los pagos DECLARADOS se leen tal cual (no se suponen).
    const total_pagado = this._pagos(input, factura);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'rappel-pronto-pago',
        factura: this._fichaFactura(factura),
        // El coste declarado de la compra y el REAL tras los descuentos que EFECTIVAMENTE se aplican.
        importe,
        descuento_total,
        coste_real,
        disponible: true,
        // Cada descuento viaja con SU condicion declarada y con el dato que lo justifica (auditable).
        descuentos_aplicados: aplicados,
        condiciones_inaplicables: inaplicables,
        condiciones_pendientes_de_dato: pendientes_de_dato,
        num_condiciones: condiciones.length,
        // 🔴 Las condiciones que se aplicaron, tal como se declararon: nada cableado.
        condiciones_declaradas: condiciones.map((c) => ({
          tipo: c.tipo,
          porcentaje: c.porcentaje,
          dias: c.dias,
          aplicable: c.aplicable
        })),
        // Lo pagado: declarado (pagos o total_pagado). Ausente → null (no se asume pagado).
        total_pagado,
        pendiente: total_pagado === null ? null : this._round(importe - total_pagado, 2),
        deriva_de: ['condiciones declaradas (ParametroDeclarable)'],
        abierto: {
          // Sin condiciones declaradas NO hay descuento: el coste real es el declarado.
          condiciones: condiciones.length === 0
            ? 'no se declararon condiciones (pronto pago / rappel / anticipo): el coste real es el declarado, sin descuento (PROHIBIDO cablear porcentajes)'
            : null,
          porcentajes: condiciones.some((c) => !c.aplicable && c.motivo === 'sin_porcentaje')
            ? 'hay condiciones sin porcentaje declarado: esas condiciones NO son aplicables (no se asume un porcentaje)'
            : null,
          datos_de_pago: pendientes_de_dato.length > 0
            ? `hay ${pendientes_de_dato.length} condicion(es) pendientes de un dato declarado (dias de pago / volumen): no se aplican ni se descartan`
            : null,
          total_pagado: condiciones.length > 0 && total_pagado === null
            ? 'no se declararon los pagos de la factura: el pendiente NO se estima'
            : null
        }
      }
    };
  }

  // Evalua UNA condicion declarada contra el importe y los datos declarados. Determinista.
  _evaluar(c, importe, input, factura) {
    const base = this._base(c, importe);

    // RAppel por TRAMOS declarados: exige el volumen/base acumulado declarado.
    if (c.tipo === 'rappel' && Array.isArray(c.tramos)) {
      const volumen = this._num(input.volumen !== undefined ? input.volumen
        : (c.volumen !== undefined ? c.volumen : (factura && factura.volumen !== undefined ? factura.volumen : null)));
      if (volumen === null) {
        return { tipo: c.tipo, estado: 'pendiente_de_dato', motivo: 'sin_volumen', condicion: c, descripcion: 'el rappel por tramos exige el volumen declarado: sin el no se sabe que tramo aplica' };
      }
      const tramo = c.tramos.find((t) => {
        const desde = this._num(t && t.desde);
        const hasta = this._num(t && t.hasta);
        if (desde !== null && volumen < desde) return false;
        if (hasta !== null && volumen > hasta) return false;
        return true;
      });
      if (!tramo) {
        return { tipo: c.tipo, estado: 'inaplicable', motivo: 'sin_tramo', condicion: c, volumen, descripcion: 'el volumen declarado no cae en ningun tramo declarado: no hay rappel' };
      }
      const pct = this._porcentaje(tramo);
      if (pct === null) {
        return { tipo: c.tipo, estado: 'inaplicable', motivo: 'sin_porcentaje', condicion: c, volumen, tramo, descripcion: 'el tramo no declara porcentaje: NO se asume' };
      }
      return { tipo: c.tipo, estado: 'aplicada', condicion: c, tramo, porcentaje: pct, base, descuento: this._round(base * pct / 100, 2), justificacion: `volumen ${volumen} cae en el tramo declarado [${tramo.desde ?? '-'}..${tramo.hasta ?? '-'}] al ${pct}% declarado` };
    }

    // El PORCENTAJE: DECLARADO en la condicion. Sin porcentaje, la condicion NO es aplicable.
    const pct = this._porcentaje(c);
    if (pct === null) {
      return { tipo: c.tipo, estado: 'inaplicable', motivo: 'sin_porcentaje', condicion: c, descripcion: 'la condicion no declara porcentaje: NO se asume uno (PROHIBIDO cablear)' };
    }

    // PRONTO PAGO / ANTICIPO con plazo declarado: exige los DIAS REALES de pago declarados.
    if ((c.tipo === 'pronto_pago' || c.tipo === 'anticipo') && c.dias !== null && c.dias !== undefined) {
      const dias_pago = this._num(input.dias_pago !== undefined ? input.dias_pago
        : (c.dias_pago !== undefined ? c.dias_pago : (factura && factura.dias_pago !== undefined ? factura.dias_pago : null)));
      if (dias_pago === null) {
        return { tipo: c.tipo, estado: 'pendiente_de_dato', motivo: 'sin_dias_pago', condicion: c, descripcion: `la condicion declara ${c.dias} dias pero no se declaro cuando se pago: no se aplica ni se descarta` };
      }
      // La condicion se cumple si se pago dentro del plazo DECLARADO (no hay plazo cableado).
      if (dias_pago > c.dias) {
        return { tipo: c.tipo, estado: 'inaplicable', motivo: 'fuera_de_plazo', condicion: c, dias_pago, dias_declarados: c.dias, descripcion: `se pago a ${dias_pago} dias y la condicion declarada exige <= ${c.dias}: no aplica` };
      }
      return { tipo: c.tipo, estado: 'aplicada', condicion: c, porcentaje: pct, base, dias_pago, descuento: this._round(base * pct / 100, 2), justificacion: `pago a ${dias_pago} dias, dentro del plazo declarado (<= ${c.dias}) al ${pct}%` };
    }

    // DESCUENTO (o condicion sin plazo): se aplica sobre la base declarada al porcentaje declarado.
    return { tipo: c.tipo, estado: 'aplicada', condicion: c, porcentaje: pct, base, descuento: this._round(base * pct / 100, 2), justificacion: `descuento declarado del ${pct}% sobre la base ${base}` };
  }

  // Las CONDICIONES: la lista DECLARADA (input.condiciones / factura.condiciones). Sin declarar → [].
  _condiciones(input, factura) {
    const raw = input.condiciones !== undefined ? input.condiciones
      : (input.condicion !== undefined ? input.condicion
        : (factura && factura.condiciones !== undefined ? factura.condiciones : null));
    if (raw === null || raw === undefined) return [];
    const lista = Array.isArray(raw) ? raw : [raw];
    const out = [];
    for (const c of lista) {
      if (c === null || c === undefined) continue;
      const obj = typeof c === 'object' ? c : { tipo: String(c) };
      const tipo = obj.tipo != null ? String(obj.tipo).toLowerCase().trim() : '';
      if (!TIPOS_CONDICION.has(tipo)) continue;               // tipo no declarado de forma reconocible → no se aplica
      const pct = this._porcentaje(obj);
      out.push({
        tipo,
        // El PORCENTAJE declarado (acepta porcentaje / pct / tanto_por_ciento / descuento_pct).
        porcentaje: pct,
        // El PLAZO declarado (dias): solo si la condicion lo declara.
        dias: this._num(obj.dias !== undefined ? obj.dias : (obj.plazo !== undefined ? obj.plazo : null)),
        // Los TRAMOS declarados (rappel por volumen).
        tramos: Array.isArray(obj.tramos) ? obj.tramos : null,
        base: obj.base !== undefined ? obj.base : null,
        // El origen DECLARADO (condiciones del tercero, del proveedor, ad-hoc): no se cablea.
        origen: obj.origen != null ? String(obj.origen) : null,
        // Una condicion sin porcentaje NO es aplicable: cero porcentajes asumidos.
        aplicable: pct !== null,
        motivo: pct !== null ? null : 'sin_porcentaje',
        declarado: obj
      });
    }
    return out;
  }

  _porcentaje(c) {
    if (!c || typeof c !== 'object') return null;
    return this._num(
      c.porcentaje !== undefined ? c.porcentaje
        : (c.pct !== undefined ? c.pct
          : (c.tanto_por_ciento !== undefined ? c.tanto_por_ciento
            : (c.descuento_pct !== undefined ? c.descuento_pct
              : (c.descuento !== undefined && typeof c.descuento !== 'object' ? c.descuento : null))))
    );
  }

  _base(c, importe) {
    const b = this._num(c && c.base);
    if (b === null) return this._round(importe, 2);
    return this._round(Math.abs(b), 2);
  }

  _importe(factura, input) {
    if (input.importe !== undefined && input.importe !== null) {
      const v = this._num(input.importe);
      if (v !== null) return Math.abs(v);
    }
    if (!factura) return null;
    const v = this._num(factura.importe !== undefined ? factura.importe
      : (factura.total !== undefined ? factura.total : (factura.base_imponible !== undefined ? factura.base_imponible : null)));
    return v === null ? null : Math.abs(v);
  }

  // Lo REALMENTE pagado: pagos DECLARADOS (lista) o total_pagado declarado. Ausente → null.
  _pagos(input, factura) {
    const lista = Array.isArray(input.pagos) ? input.pagos
      : (factura && Array.isArray(factura.pagos) ? factura.pagos : null);
    if (lista) {
      let total = 0;
      let hay = false;
      for (const p of lista) {
        const v = this._num(p && (p.importe !== undefined ? p.importe : p));
        if (v === null) continue;
        total += Math.abs(v);
        hay = true;
      }
      return hay ? this._round(total, 2) : null;
    }
    const directo = this._num(input.total_pagado !== undefined ? input.total_pagado
      : (factura && factura.total_pagado !== undefined ? factura.total_pagado : null));
    return directo === null ? null : this._round(Math.abs(directo), 2);
  }

  _fichaFactura(factura) {
    if (!factura) return null;
    return {
      clave: factura.clave_natural !== undefined ? factura.clave_natural : (factura.clave !== undefined ? factura.clave : null),
      numero: factura.numero !== undefined ? factura.numero : null,
      proveedor: factura.proveedor !== undefined ? factura.proveedor : null,
      fecha: factura.fecha !== undefined ? factura.fecha : null
    };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolAjustar(params) { return this._ajustar(params); }
}

module.exports = RappelProntoPago;
