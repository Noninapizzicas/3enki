/**
 * pizzepos/categorias v3.0.0 — Catalogo multi-tenant de categorias (POC2 rewrite).
 *
 * Sincroniza desde `carta.actualizada` + expone CRUD manual via 7 ui_handlers.
 *
 * Eventos del bus:
 *   subscribes (1): carta.actualizada (handler onCartaActualizada).
 *   publishes  (3): categoria.{creada, actualizada, orden_actualizado}.
 */

'use strict';

const crypto = require('crypto');

const DEFAULT_PROJECT_ID = 'default';

class CategoriasModule {
  constructor() {
    this.name    = 'categorias';
    this.version = '3.0.0';

    this.eventBus = null;
    this.logger   = null;
    this.metrics  = null;

    this.categoriasPerProject = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });
    this.logger.info('module.loaded',  { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    this.categoriasPerProject.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  _getCategorias(projectId) {
    if (!this.categoriasPerProject.has(projectId)) {
      this.categoriasPerProject.set(projectId, new Map());
    }
    return this.categoriasPerProject.get(projectId);
  }

  // ==========================================
  // Bus handler — sync desde carta.actualizada
  // ==========================================

  async onCartaActualizada(event) {
    const data = this._unwrap(event);
    const { project_id, categorias } = data || {};
    const correlationId = event?.metadata?.correlationId || data?.correlation_id;

    if (!categorias || categorias.length === 0) return;

    if (!project_id) {
      this._logError('categorias.carta_actualizada.no_project_id', {
        categorias_count: categorias.length, correlation_id: correlationId
      }, 'sync', 'INVALID_INPUT');
      return;
    }

    this.logger.info('categorias.sync.received', {
      project_id, categorias_count: categorias.length, correlation_id: correlationId
    });

    const categoriasMap = this._getCategorias(project_id);
    let nuevas       = 0;
    let actualizadas = 0;

    for (const cat of categorias) {
      const existente = categoriasMap.get(cat.id);
      const now       = new Date().toISOString();

      if (!existente) {
        const categoria = {
          id:         cat.id,
          nombre:     cat.nombre,
          emoji:      cat.emoji || '📋',
          orden:      cat.orden !== undefined ? cat.orden : categoriasMap.size,
          activa:     true,
          created_at: now,
          updated_at: now
        };
        categoriasMap.set(cat.id, categoria);
        nuevas++;

        this.metrics?.increment('categoria.creada.total', { project_id });
        await this._publicarEvento('categoria.creada', {
          project_id,
          categoria_id: categoria.id,
          nombre:       categoria.nombre,
          emoji:        categoria.emoji,
          orden:        categoria.orden,
          created_at:   categoria.created_at
        }, data);
      } else {
        const cambios = {};
        if (cat.emoji  && cat.emoji  !== existente.emoji)  { cambios.emoji  = { anterior: existente.emoji,  nuevo: cat.emoji  }; existente.emoji  = cat.emoji; }
        if (cat.nombre && cat.nombre !== existente.nombre) { cambios.nombre = { anterior: existente.nombre, nuevo: cat.nombre }; existente.nombre = cat.nombre; }

        if (Object.keys(cambios).length > 0) {
          existente.updated_at = now;
          categoriasMap.set(cat.id, existente);
          actualizadas++;

          await this._publicarEvento('categoria.actualizada', {
            project_id,
            categoria_id: cat.id,
            cambios,
            updated_at:   now
          }, data);
        }
      }
    }

    this.metrics?.gauge('categoria.total.count',   categoriasMap.size, { project_id });
    this.metrics?.gauge('categoria.activas.count', Array.from(categoriasMap.values()).filter(c => c.activa).length, { project_id });

    this.logger.info('categorias.sincronizadas', {
      project_id, nuevas, actualizadas, total: categoriasMap.size, correlation_id: correlationId
    });
  }

  // ==========================================
  // UI Handlers (auto-wired desde module.json)
  // ==========================================

  async handleListCategorias(data) {
    try {
      const { project_id } = data || {};
      if (!project_id) {
        this._logError('categorias.ui.list.validation_failed', { missing: 'project_id' }, 'ui_list', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      }

      const categorias = Array.from(this._getCategorias(project_id).values())
        .filter(c => c.activa)
        .sort((a, b) => a.orden - b.orden);

      return { status: 200, data: { project_id, categorias, total: categorias.length } };
    } catch (err) {
      return this._handleHandlerError('categorias.ui.list.failed', err, 'ui_list');
    }
  }

  async handleGetCategoria(data) {
    try {
      const { project_id, id } = data || {};
      if (!project_id) {
        this._logError('categorias.ui.get.validation_failed', { missing: 'project_id' }, 'ui_get', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      }
      if (!id) {
        this._logError('categorias.ui.get.validation_failed', { missing: 'id' }, 'ui_get', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }

      const categoria = this._getCategorias(project_id).get(id);
      if (!categoria) {
        this._logError('categorias.ui.get.not_found', { id, project_id }, 'ui_get', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Categoria no encontrada', {
          entity_type: 'categoria', entity_id: id
        });
      }
      return { status: 200, data: categoria };
    } catch (err) {
      return this._handleHandlerError('categorias.ui.get.failed', err, 'ui_get');
    }
  }

  async handleCreateCategoria(data) {
    try {
      const { project_id, nombre, emoji, descripcion, color } = data || {};
      if (!project_id) {
        this._logError('categorias.ui.create.validation_failed', { missing: 'project_id' }, 'ui_create', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      }
      if (!nombre) {
        this._logError('categorias.ui.create.validation_failed', { missing: 'nombre' }, 'ui_create', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      }

      const categoriasMap = this._getCategorias(project_id);
      const categoria_id  = `cat_${this._slugify(nombre)}`;

      if (categoriasMap.has(categoria_id)) {
        this._logError('categorias.ui.create.already_exists', { categoria_id, project_id }, 'ui_create', 'ALREADY_EXISTS');
        return this._errorResponse(409, 'ALREADY_EXISTS', `Categoria "${nombre}" ya existe`, {
          entity_type: 'categoria', entity_id: categoria_id
        });
      }

      const now = new Date().toISOString();
      const categoria = {
        id:         categoria_id,
        nombre,
        emoji:      emoji || '📋',
        orden:      categoriasMap.size,
        activa:     true,
        descripcion: descripcion || null,
        color:       color || null,
        created_at: now,
        updated_at: now
      };

      categoriasMap.set(categoria_id, categoria);
      this.metrics?.increment('categoria.creada.total', { project_id, source: 'manual' });

      await this._publicarEvento('categoria.creada', {
        project_id,
        categoria_id: categoria.id,
        nombre:       categoria.nombre,
        emoji:        categoria.emoji,
        orden:        categoria.orden,
        created_at:   categoria.created_at
      }, data);

      this.logger.info('categoria.creada', { project_id, categoria_id, nombre });
      return { status: 201, data: categoria };
    } catch (err) {
      return this._handleHandlerError('categorias.ui.create.failed', err, 'ui_create');
    }
  }

  async handleUpdateCategoria(data) {
    try {
      const { project_id, id, ...updates } = data || {};
      if (!project_id) {
        this._logError('categorias.ui.update.validation_failed', { missing: 'project_id' }, 'ui_update', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      }
      if (!id) {
        this._logError('categorias.ui.update.validation_failed', { missing: 'id' }, 'ui_update', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }

      const categoriasMap = this._getCategorias(project_id);
      const categoria     = categoriasMap.get(id);
      if (!categoria) {
        this._logError('categorias.ui.update.not_found', { id, project_id }, 'ui_update', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Categoria no encontrada', {
          entity_type: 'categoria', entity_id: id
        });
      }

      const cambios = {};
      for (const key of Object.keys(updates)) {
        if (updates[key] !== categoria[key]) {
          cambios[key]   = { anterior: categoria[key], nuevo: updates[key] };
          categoria[key] = updates[key];
        }
      }

      const now = new Date().toISOString();
      categoria.updated_at = now;
      categoriasMap.set(id, categoria);

      this.metrics?.increment('categoria.actualizada.total', { project_id });
      await this._publicarEvento('categoria.actualizada', {
        project_id,
        categoria_id: id,
        cambios,
        updated_at:   now
      }, data);

      this.logger.info('categoria.actualizada', {
        project_id, categoria_id: id, cambios_count: Object.keys(cambios).length
      });
      return { status: 200, data: categoria };
    } catch (err) {
      return this._handleHandlerError('categorias.ui.update.failed', err, 'ui_update');
    }
  }

  async handleReorderCategorias(data) {
    try {
      const { project_id, orden } = data || {};
      if (!project_id) {
        this._logError('categorias.ui.reorder.validation_failed', { missing: 'project_id' }, 'ui_reorder', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      }
      if (!orden || !Array.isArray(orden)) {
        this._logError('categorias.ui.reorder.validation_failed', { missing: 'orden' }, 'ui_reorder', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'orden array es requerido', { field: 'orden' });
      }

      const categoriasMap = this._getCategorias(project_id);
      const nuevo_orden   = [];
      const now           = new Date().toISOString();

      orden.forEach((item, idx) => {
        const categoria = categoriasMap.get(item.categoria_id);
        if (categoria) {
          categoria.orden      = idx;
          categoria.updated_at = now;
          categoriasMap.set(item.categoria_id, categoria);
          nuevo_orden.push({ categoria_id: item.categoria_id, orden: idx });
        }
      });

      await this._publicarEvento('categoria.orden_actualizado', {
        project_id,
        nuevo_orden,
        updated_at: now
      }, data);

      this.logger.info('categorias.reordenadas', { project_id, count: nuevo_orden.length });
      return { status: 200, data: { project_id, nuevo_orden, user_hint: 'Orden actualizado' } };
    } catch (err) {
      return this._handleHandlerError('categorias.ui.reorder.failed', err, 'ui_reorder');
    }
  }

  async handleHealthCheck() {
    try {
      let totalCategorias = 0;
      let totalActivas    = 0;
      for (const [, categorias] of this.categoriasPerProject) {
        totalCategorias += categorias.size;
        totalActivas    += Array.from(categorias.values()).filter(c => c.activa).length;
      }

      return {
        status: 200,
        data: {
          status:  'healthy',
          module:  this.name,
          version: this.version,
          catalogo: {
            proyectos: this.categoriasPerProject.size,
            total:     totalCategorias,
            activas:   totalActivas
          }
        }
      };
    } catch (err) {
      return this._handleHandlerError('categorias.ui.health.failed', err, 'ui_health');
    }
  }

  async handleGetMetrics() {
    try {
      let totalCategorias = 0;
      let totalActivas    = 0;
      for (const [, categorias] of this.categoriasPerProject) {
        totalCategorias += categorias.size;
        totalActivas    += Array.from(categorias.values()).filter(c => c.activa).length;
      }

      return {
        status: 200,
        data: {
          gauges: {
            'categoria.total.count':   totalCategorias,
            'categoria.activas.count': totalActivas,
            'categoria.proyectos':     this.categoriasPerProject.size
          }
        }
      };
    } catch (err) {
      return this._handleHandlerError('categorias.ui.metrics.failed', err, 'ui_metrics');
    }
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'           ? 400 :
                   code === 'RESOURCE_NOT_FOUND'      ? 404 :
                   code === 'PERMISSION_DENIED'       ? 403 :
                   code === 'ALREADY_EXISTS'          ? 409 :
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'DEPENDENCY_UNAVAILABLE'  ? 503 :
                   code === 'EXTERNAL_API_FAILED'     ? 502 :
                   code === 'TIMEOUT'                 ? 504 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('categorias.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no encontrad'))                          return 'RESOURCE_NOT_FOUND';
    if (msg.includes('already exists') || msg.includes('ya existe'))                        return 'ALREADY_EXISTS';
    if (msg.includes('permission') || msg.includes('forbidden'))                            return 'PERMISSION_DENIED';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) return;
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload,
      project_id:     payload?.project_id || sourcePayload?.project_id || DEFAULT_PROJECT_ID
    };
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger.error('categorias.publish_error', { event: name, error: err.message });
      this.metrics?.increment('categorias.errors', { kind: 'publish', code: 'UNKNOWN_ERROR' });
    }
  }

  // 5o helper auxiliar — slugify canonico (preservado del monolito con prefix)
  _slugify(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // 6o helper auxiliar — publishUIState (push de estado a UI mediante evento canonico)
  async _publishUIState(domain, state, sourcePayload = null) {
    await this._publicarEvento(`${domain}.ui_state`, state, sourcePayload);
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('categorias.errors', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }
}

module.exports = CategoriasModule;
