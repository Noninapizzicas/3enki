/**
 * contabilidad-fiscal/pagos-a-cuenta-empleado — REFLEJO STATELESS (G8, hoja del plan).
 *
 * ANTICIPOS/ADELANTOS y su IMPACTO en el neto y en el IRPF. No todo es sueldo fijo: un
 * pago a cuenta adelantado reduce lo que se paga hoy, pero NO borra la base del IRPF (el
 * devengo manda). Esta hoja calcula ese impacto de forma DETERMINISTA.
 *
 *   · pago a cuenta (anticipo)  → reduce el NETO a percibir.
 *   · la RETENCION de IRPF      → se calcula sobre la base de devengo, NO sobre el neto
 *     tras el anticipo (el anticipo no es un menor devengo): anticipar NO baja el IRPF.
 *
 * Mecanico: los importes (bruto, retencion, anticipos) llegan DECLARADOS; aqui solo se
 * recomponen. Cero decisiones.
 *
 * Invariantes:
 *  - DETERMINISTA: mismos importes → mismo impacto.
 *  - Dato ausente = desconocido: sin base/retencion/anticipos declarados el impacto es
 *    PARCIAL y se declara (`impacto_completo:false`); nada se estima con un cero silencioso.
 *  - NO escribe, NO persiste.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.nomina_recibida`; NINGUN modulo del
 * repo lo emite AUN (lo emite puerto-nomina G4, grupo posterior): declararlo daria cadena
 * colgada. NO se declara.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G8 del plan-construccion y diseno-oop.md (CLASE PagosACuentaEmpleado).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PagosACuentaEmpleado extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'pagos-a-cuenta-empleado';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onImpactoRequest(e) {
    return this._atender(e, 'impacto', 'pagos-a-cuenta-empleado.impacto.response', async (d) => {
      const res = this._impacto(d);
      // Reflejo: calcula y declara; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('pagos-a-cuenta-empleado.impacto.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // impacto(base, retencion, anticipos) → neto e IRPF tras los pagos a cuenta
  // ══════════════════════════════════════════════════════════════════════
  _impacto(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El PAGO A CUENTA es la materia de esta hoja: sin el declarado no hay impacto que calcular.
    const anticipos = this._anticipos(input);
    if (anticipos === null) return this._invalid('anticipos');

    // Los terminos de la nomina: DECLARADOS (vienen del recibo G1). Ausente → null.
    const base = this._num(input.base != null ? input.base
      : (input.bruto != null ? input.bruto
        : (input.nomina && input.nomina.bruto != null ? input.nomina.bruto : null)));
    const retencion = this._num(input.retencion != null ? input.retencion
      : (input.irpf != null ? input.irpf
        : (input.nomina && input.nomina.retencion != null ? input.nomina.retencion : null)));

    const total_anticipos = this._round(anticipos.reduce((a, b) => a + b.importe, 0), 2);

    // El NETO a percibir hoy = devengo − retencion − anticipos (lo declarado; ausente = null).
    const neto_sin_anticipos = (base !== null && retencion !== null) ? this._round(base - retencion, 2) : null;
    const neto_a_percibir = (neto_sin_anticipos !== null) ? this._round(neto_sin_anticipos - total_anticipos, 2) : null;

    // El IRPF NO se recalcula por el anticipo: se retiene sobre la BASE DE DEVENGO (el
    // anticipo no es un menor devengo). Por eso la retencion queda INTACTA.
    const irpf = retencion;
    const irpf_sobre_base_devengo = retencion !== null;

    const completo = base !== null && retencion !== null;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'pagos-a-cuenta-empleado',
        anticipos,
        num_anticipos: anticipos.length,
        total_anticipos,
        base_devengo: base,
        retencion: retencion,
        // Impacto en el NETO: el anticipo REDUCE lo percibido hoy.
        neto_sin_anticipos,
        neto_a_percibir,
        impacto_neto: neto_a_percibir !== null && neto_sin_anticipos !== null
          ? this._round(neto_a_percibir - neto_sin_anticipos, 2) : null,
        // Impacto en el IRPF: NINGUNO — se retiene sobre el devengo, no sobre lo percibido.
        irpf,
        retencion_declarada: retencion,
        impacto_irpf: (retencion !== null) ? 0 : null,
        irpf_sobre_base_devengo,
        // El anticipo no altera el hecho generador: se declara explicitamente.
        anticipo_afecta_irpf: false,
        impacto_completo: completo,
        determinista: true,
        abierto: {
          terminos: completo ? null
            : 'faltan base de devengo o retencion declaradas: el impacto se calcula solo sobre lo declarado'
        }
      }
    };
  }

  // Los anticipos declarados: array (o un unico objeto). Normaliza cada uno a {importe,...}.
  // Devuelve null si no hay NINGUN anticipo declarado (materia de esta hoja).
  _anticipos(input = {}) {
    let raw = input.anticipos !== undefined ? input.anticipos
      : (input.pagos_a_cuenta !== undefined ? input.pagos_a_cuenta
        : (input.pagos !== undefined ? input.pagos : null));
    if (raw === null || raw === undefined) {
      // Tambien se acepta un unico anticipo declarado en la raiz.
      if (input.importe !== undefined || input.anticipo !== undefined) raw = [input.anticipo != null ? input.anticipo : input];
      else return null;
    }
    const arr = Array.isArray(raw) ? raw : [raw];
    const out = [];
    for (const a of arr) {
      const o = (a && typeof a === 'object') ? a : { importe: a };
      const importe = this._num(o.importe !== undefined ? o.importe : (o.cuantia !== undefined ? o.cuantia : null));
      if (importe === null) continue; // un anticipo sin importe no se estima con 0
      out.push({
        concepto: o.concepto != null ? String(o.concepto) : null,
        fecha: o.fecha != null ? String(o.fecha) : null,
        importe: this._round(importe, 2),
        reembolsable: o.reembolsable === true
      });
    }
    return out.length ? out : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolImpacto(params) { return this._impacto(params); }
}

module.exports = PagosACuentaEmpleado;
