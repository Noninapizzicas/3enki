'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');

/**
 * notificador-pedidos
 *
 * Escucha pedido.creado (canal web/tienda) y publica telegram.send_message.request
 * al chatId del staff del proyecto. Reemplaza la responsabilidad que tenia
 * whatsapp-bot tras el pivote a Telegram-first para la vertical tienda PWA.
 *
 * Diseño multi-canal: hoy solo Telegram. En v2 se anyade branch para
 * discord.send_message.request cuando discord-service exista — la decision de
 * que canales notificar vive en project.json:
 *   "notificaciones": { "canales": ["telegram", "discord"] }
 */
class NotificadorPedidosModule extends BaseModule {
  constructor() {
    super();
    this.name = 'notificador-pedidos';
    this.version = '1.0.0';

    // project_id -> { project_slug, base_path, telegram: { chatId, botName }, canales: [...] }
    this.projectsConfig = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.eventBus = context.eventBus;
    this.logger.info('notificador-pedidos.loaded', { version: this.version });
  }

  async onUnload() {
    this.projectsConfig.clear();
  }

  // ==========================================
  // Bus subscribers
  // ==========================================

  async onProjectActivated(event) {
    const data = (event && event.data) || event || {};
    const project_id = data.project_id;
    const base_path = data.base_path;
    if (!project_id || !base_path) {
      this.logger.warn('notificador-pedidos.project_activated.invalid', {
        has_project_id: !!project_id,
        has_base_path: !!base_path
      });
      return;
    }
    try {
      const config = await this._readProjectConfig(base_path);
      const slug = data.project_slug || data.project_name || null;
      const entry = {
        project_slug: slug,
        base_path,
        telegram: this._extractTelegramConfig(config),
        canales: this._extractCanales(config)
      };
      this.projectsConfig.set(project_id, entry);
      // Workaround drift project-identity: pedidos/handleCreatePedidoTienda emite
      // pedido.creado con project_id = slug (no UUID). Cacheamos por slug tambien
      // hasta cerrar esa deuda. Ver project-identity.contract trabajo_pendiente.
      if (slug && slug !== project_id) {
        this.projectsConfig.set(slug, entry);
      }
      this.logger.info('notificador-pedidos.project.cached', {
        project_id,
        slug,
        has_telegram_chat_id: !!entry.telegram?.chatId,
        canales: entry.canales
      });
    } catch (err) {
      this.logger.warn('notificador-pedidos.project_activated.config_read_failed', {
        project_id,
        base_path,
        error_message: err && err.message ? err.message : String(err)
      });
    }
  }

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

    const config = this.projectsConfig.get(project_id);
    if (!config) {
      this.logger.warn('notificador-pedidos.pedido_creado.proyecto_sin_config', { project_id, pedido_id: data.pedido_id });
      this._incrementMetric('notificador.pedido.descartado.total', { project: project_id, razon: 'proyecto_sin_config' });
      return;
    }

    const canales = config.canales && config.canales.length > 0 ? config.canales : ['telegram'];

    for (const canal of canales) {
      if (canal === 'telegram') {
        await this._notificarTelegram(config, data, event);
      }
      // canal === 'discord' lo añadiremos cuando discord-service exista (v2).
    }
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
   * Anti-fraude: NO incluye palabra_clave. El dependiente la pregunta al
   * cliente al recoger sin haberla leido antes.
   */
  _formatPedidoMessage(config, pedido) {
    const slug = (config.project_slug || pedido.project_slug || 'pedido').toUpperCase();
    const lines = [
      `Pedido nuevo - ${slug}`,
      `Codigo: ${pedido.codigo_recogida || '(sin codigo)'}`
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
