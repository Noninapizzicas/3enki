/**
 * adaptador-avisos — PUENTE del proyecto 3D (taller personal de impresion 3D).
 *
 * Escucha el evento de aviso (adaptador-avisos.enviar.request por RPC, o
 * aviso.solicitar fire-and-forget de cualquier pieza), genera el mensaje con
 * el CONVERSOR interno _construirMensaje (pieza 4.1, template por tipo) y lo
 * envia por el canal del dueno (telegram-bridge: telegram.send_message.request
 * con ack). Tipos de aviso (pieza 4.3): terminado, cambio_filamento, fallo,
 * cola_vacia, filamento_bajo.
 *
 * Es PUENTE: sin store, no persiste, transporta y delega. Nadie da por hecho
 * el envio sin ok:true explicito del proveedor (honestidad M11): si el canal
 * no confirma, emite adaptador-avisos.enviar.failed (todo flujo cierra su
 * circulo). Ver plan-construccion.md seccion 6.10.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class AdaptadorAvisosReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'adaptador-avisos';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onEnviarRequest(e) { return this._atender(e, 'enviar', 'adaptador-avisos.enviar.response', d => this._enviar(d)); }

  // fire-and-forget: cualquier pieza pide un aviso (aviso.solicitar).
  async onAvisoSolicitar(e) {
    const d = (e && e.data) || e || {};
    const r = await this._enviar(d);
    if (!r || r.status >= 400) {
      this.eventBus?.publish('adaptador-avisos.enviar.failed', {
        aviso_id: d.aviso_id || null, tipo: d.tipo || 'desconocido',
        project_id: d.project_id, error: (r && r.error) || { code: 'UNKNOWN_ERROR', message: 'envio fallido' },
        correlation_id: d.correlation_id, timestamp: nowISO()
      });
    }
    return r;
  }

  // ---- proyecciones deterministas ----------------------------------------

  // PUENTE: transporta por el canal del dueno con ack. Sin store.
  async _enviar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const tipo = input.tipo || 'desconocido';
    if (!this._tiposAviso().includes(tipo)) {
      return this._errorResponse(400, 'INVALID_INPUT', `tipo de aviso no reconocido: ${tipo}`, { tipo });
    }
    const aviso_id = input.aviso_id || crypto.randomUUID();
    const mensaje = this._construirMensaje(tipo, input);
    const canal = input.canal || 'telegram';

    if (canal === 'telegram') {
      const ok = await this._enviarTelegram(input, mensaje);
      if (!ok) {
        return this._errorResponse(502, 'CANAL_NO_CONFIRMO', 'el canal no confirmo el envio', { canal, aviso_id });
      }
    } else {
      return this._errorResponse(400, 'INVALID_INPUT', `canal no soportado: ${canal}`, { canal });
    }

    this.metrics?.increment(`${this.name}.reflejo.enviado`, { tipo, canal });
    return { status: 200, data: { aviso_id, tipo, canal, enviado: true, timestamp: nowISO() } };
  }

  // Envia por telegram-bridge (telegram.send_message.request) y espera el ack
  // (telegram.send_message.response). Best-effort: si no llega, false.
  async _enviarTelegram(input, mensaje) {
    const resp = await this._rpc('telegram.send_message.request', {
      botName: input.botName || null,
      chatId: input.chatId != null ? Number(input.chatId) : null,
      text: mensaje,
      correlation_id: input.correlation_id
    }, { timeout_ms: 30000 });
    return !!(resp && resp.ok === true);
  }

  // pieza 4.1 — CONVERSOR interno: template de mensaje por tipo de aviso.
  // Dato ausente nombrado, nunca inventado (invariante 5).
  _construirMensaje(tipo, input) {
    const nombre = input.nombre || input.modelo_nombre || 'desconocido';
    const material = input.material || 'desconocido';
    const detalle = input.detalle || input.mensaje || '';
    const lineas = [`[Taller 3D] ${this._titulo(tipo)}`];
    if (nombre !== 'desconocido') lineas.push(`Pieza: ${nombre}`);
    if (material !== 'desconocido') lineas.push(`Material: ${material}`);
    if (detalle) lineas.push(detalle);
    return lineas.join('\n');
  }

  _titulo(tipo) {
    switch (tipo) {
      case 'terminado': return 'Impresion terminada';
      case 'cambio_filamento': return 'Cambia el filamento';
      case 'fallo': return 'Fallo en la impresion';
      case 'cola_vacia': return 'Cola de impresion vacia';
      case 'filamento_bajo': return 'Filamento bajo';
      default: return 'Aviso';
    }
  }

  // pieza 4.3 — enum de tipos de aviso soportados.
  _tiposAviso() {
    return ['terminado', 'cambio_filamento', 'fallo', 'cola_vacia', 'filamento_bajo'];
  }

  // pieza 13.1 — panel de estado (lee cola + filamento + estado por RPC).
  // Best-effort: si un proveedor no responde, hueco 'desconocido' (nunca inventado).
  async _verPanel(input) {
    if (!input.project_id) return this._invalid('project_id');
    const [cola, filamento, estado] = await Promise.all([
      this._rpc('cola.longitud.request', { project_id: input.project_id, correlation_id: input.correlation_id }),
      this._rpc('filamento.listar.request', { project_id: input.project_id, correlation_id: input.correlation_id }),
      this._rpc('adaptador-impresora.observar_estado.request', { project_id: input.project_id, correlation_id: input.correlation_id })
    ]);
    return {
      status: 200,
      data: {
        cola: (cola && cola.status === 200) ? cola.data : 'desconocido',
        filamento: (filamento && filamento.status === 200) ? filamento.data : 'desconocido',
        estado: (estado && estado.status === 200) ? estado.data : 'desconocido',
        timestamp: nowISO()
      }
    };
  }
}

module.exports = AdaptadorAvisosReflejo;
