/**
 * nichos/coste-fuente — REFLEJO JS PURO: cero pensar, solo calcular.
 *
 * Calcula el COSTE por fuente (consulta / scraping / API) para imputar a
 * proyecto. Stateless: cada op es una función pura determinista (entra objeto,
 * sale objeto). Sin red, sin store, sin custodio.
 *
 *   costear            calcula el coste de cada fuente (a partir de su tipo y
 *                      cuota de consultas) y el coste total imputable.
 *   calcularCoste      proyección pura: coste_fuente = consultas × coste_unitario,
 *                      con coste_unitario por defecto según tipo (consulta /
 *                      scraping / api).
 *   agregarAProyecto   sumatoria → alimenta la imputación de costes (F2).
 *
 * Al costear con éxito publica el evento de dominio nichos.fuente_costea_imputado.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Coste unitario por defecto (EUR por consulta) según el tipo de fuente.
// Consulta individual barata; scraping pesado; API de pago según cuota.
const COSTE_UNITARIO_POR_TIPO = {
  consulta: 0.01,
  scraping: 0.05,
  api: 0.03
};

const TIPOS_FUENTE = new Set(['consulta', 'scraping', 'api']);

class CosteFuente extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'coste-fuente';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  // project.activated — reflejo sin estado: solo registra el project activo en contexto.
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    this.project_id = d.project_id || this.project_id;
    this.logger?.info(`${this.name}.reflejo.project_activated`, { project_id: this.project_id });
    return { status: 200, data: { project_id: this.project_id } };
  }

  onCostearRequest(e) {
    return this._atender(e, 'costear', 'nichos.fuente.costear.response', async (d) => {
      const res = this._costear(d);
      // Fire-and-forget de dominio: exito → imputado; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.fuente_costea_imputado', res.data);
      } else {
        this.eventBus?.publish('nichos.fuente.costear.failed', res);
      }
      return res;
    });
  }

  // ── proyección principal: costea cada fuente y agrega el total ──
  _costear({ project_id, fuentes } = {}) {
    project_id = project_id || this.project_id;
    if (!project_id) return this._invalid('project_id');
    if (!Array.isArray(fuentes) || fuentes.length === 0) {
      return this._errorResponse(400, 'SIN_FUENTES', 'no hay fuentes que costear', { project_id });
    }

    const fuentes_costeadas = [];
    for (const f of fuentes) {
      const c = this._calcularCoste(project_id, f);
      if (!c) {
        return this._errorResponse(400, 'FUENTE_NO_COSTABLE', `la fuente no es costable (tipo inválido o consultas <=0)`, { project_id, fuente: f });
      }
      fuentes_costeadas.push(c);
    }

    const coste_total = fuentes_costeadas.reduce((acc, c) => acc + c.coste, 0);
    return { status: 200, data: { project_id, fuentes_costeadas, coste_total, costeado: true } };
  }

  // ── proyección pura: coste de UNA fuente (determinista) ──
  _calcularCoste(project_id, fuente) {
    if (!fuente || typeof fuente !== 'object' || !fuente.fuente) return null;
    const tipo = String(fuente.tipo || 'consulta').toLowerCase();
    if (!TIPOS_FUENTE.has(tipo)) return null;
    const consultas = Number(fuente.consultas);
    if (!Number.isInteger(consultas) || consultas <= 0) return null;
    const coste_unitario = Number.isFinite(Number(fuente.coste_unitario))
      ? Number(fuente.coste_unitario)
      : COSTE_UNITARIO_POR_TIPO[tipo];
    if (coste_unitario < 0) return null;
    const coste = Math.round(consultas * coste_unitario * 100) / 100;
    return {
      project_id,
      fuente: fuente.fuente,
      tipo,
      consultas,
      coste_unitario,
      coste
    };
  }

  // ── proyección pura: total imputable de un set de fuentes (alimenta F2) ──
  _agregarAProyecto(project_id, fuentes) {
    if (!project_id || !Array.isArray(fuentes)) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'project_id y fuentes obligatorios' } };
    }
    const total = fuentes.reduce((acc, f) => acc + (Number(f.coste) || 0), 0);
    return { status: 200, data: { project_id, coste_fuentes: total } };
  }

  // ── Tools ──
  toolCostear(params) { return this._costear(params); }
  toolCalcularCoste(project_id, fuente) { return this._calcularCoste(project_id, fuente); }
  toolAgregarAProyecto(params) { return this._agregarAProyecto(params.project_id, params.fuentes); }
}

module.exports = CosteFuente;
