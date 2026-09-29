/**
 * contabilidad-analitica/baja-activo — REFLEJO STATELESS (F3, hoja del plan).
 *
 * LA BAJA DEL BIEN: retira el bien del inmovilizado y DERIVA el RESULTADO de la operacion
 * comparando el VALOR NETO CONTABLE (valor-neto-contable F4) con el IMPORTE DE VENTA
 * declarado.
 *
 * ATRIBUTOS del diseno: `activo:Activo` y `vnc:ValorNetoContable`.
 *   - El VNC se pide a F4 POR EVENTO (o llega declarado en la peticion).
 *   - El IMPORTE DE VENTA es un DATO declarado por el negocio — jamas se estima. Un bien
 *     dado de baja SIN venta no tiene un importe "0" inventado: si no se declara, se declara
 *     que no consta (`importe_venta:null`) y el resultado queda `[ABIERTO]`.
 *
 * DETERMINISTA y SIN JUICIO: resultado = importe_venta − vnc. El SIGNO se DERIVA (>0 beneficio,
 * <0 perdida, =0 nulo); aqui no se valora si la baja es buena o mala, ni se decide su
 * imputacion contable (cuenta, asiento, periodo) — eso lo fija el corte del diario/ajuste.
 *
 * Invariantes:
 *  - DETERMINISTA: mismo VNC + mismo importe → mismo resultado (una sola respuesta correcta).
 *  - Dato ausente = desconocido: sin VNC o sin importe declarado → `resultado:null` y
 *    `abierto:true` con lo que falta. Nada se estima; ningun importe se rellena con 0.
 *  - NO escribe, NO persiste, NO muta, NO decide la imputacion: el bien es de F1 y la
 *    contrapartida la fija el asiento (B2/B5) con su propia regla declarada.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja F3 del plan-construccion y diseno-oop.md (CLASE BajaActivo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class BajaActivo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'baja-activo';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'baja-activo.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('baja-activo.calcular.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: calcular(activo) → Resultado<Perdida|Beneficio> ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const id_activo = input.id_activo != null ? String(input.id_activo).trim()
      : (input.activo && input.activo.id_activo != null ? String(input.activo.id_activo) : null);
    const fecha_baja = input.fecha_baja != null ? String(input.fecha_baja)
      : (input.fecha != null ? String(input.fecha) : null);

    // 1) El VALOR NETO CONTABLE: declarado en la peticion, o PEDIDO a F4 POR EVENTO.
    const { vnc, fuente_vnc } = await this._vnc(pid, id_activo, input, fecha_baja);

    // 2) El IMPORTE DE VENTA: DATO declarado. Ausente NO se estima (ni se asume 0).
    const importe_venta = this._num(input.importe_venta != null ? input.importe_venta : input.venta);

    // 3) El resultado solo existe con las dos piezas. Sin una, `[ABIERTO]`.
    const faltan = [];
    if (vnc === null) faltan.push('vnc');
    if (importe_venta === null) faltan.push('importe_venta');

    const resultado = faltan.length === 0 ? this._round(importe_venta - vnc, 2) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        id_activo,
        fecha_baja,
        motivo_baja: input.motivo_baja != null ? String(input.motivo_baja) : null,
        vnc,
        importe_venta,
        resultado,
        fuente_vnc,
        // El SIGNO se DERIVA del resultado. No se juzga si la baja es buena o mala.
        tipo_resultado: resultado === null ? null
          : (resultado > 0 ? 'beneficio' : (resultado < 0 ? 'perdida' : 'nulo')),
        // El bien queda RETIRADO (es el hecho de la baja); su imputacion NO la decide este reflejo.
        retirado: faltan.length === 0,
        abierto: faltan.length > 0,
        faltan,
        motivo: faltan.length > 0
          ? `no se deriva el resultado de la baja: falta ${faltan.join(' y ')}`
          : null,
        // LA IMPUTACION NO VIVE AQUI: el reflejo calcula, no decide la contrapartida.
        imputacion_delegada_a: 'escritor-diario'
      }
    };
  }

  // El VNC: declarado, o PEDIDO a valor-neto-contable (F4) POR EVENTO. Sin el, null.
  async _vnc(pid, id_activo, input, fecha) {
    const declarado = this._num(input.vnc != null ? input.vnc : input.valor_neto_contable);
    if (declarado !== null) return { vnc: declarado, fuente_vnc: 'declarado' };

    if (!id_activo && !(input.activo && typeof input.activo === 'object')) {
      return { vnc: null, fuente_vnc: null };
    }
    const r = await this._rpc('valor-neto-contable.calcular.request',
      { project_id: pid, id_activo, activo: input.activo, fecha }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    const vnc = data ? this._num(data.vnc) : null;
    if (vnc !== null) return { vnc, fuente_vnc: 'valor-neto-contable' };
    return { vnc: null, fuente_vnc: null };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = BajaActivo;
