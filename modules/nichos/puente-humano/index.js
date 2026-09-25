/**
 * nichos/puente-humano — PUENTE STATELESS: cero persistencia, solo enruta hacia el
 * ser humano cuando el sistema NO sabe.
 *
 * D2 del plan: es la EXCEPCION del sistema — cuando el sistema no sabe, presenta
 * nicho+problema+dudas al admin por EVENTO con paquete cerrado (SolicitudDecision).
 * Es un tapón humano de Nichos, nunca el flujo normal: se activa por un BLOQUEO
 * que el sistema no puede resolver solo (construir sin alternativa, autorizar).
 *
 * Proyecciones puras:
 *   _detectarBloqueo  valida que llegue un bloqueo real (nicho + problema) y arma
 *                     el paquete cerrado de dudas a resolver por el dueño.
 *   _emitirSolicitud  enruta el paquete cerrado (nicho+problema+dudas) → SolicitudDecision
 *                     al canal de supervision; publica nichos.puente_solicitado.
 *
 * Sin store, sin custodio: cada op entra objeto, sale objeto. El puente comunica
 * con el exterior (el humano), no decide por su cuenta ni lo resuelve.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PuenteHumano extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puente-humano';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  // Detectar un bloqueo (construccion sin alternativa) y armar el paquete cerrado -> SolicitudDecision.
  onSolicitarRequest(e) {
    return this._atender(e, 'solicitar', 'nichos.puente.solicitar.response', async (d) => {
      const res = await this._solicitar(d);
      // Fire-and-forget de dominio: exito → solicitado; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.puente_solicitado', res.data);
      } else {
        this.eventBus?.publish('nichos.puente.solicitar.failed', res);
      }
      return res;
    });
  }

  // ── el puente: detecta el bloqueo y arma el paquete cerrado de dudas ──
  async _solicitar({ project_id, nicho, problema, dudas } = {}) {
    project_id = project_id || this.project_id;
    const bloqueo = this._detectarBloqueo({ nicho, problema, dudas });
    if (bloqueo.status !== 200) {
      return this._errorResponse(bloqueo.status, bloqueo.error?.code, bloqueo.error?.message, { project_id });
    }
    const solicitud = this._emitirSolicitud({ project_id, ...bloqueo.data });
    return { status: 200, data: solicitud };
  }

  // ── REFLEJO (mecánico, determinista): valida el bloqueo real y arma el paquete cerrado ──
  _detectarBloqueo({ nicho, problema, dudas } = {}) {
    if (!nicho || typeof nicho !== 'object') {
      return this._errorResponse(400, 'NICHO_INVALIDO', 'el nicho es obligatorio para presentar el bloqueo al humano', {});
    }
    if (!problema || typeof problema !== 'string' || problema.trim().length === 0) {
      return this._errorResponse(400, 'PROBLEMA_INVALIDO', 'el problema a resolver es obligatorio', {});
    }
    const dudasLista = (Array.isArray(dudas) && dudas.length > 0) ? dudas : ['decide sobre este bloqueo'];
    return {
      status: 200,
      data: {
        nicho: nicho.producto || nicho.servicio || nicho.nombre || nicho.id || null,
        problema: problema.trim(),
        dudas: dudasLista.map(d => String(d).trim()),
        paquete_cerrado: true,
        excepcion: true
      }
    };
  }

  // ── REFLEJO: arma la SolicitudDecision autocontenida hacia el dueño ──
  _emitirSolicitud(d) {
    return {
      tipo: 'puente_humano',
      nicho: d.nicho,
      problema: d.problema,
      dudas: d.dudas,
      estado: 'PENDIENTE',
      paquete_cerrado: true,
      solicitado_en: new Date().toISOString()
    };
  }
}

module.exports = PuenteHumano;
