/**
 * nichos/captura-semilla — REFLEJO JS PURO: cero pensar, solo calcular.
 *
 * Acepta y formatea la SEMILLA (la palabra/idea que el dueño da para arrancar
 * la busqueda de nichos). Sin estado, sin red, sin store: cada op es una función
 * pura (entra objeto, sale objeto). Validaciones:
 *   aceptar   valida que la semilla no esté vacía ni malformada (string no vacío
 *             tras formatear) — si viene vacía NO la acepta → par de fallo
 *             determinista (nicahos.semilla.aceptar.failed) y responde 400.
 *   formatear normaliza la semilla (trim, colapsa espacios, minúsculas) → Semilla
 *             lista para normalizacion-semilla (A2).
 * Al aceptar con éxito publica el evento de dominio nichos.semilla.capturada.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CapturaSemilla extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'captura-semilla';
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

  onAcceptRequest(e) {
    return this._atender(e, 'aceptar', 'nichos.semilla.aceptar.response', async (d) => {
      const res = this._aceptar(d);
      // Fire-and-forget de dominio: exito → capturada; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.semilla.capturada', res.data);
      } else {
        this.eventBus?.publish('nichos.semilla.aceptar.failed', res);
      }
      return res;
    });
  }

  // Proyección pura: valida vacíos/formato y formatea la semilla.
  _aceptar({ project_id, mensaje } = {}) {
    project_id = project_id || this.project_id;
    const formateada = this._formatear(mensaje);
    if (formateada == null) {
      return this._errorResponse(400, 'SEMILLA_VACIA', 'la semilla esta vacia o no es un texto util', { project_id });
    }
    return { status: 200, data: { project_id, semilla: formateada, formateada, capturada: true } };
  }

  // Proyección pura: normaliza la semilla (string no vacío). null si no es válida.
  _formatear(mensaje) {
    if (typeof mensaje !== 'string') return null;
    const normalizada = mensaje.trim().replace(/\s+/g, ' ');
    return normalizada.length > 0 ? normalizada : null;
  }
}

module.exports = CapturaSemilla;
