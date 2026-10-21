/**
 * adaptador-confirmacion — PUENTE del proyecto 3D (taller personal de impresion 3D).
 *
 * Recibe la confirmacion del dueno por el puerto 'confirmar(tipo) → ok'
 * (adaptador-confirmacion.confirmar.request por RPC, lo llama ciclo-impresion)
 * y por el canal del dueno (telegram-bridge: telegram.callback.received,
 * botones inline o respuesta). El dueno confirma: retirar pieza
 * (pieza_retirada), cambiar filamento (filamento_cambiado), reanudar ciclo
 * tras error (reanudar_ciclo), aprobar/rechazar modelo (modelo_aprobado /
 * modelo_rechazado).
 *
 * El adaptador recibe la confirmacion, la interpreta con el CONVERSOR interno
 * _interpretarConfirmacion (pieza 12.2, mapeo boton → tipo; no_reconocida pide
 * aclaracion) y la entrega al sistema publicando
 * adaptador-confirmacion.confirmacion_recibida.
 *
 * Es PUENTE: sin store, no persiste, transporta y delega. Todo flujo cierra su
 * circulo: si la confirmacion no se puede pedir/entregar o el tipo no se
 * reconoce, emite adaptador-confirmacion.confirmar.failed. Ver
 * plan-construccion.md seccion 6.11.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class AdaptadorConfirmacionReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'adaptador-confirmacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onConfirmarRequest(e) { return this._atender(e, 'confirmar', 'adaptador-confirmacion.confirmar.response', d => this._confirmar(d)); }

  // fire-and-forget: el canal del dueno entrega un callback (boton o respuesta).
  async onTelegramCallbackReceived(e) {
    const d = (e && e.data) || e || {};
    const r = this._interpretarConfirmacion(d);
    if (r.status >= 400) {
      this.eventBus?.publish('adaptador-confirmacion.confirmar.failed', {
        confirmacion_id: d.confirmacion_id || null, tipo: r.data && r.data.tipo || 'no_reconocida',
        project_id: d.project_id, error: r.error,
        correlation_id: d.correlation_id, timestamp: nowISO()
      });
      return r;
    }
    this.eventBus?.publish('adaptador-confirmacion.confirmacion_recibida', {
      confirmacion_id: d.confirmacion_id || crypto.randomUUID(),
      tipo: r.data.tipo, contexto: r.data.contexto,
      project_id: d.project_id, correlation_id: d.correlation_id, timestamp: nowISO()
    });
    return r;
  }

  // ---- proyecciones deterministas ----------------------------------------

  // PUENTE: pide al dueno la confirmacion de un tipo por el canal con ack.
  // Sin store. Puerto 'confirmar(tipo) → ok'.
  async _confirmar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const tipo = input.tipo || 'desconocido';
    if (!this._tiposConfirmacion().includes(tipo)) {
      return this._errorResponse(400, 'INVALID_INPUT', `tipo de confirmacion no reconocido: ${tipo}`, { tipo });
    }
    const confirmacion_id = input.confirmacion_id || crypto.randomUUID();
    const mensaje = this._construirPeticion(tipo, input);
    const canal = input.canal || 'telegram';

    if (canal === 'telegram') {
      const ok = await this._pedirTelegram(input, mensaje, tipo);
      if (!ok) {
        return this._errorResponse(502, 'CANAL_NO_CONFIRMO', 'el canal no confirmo la peticion de confirmacion', { canal, confirmacion_id });
      }
    } else {
      return this._errorResponse(400, 'INVALID_INPUT', `canal no soportado: ${canal}`, { canal });
    }

    this.metrics?.increment(`${this.name}.reflejo.pedida`, { tipo, canal });
    return { status: 200, data: { confirmacion_id, tipo, canal, pedida: true, timestamp: nowISO() } };
  }

  // Pide por telegram-bridge (telegram.send_message.request) y espera el ack
  // (telegram.send_message.response). Best-effort: si no llega, false.
  async _pedirTelegram(input, mensaje, tipo) {
    const resp = await this._rpc('telegram.send_message.request', {
      botName: input.botName || null,
      chatId: input.chatId != null ? Number(input.chatId) : null,
      text: mensaje,
      inline_keyboard: this._botones(tipo),
      correlation_id: input.correlation_id
    }, { timeout_ms: 30000 });
    return !!(resp && resp.ok === true);
  }

  // pieza 12.2 — CONVERSOR interno: mapea el callback del dueno a un tipo de
  // confirmacion. Dato ausente nombrado, nunca inventado (invariante 5).
  // no_reconocida pide aclaracion (no se inventa una confirmacion).
  _interpretarConfirmacion(input) {
    const raw = String(input.callback_data || input.data || input.text || input.respuesta || '').trim();
    const tipo = this._mapear(raw);
    if (!tipo) {
      return this._errorResponse(400, 'CONFIRMACION_NO_RECONOCIDA', `confirmacion no reconocida: '${raw}'`, { raw });
    }
    return {
      status: 200,
      data: {
        tipo,
        contexto: {
          confirmacion_id: input.confirmacion_id || null,
          modelo_id: input.modelo_id || null,
          pieza_id: input.pieza_id || null,
          rollo_id: input.rollo_id || null,
          raw
        }
      }
    };
  }

  // Mapeo boton/callback → tipo de confirmacion (12.2).
  _mapear(raw) {
    const r = raw.toLowerCase();
    if (r.includes('retirar') || r === 'pieza_retirada' || r === 'retirada') return 'pieza_retirada';
    if (r.includes('filamento') || r === 'filamento_cambiado' || r === 'cambiar_filamento') return 'filamento_cambiado';
    if (r.includes('reanudar') || r === 'reanudar_ciclo') return 'reanudar_ciclo';
    if (r.includes('aprobar') || r === 'modelo_aprobado' || r === 'aprobado') return 'modelo_aprobado';
    if (r.includes('rechazar') || r === 'modelo_rechazado' || r === 'rechazado') return 'modelo_rechazado';
    return null;
  }

  // Enum de tipos de confirmacion soportados (12.2).
  _tiposConfirmacion() {
    return ['pieza_retirada', 'filamento_cambiado', 'reanudar_ciclo', 'modelo_aprobado', 'modelo_rechazado'];
  }

  // Botones inline por tipo de confirmacion.
  _botones(tipo) {
    switch (tipo) {
      case 'pieza_retirada': return [[{ text: 'Retirar pieza', callback_data: 'pieza_retirada' }]];
      case 'filamento_cambiado': return [[{ text: 'Filamento cambiado', callback_data: 'filamento_cambiado' }]];
      case 'reanudar_ciclo': return [[{ text: 'Reanudar ciclo', callback_data: 'reanudar_ciclo' }]];
      case 'modelo_aprobado': return [
        [{ text: 'Aprobar', callback_data: 'modelo_aprobado' }, { text: 'Rechazar', callback_data: 'modelo_rechazado' }]
      ];
      default: return [];
    }
  }

  // Mensaje de peticion de confirmacion por tipo.
  _construirPeticion(tipo, input) {
    const nombre = input.nombre || input.modelo_nombre || 'desconocido';
    const lineas = [`[Taller 3D] ${this._titulo(tipo)}`];
    if (nombre !== 'desconocido') lineas.push(`Pieza: ${nombre}`);
    if (input.detalle) lineas.push(input.detalle);
    return lineas.join('\n');
  }

  _titulo(tipo) {
    switch (tipo) {
      case 'pieza_retirada': return 'Confirma que retiraste la pieza';
      case 'filamento_cambiado': return 'Confirma que cambiaste el filamento';
      case 'reanudar_ciclo': return 'Confirma que quieres reanudar el ciclo';
      case 'modelo_aprobado': return 'Confirma si apruebas el modelo';
      default: return 'Confirmacion';
    }
  }
}

module.exports = AdaptadorConfirmacionReflejo;
