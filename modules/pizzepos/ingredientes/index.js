/**
 * Módulo Ingredientes v2.0
 * Catálogo de ingredientes - Actualizado desde menús generados por IA
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 *
 * Emite: ingrediente.creado, ingrediente.actualizado
 * Consume: menu.generado, producto.creado
 */

class IngredientesModule {
  constructor() {
    this.name = 'ingredientes';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Estado en memoria
    this.ingredientes = new Map(); // ingrediente_id -> ingrediente
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
    this.registerUIHandlers();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this.uiHandler) {
      const actions = ['list', 'get', 'search', 'alergenos', 'update', 'health', 'metrics'];
      for (const action of actions) {
        this.uiHandler.unregister('ingredientes', action);
      }
    }

    this.ingredientes.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('ingredientes.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('ingredientes', 'list', this.handleListIngredientes.bind(this));
    this.uiHandler.register('ingredientes', 'get', this.handleGetIngrediente.bind(this));
    this.uiHandler.register('ingredientes', 'search', this.handleSearchIngredientes.bind(this));
    this.uiHandler.register('ingredientes', 'alergenos', this.handleListAlergenos.bind(this));
    this.uiHandler.register('ingredientes', 'update', this.handleUpdateIngrediente.bind(this));
    this.uiHandler.register('ingredientes', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('ingredientes', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('ingredientes.ui_handlers.registered', {
      handlers: ['list', 'get', 'search', 'alergenos', 'update', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('menu.generado', this.onMenuGenerado.bind(this));
    await this.eventBus.subscribe('producto.creado', this.onProductoCreado.bind(this));

    this.logger.info('ingredientes.events.subscribed', {
      events: ['menu.generado', 'producto.creado']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onMenuGenerado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { ingredientes_catalogo } = eventData;

    if (!ingredientes_catalogo || ingredientes_catalogo.length === 0) {
      return;
    }

    this.logger.info('menu.generado.received', {
      ingredientes_count: ingredientes_catalogo.length,
      correlation_id: correlationId
    });

    const start_time = Date.now();
    let nuevos = 0;
    let actualizados = 0;

    for (const ing of ingredientes_catalogo) {
      const existente = this.ingredientes.get(ing.id);

      if (!existente) {
        const ingrediente = {
          ...ing,
          disponible: true,
          precio_extra: ing.precio_extra || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        this.ingredientes.set(ing.id, ingrediente);
        nuevos++;

        this.metrics.increment('ingrediente.creado.total');
        await this.publishIngredienteCreado(ingrediente, correlationId);

      } else {
        const actualizado = {
          ...existente,
          ...ing,
          updated_at: new Date().toISOString()
        };

        this.ingredientes.set(ing.id, actualizado);
        actualizados++;

        await this.publishIngredienteActualizado(ing.id, { emoji: ing.emoji }, correlationId);
      }
    }

    this.metrics.gauge('ingrediente.total.count', this.ingredientes.size);
    this.metrics.gauge('ingrediente.alergenos.count',
      Array.from(this.ingredientes.values()).filter(i => i.es_alergeno).length
    );
    this.metrics.timing('ingrediente.sync.duration', Date.now() - start_time);

    this.logger.info('ingredientes.sincronizados', {
      nuevos,
      actualizados,
      total: this.ingredientes.size,
      correlation_id: correlationId,
      duration: Date.now() - start_time
    });
  }

  async onProductoCreado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { ingredientes_base, producto_id } = eventData;

    if (!ingredientes_base || ingredientes_base.length === 0) {
      return;
    }

    for (const ing of ingredientes_base) {
      if (!this.ingredientes.has(ing.id)) {
        const ingrediente = {
          ...ing,
          disponible: true,
          precio_extra: ing.precio_extra ?? 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        this.ingredientes.set(ing.id, ingrediente);

        this.metrics.increment('ingrediente.creado.total');
        await this.publishIngredienteCreado(ingrediente, correlationId);

        this.logger.info('ingrediente.creado', {
          ingrediente_id: ing.id,
          nombre: ing.nombre,
          from_producto: producto_id,
          correlation_id: correlationId
        });
      }
    }
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleListIngredientes(data) {
    const { tipo, alergeno } = data || {};

    let ingredientes = Array.from(this.ingredientes.values());

    if (tipo) {
      ingredientes = ingredientes.filter(i => i.tipo === tipo);
    }

    if (alergeno === 'true' || alergeno === true) {
      ingredientes = ingredientes.filter(i => i.es_alergeno === true);
    }

    ingredientes.sort((a, b) => {
      if (a.tipo !== b.tipo) {
        return a.tipo.localeCompare(b.tipo);
      }
      return a.nombre.localeCompare(b.nombre);
    });

    return {
      status: 200,
      data: { ingredientes, total: ingredientes.length }
    };
  }

  async handleGetIngrediente(data) {
    const { id } = data;
    const ingrediente = this.ingredientes.get(id);

    if (!ingrediente) {
      return { status: 404, error: 'Ingrediente no encontrado' };
    }

    return { status: 200, data: ingrediente };
  }

  async handleSearchIngredientes(data) {
    const { q } = data || {};

    if (!q) {
      return { status: 400, error: 'Parámetro "q" requerido' };
    }

    const searchTerm = q.toLowerCase();
    const resultados = Array.from(this.ingredientes.values())
      .filter(i => i.nombre.toLowerCase().includes(searchTerm));

    return {
      status: 200,
      data: { resultados, total: resultados.length, query: q }
    };
  }

  async handleListAlergenos() {
    const alergenos = Array.from(this.ingredientes.values())
      .filter(i => i.es_alergeno === true);

    const porTipo = {};
    alergenos.forEach(ing => {
      if (ing.alergenos && ing.alergenos.length > 0) {
        ing.alergenos.forEach(alergeno => {
          if (!porTipo[alergeno]) {
            porTipo[alergeno] = [];
          }
          porTipo[alergeno].push({
            id: ing.id,
            nombre: ing.nombre,
            emoji: ing.emoji
          });
        });
      }
    });

    return {
      status: 200,
      data: { alergenos, total: alergenos.length, por_tipo: porTipo }
    };
  }

  async handleUpdateIngrediente(data) {
    const { id, ...updates } = data;

    const ingrediente = this.ingredientes.get(id);
    if (!ingrediente) {
      return { status: 404, error: 'Ingrediente no encontrado' };
    }

    const cambios = {};
    Object.keys(updates).forEach(key => {
      if (updates[key] !== ingrediente[key]) {
        cambios[key] = { anterior: ingrediente[key], nuevo: updates[key] };
        ingrediente[key] = updates[key];
      }
    });

    ingrediente.updated_at = new Date().toISOString();
    this.ingredientes.set(id, ingrediente);

    this.metrics.increment('ingrediente.actualizado.total');
    await this.publishIngredienteActualizado(id, cambios);

    this.logger.info('ingrediente.actualizado', {
      ingrediente_id: id,
      cambios_count: Object.keys(cambios).length
    });

    return { status: 200, data: ingrediente };
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        catalogo: {
          total: this.ingredientes.size,
          alergenos: Array.from(this.ingredientes.values()).filter(i => i.es_alergeno).length,
          por_tipo: this.countByType()
        }
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        counters: {
          'ingrediente.creado.total': this.metrics.getCounter('ingrediente.creado.total') || 0,
          'ingrediente.actualizado.total': this.metrics.getCounter('ingrediente.actualizado.total') || 0
        },
        gauges: {
          'ingrediente.total.count': this.ingredientes.size,
          'ingrediente.alergenos.count': Array.from(this.ingredientes.values()).filter(i => i.es_alergeno).length
        }
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishIngredienteCreado(ingrediente, correlation_id) {
    await this.eventBus.publish('ingrediente.creado', {
      ingrediente_id: ingrediente.id,
      nombre: ingrediente.nombre,
      emoji: ingrediente.emoji,
      tipo: ingrediente.tipo,
      es_alergeno: ingrediente.es_alergeno,
      alergenos: ingrediente.alergenos,
      created_at: ingrediente.created_at
    }, {
      correlationId: correlation_id
    });
  }

  async publishIngredienteActualizado(ingrediente_id, cambios, correlation_id) {
    await this.eventBus.publish('ingrediente.actualizado', {
      ingrediente_id,
      cambios,
      updated_at: new Date().toISOString()
    }, {
      correlationId: correlation_id
    });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  countByType() {
    const counts = {};
    Array.from(this.ingredientes.values()).forEach(ing => {
      counts[ing.tipo] = (counts[ing.tipo] || 0) + 1;
    });
    return counts;
  }
}

module.exports = IngredientesModule;
