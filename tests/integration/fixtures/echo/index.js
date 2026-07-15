/**
 * Echo — módulo fixture para el test de integración full-stack.
 *
 * NO es un módulo de producción: vive bajo tests/integration/fixtures/ para que
 * el ModuleLoader real (que escanea modules/) nunca lo descubra ni lo cargue.
 *
 * Cumple el contrato que tests/integration/full-stack.test.js exige:
 *   - Al cargarse: incrementa la métrica `echo.module.loaded`.
 *   - APIs: handlePing (GET /ping), handleEcho (POST /echo) — el loader las
 *     wirea desde module.json.provides.apis (name -> handle<Name>).
 *   - Hook `beforeEventPublish`: declarado en module.json.provides.hooks.
 *   - Bus: reacciona a `echo.ping` -> `echo.pong` y a `echo.message` ->
 *     `echo.reply` con `{ reply: 'Echo: ' + message }`.
 *
 * El core de test inyecta el EventBus como `context.events` (no `eventBus`),
 * por eso las suscripciones se hacen a mano en onLoad y se limpian en onUnload
 * (el auto-wiring del loader usa core.eventBus, ausente en este test).
 */

'use strict';

class EchoModule {
  constructor() {
    this.name = 'echo';
    this.version = '1.0.0';

    this.events = null;
    this.metrics = null;
    this.logger = null;

    // Handlers bindeados guardados para poder desuscribir en onUnload.
    this._onEchoPing = null;
    this._onEchoMessage = null;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async onLoad(context) {
    this.events = context.events || context.eventBus || null;
    this.metrics = context.metrics || null;
    this.logger = context.logger || null;

    // Métrica requerida por el test: echo.module.loaded >= 1
    if (this.metrics) {
      this.metrics.increment('echo.module.loaded');
    }

    // Suscripciones a eventos del bus.
    if (this.events) {
      this._onEchoPing = this.handleEchoPingEvent.bind(this);
      this._onEchoMessage = this.handleEchoMessageEvent.bind(this);
      this.events.on('echo.ping', this._onEchoPing);
      this.events.on('echo.message', this._onEchoMessage);
    }

    if (this.logger) {
      this.logger.info('echo.loaded', { module: this.name, version: this.version });
    }
  }

  async onUnload() {
    if (this.events) {
      if (this._onEchoPing) this.events.off('echo.ping', this._onEchoPing);
      if (this._onEchoMessage) this.events.off('echo.message', this._onEchoMessage);
    }
    this._onEchoPing = null;
    this._onEchoMessage = null;

    if (this.logger) {
      this.logger.info('echo.unloaded', { module: this.name });
    }
  }

  // ---------------------------------------------------------------------------
  // HTTP APIs — wireadas desde module.json.provides.apis (name -> handle<Name>).
  // El gateway invoca handler({ method, path, query, body, headers, ... }).
  // ---------------------------------------------------------------------------

  async handlePing() {
    return { message: 'pong', module: 'echo' };
  }

  async handleEcho(req) {
    const body = req && req.body !== undefined ? req.body : null;
    return { echo: body };
  }

  // ---------------------------------------------------------------------------
  // Bus handlers — reciben el envelope { data, ... } del EventBus.
  // ---------------------------------------------------------------------------

  async handleEchoPingEvent() {
    if (!this.events) return;
    await this.events.emit('echo.pong', { module: this.name, timestamp: Date.now() });
  }

  async handleEchoMessageEvent(envelope) {
    if (!this.events) return;
    const data = (envelope && envelope.data !== undefined) ? envelope.data : envelope;
    const message = data && data.message !== undefined ? data.message : '';
    await this.events.emit('echo.reply', { reply: 'Echo: ' + message });
  }
}

module.exports = EchoModule;
