/**
 * Módulo Cuentas v2.2
 * Gestión de cuentas 100% Event-Driven
 * Ciclo de vida completo: pendiente → con_pedido → en_preparacion → listo → para_cobrar → cobrado
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Transiciones válidas de estado
const TRANSICIONES_VALIDAS = {
  pendiente: ['con_pedido'],
  con_pedido: ['en_preparacion', 'con_pedido'], // con_pedido→con_pedido: más items sin enviar
  en_preparacion: ['listo', 'en_preparacion'],   // en_preparacion→en_preparacion: nuevo envío parcial
  listo: ['para_cobrar', 'en_preparacion'],       // puede volver a en_preparacion si piden más
  para_cobrar: ['cobrado'],
  cobrado: []
};

// Tiempo (ms) antes de activar alerta en estado pendiente
const ALERTA_PENDIENTE_MS = 30 * 60 * 1000; // 30 minutos

class CuentasModule {
  constructor() {
    this.name = 'cuentas';
    this.version = '2.2.0';

    // Estado en memoria
    this.cuentas = new Map(); // cuenta_id -> cuenta

    // Contadores para auto-numeración
    this.counters = { local: 1, delivery: 1, llevar: 1 };

    // Timers activos (para cleanup en onUnload)
    this._metricsInterval = null;
    this._pendingTimeouts = new Set();
    this._alertaTimers = new Map(); // cuenta_id -> timeout

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

    // Event subscriptions are auto-wired from module.json by the loader.
    // Do NOT subscribe manually here to avoid duplicate handlers.
    this.registerUIHandlers();
    this.startMetricsReporting();

    // Restaurar cuentas activas desde persistencia (sobrevive reinicio servidor)
    await this.restaurarDesdeArchivo();

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

    // Limpiar timers de alerta
    for (const timeout of this._alertaTimers.values()) {
      clearTimeout(timeout);
    }
    this._alertaTimers.clear();

    // Desregistrar UI handlers
    if (this.uiHandler) {
      const actions = ['list', 'get', 'create', 'delete', 'stats', 'health', 'metrics'];
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
    this.uiHandler.register('cuenta', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('cuentas.ui_handlers.registered', {
      handlers: ['list', 'get', 'create', 'delete', 'stats', 'health', 'metrics']
    });
  }

  // ==========================================
  // State Machine
  // ==========================================

  /**
   * Transiciona el estado de una cuenta si la transición es válida.
   * Publica cuenta.estado_cambiado y cuenta.actualizada.
   * Retorna true si la transición se ejecutó.
   */
  async transicionarEstado(cuenta_id, estado_nuevo) {
    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return false;

    const estado_anterior = cuenta.estado;

    // No hacer nada si ya está en ese estado (excepto re-entradas válidas)
    if (estado_anterior === estado_nuevo && !TRANSICIONES_VALIDAS[estado_anterior]?.includes(estado_nuevo)) {
      return false;
    }

    // Validar transición
    const transiciones = TRANSICIONES_VALIDAS[estado_anterior];
    if (!transiciones || !transiciones.includes(estado_nuevo)) {
      this.logger.warn('cuenta.transicion_invalida', {
        cuenta_id, estado_anterior, estado_nuevo
      });
      return false;
    }

    cuenta.estado = estado_nuevo;
    cuenta.updated_at = new Date().toISOString();

    // Gestionar timer de alerta según el nuevo estado
    this.gestionarAlerta(cuenta_id, estado_nuevo);

    this.logger.info('cuenta.estado_cambiado', {
      cuenta_id, estado_anterior, estado_nuevo
    });

    this.metrics?.increment?.('cuenta.transicion.total');

    await this.publishEstadoCambiado(cuenta.project_id, cuenta_id, estado_anterior, estado_nuevo);
    await this.publishCuentaActualizada(cuenta.project_id, cuenta_id, {
      estado: estado_nuevo
    });

    return true;
  }

  /**
   * Gestiona el timer de alerta visual.
   * Se activa en 'pendiente' tras ALERTA_PENDIENTE_MS sin actividad.
   * Se cancela cuando la cuenta progresa a otro estado.
   */
  gestionarAlerta(cuenta_id, estado) {
    // Cancelar timer anterior si existe
    const timerAnterior = this._alertaTimers.get(cuenta_id);
    if (timerAnterior) {
      clearTimeout(timerAnterior);
      this._alertaTimers.delete(cuenta_id);
    }

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    // Desactivar alerta si la cuenta progresa
    if (estado !== 'pendiente' && cuenta.alerta) {
      cuenta.alerta = false;
      this.publishCuentaActualizada(cuenta.project_id, cuenta_id, { alerta: false });
    }

    // Activar timer solo en estado pendiente
    if (estado === 'pendiente') {
      const timer = setTimeout(() => {
        this._alertaTimers.delete(cuenta_id);
        const c = this.cuentas.get(cuenta_id);
        if (c && c.estado === 'pendiente') {
          c.alerta = true;
          c.updated_at = new Date().toISOString();
          this.logger.warn('cuenta.alerta.activada', { cuenta_id });
          this.publishCuentaActualizada(c.project_id, cuenta_id, { alerta: true });
        }
      }, ALERTA_PENDIENTE_MS);
      this._alertaTimers.set(cuenta_id, timer);
    }
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  /**
   * comandero.item_agregado → pendiente→con_pedido (primer item) o actualizar totales
   */
  async onComanderoItemAgregado(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id, precio_total } = data;

    this.logger.info('comandero.item_agregado.received', {
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

    // Transicionar a con_pedido si es el primer item
    if (cuenta.estado === 'pendiente') {
      await this.transicionarEstado(cuenta_id, 'con_pedido');
    } else {
      await this.publishCuentaActualizada(cuenta.project_id, cuenta_id, {
        items: cuenta.items,
        total: cuenta.total
      });
    }
  }

  /**
   * comandero.item_eliminado → actualizar totales, volver a pendiente si items=0
   */
  async onComanderoItemEliminado(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id, precio_total } = data;

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    cuenta.items = Math.max(0, cuenta.items - 1);
    cuenta.total = Math.max(0, cuenta.total - (precio_total || 0));
    cuenta.updated_at = new Date().toISOString();

    // Si se quedó sin items y estaba en con_pedido, volver a pendiente
    if (cuenta.items === 0 && cuenta.estado === 'con_pedido') {
      cuenta.estado = 'pendiente';
      this.gestionarAlerta(cuenta_id, 'pendiente');
      await this.publishEstadoCambiado(cuenta.project_id, cuenta_id, 'con_pedido', 'pendiente');
    }

    await this.publishCuentaActualizada(cuenta.project_id, cuenta_id, {
      items: cuenta.items,
      total: cuenta.total
    });
  }

  /**
   * comandero.enviar_cocina → con_pedido→en_preparacion (o listo→en_preparacion si piden más)
   */
  async onComanderoEnviarCocina(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id } = data;

    this.logger.info('comandero.enviar_cocina.received', {
      cuenta_id,
      correlation_id: event?.metadata?.correlationId
    });

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    if (cuenta.estado === 'con_pedido' || cuenta.estado === 'listo') {
      await this.transicionarEstado(cuenta_id, 'en_preparacion');
    }
  }

  /**
   * cocina.pedido_listo → en_preparacion→listo
   */
  async onCocinaPedidoListo(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id } = data;

    this.logger.info('cocina.pedido_listo.received', {
      cuenta_id,
      correlation_id: event?.metadata?.correlationId
    });

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    if (cuenta.estado === 'en_preparacion') {
      await this.transicionarEstado(cuenta_id, 'listo');
    }
  }

  /**
   * cobro.iniciado → listo→para_cobrar
   */
  async onCobroIniciado(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id } = data;

    this.logger.info('cobro.iniciado.received', {
      cuenta_id,
      correlation_id: event?.metadata?.correlationId
    });

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    if (cuenta.estado === 'listo') {
      await this.transicionarEstado(cuenta_id, 'para_cobrar');
    }
  }

  /**
   * cobro.procesado → para_cobrar→cobrado + auto-eliminación a los 5 min
   */
  async onCobroProcesado(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id } = data;

    this.logger.info('cobro.procesado.received', {
      cuenta_id,
      correlation_id: event?.metadata?.correlationId
    });

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    const estado_anterior = cuenta.estado;
    cuenta.estado = 'cobrado';
    cuenta.updated_at = new Date().toISOString();

    // Cancelar alerta si existía
    this.gestionarAlerta(cuenta_id, 'cobrado');

    await this.publishEstadoCambiado(cuenta.project_id, cuenta_id, estado_anterior, 'cobrado');

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

      // Iniciar timer de alerta para cuentas pendientes
      this.gestionarAlerta(cuenta_id, 'pendiente');

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

    // Limpiar timer de alerta si existía
    const alertaTimer = this._alertaTimers.get(id);
    if (alertaTimer) {
      clearTimeout(alertaTimer);
      this._alertaTimers.delete(id);
    }

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
        pending_timeouts: this._pendingTimeouts.size,
        alerta_timers: this._alertaTimers.size
      }
    };
  }

  async handleGetMetrics() {
    const por_estado = {};
    const por_tipo = { local: 0, delivery: 0, llevar: 0 };
    let alertas_activas = 0;

    for (const cuenta of this.cuentas.values()) {
      por_estado[cuenta.estado] = (por_estado[cuenta.estado] || 0) + 1;
      if (por_tipo[cuenta.tipo] !== undefined) por_tipo[cuenta.tipo]++;
      if (cuenta.alerta) alertas_activas++;
    }

    return {
      status: 200,
      data: {
        cuentas_activas: this.cuentas.size,
        por_estado,
        por_tipo,
        alertas_activas,
        pending_timeouts: this._pendingTimeouts.size,
        alerta_timers: this._alertaTimers.size,
        timestamp: new Date().toISOString()
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

  async publishEstadoCambiado(project_id, cuenta_id, estado_anterior, estado_nuevo) {
    await this.eventBus.publish('cuenta.estado_cambiado', {
      project_id,
      cuenta_id,
      estado_anterior,
      estado_nuevo,
      changed_at: new Date().toISOString()
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
  // Restauración desde persistencia
  // ==========================================

  /**
   * Lee cuentas_activas.json y repuebla el Map en memoria.
   * Se ejecuta en onLoad para sobrevivir reinicios del servidor.
   */
  async restaurarDesdeArchivo() {
    try {
      const archivo = path.join('./data/current', 'cuentas_activas.json');
      const contenido = await fs.readFile(archivo, 'utf8');
      const datos = JSON.parse(contenido);

      if (!datos.cuentas || Object.keys(datos.cuentas).length === 0) return;

      let restauradas = 0;
      for (const [cuenta_id, cp] of Object.entries(datos.cuentas)) {
        // Mapear estado de persistencia → estado de cuentas
        let estado = 'pendiente';
        if (cp.pedidos && cp.pedidos.length > 0) {
          estado = 'con_pedido';
        }

        // Contar items totales de todos los pedidos
        let itemsCount = 0;
        if (cp.pedidos && Array.isArray(cp.pedidos)) {
          for (const p of cp.pedidos) {
            if (p.items && Array.isArray(p.items)) {
              itemsCount += p.items.reduce((sum, i) => sum + (i.cantidad || 1), 0);
            }
          }
        }

        // Formatear hora
        let hora = '--:--';
        try {
          const d = new Date(cp.created_at);
          hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        } catch (_) { /* ignore */ }

        const cuenta = {
          id: cuenta_id,
          project_id: cp.project_id || null,
          tipo: cp.tipo || 'local',
          nombre: cp.datos_especificos?.nombre || cp.tipo || 'Cuenta',
          estado,
          hora,
          items: itemsCount,
          total: cp.total || 0,
          alerta: false,
          created_at: cp.created_at || new Date().toISOString(),
          updated_at: cp.updated_at || cp.created_at || new Date().toISOString()
        };

        this.cuentas.set(cuenta_id, cuenta);
        restauradas++;
      }

      this.metrics?.gauge?.('cuenta.activas.count', this.cuentas.size);

      this.logger.info('cuentas.estado_restaurado', {
        cuentas_restauradas: restauradas
      });
    } catch (error) {
      // No hay archivo o está vacío — arranque limpio
      if (error.code !== 'ENOENT') {
        this.logger.warn('cuentas.restaurar.error', { error: error.message });
      }
    }
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
      if (!this.metrics?.gauge) return;

      this.metrics.gauge('cuenta.activas.count', this.cuentas.size);

      const por_tipo = { local: 0, delivery: 0, llevar: 0 };
      const por_estado = { pendiente: 0, con_pedido: 0, en_preparacion: 0, listo: 0, para_cobrar: 0, cobrado: 0 };
      let alertas = 0;

      for (const cuenta of this.cuentas.values()) {
        if (por_tipo[cuenta.tipo] !== undefined) por_tipo[cuenta.tipo]++;
        if (por_estado[cuenta.estado] !== undefined) por_estado[cuenta.estado]++;
        if (cuenta.alerta) alertas++;
      }

      this.metrics.gauge('cuenta.por_tipo.local', por_tipo.local);
      this.metrics.gauge('cuenta.por_tipo.delivery', por_tipo.delivery);
      this.metrics.gauge('cuenta.por_tipo.llevar', por_tipo.llevar);
      this.metrics.gauge('cuenta.por_estado.pendiente', por_estado.pendiente);
      this.metrics.gauge('cuenta.por_estado.con_pedido', por_estado.con_pedido);
      this.metrics.gauge('cuenta.por_estado.en_preparacion', por_estado.en_preparacion);
      this.metrics.gauge('cuenta.por_estado.listo', por_estado.listo);
      this.metrics.gauge('cuenta.por_estado.para_cobrar', por_estado.para_cobrar);
      this.metrics.gauge('cuenta.por_estado.cobrado', por_estado.cobrado);
      this.metrics.gauge('cuenta.alertas.count', alertas);
    }, 10000);
  }
}

module.exports = CuentasModule;
