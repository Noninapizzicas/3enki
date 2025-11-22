/**
 * Módulo de Métricas
 *
 * Módulo centralizado para captura y exposición de métricas del sistema.
 * Escucha TODOS los eventos mediante patrones wildcard y genera métricas automáticamente.
 *
 * @module metricas
 * @version 1.0.0
 */

class MetricasModule {
  constructor() {
    this.name = 'metricas';
    this.version = '1.0.0';

    // Estado - Métricas almacenadas
    this.counters = new Map();        // Map<string, number>
    this.gauges = new Map();          // Map<string, number>
    this.timings = [];                // Array<{event_type, duration, timestamp, correlation_id}>
    this.eventMetrics = new Map();    // Map<string, {total, ultimo}>

    // Configuración
    this.maxTimingsStored = 1000;
    this.snapshotInterval = 10000;    // 10 segundos
    this.snapshotTimer = null;
    this.startTime = Date.now();

    // Dependencias (inyectadas en onLoad)
    this.logger = null;
    this.eventBus = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.eventBus = core.eventBus;

    this.logger.info('metricas.loading', {
      module: this.name,
      version: this.version
    });

    // Suscribirse a eventos mediante patrones wildcard
    await this.subscribeToEvents();

    // Inicializar gauges del sistema
    this.initializeSystemGauges();

    // Iniciar timer de snapshots periódicos
    this.startSnapshotTimer();

    this.logger.info('metricas.loaded', {
      module: this.name,
      snapshot_interval: this.snapshotInterval
    });
  }

  async onUnload() {
    this.logger.info('metricas.unloading', {
      module: this.name,
      counters_total: this.counters.size,
      gauges_total: this.gauges.size,
      timings_total: this.timings.length
    });

    // Limpiar timer
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }

    // Publicar último snapshot antes de cerrar
    await this.publishSnapshot();
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    // Suscribirse a patrones de eventos
    await this.eventBus.subscribe('*.creado', this.onEntityCreated.bind(this));
    await this.eventBus.subscribe('*.actualizado', this.onEntityUpdated.bind(this));
    await this.eventBus.subscribe('*.eliminado', this.onEntityDeleted.bind(this));
    await this.eventBus.subscribe('*.error', this.onError.bind(this));
    await this.eventBus.subscribe('*.completado', this.onOperationCompleted.bind(this));

    this.logger.info('metricas.suscripciones.registradas', {
      patrones: ['*.creado', '*.actualizado', '*.eliminado', '*.error', '*.completado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onEntityCreated(envelope) {
    try {
      const eventType = envelope.event_type;

      if (!eventType) {
        this.logger.warn('metricas.evento.invalid', {
          reason: 'Missing event_type',
          event_id: envelope.event_id
        });
        return;
      }

      // Incrementar counter general
      this.incrementCounter(`${eventType}.total`);

      // Extraer dominio (ej: "producto" de "producto.creado")
      const domain = eventType.split('.')[0];
      if (domain) {
        this.incrementCounter(`${domain}.creado.total`);
      }

      // Actualizar métricas de evento
      this.updateEventMetric(eventType);

      // Extraer timing si existe en metadata
      if (envelope.metadata?.duration) {
        this.recordTiming(eventType, envelope.metadata.duration, envelope.metadata?.correlationId);
      }

      this.logger.debug('metricas.evento.procesado', {
        event_type: eventType,
        event_id: envelope.event_id,
        correlation_id: envelope.metadata?.correlationId
      });

    } catch (error) {
      this.logger.error('metricas.onEntityCreated.error', {
        error: error.message,
        event_id: envelope.event_id,
        stack: error.stack
      });
    }
  }

  async onEntityUpdated(envelope) {
    try {
      const eventType = envelope.event_type;

      if (!eventType) {
        this.logger.warn('metricas.evento.invalid', {
          reason: 'Missing event_type',
          event_id: envelope.event_id
        });
        return;
      }

      this.incrementCounter(`${eventType}.total`);

      const domain = eventType.split('.')[0];
      if (domain) {
        this.incrementCounter(`${domain}.actualizado.total`);
      }

      this.updateEventMetric(eventType);

      if (envelope.metadata?.duration) {
        this.recordTiming(eventType, envelope.metadata.duration, envelope.metadata?.correlationId);
      }

    } catch (error) {
      this.logger.error('metricas.onEntityUpdated.error', {
        error: error.message,
        event_id: envelope.event_id
      });
    }
  }

  async onEntityDeleted(envelope) {
    try {
      const eventType = envelope.event_type;

      if (!eventType) {
        return;
      }

      this.incrementCounter(`${eventType}.total`);

      const domain = eventType.split('.')[0];
      if (domain) {
        this.incrementCounter(`${domain}.eliminado.total`);
      }

      this.updateEventMetric(eventType);

    } catch (error) {
      this.logger.error('metricas.onEntityDeleted.error', {
        error: error.message,
        event_id: envelope.event_id
      });
    }
  }

  async onError(envelope) {
    try {
      const eventType = envelope.event_type;

      if (!eventType) {
        return;
      }

      // Incrementar counter de errores globales
      this.incrementCounter('errores.total');

      // Incrementar counter específico del evento
      this.incrementCounter(`${eventType}.total`);

      const domain = eventType.split('.')[0];
      if (domain) {
        this.incrementCounter(`${domain}.error.total`);
      }

      this.updateEventMetric(eventType);

      this.logger.warn('metricas.error.registrado', {
        event_type: eventType,
        event_id: envelope.event_id
      });

    } catch (error) {
      this.logger.error('metricas.onError.error', {
        error: error.message,
        event_id: envelope.event_id
      });
    }
  }

  async onOperationCompleted(envelope) {
    try {
      const eventType = envelope.event_type;

      if (!eventType) {
        return;
      }

      this.incrementCounter(`${eventType}.total`);

      const domain = eventType.split('.')[0];
      if (domain) {
        this.incrementCounter(`${domain}.completado.total`);
      }

      this.updateEventMetric(eventType);

      if (envelope.metadata?.duration) {
        this.recordTiming(eventType, envelope.metadata.duration, envelope.metadata?.correlationId);
      }

    } catch (error) {
      this.logger.error('metricas.onOperationCompleted.error', {
        error: error.message,
        event_id: envelope.event_id
      });
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleGetAllMetrics(req, context) {
    try {
      const uptime = (Date.now() - this.startTime) / 1000;

      // Actualizar gauges del sistema antes de retornar
      this.updateSystemGauges();

      const data = {
        counters: Object.fromEntries(this.counters),
        gauges: Object.fromEntries(this.gauges),
        timings: this.timings.slice(-100), // Últimos 100
        timestamp: new Date().toISOString(),
        uptime
      };

      this.logger.info('metricas.all.obtenidas', {
        counters_count: this.counters.size,
        gauges_count: this.gauges.size,
        timings_count: this.timings.length,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data
      };

    } catch (error) {
      this.logger.error('metricas.getAll.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: { error: 'Error interno del servidor' }
      };
    }
  }

  async handleGetCounters(req, context) {
    try {
      const data = {
        counters: Object.fromEntries(this.counters),
        total: this.counters.size,
        timestamp: new Date().toISOString()
      };

      return {
        status: 200,
        data
      };

    } catch (error) {
      this.logger.error('metricas.getCounters.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: { error: 'Error interno del servidor' }
      };
    }
  }

  async handleGetGauges(req, context) {
    try {
      // Actualizar gauges antes de retornar
      this.updateSystemGauges();

      const data = {
        gauges: Object.fromEntries(this.gauges),
        total: this.gauges.size,
        timestamp: new Date().toISOString()
      };

      return {
        status: 200,
        data
      };

    } catch (error) {
      this.logger.error('metricas.getGauges.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: { error: 'Error interno del servidor' }
      };
    }
  }

  async handleGetTimings(req, context) {
    try {
      const limit = parseInt(req.query?.limit) || 100;

      const data = {
        timings: this.timings.slice(-limit),
        count: this.timings.length,
        timestamp: new Date().toISOString()
      };

      return {
        status: 200,
        data
      };

    } catch (error) {
      this.logger.error('metricas.getTimings.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: { error: 'Error interno del servidor' }
      };
    }
  }

  async handleGetEventMetrics(req, context) {
    try {
      const data = {
        eventos: Object.fromEntries(this.eventMetrics),
        timestamp: new Date().toISOString()
      };

      return {
        status: 200,
        data
      };

    } catch (error) {
      this.logger.error('metricas.getEventMetrics.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: { error: 'Error interno del servidor' }
      };
    }
  }

  async handleResetMetrics(req, context) {
    try {
      const countersCount = this.counters.size;
      const gaugesCount = this.gauges.size;
      const timingsCount = this.timings.length;

      // Resetear métricas
      this.counters.clear();
      this.gauges.clear();
      this.timings = [];
      this.eventMetrics.clear();

      // Reinicializar gauges del sistema
      this.initializeSystemGauges();

      this.logger.warn('metricas.reset', {
        counters_cleared: countersCount,
        gauges_cleared: gaugesCount,
        timings_cleared: timingsCount,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          message: 'Métricas reseteadas correctamente',
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      this.logger.error('metricas.reset.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: { error: 'Error interno del servidor' }
      };
    }
  }

  async handleHealthCheck(req, context) {
    const uptime = (Date.now() - this.startTime) / 1000;

    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime,
        timestamp: new Date().toISOString(),
        metrics_count: {
          counters: this.counters.size,
          gauges: this.gauges.size,
          timings: this.timings.length
        }
      }
    };
  }

  // ==========================================
  // Métodos Internos
  // ==========================================

  incrementCounter(name) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + 1);
  }

  updateEventMetric(eventType) {
    const current = this.eventMetrics.get(eventType) || { total: 0, ultimo: null };
    this.eventMetrics.set(eventType, {
      total: current.total + 1,
      ultimo: new Date().toISOString()
    });
  }

  recordTiming(eventType, duration, correlationId) {
    const timing = {
      event_type: eventType,
      duration,
      timestamp: new Date().toISOString(),
      correlation_id: correlationId
    };

    this.timings.push(timing);

    // Mantener solo los últimos N timings
    if (this.timings.length > this.maxTimingsStored) {
      this.timings.shift();
    }
  }

  initializeSystemGauges() {
    this.gauges.set('sistema.uptime', 0);
    this.gauges.set('metricas.counters.count', 0);
    this.gauges.set('metricas.timings.count', 0);
  }

  updateSystemGauges() {
    const uptime = (Date.now() - this.startTime) / 1000;
    this.gauges.set('sistema.uptime', uptime);
    this.gauges.set('metricas.counters.count', this.counters.size);
    this.gauges.set('metricas.timings.count', this.timings.length);
  }

  // ==========================================
  // Snapshot Timer
  // ==========================================

  startSnapshotTimer() {
    this.snapshotTimer = setInterval(async () => {
      await this.publishSnapshot();
    }, this.snapshotInterval);
  }

  async publishSnapshot() {
    try {
      this.updateSystemGauges();

      await this.eventBus.publish('metricas.snapshot', {
        counters: Object.fromEntries(this.counters),
        gauges: Object.fromEntries(this.gauges),
        timestamp: new Date().toISOString(),
        uptime: (Date.now() - this.startTime) / 1000
      }, {
        correlationId: `snapshot_${Date.now()}`
      });

      this.logger.debug('metricas.snapshot.publicado', {
        counters_count: this.counters.size,
        gauges_count: this.gauges.size
      });

    } catch (error) {
      this.logger.error('metricas.snapshot.error', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = MetricasModule;
