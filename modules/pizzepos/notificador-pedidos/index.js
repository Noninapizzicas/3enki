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
    this.version = '2.0.0';

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
    const tg = config.telegram;
    if (!tg || !tg.chatId || String(tg.chatId).startsWith('<PENDIENTE')) {
      this.logger.warn('notificador-pedidos.telegram.sin_chatid', {
        project_slug: config.project_slug,
        pedido_id: pedido.pedido_id
      });
      this._incrementMetric('notificador.pedido.descartado.total', { project: config.project_slug || 'unknown', razon: 'proyecto_sin_chatid' });
      return;
    }
    const text = this._formatPedidoMessage(config, pedido);
    const correlation_id = (sourceEvent && sourceEvent.metadata && sourceEvent.metadata.correlation_id) || crypto.randomUUID();
    try {
      await this.eventBus.publish('telegram.send_message.request', {
        request_id: crypto.randomUUID(),
        botName: tg.botName || null,
        chatId: Number(tg.chatId),
        text,
        correlation_id
      });
      this._incrementMetric('notificador.pedido.notificado.total', { project: config.project_slug || 'unknown', canal: 'telegram' });
      this.logger.info('notificador-pedidos.telegram.notificado', {
        project_slug: config.project_slug,
        pedido_id: pedido.pedido_id,
        chatId: Number(tg.chatId)
      });
    } catch (err) {
      this.logger.warn('notificador-pedidos.telegram.publish_failed', {
        project_slug: config.project_slug,
        pedido_id: pedido.pedido_id,
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
