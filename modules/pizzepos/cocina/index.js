/**
 * Módulo Cocina v3.0
 * Display de cocina en tiempo real con tracking item a item
 *
 * Sistema de pases:
 *   - Cada item tiene un contador 'pase' que empieza en 0
 *   - General (pase 0): pendiente → preparando → completa pase (pase++)
 *   - Horno (pase 1): item llega ya como preparando, 1 tap → listo (pase++), imprime ticket
 *   - Cada estación filtra por pase: general ve pase=0, horno ve pase=1
 *   - Sistema extensible: más estaciones = más pases
 *
 * Multi-dispositivo:
 *   - Cada dispositivo se registra con register-device y recibe un color único
 *   - Cada dispositivo puede filtrar por familias/categorías (client-side)
 *   - Al preparar un item, se registra device_id → color en el item
 *
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 */

const fs = require('fs').promises;
const path = require('path');

// Tipos de estación: el pase es un contador acumulativo del item, no de la estación.
// Cada estación filtra por el pase mínimo que necesita para mostrar el item.
// General: pase_minimo=0 (items nuevos), Horno: pase_minimo=1 (ya pasaron por general).
const TIPOS_ESTACION = {
  general: {
    id: 'general',
    nombre: 'General',
    descripcion: 'Preparación/montaje — items nuevos (pase 0)',
    pase_minimo: 0,
    comportamientos: {
      imprime_al_completar: false,
      auto_preparar: false
    }
  },
  horno: {
    id: 'horno',
    nombre: 'Horno',
    descripcion: 'Horneado — auto-inicia, 1 tap imprime y completa',
    pase_minimo: 1,
    comportamientos: {
      imprime_al_completar: true,
      auto_preparar: true
    }
  }
};

class CocinaModule {
  constructor() {
    this.name = 'cocina';
    this.version = '3.1.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;
    this.validator = null;

    // Estado en memoria
    this.pedidosActivos = new Map(); // pedido_id -> pedido_cocina
    this.historial = []; // últimos 50 pedidos completados
    this.maxHistorial = 50;

    // Snapshot persistente (sobrevive reinicios del servidor preservando
    // estado real de cada item: pase, fases, estado, device_id).
    // Es la fuente de verdad; cuentas_activas.json es solo fallback legacy.
    this._snapshotFile = null; // se asigna en onLoad
    this._snapshotSaveTimer = null;

    // Cache de ref_display de cuenta (cuenta_id → ref_display canónico)
    this.cuentaNombres = new Map();

    // Rolling average tiempos preparación (últimos 100)
    this.tiemposPreparacion = [];

    // Tipos de estación: predefinidos + custom
    this.tiposEstacion = { ...TIPOS_ESTACION };

    // Dispositivos de cocina registrados
    this.devices = new Map();

    // Paleta de colores para dispositivos (alta visibilidad sobre fondo oscuro)
    this.DEVICE_COLORS = [
      '#3b82f6', // blue
      '#f97316', // orange
      '#a855f7', // purple
      '#14b8a6', // teal
      '#f43f5e', // rose
      '#84cc16', // lime
      '#06b6d4', // cyan
      '#e879f9', // fuchsia
    ];
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.validator = core.validationManager || null;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // Registrar schemas de validación
    this.registerSchemas();

    // Event subscriptions are auto-wired from module.json by the loader.
    this.registerUIHandlers();

    // Restaurar pedidos: snapshot propio si existe (preserva pase/fases/estado),
    // si no, fallback a cuentas_activas.json que reconstruye como pendientes.
    this._snapshotFile = path.join('.', 'data', 'current', 'cocina_snapshot.json');
    const restoredFromSnapshot = await this._restaurarSnapshot();
    if (!restoredFromSnapshot) {
      await this.restaurarDesdeArchivo();
    }

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Flush final del snapshot (cancela debounce y guarda ya)
    if (this._snapshotSaveTimer) {
      clearTimeout(this._snapshotSaveTimer);
      this._snapshotSaveTimer = null;
      try { await this._saveSnapshot(); } catch (_) { /* ignore */ }
    }

    // Desregistrar UI handlers
    if (this.uiHandler) {
      const actions = [
        'list-active', 'get', 'history', 'prepare-item',
        'mark-ready', 'health', 'metrics',
        'register-device', 'unregister-device', 'list-devices', 'list-station-types',
        'list-displays'
      ];
      for (const action of actions) {
        this.uiHandler.unregister('cocina', action);
      }
    }

    // Limpiar estado
    this.pedidosActivos.clear();
    this.historial = [];
    this.tiemposPreparacion = [];
    this.devices.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Snapshot persistente
  // ==========================================

  /**
   * Guarda el snapshot de pedidosActivos con debounce (1s).
   * Se llama tras cualquier mutación del Map (nuevo pedido, tap item,
   * cancelar, marcar listo).
   */
  _saveSnapshotDebounced() {
    if (this._snapshotSaveTimer) clearTimeout(this._snapshotSaveTimer);
    if (!this._snapshotFile) return;
    this._snapshotSaveTimer = setTimeout(() => this._saveSnapshot(), 1000);
  }

  async _saveSnapshot() {
    if (!this._snapshotFile) return;
    // Escritura atomica: write-to-tmp + rename. Evita snapshots corruptos
    // si el proceso muere mid-write (el rename es atomico en POSIX/NTFS).
    const tmpFile = `${this._snapshotFile}.tmp`;
    try {
      await fs.mkdir(path.dirname(this._snapshotFile), { recursive: true });
      const snapshot = {
        _saved_at: new Date().toISOString(),
        pedidos: Object.fromEntries(this.pedidosActivos)
      };
      await fs.writeFile(tmpFile, JSON.stringify(snapshot));
      await fs.rename(tmpFile, this._snapshotFile);
    } catch (err) {
      this.logger?.warn?.('cocina.snapshot.save_error', { error: err.message });
      // Best-effort cleanup del tmp si rename no llego a ejecutarse
      try { await fs.unlink(tmpFile); } catch (_) { /* ignore */ }
    }
  }

  /**
   * Restaura pedidosActivos desde el snapshot propio de cocina.
   * Preserva estado real (pase, fases, estado, device_id, preparando_at).
   * Devuelve true si restauró algo, false si no existe o está vacío.
   */
  async _restaurarSnapshot() {
    try {
      const contenido = await fs.readFile(this._snapshotFile, 'utf8');
      const snapshot = JSON.parse(contenido);
      if (!snapshot.pedidos || Object.keys(snapshot.pedidos).length === 0) {
        return false;
      }

      for (const [pedido_id, pedido] of Object.entries(snapshot.pedidos)) {
        this.pedidosActivos.set(pedido_id, pedido);
      }

      this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);
      this.logger.info('cocina.snapshot_restaurado', {
        pedidos_restaurados: this.pedidosActivos.size,
        saved_at: snapshot._saved_at
      });
      return true;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger?.warn?.('cocina.snapshot.load_error', { error: err.message });
      }
      return false;
    }
  }

  // ==========================================
  // Validation Schemas
  // ==========================================

  registerSchemas() {
    if (!this.validator) return;

    this.validator.registerSchema('cocina.register-device', {
      type: 'object',
      required: ['device_id'],
      properties: {
        device_id: { type: 'string', minLength: 1 },
        nombre: { type: 'string' },
        estacion: { type: 'string' },
        filtros: {
          type: 'object',
          properties: {
            familias: { type: 'array', items: { type: 'string' } }
          }
        },
        tipo_estacion: { type: 'string' }
      }
    });

    this.validator.registerSchema('cocina.prepare-item', {
      type: 'object',
      required: ['item_id'],
      properties: {
        item_id: { type: 'string', minLength: 1 },
        device_id: { type: 'string' }
      }
    });

    this.validator.registerSchema('cocina.mark-ready', {
      type: 'object',
      required: ['pedido_id'],
      properties: {
        pedido_id: { type: 'string', minLength: 1 }
      }
    });

    this.validator.registerSchema('cocina.get', {
      type: 'object',
      required: ['pedido_id'],
      properties: {
        pedido_id: { type: 'string', minLength: 1 }
      }
    });

    this.logger.info('cocina.schemas.registered', { count: 4 });
  }

  validateInput(schemaId, data) {
    if (!this.validator) return null;
    const result = this.validator.validate(schemaId, data);
    if (!result.valid) {
      return { status: 400, error: 'Validación fallida', validation_errors: result.errors };
    }
    return null;
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('cocina.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('cocina', 'list-active', this.handleGetActivos.bind(this));
    this.uiHandler.register('cocina', 'get', this.handleGetPedido.bind(this));
    this.uiHandler.register('cocina', 'history', this.handleGetHistorial.bind(this));
    this.uiHandler.register('cocina', 'prepare-item', this.handlePrepararItem.bind(this));
    this.uiHandler.register('cocina', 'mark-ready', this.handleMarcarListo.bind(this));
    this.uiHandler.register('cocina', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('cocina', 'metrics', this.handleGetMetrics.bind(this));
    this.uiHandler.register('cocina', 'register-device', this.handleRegisterDevice.bind(this));
    this.uiHandler.register('cocina', 'unregister-device', this.handleUnregisterDevice.bind(this));
    this.uiHandler.register('cocina', 'list-devices', this.handleListDevices.bind(this));
    this.uiHandler.register('cocina', 'list-station-types', this.handleListTiposEstacion.bind(this));
    this.uiHandler.register('cocina', 'list-displays', this.handleListarDisplays.bind(this));

    this.logger.info('cocina.ui_handlers.registered', {
      handlers: ['list-active', 'get', 'history', 'prepare-item', 'mark-ready', 'health', 'metrics', 'register-device', 'unregister-device', 'list-devices', 'list-station-types', 'list-displays']
    });
  }

  // ==========================================
  // Event Handlers (auto-wired from module.json)
  // ==========================================

  // ==========================================
  // Nombre de cuenta: cache
  // ==========================================

  async onCuentaCreada(event) {
    const data = event?.data || event?.payload || event;
    if (data.cuenta_id) {
      // Prefer ref_display (canonical), fallback to nombre for backwards compat
      const display = data.ref_display || data.metadata?.nombre || data.nombre || null;
      if (display) this.cuentaNombres.set(data.cuenta_id, display);
    }
  }

  async onCuentaActualizada(event) {
    const data = event?.data || event?.payload || event;
    if (!data.cuenta_id) return;

    const display = data.cambios?.ref_display || data.cambios?.nombre || null;
    if (!display) return;

    // Actualizar cache
    this.cuentaNombres.set(data.cuenta_id, display);

    // Actualizar pedidos activos en pantalla que pertenecen a esta cuenta
    for (const pedido of this.pedidosActivos.values()) {
      if (pedido.cuenta_id === data.cuenta_id) {
        pedido.nombre_cuenta = display;
        pedido.ref_display = display;
      }
    }
  }

  /**
   * Housekeeping al eliminar una cuenta: limpia cuentaNombres y cualquier
   * pedido huerfano de esa cuenta que quedara en pedidosActivos (defensa
   * contra pedidos bloqueados que nunca llegaron a marcarPedidoListo).
   */
  async onCuentaEliminada(event) {
    const data = event?.data || event?.payload || event;
    const { cuenta_id } = data || {};
    if (!cuenta_id) return;

    this.cuentaNombres.delete(cuenta_id);

    let removed = 0;
    for (const [pedido_id, pedido] of this.pedidosActivos) {
      if (pedido.cuenta_id === cuenta_id) {
        this.pedidosActivos.delete(pedido_id);
        removed++;
      }
    }
    if (removed > 0) {
      this._saveSnapshotDebounced();
      this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);
      this.logger.info('cocina.pedidos_huerfanos_limpiados', { cuenta_id, removed });
    }
  }

  // ==========================================
  // Reset: caja.cerrada / dia.iniciado
  // ==========================================

  async onCajaCerrada(event) {
    const size = this.pedidosActivos.size;
    this.pedidosActivos.clear();
    this.cuentaNombres.clear();
    this.historial = [];
    this._saveSnapshotDebounced();

    this.metrics?.gauge?.('cocina.pedidos_activos.count', 0);
    this.logger.info('cocina.reset.caja_cerrada', {
      pedidos_limpiados: size,
      correlation_id: event?.metadata?.correlationId
    });
  }

  async onDiaIniciado(event) {
    const size = this.pedidosActivos.size;
    this.pedidosActivos.clear();
    this.cuentaNombres.clear();
    this.historial = [];
    this._saveSnapshotDebounced();

    this.metrics?.gauge?.('cocina.pedidos_activos.count', 0);
    this.logger.info('cocina.reset.dia_iniciado', {
      pedidos_limpiados: size,
      correlation_id: event?.metadata?.correlationId
    });
  }

  // ==========================================
  // Pedidos
  // ==========================================

  async onPedidoEnviadoCocina(event) {
    const data = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { pedido_id, items, cuenta_id, canal, ref_display, project_id, notas_generales, metadata } = data;

    this.logger.info('cocina.pedido.recibido', {
      correlation_id: correlationId,
      pedido_id,
      canal: canal || 'directo',
      ref_display: ref_display || null,
      items_count: items?.length || 0
    });

    // ref_display: preferir el que viene en el evento, fallback a cache
    const nombre_cuenta = ref_display || this.cuentaNombres.get(cuenta_id) || metadata?.nombre || null;
    // Actualizar cache con el ref_display recibido
    if (cuenta_id && ref_display) this.cuentaNombres.set(cuenta_id, ref_display);

    const pedidoCocina = {
      pedido_id,
      cuenta_id,
      nombre_cuenta,
      ref_display: nombre_cuenta,
      canal: canal || null,
      items: (items || []).map(item => {
        const cocinaItem = {
          item_id: item.item_id,
          producto_id: item.producto_id,
          nombre: item.nombre,
          categoria: item.categoria || null,
          cantidad: item.cantidad,
          variaciones: item.variaciones || null,
          notas: item.notas || '',
          estado: 'pendiente',
          pase: 0
        };
        // Metadata especial: mitad-mitad, al gusto, ingredientes_base, etc.
        if (item.tipo) cocinaItem.tipo = item.tipo;
        if (item.pizza_izquierda) cocinaItem.pizza_izquierda = item.pizza_izquierda;
        if (item.pizza_derecha) cocinaItem.pizza_derecha = item.pizza_derecha;
        if (item.ingredientes) cocinaItem.ingredientes = item.ingredientes;
        if (item.ingredientes_base) cocinaItem.ingredientes_base = item.ingredientes_base;
        return cocinaItem;
      }),
      estado: 'activo',
      project_id: project_id || null,
      notas_generales: notas_generales || '',
      recibido_at: new Date().toISOString(),
      metadata: metadata || null
    };

    this.pedidosActivos.set(pedido_id, pedidoCocina);
    this._saveSnapshotDebounced();

    this.metrics?.increment?.('cocina.pedido_recibido.total');
    this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);

    // Notificar display externo de cocina (TV, LED, etc.)
    await this.publishDisplayCocina('nuevo_pedido', {
      pedido_id,
      cuenta_id,
      nombre_cuenta,
      canal: canal || null,
      items: pedidoCocina.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, categoria: i.categoria })),
      items_count: pedidoCocina.items.length
    });
  }

  async onPedidoCancelado(event) {
    const data = event?.data || event?.payload || event;
    const { pedido_id } = data;

    if (!this.pedidosActivos.has(pedido_id)) return;

    this.pedidosActivos.delete(pedido_id);
    this._saveSnapshotDebounced();

    this.metrics?.increment?.('cocina.pedido_cancelado.total');
    this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);

    this.logger.info('cocina.pedido.cancelado', { pedido_id });
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleGetActivos() {
    const activos = Array.from(this.pedidosActivos.values());
    activos.sort((a, b) => new Date(a.recibido_at) - new Date(b.recibido_at));

    let itemsPendientes = 0;
    let itemsPreparando = 0;
    for (const p of activos) {
      for (const i of p.items) {
        if (i.estado === 'pendiente') itemsPendientes++;
        else if (i.estado === 'preparando') itemsPreparando++;
      }
    }

    return {
      status: 200,
      data: { pedidos: activos, total: activos.length, items_pendientes: itemsPendientes, items_preparando: itemsPreparando, devices: this.getDeviceList() }
    };
  }

  async handleGetHistorial(data) {
    const { limit } = data || {};
    const historial = this.historial.slice(0, parseInt(limit) || 20);

    return {
      status: 200,
      data: { pedidos: historial, total: historial.length }
    };
  }

  async handleGetPedido(data) {
    const invalid = this.validateInput('cocina.get', data);
    if (invalid) return invalid;

    const { pedido_id } = data;
    const pedido = this.pedidosActivos.get(pedido_id);

    if (!pedido) {
      return { status: 404, error: 'Pedido no encontrado en cocina' };
    }

    return { status: 200, data: pedido };
  }

  /**
   * Tap en item — sistema de pases:
   *
   * General (pase 0):
   *   tap 1: pendiente → preparando
   *   tap 2: preparando → pase++ (pase=1), item pasa a horno
   *
   * Horno (pase 1): item llega ya como 'preparando' (auto_preparar)
   *   tap 1: pase++ (pase=2), imprime ticket, item listo
   *
   * Si todos los items del pedido están listo → auto-completa.
   */
  async handlePrepararItem(data) {
    const invalid = this.validateInput('cocina.prepare-item', data);
    if (invalid) return invalid;

    const { item_id, device_id } = data;

    const device = device_id ? this.devices.get(device_id) : null;
    if (device) device.last_seen = new Date().toISOString();

    // Buscar item en pedidos activos
    let pedidoEncontrado = null;
    let itemEncontrado = null;

    for (const pedido of this.pedidosActivos.values()) {
      const item = pedido.items.find(i => i.item_id === item_id);
      if (item) {
        pedidoEncontrado = pedido;
        itemEncontrado = item;
        break;
      }
    }

    if (!itemEncontrado) {
      return { status: 404, error: 'Item no encontrado en cocina' };
    }

    if (itemEncontrado.estado === 'listo') {
      return { status: 400, error: 'Item ya está listo' };
    }

    const now = new Date().toISOString();
    if (!itemEncontrado.fases) itemEncontrado.fases = [];
    const estacion = device?.estacion || device?.nombre || null;
    const tipoEstacion = device?.tipo_estacion || 'general';

    // ── Tap 1: pendiente → preparando ──
    if (itemEncontrado.estado === 'pendiente') {
      itemEncontrado.estado = 'preparando';
      itemEncontrado.preparando_at = now;
      if (device) {
        itemEncontrado.device_id = device_id;
        itemEncontrado.device_color = device.color;
        itemEncontrado.device_nombre = device.nombre;
      }

      itemEncontrado.fases.push({
        estacion,
        device_id: device_id || null,
        device_nombre: device?.nombre || null,
        inicio: now,
        fin: null
      });

      await this.publishItemPreparando(pedidoEncontrado, itemEncontrado, estacion);

      this.logger.info('cocina.item.preparando', {
        pedido_id: pedidoEncontrado.pedido_id, item_id, pase: itemEncontrado.pase
      });

      this._saveSnapshotDebounced();
      return { status: 200, data: { item: itemEncontrado, pedido_completo: false } };
    }

    // ── Tap 2: preparando → avanzar pase ──

    // Cerrar fase activa
    const faseActiva = itemEncontrado.fases.find(f => !f.fin);
    if (faseActiva) {
      faseActiva.fin = now;
      faseActiva.duracion_seg = Math.round((new Date(now) - new Date(faseActiva.inicio)) / 1000);
    }

    // Incrementar pase
    const paseAnterior = itemEncontrado.pase || 0;
    itemEncontrado.pase = paseAnterior + 1;

    // ¿Imprimir ticket? (horno imprime al completar)
    if (device) {
      const tipoEst = this.tiposEstacion[tipoEstacion];
      if (tipoEst?.comportamientos?.imprime_al_completar) {
        await this.publishItemTicket(pedidoEncontrado, itemEncontrado, estacion, device);
      }
    }

    // ¿Hay siguiente estación cuyo pase_minimo coincida con el pase actual del item?
    const siguienteTipo = Object.values(this.tiposEstacion).find(t => t.pase_minimo === itemEncontrado.pase);

    if (siguienteTipo) {
      // Limpiar device info de la estación anterior
      delete itemEncontrado.device_id;
      delete itemEncontrado.device_color;
      delete itemEncontrado.device_nombre;
      delete itemEncontrado.preparando_at;

      // ¿Auto-preparar? (horno: item llega ya como preparando)
      if (siguienteTipo.comportamientos?.auto_preparar) {
        itemEncontrado.estado = 'preparando';
        itemEncontrado.preparando_at = now;
        itemEncontrado.fases.push({
          estacion: siguienteTipo.id,
          device_id: null,
          device_nombre: null,
          inicio: now,
          fin: null
        });
      } else {
        itemEncontrado.estado = 'pendiente';
      }

      this.metrics?.increment?.('cocina.item_avanzado.total');

      await this.publishItemAvanzado(pedidoEncontrado, itemEncontrado, estacion);

      this.logger.info('cocina.item.avanzado', {
        pedido_id: pedidoEncontrado.pedido_id, item_id,
        pase: itemEncontrado.pase,
        siguiente: siguienteTipo.id
      });

      this._saveSnapshotDebounced();
      return { status: 200, data: { item: itemEncontrado, pedido_completo: false, avanzado: true } };
    }

    // No hay más estaciones → item listo
    itemEncontrado.estado = 'listo';
    itemEncontrado.preparado_at = now;

    this.metrics?.increment?.('cocina.item_preparado.total');

    await this.publishItemPreparado(pedidoEncontrado, itemEncontrado, estacion);

    // Auto-completar si todos listos
    const todosListos = pedidoEncontrado.items.every(i => i.estado === 'listo');
    if (todosListos) {
      await this.marcarPedidoListo(pedidoEncontrado);
    }

    this.logger.info('cocina.item.preparado', {
      pedido_id: pedidoEncontrado.pedido_id, item_id, pase: itemEncontrado.pase,
      pedido_completo: todosListos
    });

    if (!todosListos) this._saveSnapshotDebounced();
    return { status: 200, data: { item: itemEncontrado, pedido_completo: todosListos } };
  }

  /**
   * Marca el pedido entero como listo de golpe (atajo rápido).
   * Todos los items pendientes/preparando pasan a listo.
   */
  async handleMarcarListo(data) {
    const invalid = this.validateInput('cocina.mark-ready', data);
    if (invalid) return invalid;

    const { pedido_id } = data;

    const pedido = this.pedidosActivos.get(pedido_id);
    if (!pedido) {
      return { status: 404, error: 'Pedido no encontrado en cocina' };
    }

    const maxPase = Math.max(...Object.values(this.tiposEstacion).map(t => t.pase_minimo)) + 1;
    const now = new Date().toISOString();
    pedido.items.forEach(item => {
      if (item.estado !== 'listo') {
        item.estado = 'listo';
        item.pase = maxPase;
        item.preparado_at = now;
        this.metrics?.increment?.('cocina.item_preparado.total');
      }
    });

    await this.marcarPedidoListo(pedido);

    return { status: 200, data: pedido };
  }

  // ==========================================
  // Device Management
  // ==========================================

  /**
   * Registra un dispositivo de cocina. Asigna color único automáticamente.
   * Si el device_id ya existe, actualiza sus datos (re-connect).
   */
  async handleRegisterDevice(data) {
    const invalid = this.validateInput('cocina.register-device', data);
    if (invalid) return invalid;

    const { device_id, nombre, estacion, filtros, tipo_estacion, impresora } = data;
    const existing = this.devices.get(device_id);

    // Validar tipo_estacion si se proporciona
    if (tipo_estacion && !this.tiposEstacion[tipo_estacion]) {
      return { status: 400, error: `Tipo de estación desconocido: ${tipo_estacion}. Tipos válidos: ${Object.keys(this.tiposEstacion).join(', ')}` };
    }

    if (existing) {
      // Re-registro: actualizar filtros, nombre, estación, tipo e impresora, mantener color
      existing.nombre = nombre || existing.nombre;
      existing.estacion = estacion || existing.estacion;
      existing.filtros = filtros || existing.filtros;
      if (tipo_estacion !== undefined) existing.tipo_estacion = tipo_estacion;
      if (impresora !== undefined) existing.impresora = impresora;
      existing.last_seen = new Date().toISOString();

      await this.eventBus.publish('cocina.device_updated', {
        device_id, nombre: existing.nombre, color: existing.color,
        estacion: existing.estacion, filtros: existing.filtros,
        tipo_estacion: existing.tipo_estacion,
        impresora: existing.impresora || null
      });

      return {
        status: 200,
        data: {
          device_id,
          color: existing.color,
          nombre: existing.nombre,
          estacion: existing.estacion,
          filtros: existing.filtros,
          tipo_estacion: existing.tipo_estacion,
          tipo_estacion_info: this.tiposEstacion[existing.tipo_estacion] || null,
          impresora: existing.impresora || null,
          devices: this.getDeviceList()
        }
      };
    }

    // Nuevo dispositivo: asignar color
    const colorIndex = this.devices.size % this.DEVICE_COLORS.length;
    const color = this.DEVICE_COLORS[colorIndex];

    const device = {
      device_id,
      nombre: nombre || `Estación ${this.devices.size + 1}`,
      estacion: estacion || null,
      color,
      filtros: filtros || { familias: [] },
      tipo_estacion: tipo_estacion || 'general',
      impresora: impresora || null,
      connected_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };

    this.devices.set(device_id, device);

    await this.eventBus.publish('cocina.device_registered', {
      device_id, nombre: device.nombre, estacion: device.estacion,
      color, filtros: device.filtros, tipo_estacion: device.tipo_estacion,
      impresora: device.impresora
    });

    this.logger.info('cocina.device.registered', {
      device_id, nombre: device.nombre, color, tipo_estacion: device.tipo_estacion, total_devices: this.devices.size
    });

    return {
      status: 201,
      data: {
        device_id,
        color,
        nombre: device.nombre,
        estacion: device.estacion,
        filtros: device.filtros,
        tipo_estacion: device.tipo_estacion,
        tipo_estacion_info: this.tiposEstacion[device.tipo_estacion] || null,
        impresora: device.impresora,
        devices: this.getDeviceList()
      }
    };
  }

  async handleUnregisterDevice(data) {
    const { device_id } = data;
    if (!device_id) return { status: 400, error: 'device_id requerido' };

    const existed = this.devices.delete(device_id);

    if (existed) {
      await this.eventBus.publish('cocina.device_unregistered', { device_id });
      this.logger.info('cocina.device.unregistered', { device_id, total_devices: this.devices.size });
    }

    return { status: 200, data: { removed: existed, devices: this.getDeviceList() } };
  }

  async handleListDevices() {
    return { status: 200, data: { devices: this.getDeviceList() } };
  }

  getDeviceList() {
    return Array.from(this.devices.values()).map(d => ({
      device_id: d.device_id,
      nombre: d.nombre,
      estacion: d.estacion || null,
      color: d.color,
      filtros: d.filtros,
      tipo_estacion: d.tipo_estacion || 'general',
      connected_at: d.connected_at,
      last_seen: d.last_seen
    }));
  }

  /**
   * Lista los tipos de estación disponibles con sus comportamientos.
   * Útil para que el frontend construya el selector de tipo.
   */
  async handleListTiposEstacion() {
    return {
      status: 200,
      data: {
        tipos: Object.values(this.tiposEstacion)
      }
    };
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        pedidos_activos: this.pedidosActivos.size,
        devices_count: this.devices.size
      }
    };
  }

  async handleGetMetrics() {
    const itemsPendientes = Array.from(this.pedidosActivos.values())
      .reduce((sum, p) => sum + p.items.filter(i => i.estado === 'pendiente').length, 0);
    const itemsPreparando = Array.from(this.pedidosActivos.values())
      .reduce((sum, p) => sum + p.items.filter(i => i.estado === 'preparando').length, 0);

    const tiempoPromedio = this.tiemposPreparacion.length > 0
      ? this.tiemposPreparacion.reduce((a, b) => a + b, 0) / this.tiemposPreparacion.length
      : 0;

    return {
      status: 200,
      data: {
        pedidos_activos: this.pedidosActivos.size,
        items_pendientes: itemsPendientes,
        items_preparando: itemsPreparando,
        historial_count: this.historial.length,
        tiempo_promedio_preparacion: Math.round(tiempoPromedio),
        timestamp: new Date().toISOString()
      }
    };
  }

  // ==========================================
  // Restauración desde persistencia
  // ==========================================

  /**
   * Reconstruye pedidos activos de cocina desde cuentas_activas.json.
   * Los pedidos que tenían estado en_preparacion/con_pedido se restauran
   * como pendientes en cocina.
   */
  async restaurarDesdeArchivo() {
    try {
      const archivo = path.join('./data/current', 'cuentas_activas.json');
      const contenido = await fs.readFile(archivo, 'utf8');
      const datos = JSON.parse(contenido);

      if (!datos.cuentas) return;

      let restaurados = 0;
      // Estados que indican que el pedido ya salió de cocina
      const ESTADOS_POST_COCINA = new Set(['listo', 'entregado', 'para_cobrar', 'cobrado']);

      for (const [cuenta_id, cuenta] of Object.entries(datos.cuentas)) {
        if (!cuenta.pedidos || cuenta.pedidos.length === 0) continue;

        // Si la cuenta ya pasó por cocina, no restaurar sus pedidos
        if (ESTADOS_POST_COCINA.has(cuenta.estado)) continue;

        for (const pedidoData of cuenta.pedidos) {
          const pedido_id = pedidoData.pedido_id;
          if (!pedido_id || this.pedidosActivos.has(pedido_id)) continue;

          const items = (pedidoData.items || []).map((item, idx) => {
            const cocinaItem = {
              item_id: item.item_id || item.id || `${pedido_id}_item_${idx + 1}`,
              producto_id: item.producto_id,
              nombre: item.nombre,
              cantidad: item.cantidad || 1,
              variaciones: item.variaciones || null,
              notas: item.notas || '',
              estado: 'pendiente',
              pase: 0
            };
            if (item.tipo) cocinaItem.tipo = item.tipo;
            if (item.pizza_izquierda) cocinaItem.pizza_izquierda = item.pizza_izquierda;
            if (item.pizza_derecha) cocinaItem.pizza_derecha = item.pizza_derecha;
            if (item.ingredientes) cocinaItem.ingredientes = item.ingredientes;
            if (item.ingredientes_base) cocinaItem.ingredientes_base = item.ingredientes_base;
            return cocinaItem;
          });

          if (items.length === 0) continue;

          // Canal: preferir el `tipo` persistido en el snapshot (fuente de verdad).
          // Fallback: detectar por prefijo del cuenta_id (palabra completa).
          let canal = cuenta.tipo || null;
          if (!canal) {
            if (cuenta_id.startsWith('mesa_')) canal = 'mesa';
            else if (cuenta_id.startsWith('llevar_')) canal = 'llevar';
            else if (cuenta_id.startsWith('telefono_') || cuenta_id.startsWith('tel_')) canal = 'telefono';
            else if (cuenta_id.startsWith('whatsapp_') || cuenta_id.startsWith('wa_')) canal = 'whatsapp';
            else if (cuenta_id.startsWith('glovo_')) canal = 'glovo';
            else if (cuenta_id.startsWith('delivery_')) canal = 'delivery';
            else if (cuenta_id.startsWith('llevadoo_')) canal = 'llevadoo';
          }

          const pedidoCocina = {
            pedido_id,
            cuenta_id,
            canal,
            items,
            estado: 'activo',
            notas_generales: '',
            recibido_at: cuenta.created_at || new Date().toISOString(),
            metadata: null
          };

          this.pedidosActivos.set(pedido_id, pedidoCocina);
          restaurados++;
        }
      }

      if (restaurados > 0) {
        this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);
        this.logger.info('cocina.estado_restaurado', {
          pedidos_restaurados: restaurados
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.warn('cocina.restaurar.error', { error: error.message });
      }
    }
  }

  // ==========================================
  // Lógica interna
  // ==========================================

  async marcarPedidoListo(pedido) {
    pedido.estado = 'listo';
    pedido.listo_at = new Date().toISOString();

    // Tiempo de preparación (segundos)
    const tiempoPreparacion = (new Date(pedido.listo_at) - new Date(pedido.recibido_at)) / 1000;
    pedido.tiempo_preparacion = tiempoPreparacion;

    // Rolling average (últimos 100)
    this.tiemposPreparacion.push(tiempoPreparacion);
    if (this.tiemposPreparacion.length > 100) {
      this.tiemposPreparacion.shift();
    }

    // Métricas via core
    this.metrics?.increment?.('cocina.pedido_listo.total');
    this.metrics?.timing?.('cocina.preparacion_pedido.duration', tiempoPreparacion * 1000);
    this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size - 1);

    // Historial (últimos 50)
    this.historial.unshift(pedido);
    if (this.historial.length > this.maxHistorial) {
      this.historial.pop();
    }

    this.pedidosActivos.delete(pedido.pedido_id);
    this._saveSnapshotDebounced();

    await this.publishPedidoListo(pedido);

    // Notificar display externo: pedido listo para servir
    await this.publishDisplayCocina('pedido_listo', {
      pedido_id: pedido.pedido_id,
      cuenta_id: pedido.cuenta_id,
      canal: pedido.canal || null,
      items_count: pedido.items.length,
      tiempo_preparacion: tiempoPreparacion
    });

    this.logger.info('cocina.pedido.listo', {
      pedido_id: pedido.pedido_id,
      canal: pedido.canal || null,
      tiempo_preparacion: tiempoPreparacion
    });
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishItemPreparando(pedidoCocina, item, estacion) {
    const payload = {
      pedido_id: pedidoCocina.pedido_id,
      cuenta_id: pedidoCocina.cuenta_id,
      canal: pedidoCocina.canal || null,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      categoria: item.categoria || null,
      estacion: estacion || null,
      pase: item.pase || 0,
      preparando_at: item.preparando_at
    };
    if (item.device_id) payload.device_id = item.device_id;
    if (item.device_color) payload.device_color = item.device_color;
    if (item.device_nombre) payload.device_nombre = item.device_nombre;
    await this.eventBus.publish('cocina.item_preparando', payload);
  }

  async publishItemAvanzado(pedidoCocina, item, estacionAnterior) {
    await this.eventBus.publish('cocina.item_avanzado', {
      pedido_id: pedidoCocina.pedido_id,
      cuenta_id: pedidoCocina.cuenta_id,
      canal: pedidoCocina.canal || null,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      categoria: item.categoria || null,
      estado: item.estado,
      pase: item.pase,
      preparando_at: item.preparando_at || null,
      desde_estacion: estacionAnterior
    });
  }

  async publishItemPreparado(pedidoCocina, item, estacion) {
    const payload = {
      pedido_id: pedidoCocina.pedido_id,
      cuenta_id: pedidoCocina.cuenta_id,
      canal: pedidoCocina.canal || null,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      categoria: item.categoria || null,
      estacion: estacion || null,
      pase: item.pase || 0,
      fases: item.fases || [],
      preparado_at: item.preparado_at
    };
    if (item.device_id) payload.device_id = item.device_id;
    if (item.device_color) payload.device_color = item.device_color;
    if (item.device_nombre) payload.device_nombre = item.device_nombre;
    await this.eventBus.publish('cocina.item_preparado', payload);
  }

  /**
   * Ticket de pieza individual — se imprime cuando un item se completa en una
   * estación cuyo tipo tiene comportamiento imprime_al_completar: true.
   * Ticket mínimo: nombre producto, pedido, mesa/canal.
   */
  async publishItemTicket(pedidoCocina, item, estacion, device) {
    await this.eventBus.publish('cocina.item_ticket', {
      pedido_id: pedidoCocina.pedido_id,
      cuenta_id: pedidoCocina.cuenta_id,
      project_id: pedidoCocina.project_id || null,
      ref_display: pedidoCocina.ref_display || null,
      canal: pedidoCocina.canal || null,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      categoria: item.categoria || null,
      estacion,
      ingredientes: item.ingredientes || item.ingredientes_base || null,
      variaciones: item.variaciones || null,
      notas: item.notas || null,
      fases: item.fases || [],
      impresora: device?.impresora || null,
      timestamp: new Date().toISOString()
    });

    this.logger.info('cocina.item_ticket.published', {
      pedido_id: pedidoCocina.pedido_id,
      item_id: item.item_id,
      nombre: item.nombre,
      estacion
    });
  }

  async publishPedidoListo(pedido) {
    await this.eventBus.publish('cocina.pedido_listo', {
      pedido_id: pedido.pedido_id,
      cuenta_id: pedido.cuenta_id,
      ref_display: pedido.ref_display || null,
      canal: pedido.canal || null,
      items_count: pedido.items.length,
      tiempo_preparacion: pedido.tiempo_preparacion,
      listo_at: pedido.listo_at
    });
  }

  /**
   * GET /modules/cocina/list-displays
   * Lista displays disponibles para selección de destino.
   * Consulta perifericos por capacidad 'display'.
   *
   * Response: { displays: [{ nombre, tipo, estado, conectado, metadata }], display_default }
   */
  async handleListarDisplays() {
    try {
      const result = await this.eventBus.request('perifericos', 'listar-por-capacidad', {
        capacidad: 'display'
      });

      const displays = result?.data?.dispositivos || [];
      return {
        status: 200,
        data: {
          displays,
          total: displays.length,
          display_default: this.config?.display_destino || 'display-cocina'
        }
      };
    } catch (err) {
      this.logger.warn('cocina.listar_displays.error', { error: err.message });
      return {
        status: 200,
        data: {
          displays: [],
          total: 0,
          display_default: this.config?.display_destino || 'display-cocina',
          nota: 'No se pudo consultar perifericos'
        }
      };
    }
  }

  /**
   * Publica periferico.display para pantallas externas de cocina.
   * Acciones: 'nuevo_pedido', 'pedido_listo', 'actualizar'.
   * El display externo (TV, LED, tablet fija) consume esto via perifericos.
   *
   * @param {string} accion - tipo de actualización
   * @param {object} contenido - datos a mostrar
   */
  async publishDisplayCocina(accion, contenido) {
    try {
      const destino = this.config?.display_destino || 'display-cocina';
      await this.eventBus.publish('periferico.display', {
        destino,
        data: {
          accion,
          modulo: 'cocina',
          contenido,
          pedidos_activos: this.pedidosActivos.size,
          timestamp: new Date().toISOString()
        },
        prioridad: accion === 'pedido_listo' ? 2 : 3
      });
    } catch (err) {
      // Display es best-effort — no falla el flujo principal
      this.logger.debug('cocina.display.error', { accion, error: err.message });
    }
  }
}

module.exports = CocinaModule;
