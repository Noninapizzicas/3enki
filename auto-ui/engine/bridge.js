/**
 * Auto-UI Bridge
 *
 * Puente bidireccional entre MQTT y SSE para real-time UI updates
 */

const { UI } = require('../../core/constants');

class Bridge {
  constructor(options = {}) {
    this.mqttClient = options.mqttClient;
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;

    // SSE connections
    this.clients = new Set();

    // Subscripciones MQTT
    this.subscriptions = new Map();

    // Buffer de eventos para reconexiones
    this.eventBuffer = [];
    this.maxBufferSize = 100;
  }

  // ==========================================
  // SSE Connection Management
  // ==========================================

  /**
   * Conecta un cliente SSE
   */
  connect(req, res) {
    // Headers SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Enviar evento de conexión
    this.sendToClient(res, {
      type: UI.EVENTS.SSE_CONNECTED,
      timestamp: new Date().toISOString()
    });

    // Registrar cliente
    this.clients.add(res);

    this.logger.info('[Bridge] SSE client connected. Total:', this.clients.size);

    // Cleanup on disconnect
    req.on('close', () => {
      this.clients.delete(res);
      this.logger.info('[Bridge] SSE client disconnected. Total:', this.clients.size);
    });

    // Keep-alive ping cada 30s
    const keepAlive = setInterval(() => {
      if (!this.clients.has(res)) {
        clearInterval(keepAlive);
        return;
      }
      res.write(':ping\n\n');
    }, 30000);
  }

  /**
   * Envía evento a un cliente específico
   */
  sendToClient(res, event) {
    try {
      const data = typeof event === 'string' ? event : JSON.stringify(event);
      res.write(`data: ${data}\n\n`);
    } catch (error) {
      this.logger.error('[Bridge] Failed to send to client:', error.message);
      this.clients.delete(res);
    }
  }

  /**
   * Broadcast evento a todos los clientes SSE
   */
  broadcast(event) {
    const data = typeof event === 'string' ? event : JSON.stringify(event);

    // Buffer para reconexiones
    this.bufferEvent(event);

    // Enviar a todos los clientes
    for (const client of this.clients) {
      try {
        client.write(`data: ${data}\n\n`);
      } catch (error) {
        this.logger.error('[Bridge] Broadcast error:', error.message);
        this.clients.delete(client);
      }
    }

    this.logger.info('[Bridge] Broadcast event:', event.type, 'to', this.clients.size, 'clients');
  }

  /**
   * Guarda evento en buffer
   */
  bufferEvent(event) {
    this.eventBuffer.push({
      ...event,
      _timestamp: Date.now()
    });

    // Limitar tamaño
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }
  }

  /**
   * Obtiene eventos desde timestamp
   */
  getEventsSince(timestamp) {
    return this.eventBuffer.filter(e => e._timestamp > timestamp);
  }

  // ==========================================
  // MQTT Subscriptions
  // ==========================================

  /**
   * Suscribe a eventos MQTT y los reenvía por SSE
   */
  async subscribeToMQTT(patterns = []) {
    if (!this.eventBus) {
      this.logger.warn('[Bridge] No eventBus configured');
      return;
    }

    // Patrones por defecto: todos los eventos de módulos
    const defaultPatterns = [
      '*.created',
      '*.updated',
      '*.deleted',
      '*.estado_cambiado',
      'ui.*'
    ];

    const allPatterns = [...new Set([...defaultPatterns, ...patterns])];

    for (const pattern of allPatterns) {
      try {
        await this.eventBus.subscribe(pattern, (event) => {
          this.onMQTTEvent(pattern, event);
        });

        this.subscriptions.set(pattern, true);
        this.logger.info('[Bridge] Subscribed to:', pattern);
      } catch (error) {
        this.logger.error('[Bridge] Subscription error:', pattern, error.message);
      }
    }
  }

  /**
   * Handler para eventos MQTT
   */
  onMQTTEvent(pattern, event) {
    // Transformar evento para SSE
    const sseEvent = this.transformEvent(event);

    // Broadcast a clientes SSE
    this.broadcast(sseEvent);
  }

  /**
   * Transforma evento MQTT a formato SSE
   */
  transformEvent(mqttEvent) {
    const payload = mqttEvent.payload || mqttEvent;
    const topic = mqttEvent.topic || '';

    // Extraer tipo de evento
    let type = topic;
    if (payload.event) type = payload.event;
    if (payload.type) type = payload.type;

    // Construir evento SSE
    const sseEvent = {
      type,
      data: payload.data || payload,
      timestamp: payload.timestamp || new Date().toISOString(),
      correlationId: payload.correlationId || mqttEvent.correlationId
    };

    // Añadir toast si corresponde
    sseEvent.toast = this.getToastForEvent(type, payload);

    return sseEvent;
  }

  /**
   * Determina si mostrar toast para un evento
   */
  getToastForEvent(type, payload) {
    // Mapeo de eventos a toasts
    const toastMap = {
      created: { message: 'Registro creado', type: 'success' },
      updated: { message: 'Registro actualizado', type: 'info' },
      deleted: { message: 'Registro eliminado', type: 'warning' },
      error: { message: payload.message || 'Error', type: 'danger' }
    };

    // Buscar coincidencia
    for (const [key, toast] of Object.entries(toastMap)) {
      if (type.includes(key)) {
        return toast;
      }
    }

    return null;
  }

  // ==========================================
  // Emit events
  // ==========================================

  /**
   * Emite un evento (MQTT + SSE)
   */
  async emit(type, data, options = {}) {
    const event = {
      type,
      data,
      timestamp: new Date().toISOString(),
      correlationId: options.correlationId || this.generateId()
    };

    // Publicar en MQTT si está disponible
    if (this.eventBus) {
      try {
        await this.eventBus.publish(type, data, options);
      } catch (error) {
        this.logger.error('[Bridge] MQTT publish error:', error.message);
      }
    }

    // Broadcast por SSE
    this.broadcast(event);

    return event;
  }

  // ==========================================
  // Utilities
  // ==========================================

  /**
   * Genera ID único
   */
  generateId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      sseClients: this.clients.size,
      mqttSubscriptions: this.subscriptions.size,
      bufferedEvents: this.eventBuffer.length
    };
  }

  /**
   * Cierra todas las conexiones
   */
  close() {
    // Cerrar SSE clients
    for (const client of this.clients) {
      try {
        client.end();
      } catch (e) {
        // Ignore
      }
    }
    this.clients.clear();

    // Limpiar buffer
    this.eventBuffer = [];

    this.logger.info('[Bridge] Closed');
  }
}

module.exports = Bridge;
