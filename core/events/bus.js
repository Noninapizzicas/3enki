/**
 * Event Bus - EventEmitter wrapper con integración MQTT
 *
 * Provee un event bus híbrido:
 * - Local: EventEmitter para eventos en el mismo core
 * - Distribuido: MQTT para eventos entre cores
 *
 * @example
 * const EventBus = require('./events/bus');
 *
 * const bus = new EventBus({
 *   coreId: 'core-a',
 *   mqtt: mqttClient,
 *   hooks: hookManager,
 *   logger
 * });
 *
 * // Emitir localmente
 * bus.emit('user.created', { id: 123 });
 *
 * // Emitir a core remoto
 * bus.emitTo('core-b', 'user.created', { id: 123 });
 *
 * // Escuchar eventos
 * bus.on('user.created', (event) => {
 *   console.log('User created:', event.data);
 * });
 */

const { EventEmitter } = require('events');
const EventEnvelope = require('./envelope');
const { topics } = require('../mqtt');

class EventBus extends EventEmitter {
  /**
   * @param {Object} options - Opciones
   * @param {string} options.coreId - ID del core
   * @param {Object} options.mqtt - Cliente MQTT
   * @param {Object} options.hooks - Hook manager
   * @param {Object} options.logger - Logger instance
   * @param {Object} options.metrics - Metrics instance
   * @param {Object} options.tracer - Tracer instance
   */
  constructor(options = {}) {
    super();

    this.coreId = options.coreId || 'unknown';
    this.mqtt = options.mqtt || null;
    this.hooks = options.hooks || null;
    this.logger = options.logger || null;
    this.metrics = options.metrics || null;
    this.tracer = options.tracer || null;

    // Suscribirse a eventos de otros cores si MQTT está disponible
    if (this.mqtt) {
      this.setupMQTTSubscriptions();
    }
  }

  /**
   * Configura las suscripciones MQTT para recibir eventos de otros cores
   */
  async setupMQTTSubscriptions() {
    try {
      // Suscribirse a eventos dirigidos a este core
      await this.mqtt.subscribe(`core/${this.coreId}/events/#`);

      // Suscribirse a broadcasts (eventos a todos los cores)
      await this.mqtt.subscribe('core/*/events/#');

      // Handler de mensajes MQTT
      this.mqtt.on('message', async (topic, message) => {
        // Solo procesar eventos, no otros tipos de mensajes
        if (!topic.includes('/events/')) {
          return;
        }

        try {
          // Deserializar envelope
          const envelope = typeof message === 'string'
            ? EventEnvelope.deserialize(message)
            : message;

          // Validar envelope
          if (!EventEnvelope.validate(envelope)) {
            if (this.logger) {
              this.logger.warn('event.invalid', {
                topic,
                reason: 'invalid_envelope'
              });
            }
            return;
          }

          // Ignorar eventos emitidos por este mismo core (para evitar loops)
          if (envelope.source.core_id === this.coreId) {
            return;
          }

          // Ejecutar hooks afterEventReceive
          if (this.hooks) {
            const context = await this.hooks.execute('afterEventReceive', {
              event: envelope,
              topic
            });

            // Si hook bloqueó el evento, no emitir
            if (context === null) {
              if (this.logger) {
                this.logger.debug('event.blocked', {
                  event_type: envelope.event_type,
                  reason: 'hook'
                });
              }

              if (this.metrics) {
                this.metrics.increment('events.blocked');
              }

              return;
            }

            // Usar envelope modificado por hooks si cambió
            if (context.event) {
              this.emitLocal(context.event.event_type, context.event);
            } else {
              this.emitLocal(envelope.event_type, envelope);
            }
          } else {
            this.emitLocal(envelope.event_type, envelope);
          }

          if (this.metrics) {
            this.metrics.increment('events.received');
          }

        } catch (error) {
          if (this.logger) {
            this.logger.error('event.receive.failed', {
              topic,
              error: error.message
            }, error);
          }

          if (this.metrics) {
            this.metrics.increment('events.receive.failed');
          }
        }
      });

      if (this.logger) {
        this.logger.info('eventbus.mqtt.subscribed', {
          core_id: this.coreId
        });
      }

    } catch (error) {
      if (this.logger) {
        this.logger.error('eventbus.mqtt.setup.failed', {
          error: error.message
        }, error);
      }
    }
  }

  /**
   * Emite un evento localmente (solo EventEmitter)
   *
   * @param {string} eventType - Tipo de evento
   * @param {Object} envelope - Event envelope
   */
  emitLocal(eventType, envelope) {
    super.emit(eventType, envelope);

    if (this.logger) {
      this.logger.debug('event.emitted.local', {
        event_type: eventType,
        event_id: envelope.event_id
      });
    }
  }

  /**
   * Emite un evento (local + MQTT si está configurado)
   *
   * @param {string} eventType - Tipo de evento (ej: 'user.created')
   * @param {*} data - Payload del evento
   * @param {Object} options - Opciones
   * @param {string} options.targetCoreId - Core destino (opcional, si no se pone es broadcast)
   * @param {string} options.moduleId - ID del módulo emisor
   * @param {number} options.qos - QoS MQTT (0, 1, 2)
   * @param {boolean} options.retain - Retain flag MQTT
   * @returns {Promise<void>}
   *
   * @example
   * // Emitir localmente y a todos los cores
   * await bus.emit('user.created', { id: 123 });
   *
   * // Emitir solo a un core específico
   * await bus.emit('user.created', { id: 123 }, { targetCoreId: 'core-b' });
   */
  async emit(eventType, data, options = {}) {
    // Crear envelope
    const envelope = EventEnvelope.create(eventType, data, {
      coreId: this.coreId,
      moduleId: options.moduleId,
      tracer: this.tracer,
      metadata: options.metadata
    });

    // Ejecutar hooks beforeEventPublish
    let finalEnvelope = envelope;
    if (this.hooks) {
      const context = await this.hooks.execute('beforeEventPublish', {
        eventType,
        data: envelope.data,
        options,
        envelope
      });

      // Si hook bloqueó el evento, no publicar
      if (context === null) {
        if (this.logger) {
          this.logger.debug('event.blocked', {
            event_type: eventType,
            reason: 'hook'
          });
        }

        if (this.metrics) {
          this.metrics.increment('events.blocked');
        }

        return;
      }

      // Usar envelope modificado por hooks
      if (context.envelope) {
        finalEnvelope = context.envelope;
      }
    }

    // 1. Emitir localmente
    this.emitLocal(eventType, finalEnvelope);

    // 2. Publicar a MQTT si está configurado
    if (this.mqtt && this.mqtt.isConnected) {
      try {
        const topic = options.targetCoreId
          ? topics.event(options.targetCoreId, eventType)
          : topics.event('*', eventType); // Broadcast

        await this.mqtt.publish(topic, finalEnvelope, {
          qos: options.qos || 1,
          retain: options.retain || false
        });

        if (this.logger) {
          this.logger.debug('event.published', {
            event_type: eventType,
            event_id: finalEnvelope.event_id,
            target: options.targetCoreId || 'broadcast'
          });
        }

        if (this.metrics) {
          this.metrics.increment('events.published');
        }

      } catch (error) {
        if (this.logger) {
          this.logger.error('event.publish.failed', {
            event_type: eventType,
            error: error.message
          }, error);
        }

        if (this.metrics) {
          this.metrics.increment('events.publish.failed');
        }

        throw error;
      }
    }
  }

  /**
   * Emite un evento a un core específico
   *
   * @param {string} targetCoreId - Core destino
   * @param {string} eventType - Tipo de evento
   * @param {*} data - Payload
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<void>}
   *
   * @example
   * await bus.emitTo('core-b', 'user.created', { id: 123 });
   */
  async emitTo(targetCoreId, eventType, data, options = {}) {
    return this.emit(eventType, data, {
      ...options,
      targetCoreId
    });
  }

  /**
   * Escucha un tipo de evento
   *
   * @param {string} eventType - Tipo de evento
   * @param {Function} handler - Handler function
   * @returns {Function} Unsubscribe function
   *
   * @example
   * const unsubscribe = bus.on('user.created', (event) => {
   *   console.log('User created:', event.data);
   * });
   *
   * // Más tarde...
   * unsubscribe();
   */
  on(eventType, handler) {
    super.on(eventType, handler);

    // Retornar función de unsubscribe
    return () => {
      this.off(eventType, handler);
    };
  }

  /**
   * Escucha un tipo de evento una sola vez
   *
   * @param {string} eventType - Tipo de evento
   * @param {Function} handler - Handler function
   * @returns {Promise} Promise que se resuelve con el evento
   *
   * @example
   * const event = await bus.once('user.created');
   * console.log('User created:', event.data);
   */
  once(eventType, handler) {
    if (handler) {
      super.once(eventType, handler);
    } else {
      // Si no hay handler, retornar Promise
      return new Promise((resolve) => {
        super.once(eventType, resolve);
      });
    }
  }

  /**
   * Obtiene estadísticas del event bus
   *
   * @returns {Object} Estadísticas
   */
  getStats() {
    return {
      core_id: this.coreId,
      listeners: this.eventNames().reduce((acc, eventType) => {
        acc[eventType] = this.listenerCount(eventType);
        return acc;
      }, {}),
      mqtt_connected: this.mqtt ? this.mqtt.isConnected : false
    };
  }
}

module.exports = EventBus;
