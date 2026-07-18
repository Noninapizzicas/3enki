/**
 * prisma/boss — REFLEJO JS: el ORQUESTADOR de Prisma.
 *
 * Un comercio NO se declara "pizzería" ni "peluquería": su identidad EMERGE de sus
 * productos. BOSS calcula el PLAN del comercio:
 *   comercio → arquetipos de sus productos (del catálogo) → unión de ÓRGANOS que
 *   esos arquetipos encienden (cada arquetipo declara organos[] en prisma/arquetipos).
 *
 * BOSS es el CEREBRO: calcula qué necesita el comercio y lo señala (boss.plan.actualizado).
 * La APLICACIÓN real (cargar páginas/packs/blueprints, gatear interruptores) la hace quien
 * escuche el plan — separado, como manda el reparto reflejo/enforcement. Ver prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { SEMILLA } = require('../../_shared/arquetipos-semilla');

class PrismaBossReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'boss';
    this.version = 'reflejo-0.1.0';
  }

  onPlanRequest(e)   { return this._atender(e, 'plan', 'boss.plan.response', d => this._planOp(d)); }
  onEstadoRequest(e) { return this._atender(e, 'estado', 'boss.estado.response', d => this._planOp(d)); }

  // ── núcleo PURO ──
  _arquetiposDelCatalogo(catalogo) {
    const prods = Array.isArray(catalogo && catalogo.productos) ? catalogo.productos : [];
    const ids = new Set();
    for (const p of prods) if (p && p.arquetipo) ids.add(p.arquetipo);
    return [...ids];
  }

  // unión de los órganos que encienden esos arquetipos (según sus defs).
  _organosDe(arqIds, defs) {
    const byId = new Map((Array.isArray(defs) ? defs : []).map(d => [d.id, d]));
    const organos = new Set();
    for (const id of arqIds) {
      const d = byId.get(id);
      if (d) for (const o of (d.organos || [])) organos.add(o);
    }
    return [...organos].sort();
  }

  _plan(catalogo, defs) {
    const arquetipos = this._arquetiposDelCatalogo(catalogo);
    const organos = this._organosDe(arquetipos, defs);
    const prods = Array.isArray(catalogo && catalogo.productos) ? catalogo.productos : [];
    // recetario NO cuelga de un arquetipo — cuelga del ORIGEN: cualquier producto ELABORADO
    // (lo creas o lo modificas) lo enciende; nada de_reventa lo toca. Universal, no idiosincrático.
    const hayElaborado = prods.some(p => p && p.naturalezas && p.naturalezas.origen === 'elaborado');
    if (hayElaborado && !organos.includes('recetario')) { organos.push('recetario'); organos.sort(); }
    const productos_por_arquetipo = {};
    for (const p of prods) {
      const a = (p && p.arquetipo) || 'sin_arquetipo';
      productos_por_arquetipo[a] = (productos_por_arquetipo[a] || 0) + 1;
    }
    return { arquetipos, organos, productos_por_arquetipo, total_productos: prods.length };
  }

  // ── resolución del catálogo activo (via producto-manager) ──
  async _catalogoActivo(project_id) {
    const l = await this._rpc('catalogo.list.request', { project_id });
    if (!l || l.status !== 200 || !Array.isArray(l.data) || l.data.length === 0) return null;
    const enServicio = l.data.find(c => c.estado === 'en_servicio');
    const cid = enServicio ? enServicio.id : (l.data.find(c => c.estado !== 'archivado') || l.data[0]).id;
    const g = await this._rpc('catalogo.get.request', { project_id, carta_id: cid, catalogo_id: cid });
    return (g && g.status === 200 && g.data) ? g.data : null;
  }

  // defs = semilla + custom aprobados (los organos de los custom cuentan una vez aprobados).
  async _defs(project_id) {
    const r = await this._rpc('arquetipos.listar.request', { project_id });
    const custom = (r && r.status === 200 && r.data && Array.isArray(r.data.custom)) ? r.data.custom.filter(a => a.estado === 'aprobado') : [];
    return SEMILLA.concat(custom);
  }

  async _planOp(input) {
    if (!input.project_id) return this._invalid('project_id');
    const catalogo = await this._catalogoActivo(input.project_id);
    if (!catalogo) return { status: 200, data: { arquetipos: [], organos: [], productos_por_arquetipo: {}, total_productos: 0, vacio: true } };
    const defs = await this._defs(input.project_id);
    return { status: 200, data: this._plan(catalogo, defs) };
  }

  // ── señal: el plan cambia cuando cambian los productos del comercio ──
  async onCatalogoCambiado(event) {
    const d = event && (event.data || event.payload || event) || {};
    const project_id = d.project_id || (d.catalogo && d.catalogo.project_id);
    if (!project_id) return;
    return this._emitPlan(project_id);
  }

  async onProjectActivated(event) {
    const d = event && (event.data || event) || {};
    if (!d.project_id) return;
    return this._emitPlan(d.project_id);
  }

  async _emitPlan(project_id) {
    try {
      const r = await this._planOp({ project_id });
      if (r && r.status === 200) {
        this.eventBus.publish('boss.plan.actualizado', { project_id, ...r.data, timestamp: new Date().toISOString() });
        this.metrics?.increment?.('boss.plan.actualizado.total');
      }
    } catch (_) { /* best-effort */ }
  }
}

module.exports = PrismaBossReflejo;
