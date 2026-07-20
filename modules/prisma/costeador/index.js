/**
 * prisma/costeador — REFLEJO JS: el MOTOR que cuesta un COMPUESTO.
 *
 * Recorre los componentes por ref (insumo o sub-compuesto, recursivo), suma
 * precio_referencia × cantidad → coste del compuesto, y EMITE compuesto.coste.calculado
 * (evento PRISMA, ya NO escandallo). Cuesta RECETA A RECETA — nunca en bloque.
 * Si falta un precio, NO inventa: lo lista en `faltantes` y avisa (compuesto.coste.incompleto).
 * Fase 1 = coste ESTIMADO (referencia). El real es fase 2 (post-venta).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const U = require('../../_shared/prisma-unidades');   // conversor PURO: unidad del componente → base del precio
const nowISO = () => new Date().toISOString();
const MAX_PROF = 8;   // tope de recursión de sub-compuestos (anti-ciclo)

class PrismaCosteadorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'costeador';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  onCostearRequest(e)      { return this._atender(e, 'costear', 'costeador.costear.response', d => this._costear(d)); }
  onCostearTodosRequest(e) { return this._atender(e, 'costear_todos', 'costeador.costear_todos.response', d => this._costearTodos(d)); }
  async onInsumoActualizado(e) { return this._cascada((e && e.data) || e || {}); }

  // ── EL LOOP: recorre la cola y cuesta UNA a UNA (nunca en bloque) ──
  async _costearTodos({ project_id } = {}) {
    if (!project_id) return this._invalid('project_id');
    const l = await this._rpc('compuestos.pendientes.request', { project_id });
    const ids = (l && l.status === 200 && Array.isArray(l.data?.pendientes)) ? l.data.pendientes : [];
    let calculados = 0, incompletos = 0;
    for (const cid of ids) {                                    // await por compuesto → de a una, por salud
      const r = await this._costear({ project_id, compuesto_id: cid });
      if (r && r.status === 200) (r.data.faltantes.length ? incompletos++ : calculados++);
    }
    return { status: 200, data: { total: ids.length, calculados, incompletos } };
  }

  // ── PURO: Σ (precio_por_base × cantidad_EN_BASE) sobre componentes ya resueltos.
  //    resolver: (ref) → { coste_por_base, unidad_base, densidad_g_ml } | null.
  //    Convierte la cantidad del componente a la base del precio ANTES de multiplicar (g·kg, u·g, líquido·peso).
  //    Unidades irreconciliables (sin densidad para cruzar, unidad desconocida) → faltante, NO inventa.
  //    Devuelve { coste_centimos, faltantes[] }. ──
  _sumar(componentes, resolver) {
    let coste = 0; const faltantes = [];
    for (const c of (componentes || [])) {
      const r = resolver(c.ref);
      if (!r || r.coste_por_base == null || !(r.coste_por_base >= 0)) { faltantes.push(c.ref); continue; }  // sin precio → NO inventa
      let cantidad = c.cantidad;
      if (c.unidad && r.unidad_base) {                          // ambos declaran base → reconcilia unidades
        const conv = U.convertir(c.cantidad, c.unidad, r.unidad_base, r.densidad_g_ml);
        if (conv == null) { faltantes.push(c.ref); continue; }  // no reconcilia (falta densidad / unidad rara) → avisa
        cantidad = conv;
      }
      coste += Math.round(r.coste_por_base * cantidad);
    }
    return { coste_centimos: coste, faltantes };
  }

  // ── resuelve un componente a { coste_por_base, unidad_base, densidad_g_ml }:
  //    insumo (precio de referencia por unidad base) o sub-compuesto (recursión + rendimiento) ──
  async _resolverRef(project_id, ref, prof, cid) {
    if (prof > MAX_PROF) return null;
    const ins = await this._rpc('insumos.get.request', { project_id, insumo_id: ref });
    if (ins && ins.status === 200 && ins.data?.insumo) {
      const nat = ins.data.insumo.naturalezas || {};
      const p = nat.coste_centimos_por_unidad;
      if (typeof p !== 'number' || !(p >= 0)) return null;      // precio de REFERENCIA por unidad base
      return { coste_por_base: p, unidad_base: nat.unidad_base || null, densidad_g_ml: nat.densidad_g_ml || null };
    }
    // no es insumo → ¿sub-compuesto? cuéstalo (recursivo). Con rendimiento → coste POR UNIDAD BASE.
    const g = await this._rpc('compuestos.get.request', { project_id, compuesto_id: ref });
    const sub = await this._costear({ project_id, compuesto_id: ref, _prof: prof + 1, _silencioso: true });
    if (sub && sub.status === 200 && typeof sub.data?.coste_centimos === 'number' && sub.data.faltantes.length === 0) {
      const compuesto = g?.data?.compuesto || {};
      const rend = compuesto.rendimiento;                       // { cantidad, unidad } — cuánto PRODUCE el lote
      if (rend && U.dimensionDe(rend.unidad) && Number(rend.cantidad) > 0) {
        const base = U.aBase(rend.cantidad, rend.unidad);       // coste del lote / lo que rinde → coste por unidad base
        return { coste_por_base: sub.data.coste_centimos / base.cantidad, unidad_base: base.base, densidad_g_ml: compuesto.naturalezas?.densidad_g_ml || null };
      }
      return { coste_por_base: sub.data.coste_centimos, unidad_base: null, densidad_g_ml: null };   // sin rendimiento → coste POR LOTE (cantidad = nº de lotes)
    }
    return null;   // ni insumo con precio ni sub-compuesto completo → falta
  }

  // ── el motor: una receta, un cálculo, un evento ──
  async _costear({ project_id, compuesto_id, _prof = 0, _silencioso = false } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!compuesto_id) return this._invalid('compuesto_id');
    const g = await this._rpc('compuestos.get.request', { project_id, compuesto_id });
    if (!g || g.status !== 200 || !g.data?.compuesto) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'compuesto no existe', { entity_type: 'compuesto', id: compuesto_id });
    }
    const comp = g.data.compuesto.componentes || [];
    // resuelve precios (uno a uno, respeta recursión). Cada ref → { coste_por_base, unidad_base, densidad }
    const resueltos = new Map();
    for (const c of comp) if (!resueltos.has(c.ref)) resueltos.set(c.ref, await this._resolverRef(project_id, c.ref, _prof, compuesto_id));
    const { coste_centimos, faltantes } = this._sumar(comp, (ref) => resueltos.get(ref));

    if (!_silencioso) {
      if (faltantes.length) {
        this.eventBus?.publish?.('compuesto.coste.incompleto', { project_id, compuesto_id, coste_parcial_centimos: coste_centimos, faltantes, timestamp: nowISO() });
        this.metrics?.increment?.('costeador.incompletos.total', {});
      } else {
        this.eventBus?.publish?.('compuesto.coste.calculado', { project_id, compuesto_id, coste_unidad: coste_centimos / 100, coste_centimos, timestamp: nowISO() });
        this.metrics?.increment?.('costeador.calculados.total', {});
      }
    }
    return { status: 200, data: { compuesto_id, coste_centimos, faltantes } };
  }

  // ── cascada: un insumo cambió de precio → re-cuesta de A UNA los compuestos que lo usan ──
  async _cascada({ project_id, insumo_id }) {
    if (!project_id || !insumo_id) return;
    const l = await this._rpc('compuestos.list.request', { project_id });
    const ids = (l && l.status === 200 && Array.isArray(l.data?.compuestos)) ? l.data.compuestos.map(c => c.id) : [];
    for (const cid of ids) {                                    // UNA a UNA, nunca en bloque
      const g = await this._rpc('compuestos.get.request', { project_id, compuesto_id: cid });
      const usa = g?.data?.compuesto?.componentes?.some(c => c.ref === insumo_id);
      if (usa) await this._costear({ project_id, compuesto_id: cid });
    }
  }
}

module.exports = PrismaCosteadorReflejo;
