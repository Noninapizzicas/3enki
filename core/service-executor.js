/**
 * Service Executor
 *
 * Ejecuta llamadas a servicios via eventos request/response.
 * Inyecta project_id automáticamente según el scope.
 *
 * @example
 * const executor = new ServiceExecutor(eventBus, logger);
 * const result = await executor.call('local.google-vision', 'extract', { image: '/path/to/img.png' });
 */

const crypto = require('crypto');

class ServiceExecutor {
  constructor(eventBus, logger) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.pending = new Map();

    // Suscribirse a respuestas genéricas
    this.setupResponseListeners();
  }

  setupResponseListeners() {
    // Escuchar todas las respuestas de servicios
    this.eventBus.subscribe('#', (event, topic) => {
      if (!topic.endsWith('.response')) return;

      const requestId = event.request_id;
      if (!requestId || !this.pending.has(requestId)) return;

      const { resolve, reject } = this.pending.get(requestId);
      this.pending.delete(requestId);

      if (event.success === false || event.error) {
        reject(new Error(event.error || 'Service error'));
      } else {
        resolve(event);
      }
    });
  }

  /**
   * Llama a un servicio
   *
   * @param {string} service - Nombre del servicio (ej: 'local.google-vision')
   * @param {string} action - Acción a ejecutar (ej: 'extract')
   * @param {Object} params - Parámetros para el servicio
   * @param {Object} options - Opciones adicionales
   * @param {number} options.timeout - Timeout en ms (default: 60000)
   * @param {string} options.projectId - Project ID para credenciales
   * @returns {Promise<Object>}
   */
  async call(service, action, params = {}, options = {}) {
    const { timeout = 60000, projectId = null } = options;

    const requestId = crypto.randomUUID();
    const requestEvent = `${service}.${action}.request`;

    // Construir payload
    const payload = {
      request_id: requestId,
      ...params
    };

    // Inyectar project_id si existe (para resolución de credenciales)
    if (projectId) {
      payload.project_id = projectId;
    }

    return new Promise((resolve, reject) => {
      // Timeout
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Timeout: ${service}.${action} after ${timeout}ms`));
      }, timeout);

      // Guardar pending con cleanup de timer
      this.pending.set(requestId, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });

      // Publicar request
      this.eventBus.publish(requestEvent, payload);

      this.logger?.debug('service.call', {
        requestId,
        service,
        action,
        projectId
      });
    });
  }

  /**
   * Crea un executor con scope de proyecto fijo
   *
   * @param {string} projectId - ID del proyecto
   * @returns {Object} - Executor con project_id inyectado
   */
  scoped(projectId) {
    return {
      call: (service, action, params = {}, options = {}) => {
        return this.call(service, action, params, { ...options, projectId });
      }
    };
  }
}

module.exports = ServiceExecutor;
