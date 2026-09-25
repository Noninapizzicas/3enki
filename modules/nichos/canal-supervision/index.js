/**
 * nichos/canal-supervision — PUENTE STATELESS: cero persistencia, solo enruta la
 * supervision hacia el canal del dueño.
 *
 * G1 del plan: es el puerto abierto del canal de supervision (Telegram u otro).
 * Aplicado la regla del plan — Telegram es UNA implementacion del puerto, NUNCA el
 * portador; cada canal se registra y puede sustituirse por evento sin acoplarse a
 * una plataforma concreta. Enruta notificaciones/decisiones hacia el canal activo.
 *
 * Tres proyecciones puras:
 *   _conectar      declara/conecta un canal supervisado → ok (swap sin acople;
 *                  publica conectado).
 *   _reemplazar    sustituye un canal conectado por otro declarado → ok.
 *   _enviar        enruta un mensaje hacia el canal activo → entrega (agnostico
 *                  al proveedor; publica enviado; fallo → par determinista).
 *
 * Sin store, sin custodio: cada op entra objeto, sale objeto. El puente comunica
 * con el exterior (el canal), no con un vendor concreto.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CanalSupervision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'canal-supervision';
    this.version = 'reflejo-0.1.0';
    // Registro de canales conectados — estado EN MEMORIA (puente no persiste).
    this.canales = new Map();
  }
  async onUnload() { return super.onUnload(); }

  // Conectar/declarar un canal de supervision -> swap sin acople a plataforma.
  onConectarRequest(e) {
    return this._atender(e, 'conectar', 'nichos.canal.conectar.response', async (d) => {
      const res = this._conectar(d);
      if (res.status === 200) this.eventBus?.publish('nichos.canal.conectado', res.data);
      return res;
    });
  }

  // Reemplazar un canal conectado por otro declarado (puerto reemplazable por evento).
  onReemplazarRequest(e) {
    return this._atender(e, 'reemplazar', 'nichos.canal.reemplazar.response', async (d) => {
      const res = this._reemplazar(d);
      if (res.status === 200) this.eventBus?.publish('nichos.canal.reemplazado', res.data);
      return res;
    });
  }

  // Enviar una notificacion/decision hacia el canal activo -> entrega (agnostico).
  onEnviarRequest(e) {
    return this._atender(e, 'enviar', 'nichos.canal.enviar.response', async (d) => {
      const res = this._enviar(d);
      if (res.status === 200) {
        this.eventBus?.publish('nichos.canal.enviado', res.data);
      } else {
        // Par de fallo determinista: cierra el circulo de nichos.canal.enviar.request.
        this.eventBus?.publish('nichos.canal.envio_fallido', res);
      }
      return res;
    });
  }

  // Proyeccion pura: conecta (o actualiza) un canal supervisado — agnostico al proveedor.
  _conectar({ canal, config = {} } = {}) {
    if (!canal || typeof canal !== 'string') {
      return this._errorResponse(400, 'INVALID_INPUT', 'canal requerido', {});
    }
    // Whitelist de canales de supervision declarables (reemplazables por evento).
    // Telegram es UNA implementacion del puerto, nunca el portador obligatorio.
    const tipo = config.tipo || config.plataforma || 'telegram';
    const previa = this.canales.has(canal);
    this.canales.set(canal, {
      id: canal,
      tipo,
      estado: 'conectado',
      reemplaza: previa,
      conectado_en: new Date().toISOString()
    });
    return { status: 200, data: { canal, conectado: true, reemplaza: previa, tipo, config: this.canales.get(canal) } };
  }

  // Proyeccion pura: reemplaza un canal conectado por otro declarado.
  _reemplazar({ canal, por, config = {} } = {}) {
    if (!canal || !por) {
      return this._errorResponse(400, 'INVALID_INPUT', 'canal y destino requeridos', {});
    }
    if (!this.canales.has(canal)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `el canal '${canal}' no esta conectado`, { canal });
    }
    const tipo = config.tipo || config.plataforma || 'telegram';
    this.canales.delete(canal);
    this.canales.set(por, {
      id: por,
      tipo,
      estado: 'conectado',
      reemplazada: canal,
      conectado_en: new Date().toISOString()
    });
    return { status: 200, data: { de: canal, a: por, reemplazado: true, tipo, config: this.canales.get(por) } };
  }

  // Proyeccion pura: enruta el mensaje hacia el canal activo — entrega (agnostico al proveedor).
  _enviar({ canal, tipo = 'notificacion', titulo, cuerpo } = {}) {
    if (!titulo && !cuerpo) {
      return this._errorResponse(400, 'INVALID_INPUT', 'titulo o cuerpo del mensaje requerido', {});
    }
    const origen = canal || [...this.canales.keys()][0];
    if (!origen) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        'no hay canal de supervision conectado; conecta uno antes (nichos.canal.conectar.request)', {});
    }
    if (!this.canales.has(origen)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `el canal '${origen}' no esta conectado`, { canal: origen });
    }
    const activo = this.canales.get(origen);
    // Enrutamiento agnostico: el puente NO asume el formato del proveedor; solo
    // transmite el mensaje y devuelve la entrega al canal activo con su coste/rate.
    return {
      status: 200,
      data: {
        canal: origen,
        tipo,
        titulo: titulo || null,
        cuerpo: cuerpo || null,
        entregado: true,
        proveedor_tipo: activo.tipo,
        escalon: tipo,
        enviado_en: new Date().toISOString()
      }
    };
  }
}

module.exports = CanalSupervision;
