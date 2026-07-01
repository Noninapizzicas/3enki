/**
 * prisma/coste — REFLEJO JS: la cara COMERCIANTE de Prisma.
 *
 * Calculadora determinista coste → margen → pvp, en CÉNTIMOS (coherente con
 * opciones/tasador). Los componentes de coste los aporta el COMERCIANTE — son la
 * respuesta a las preguntas_abiertas de coste del ProductoUniversal. coste NO
 * inventa precios: solo calcula. Generaliza la aritmética de escandallo (Σ coste)
 * + viabilidad (food cost objetivo → pvp; pvp → margen/food cost real) en genérico,
 * sin lo específico de ingredientes/Mercadona. Puro, sin store. Ver prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PrismaCosteReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'coste';
    this.version = 'reflejo-0.1.0';
  }

  onCostearRequest(e) { return this._atender(e, 'costear', 'coste.costear.response', d => this._costear(d)); }

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
}

module.exports = PrismaCosteReflejo;
