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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');

// Navegadores del sistema donde open-wa puede apoyarse (evita el lío del Chromium de
// puppeteer descargado en el HOME de otro usuario: el servicio corre como www-data).
const CHROME_CANDIDATES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium'
];
function detectarChrome() {
  for (const p of CHROME_CANDIDATES) { try { if (fs.existsSync(p)) return p; } catch (_) {} }
  return undefined;   // sin navegador del sistema → open-wa usará su Chromium bundled (si está)
}

class OpenwaServiceModule extends BaseModule {
  constructor() {
    super();
    this.name = 'openwa-service';
    this.version = '1.0.0';
    this.clients = new Map();   // project_slug -> open-wa client
    this.estados = new Map();    // project_slug -> 'sin_sesion'|'esperando_qr'|'conectado'|'caida'
    this.qrs = new Map();        // project_slug -> data-uri del QR vigente (mientras esperando_qr)
    this._subs = [];
    this._wa = null;            // @open-wa/wa-automate (lazy)
  }

  _setEstado(project_slug, estado) {
    this.estados.set(project_slug, estado);
    if (estado === 'conectado' || estado === 'sin_sesion') this.qrs.delete(project_slug);
    try { this.eventBus.publish('whatsapp.estado', { project_slug, estado, ts: Date.now() }); } catch (_) {}
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = (core.config && core.config['openwa-service']) || core.moduleConfig || {};

    this.sessionsCfg = Array.isArray(this.config.sessions) ? this.config.sessions : [];
    this.dataDir = path.resolve(this.config.data_path || './data/openwa');
    this.headless = this.config.headless !== false;
    this.chromePath = this.config.chrome_path || process.env.CHROME_BIN || detectarChrome();
    if (this.chromePath) this.logger?.info('openwa.chrome.detectado', { path: this.chromePath });
    else this.logger?.warn('openwa.chrome.no_detectado', { hint: 'instala google-chrome-stable o chromium; open-wa intentará su Chromium bundled' });

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
    if (!wa) { this._setEstado(s.project_slug, 'sin_sesion'); return; }
    const project_slug = s.project_slug;
    const sessionId = s.session_id || project_slug;
    this._setEstado(project_slug, 'esperando_qr');
    const create = wa.create || (wa.default && wa.default.create) || wa.default;

    const client = await create({
      sessionId,
      sessionDataPath: path.join(this.dataDir, sessionId),
      headless: this.headless,
      executablePath: this.chromePath,   // undefined → usa el Chromium que trae open-wa
      multiDevice: true,
      qrTimeout: 0,
      authTimeout: 0,
      disableSpins: true,
      qrLogSkip: false,            // loguea el QR en consola para escanearlo una vez
      // Flags imprescindibles en servidor (sin pantalla, usuario de servicio sin user-namespaces).
      chromiumArgs: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
        '--no-first-run', '--no-default-browser-check', '--disable-crash-reporter', '--disable-crashpad'
      ],
      // Algunos builds aceptan qrCallback en la config; si no, open-wa loguea el QR igual.
      qrCallback: (qr) => {
        this.logger?.warn('openwa.qr', { project: project_slug, hint: 'escanea el QR desde el panel WhatsApp (o el data-uri del evento whatsapp.qr)' });
        this.qrs.set(project_slug, qr);                 // cacheado para que el panel lo pida al abrir
        this._setEstado(project_slug, 'esperando_qr');
        try { this.eventBus.publish('whatsapp.qr', { project_slug, qr, ts: Date.now() }); } catch (_) {}
      }
    });

    this.clients.set(project_slug, client);
    this._setEstado(project_slug, 'conectado');         // create() resuelve tras escanear + autenticar

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
        if (state === 'CONNECTED') this._setEstado(project_slug, 'conectado');
        if (state === 'UNPAIRED') {
          this._setEstado(project_slug, 'caida');
          try { this.eventBus.publish('whatsapp.sesion.caida', { project_slug, state, ts: Date.now() }); } catch (_) {}
        }
      });
    } catch (_) {}

    this.logger?.info('openwa.session.ready', { project: project_slug, sessionId });
  }

  // ── ui_handlers (para el panel WhatsApp del frontend) ──

  // Estado de la sesión de un proyecto (+ el QR vigente si está esperando vínculo).
  async handleEstado(data) {
    const project_slug = data?.project_slug;
    if (!project_slug) return { status: 400, error: { code: 'INVALID_INPUT', message: 'project_slug requerido' } };
    const estado = this.estados.get(project_slug) || 'sin_sesion';
    const out = { estado, dependencia_ok: !!this._lazyWa() };
    if (estado === 'esperando_qr' && this.qrs.has(project_slug)) out.qr = this.qrs.get(project_slug);
    return { status: 200, data: out };
  }

  // Vincular / re-vincular: arranca (o rearranca) la sesión → dispara el QR.
  async handleVincular(data) {
    const project_slug = data?.project_slug;
    if (!project_slug) return { status: 400, error: { code: 'INVALID_INPUT', message: 'project_slug requerido' } };
    if (!this._lazyWa()) {
      return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: 'open-wa no instalado en el host (npm i @open-wa/wa-automate)' } };
    }
    const actual = this.clients.get(project_slug);
    if (actual) { try { await actual.kill?.(); } catch (_) {} this.clients.delete(project_slug); }
    this._iniciarSesion({ project_slug }).catch(err =>
      this.logger?.error('openwa.vincular.failed', { project: project_slug, error: err.message }));
    return { status: 202, data: { estado: 'esperando_qr', mensaje: 'Escanea el QR que aparecerá en el panel.' } };
  }

  // Desvincular: cierra la sesión (logout) y limpia.
  async handleDesvincular(data) {
    const project_slug = data?.project_slug;
    if (!project_slug) return { status: 400, error: { code: 'INVALID_INPUT', message: 'project_slug requerido' } };
    const client = this.clients.get(project_slug);
    if (client) { try { await client.logout?.(); } catch (_) {} try { await client.kill?.(); } catch (_) {} }
    this.clients.delete(project_slug);
    this._setEstado(project_slug, 'sin_sesion');
    return { status: 200, data: { estado: 'sin_sesion' } };
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
