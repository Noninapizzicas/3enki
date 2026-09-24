/**
 * nichos/imputacion-costes — REFLEJO JS PURO: cero pensar, solo calcular.
 *
 * Calcula LO QUE CUESTA cada proyecto: la suma de sus partidas de coste —
 * construcción (montaje de la solución) + operación (mantenimiento) + fuentes
 * (cuota de consulta/scraping/API, vía coste-fuente J4). Stateless: cada op es
 * una función pura determinista (entra objeto, sale objeto).
 *
 *   agregar             imputa el CosteProyecto a un proyecto y publica
 *                       nichos.coste_imputado.
 *   calcularCosteProyecto  proyección pura: desglose + coste_total.
 *
 * Al agregar con éxito publica el evento de dominio nichos.coste_imputado.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ImputacionCostes extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'imputacion-costes';
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

  onAgregarRequest(e) {
    return this._atender(e, 'agregar', 'nichos.coste.agregar.response', async (d) => {
      const res = this._agregar(d);
      // Fire-and-forget de dominio: exito → imputado; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.coste_imputado', res.data);
      } else {
        this.eventBus?.publish('nichos.coste.agregar.failed', res);
      }
      return res;
    });
  }

  // ── proyección principal: imputa el CosteProyecto (determinista) ──
  _agregar({ project_id, costes } = {}) {
    project_id = project_id || this.project_id;
    if (!project_id) return this._invalid('project_id');
    if (!costes || typeof costes !== 'object') {
      return this._invalid('costes');
    }

    const cp = this._calcularCosteProyecto(project_id, costes);
    if (!cp) {
      return this._errorResponse(400, 'COSTE_INVALIDO', 'las partidas de coste deben ser numeros >= 0', { project_id });
    }
    return { status: 200, data: { project_id, coste_proyecto: cp, coste_total: cp.coste_total, imputado: true } };
  }

  // ── proyección pura: desglose + total (coste real absorbe el proyecto) ──
  _calcularCosteProyecto(project_id, costes) {
    const construccion = Number(costes.construccion);
    const operacion = Number(costes.operacion);
    let fuentes = Number(costes.fuentes);
    if (Array.isArray(costes.fuentes)) {
      fuentes = costes.fuentes.reduce((acc, f) => acc + (Number(f.coste) || 0), 0);
    }
    const nums = [construccion, operacion, fuentes];
    if (nums.some(n => !Number.isFinite(n) || n < 0)) return null;
    const coste_total = Math.round((construccion + operacion + fuentes) * 100) / 100;
    return {
      esquema: 'nichos-coste-proyecto-v1',
      construccion: Math.round(construccion * 100) / 100,
      operacion: Math.round(operacion * 100) / 100,
      fuentes: Math.round(fuentes * 100) / 100,
      coste_total
    };
  }

  // ── Tools ──
  toolAgregar(params) { return this._agregar(params); }
  toolCalcularCosteProyecto(params) { return this._calcularCosteProyecto(params.project_id, params.costes); }
}

module.exports = ImputacionCostes;
