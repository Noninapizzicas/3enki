'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * edias-facturas — REFLEJO JS (mitad determinista del módulo híbrido).
 * El ESLABÓN que cierra el flujo pedido → cobro → FACTURA. Emite la factura
 * SALIENTE del pedido ya cobrado (pago anticipado). La factura NUNCA inventa
 * el monto: lo toma del cobro pagado (que a su vez lo tomó del presupuesto).
 *
 * Flujo:
 *   edias.cobro.pagado ──► crea factura (fire-and-forget, monto del cobro)
 *   edias.factura.crear.request ──► factura explícita (re-emitir / manual)
 *   edias.factura.anular.request ──► anula una factura emitida (no pagada)
 *
 * La factura lleva los datos fiscales del taller (config del proyecto:
 * razon_social, nif, direccion, serie). Sin datos fiscales → queda en
 * 'borrador' (no se emite una factura sin NIF). Emite edias.factura.emitida.
 * Degradable: sin config fiscal, la factura queda borrador y se completa luego.
 */

class EdiasFacturasReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'edias-facturas';
    this.version = '0.1.0';
    this._facturas = new Map(); // factura_id -> factura
  }

  // ── handlers RPC (una línea) ──
  onCrearRequest(e)   { return this._atender(e, 'crear',   'edias.factura.crear.response',   d => this._crear(d)); }
  onObtenerRequest(e) { return this._atender(e, 'obtener', 'edias.factura.obtener.response', d => this._obtener(d)); }
  onListarRequest(e)  { return this._atender(e, 'listar',  'edias.factura.listar.response',  d => this._listar(d)); }
  onAnularRequest(e)  { return this._atender(e, 'anular',  'edias.factura.anular.response',  d => this._anular(d)); }

  // ── fire-and-forget: el cobro pagado dispara la factura ──
  async onCobroPagado(event) {
    const d = (event && event.data) || event || {};
    if (!d.cobro_id || d.estado !== 'pagado') return; // solo cobros pagados
    // Idempotente: un cobro solo genera una factura.
    for (const f of this._facturas.values()) {
      if (f.cobro_id === d.cobro_id) return;
    }
    const factura = this._nuevaFactura({
      cobro_id: d.cobro_id,
      presupuesto_id: d.presupuesto_id,
      pieza_id: d.pieza_id,
      cantidad: d.cantidad,
      monto: d.monto,
      cuenta_id: d.cuenta_id,
      correlation_id: d.correlation_id || null,
    });
    this._facturas.set(factura.factura_id, factura);
    if (factura.estado === 'emitida') {
      this.eventBus?.publish('edias.factura.emitida', factura);
    }
    this.metrics?.increment('edias-facturas.reflejo.served', { op: 'cobro_pagado', estado: factura.estado });
  }

  // ── NÚCLEO: crear una factura (explícita o re-emitir) ──
  async _crear(input) {
    const { cobro_id, monto, pieza_id, cantidad, cuenta_id, presupuesto_id } = input;
    if (!cobro_id) return this._invalid('cobro_id');
    if (typeof monto !== 'number' || monto <= 0) {
      return this._errorResponse(422, 'PRECONDITION_FAILED', 'sin_monto', { cobro_id });
    }
    // Idempotencia: un cobro solo se factura una vez.
    for (const f of this._facturas.values()) {
      if (f.cobro_id === cobro_id) {
        return { status: 200, data: f }; // ya existe → devuelve la misma
      }
    }
    const factura = this._nuevaFactura({
      cobro_id, presupuesto_id, pieza_id, cantidad, monto,
      cuenta_id: cuenta_id || null,
      correlation_id: input.correlation_id || null,
    });
    this._facturas.set(factura.factura_id, factura);
    if (factura.estado === 'emitida') {
      this.eventBus?.publish('edias.factura.emitida', factura);
    }
    this.metrics?.increment('edias-facturas.reflejo.served', { op: 'crear', estado: factura.estado });
    return { status: 200, data: factura };
  }

  // ── obtener una factura por id ──
  async _obtener(input) {
    const { factura_id } = input;
    if (!factura_id) return this._invalid('factura_id');
    const factura = this._facturas.get(factura_id);
    if (!factura) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'factura no encontrada', { factura_id });
    return { status: 200, data: factura };
  }

  // ── listar facturas (por cuenta o estado) ──
  async _listar(input) {
    const { cuenta_id, estado } = input;
    let lista = [...this._facturas.values()];
    if (cuenta_id) lista = lista.filter(f => f.cuenta_id === cuenta_id);
    if (estado) lista = lista.filter(f => f.estado === estado);
    lista.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return { status: 200, data: { facturas: lista, total: lista.length } };
  }

  // ── anular una factura (solo borrador/emitida, no pagada) ──
  async _anular(input) {
    const { factura_id, motivo } = input;
    if (!factura_id) return this._invalid('factura_id');
    const factura = this._facturas.get(factura_id);
    if (!factura) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'factura no encontrada', { factura_id });
    if (factura.estado === 'anulada') return { status: 200, data: factura }; // idempotente
    factura.estado = 'anulada';
    factura.motivo_anulacion = motivo || null;
    factura.anulada_ts = Date.now();
    this.eventBus?.publish('edias.factura.anulada', factura);
    this.metrics?.increment('edias-facturas.reflejo.served', { op: 'anular', estado: 'anulada' });
    return { status: 200, data: factura };
  }

  // ── helper: construir una factura nueva ──
  _nuevaFactura({ cobro_id, presupuesto_id, pieza_id, cantidad, monto, cuenta_id, correlation_id }) {
    // Sin datos fiscales del taller → borrador (no se emite sin NIF).
    const fiscal = this._configFiscal || null;
    const estado = fiscal ? 'emitida' : 'borrador';
    return {
      factura_id: this._id('fac'),
      numero: fiscal ? this._numero(fiscal.serie) : null,
      cobro_id,
      presupuesto_id: presupuesto_id || null,
      pieza_id: pieza_id || null,
      cantidad: cantidad || 1,
      monto,
      cuenta_id,
      correlation_id: correlation_id || null,
      estado, // borrador → emitida → anulada
      fiscal: fiscal ? { razon_social: fiscal.razon_social, nif: fiscal.nif, direccion: fiscal.direccion, serie: fiscal.serie } : null,
      motivo_anulacion: null,
      anulada_ts: null,
      ts: Date.now(),
    };
  }

  _numero(serie) {
    const n = (this._contador = (this._contador || 0) + 1);
    return `${serie || 'EDIAS'}-${String(n).padStart(6, '0')}`;
  }

  _id(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
}

module.exports = EdiasFacturasReflejo;
