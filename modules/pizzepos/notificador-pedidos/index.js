'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');

/**
 * notificador-pedidos
 *
 * Escucha pedido.creado (canal web/tienda) y publica telegram.send_message.request
 * al chatId del staff del proyecto. Reemplaza la responsabilidad que tenia
 * whatsapp-bot tras el pivote a Telegram-first para la vertical tienda PWA.
 *
 * Resolucion on-demand del proyecto: cuando llega pedido.creado, publica
 * project.get.request con el project_id del pedido y espera la response del
 * project-manager para obtener base_path. Lee config de disco y notifica.
 *
 * No cachea estado de proyecto ni depende de project.activated — evita
 * el acoplamiento al ciclo de vida "proyecto activo" (UI session focus),
 * que dejaba al modulo ciego tras restart si nadie reactivaba el proyecto.
 *
 * Diseño multi-canal: hoy solo Telegram. En v2 se anyadira branch para
 * discord.send_message.request cuando discord-service exista — la decision de
 * que canales notificar vive en project.json:
 *   "notificaciones": { "canales": ["telegram", "discord"] }
 */
class NotificadorPedidosModule extends BaseModule {
  constructor() {
    super();
    this.name = 'notificador-pedidos';
    this.version = '2.1.0';

    // request_id -> { resolve, reject, timeoutHandle } para correlar project.get.response.
    this._pendingProjectResolves = new Map();
    this._unsubscribeProjectGetResponse = null;

    this._projectResolveTimeoutMs = 5000;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.eventBus = context.eventBus;

    // Suscripcion unica a project.get.response que despacha por request_id
    // a las llamadas pendientes de _resolveProject.
    this._unsubscribeProjectGetResponse = await this.eventBus.subscribe(
      'project.get.response',
      (event) => this._onProjectGetResponse(event)
    );

    this.logger.info('notificador-pedidos.loaded', { version: this.version });
  }

  async onUnload() {
    if (typeof this._unsubscribeProjectGetResponse === 'function') {
      try { this._unsubscribeProjectGetResponse(); } catch (_) { /* ignore */ }
      this._unsubscribeProjectGetResponse = null;
    }
    for (const pending of this._pendingProjectResolves.values()) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error('notificador-pedidos unloaded'));
    }
    this._pendingProjectResolves.clear();
  }

  // ==========================================
  // Bus subscribers
  // ==========================================

  async onPedidoCreado(event) {
    const data = (event && event.data) || event || {};
    const project_id = data.project_id;
    const canal_origen = data.canal_origen || null;

    this._incrementMetric('notificador.pedido.recibido.total', { project: project_id || 'unknown', canal_origen: canal_origen || 'none' });

    // Filtro 1: solo pedidos del canal web (tienda PWA). Los del POS interno
    // (pedido.creado con canal=mesa/llevar/etc desde comandero) se ignoran —
    // tienen su propio flujo de notificacion.
    if (canal_origen !== 'web') {
      this._incrementMetric('notificador.pedido.descartado.total', { project: project_id || 'unknown', razon: 'canal_origen_no_web' });
      return;
    }

    if (!project_id) {
      this.logger.warn('notificador-pedidos.pedido_creado.sin_project_id', { pedido_id: data.pedido_id });
      this._incrementMetric('notificador.pedido.descartado.total', { project: 'unknown', razon: 'sin_project_id' });
      return;
    }

    // Resolucion on-demand del proyecto. Patron canonico:
    // project-identity.contract — leer base_path, no recomponerlo.
    let project;
    try {
      project = await this._resolveProject(project_id);
    } catch (err) {
      this.logger.warn('notificador-pedidos.pedido_creado.resolve_failed', {
        project_id, pedido_id: data.pedido_id, error_message: err && err.message ? err.message : String(err)
      });
      this._incrementMetric('notificador.pedido.descartado.total', { project: project_id, razon: 'project_resolve_failed' });
      return;
    }
    if (!project || !project.base_path) {
      this.logger.warn('notificador-pedidos.pedido_creado.project_no_encontrado', { project_id, pedido_id: data.pedido_id });
      this._incrementMetric('notificador.pedido.descartado.total', { project: project_id, razon: 'project_no_encontrado' });
      return;
    }

    let projectConfig;
    try {
      projectConfig = await this._readProjectConfig(project.base_path);
    } catch (err) {
      this.logger.warn('notificador-pedidos.pedido_creado.config_read_failed', {
        project_id, base_path: project.base_path, error_message: err && err.message ? err.message : String(err)
      });
      this._incrementMetric('notificador.pedido.descartado.total', { project: project_id, razon: 'config_read_failed' });
      return;
    }

    const resolved = {
      project_slug: project.slug || project.name || null,
      base_path: project.base_path,
      telegram: this._extractTelegramConfig(projectConfig),
      canales: this._extractCanales(projectConfig)
    };

    const canales = resolved.canales && resolved.canales.length > 0 ? resolved.canales : ['telegram'];
    for (const canal of canales) {
      if (canal === 'telegram') {
        await this._notificarTelegram(resolved, data, event);
      }
      // canal === 'discord' lo añadiremos cuando discord-service exista (v2).
    }
  }

  // Un pedido lleva 10 minutos esperando el "si" del cliente y sigue parado (lo publica
  // confirmacion-pedido). No se confirma solo ni se cancela solo: se avisa a la BARRA
  // por el mismo carril multicanal que los pedidos nuevos, para que lo mire, confirme
  // o cancele. Un pedido colgado en silencio es peor que uno rechazado.
  //
  // Este evento no trae items ni total (el pedido aun esta en `pedidos`): solo lo justo
  // para que quien esta en la barra sepa de que pedido y de que cliente se trata.
  async onPedidoSinConfirmar(event) {
    const data = (event && event.data) || event || {};
    const project_id = data.project_id || data.project_slug || null;

    this._incrementMetric('notificador.sin_confirmar.recibido.total', { project: project_id || 'unknown' });

    if (!project_id) {
      this.logger.warn('notificador-pedidos.sin_confirmar.sin_project_id', { pedido_id: data.pedido_id });
      this._incrementMetric('notificador.sin_confirmar.descartado.total', { project: 'unknown', razon: 'sin_project_id' });
      return;
    }

    let project;
    try {
      project = await this._resolveProject(project_id);
    } catch (err) {
      this.logger.warn('notificador-pedidos.sin_confirmar.resolve_failed', {
        project_id, pedido_id: data.pedido_id, error_message: err && err.message ? err.message : String(err)
      });
      this._incrementMetric('notificador.sin_confirmar.descartado.total', { project: project_id, razon: 'project_resolve_failed' });
      return;
    }
    if (!project || !project.base_path) {
      this.logger.warn('notificador-pedidos.sin_confirmar.project_no_encontrado', { project_id, pedido_id: data.pedido_id });
      this._incrementMetric('notificador.sin_confirmar.descartado.total', { project: project_id, razon: 'project_no_encontrado' });
      return;
    }

    let projectConfig;
    try {
      projectConfig = await this._readProjectConfig(project.base_path);
    } catch (err) {
      this.logger.warn('notificador-pedidos.sin_confirmar.config_read_failed', {
        project_id, base_path: project.base_path, error_message: err && err.message ? err.message : String(err)
      });
      this._incrementMetric('notificador.sin_confirmar.descartado.total', { project: project_id, razon: 'config_read_failed' });
      return;
    }

    const resolved = {
      project_slug: data.project_slug || project.slug || project.name || null,
      base_path: project.base_path,
      telegram: this._extractTelegramConfig(projectConfig),
      canales: this._extractCanales(projectConfig)
    };

    const canales = resolved.canales && resolved.canales.length > 0 ? resolved.canales : ['telegram'];
    for (const canal of canales) {
      if (canal === 'telegram') {
        await this._notificarSinConfirmarTelegram(resolved, data, event);
      }
    }
  }

  // ==========================================
  // Resolucion de proyecto via bus (request/response)
  // ==========================================

  _onProjectGetResponse(event) {
    const data = (event && event.data) || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this._pendingProjectResolves.get(request_id);
    if (!pending) return;
    this._pendingProjectResolves.delete(request_id);
    clearTimeout(pending.timeoutHandle);
    if (data.success && data.project) {
      pending.resolve(data.project);
    } else {
      pending.resolve(null);
    }
  }

  _resolveProject(project_id) {
    return new Promise((resolve, reject) => {
      const request_id = crypto.randomUUID();
      const timeoutHandle = setTimeout(() => {
        this._pendingProjectResolves.delete(request_id);
        reject(new Error(`project.get.request timeout (${this._projectResolveTimeoutMs}ms) for project_id=${project_id}`));
      }, this._projectResolveTimeoutMs);
      this._pendingProjectResolves.set(request_id, { resolve, reject, timeoutHandle });
      this.eventBus.publish('project.get.request', { request_id, project_id })
        .catch((err) => {
          this._pendingProjectResolves.delete(request_id);
          clearTimeout(timeoutHandle);
          reject(err);
        });
    });
  }

  // ==========================================
  // Notificacion Telegram
  // ==========================================

  async _notificarTelegram(config, pedido, sourceEvent) {
    const text = this._formatPedidoMessage(config, pedido);
    await this._enviarTelegram(config, text, pedido && pedido.pedido_id, sourceEvent,
      'notificador.pedido.notificado.total');
  }

  async _notificarSinConfirmarTelegram(config, aviso, sourceEvent) {
    const text = this._formatSinConfirmarMessage(config, aviso);
    await this._enviarTelegram(config, text, aviso && aviso.pedido_id, sourceEvent,
      'notificador.sin_confirmar.notificado.total');
  }

  // Un solo carril de salida para los dos avisos (pedido nuevo / pedido sin confirmar):
  // el chatId del staff se resuelve igual y el contrato con telegram-service es el mismo.
  async _enviarTelegram(config, text, pedido_id, sourceEvent, metricName) {
    const tg = config.telegram;
    if (!tg || !tg.chatId || String(tg.chatId).startsWith('<PENDIENTE')) {
      this.logger.warn('notificador-pedidos.telegram.sin_chatid', {
        project_slug: config.project_slug,
        pedido_id
      });
      this._incrementMetric('notificador.pedido.descartado.total', { project: config.project_slug || 'unknown', razon: 'proyecto_sin_chatid' });
      return;
    }
    const correlation_id = (sourceEvent && sourceEvent.metadata && sourceEvent.metadata.correlation_id) || crypto.randomUUID();
    try {
      await this.eventBus.publish('telegram.send_message.request', {
        request_id: crypto.randomUUID(),
        botName: tg.botName || null,
        chatId: Number(tg.chatId),
        text,
        correlation_id
      });
      this._incrementMetric(metricName, { project: config.project_slug || 'unknown', canal: 'telegram' });
      this.logger.info('notificador-pedidos.telegram.notificado', {
        project_slug: config.project_slug,
        pedido_id,
        chatId: Number(tg.chatId)
      });
    } catch (err) {
      this.logger.warn('notificador-pedidos.telegram.publish_failed', {
        project_slug: config.project_slug,
        pedido_id,
        error_message: err && err.message ? err.message : String(err)
      });
    }
  }

  // ==========================================
  // Formateo de mensaje
  // ==========================================

  /**
   * Mensaje al staff. Estructura clara legible en Telegram (sin markdown
   * pesado por compat con escapes complicados).
   *
   * Ancla de recogida: el NOMBRE del cliente (el dependiente lo pide y lo canta al recoger).
   */
  _formatPedidoMessage(config, pedido) {
    const slug = (config.project_slug || pedido.project_slug || 'pedido').toUpperCase();
    const lines = [
      `Pedido nuevo - ${slug}`,
      `A nombre de: ${pedido.cliente_nombre || '(sin nombre)'}`
    ];
    if (pedido.mayor_edad_confirmado === true) {
      lines.push('Mayor 18: confirmado en PWA');
    }
    // REPARTO: el destino y el enlace del mapa viajan en el evento (los compone pedidos
    // una sola vez). El que sale a repartir toca el enlace y navega; sin él, copia a mano.
    if (pedido.direccion_entrega) {
      lines.push(`🛵 Entrega: ${pedido.direccion_entrega}`);
      if (pedido.mapa_entrega) lines.push(`Mapa: ${pedido.mapa_entrega}`);
    }
    lines.push('');
    const items = Array.isArray(pedido.items) ? pedido.items : [];
    if (items.length === 0) {
      lines.push('(pedido sin items)');
    } else {
      for (const it of items) {
        const qty = Number.isInteger(it.cantidad) ? it.cantidad : (it.cantidad || 1);
        const desc = it.descripcion || it.nombre || it.producto_id || 'item';
        const eur = this._centimosToEur(it.precio_total_centimos != null ? it.precio_total_centimos : it.precio_total);
        lines.push(`${qty} x ${desc}${eur ? ` (${eur})` : ''}`);
      }
    }
    lines.push('');
    const totalEur = this._centimosToEur(pedido.total_centimos != null ? pedido.total_centimos : pedido.total);
    if (totalEur) lines.push(`Total: ${totalEur} EUR`);
    if (pedido.expira_at) lines.push(`Expira: ${pedido.expira_at}`);
    return lines.join('\n');
  }

  /**
   * Aviso a la barra: un pedido lleva 10 minutos sin que el cliente conteste al "si".
   * No lleva items ni total (el pedido sigue en `pedidos`, que es su dueño): lleva lo
   * que hace falta para identificarlo y decidir — cliente, id y desde cuándo espera.
   */
  _formatSinConfirmarMessage(config, aviso) {
    const slug = (config.project_slug || aviso.project_slug || 'pedido').toUpperCase();
    const lines = [
      `Pedido SIN CONFIRMAR - ${slug}`,
      `A nombre de: ${aviso.cliente_nombre || '(sin nombre)'}`
    ];
    if (aviso.pedido_id) lines.push(`Pedido: ${aviso.pedido_id}`);
    const pedida = this._hhmm(aviso.pedida_at);
    if (pedida) lines.push(`Se le pidio confirmacion: ${pedida}`);
    const espera = this._hhmm(aviso.esperando_desde);
    if (espera) lines.push(`Esperando desde: ${espera}`);
    lines.push('');
    lines.push('No ha contestado en 10 minutos. Entra en pedidos y confirmalo (va a cocina) o cancelalo.');
    return lines.join('\n');
  }

  // ISO → HH:MM en hora local del servidor (lo que lee quien está en la barra).
  _hhmm(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // ==========================================
  // Helpers privados
  // ==========================================

  async _readProjectConfig(base_path) {
    const configPath = path.join(base_path, 'config', 'project.json');
    const raw = await fs.readFile(configPath, 'utf8');
    return JSON.parse(raw);
  }

  _extractTelegramConfig(projectConfig) {
    const tg = (projectConfig && projectConfig.telegram) || null;
    if (!tg) return null;
    return {
      chatId: tg.chatId != null ? tg.chatId : (tg.chat_id != null ? tg.chat_id : null),
      botName: tg.botName || tg.bot_name || null
    };
  }

  _extractCanales(projectConfig) {
    const noti = projectConfig && projectConfig.notificaciones;
    if (noti && Array.isArray(noti.canales) && noti.canales.length > 0) return noti.canales.slice();
    // Default: telegram (Discord se anyade cuando exista discord-service v2).
    return ['telegram'];
  }

  _centimosToEur(centimos) {
    if (centimos == null) return null;
    if (typeof centimos === 'number' && Number.isInteger(centimos)) {
      return (centimos / 100).toFixed(2);
    }
    // Si ya viene como decimal (Number) lo dejamos como esta.
    if (typeof centimos === 'number') return centimos.toFixed(2);
    return null;
  }

  _incrementMetric(name, labels) {
    if (this.metrics && typeof this.metrics.increment === 'function') {
      try { this.metrics.increment(name, labels); } catch (_) { /* ignore */ }
    }
  }
}

module.exports = NotificadorPedidosModule;
