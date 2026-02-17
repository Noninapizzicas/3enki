/**
 * Módulo Categorias v2.0
 * Catálogo de categorías - Actualizado desde menús generados por IA
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 *
 * Emite: categoria.creada, categoria.actualizada, categoria.orden_actualizado
 * Consume: menu.generado
 */

class CategoriasModule {
  constructor() {
    this.name = 'categorias';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Estado en memoria
    this.categorias = new Map(); // categoria_id -> categoria
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

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this.uiHandler) {
      const actions = ['list', 'get', 'create', 'update', 'reorder', 'health', 'metrics'];
      for (const action of actions) {
        this.uiHandler.unregister('categorias', action);
      }
    }

    this.categorias.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('categorias.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('categorias', 'list', this.handleListCategorias.bind(this));
    this.uiHandler.register('categorias', 'get', this.handleGetCategoria.bind(this));
    this.uiHandler.register('categorias', 'create', this.handleCreateCategoria.bind(this));
    this.uiHandler.register('categorias', 'update', this.handleUpdateCategoria.bind(this));
    this.uiHandler.register('categorias', 'reorder', this.handleReorderCategorias.bind(this));
    this.uiHandler.register('categorias', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('categorias', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('categorias.ui_handlers.registered', {
      handlers: ['list', 'get', 'create', 'update', 'reorder', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('menu.generado', this.onMenuGenerado.bind(this));

    this.logger.info('categorias.events.subscribed', {
      events: ['menu.generado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onMenuGenerado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { categorias } = eventData;

    if (!categorias || categorias.length === 0) {
      return;
    }

    this.logger.info('menu.generado.received', {
      categorias_count: categorias.length,
      correlation_id: correlationId
    });

    let nuevas = 0;
    let actualizadas = 0;

    for (const cat of categorias) {
      const existente = this.categorias.get(cat.id);

      if (!existente) {
        const categoria = {
          id: cat.id,
          nombre: cat.nombre,
          emoji: cat.emoji || '📋',
          orden: cat.orden !== undefined ? cat.orden : this.categorias.size,
          activa: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        this.categorias.set(cat.id, categoria);
        nuevas++;

        this.metrics.increment('categoria.creada.total');
        await this.publishCategoriaCreada(categoria, correlationId);

      } else {
        const cambios = {};
        if (cat.emoji && cat.emoji !== existente.emoji) {
          cambios.emoji = { anterior: existente.emoji, nuevo: cat.emoji };
          existente.emoji = cat.emoji;
        }
        if (cat.nombre && cat.nombre !== existente.nombre) {
          cambios.nombre = { anterior: existente.nombre, nuevo: cat.nombre };
          existente.nombre = cat.nombre;
        }

        if (Object.keys(cambios).length > 0) {
          existente.updated_at = new Date().toISOString();
          this.categorias.set(cat.id, existente);
          actualizadas++;

          await this.publishCategoriaActualizada(cat.id, cambios, correlationId);
        }
      }
    }

    this.metrics.counters['categoria.total.count'] = this.categorias.size;
    this.metrics.counters['categoria.activas.count'] =
      Array.from(this.categorias.values()).filter(c => c.activa).length;

    this.logger.info('categorias.sincronizadas', {
      nuevas,
      actualizadas,
      total: this.categorias.size,
      correlation_id: correlationId
    });
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleListCategorias() {
    const categorias = Array.from(this.categorias.values())
      .filter(c => c.activa)
      .sort((a, b) => a.orden - b.orden);

    return {
      status: 200,
      data: { categorias, total: categorias.length }
    };
  }

  async handleGetCategoria(data) {
    const { id } = data;
    const categoria = this.categorias.get(id);

    if (!categoria) {
      return { status: 404, error: 'Categoría no encontrada' };
    }

    return { status: 200, data: categoria };
  }

  async handleCreateCategoria(data) {
    const { nombre, emoji, descripcion, color } = data;

    if (!nombre) {
      return { status: 400, error: 'nombre requerido' };
    }

    const categoria_id = `cat_${this.slugify(nombre)}`;

    if (this.categorias.has(categoria_id)) {
      return { status: 409, error: 'Categoría ya existe' };
    }

    const categoria = {
      id: categoria_id,
      nombre,
      emoji: emoji || '📋',
      orden: this.categorias.size,
      activa: true,
      descripcion,
      color,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.categorias.set(categoria_id, categoria);

    this.metrics.increment('categoria.creada.total');
    await this.publishCategoriaCreada(categoria);

    this.logger.info('categoria.creada', {
      categoria_id,
      nombre
    });

    return { status: 201, data: categoria };
  }

  async handleUpdateCategoria(data) {
    const { id, ...updates } = data;

    const categoria = this.categorias.get(id);
    if (!categoria) {
      return { status: 404, error: 'Categoría no encontrada' };
    }

    const cambios = {};
    Object.keys(updates).forEach(key => {
      if (updates[key] !== categoria[key]) {
        cambios[key] = { anterior: categoria[key], nuevo: updates[key] };
        categoria[key] = updates[key];
      }
    });

    categoria.updated_at = new Date().toISOString();
    this.categorias.set(id, categoria);

    this.metrics.increment('categoria.actualizada.total');
    await this.publishCategoriaActualizada(id, cambios);

    this.logger.info('categoria.actualizada', {
      categoria_id: id,
      cambios_count: Object.keys(cambios).length
    });

    return { status: 200, data: categoria };
  }

  async handleReorderCategorias(data) {
    const { orden } = data;

    if (!orden || !Array.isArray(orden)) {
      return { status: 400, error: 'orden array requerido' };
    }

    const nuevo_orden = [];

    orden.forEach((item, idx) => {
      const categoria = this.categorias.get(item.categoria_id);
      if (categoria) {
        categoria.orden = idx;
        categoria.updated_at = new Date().toISOString();
        this.categorias.set(item.categoria_id, categoria);

        nuevo_orden.push({
          categoria_id: item.categoria_id,
          orden: idx
        });
      }
    });

    await this.publishOrdenActualizado(nuevo_orden);

    this.logger.info('categorias.reordenadas', {
      count: nuevo_orden.length
    });

    return {
      status: 200,
      data: { message: 'Orden actualizado', nuevo_orden }
    };
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        catalogo: {
          total: this.categorias.size,
          activas: Array.from(this.categorias.values()).filter(c => c.activa).length
        }
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        counters: {
          'categoria.creada.total': this.metrics.getCounter('categoria.creada.total') || 0,
          'categoria.actualizada.total': this.metrics.getCounter('categoria.actualizada.total') || 0
        },
        gauges: {
          'categoria.total.count': this.categorias.size,
          'categoria.activas.count': Array.from(this.categorias.values()).filter(c => c.activa).length
        }
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishCategoriaCreada(categoria, correlation_id) {
    await this.eventBus.publish('categoria.creada', {
      categoria_id: categoria.id,
      nombre: categoria.nombre,
      emoji: categoria.emoji,
      orden: categoria.orden,
      created_at: categoria.created_at
    }, {
      correlationId: correlation_id
    });
  }

  async publishCategoriaActualizada(categoria_id, cambios, correlation_id) {
    await this.eventBus.publish('categoria.actualizada', {
      categoria_id,
      cambios,
      updated_at: new Date().toISOString()
    }, {
      correlationId: correlation_id
    });
  }

  async publishOrdenActualizado(nuevo_orden, correlation_id) {
    await this.eventBus.publish('categoria.orden_actualizado', {
      nuevo_orden
    }, {
      correlationId: correlation_id
    });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  slugify(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}

module.exports = CategoriasModule;
