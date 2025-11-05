/**
 * Echo Module
 *
 * Módulo de ejemplo que:
 * - Expone APIs HTTP (/ping, /echo)
 * - Se suscribe a eventos echo.*
 * - Registra hooks para logging
 * - Publica eventos en respuesta
 *
 * @example
 * // En core:
 * const loader = new ModuleLoader({ modulesPath: './modules', core });
 * await loader.load('echo', './modules/echo', manifest);
 */

class EchoModule {
  constructor() {
    this.core = null;
    this.stats = {
      requests: 0,
      events_received: 0,
      events_published: 0,
      hooks_executed: 0
    };
  }

  /**
   * Lifecycle: onLoad
   * Se ejecuta cuando el módulo es cargado
   *
   * @param {Object} core - Core instance con { logger, metrics, hooks, events, mqtt }
   */
  async onLoad(core) {
    this.core = core;

    const logger = core.logger;
    if (logger) {
      logger.info('echo.module.loading', {
        module: 'echo',
        version: '1.0.0'
      });
    }

    // Registrar hooks
    if (core.hooks) {
      core.hooks.register('beforeEventPublish', async (context) => {
        this.stats.hooks_executed++;

        if (logger) {
          logger.debug('echo.hook.beforePublish', {
            event_type: context.eventType,
            has_data: !!context.data
          });
        }

        // No modificar nada, solo observar
        return context;
      });
    }

    // Suscribirse a eventos via EventBus
    if (core.events) {
      core.events.on('echo.ping', async (envelope) => {
        this.stats.events_received++;

        if (logger) {
          logger.info('echo.event.received', {
            event_id: envelope.event_id,
            event_type: envelope.event_type,
            data: envelope.data
          });
        }

        // Responder con evento echo.pong
        await core.events.emit('echo.pong', {
          original_event_id: envelope.event_id,
          message: 'pong',
          timestamp: Date.now()
        });

        this.stats.events_published++;
      });

      core.events.on('echo.message', async (envelope) => {
        this.stats.events_received++;

        if (logger) {
          logger.info('echo.message.received', {
            event_id: envelope.event_id,
            message: envelope.data.message
          });
        }

        // Echo back el mensaje
        await core.events.emit('echo.reply', {
          original_event_id: envelope.event_id,
          original_message: envelope.data.message,
          reply: `Echo: ${envelope.data.message}`,
          timestamp: Date.now()
        });

        this.stats.events_published++;
      });
    }

    // Incrementar métricas
    if (core.metrics) {
      core.metrics.increment('echo.module.loaded');
    }

    if (logger) {
      logger.info('echo.module.loaded', {
        apis: 2,
        hooks: 1,
        subscriptions: 2
      });
    }
  }

  /**
   * Lifecycle: onUnload
   * Se ejecuta cuando el módulo es descargado
   */
  async onUnload() {
    if (this.core && this.core.logger) {
      this.core.logger.info('echo.module.unloading', {
        stats: this.stats
      });
    }

    // Cleanup: remover listeners
    if (this.core && this.core.events) {
      this.core.events.removeAllListeners('echo.ping');
      this.core.events.removeAllListeners('echo.message');
    }
  }

  /**
   * API: GET /ping
   * Health check endpoint
   *
   * @param {Object} req - Request { method, path, query, body, headers, request_id }
   * @returns {Promise<Object>} Response data
   */
  async handlePing(req) {
    this.stats.requests++;

    if (this.core && this.core.metrics) {
      this.core.metrics.increment('echo.api.ping');
    }

    return {
      message: 'pong',
      module: 'echo',
      version: '1.0.0',
      request_id: req.request_id,
      timestamp: Date.now(),
      stats: this.stats
    };
  }

  /**
   * API: POST /echo
   * Echo back request body
   *
   * @param {Object} req - Request { method, path, query, body, headers, request_id }
   * @returns {Promise<Object>} Response data
   */
  async handleEcho(req) {
    this.stats.requests++;

    if (this.core && this.core.logger) {
      this.core.logger.debug('echo.api.echo', {
        request_id: req.request_id,
        body: req.body
      });
    }

    if (this.core && this.core.metrics) {
      this.core.metrics.increment('echo.api.echo');
    }

    // Publicar evento
    if (this.core && this.core.events) {
      await this.core.events.emit('echo.api.called', {
        endpoint: '/echo',
        body: req.body,
        request_id: req.request_id
      });
      this.stats.events_published++;
    }

    return {
      echo: req.body,
      request_id: req.request_id,
      timestamp: Date.now()
    };
  }

  /**
   * Obtiene estadísticas del módulo
   *
   * @returns {Object} Stats
   */
  getStats() {
    return { ...this.stats };
  }
}

module.exports = EchoModule;
