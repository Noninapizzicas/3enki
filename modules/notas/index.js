/**
 * Módulo Notas
 * Gestión de notas rápidas con eventos en tiempo real
 *
 * Siguiendo TEMPLATE_MODULO.md - 100% Event-Driven
 */

class NotasModule {
  constructor() {
    this.name = 'notas';
    this.version = '1.0.0';

    // Estado
    this.notas = new Map();

    // Dependencias (inyectadas por core)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;

    // Métricas internas
    this.stats = {
      creadas: 0,
      actualizadas: 0,
      eliminadas: 0,
      errores: 0
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('notas.loading', { module: this.name });

    // Crear algunas notas de ejemplo
    this._seedData();

    this.logger.info('notas.loaded', {
      module: this.name,
      notas_count: this.notas.size
    });
  }

  async onUnload() {
    this.logger.info('notas.unloading', { module: this.name });
  }

  _seedData() {
    const ejemplos = [
      { titulo: 'Bienvenido a Notas', contenido: 'Este es el módulo de notas de Event-Core. Puedes crear, editar y eliminar notas.', color: 'blue', pinned: true },
      { titulo: 'Compras', contenido: '- Leche\n- Pan\n- Huevos\n- Café', color: 'yellow', pinned: false },
      { titulo: 'Ideas', contenido: 'Integrar con otros módulos via eventos', color: 'green', pinned: false }
    ];

    ejemplos.forEach(nota => {
      const id = `nota_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      this.notas.set(id, {
        id,
        ...nota,
        created_at: new Date().toISOString(),
        updated_at: null
      });
    });
  }

  // ==========================================
  // Validación
  // ==========================================

  _validateCreate(data) {
    const errors = [];

    if (!data.titulo || typeof data.titulo !== 'string' || data.titulo.trim() === '') {
      errors.push('titulo es requerido');
    } else if (data.titulo.length > 100) {
      errors.push('titulo no puede exceder 100 caracteres');
    }

    if (data.contenido && data.contenido.length > 5000) {
      errors.push('contenido no puede exceder 5000 caracteres');
    }

    const coloresValidos = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'];
    if (data.color && !coloresValidos.includes(data.color)) {
      errors.push(`color debe ser uno de: ${coloresValidos.join(', ')}`);
    }

    return errors;
  }

  _validateUpdate(data) {
    const errors = [];

    if (data.titulo !== undefined) {
      if (typeof data.titulo !== 'string' || data.titulo.trim() === '') {
        errors.push('titulo no puede estar vacío');
      } else if (data.titulo.length > 100) {
        errors.push('titulo no puede exceder 100 caracteres');
      }
    }

    if (data.contenido !== undefined && data.contenido.length > 5000) {
      errors.push('contenido no puede exceder 5000 caracteres');
    }

    const coloresValidos = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'];
    if (data.color !== undefined && !coloresValidos.includes(data.color)) {
      errors.push(`color debe ser uno de: ${coloresValidos.join(', ')}`);
    }

    return errors;
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleListNotas(req, context) {
    try {
      const { color, pinned } = req.query || {};

      let notas = Array.from(this.notas.values());

      // Filtros
      if (color) {
        notas = notas.filter(n => n.color === color);
      }
      if (pinned !== undefined) {
        const isPinned = pinned === 'true' || pinned === true;
        notas = notas.filter(n => n.pinned === isPinned);
      }

      // Ordenar: pinned primero, luego por fecha
      notas.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      this.logger.info('notas.listadas', {
        total: notas.length,
        filtros: { color, pinned },
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: { notas, total: notas.length }
      };

    } catch (error) {
      this.stats.errores++;
      this.logger.error('notas.list.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleGetNota(req, context) {
    try {
      const { id } = req.params;
      const nota = this.notas.get(id);

      if (!nota) {
        return {
          status: 404,
          data: { error: `Nota ${id} no encontrada` }
        };
      }

      return { status: 200, data: nota };

    } catch (error) {
      this.stats.errores++;
      this.logger.error('nota.get.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleCreateNota(req, context) {
    const start = Date.now();

    try {
      // Validar
      const errors = this._validateCreate(req.body || {});
      if (errors.length > 0) {
        return { status: 400, data: { errors } };
      }

      const { titulo, contenido = '', color = 'yellow', pinned = false } = req.body;

      // Crear nota
      const nota = {
        id: `nota_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        titulo: titulo.trim(),
        contenido,
        color,
        pinned,
        created_at: new Date().toISOString(),
        updated_at: null
      };

      this.notas.set(nota.id, nota);

      // Métricas
      this.stats.creadas++;
      if (this.metrics) {
        this.metrics.increment('nota.creada.total');
        this.metrics.gauge('nota.activas.count', this.notas.size);
        this.metrics.timing('nota.create.duration', Date.now() - start);
      }

      // Publicar evento
      await this._publishNotaCreada(nota, context.correlationId);

      // Log
      this.logger.info('nota.creada', {
        nota_id: nota.id,
        titulo: nota.titulo,
        color: nota.color,
        correlation_id: context.correlationId,
        duration: Date.now() - start
      });

      return { status: 201, data: nota };

    } catch (error) {
      this.stats.errores++;
      this.logger.error('nota.create.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleUpdateNota(req, context) {
    const start = Date.now();

    try {
      const { id } = req.params;
      const nota = this.notas.get(id);

      if (!nota) {
        return {
          status: 404,
          data: { error: `Nota ${id} no encontrada` }
        };
      }

      // Validar
      const errors = this._validateUpdate(req.body || {});
      if (errors.length > 0) {
        return { status: 400, data: { errors } };
      }

      // Guardar estado anterior
      const previous = { ...nota };

      // Aplicar updates
      const updates = {};
      ['titulo', 'contenido', 'color', 'pinned'].forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
          nota[field] = field === 'titulo' ? req.body[field].trim() : req.body[field];
        }
      });

      nota.updated_at = new Date().toISOString();
      this.notas.set(id, nota);

      // Métricas
      this.stats.actualizadas++;
      if (this.metrics) {
        this.metrics.increment('nota.actualizada.total');
        this.metrics.timing('nota.update.duration', Date.now() - start);
      }

      // Publicar evento
      await this._publishNotaActualizada(nota, updates, previous, context.correlationId);

      // Log
      this.logger.info('nota.actualizada', {
        nota_id: nota.id,
        updates: Object.keys(updates),
        correlation_id: context.correlationId,
        duration: Date.now() - start
      });

      return { status: 200, data: nota };

    } catch (error) {
      this.stats.errores++;
      this.logger.error('nota.update.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleDeleteNota(req, context) {
    try {
      const { id } = req.params;
      const nota = this.notas.get(id);

      if (!nota) {
        return {
          status: 404,
          data: { error: `Nota ${id} no encontrada` }
        };
      }

      // Eliminar
      this.notas.delete(id);

      // Métricas
      this.stats.eliminadas++;
      if (this.metrics) {
        this.metrics.increment('nota.eliminada.total');
        this.metrics.gauge('nota.activas.count', this.notas.size);
      }

      // Publicar evento
      await this._publishNotaEliminada(nota, context.correlationId);

      // Log
      this.logger.info('nota.eliminada', {
        nota_id: id,
        titulo: nota.titulo,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: { message: `Nota "${nota.titulo}" eliminada` }
      };

    } catch (error) {
      this.stats.errores++;
      this.logger.error('nota.delete.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleTogglePin(req, context) {
    try {
      const { id } = req.params;
      const nota = this.notas.get(id);

      if (!nota) {
        return {
          status: 404,
          data: { error: `Nota ${id} no encontrada` }
        };
      }

      const previous = { pinned: nota.pinned };
      nota.pinned = !nota.pinned;
      nota.updated_at = new Date().toISOString();

      // Actualizar métricas de pinned
      if (this.metrics) {
        const pinnedCount = Array.from(this.notas.values()).filter(n => n.pinned).length;
        this.metrics.gauge('nota.pinned.count', pinnedCount);
      }

      // Publicar evento
      await this._publishNotaActualizada(nota, { pinned: nota.pinned }, previous, context.correlationId);

      this.logger.info('nota.pin.toggled', {
        nota_id: id,
        pinned: nota.pinned,
        correlation_id: context.correlationId
      });

      return { status: 200, data: nota };

    } catch (error) {
      this.stats.errores++;
      this.logger.error('nota.pin.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return { status: 500, data: { error: 'Error interno' } };
    }
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    };
  }

  async handleGetMetrics(req, context) {
    const pinnedCount = Array.from(this.notas.values()).filter(n => n.pinned).length;

    return {
      status: 200,
      data: {
        counters: {
          'nota.creada.total': this.stats.creadas,
          'nota.actualizada.total': this.stats.actualizadas,
          'nota.eliminada.total': this.stats.eliminadas,
          'errores.total': this.stats.errores
        },
        gauges: {
          'nota.activas.count': this.notas.size,
          'nota.pinned.count': pinnedCount
        },
        timestamp: new Date().toISOString()
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async _publishNotaCreada(nota, correlationId) {
    if (!this.eventBus) return;

    await this.eventBus.publish('nota.creada', {
      nota_id: nota.id,
      titulo: nota.titulo,
      contenido: nota.contenido,
      color: nota.color,
      pinned: nota.pinned
    }, {
      correlationId
    });
  }

  async _publishNotaActualizada(nota, updates, previous, correlationId) {
    if (!this.eventBus) return;

    await this.eventBus.publish('nota.actualizada', {
      nota_id: nota.id,
      updates,
      previous
    }, {
      correlationId
    });
  }

  async _publishNotaEliminada(nota, correlationId) {
    if (!this.eventBus) return;

    await this.eventBus.publish('nota.eliminada', {
      nota_id: nota.id,
      titulo: nota.titulo
    }, {
      correlationId
    });
  }
}

module.exports = NotasModule;
