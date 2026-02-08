/**
 * Módulo Cuentas v2.1
 * Gestión de cuentas 100% Event-Driven
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 */

const crypto = require('crypto');

class CuentasModule {
  constructor() {
    this.name = 'cuentas';
    this.version = '2.1.0';

    // Estado en memoria
    this.cuentas = new Map(); // cuenta_id -> cuenta

    // Contadores para auto-numeración
    this.counters = { local: 1, delivery: 1, llevar: 1 };

    // Timers activos (para cleanup en onUnload)
    this._metricsInterval = null;
    this._pendingTimeouts = new Set();

    // Dependencias (inyectadas en onLoad)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.uiHandler = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    await this.subscribeToEvents();
    this.registerUIHandlers();
    this.startMetricsReporting();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Limpiar interval de métricas
    if (this._metricsInterval) {
      clearInterval(this._metricsInterval);
      this._metricsInterval = null;
    }

    // Limpiar timeouts pendientes (cuentas cobradas esperando eliminación)
    for (const timeout of this._pendingTimeouts) {
      clearTimeout(timeout);
    }
    this._pendingTimeouts.clear();

    // Desregistrar UI handlers
    if (this.uiHandler) {
      const actions = ['list', 'get', 'create', 'delete', 'stats', 'health'];
      for (const action of actions) {
        this.uiHandler.unregister('cuenta', action);
      }
    }

    // Limpiar estado
    this.cuentas.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('cuentas.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('cuenta', 'list', this.handleListCuentas.bind(this));
    this.uiHandler.register('cuenta', 'get', this.handleGetCuenta.bind(this));
    this.uiHandler.register('cuenta', 'create', this.handleCreateCuenta.bind(this));
    this.uiHandler.register('cuenta', 'delete', this.handleDeleteCuenta.bind(this));
    this.uiHandler.register('cuenta', 'stats', this.handleGetStats.bind(this));
    this.uiHandler.register('cuenta', 'health', this.handleHealthCheck.bind(this));

    this.logger.info('cuentas.ui_handlers.registered', {
      handlers: ['list', 'get', 'create', 'delete', 'stats', 'health']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('pedido.item_agregado', this.onPedidoItemAgregado.bind(this));
    await this.eventBus.subscribe('pedido.item_eliminado', this.onPedidoItemEliminado.bind(this));
    await this.eventBus.subscribe('cobro.procesado', this.onCobroProcesado.bind(this));

    this.logger.info('cuentas.events.subscribed', {
      events: ['pedido.item_agregado', 'pedido.item_eliminado', 'cobro.procesado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onPedidoItemAgregado(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id, precio_total } = data;

    this.logger.info('pedido.item_agregado.received', {
      cuenta_id,
      correlation_id: event?.metadata?.correlationId
    });

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) {
      this.logger.warn('cuenta.not_found', { cuenta_id });
      return;
    }

    cuenta.items += 1;
    cuenta.total += precio_total || 0;
    cuenta.updated_at = new Date().toISOString();

    await this.publishCuentaActualizada(cuenta_id, {
      items: cuenta.items,
      total: cuenta.total
    });
  }

  async onPedidoItemEliminado(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id, precio_total } = data;

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    cuenta.items = Math.max(0, cuenta.items - 1);
    cuenta.total = Math.max(0, cuenta.total - (precio_total || 0));
    cuenta.updated_at = new Date().toISOString();

    await this.publishCuentaActualizada(cuenta_id, {
      items: cuenta.items,
      total: cuenta.total
    });
  }

  async onCobroProcesado(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id } = data;

    this.logger.info('cobro.procesado.received', {
      cuenta_id,
      correlation_id: event?.metadata?.correlationId
    });

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    cuenta.estado = 'cobrado';
    cuenta.updated_at = new Date().toISOString();

    // Eliminar cuenta después de 5 minutos (con referencia para cleanup)
    const project_id = cuenta.project_id;
    const timeout = setTimeout(() => {
      this._pendingTimeouts.delete(timeout);
      this.cuentas.delete(cuenta_id);
      this.publishCuentaEliminada(project_id, cuenta_id, cuenta.tipo, 'cobro_completado');
    }, 5 * 60 * 1000);

    this._pendingTimeouts.add(timeout);
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleCreateCuenta(data) {
    const start_time = Date.now();

    try {
      const { project_id, tipo, nombre } = data || {};

      if (!project_id) {
        return { status: 400, error: 'project_id es requerido' };
      }

      const cuenta_id = crypto.randomUUID();
      const tipoFinal = tipo || 'local';
      const cuenta_nombre = nombre || this.generateNombre(tipoFinal);

      const now = new Date();
      const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const cuenta = {
        id: cuenta_id,
        project_id,
        tipo: tipoFinal,
        nombre: cuenta_nombre,
        estado: 'pendiente',
        hora,
        items: 0,
        total: 0,
        alerta: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };

      this.cuentas.set(cuenta_id, cuenta);

      // Métricas (con verificación de existencia)
      this.metrics?.increment?.('cuenta.creada.total');
      this.metrics?.increment?.(`cuenta.tipo.${tipoFinal}`);
      this.metrics?.gauge?.('cuenta.activas.count', this.cuentas.size);
      this.metrics?.timing?.('cuenta.create.duration', Date.now() - start_time);

      await this.publishCuentaCreada(cuenta);

      this.logger.info('cuenta.creada', {
        project_id, cuenta_id, tipo: tipoFinal, nombre: cuenta_nombre, duration: Date.now() - start_time
      });

      return { status: 201, data: cuenta };

    } catch (error) {
      this.metrics?.increment?.('cuenta.errors.total', 1, { operation: 'create' });
      this.logger.error('cuenta.create.error', { error: error.message });
      return { status: 500, error: error.message };
    }
  }

  async handleListCuentas(data) {
    const { project_id, tipo, estado } = data || {};

    let cuentas = Array.from(this.cuentas.values());

    // Filtrar por proyecto
    if (project_id) {
      cuentas = cuentas.filter(c => c.project_id === project_id);
    }
    if (tipo) {
      cuentas = cuentas.filter(c => c.tipo === tipo);
    }
    if (estado) {
      cuentas = cuentas.filter(c => c.estado === estado);
    }

    cuentas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return {
      status: 200,
      data: { cuentas, total: cuentas.length }
    };
  }

  async handleGetCuenta(data) {
    const { project_id, id } = data;
    const cuenta = this.cuentas.get(id);

    if (!cuenta) {
      return { status: 404, error: `Cuenta ${id} no encontrada` };
    }

    // Verificar que pertenece al proyecto (si se especifica)
    if (project_id && cuenta.project_id !== project_id) {
      return { status: 404, error: `Cuenta ${id} no encontrada en proyecto ${project_id}` };
    }

    return { status: 200, data: cuenta };
  }

  async handleDeleteCuenta(data) {
    const { project_id, id } = data;
    const cuenta = this.cuentas.get(id);

    if (!cuenta) {
      return { status: 404, error: `Cuenta ${id} no encontrada` };
    }

    // Verificar que pertenece al proyecto (si se especifica)
    if (project_id && cuenta.project_id !== project_id) {
      return { status: 404, error: `Cuenta ${id} no encontrada en proyecto ${project_id}` };
    }

    this.cuentas.delete(id);

    this.metrics?.increment?.('cuenta.eliminada.total');
    this.metrics?.gauge?.('cuenta.activas.count', this.cuentas.size);

    await this.publishCuentaEliminada(cuenta.project_id, id, cuenta.tipo, 'eliminacion_manual');

    this.logger.info('cuenta.eliminada', { project_id: cuenta.project_id, cuenta_id: id, tipo: cuenta.tipo });

    return { status: 200, data: { message: 'Cuenta eliminada' } };
  }

  async handleGetStats() {
    const total = this.cuentas.size;
    const por_tipo = { local: 0, delivery: 0, llevar: 0 };
    const por_estado = {};

    for (const cuenta of this.cuentas.values()) {
      if (por_tipo[cuenta.tipo] !== undefined) por_tipo[cuenta.tipo]++;
      por_estado[cuenta.estado] = (por_estado[cuenta.estado] || 0) + 1;
    }

    return { status: 200, data: { total, por_tipo, por_estado } };
  }

  async handleHealthCheck() {
    const is_healthy = this.cuentas.size < 100;

    return {
      status: is_healthy ? 200 : 503,
      data: {
        status: is_healthy ? 'healthy' : 'unhealthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: this.version,
        cuentas_activas: this.cuentas.size,
        pending_timeouts: this._pendingTimeouts.size
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishCuentaCreada(cuenta) {
    await this.eventBus.publish('cuenta.creada', {
      project_id: cuenta.project_id,
      cuenta_id: cuenta.id,
      tipo: cuenta.tipo,
      nombre: cuenta.nombre,
      estado: cuenta.estado,
      created_at: cuenta.created_at
    });
  }

  async publishCuentaActualizada(project_id, cuenta_id, cambios) {
    await this.eventBus.publish('cuenta.actualizada', {
      project_id,
      cuenta_id,
      cambios,
      updated_at: new Date().toISOString()
    });
  }

  async publishCuentaEliminada(project_id, cuenta_id, tipo, motivo) {
    await this.eventBus.publish('cuenta.eliminada', {
      project_id,
      cuenta_id,
      tipo,
      motivo
    });
  }

  // ==========================================
  // Helpers
  // ==========================================

  generateNombre(tipo) {
    const templates = {
      local: (num) => `Mesa ${num}`,
      delivery: (num) => `Delivery #${num}`,
      llevar: (num) => `Llevar #${num}`
    };

    const fn = templates[tipo] || templates.local;
    const nombre = fn(this.counters[tipo] || 1);
    this.counters[tipo] = (this.counters[tipo] || 1) + 1;
    return nombre;
  }

  startMetricsReporting() {
    this._metricsInterval = setInterval(() => {
      // Verificar que metrics.gauge existe antes de llamarlo
      if (!this.metrics?.gauge) return;

      this.metrics.gauge('cuenta.activas.count', this.cuentas.size);

      const por_tipo = { local: 0, delivery: 0, llevar: 0 };
      for (const cuenta of this.cuentas.values()) {
        if (por_tipo[cuenta.tipo] !== undefined) por_tipo[cuenta.tipo]++;
      }

      this.metrics.gauge('cuenta.por_tipo.local', por_tipo.local);
      this.metrics.gauge('cuenta.por_tipo.delivery', por_tipo.delivery);
      this.metrics.gauge('cuenta.por_tipo.llevar', por_tipo.llevar);
    }, 10000);
  }
}

module.exports = CuentasModule;
