/**
 * contabilidad-fiscal/modelo-390 — REFLEJO STATELESS (D3, hoja del plan).
 *
 * Declaracion ANUAL del IVA (modelo 390). Construccion DETERMINISTA: agrega las
 * liquidaciones periodicas (los 4 trimestres) que le llegan declaradas o que sube
 * por EVENTO a `liquidacion-iva` (le pide que calcule; aqui NO se calcula el IVA).
 *
 * LA LEY COMO DATO: las casillas / los TIPOS del 390 son DECLARABLES (`tipos`).
 * NO hay NINGUNA casilla cableada: el modulo agrupa por la clave `tipo` que cada
 * liquidacion declare, y devuelve los tipos declarados tal cual. Sustituir la ley
 * es cambiar el DATO, no el codigo.
 *
 * Invariante (honestidad, invariante 13): sin liquidaciones NO se inventa el 390
 * — se declara ABIERTO (dato ausente = desconocido).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (construir) → sin ui_handler.
 * Ver hoja D3 del plan-construccion y diseno-oop.md (CLASE Modelo390).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class Modelo390 extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'modelo-390';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onConstruirRequest(e) {
    return this._atender(e, 'construir', 'modelo-390.construir.response', async (d) => {
      const res = await this._construir(d);
      // Reflejo: deriva; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('modelo-390.construir.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): el ejercicio se cerro → se observa (ventana acotada) ──
  onEjercicioCerrado(e) {
    const d = (e && (e.data || e)) || {};
    this._cerrados = this._cerrados || [];
    if (d.ejercicio != null || d.project_id) {
      this._cerrados.push({ ejercicio: d.ejercicio != null ? d.ejercicio : null, project_id: d.project_id || this.project_id || null });
    }
    if (this._cerrados.length > 200) this._cerrados.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // construir(input) → { resumen, por_tipo, periodos, verificable, abierto }
  // ══════════════════════════════════════════════════════════════════════
  async _construir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ejercicio = input.ejercicio != null ? input.ejercicio : null;
    const { liquidaciones, fuente } = await this._liquidacionesDe(input);

    // LA LEY COMO DATO: los tipos declarados viajan tal cual; el modulo no cablea casillas.
    const tipos = Array.isArray(input.tipos) ? input.tipos : [];

    let iva_devengado = 0, iva_deducible = 0, resultado = 0;
    const por_tipo = {};
    const periodos = [];

    for (const l of liquidaciones) {
      const dev = this._num(l && (l.iva_devengado != null ? l.iva_devengado : (l.devengado != null ? l.devengado : l.cuota_devengada)));
      const ded = this._num(l && (l.iva_deducible != null ? l.iva_deducible : (l.deducible != null ? l.deducible : l.cuota_deducible)));
      const res = (l && l.resultado != null) ? this._num(l.resultado) : this._round(dev - ded, 2);
      iva_devengado += dev; iva_deducible += ded; resultado += res;
      periodos.push({
        periodo: l && l.periodo != null ? l.periodo : null,
        iva_devengado: this._round(dev, 2),
        iva_deducible: this._round(ded, 2),
        resultado: this._round(res, 2)
      });
      // Desglose por tipo SOLO si la liquidacion lo declara (nunca inventado).
      const pt = (l && l.por_tipo && typeof l.por_tipo === 'object') ? l.por_tipo : null;
      if (pt) {
        for (const [k, v] of Object.entries(pt)) {
          por_tipo[k] = por_tipo[k] || { base: 0, cuota: 0 };
          por_tipo[k].base = this._round(por_tipo[k].base + this._num(v && v.base), 2);
          por_tipo[k].cuota = this._round(por_tipo[k].cuota + this._num(v && v.cuota), 2);
        }
      }
    }

    iva_devengado = this._round(iva_devengado, 2);
    iva_deducible = this._round(iva_deducible, 2);
    resultado = this._round(resultado, 2);
    const verificable = liquidaciones.length > 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'modelo-390',
        ejercicio,
        fuente: fuente || null,
        // LA LEY COMO DATO: los tipos declarados se devuelven sin transformar.
        tipos_declarados: tipos,
        resumen: { iva_devengado, iva_deducible, resultado },
        por_tipo,
        periodos,
        total_periodos: liquidaciones.length,
        verificable,
        abierto: {
          liquidaciones: verificable
            ? null
            : 'no se recibieron liquidaciones (ni declaradas ni de liquidacion-iva): el 390 no se inventa',
          tipos: tipos.length
            ? null
            : 'no se declararon tipos del 390: se agrupa por la clave `tipo` de cada liquidacion (la ley entra como dato)'
        }
      }
    };
  }

  // Trae las liquidaciones: declaradas en el input, o subidas por EVENTO a liquidacion-iva.
  async _liquidacionesDe(input) {
    if (Array.isArray(input.liquidaciones)) return { liquidaciones: input.liquidaciones, fuente: 'declarado' };
    const resp = await this._rpc('liquidacion-iva.calcular.request', {
      project_id: input.project_id || this.project_id,
      ejercicio: input.ejercicio,
      periodos: Array.isArray(input.periodos) ? input.periodos : null
    }, { timeout_ms: 800 });
    const arr = resp && (
      Array.isArray(resp.liquidaciones) ? resp.liquidaciones
        : (resp.data && Array.isArray(resp.data.liquidaciones) ? resp.data.liquidaciones : null)
    );
    if (arr) return { liquidaciones: arr, fuente: 'liquidacion-iva' };
    return { liquidaciones: [], fuente: null };
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolConstruir(params) { return this._construir(params); }
}

module.exports = Modelo390;
