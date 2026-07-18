/**
 * prisma/recetario — REFLEJO JS: el DUEÑO del órgano `recetario` (productos ELABORADOS —
 * los que creas o modificas; se enciende por naturalezas.origen === 'elaborado', no por arquetipo).
 *
 * El puente que RECORRE el arco de identidad producto↔receta. escandallo cuesta la
 * ficha técnica y emite `escandallo.coste.calculado`; este órgano resuelve QUÉ producto
 * la referencia (por `receta_ref`) y entrega ese coste a `prisma/coste` (coste.aplicar),
 * que escribe el pvp. Cierra el lazo coste→precio para comestible, automático.
 *
 * NO reescribe recetas/escandallo (siguen con sus contratos vivos) ni coste (genérico).
 * Es la glue idiosincrática: la única pieza que conoce a la vez la receta y el producto.
 *
 * GATE implícito: si ningún producto referencia la receta (receta_ref), no hace nada —
 * las sub-recetas (masa/salsa) no son productos, así que solo se precian los productos reales.
 * NO PISA el precio manual: si el comerciante ya fijó pvp y la pregunta de coste está
 * cerrada, canta la deriva (recetario.coste_actualizado) en vez de sobrescribir.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();
// food-cost objetivo por defecto del órgano (30% — típico en hostelería). El evento puede
// traer el suyo; es POLÍTICA del comercio, no una ley — de ahí que sea overridable.
const FOOD_COST_OBJETIVO = 0.30;

class PrismaRecetarioReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'recetario';
    this.version = 'reflejo-0.1.0';
  }

  // Sin estado propio (puro puente); el loader exige onUnload para el shutdown limpio.
  async onUnload() { return super.onUnload(); }

  // ── ATAR la identidad: productos ELABORADOS SIN receta_ref, listos para atar.
  //    Puro: nombra a quién le falta el arco; el IO lo resuelve por nombre después.
  //    Solo ELABORADO — origen == 'elaborado' (lo creas o lo modificas); nunca pisa un ref ya
  //    puesto. La ficha técnica es de todo lo que lleva TU TRABAJO, no de un arquetipo. ──
  _pendientesDeAtar(catalogo) {
    const prods = (catalogo && Array.isArray(catalogo.productos)) ? catalogo.productos : [];
    return prods
      .filter(p => p && p.naturalezas && p.naturalezas.origen === 'elaborado' && !p.receta_ref && String(p.nombre || '').trim())
      .map(p => ({ producto_id: p.id, nombre: p.nombre }));
  }

  // Un catálogo cambió: ata por NOMBRE cada comestible sin ficha a la receta homónima
  // (recetas.obtener acepta nombre). Idempotente: en cuanto queda el receta_ref, el
  // siguiente ciclo lo salta. Si no hay receta homónima, no inventa el arco (queda suelto,
  // atable a mano). Reusa contratos vivos — no toca recetas ni carta.
  async onCatalogoCambiado(e) {
    const d = (e && e.data) || e || {};
    const catalogo = d.catalogo;
    if (!d.project_id || !catalogo || !catalogo.meta || !catalogo.meta.id) return;
    const pendientes = this._pendientesDeAtar(catalogo);
    if (pendientes.length === 0) return;
    for (const { producto_id, nombre } of pendientes) {
      try {
        const r = await this._rpc('recetas.obtener.request', { project_id: d.project_id, nombre, correlation_id: d.correlation_id });
        const receta_id = (r && r.status === 200 && r.data) ? (r.data.id || (r.data.receta && r.data.receta.id)) : null;
        if (!receta_id) continue;                          // sin receta homónima → no inventa el arco
        await this._rpc('catalogo.update_product.request', {
          project_id: d.project_id, catalogo_id: catalogo.meta.id, producto_id,
          campos: { receta_ref: receta_id }, correlation_id: d.correlation_id
        });
        this.metrics?.increment('recetario.served', { accion: 'atar' });
      } catch (err) {
        this.logger?.error('recetario.atar.failed', { producto_id, error: err.message });
        this.metrics?.increment('recetario.errors', {});
      }
    }
  }

  // ── núcleo PURO: dado el producto, el coste y el food-cost → qué hacer + pvp sugerido.
  //    'aplicar' cuando el producto no tiene precio manual firme; 'testigo' cuando el
  //    comerciante ya lo precio (no se pisa su decisión — se canta la deriva). ──
  _decidir(prod, coste_centimos, food_cost) {
    const pvp_sugerido = (food_cost > 0 && coste_centimos > 0) ? Math.round(coste_centimos / food_cost) : 0;
    const preciado = typeof prod.precio_base_centimos === 'number' && prod.precio_base_centimos > 0;
    const costeAbierto = (Array.isArray(prod.preguntas_abiertas) ? prod.preguntas_abiertas : [])
      .some(q => q && q.campo === 'coste' && !q.respondida);
    const accion = (preciado && !costeAbierto) ? 'testigo' : 'aplicar';
    return { accion, pvp_sugerido };
  }

  // Resuelve el producto que referencia una receta (por receta_ref), barriendo los
  // catálogos del proyecto (en_servicio primero). null si ninguno la referencia.
  async _resolverProducto(project_id, receta_id, correlation_id) {
    const l = await this._rpc('catalogo.list.request', { project_id, correlation_id });
    const metas = (l && l.status === 200 && Array.isArray(l.data)) ? l.data.slice() : [];
    metas.sort((a, b) => ((b && b.estado === 'en_servicio') ? 1 : 0) - ((a && a.estado === 'en_servicio') ? 1 : 0));
    for (const m of metas) {
      if (!m || !m.id) continue;
      const g = await this._rpc('catalogo.get.request', { project_id, catalogo_id: m.id, correlation_id });
      if (!g || g.status !== 200 || !g.data) continue;
      const prod = (Array.isArray(g.data.productos) ? g.data.productos : []).find(p => p && p.receta_ref === receta_id);
      if (prod) return { catalogo_id: m.id, producto_id: prod.id, prod };
    }
    return null;
  }

  // ── el puente: escandallo.coste.calculado → (resuelve producto) → coste.aplicar ──
  async onCosteCalculado(e) {
    const d = (e && e.data) || e || {};
    if (!d.project_id || !d.receta_id) return;
    // coste por UNIDAD (una unidad vendible = un producto); cae a coste_total si no viene.
    const costeEur = (typeof d.coste_unidad === 'number' && d.coste_unidad > 0) ? d.coste_unidad
      : (typeof d.coste_total === 'number' && d.coste_total > 0 ? d.coste_total : null);
    if (costeEur == null) return;                          // sin coste real → nada que aplicar
    const coste_centimos = Math.round(costeEur * 100);
    if (!(coste_centimos > 0)) return;

    try {
      const hit = await this._resolverProducto(d.project_id, d.receta_id, d.correlation_id);
      if (!hit) return;                                     // GATE: ningún producto referencia esta receta
      const food_cost = (typeof d.food_cost_objetivo === 'number' && d.food_cost_objetivo > 0 && d.food_cost_objetivo <= 1)
        ? d.food_cost_objetivo : FOOD_COST_OBJETIVO;
      const { accion, pvp_sugerido } = this._decidir(hit.prod, coste_centimos, food_cost);

      if (accion === 'testigo') {
        this.eventBus.publish('recetario.coste_actualizado', {
          project_id: d.project_id, catalogo_id: hit.catalogo_id, producto_id: hit.producto_id,
          receta_id: d.receta_id, coste_centimos, pvp_sugerido,
          precio_actual_centimos: hit.prod.precio_base_centimos,
          correlation_id: d.correlation_id || null, timestamp: nowISO()
        });
        this.metrics?.increment('recetario.served', { accion: 'testigo' });
        return;
      }

      const r = await this._rpc('coste.aplicar.request', {
        project_id: d.project_id, catalogo_id: hit.catalogo_id, producto_id: hit.producto_id,
        componentes: [{ coste_centimos }], food_cost_objetivo: food_cost,
        correlation_id: d.correlation_id
      });
      this.metrics?.increment('recetario.served', { accion: 'aplicar', ok: (r && r.status < 400) ? 'si' : 'no' });
    } catch (err) {
      this.logger?.error('recetario.coste_calculado.failed', { receta_id: d.receta_id, error: err.message });
      this.metrics?.increment('recetario.errors', {});
    }
  }
}

module.exports = PrismaRecetarioReflejo;
