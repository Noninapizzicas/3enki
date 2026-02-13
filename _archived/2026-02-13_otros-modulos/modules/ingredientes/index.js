/**
 * Módulo Ingredientes v1.0
 * Catálogo de ingredientes - Actualizado desde menús generados por IA
 */

class IngredientesModule {
  constructor() {
    this.name = 'ingredientes';
    this.version = '1.0.0';

    // Estado
    this.ingredientes = new Map(); // ingrediente_id -> ingrediente

    // Dependencias (inyectadas)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('modulo.loading', { module: this.name });

    await this.subscribeToEvents();

    this.logger.info('modulo.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('menu.generado', this.onMenuGenerado.bind(this));
    await this.eventBus.subscribe('producto.creado', this.onProductoCreado.bind(this));
  }

  async onMenuGenerado(event) {
    const { ingredientes_catalogo } = event.payload;

    if (!ingredientes_catalogo || ingredientes_catalogo.length === 0) {
      return;
    }

    this.logger.info('menu.generado.received', {
      ingredientes_count: ingredientes_catalogo.length,
      correlation_id: event.correlation_id
    });

    const start_time = Date.now();
    let nuevos = 0;
    let actualizados = 0;

    for (const ing of ingredientes_catalogo) {
      const existente = this.ingredientes.get(ing.id);

      if (!existente) {
        // Crear nuevo ingrediente
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
        await this.publishIngredienteCreado(ingrediente, event.correlation_id);

      } else {
        // Actualizar existente (emoji, tipo, etc)
        const actualizado = {
          ...existente,
          ...ing,
          updated_at: new Date().toISOString()
        };

        this.ingredientes.set(ing.id, actualizado);
        actualizados++;

        await this.publishIngredienteActualizado(ing.id, { emoji: ing.emoji }, event.correlation_id);
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
      correlation_id: event.correlation_id,
      duration: Date.now() - start_time
    });
  }

  async onProductoCreado(event) {
    const { ingredientes_base } = event.payload;

    if (!ingredientes_base || ingredientes_base.length === 0) {
      return;
    }

    // Registrar ingredientes que no existen
    for (const ing of ingredientes_base) {
      if (!this.ingredientes.has(ing.id)) {
        const ingrediente = {
          ...ing,
          disponible: true,
          precio_extra: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        this.ingredientes.set(ing.id, ingrediente);

        this.metrics.increment('ingrediente.creado.total');
        await this.publishIngredienteCreado(ingrediente, event.correlation_id);

        this.logger.info('ingrediente.creado', {
          ingrediente_id: ing.id,
          nombre: ing.nombre,
          from_producto: event.payload.producto_id,
          correlation_id: event.correlation_id
        });
      }
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleListIngredientes(req) {
    const { tipo, alergeno } = req.query || {};

    let ingredientes = Array.from(this.ingredientes.values());

    // Filtros
    if (tipo) {
      ingredientes = ingredientes.filter(i => i.tipo === tipo);
    }

    if (alergeno === 'true') {
      ingredientes = ingredientes.filter(i => i.es_alergeno === true);
    }

    // Ordenar por tipo y nombre
    ingredientes.sort((a, b) => {
      if (a.tipo !== b.tipo) {
        return a.tipo.localeCompare(b.tipo);
      }
      return a.nombre.localeCompare(b.nombre);
    });

    return {
      status: 200,
      data: {
        ingredientes,
        total: ingredientes.length
      }
    };
  }

  async handleGetIngrediente(req) {
    const { id } = req.params;
    const ingrediente = this.ingredientes.get(id);

    if (!ingrediente) {
      return {
        status: 404,
        data: { error: 'Ingrediente no encontrado' }
      };
    }

    return {
      status: 200,
      data: ingrediente
    };
  }

  async handleSearchIngredientes(req) {
    const { q } = req.query || {};

    if (!q) {
      return {
        status: 400,
        data: { error: 'Parámetro "q" requerido' }
      };
    }

    const searchTerm = q.toLowerCase();
    const resultados = Array.from(this.ingredientes.values())
      .filter(i => i.nombre.toLowerCase().includes(searchTerm));

    return {
      status: 200,
      data: {
        resultados,
        total: resultados.length,
        query: q
      }
    };
  }

  async handleListAlergenos(req) {
    const alergenos = Array.from(this.ingredientes.values())
      .filter(i => i.es_alergeno === true);

    // Agrupar por tipo de alérgeno
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
      data: {
        alergenos,
        total: alergenos.length,
        por_tipo: porTipo
      }
    };
  }

  async handleUpdateIngrediente(req) {
    const { id } = req.params;
    const updates = req.body;

    const ingrediente = this.ingredientes.get(id);
    if (!ingrediente) {
      return {
        status: 404,
        data: { error: 'Ingrediente no encontrado' }
      };
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
    await this.publishIngredienteActualizado(id, cambios, req.correlationId || req.request_id);

    this.logger.info('ingrediente.actualizado', {
      ingrediente_id: id,
      cambios,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: ingrediente
    };
  }

  async handleHealthCheck(req) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: this.version,
        catalogo: {
          total: this.ingredientes.size,
          alergenos: Array.from(this.ingredientes.values()).filter(i => i.es_alergeno).length,
          por_tipo: this.countByType()
        }
      }
    };
  }

  async handleGetMetrics(req) {
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
