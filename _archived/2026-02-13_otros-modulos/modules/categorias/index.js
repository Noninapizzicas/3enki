/**
 * Módulo Categorias v1.0
 * Catálogo de categorías - Actualizado desde menús generados por IA
 */

class CategoriasModule {
  constructor() {
    this.name = 'categorias';
    this.version = '1.0.0';

    // Estado
    this.categorias = new Map(); // categoria_id -> categoria

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
  }

  async onMenuGenerado(event) {
    const { categorias } = event.payload;

    if (!categorias || categorias.length === 0) {
      return;
    }

    this.logger.info('menu.generado.received', {
      categorias_count: categorias.length,
      correlation_id: event.correlation_id
    });

    let nuevas = 0;
    let actualizadas = 0;

    for (const cat of categorias) {
      const existente = this.categorias.get(cat.id);

      if (!existente) {
        // Crear nueva categoría
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
        await this.publishCategoriaCreada(categoria, event.correlation_id);

      } else {
        // Actualizar existente (emoji, nombre, etc)
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

          await this.publishCategoriaActualizada(cat.id, cambios, event.correlation_id);
        }
      }
    }

    this.metrics.gauge('categoria.total.count', this.categorias.size);
    this.metrics.gauge('categoria.activas.count',
      Array.from(this.categorias.values()).filter(c => c.activa).length
    );

    this.logger.info('categorias.sincronizadas', {
      nuevas,
      actualizadas,
      total: this.categorias.size,
      correlation_id: event.correlation_id
    });
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleListCategorias(req) {
    const categorias = Array.from(this.categorias.values())
      .filter(c => c.activa)
      .sort((a, b) => a.orden - b.orden);

    return {
      status: 200,
      data: {
        categorias,
        total: categorias.length
      }
    };
  }

  async handleGetCategoria(req) {
    const { id } = req.params;
    const categoria = this.categorias.get(id);

    if (!categoria) {
      return {
        status: 404,
        data: { error: 'Categoría no encontrada' }
      };
    }

    return {
      status: 200,
      data: categoria
    };
  }

  async handleCreateCategoria(req) {
    const { nombre, emoji, descripcion, color } = req.body;

    if (!nombre) {
      return {
        status: 400,
        data: { error: 'nombre requerido' }
      };
    }

    const categoria_id = `cat_${this.slugify(nombre)}`;

    if (this.categorias.has(categoria_id)) {
      return {
        status: 409,
        data: { error: 'Categoría ya existe' }
      };
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
    await this.publishCategoriaCreada(categoria, req.correlationId || req.request_id);

    this.logger.info('categoria.creada', {
      categoria_id,
      nombre,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 201,
      data: categoria
    };
  }

  async handleUpdateCategoria(req) {
    const { id } = req.params;
    const updates = req.body;

    const categoria = this.categorias.get(id);
    if (!categoria) {
      return {
        status: 404,
        data: { error: 'Categoría no encontrada' }
      };
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
    await this.publishCategoriaActualizada(id, cambios, req.correlationId || req.request_id);

    this.logger.info('categoria.actualizada', {
      categoria_id: id,
      cambios,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: categoria
    };
  }

  async handleReorderCategorias(req) {
    const { orden } = req.body;

    if (!orden || !Array.isArray(orden)) {
      return {
        status: 400,
        data: { error: 'orden array requerido' }
      };
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

    await this.publishOrdenActualizado(nuevo_orden, req.correlationId || req.request_id);

    this.logger.info('categorias.reordenadas', {
      count: nuevo_orden.length,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: {
        message: 'Orden actualizado',
        nuevo_orden
      }
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
          total: this.categorias.size,
          activas: Array.from(this.categorias.values()).filter(c => c.activa).length
        }
      }
    };
  }

  async handleGetMetrics(req) {
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
