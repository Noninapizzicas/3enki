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
const nowISO = () => new Date().toISOString();
const MAX_PROF = 8;   // tope de recursión de sub-compuestos (anti-ciclo)

class PrismaCosteadorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'costeador';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  onCostearRequest(e)    { return this._atender(e, 'costear', 'costeador.costear.response', d => this._costear(d)); }
  async onInsumoActualizado(e) { return this._cascada((e && e.data) || e || {}); }

  // ── PURO: Σ (precio × cantidad) sobre componentes ya resueltos a precio.
  //    precioDe: (ref) → centimos|null. Devuelve { coste_centimos, faltantes[] }. ──
  _sumar(componentes, precioDe) {
    let coste = 0; const faltantes = [];
    for (const c of (componentes || [])) {
      const p = precioDe(c.ref);
      if (p == null || !(p >= 0)) { faltantes.push(c.ref); continue; }  // sin precio → NO inventa
      coste += Math.round(p * c.cantidad);
    }
    return { coste_centimos: coste, faltantes };
  }

  // ── resuelve el precio de un componente: insumo (referencia) o sub-compuesto (recursión) ──
  async _precioDeRef(project_id, ref, prof, cid) {
    if (prof > MAX_PROF) return null;
    const ins = await this._rpc('insumos.get.request', { project_id, insumo_id: ref });
    if (ins && ins.status === 200 && ins.data?.insumo) {
      const p = ins.data.insumo.naturalezas?.coste_centimos_por_unidad;
      return (typeof p === 'number' && p >= 0) ? p : null;      // precio de REFERENCIA por unidad
    }
    // no es insumo → ¿sub-compuesto? cuéstalo (recursivo) y usa su coste por unidad
    const sub = await this._costear({ project_id, compuesto_id: ref, _prof: prof + 1, _silencioso: true });
    if (sub && sub.status === 200 && typeof sub.data?.coste_centimos === 'number' && sub.data.faltantes.length === 0) {
      return sub.data.coste_centimos;
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
    // resuelve precios (uno a uno, respeta recursión)
    const precios = new Map();
    for (const c of comp) if (!precios.has(c.ref)) precios.set(c.ref, await this._precioDeRef(project_id, c.ref, _prof, compuesto_id));
    const { coste_centimos, faltantes } = this._sumar(comp, (ref) => precios.get(ref));

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
