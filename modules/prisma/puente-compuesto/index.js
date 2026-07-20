/**
 * prisma/puente-compuesto — REFLEJO JS: el PUENTE prisma-puro compuesto↔producto↔precio.
 *
 * EL puente prisma del arco coste→precio (el módulo prisma/recetario se retiró 2026-07-20; prisma
 * no usa escandallo/pizzepos — pizzepos/recetas ya persiste su propio coste). Escucha
 * compuesto.coste.calculado (evento PRISMA del costeador), resuelve QUÉ producto referencia el
 * compuesto (por compuesto_ref) y
 * entrega el coste a prisma/coste (coste.aplicar), que escribe el pvp. NO PISA el precio manual:
 * si ya hay pvp y la pregunta de coste está cerrada, canta la deriva (puente.coste_actualizado).
 * ATAR: producto elaborado sin compuesto_ref → busca el compuesto homónimo y fija el arco.
 * Sin store: conecta, no guarda.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const nowISO = () => new Date().toISOString();
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

class PrismaPuenteCompuestoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puente-compuesto';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  onCosteCalculado(e)   { return this._puente((e && e.data) || e || {}); }
  onCatalogoCambiado(e) { return this._atar((e && e.data) || e || {}); }

  // ── PURO: aplicar vs testigo (no pisar el precio manual del comerciante) ──
  _decidir(prod, coste_centimos, food_cost) {
    const pvp_sugerido = (food_cost > 0 && coste_centimos > 0) ? Math.round(coste_centimos / food_cost) : 0;
    const preciado = typeof prod.precio_base_centimos === 'number' && prod.precio_base_centimos > 0;
    const costeAbierto = (Array.isArray(prod.preguntas_abiertas) ? prod.preguntas_abiertas : [])
      .some(q => q && q.campo === 'coste' && !q.respondida);
    return { accion: (preciado && !costeAbierto) ? 'testigo' : 'aplicar', pvp_sugerido };
  }

  // ── PURO: ¿este producto es elaborado y le falta el arco? ──
  _pendienteDeAtar(prod) {
    return !!(prod && prod.naturalezas && prod.naturalezas.origen === 'elaborado'
      && !prod.compuesto_ref && String(prod.nombre || '').trim());
  }

  // ── el puente: coste PRISMA → precio del producto que lo referencia ──
  async _puente({ project_id, compuesto_id, coste_unidad, coste_centimos, food_cost_objetivo, correlation_id }) {
    if (!project_id || !compuesto_id) return;
    const cc = (typeof coste_centimos === 'number' && coste_centimos > 0) ? coste_centimos
      : (typeof coste_unidad === 'number' && coste_unidad > 0 ? Math.round(coste_unidad * 100) : null);
    if (cc == null) return;
    const hit = await this._resolverProducto(project_id, compuesto_id, correlation_id);
    if (!hit) return;                                          // GATE: nadie referencia el compuesto
    const food = (typeof food_cost_objetivo === 'number' && food_cost_objetivo > 0 && food_cost_objetivo <= 1) ? food_cost_objetivo : 0.30;
    const { accion, pvp_sugerido } = this._decidir(hit.prod, cc, food);
    if (accion === 'testigo') {
      this.eventBus?.publish?.('puente.coste_actualizado', { project_id, catalogo_id: hit.catalogo_id, producto_id: hit.producto_id,
        compuesto_id, coste_centimos: cc, pvp_sugerido, precio_actual_centimos: hit.prod.precio_base_centimos, correlation_id: correlation_id || null, timestamp: nowISO() });
      this.metrics?.increment?.('puente.servido', { accion: 'testigo' });
      return;
    }
    const r = await this._rpc('coste.aplicar.request', { project_id, catalogo_id: hit.catalogo_id, producto_id: hit.producto_id,
      componentes: [{ coste_centimos: cc }], food_cost_objetivo: food, correlation_id });
    this.metrics?.increment?.('puente.servido', { accion: 'aplicar', ok: (r && r.status < 400) ? 'si' : 'no' });
  }

  async _resolverProducto(project_id, compuesto_id, correlation_id) {
    const l = await this._rpc('catalogo.list.request', { project_id, correlation_id });
    const metas = (l && l.status === 200 && Array.isArray(l.data)) ? l.data.slice() : [];
    metas.sort((a, b) => ((b?.estado === 'en_servicio') ? 1 : 0) - ((a?.estado === 'en_servicio') ? 1 : 0));
    for (const m of metas) {
      if (!m?.id) continue;
      const g = await this._rpc('catalogo.get.request', { project_id, catalogo_id: m.id, correlation_id });
      if (!g || g.status !== 200 || !g.data) continue;
      const prod = (Array.isArray(g.data.productos) ? g.data.productos : []).find(p => p && p.compuesto_ref === compuesto_id);
      if (prod) return { catalogo_id: m.id, producto_id: prod.id, prod };
    }
    return null;
  }

  // ── ATAR: producto elaborado sin compuesto_ref → compuesto homónimo ──
  async _atar({ project_id, catalogo, correlation_id }) {
    if (!project_id || !catalogo?.meta?.id) return;
    const pend = (Array.isArray(catalogo.productos) ? catalogo.productos : []).filter(p => this._pendienteDeAtar(p));
    if (!pend.length) return;
    const l = await this._rpc('compuestos.list.request', { project_id });
    const comps = (l && l.status === 200 && Array.isArray(l.data?.compuestos)) ? l.data.compuestos : [];
    for (const prod of pend) {
      const hit = comps.find(c => norm(c.nombre) === norm(prod.nombre));   // homónimo por nombre
      if (!hit) continue;                                                   // no inventa el arco
      await this._rpc('catalogo.update_product.request', { project_id, catalogo_id: catalogo.meta.id, producto_id: prod.id, campos: { compuesto_ref: hit.id }, correlation_id });
      this.metrics?.increment?.('puente.servido', { accion: 'atar' });
    }
  }
}

module.exports = PrismaPuenteCompuestoReflejo;
