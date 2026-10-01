/**
 * contabilidad-libro/cuadre-cobro-pago — REFLEJO STATELESS (E3, hoja del plan).
 *
 * CLAVE NATURAL COMPARTIDA: un movimiento bancario = un cobro/pago. Determinista: mismo movimiento
 * + mismo cobro/pago → mismo cuadre. Es el hermano puntual de E1 (conciliacion-bancaria): E1 cruza
 * el EXTRACTO entero por clave natural; aqui se comprueba UN movimiento contra UN cobro/pago y, si
 * cuadra y la peticion declara el asiento, se SUBE por EVENTO escritor-diario.asentar.request (B2,
 * single-writer del libro). Lo que NO cuadra se DECLARA y se SUBE a partida-no-identificada.juzgar.request
 * (E7, el juicio) — no se imputa a ojo.
 *
 * Honestidad (invariante 13): sin las dos caras (movimiento y cobro/pago) el cuadre NO se afirma —
 * queda [ABIERTO] (no se finge un cuadre con una cara ausente).
 *
 * NO escribe, NO persiste. RPC cuadrar es CLASE PREGUNTA → sin ui_handler.
 * Publica cuadre-cobro-pago.cuadrar.response y su par .failed.
 * Escucha contabilidad.asiento_asentado (B2 escritor-diario, emitido).
 * Ver hoja E3 del plan-construccion y diseno-oop.md (CLASE CuadreCobroPago).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CuadreCobroPago extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuadre-cobro-pago';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCuadrarRequest(e) {
    return this._atender(e, 'cuadrar', 'cuadre-cobro-pago.cuadrar.response', async (d) => {
      const res = this._cuadrar(d);
      if (res.status !== 200) {
        this.eventBus?.publish('cuadre-cobro-pago.cuadrar.failed', res);
        return res;
      }
      const pid = res.data.project_id;
      if (res.data.cuadra === true && res.data.asiento) {
        // SUBE (best-effort) el asiento al single-writer del libro (B2); aqui no se escribe.
        this.eventBus?.publish('escritor-diario.asentar.request', {
          project_id: pid, asiento: res.data.asiento, origen: 'cuadre-cobro-pago', correlation_id: d.correlation_id
        });
      } else if (res.data.cuadra === false) {
        // Sin cuadre NO se imputa a ojo: se sube al juicio (E7).
        this.eventBus?.publish('partida-no-identificada.juzgar.request', {
          project_id: pid, movimiento: res.data.movimiento, cobro_pago: res.data.cobro_pago,
          motivo: res.data.motivo_descuadre, origen: 'cuadre-cobro-pago', correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): se observa el libro (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._vistos = this._vistos || [];
    if (d.asiento) this._vistos.push(d.asiento);
    if (this._vistos.length > 2000) this._vistos.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // cuadrar(movimiento, cobro_pago) → { cuadra, diferencia, abierto }
  // ══════════════════════════════════════════════════════════════════════
  _cuadrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const movimiento = input.movimiento && typeof input.movimiento === 'object' ? input.movimiento : null;
    const cobroPago = (input.cobro_pago && typeof input.cobro_pago === 'object') ? input.cobro_pago
      : (input.cobro && typeof input.cobro === 'object' ? input.cobro
        : (input.pago && typeof input.pago === 'object' ? input.pago : null));

    // Sin las DOS caras el cuadre NO se afirma (dato ausente = desconocido).
    if (!movimiento || !cobroPago) {
      return {
        status: 200,
        data: {
          project_id: pid, tipo: 'cuadre-cobro-pago',
          movimiento, cobro_pago: cobroPago,
          cuadra: null, diferencia: null,
          abierto: {
            caras: !movimiento && !cobroPago
              ? 'faltan las dos caras (movimiento bancario y cobro/pago): el cuadre no se afirma'
              : (!movimiento ? 'falta el movimiento bancario: el cuadre no se afirma' : 'falta el cobro/pago: el cuadre no se afirma')
          }
        }
      };
    }

    // CLAVE NATURAL COMPARTIDA: un movimiento bancario = un cobro/pago.
    const claveBanco = this._clave(movimiento);
    const claveCobro = this._clave(cobroPago);
    const importeBanco = this._round(this._num(movimiento.importe != null ? movimiento.importe : movimiento.cuota), 2);
    const importeCobro = this._round(this._num(cobroPago.importe != null ? cobroPago.importe : cobroPago.total), 2);
    const diferencia = this._round(importeBanco - importeCobro, 2);

    // Cuadra si la clave natural coincide (o, sin clave, si el importe coincide) dentro del epsilon.
    const mismaClave = claveBanco && claveCobro && claveBanco === claveCobro;
    const cuadra = mismaClave || Math.abs(diferencia) <= 0.005;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'cuadre-cobro-pago',
        clave: claveBanco,
        clave_cobro_pago: claveCobro,
        movimiento,
        cobro_pago: cobroPago,
        importe_movimiento: importeBanco,
        importe_cobro_pago: importeCobro,
        diferencia,
        cuadra,
        // El asiento propuesto lo declara la peticion; si cuadra se SUBE a B2 (no se escribe aqui).
        asiento: input.asiento && typeof input.asiento === 'object' ? input.asiento : null,
        motivo_descuadre: cuadra ? null : 'la clave natural (o el importe) del movimiento y el cobro/pago no coinciden',
        determinista: true,
        abierto: {
          asiento: (cuadra && !input.asiento) ? 'cuadra pero no se declaro el asiento propuesto: no se inventa el apunte (lo propone quien lo tenga)' : null
        }
      }
    };
  }

  // La clave natural COMPARTIDA (importe|fecha|referencia): canonica y determinista.
  _clave(m) {
    const importe = this._round(this._num(m && (m.importe != null ? m.importe : m.cuota)), 2);
    const fecha = String((m && (m.fecha != null ? m.fecha : m.fecha_valor)) || '').slice(0, 10);
    const ref = String((m && (m.referencia != null ? m.referencia : (m.ref != null ? m.ref : (m.concepto || '')))) || '').trim().toLowerCase();
    return `${importe}|${fecha}|${ref}`;
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolCuadrar(params) { return this._cuadrar(params); }
}

module.exports = CuadreCobroPago;
