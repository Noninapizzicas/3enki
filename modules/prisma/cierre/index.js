/**
 * prisma/cierre — REFLEJO JS: el CIERRE DE CAJA / cuadre del día.
 *
 * Generalizado de pizzepos/persistencia-comandero (la parte del cuadre). Acumula
 * los cobros completados (cobro.procesado) y produce el cuadre: total + desglose
 * por método de pago + nº de ventas. Universal (cualquier comercio con caja).
 * v0.1 en memoria. Ver prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class PrismaCierreReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cierre';
    this.version = 'reflejo-0.1.0';
    this.ventas = [];   // {cobro_id, cuenta_id, monto_total_centimos, metodo, at}
  }

  onCerrarCajaRequest(e) { return this._atender(e, 'cerrar_caja', 'cierre.cerrar_caja.response', d => this._cerrarCaja(d)); }
  onEstadoRequest(e)     { return this._atender(e, 'estado', 'cierre.estado.response', d => this._estado(d)); }

  // función PURA: ventas → cuadre.
  _cuadre(ventas) {
    let total = 0; const por_metodo = {};
    for (const v of ventas) {
      const m = v.monto_total_centimos || 0;
      total += m;
      const met = v.metodo || 'desconocido';
      por_metodo[met] = (por_metodo[met] || 0) + m;
    }
    return { total_centimos: total, por_metodo, num_ventas: ventas.length };
  }

  _estado() {
    return { status: 200, data: this._cuadre(this.ventas) };
  }

  _cerrarCaja(input) {
    const cuadre = this._cuadre(this.ventas);
    const ventas = this.ventas.slice();
    this.ventas = [];   // reset del día
    this.eventBus?.publish('caja.cerrada', { project_id: input && input.project_id, ...cuadre, timestamp: nowISO() });
    return { status: 200, data: { ...cuadre, ventas, cerrada_at: nowISO() } };
  }

  // señal: un cobro completado entra en el cuadre.
  onCobroProcesado(event) {
    const d = event && (event.data || event.payload || event) || {};
    if (!d.cobro_id) return;
    this.ventas.push({
      cobro_id: d.cobro_id, cuenta_id: d.cuenta_id || null,
      monto_total_centimos: (typeof d.monto_total_centimos === 'number') ? d.monto_total_centimos : 0,
      metodo: d.metodo_pago || 'desconocido', at: nowISO()
    });
  }
}

module.exports = PrismaCierreReflejo;
