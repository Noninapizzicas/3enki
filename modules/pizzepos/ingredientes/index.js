/**
 * pizzepos/ingredientes v5.0.0 — Catalogo de ingredientes (POC2 rewrite).
 *
 * Catalogo singleton organizado por GRUPO (categoria de producto).
 * Fuente UNICA de precios de ingredientes (precio_extra).
 *
 * Persiste a `{storagePath}/ingredientes.json` atomicamente.
 *
 * Eventos del bus:
 *   subscribes (4): project.activated, carta.actualizada, producto.creado,
 *                   ingrediente.actualizado (autoreferencial — loop-safe).
 *   publishes  (2): ingrediente.creado, ingrediente.actualizado.
 *
 * 9 ui_handlers (auto-wired desde module.json).
 */

'use strict';

const fs     = require('fs').promises;
const path   = require('path');
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
const DEFAULT_PROJECT_ID = 'default';

class IngredientesModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'ingredientes';
    this.version = '5.0.0';
    this.ingredientes  = new Map();
    this.storageSection = 'pizzepos';
    this.storagePath    = null;
    this.projectId      = null;
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
    this.ingredientes.clear();
    this.storagePath = null;
    this.projectId   = null;
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus handlers
  // ==========================================

  async onProjectActivated(event) {
    const data = this._unwrap(event);
    const { project_id, base_path } = data || {};
    if (!base_path) return;

    this.storagePath = path.join(base_path, 'storage', this.storageSection);
    this.projectId   = project_id || null;

    const json = await this._readJsonSafe(path.join(this.storagePath, 'ingredientes.json'), 'load_from_disk');
    if (json?.ingredientes?.length > 0) {
      for (const ing of json.ingredientes) {
        this.ingredientes.set(ing.id, { ...ing, disponible: ing.disponible !== false });
      }
      this.logger.info('ingredientes.loaded_from_disk', {
        project_id, total: this.ingredientes.size
      });
    }
  }

  async onCartaActualizada(event) {
    const eventData     = this._unwrap(event);
    const correlationId = event?.metadata?.correlationId || eventData?.correlation_id;
    const { ingredientes_catalogo, productos, project_id } = eventData;

    const start_time = Date.now();
    let nuevos       = 0;
    let actualizados = 0;

    if (ingredientes_catalogo?.length > 0) {
      this.logger.info('ingredientes.sync.from_carta', {
        ingredientes_count: ingredientes_catalogo.length, correlation_id: correlationId
      });

      for (const ing of ingredientes_catalogo) {
        const existente = this.ingredientes.get(ing.id);
        if (!existente) {
          const ingrediente = {
            ...ing,
            tipo:         ing.tipo || this._clasificarIngrediente(ing.nombre),
            grupos:       ing.grupos || [],
            disponible:   true,
            precio_extra: ing.precio_extra || 0,
            created_at:   new Date().toISOString(),
            updated_at:   new Date().toISOString()
          };
          this.ingredientes.set(ing.id, ingrediente);
          nuevos++;
          this.metrics?.increment('ingrediente.creado.total');
          await this._publicarEvento('ingrediente.creado', this._buildCreadoPayload(ingrediente, project_id), eventData);
        } else {
          const gruposMerged = [...new Set([...(existente.grupos || []), ...(ing.grupos || [])])];
          const actualizado = {
            ...existente, ...ing,
            grupos:     gruposMerged,
            updated_at: new Date().toISOString()
          };
          this.ingredientes.set(ing.id, actualizado);
          actualizados++;
          await this._publicarEvento('ingrediente.actualizado', {
            ingrediente_id: ing.id,
            cambios:        { emoji: ing.emoji, grupos: gruposMerged },
            project_id,
            updated_at:     actualizado.updated_at
          }, eventData);
        }
      }
    }

    if (productos?.length > 0) {
      for (const prod of productos) {
        const grupo = prod.categoria || 'otro';
        const base  = prod.ingredientes_base || prod.ingredientes || [];
        for (const ing of base) {
          if (!ing.id && !ing.nombre) continue;
          const id        = ing.id || `ing_${this._slugify(ing.nombre)}`;
          const existente = this.ingredientes.get(id);

          if (!existente) {
            const ingrediente = {
              id,
              nombre:       ing.nombre,
              emoji:        ing.emoji || '',
              tipo:         ing.tipo || this._clasificarIngrediente(ing.nombre),
              es_alergeno:  false,
              precio_extra: ing.precio_extra ?? 0,
              grupos:       [grupo],
              disponible:   true,
              created_at:   new Date().toISOString(),
              updated_at:   new Date().toISOString()
            };
            this.ingredientes.set(id, ingrediente);
            nuevos++;
            this.metrics?.increment('ingrediente.creado.total');
            await this._publicarEvento('ingrediente.creado', this._buildCreadoPayload(ingrediente, project_id), eventData);
          } else {
            existente.grupos = existente.grupos || [];
            if (!existente.grupos.includes(grupo)) {
              existente.grupos.push(grupo);
              existente.updated_at = new Date().toISOString();
              this.ingredientes.set(id, existente);
            }
          }
        }
      }
    }

    if (nuevos > 0 || actualizados > 0) {
      this.metrics?.gauge('ingrediente.total.count', this.ingredientes.size);
      this.metrics?.gauge(
        'ingrediente.alergenos.count',
        Array.from(this.ingredientes.values()).filter(i => i.es_alergeno).length
      );
      this.metrics?.timing('ingrediente.sync.duration', Date.now() - start_time);

      await this._saveToDisk();

      this.logger.info('ingredientes.sincronizados', {
        nuevos, actualizados, total: this.ingredientes.size,
        correlation_id: correlationId,
        duration: Date.now() - start_time
      });
    }
  }

  async onProductoCreado(event) {
    const eventData     = this._unwrap(event);
    const correlationId = event?.metadata?.correlationId || eventData?.correlation_id;
    const { ingredientes_base, producto_id, categoria, project_id } = eventData;

    if (!ingredientes_base?.length) return;

    const grupo = categoria || 'otro';
    let nuevos = 0;
    let merges = 0;

    for (const ing of ingredientes_base) {
      const existente = this.ingredientes.get(ing.id);
      if (!existente) {
        const ingrediente = {
          ...ing,
          tipo:         ing.tipo || this._clasificarIngrediente(ing.nombre),
          grupos:       [grupo],
          disponible:   true,
          precio_extra: ing.precio_extra ?? 0,
          created_at:   new Date().toISOString(),
          updated_at:   new Date().toISOString()
        };
        this.ingredientes.set(ing.id, ingrediente);
        nuevos++;
        this.metrics?.increment('ingrediente.creado.total');
        await this._publicarEvento('ingrediente.creado', this._buildCreadoPayload(ingrediente, project_id), eventData);
      } else {
        existente.grupos = existente.grupos || [];
        if (!existente.grupos.includes(grupo)) {
          existente.grupos.push(grupo);
          existente.updated_at = new Date().toISOString();
          this.ingredientes.set(ing.id, existente);
          merges++;
        }
      }
    }

    if (nuevos > 0 || merges > 0) {
      await this._saveToDisk();
      this.logger.info('ingredientes.from_producto', {
        producto_id, grupo, nuevos, merges, correlation_id: correlationId
      });
    }
  }

  /**
   * Recibe ingrediente.actualizado de fuentes externas (autoreferencial).
   * Loop-safe: solo aplica si el valor es distinto al existente.
   */
  async onIngredienteActualizadoExterno(event) {
    const eventData = this._unwrap(event);
    const { ingrediente_id, cambios } = eventData;
    if (!ingrediente_id || !cambios) return;

    const existente = this.ingredientes.get(ingrediente_id);
    if (!existente) return;

    let changed = false;
    for (const [campo, valores] of Object.entries(cambios)) {
      const nuevoValor = valores?.nuevo !== undefined ? valores.nuevo : valores;
      if (existente[campo] !== nuevoValor) {
        existente[campo] = nuevoValor;
        changed = true;
      }
    }

    if (changed) {
      existente.updated_at = new Date().toISOString();
      this.ingredientes.set(ingrediente_id, existente);
      await this._saveToDisk();
      this.logger.info('ingredientes.synced_from_external', {
        ingrediente_id, campos: Object.keys(cambios)
      });
    }
  }

  // ==========================================
  // UI Handlers (auto-wired desde module.json)
  // ==========================================

  async handleListIngredientes(data) {
    try {
      const { tipo, grupo, alergeno } = data || {};

      let ingredientes = Array.from(this.ingredientes.values()).filter(i => i.disponible !== false);
      if (grupo)    ingredientes = ingredientes.filter(i => i.grupos?.includes(grupo));
      if (tipo)     ingredientes = ingredientes.filter(i => i.tipo === tipo);
      if (alergeno === 'true' || alergeno === true) {
        ingredientes = ingredientes.filter(i => i.es_alergeno === true);
      }

      ingredientes.sort((a, b) => {
        if (a.tipo !== b.tipo) return (a.tipo || '').localeCompare(b.tipo || '');
        return a.nombre.localeCompare(b.nombre);
      });

      return { status: 200, data: { ingredientes, total: ingredientes.length } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.list.failed', err, 'ui_list');
    }
  }

  async handleGetIngrediente(data) {
    try {
      const { id } = data || {};
      if (!id) {
        this._logError('ingredientes.ui.get.validation_failed', { missing: 'id' }, 'ui_get', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }
      const ingrediente = this.ingredientes.get(id);
      if (!ingrediente) {
        this._logError('ingredientes.ui.get.not_found', { id }, 'ui_get', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Ingrediente no encontrado', {
          entity_type: 'ingrediente', entity_id: id
        });
      }
      return { status: 200, data: ingrediente };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.get.failed', err, 'ui_get');
    }
  }

  async handleGetPrecio(data) {
    try {
      const { ingrediente_id } = data || {};
      if (!ingrediente_id) {
        this._logError('ingredientes.ui.get_precio.validation_failed', { missing: 'ingrediente_id' }, 'ui_get_precio', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'ingrediente_id es requerido', { field: 'ingrediente_id' });
      }
      const ingrediente = this.ingredientes.get(ingrediente_id);
      if (!ingrediente) {
        this._logError('ingredientes.ui.get_precio.not_found', { ingrediente_id }, 'ui_get_precio', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Ingrediente no encontrado', {
          entity_type: 'ingrediente', entity_id: ingrediente_id
        });
      }
      return {
        status: 200,
        data: {
          ingrediente_id,
          precio_extra: ingrediente.precio_extra || 0,
          disponible:   ingrediente.disponible !== false
        }
      };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.get_precio.failed', err, 'ui_get_precio');
    }
  }

  async handleSearchIngredientes(data) {
    try {
      const { q, grupo } = data || {};
      if (!q) {
        this._logError('ingredientes.ui.search.validation_failed', { missing: 'q' }, 'ui_search', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'q (query) es requerido', { field: 'q' });
      }

      const searchTerm = q.toLowerCase();
      let resultados = Array.from(this.ingredientes.values())
        .filter(i => i.nombre.toLowerCase().includes(searchTerm));
      if (grupo) resultados = resultados.filter(i => i.grupos?.includes(grupo));

      return { status: 200, data: { resultados, total: resultados.length, query: q } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.search.failed', err, 'ui_search');
    }
  }

  async handleListAlergenos() {
    try {
      const alergenos = Array.from(this.ingredientes.values()).filter(i => i.es_alergeno === true);
      const porTipo = {};
      for (const ing of alergenos) {
        if (ing.alergenos?.length > 0) {
          for (const alergeno of ing.alergenos) {
            if (!porTipo[alergeno]) porTipo[alergeno] = [];
            porTipo[alergeno].push({ id: ing.id, nombre: ing.nombre, emoji: ing.emoji });
          }
        }
      }
      return { status: 200, data: { alergenos, total: alergenos.length, por_tipo: porTipo } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.alergenos.failed', err, 'ui_alergenos');
    }
  }

  async handleUpdateIngrediente(data) {
    try {
      const { id, ...updates } = data || {};
      if (!id) {
        this._logError('ingredientes.ui.update.validation_failed', { missing: 'id' }, 'ui_update', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }

      const ingrediente = this.ingredientes.get(id);
      if (!ingrediente) {
        this._logError('ingredientes.ui.update.not_found', { id }, 'ui_update', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Ingrediente no encontrado', {
          entity_type: 'ingrediente', entity_id: id
        });
      }

      const cambios = {};
      for (const key of Object.keys(updates)) {
        if (updates[key] !== ingrediente[key]) {
          cambios[key] = { anterior: ingrediente[key], nuevo: updates[key] };
          ingrediente[key] = updates[key];
        }
      }

      ingrediente.updated_at = new Date().toISOString();
      this.ingredientes.set(id, ingrediente);

      this.metrics?.increment('ingrediente.actualizado.total');
      await this._publicarEvento('ingrediente.actualizado', {
        ingrediente_id: id,
        cambios,
        updated_at:     ingrediente.updated_at
      }, data);
      await this._saveToDisk();

      this.logger.info('ingrediente.actualizado', {
        ingrediente_id: id, cambios_count: Object.keys(cambios).length
      });

      return { status: 200, data: ingrediente };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.update.failed', err, 'ui_update');
    }
  }

  /**
   * Cambiar precios en bloque. Modos:
   *   { id, precio_extra }                 → individual
   *   { tipo, precio_extra }               → todos los de un tipo
   *   { grupo, precio_extra }              → todos los de un grupo
   *   { tipo, porcentaje }                 → subir/bajar % a un tipo
   *   { grupo, tipo, precio_extra }        → tipo dentro de un grupo
   */
  async handleUpdatePrecios(data) {
    try {
      const { id, tipo, grupo, precio_extra, porcentaje } = data || {};
      if (precio_extra == null && porcentaje == null) {
        this._logError('ingredientes.ui.update_precios.validation_failed', { missing: 'precio_extra|porcentaje' }, 'ui_update_precios', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'precio_extra o porcentaje es requerido', {
          fields: ['precio_extra', 'porcentaje']
        });
      }

      let afectados = [];
      if (id) {
        const ing = this.ingredientes.get(id);
        if (!ing) {
          this._logError('ingredientes.ui.update_precios.not_found', { id }, 'ui_update_precios', 'RESOURCE_NOT_FOUND');
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Ingrediente no encontrado', {
            entity_type: 'ingrediente', entity_id: id
          });
        }
        afectados = [ing];
      } else {
        afectados = Array.from(this.ingredientes.values());
        if (grupo) afectados = afectados.filter(i => i.grupos?.includes(grupo));
        if (tipo)  afectados = afectados.filter(i => i.tipo === tipo);
      }

      if (afectados.length === 0) {
        this._logError('ingredientes.ui.update_precios.no_match', { id, tipo, grupo }, 'ui_update_precios', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No se encontraron ingredientes con ese filtro', {
          filter: { id, tipo, grupo }
        });
      }

      const actualizados = [];
      for (const ing of afectados) {
        const anterior = ing.precio_extra || 0;
        if (porcentaje != null) {
          ing.precio_extra = Math.round(anterior * (1 + porcentaje / 100) * 100) / 100;
        } else {
          ing.precio_extra = precio_extra;
        }
        ing.updated_at = new Date().toISOString();
        this.ingredientes.set(ing.id, ing);
        actualizados.push({ id: ing.id, nombre: ing.nombre, anterior, nuevo: ing.precio_extra });

        await this._publicarEvento('ingrediente.actualizado', {
          ingrediente_id: ing.id,
          cambios:        { precio_extra: { anterior, nuevo: ing.precio_extra } },
          updated_at:     ing.updated_at
        }, data);
      }

      await this._saveToDisk();

      this.logger.info('ingredientes.precios_actualizados', {
        filtro: { id, tipo, grupo, precio_extra, porcentaje },
        afectados: actualizados.length
      });

      return { status: 200, data: { actualizados, total: actualizados.length } };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.update_precios.failed', err, 'ui_update_precios');
    }
  }

  async handleHealthCheck() {
    try {
      return {
        status: 200,
        data: {
          status:  'healthy',
          module:  this.name,
          version: this.version,
          catalogo: {
            total:     this.ingredientes.size,
            alergenos: Array.from(this.ingredientes.values()).filter(i => i.es_alergeno).length,
            por_tipo:  this._countByType(),
            por_grupo: this._countByGroup()
          }
        }
      };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.health.failed', err, 'ui_health');
    }
  }

  async handleGetMetrics() {
    try {
      return {
        status: 200,
        data: {
          gauges: {
            'ingrediente.total.count':     this.ingredientes.size,
            'ingrediente.alergenos.count': Array.from(this.ingredientes.values()).filter(i => i.es_alergeno).length
          },
          por_tipo:  this._countByType(),
          por_grupo: this._countByGroup()
        }
      };
    } catch (err) {
      return this._handleHandlerError('ingredientes.ui.metrics.failed', err, 'ui_metrics');
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
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'ALREADY_EXISTS'          ? 409 :
                   code === 'UPSTREAM_UNREACHABLE'  ? 503 :
                   code === 'UPSTREAM_TIMEOUT'                 ? 504 :
                   code === 'UNKNOWN_ERROR'        ? 500 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('ingredientes.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg  = (err?.message || '').toLowerCase();
    const ecod = err?.code || '';
    if (ecod === 'ENOENT' || msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid'))                            return 'INVALID_INPUT';
    if (ecod && ecod.startsWith('E'))                                                    return 'UNKNOWN_ERROR';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) return;
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload,
      project_id:     payload?.project_id || sourcePayload?.project_id || this.projectId || DEFAULT_PROJECT_ID
    };
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger.error('ingredientes.publish_error', { event: name, error: err.message });
      this.metrics?.increment('ingredientes.errors', { kind: 'publish', code: 'UNKNOWN_ERROR' });
    }
  }

  // 5o helper auxiliar — escritura atomica .tmp + rename
  async _atomicWriteFile(absPath, contents) {
    const tmpPath = absPath + '.tmp';
    await fs.writeFile(tmpPath, contents, 'utf-8');
    await fs.rename(tmpPath, absPath);
  }

  // 6o helper — lectura JSON con log+metric en error (no swallow)
  async _readJsonSafe(filePath, kind) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('ingredientes.read_error', { file: filePath, kind, error: err.message });
        this.metrics?.increment('ingredientes.errors', { kind: kind || 'read_json', code: this._classifyHandlerError(err) });
      }
      return null;
    }
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('ingredientes.errors', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }

  // ==========================================
  // Internals — persistencia + classifier + agregaciones
  // ==========================================

  async _saveToDisk() {
    if (!this.storagePath) return;
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      const filePath = path.join(this.storagePath, 'ingredientes.json');
      const data = {
        ingredientes: Array.from(this.ingredientes.values()),
        updated_at:   new Date().toISOString()
      };
      await this._atomicWriteFile(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
      this.logger.warn('ingredientes.disk.save_failed', { error: err.message });
      this.metrics?.increment('ingredientes.errors', { kind: 'save_to_disk', code: 'UNKNOWN_ERROR' });
    }
  }

  _buildCreadoPayload(ingrediente, project_id) {
    return {
      project_id,
      ingrediente_id: ingrediente.id,
      nombre:         ingrediente.nombre,
      emoji:          ingrediente.emoji,
      tipo:           ingrediente.tipo,
      grupos:         ingrediente.grupos,
      es_alergeno:    ingrediente.es_alergeno,
      alergenos:      ingrediente.alergenos,
      created_at:     ingrediente.created_at
    };
  }

  /**
   * Clasifica un ingrediente por nombre (fallback para cartas sin tipo).
   */
  _clasificarIngrediente(nombre) {
    if (!nombre) return 'otro';
    const n = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/mozzarella|queso|mezcla de quesos|parmesano|gorgonzola|cheddar|emmental|brie|gouda|provolone|roquefort/.test(n)) return 'queso';
    if (/bacon|pollo|ternera|carne|york|jamon|pepperoni|peperoni|salchich|chorizo|lomo|cerdo|pavo|salami|anchoa/.test(n)) return 'carne';
    if (/gambas|langostino|atun|salmon|marisco|pulpo|calamar|mejillon|surimi/.test(n))                                     return 'marisco';
    if (/salsa|nata|pesto|carbonara|ketchup|mayonesa|alioli|mostaza/.test(n))                                              return 'salsa';
    if (/tomate|cebolla|pimiento|champi[nñ]on|seta|aceituna|oliva|alcachofa|esparrago|espinaca|rucula|albahaca|oregano|ajo|maiz|pi[nñ]a|jalape[nñ]o|pepino|lechuga|zanahoria|berenjena|calabacin/.test(n)) return 'verdura';
    if (/masa|harina|levadura/.test(n)) return 'masa';
    return 'otro';
  }

  _slugify(text) {
    if (!text) return 'sin_nombre';
    return String(text).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'sin_nombre';
  }

  _countByType() {
    const counts = {};
    for (const ing of this.ingredientes.values()) {
      counts[ing.tipo] = (counts[ing.tipo] || 0) + 1;
    }
    return counts;
  }

  _countByGroup() {
    const counts = {};
    for (const ing of this.ingredientes.values()) {
      for (const g of ing.grupos || []) {
        counts[g] = (counts[g] || 0) + 1;
      }
    }
    return counts;
  }
}

module.exports = IngredientesModule;
