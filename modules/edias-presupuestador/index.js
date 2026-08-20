'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * edias-presupuestador — REFLEJO JS (mitad determinista del módulo híbrido).
 * El NÚCLEO de la venta: escucha edias.presupuestar.request, CONDUCE el costeo
 * determinista (edias.costeo.costear.request) para el coste base POR PIEZA,
 * aplica la política del admin (margen + descuento por volumen en dos modos:
 * escalones manuales o fórmula automática) y emite un presupuesto en firme con
 * desglose visible — completo o incompleto.
 *
 * El presupuestador NUNCA inventa precios: si el costeo devuelve faltante
 * (sin_tarifa / sin_gramos), emite edias.presupuesto.incompleto con la lista de
 * faltantes (que el orquestador resolucion-faltantes consume). Espejo del freno
 * anti-invento de escandallo pizzepos.
 */

class EdiasPresupuestadorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'edias-presupuestador';
    this.version = '0.1.0';
    this._presupuestos = new Map(); // correlation_id -> presupuesto (idempotencia)
  }

  // ── handlers RPC (una línea) ──
  onPresupuestarRequest(e) { return this._atender(e, 'presupuestar', 'edias.presupuesto.generado', d => this._presupuestar(d)); }
  onObtenerRequest(e)      { return this._atender(e, 'obtener',     'edias.presupuesto.obtener.response', d => this._obtener(d)); }

  // ── NÚCLEO: costear (conducido) → política admin → presupuesto ──
  async _presupuestar(input) {
    const { correlation_id, pieza_id, material_id, cantidad, origen, politica } = input;
    if (!pieza_id) return this._invalid('pieza_id');
    const qty = (typeof cantidad === 'number' && cantidad >= 1 && cantidad <= 1000) ? cantidad : 1;

    // Idempotencia por correlation_id: nunca dos presupuestos para el mismo pedido.
    if (correlation_id && this._presupuestos.has(correlation_id)) {
      return { status: 200, data: this._presupuestos.get(correlation_id) };
    }

    // 1) CONDUCE el costeo determinista — el presupuestador no calcula el coste a ojo.
    const coste = await this._rpc('edias.costeo.costear.request', {
      pieza_id, material_id,
      gramos: input.gramos, tiempo_maquina: input.tiempo_maquina,
      tarifa_por_gramo: input.tarifa_por_gramo, cantidad: qty,
    });

    // 2) Si el costeo declara faltante → presupuesto INCOMPLETO (no inventa precio).
    if (!coste || coste.status !== 200) {
      const faltantes = this._faltantesDe(coste, input);
      const incompleto = {
        correlation_id, presupuesto_id: this._id('pre'), pieza_id, cantidad: qty,
        faltantes, estado: 'incompleto',
      };
      if (correlation_id) this._presupuestos.set(correlation_id, incompleto);
      this.eventBus?.publish('edias.presupuesto.incompleto', incompleto);
      return { status: 200, data: incompleto };
    }

    // 3) Coste base POR PIEZA (precisión 6 decimales intermedia, sin redondeo).
    const base_unitario = coste.data.coste_unitario;

    // 4) Política del admin: margen + descuento por volumen sobre el escandallo.
    const pol = this._politica(politica, qty);
    const precio_unitario = this._round(base_unitario * (1 + pol.margen) * (1 - pol.descuento_pct / 100), 6);
    const desglose = this._desglose(base_unitario, precio_unitario, pol, qty);
    const total = this._round(precio_unitario * qty, 2);

    const presupuesto = {
      correlation_id, presupuesto_id: this._id('pre'), pieza_id, cantidad: qty,
      origen: origen || 'catalogo', desglose, total, estado: 'completo',
      politica: pol.modo,
    };
    if (correlation_id) this._presupuestos.set(correlation_id, presupuesto);
    this.eventBus?.publish('edias.presupuesto.generado', presupuesto); // entrada a pedido/cobro
    this.metrics?.increment('edias-presupuestador.reflejo.served', { op: 'presupuestar', estado: 'completo' });
    return { status: 200, data: presupuesto };
  }

  // ── obtener un presupuesto por id ──
  async _obtener(input) {
    const { presupuesto_id } = input;
    if (!presupuesto_id) return this._invalid('presupuesto_id');
    for (const p of this._presupuestos.values()) {
      if (p.presupuesto_id === presupuesto_id) return { status: 200, data: p };
    }
    return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'presupuesto no encontrado', { presupuesto_id });
  }

  // ── Política del admin (margen + descuento por volumen) ──
  // Dos modos: 'escalones' (manual) o 'formula' (automática). Si no viene config,
  // usa margen=0 y sin descuento (verdadero coste a secas) y lo DECLARA (politica:'default').
  _politica(politica, cantidad) {
    const p = politica || {};
    const margen = (typeof p.margen === 'number' && p.margen >= 0) ? p.margen : 0;
    if (!p.modo) return { modo: 'default', margen, descuento_pct: 0 };
    if (p.modo === 'escalones' && Array.isArray(p.escalones)) {
      const aplicable = p.escalones
        .filter(e => cantidad >= (e.desde ?? 0) && (e.hasta == null || cantidad <= e.hasta))
        .sort((a, b) => (b.desde ?? 0) - (a.desde ?? 0))[0];
      return { modo: 'escalones', margen, descuento_pct: aplicable ? (aplicable.descuento_pct || 0) : 0 };
    }
    if (p.modo === 'formula' && typeof p.factor === 'number') {
      const tope = (typeof p.tope === 'number') ? p.tope : 50;
      const descuento_pct = Math.min(cantidad * p.factor, tope);
      return { modo: 'formula', margen, descuento_pct };
    }
    return { modo: 'default', margen, descuento_pct: 0 };
  }

  // ── desglose visible: material + maquina + margen ──
  _desglose(base_unitario, precio_unitario, pol, cantidad) {
    const material = this._round(base_unitario, 6);
    const margen = this._round(precio_unitario - base_unitario, 6);
    const descuento = this._round(base_unitario * (pol.descuento_pct / 100), 6);
    const lineas = [
      { concepto: 'material', base: material, total: this._round(material * cantidad, 2), fuente: 'escandallo' },
    ];
    if (descuento > 0) {
      lineas.push({ concepto: 'descuento_volumen', base: -descuento, total: this._round(-descuento * cantidad, 2), fuente: 'politica_admin' });
    }
    if (margen > 0) {
      lineas.push({ concepto: 'margen', base: margen, total: this._round(margen * cantidad, 2), fuente: 'politica_admin' });
    }
    return lineas;
  }

  // ── faltantes declarados por el costeo (nunca inventados) ──
  _faltantesDe(coste, input) {
    const code = coste?.data?.code || coste?.data?.error?.code;
    const faltantes = [];
    if (code === 'sin_tarifa' || !coste) {
      faltantes.push({ tipo: 'precio_material', material_id: input.material_id, para: 'costeo' });
    }
    if (code === 'sin_gramos') {
      faltantes.push({ tipo: 'gramos_pieza', pieza_id: input.pieza_id, para: 'costeo' });
    }
    if (faltantes.length === 0) {
      faltantes.push({ tipo: 'costeo_no_disponible', pieza_id: input.pieza_id, para: 'costeo' });
    }
    return faltantes;
  }

  _id(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
}

module.exports = EdiasPresupuestadorReflejo;
