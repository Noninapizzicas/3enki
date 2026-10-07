/**
 * nichos/canal-distribucion — PUENTE STATELESS (E4, hoja del plan).
 *
 * Lleva la SOLUCIÓN construida al pagador del nicho por su canal de entrega
 * declarado (del perfil de cobro/entrega I1). Stateless: sin store, sin
 * persistencia, cada op entra objeto, sale objeto. El canal declarado es un
 * puerto ABIERTO — agnóstico al proveedor: nunca se acopla a una plataforma de
 * entrega concreta; el canal se declara y puede sustituirse por evento.
 *
 * Proyección pura: _emitirEntrega(project_id, solucion) → entrega que enruta
 * hacia el canal del pagador. Publica nichos.entrega.enviada (éxito) y su par
 * determinista nichos.entrega.enviar.failed (sin canal o sin solución/sin
 * pagador). Ver hoja E4 del plan-construccion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CanalDistribucion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'canal-distribucion';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  // project.activated — puente sin estado: solo registra el project activo.
  async onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    this.project_id = d.project_id || this.project_id;
    this.logger?.info(`${this.name}.reflejo.project_activated`, { project_id: this.project_id });
    return { status: 200, data: { project_id: this.project_id } };
  }

  onEnviarRequest(e) {
    return this._atender(e, 'enviar', 'nichos.entrega.enviar.response', async (d) => {
      const res = this._emitirEntrega(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.entrega.enviada', {
          project_id: res.data.project_id,
          entrega: res.data.entrega,
          enviada: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.entrega.enviar.failed', res);
      }
      return res;
    });
  }

  // ── proyección pura: enruta la solución hacia el canal del pagador ──
  _emitirEntrega({ project_id, solucion, canal, pagador } = {}) {
    project_id = project_id || this.project_id;
    if (!project_id) return this._invalid('project_id');
    if (!solucion || typeof solucion !== 'object') return this._invalid('solucion');
    if (!pagador || typeof pagador !== 'string' || !pagador.trim()) return this._invalid('pagador');
    if (!canal || typeof canal !== 'string' || !canal.trim()) {
      return this._errorResponse(400, 'INVALID_INPUT', 'canal de entrega requerido (decláralo en el perfil de cobro/entrega I1)', {});
    }

    const entrega = {
      proyecto: project_id,
      pagador: pagador.trim(),
      canal: canal.trim(),
      solucion_id: solucion.id || solucion.slug || `${project_id}-sol`,
      entregada: true,
      entregado_en: new Date().toISOString()
    };
    return { status: 200, data: { project_id, entrega, enviada: true } };
  }

  // ── Tools ──
  toolEmitir(params) { return this._emitirEntrega(params); }
}

module.exports = CanalDistribucion;
