'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');

/**
 * bienvenida-tienda
 *
 * Cara cliente del bot del negocio. Responde con saludo + link a la PWA
 * cuando el cliente final escribe al bot por primera vez.
 *
 * Filtro clave: si el mensaje viene del chat del staff (chatId == staff_chat_id),
 * NO responde — ese chat lo gestiona notificador-pedidos en sentido inverso
 * (cuando hay pedido, staff recibe ping desde aqui). Sin filtro caeriamos en
 * ruido cuando el staff escribe al bot por su grupo.
 *
 * Multi-canal preparado: cuando discord-service exista, anyadir handler
 * onDiscordMessageReceived simétrico.
 */
class BienvenidaTiendaModule extends BaseModule {
  constructor() {
    super();
    this.name = 'bienvenida-tienda';
    this.version = '1.0.0';

    // botName -> { project_id, project_slug, pwa_url, mensaje_bienvenida, staff_chat_id }
    this.botsConfig = new Map();
    // project_id -> botName (para limpieza al desactivar proyecto)
    this.projectToBotName = new Map();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.eventBus = context.eventBus;
    this.logger.info('bienvenida-tienda.loaded', { version: this.version });
  }

  async onUnload() {
    this.botsConfig.clear();
    this.projectToBotName.clear();
  }

  // ==========================================
  // Bus subscribers
  // ==========================================

  async onProjectActivated(event) {
    const data = (event && event.data) || event || {};
    const project_id = data.project_id;
    const base_path = data.base_path;
    if (!project_id || !base_path) return;
    try {
      const config = await this._readProjectConfig(base_path);
      const tg = config && config.telegram;
      const botName = tg && (tg.botName || tg.bot_name);
      if (!botName || String(botName).startsWith('<PENDIENTE')) {
        this.logger.info('bienvenida-tienda.project.sin_bot', { project_id });
        return;
      }
      const pwaUrl = this._resolvePwaUrl(config, data.project_slug || this._slugFromBasePath(base_path));
      const staffChatId = this._numericOrNull(tg.chatId != null ? tg.chatId : tg.chat_id);
      const mensaje = this._resolveMensajeBienvenida(config, pwaUrl);
      this.botsConfig.set(botName, {
        project_id,
        project_slug: data.project_slug || this._slugFromBasePath(base_path),
        pwa_url: pwaUrl,
        mensaje_bienvenida: mensaje,
        staff_chat_id: staffChatId
      });
      this.projectToBotName.set(project_id, botName);
      this.logger.info('bienvenida-tienda.bot.registrado', {
        project_id,
        botName,
        pwa_url: pwaUrl,
        has_staff_chat_id: staffChatId != null
      });
    } catch (err) {
      this.logger.warn('bienvenida-tienda.project_activated.config_read_failed', {
        project_id,
        error_message: err && err.message ? err.message : String(err)
      });
    }
  }

  async onTelegramTextReceived(event) {
    const data = (event && event.data) || event || {};
    await this._handleIncoming(data, 'text');
  }

  async onTelegramCommandReceived(event) {
    const data = (event && event.data) || event || {};
    const command = data.command || (data.text && data.text.split(' ')[0]) || '';
    const trigger = command === '/start' ? 'command_start' : 'command_otro';
    await this._handleIncoming(data, trigger);
  }

  // ==========================================
  // Lógica central
  // ==========================================

  async _handleIncoming(data, trigger) {
    const { botName, chatId } = data;
    if (!botName || chatId == null) return;
    const cfg = this.botsConfig.get(botName);
    if (!cfg) {
      this._incrementMetric('bienvenida.descartado.total', { project: 'unknown', razon: 'bot_no_registrado' });
      return;
    }
    this._incrementMetric('bienvenida.mensaje.recibido.total', { project: cfg.project_slug || 'unknown' });

    // Filtro: si el mensaje viene del chat del staff, NO responder.
    if (cfg.staff_chat_id != null && Number(chatId) === cfg.staff_chat_id) {
      this._incrementMetric('bienvenida.descartado.total', { project: cfg.project_slug || 'unknown', razon: 'chat_es_staff' });
      return;
    }

    try {
      await this.eventBus.publish('telegram.send_message.request', {
        request_id: crypto.randomUUID(),
        botName,
        chatId: Number(chatId),
        text: cfg.mensaje_bienvenida,
        correlation_id: crypto.randomUUID()
      });
      this._incrementMetric('bienvenida.respondido.total', { project: cfg.project_slug || 'unknown', trigger });
      this.logger.info('bienvenida-tienda.respondido', {
        project_slug: cfg.project_slug,
        botName,
        chatId: Number(chatId),
        trigger
      });
    } catch (err) {
      this.logger.warn('bienvenida-tienda.publish_failed', {
        project_slug: cfg.project_slug,
        error_message: err && err.message ? err.message : String(err)
      });
    }
  }

  // ==========================================
  // Helpers privados
  // ==========================================

  async _readProjectConfig(base_path) {
    const configPath = path.join(base_path, 'config', 'project.json');
    const raw = await fs.readFile(configPath, 'utf8');
    return JSON.parse(raw);
  }

  /**
   * Resuelve la URL pública de la PWA del proyecto.
   *   1) Si project.www.public_url está declarado → dominio + ese path (modelo www: /<ns>/<slug>).
   *   2) Si project.tienda.pwa_url está declarado → usar (legacy).
   *   3) Si project.pwa_url está declarado → usar.
   *   4) Default: `https://enki-ai.online/<ns>/<slug>/` (namespace público global, ver lib/public-ns.js).
   */
  _resolvePwaUrl(config, slug) {
    if (config && config.www && typeof config.www.public_url === 'string') {
      return `https://enki-ai.online${config.www.public_url.replace(/\/?$/, '/')}`;
    }
    if (config && config.tienda && typeof config.tienda.pwa_url === 'string') return config.tienda.pwa_url;
    if (config && typeof config.pwa_url === 'string') return config.pwa_url;
    let ns = 'a';
    try { ns = require('../../../lib/public-ns.js').publicNs(); } catch (_) { /* default 'a' */ }
    return `https://enki-ai.online/${ns}/${encodeURIComponent(slug || '')}/`;
  }

  _resolveMensajeBienvenida(config, pwaUrl) {
    // Override declarativo opcional en project.json.
    if (config && config.tienda && typeof config.tienda.mensaje_bienvenida === 'string') {
      return config.tienda.mensaje_bienvenida;
    }
    const marca = (config && config.tienda && config.tienda.marca) || config && config.name || 'la tienda';
    return [
      `Hola — bienvenido a ${marca}.`,
      '',
      'Aquí tienes nuestro catálogo online:',
      pwaUrl,
      '',
      'Elige los productos, completa tus datos y te avisamos cuando esté listo.',
      'Recogida y pago en el local.'
    ].join('\n');
  }

  _slugFromBasePath(base_path) {
    if (!base_path) return '';
    return path.basename(String(base_path));
  }

  _numericOrNull(v) {
    if (v == null) return null;
    if (typeof v === 'string' && v.startsWith('<PENDIENTE')) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _incrementMetric(name, labels) {
    if (this.metrics && typeof this.metrics.increment === 'function') {
      try { this.metrics.increment(name, labels); } catch (_) { /* ignore */ }
    }
  }
}

module.exports = BienvenidaTiendaModule;
