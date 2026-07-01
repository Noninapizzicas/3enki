/**
 * prisma/ticket — REFLEJO JS: el RECIBO (generalizado de pizzepos/impresion).
 *
 * Formatea un ticket de venta en texto (ancho 32/58mm por defecto) desde los ítems
 * del carrito + el total, en céntimos → €. Sin la 'comanda' de cocina (eso es
 * hostelería). Emite ticket.generado; el envío a impresora física es follow-up.
 * La función de formateo es PURA. Ver prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class PrismaTicketReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ticket';
    this.version = 'reflejo-0.1.0';
  }

  onFormatearRequest(e) { return this._atender(e, 'formatear', 'ticket.formatear.response', d => this._formatear(d)); }

  _eur(c) { return ((c || 0) / 100).toFixed(2); }

  _center(s, ancho) {
    s = String(s);
    if (s.length >= ancho) return s.slice(0, ancho);
    const pad = Math.floor((ancho - s.length) / 2);
    return ' '.repeat(pad) + s;
  }

  _linea(izq, der, ancho) {
    der = String(der);
    const espacio = ancho - der.length;
    let l = String(izq);
    if (l.length > espacio - 1) l = l.slice(0, Math.max(0, espacio - 1));
    return l.padEnd(espacio, ' ') + der;
  }

  // función PURA: ítems + total → texto del recibo.
  _formatearTicket(items, total_centimos, meta = {}) {
    const ancho = Number.isInteger(meta.ancho) && meta.ancho > 10 ? meta.ancho : 32;
    const L = [];
    if (meta.comercio) L.push(this._center(meta.comercio, ancho));
    if (meta.ref_display) L.push('Ticket: ' + meta.ref_display);
    L.push('-'.repeat(ancho));
    for (const it of items) {
      const cant = it.cantidad || 1;
      const nom = it.nombre || 'ítem';
      const sub = (typeof it.subtotal_centimos === 'number') ? it.subtotal_centimos : (it.precio_unitario_centimos || 0) * cant;
      L.push(this._linea(`${cant}x ${nom}`, this._eur(sub) + ' €', ancho));
      if (it.notas) L.push('  ' + it.notas);
    }
    L.push('-'.repeat(ancho));
    L.push(this._linea('TOTAL', this._eur(total_centimos) + ' €', ancho));
    return L.join('\n');
  }

  _formatear(input) {
    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length === 0) return this._invalid('items');
    const total = (typeof input.total_centimos === 'number')
      ? input.total_centimos
      : items.reduce((s, i) => s + (i.subtotal_centimos || 0), 0);
    const ancho = Number.isInteger(input.ancho) && input.ancho > 10 ? input.ancho : 32;
    const texto = this._formatearTicket(items, total, { comercio: input.comercio, ref_display: input.ref_display, ancho });
    this.eventBus?.publish('ticket.generado', { cuenta_id: input.cuenta_id, total_centimos: total, project_id: input.project_id, timestamp: nowISO() });
    return { status: 200, data: { texto, total_centimos: total, ancho } };
  }
}

module.exports = PrismaTicketReflejo;
