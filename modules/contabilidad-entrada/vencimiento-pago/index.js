/**
 * contabilidad-entrada/vencimiento-pago — REFLEJO STATELESS (N6, hoja del plan).
 *
 * FECHA DE VENCIMIENTO POR FACTURA DESDE LA POLITICA DECLARADA. Calcula, de forma determinista,
 * cuando vence cada factura (lado pago y lado cobro) aplicando los PLAZOS DECLARABLES: dias de
 * vencimiento, base de computo (fecha emision / recepcion), dias naturales o de calendario, etc.
 *
 * LOS PLAZOS SON DECLARABLES (LEY COMO DATO, invariante 5): NO hay ningun plazo cableado — ni
 * "30 dias", ni "60 dias", ni un calendario de vencimientos estandar. Si la politica NO se
 * declara, la fecha de vencimiento queda `[ABIERTO]` (`fecha_vencimiento:null`, `abierto:['plazo']`):
 * NADA se estima. El modulo nunca supone un plazo comercial.
 *
 * Alimenta prevision-caja (E5, contabilidad-libro) y la antiguedad de saldos (N8) via el tipo
 * `Vencimiento`: un solo tipo con DOS LADOS (pago/cobro) — el lado es dato declarado.
 *
 * Invariantes:
 *  - Determinista: misma factura + misma politica → misma fecha de vencimiento.
 *  - Dato ausente = desconocido: sin politica declarada, sin fecha base, la fecha queda null.
 *  - La clave natural del vencimiento es la de la factura; un vencimiento = una factura.
 *  - NO escribe, NO persiste, NO muta.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja N6 del plan-construccion y diseno-oop.md (CLASE VencimientoPago).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class VencimientoPago extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'vencimiento-pago';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'vencimiento-pago.calcular.response', async (d) => {
      const res = this._calcular(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el vencimiento quedo calculado. Lo LEEN
        // prevision-caja (E5) y antiguedad-de-saldos (N8).
        this.eventBus?.publish('contabilidad.vencimiento_proximo', {
          project_id: res.data.project_id,
          vencimiento: res.data.vencimiento,
          lado: res.data.vencimiento ? res.data.vencimiento.lado : null,
          fecha_vencimiento: res.data.vencimiento ? res.data.vencimiento.fecha_vencimiento : null,
          abierto: res.data.abierto,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('vencimiento-pago.calcular.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion determinista: calcular(f:Factura) → Vencimiento ──
  _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const factura = input.factura || input.f || input.hecho;
    if (!factura || typeof factura !== 'object') return this._invalid('factura');

    // El LADO es dato declarado: pago o cobro. Es UN solo tipo Vencimiento con dos lados.
    const lado = input.lado != null ? String(input.lado).toLowerCase().trim()
      : (factura.lado != null ? String(factura.lado).toLowerCase().trim() : null);

    // La POLITICA DE PLAZOS es DECLARABLE. Sin ella, no hay fecha: [ABIERTO].
    const politica = input.politica && typeof input.politica === 'object' ? input.politica
      : (factura.politica && typeof factura.politica === 'object' ? factura.politica : null);

    // La fecha base tambien es dato: por defecto se toma la emision, pero si el hecho no la
    // aporta y no se declara otra, es desconocida.
    const base_declarada = input.base != null ? String(input.base)
      : (politica && politica.base != null ? String(politica.base) : 'emision');
    const fecha_base = this._fechaDe(factura, base_declarada, input);

    const abierto = [];
    if (!politica) abierto.push('politica');
    if (politica && (politica.dias === undefined || politica.dias === null)) abierto.push('plazo');
    if (!fecha_base) abierto.push('fecha_base');
    if (!lado) abierto.push('lado');

    let fecha_vencimiento = null;
    let dias_aplicados = null;
    if (politica && politica.dias !== undefined && politica.dias !== null && fecha_base) {
      const dias = Number(politica.dias);
      if (Number.isFinite(dias)) {
        dias_aplicados = dias;
        fecha_vencimiento = this._sumarDias(fecha_base, dias, this._calendario(politica));
      }
    }

    const hoy = input.hoy != null ? String(input.hoy) : null;
    const dias_hasta_vencimiento = (fecha_vencimiento && hoy)
      ? this._diffDias(hoy, fecha_vencimiento) : null;

    const vencimiento = {
      // Un vencimiento = una factura: la clave natural es la de la factura.
      clave_natural: factura.clave_natural != null ? String(factura.clave_natural) : null,
      lado,
      fecha_emision: this._fechaDe(factura, 'emision', input),
      fecha_base,
      base: base_declarada,
      dias: dias_aplicados,
      calendario: politica ? this._calendario(politica) : null,
      fecha_vencimiento,
      importe: factura.importe != null && Number.isFinite(Number(factura.importe))
        ? this._round(Number(factura.importe), 2) : null,
      dias_hasta_vencimiento,
      vencido: dias_hasta_vencimiento !== null ? dias_hasta_vencimiento < 0 : null
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        factura: { clave_natural: vencimiento.clave_natural, importe: vencimiento.importe },
        vencimiento,
        politica_declarada: Boolean(politica),
        completo: abierto.length === 0,
        abierto,
        // Lo alimentados: E5 (prevision-caja) y N8 (antiguedad-de-saldos) por el evento.
        alimenta: ['prevision-caja', 'antiguedad-de-saldos']
      }
    };
  }

  // Lee una fecha de la factura por el nombre de campo declarado; ausencia → null.
  _fechaDe(factura, campo, input = {}) {
    const mapa = {
      emision: factura.fecha_emision ?? factura.fecha ?? input.fecha_emision,
      recepcion: factura.fecha_recepcion ?? input.fecha_recepcion,
      base: factura.fecha_base ?? input.fecha_base
    };
    const raw = mapa[campo] !== undefined ? mapa[campo] : factura[campo];
    if (raw === undefined || raw === null || raw === '') return null;
    const t = Date.parse(String(raw));
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }

  // Calendario declarable: 'natural' (por defecto mecanico) o 'laborable' si se declara.
  _calendario(politica) {
    return politica && politica.calendario != null ? String(politica.calendario).toLowerCase().trim() : 'natural';
  }

  // Suma dias segun el calendario declarado. 'natural' es aritmetica de fecha pura.
  _sumarDias(fecha_iso, dias, calendario) {
    const t = Date.parse(fecha_iso);
    if (!Number.isFinite(t)) return null;
    if (calendario !== 'natural') {
      // Calendario no natural: solo se salta el fin de semana (declarado); no se cablea
      // ningun festivo — los festivos son dato declarable que NO se asume.
      const d = new Date(t);
      let restantes = Math.abs(dias);
      const paso = dias >= 0 ? 1 : -1;
      while (restantes > 0) {
        d.setUTCDate(d.getUTCDate() + paso);
        const dow = d.getUTCDay();
        if (dow === 0 || dow === 6) continue;
        restantes -= 1;
      }
      return d.toISOString().slice(0, 10);
    }
    const d = new Date(t + dias * 86400000);
    return d.toISOString().slice(0, 10);
  }

  _diffDias(desde_iso, hasta_iso) {
    const a = Date.parse(desde_iso), b = Date.parse(hasta_iso);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = VencimientoPago;
