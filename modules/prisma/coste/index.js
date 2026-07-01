/**
 * prisma/coste — REFLEJO JS: la cara COMERCIANTE de Prisma.
 *
 * Calculadora determinista coste → margen → pvp, en CÉNTIMOS (coherente con
 * opciones/tasador). Los componentes de coste los aporta el COMERCIANTE — son la
 * respuesta a las preguntas_abiertas de coste del ProductoUniversal. coste NO
 * inventa precios: solo calcula. Generaliza la aritmética de escandallo (Σ coste)
 * + viabilidad (food cost objetivo → pvp; pvp → margen/food cost real) en genérico,
 * sin lo específico de ingredientes/Mercadona. Puro, sin store. Ver prisma.md.
 *
 * v0.2: op `aplicar` — escribe el pvp calculado EN el producto (blueprint-agentico
 * determinista LEER→calcula→GUARDA→EMITE): lee el producto (catalogo.get), fija su
 * precio_base_centimos, marca la pregunta_abierta de coste como respondida y sube la
 * madurez a 'listo' si ya no falta ninguna. El núcleo transform (_planAplicar) es puro.
 */

'use strict';

const nowISO = () => new Date().toISOString();
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PrismaCosteReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'coste';
    this.version = 'reflejo-0.2.0';
  }

  onCostearRequest(e) { return this._atender(e, 'costear', 'coste.costear.response', d => this._costear(d)); }
  onAplicarRequest(e) { return this._atender(e, 'aplicar', 'coste.aplicar.response', d => this._aplicar(d)); }

  _int(x) { return (typeof x === 'number' && Number.isFinite(x)) ? Math.round(x) : 0; }
  _r4(x) { return Math.round(x * 10000) / 10000; }

  _costear(input) {
    const comps = Array.isArray(input.componentes) ? input.componentes : [];
    let coste = this._int(input.coste_extra_centimos);
    for (const c of comps) {
      if (!c) continue;
      const unit = this._int(c.coste_centimos);
      const cant = (typeof c.cantidad === 'number' && c.cantidad > 0) ? c.cantidad : 1;
      coste += Math.round(unit * cant);
    }
    if (coste < 0) return this._errorResponse(400, 'INVALID_INPUT', 'coste total negativo', { field: 'componentes' });

    const out = { coste_total_centimos: coste, coste_total_eur: coste / 100 };

    // food cost objetivo (ratio 0..1, p.ej. 0.30) → precio de venta sugerido
    const fc = input.food_cost_objetivo;
    if (typeof fc === 'number' && fc > 0 && fc <= 1) {
      out.pvp_sugerido_centimos = coste > 0 ? Math.round(coste / fc) : 0;
      out.pvp_sugerido_eur = out.pvp_sugerido_centimos / 100;
      out.food_cost_objetivo = fc;
    }

    // pvp dado → food cost real + margen
    const pvp = this._int(input.pvp_centimos);
    if (pvp > 0) {
      out.pvp_centimos = pvp;
      out.food_cost_real = this._r4(coste / pvp);          // ratio coste/pvp
      out.margen = this._r4((pvp - coste) / pvp);           // margen sobre precio de venta
      out.margen_centimos = pvp - coste;
    }

    return { status: 200, data: out };
  }

  // ── núcleo PURO: dado el producto, el coste y el pvp elegido → qué escribir + resumen ──
  // marca la pregunta_abierta de coste como respondida; si con eso NO falta ninguna y
  // el producto estaba a la espera del comerciante, la madurez pasa a 'listo'.
  _planAplicar(prod, coste_total_centimos, pvp) {
    const preguntas = (Array.isArray(prod.preguntas_abiertas) ? prod.preguntas_abiertas : [])
      .map(q => (q && q.campo === 'coste') ? { ...q, respondida: true } : q);
    const campos = { precio_base_centimos: pvp, preguntas_abiertas: preguntas };
    const faltan = preguntas.some(q => q && !q.respondida);
    if (!faltan && prod.madurez === 'necesita_aclaracion_comerciante') campos.madurez = 'listo';
    const margen = pvp > 0 ? this._r4((pvp - coste_total_centimos) / pvp) : 0;
    return { campos, resumen: { pvp_centimos: pvp, coste_total_centimos, margen, margen_centimos: pvp - coste_total_centimos, madurez: campos.madurez || prod.madurez, todas_respondidas: !faltan } };
  }

  // espinazo: LEER el producto → calcular pvp → escribir precio + cerrar la pregunta → EMITIR.
  async _aplicar(input) {
    if (!input.project_id || !input.catalogo_id || !input.producto_id) return this._invalid('producto_id');
    const c = this._costear(input);
    if (c.status !== 200) return c;
    const pvp = this._int(input.pvp_centimos) || this._int(c.data.pvp_sugerido_centimos);
    if (!(pvp > 0)) return this._errorResponse(400, 'INVALID_INPUT', 'sin pvp: aporta pvp_centimos o food_cost_objetivo', { field: 'pvp' });

    const g = await this._rpc('catalogo.get.request', { project_id: input.project_id, catalogo_id: input.catalogo_id, carta_id: input.catalogo_id });
    if (!g || g.status !== 200 || !g.data) return this._errorResponse(502, 'UPSTREAM_UNREACHABLE', 'catálogo no responde');
    const prod = (Array.isArray(g.data.productos) ? g.data.productos : []).find(p => p.id === input.producto_id);
    if (!prod) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'producto no existe en el catálogo', { entity_type: 'producto', id: input.producto_id });

    const { campos, resumen } = this._planAplicar(prod, c.data.coste_total_centimos, pvp);
    const u = await this._rpc('catalogo.update_product.request', { project_id: input.project_id, catalogo_id: input.catalogo_id, producto_id: input.producto_id, campos });
    if (!u || u.status >= 400) return u || this._errorResponse(502, 'UPSTREAM_UNREACHABLE', 'no se pudo escribir el precio');

    this.eventBus?.publish('coste.aplicado', { project_id: input.project_id, catalogo_id: input.catalogo_id, producto_id: input.producto_id, ...resumen, correlation_id: input.correlation_id, timestamp: nowISO() });
    return { status: 200, data: { producto_id: input.producto_id, ...resumen } };
  }
}

module.exports = PrismaCosteReflejo;
