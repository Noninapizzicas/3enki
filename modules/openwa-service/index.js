/**
 * openwa-service — Transporte WhatsApp SELF-HOSTED vía open-wa (@open-wa/wa-automate).
 *
 * Corre DENTRO del sistema (in-process con el bus). Puente open-wa ↔ bus:
 *   open-wa onMessage           → publish 'whatsapp.entrante' { project_slug, from, body, message_id }
 *   subscribe 'whatsapp.enviar.request' { project_slug, to, text } → client.sendText
 *
 * Una SESIÓN por proyecto (un número de WhatsApp). Login por QR UNA vez (se loguea/emite
 * 'whatsapp.qr'); la sesión se persiste en data/openwa/<session>/ (sobrevive reinicios).
 *
 * NO oficial (automatiza WhatsApp Web): contra los ToS de WhatsApp → riesgo de baneo a nivel
 * PROTOCOLO (no depende de dónde se aloje). Recomendado: número DEDICADO, volumen conversacional.
 *
 * Dependencia: @open-wa/wa-automate (optionalDependencies; lazy-require → si falta, el módulo
 * carga pero queda inerte y lo avisa, sin tumbar el core). Necesita Chromium en el host.
 */

'use strict';

const path = require('path');
const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');

class OpenwaServiceModule extends BaseModule {
  constructor() {
    super();
    this.name = 'openwa-service';
    this.version = '1.0.0';
    this.clients = new Map();   // project_slug -> open-wa client
    this._subs = [];
    this._wa = null;            // @open-wa/wa-automate (lazy)
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = (core.config && core.config['openwa-service']) || core.moduleConfig || {};

    this.sessionsCfg = Array.isArray(this.config.sessions) ? this.config.sessions : [];
    this.dataDir = path.resolve(this.config.data_path || './data/openwa');
    this.headless = this.config.headless !== false;
    this.chromePath = this.config.chrome_path || process.env.CHROME_BIN || undefined;

    // Envío: cualquier módulo publica whatsapp.enviar.request → lo despachamos por open-wa.
    try { this._subs.push(this.eventBus.subscribe('whatsapp.enviar.request', e => this._onEnviar(e))); } catch (_) {}

    // Arranque de sesiones declaradas (best-effort, no bloquea onLoad — el QR puede tardar).
    for (const s of this.sessionsCfg) {
      if (!s || !s.project_slug) continue;
      this._iniciarSesion(s).catch(err =>
        this.logger?.error('openwa.session.start.failed', { project: s.project_slug, error: err.message }));
    }

    this.logger?.info('module.loaded', { module: this.name, version: this.version, sessions: this.sessionsCfg.length });
  }

  async onUnload() {
    for (const u of this._subs) { try { u(); } catch (_) {} }
    this._subs = [];
    for (const [, client] of this.clients) { try { await client.kill?.(); } catch (_) {} }
    this.clients.clear();
    this.logger?.info('module.unloaded', { module: this.name });
  }

  // Lazy-require: si la dependencia no está instalada, el módulo no rompe el core.
  _lazyWa() {
    if (this._wa) return this._wa;
    try { this._wa = require('@open-wa/wa-automate'); }
    catch (err) {
      this.logger?.error('openwa.dependency.missing', { error: err.message, hint: 'npm i @open-wa/wa-automate (+ Chromium en el host)' });
      this._wa = null;
    }
    return this._wa;
  }

  async _iniciarSesion(s) {
    const wa = this._lazyWa();
    if (!wa) return;
    const project_slug = s.project_slug;
    const sessionId = s.session_id || project_slug;
    const create = wa.create || (wa.default && wa.default.create) || wa.default;

    const client = await create({
      sessionId,
      sessionDataPath: path.join(this.dataDir, sessionId),
      headless: this.headless,
      useChrome: true,
      executablePath: this.chromePath,
      multiDevice: true,
      qrTimeout: 0,
      authTimeout: 0,
      disableSpins: true,
      qrLogSkip: false,            // loguea el QR en consola para escanearlo una vez
      // Algunos builds aceptan qrCallback en la config; si no, open-wa loguea el QR igual.
      qrCallback: (qr) => {
        this.logger?.warn('openwa.qr', { project: project_slug, hint: 'escanea el QR (data-uri en el evento whatsapp.qr)' });
        try { this.eventBus.publish('whatsapp.qr', { project_slug, qr, ts: Date.now() }); } catch (_) {}
      }
    });

    this.clients.set(project_slug, client);

    // Recepción 1:1 (los pedidos llegan en chat directo, no en grupos).
    client.onMessage(async (message) => {
      try {
        if (message.fromMe || message.isGroupMsg) return;
        const from = String(message.from || '').replace('@c.us', '');
        if (!from) return;
        await this.eventBus.publish('whatsapp.entrante', {
          project_slug,
          from,
          body: message.body || '',
          message_id: message.id || null,
          ts: Date.now()
        });
        this.metrics?.increment?.('openwa.message.received', { project: project_slug });
      } catch (err) {
        this.logger?.error('openwa.onMessage.error', { project: project_slug, error: err.message });
      }
    });

    // Salud de sesión: avisa de caídas (CONFLICT = abierta en otro sitio, UNPAIRED = deslogueada).
    try {
      client.onStateChanged?.((state) => {
        this.logger?.info('openwa.state', { project: project_slug, state });
        if (['CONFLICT', 'UNLAUNCHED'].includes(state)) { try { client.forceRefocus?.(); } catch (_) {} }
        if (state === 'UNPAIRED') {
          try { this.eventBus.publish('whatsapp.sesion.caida', { project_slug, state, ts: Date.now() }); } catch (_) {}
        }
      });
    } catch (_) {}

    this.logger?.info('openwa.session.ready', { project: project_slug, sessionId });
  }

  async _onEnviar(event) {
    const d = event?.data || event;
    const { project_slug, to, text } = d || {};
    const request_id = d?.request_id;
    const responder = (ok, extra = {}) => {
      try { this.eventBus.publish('whatsapp.enviar.response', { request_id, ok, ...extra }); } catch (_) {}
    };
    try {
      if (!project_slug || !to || !text) return responder(false, { error: 'project_slug, to y text son requeridos' });
      const client = this.clients.get(project_slug);
      if (!client) {
        this.logger?.warn('openwa.send.no_session', { project: project_slug });
        return responder(false, { error: 'sesión open-wa no disponible para el proyecto' });
      }
      const chatId = String(to).includes('@') ? to : `${String(to).replace(/[^0-9]/g, '')}@c.us`;
      await client.sendText(chatId, text);
      this.metrics?.increment?.('openwa.message.sent', { project: project_slug });
      responder(true, { project_slug });
    } catch (err) {
      this.logger?.error('openwa.send.error', { project: project_slug, error: err.message });
      this.metrics?.increment?.('openwa.errors', { kind: 'send' });
      responder(false, { error: err.message });
    }
  }
}

module.exports = OpenwaServiceModule;
