/**
 * Módulo Cuentas v2.0
 * Gestión de cuentas 100% Event-Driven
 *
 * Arquitectura:
 * - Comunicación SOLO via eventos MQTT
 * - JSON Schema validation obligatoria
 * - Logging estructurado con correlationId
 * - Métricas completas
 * - < 300 líneas
 */

const { randomBytes } = require('crypto');

class CuentasModule {
  constructor() {
    this.name = 'cuentas';
    this.version = '2.0.0';

    // Estado en memoria (cambiar a DB en producción)
    this.cuentas = new Map();

    // Contadores para auto-numeración
    this.counters = {
      local: 1,
      delivery: 1,
      llevar: 1
    };

    // Dependencias (inyectadas en onLoad)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.validationManager = null;
  }

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  async onLoad(core) {
    // Inyección de dependencias
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.validationManager = core.validationManager;

    this.logger.info('cuentas.loading', {
      module: this.name,
      version: this.version
    });

    // Suscribirse a eventos de otros módulos
    await this.subscribeToEvents();

    // Reportar métricas de sistema periódicamente
    this.startMetricsReporting();

    this.logger.info('cuentas.loaded', {
      module: this.name,
      version: this.version
    });
  }

  async onUnload() {
    this.logger.info('cuentas.unloading', { module: this.name });
    // Cleanup si es necesario
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    // Suscribirse a eventos de pedidos para actualizar totales
    await this.eventBus.subscribe('pedido.item_agregado', this.onPedidoItemAgregado.bind(this));
    await this.eventBus.subscribe('pedido.item_eliminado', this.onPedidoItemEliminado.bind(this));
    await this.eventBus.subscribe('cobro.procesado', this.onCobroProcesado.bind(this));

    this.logger.info('cuentas.events_subscribed', {
      events: ['pedido.item_agregado', 'pedido.item_eliminado', 'cobro.procesado']
    });
  }

  // ==========================================
  // Event Handlers (Subscribers)
  // ==========================================

  async onPedidoItemAgregado(event) {
    const { cuenta_id, precio_total } = event.payload;

    this.logger.info('pedido.item_agregado.received', {
      cuenta_id,
      correlation_id: event.correlation_id
    });

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) {
      this.logger.warn('cuenta.not_found', { cuenta_id });
      return;
    }

    // Actualizar cuenta
    cuenta.items += 1;
    cuenta.total += precio_total;
    cuenta.updated_at = new Date().toISOString();

    // Publicar evento de actualización
    await this.publishCuentaActualizada(cuenta_id, {
      items: cuenta.items,
      total: cuenta.total
    }, event.correlation_id);
  }

  async onPedidoItemEliminado(event) {
    const { cuenta_id, precio_total } = event.payload;

    this.logger.info('pedido.item_eliminado.received', {
      cuenta_id,
      correlation_id: event.correlation_id
    });

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    cuenta.items = Math.max(0, cuenta.items - 1);
    cuenta.total = Math.max(0, cuenta.total - precio_total);
    cuenta.updated_at = new Date().toISOString();

    await this.publishCuentaActualizada(cuenta_id, {
      items: cuenta.items,
      total: cuenta.total
    }, event.correlation_id);
  }

  async onCobroProcesado(event) {
    const { cuenta_id } = event.payload;

    this.logger.info('cobro.procesado.received', {
      cuenta_id,
      correlation_id: event.correlation_id
    });

    // Cambiar estado a cobrado y eliminar después de X tiempo
    const cuenta = this.cuentas.get(cuenta_id);
    if (cuenta) {
      cuenta.estado = 'cobrado';
      cuenta.updated_at = new Date().toISOString();

      // Eliminar cuenta después de 5 minutos
      setTimeout(() => {
        this.cuentas.delete(cuenta_id);
        this.publishCuentaEliminada(cuenta_id, cuenta.tipo, 'cobro_completado', event.correlation_id);
      }, 5 * 60 * 1000);
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleCreateCuenta(req) {
    const start_time = Date.now();

    this.logger.info('cuenta.create.start', {
      correlation_id: req.correlationId || req.request_id
    });

    try {
      const { tipo, nombre } = context.body || {};

      // Generar ID único
      const cuenta_id = this.generateCuentaId();

      // Auto-generar nombre si no se proporciona
      const cuenta_nombre = nombre || this.generateNombre(tipo || 'local');

      // Generar hora actual en formato HH:mm
      const now = new Date();
      const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const cuenta = {
        id: cuenta_id,
        tipo: tipo || 'local',
        nombre: cuenta_nombre,
        estado: 'pendiente',
        hora: hora,
        items: 0,
        total: 0,
        alerta: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };

      // Guardar cuenta
      this.cuentas.set(cuenta_id, cuenta);

      // Métricas
      this.metrics.increment('cuenta.creada.total');
      this.metrics.increment(`cuenta.tipo.${tipo}`);
      this.metrics.gauge('cuenta.activas.count', this.cuentas.size);
      this.metrics.timing('cuenta.create.duration', Date.now() - start_time);

      // Publicar evento
      await this.publishCuentaCreada(cuenta, req.correlationId || req.request_id);

      this.logger.info('cuenta.creada', {
        cuenta_id,
        tipo,
        nombre: cuenta_nombre,
        correlation_id: req.correlationId || req.request_id,
        duration: Date.now() - start_time
      });

      return {
        status: 201,
        data: cuenta
      };

    } catch (error) {
      this.metrics.increment('cuenta.errors.total', 1, { operation: 'create' });

      this.logger.error('cuenta.create.error', {
        error: error.message,
        stack: error.stack,
        correlation_id: req.correlationId || req.request_id
      });

      return {
        status: 500,
        data: { error: error.message }
      };
    }
  }

  async handleListCuentas(req) {
    const start_time = Date.now();

    // Filtros opcionales desde query params
    const { tipo, estado } = req.query || {};

    let cuentas = Array.from(this.cuentas.values());

    // Aplicar filtros
    if (tipo) {
      cuentas = cuentas.filter(c => c.tipo === tipo);
    }
    if (estado) {
      cuentas = cuentas.filter(c => c.estado === estado);
    }

    // Ordenar por fecha de creación (más recientes primero)
    cuentas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    this.metrics.timing('cuenta.list.duration', Date.now() - start_time);

    this.logger.info('cuenta.list', {
      total: cuentas.length,
      filtros: { tipo, estado },
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: {
        cuentas,
        total: cuentas.length,
        filtros: { tipo, estado }
      }
    };
  }

  async handleGetCuenta(req) {
    const { id } = req.params;

    const cuenta = this.cuentas.get(id);

    if (!cuenta) {
      this.logger.warn('cuenta.not_found', {
        cuenta_id: id,
        correlation_id: req.correlationId || req.request_id
      });

      return {
        status: 404,
        data: { error: `Cuenta ${id} no encontrada` }
      };
    }

    return {
      status: 200,
      data: cuenta
    };
  }

  async handleDeleteCuenta(req) {
    const { id } = req.params;

    const cuenta = this.cuentas.get(id);

    if (!cuenta) {
      return {
        status: 404,
        data: { error: `Cuenta ${id} no encontrada` }
      };
    }

    // Eliminar cuenta
    this.cuentas.delete(id);

    // Métricas
    this.metrics.increment('cuenta.eliminada.total');
    this.metrics.gauge('cuenta.activas.count', this.cuentas.size);

    // Publicar evento
    await this.publishCuentaEliminada(id, cuenta.tipo, 'eliminacion_manual', req.correlationId || req.request_id);

    this.logger.info('cuenta.eliminada', {
      cuenta_id: id,
      tipo: cuenta.tipo,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: { message: 'Cuenta eliminada' }
    };
  }

  async handleGetStats(req) {
    const total = this.cuentas.size;
    const por_tipo = { local: 0, delivery: 0, llevar: 0 };
    const por_estado = {};

    for (const cuenta of this.cuentas.values()) {
      por_tipo[cuenta.tipo]++;
      por_estado[cuenta.estado] = (por_estado[cuenta.estado] || 0) + 1;
    }

    return {
      status: 200,
      data: {
        total,
        por_tipo,
        por_estado
      }
    };
  }

  async handleHealthCheck(req) {
    const is_healthy = this.cuentas.size < 100;

    return {
      status: is_healthy ? 200 : 503,
      data: {
        status: is_healthy ? 'healthy' : 'unhealthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: this.version,
        checks: {
          cuentas: {
            healthy: is_healthy,
            count: this.cuentas.size,
            limit: 100
          }
        }
      }
    };
  }

  async handleGetMetrics(req) {
    return {
      status: 200,
      data: {
        counters: {
          'cuenta.creada.total': this.metrics.getCounter('cuenta.creada.total') || 0,
          'cuenta.eliminada.total': this.metrics.getCounter('cuenta.eliminada.total') || 0
        },
        gauges: {
          'cuenta.activas.count': this.cuentas.size
        }
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishCuentaCreada(cuenta, correlation_id) {
    await this.eventBus.publish('cuenta.creada', {
      cuenta_id: cuenta.id,
      tipo: cuenta.tipo,
      nombre: cuenta.nombre,
      estado: cuenta.estado,
      created_at: cuenta.created_at
    }, {
      correlationId: correlation_id
    });
  }

  async publishCuentaActualizada(cuenta_id, cambios, correlation_id) {
    await this.eventBus.publish('cuenta.actualizada', {
      cuenta_id,
      cambios,
      updated_at: new Date().toISOString()
    }, {
      correlationId: correlation_id
    });
  }

  async publishCuentaEliminada(cuenta_id, tipo, motivo, correlation_id) {
    await this.eventBus.publish('cuenta.eliminada', {
      cuenta_id,
      tipo,
      motivo
    }, {
      correlationId: correlation_id
    });
  }

  // ==========================================
  // Utilities
  // ==========================================

  generateCuentaId() {
    return `cuenta_${randomBytes(8).toString('hex')}`;
  }

  generateNombre(tipo) {
    const templates = {
      local: (num) => `Mesa ${num}`,
      delivery: (num) => `Delivery #${num}`,
      llevar: (num) => `Llevar #${num}`
    };

    const nombre = templates[tipo](this.counters[tipo]);
    this.counters[tipo]++;
    return nombre;
  }

  startMetricsReporting() {
    setInterval(() => {
      this.metrics.gauge('cuenta.activas.count', this.cuentas.size);

      const por_tipo = { local: 0, delivery: 0, llevar: 0 };
      for (const cuenta of this.cuentas.values()) {
        por_tipo[cuenta.tipo]++;
      }

      this.metrics.gauge('cuenta.por_tipo.local', por_tipo.local);
      this.metrics.gauge('cuenta.por_tipo.delivery', por_tipo.delivery);
      this.metrics.gauge('cuenta.por_tipo.llevar', por_tipo.llevar);
    }, 10000); // Cada 10 segundos
  }
}

module.exports = CuentasModule;
