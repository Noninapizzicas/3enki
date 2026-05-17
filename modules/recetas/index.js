/**
 * Modulo `recetas` v4.0.0
 *
 * Aggregate root del subsistema-recetario. Dueno del dato canonico de
 * receta + catalogo de ingredientes. Persistencia json-per-project via bus
 * (data/projects/{slug}/recetas.json). Cero SQL, cero schema migrations.
 *
 * Cumple los 24 contratos transversales:
 *   - class RecetasModule extends BaseModule.
 *   - Override _publicarEvento para anadir project_id + user_id canonicos.
 *   - Toda respuesta { status, data | error: { code, message, details? } }.
 *   - Persistencia json-per-project via bus (fs.read.request/fs.write.request).
 *   - 5 publishes canonicos del subsistema con AJV strict:
 *     receta.creada, receta.actualizada, receta.eliminada,
 *     receta.estado.actualizada, ingrediente.precio.actualizado.
 *
 * Cambios v3.0.0 -> v4.0.0:
 *   - Rename interno proyecto_id -> project_id (77 ocurrencias). Eliminado
 *     _toolDispatch y _uiAdapt (no mas traduccion de borde).
 *   - Timestamps de storage a ISO 8601 (no mas Date.now() epoch ms).
 *     Helper _migrateStoreInPlace migra storage legacy en lectura.
 *   - Publishes incluyen user_id (campo canonico obligatorio del subsistema).
 *   - receta.creada incluye version y estado_operativo (campos canonicos).
 *   - Implementacion de receta.estado.actualizada (separado de receta.eliminada).
 *     Cuando archive emite ambos eventos coordinadamente.
 *   - Estado 'activa' legacy -> 'en_servicio' canonico (con migracion lectura).
 *   - Constants ESTADOS al top + validacion de transiciones de estado.
 *   - Nueva tool recetas.cambiar_estado (transiciones explicitas con validacion).
 *   - Eliminados ui_handlers (13 workspace_module legacy — frontend-recetario
 *     los reemplaza componiendo tools).
 *   - Eliminado override _classifyHandlerError (heredado de BaseModule;
 *     asignar err._code en throws).
 *   - Eliminados __tests__/smoke.js, context.json, prompt.json, README.md
 *     (legacy NLU pre-LLM + docs externas).
 *   - Handlers renombrados onToolXxx -> onXxx para consistencia con los 4
 *     modulos nuevos del subsistema.
 */

'use strict';

const crypto     = require('crypto');
const BaseModule = require('../_shared/base-module');

const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_USER_ID    = 'default';

const ESTADOS = Object.freeze({
  BORRADOR:    'borrador',
  EN_SERVICIO: 'en_servicio',
  ARCHIVADA:   'archivada'
});
const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS));

// Transiciones canonicas validas (de -> a). archivada es terminal salvo via revertir.
const TRANSICIONES_VALIDAS = new Map([
  [ESTADOS.BORRADOR,    new Set([ESTADOS.EN_SERVICIO, ESTADOS.ARCHIVADA])],
  [ESTADOS.EN_SERVICIO, new Set([ESTADOS.BORRADOR, ESTADOS.ARCHIVADA])],
  [ESTADOS.ARCHIVADA,   new Set()]
]);

const FUENTES_RECETA      = new Set(['manual', 'investigada', 'importada']);
const FUENTES_PRECIO      = new Set(['manual', 'factura', 'investigada', 'scraper']);
const CAMPOS_PARA_COMPLETA_DEFAULT = ['ingredientes', 'porciones', 'instrucciones'];

class RecetasModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'recetas';
    this.version = '4.0.0';

    this.config = {
      data_file_pattern:        'data/projects/{slug}/recetas.json',
      campos_para_completa:     CAMPOS_PARA_COMPLETA_DEFAULT,
      project_get_timeout_ms:   5000,
      fs_request_timeout_ms:    8000,
      default_listar_limit:     100,
      default_buscar_limit:     50
    };

    this.projectBasePaths = new Map();
    this.pendingProject   = new Map();
    this.pendingFs        = new Map();
    this.writeQueues      = new Map();
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;

    if (core.config?.[this.name]) {
      this.config = { ...this.config, ...core.config[this.name] };
    }

    this.logger.info('recetas.loaded', {
      module:  this.name,
      version: this.version,
      storage: 'json-per-project'
    });
  }

  async onUnload() {
    for (const { timer } of this.pendingProject.values()) clearTimeout(timer);
    for (const { timer } of this.pendingFs.values())      clearTimeout(timer);

    this.pendingProject.clear();
    this.pendingFs.clear();
    this.writeQueues.clear();
    this.projectBasePaths.clear();

    this.logger?.info('recetas.unloaded', { module: this.name });
  }

  // ============================================================
  // Bus subscribers — lifecycle de project + fs responses
  // ============================================================

  onProjectActivated(event) {
    const data = event?.data || event || {};
    const id = data.project_id || data.id;
    const basePath = data.base_path || data.project?.base_path;
    if (id && basePath) {
      this.projectBasePaths.set(id, basePath);
      this.logger?.debug('recetas.project.cached', { project_id: id, base_path: basePath });
    }
  }

  onProjectDeactivated() {
    // No-op (cache permanente; no hay manager que cerrar).
  }

  onProjectGetResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this.pendingProject.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingProject.delete(request_id);

    if (data.error) {
      pending.reject(Object.assign(new Error(data.error.message || 'project.get.failed'), { _code: data.error.code || 'UPSTREAM_INVALID_RESPONSE' }));
      return;
    }
    const basePath = data.base_path || data.project?.base_path;
    if (!basePath) {
      pending.reject(Object.assign(new Error('project.get response sin base_path'), { _code: 'UPSTREAM_INVALID_RESPONSE' }));
      return;
    }
    pending.resolve(basePath);
  }

  onFsReadResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this.pendingFs.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingFs.delete(request_id);

    if (data.error) {
      if (data.error.code === 'RESOURCE_NOT_FOUND' || data.error.kind === 'enoent') {
        pending.resolve(null);
        return;
      }
      pending.reject(Object.assign(new Error(data.error.message || 'fs.read.failed'), { _code: data.error.code || 'UPSTREAM_INVALID_RESPONSE' }));
      return;
    }
    pending.resolve(data.content ?? null);
  }

  onFsWriteResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this.pendingFs.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingFs.delete(request_id);

    if (data.error) {
      pending.reject(Object.assign(new Error(data.error.message || 'fs.write.failed'), { _code: data.error.code || 'UPSTREAM_INVALID_RESPONSE' }));
      return;
    }
    pending.resolve(true);
  }

  // ============================================================
  // Tools — recetas (CRUD + ciclo de vida)
  // ============================================================

  async onCrear(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    if (!params.nombre || typeof params.nombre !== 'string' || params.nombre.trim() === '') {
      return this._errorResponse(400, 'INVALID_INPUT', 'nombre es obligatorio', { field: 'nombre' });
    }
    if (params.fuente !== undefined && !FUENTES_RECETA.has(params.fuente)) {
      return this._errorResponse(400, 'INVALID_INPUT', `fuente debe ser una de: ${Array.from(FUENTES_RECETA).join(', ')}`,
        { field: 'fuente', allowed: Array.from(FUENTES_RECETA) });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const nombreTrim = params.nombre.trim();
        const dup = store.recetas.find(r => r.nombre.toLowerCase() === nombreTrim.toLowerCase());
        if (dup) {
          return this._errorResponse(409, 'ALREADY_EXISTS', `Ya existe una receta con nombre ${nombreTrim}`,
            { entity_type: 'recipe', entity_name: nombreTrim, existing_id: dup.id });
        }

        const now = new Date().toISOString();
        const ingredientes  = this._normalizeIngredientes(params.ingredientes);
        const instrucciones = this._normalizeInstrucciones(params.instrucciones);

        const receta = {
          id:           crypto.randomUUID(),
          nombre:       nombreTrim,
          descripcion:  typeof params.descripcion === 'string' ? params.descripcion : '',
          ingredientes,
          instrucciones,
          porciones:    typeof params.porciones === 'number' && params.porciones > 0 ? params.porciones : null,
          tiempo_min:   typeof params.tiempo_min === 'number' && params.tiempo_min >= 0 ? params.tiempo_min : null,
          dificultad:   typeof params.dificultad === 'number' ? params.dificultad : null,
          categorias:   Array.isArray(params.categorias) ? params.categorias.map(String) : [],
          etiquetas:    Array.isArray(params.etiquetas) ? params.etiquetas.map(String) : [],
          fuente:       FUENTES_RECETA.has(params.fuente) ? params.fuente : 'manual',
          notas:        typeof params.notas === 'string' ? params.notas : '',
          version:      1,
          history:      [],
          incompleta:   false,
          campos_pendientes: [],
          estado_operativo:  ESTADOS.EN_SERVICIO,
          created_at:   now,
          updated_at:   now
        };

        this._calcIncompleta(receta);
        if (receta.incompleta) receta.estado_operativo = ESTADOS.BORRADOR;

        store.recetas.push(receta);

        const payload = {
          project_id,
          user_id:           params.user_id || DEFAULT_USER_ID,
          receta_id:         receta.id,
          nombre:            receta.nombre,
          version:           receta.version,
          estado_operativo:  receta.estado_operativo
        };
        if (receta.incompleta) payload.incompleta = true;
        if (receta.campos_pendientes.length > 0) payload.campos_pendientes = receta.campos_pendientes;

        await this._publicarEvento('receta.creada', payload, params);

        this.metrics?.increment(`${this.name}.creada.total`, 1, { project_id });
        this.metrics?.gauge(`${this.name}.total`, store.recetas.length, { project_id });

        return {
          status: 201,
          data: {
            receta_id:         receta.id,
            nombre:            receta.nombre,
            version:           receta.version,
            estado_operativo:  receta.estado_operativo,
            incompleta:        receta.incompleta,
            campos_pendientes: receta.campos_pendientes
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.crear', err, 'tool');
    }
  }

  async onListar(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (params.estado !== undefined && !ESTADOS_VALIDOS.has(params.estado)) {
      return this._errorResponse(400, 'INVALID_INPUT', `estado debe ser uno de: ${Array.from(ESTADOS_VALIDOS).join(', ')}`,
        { field: 'estado', allowed: Array.from(ESTADOS_VALIDOS) });
    }

    try {
      return await this._readOnly(project_id, async (store) => {
        const estado = params.estado || ESTADOS.EN_SERVICIO;
        const limit  = typeof params.limit === 'number' && params.limit > 0 ? params.limit : this.config.default_listar_limit;

        let items = store.recetas.filter(r => r.estado_operativo === estado);
        if (params.solo_incompletas === true) items = items.filter(r => r.incompleta === true);

        return {
          status: 200,
          data: {
            total: items.length,
            recetas: items.slice(0, limit).map(r => ({
              receta_id:         r.id,
              nombre:            r.nombre,
              porciones:         r.porciones,
              dificultad:        r.dificultad,
              incompleta:        r.incompleta,
              campos_pendientes: r.campos_pendientes,
              estado_operativo:  r.estado_operativo,
              version:           r.version,
              updated_at:        r.updated_at
            }))
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.listar', err, 'tool');
    }
  }

  async onObtener(params = {}) {
    const { project_id, receta_id, nombre } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!receta_id && !nombre) {
      return this._errorResponse(400, 'INVALID_INPUT', 'receta_id o nombre es obligatorio', { field: 'receta_id|nombre' });
    }

    try {
      return await this._readOnly(project_id, async (store) => {
        const find = this._findRecetaByRefBuilder(store);
        const r = find(receta_id || nombre);
        if (!r) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Receta ${receta_id || nombre} no encontrada`,
            { entity_type: 'recipe', entity_ref: receta_id || nombre });
        }
        const { history, ...rest } = r;
        return { status: 200, data: { ...rest, versiones_anteriores: history.length } };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.obtener', err, 'tool');
    }
  }

  async onBuscar(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    try {
      return await this._readOnly(project_id, async (store) => {
        const limit = typeof params.limit === 'number' && params.limit > 0 ? params.limit : this.config.default_buscar_limit;
        let items = store.recetas.filter(r => r.estado_operativo === ESTADOS.EN_SERVICIO);

        if (params.texto) {
          const t = String(params.texto).toLowerCase();
          items = items.filter(r =>
            r.nombre.toLowerCase().includes(t) ||
            r.descripcion.toLowerCase().includes(t) ||
            r.ingredientes.some(ing => ing.nombre.toLowerCase().includes(t))
          );
        }
        if (params.ingrediente) {
          const ing = String(params.ingrediente).toLowerCase();
          items = items.filter(r => r.ingredientes.some(i => i.nombre.toLowerCase().includes(ing)));
        }
        if (params.categoria)  items = items.filter(r => r.categorias.includes(params.categoria));
        if (params.etiqueta)   items = items.filter(r => r.etiquetas.includes(params.etiqueta));
        if (typeof params.dificultad_min === 'number') items = items.filter(r => typeof r.dificultad === 'number' && r.dificultad >= params.dificultad_min);
        if (typeof params.dificultad_max === 'number') items = items.filter(r => typeof r.dificultad === 'number' && r.dificultad <= params.dificultad_max);
        if (typeof params.tiempo_max === 'number')     items = items.filter(r => typeof r.tiempo_min === 'number' && r.tiempo_min <= params.tiempo_max);
        if (typeof params.porciones === 'number')      items = items.filter(r => r.porciones === params.porciones);

        return {
          status: 200,
          data: {
            total: items.length,
            resultados: items.slice(0, limit).map(r => ({
              receta_id: r.id, nombre: r.nombre, porciones: r.porciones,
              dificultad: r.dificultad, tiempo_min: r.tiempo_min,
              categorias: r.categorias, etiquetas: r.etiquetas
            }))
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.buscar', err, 'tool');
    }
  }

  async onActualizar(params = {}) {
    const { project_id, receta_id, cambios } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!receta_id)  return this._errorResponse(400, 'INVALID_INPUT', 'receta_id es obligatorio', { field: 'receta_id' });
    if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'cambios debe ser un objeto', { field: 'cambios' });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const find = this._findRecetaByRefBuilder(store);
        const r = find(receta_id);
        if (!r) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Receta ${receta_id} no encontrada`,
            { entity_type: 'recipe', entity_ref: receta_id });
        }

        const { history: _h, ...snapshot } = r;
        r.history.push({ ...snapshot, _archived_at: new Date().toISOString() });

        const aplicados = [];
        const setIf = (k, transform) => {
          if (k in cambios) {
            const v = transform ? transform(cambios[k]) : cambios[k];
            r[k] = v;
            aplicados.push(k);
          }
        };
        setIf('nombre',       v => String(v).trim());
        setIf('descripcion',  v => typeof v === 'string' ? v : '');
        setIf('porciones',    v => typeof v === 'number' && v > 0 ? v : null);
        setIf('tiempo_min',   v => typeof v === 'number' && v >= 0 ? v : null);
        setIf('dificultad',   v => typeof v === 'number' ? v : null);
        setIf('notas',        v => typeof v === 'string' ? v : '');
        setIf('fuente',       v => FUENTES_RECETA.has(v) ? v : r.fuente);
        setIf('ingredientes', v => this._normalizeIngredientes(v));
        setIf('instrucciones',v => this._normalizeInstrucciones(v));
        if ('categorias' in cambios) { r.categorias = Array.isArray(cambios.categorias) ? cambios.categorias.map(String) : []; aplicados.push('categorias'); }
        if ('etiquetas'  in cambios) { r.etiquetas  = Array.isArray(cambios.etiquetas)  ? cambios.etiquetas.map(String)  : []; aplicados.push('etiquetas'); }

        if (aplicados.length === 0) {
          r.history.pop();
          return this._errorResponse(400, 'INVALID_INPUT', 'cambios no incluye ningun campo conocido', { field: 'cambios' });
        }

        r.version    += 1;
        r.updated_at  = new Date().toISOString();
        this._calcIncompleta(r);

        const payload = {
          project_id,
          user_id:    params.user_id || DEFAULT_USER_ID,
          receta_id:  r.id,
          nombre:     r.nombre,
          version:    r.version,
          campos_actualizados: aplicados
        };
        if (r.incompleta) payload.incompleta = true;
        if (r.campos_pendientes.length > 0) payload.campos_pendientes = r.campos_pendientes;

        await this._publicarEvento('receta.actualizada', payload, params);

        this.metrics?.increment(`${this.name}.actualizada.total`, 1, { project_id });

        return {
          status: 200,
          data: {
            receta_id:           r.id,
            nombre:              r.nombre,
            version:             r.version,
            campos_actualizados: aplicados,
            incompleta:          r.incompleta,
            campos_pendientes:   r.campos_pendientes
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.actualizar', err, 'tool');
    }
  }

  async onHistorial(params = {}) {
    const { project_id, receta_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!receta_id)  return this._errorResponse(400, 'INVALID_INPUT', 'receta_id es obligatorio', { field: 'receta_id' });

    try {
      return await this._readOnly(project_id, async (store) => {
        const find = this._findRecetaByRefBuilder(store);
        const r = find(receta_id);
        if (!r) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Receta ${receta_id} no encontrada`,
            { entity_type: 'recipe', entity_ref: receta_id });
        }
        const versiones = (r.history || []).map(h => ({
          version: h.version,
          archived_at: h._archived_at,
          nombre: h.nombre,
          porciones: h.porciones,
          dificultad: h.dificultad,
          ingredientes_count: Array.isArray(h.ingredientes) ? h.ingredientes.length : 0
        }));
        return {
          status: 200,
          data: { receta_id: r.id, nombre: r.nombre, version_actual: r.version, versiones_anteriores: versiones.length, historial: versiones }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.historial', err, 'tool');
    }
  }

  async onRevertir(params = {}) {
    const { project_id, receta_id, target_version } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!receta_id)  return this._errorResponse(400, 'INVALID_INPUT', 'receta_id es obligatorio', { field: 'receta_id' });
    if (!Number.isInteger(target_version) || target_version < 1) {
      return this._errorResponse(400, 'INVALID_INPUT', 'target_version debe ser entero >= 1', { field: 'target_version' });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const find = this._findRecetaByRefBuilder(store);
        const r = find(receta_id);
        if (!r) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Receta ${receta_id} no encontrada`,
            { entity_type: 'recipe', entity_ref: receta_id });
        }
        const target = (r.history || []).find(h => h.version === target_version);
        if (!target) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Version ${target_version} no encontrada`,
            { entity_type: 'recipe-version', entity_ref: target_version, versiones_disponibles: (r.history || []).map(h => h.version) });
        }

        const { history: _h, ...currentSnap } = r;
        r.history.push({ ...currentSnap, _archived_at: new Date().toISOString() });

        const { _archived_at, version, ...restore } = target;
        Object.assign(r, restore);
        r.version    += 1;
        r.updated_at  = new Date().toISOString();
        this._calcIncompleta(r);

        await this._publicarEvento('receta.actualizada', {
          project_id,
          user_id:    params.user_id || DEFAULT_USER_ID,
          receta_id:  r.id,
          nombre:     r.nombre,
          version:    r.version,
          motivo:     'revertir'
        }, params);

        this.metrics?.increment(`${this.name}.actualizada.total`, 1, { project_id, motivo: 'revertir' });

        return {
          status: 200,
          data: { receta_id: r.id, nombre: r.nombre, revertida_a_version: target_version, version_actual: r.version }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.revertir', err, 'tool');
    }
  }

  async onEliminar(params = {}) {
    const { project_id, receta_id, motivo } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!receta_id)  return this._errorResponse(400, 'INVALID_INPUT', 'receta_id es obligatorio', { field: 'receta_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        const find = this._findRecetaByRefBuilder(store);
        const r = find(receta_id);
        if (!r) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Receta ${receta_id} no encontrada`,
            { entity_type: 'recipe', entity_ref: receta_id });
        }
        if (r.estado_operativo === ESTADOS.ARCHIVADA) {
          return { status: 200, data: { receta_id: r.id, nombre: r.nombre, estado_operativo: r.estado_operativo, status: 'ya_estaba_archivada' } };
        }

        const estadoAnterior = r.estado_operativo;
        r.estado_operativo   = ESTADOS.ARCHIVADA;
        r.updated_at         = new Date().toISOString();

        const basePayload = {
          project_id,
          user_id:    params.user_id || DEFAULT_USER_ID,
          receta_id:  r.id,
          nombre:     r.nombre
        };
        await this._publicarEvento('receta.estado.actualizada', {
          ...basePayload,
          estado_anterior: estadoAnterior,
          estado_nuevo:    ESTADOS.ARCHIVADA,
          version:         r.version,
          ...(typeof motivo === 'string' && motivo.length > 0 ? { motivo } : {})
        }, params);
        await this._publicarEvento('receta.eliminada', {
          ...basePayload,
          ...(typeof motivo === 'string' && motivo.length > 0 ? { motivo } : {})
        }, params);

        this.metrics?.increment(`${this.name}.eliminada.total`, 1, { project_id });
        this.metrics?.increment(`${this.name}.estado.actualizada.total`, 1, { project_id, estado_nuevo: ESTADOS.ARCHIVADA });

        return { status: 200, data: { receta_id: r.id, nombre: r.nombre, estado_operativo: r.estado_operativo, status: 'archivada' } };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.eliminar', err, 'tool');
    }
  }

  async onCambiarEstado(params = {}) {
    const { project_id, receta_id, target_estado, motivo } = params;
    if (!project_id)    return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio',    { field: 'project_id' });
    if (!receta_id)     return this._errorResponse(400, 'INVALID_INPUT', 'receta_id es obligatorio',     { field: 'receta_id' });
    if (!target_estado) return this._errorResponse(400, 'INVALID_INPUT', 'target_estado es obligatorio', { field: 'target_estado' });
    if (!ESTADOS_VALIDOS.has(target_estado)) {
      return this._errorResponse(400, 'INVALID_INPUT', `target_estado debe ser uno de: ${Array.from(ESTADOS_VALIDOS).join(', ')}`,
        { field: 'target_estado', allowed: Array.from(ESTADOS_VALIDOS) });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const find = this._findRecetaByRefBuilder(store);
        const r = find(receta_id);
        if (!r) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Receta ${receta_id} no encontrada`,
            { entity_type: 'recipe', entity_ref: receta_id });
        }
        const estadoAnterior = r.estado_operativo;
        if (estadoAnterior === target_estado) {
          return { status: 200, data: { receta_id: r.id, estado_operativo: r.estado_operativo, status: 'sin_cambios' } };
        }

        const permitidas = TRANSICIONES_VALIDAS.get(estadoAnterior) || new Set();
        if (!permitidas.has(target_estado)) {
          return this._errorResponse(422, 'PRECONDITION_FAILED',
            `Transicion ${estadoAnterior} -> ${target_estado} no permitida`,
            { kind: 'invalid_state_transition', estado_anterior: estadoAnterior, target_estado, transiciones_permitidas: Array.from(permitidas) });
        }

        r.estado_operativo = target_estado;
        r.updated_at       = new Date().toISOString();

        const basePayload = {
          project_id,
          user_id:    params.user_id || DEFAULT_USER_ID,
          receta_id:  r.id,
          nombre:     r.nombre
        };
        await this._publicarEvento('receta.estado.actualizada', {
          ...basePayload,
          estado_anterior: estadoAnterior,
          estado_nuevo:    target_estado,
          version:         r.version,
          ...(typeof motivo === 'string' && motivo.length > 0 ? { motivo } : {})
        }, params);

        if (target_estado === ESTADOS.ARCHIVADA) {
          await this._publicarEvento('receta.eliminada', {
            ...basePayload,
            ...(typeof motivo === 'string' && motivo.length > 0 ? { motivo } : {})
          }, params);
          this.metrics?.increment(`${this.name}.eliminada.total`, 1, { project_id });
        }

        this.metrics?.increment(`${this.name}.estado.actualizada.total`, 1, { project_id, estado_nuevo: target_estado });

        return {
          status: 200,
          data: {
            receta_id:        r.id,
            estado_anterior:  estadoAnterior,
            estado_operativo: r.estado_operativo
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.cambiar_estado', err, 'tool');
    }
  }

  async onEstadisticas(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    try {
      return await this._readOnly(project_id, async (store) => {
        const por_estado = { borrador: 0, en_servicio: 0, archivada: 0 };
        let incompletas = 0;
        const ingredientesUsados = new Set();
        for (const r of store.recetas) {
          por_estado[r.estado_operativo] = (por_estado[r.estado_operativo] || 0) + 1;
          if (r.incompleta) incompletas++;
          for (const ing of r.ingredientes) ingredientesUsados.add(String(ing.nombre).toLowerCase());
        }
        const con_precio = store.ingredientes_catalogo.filter(i => typeof i.precio_mercado === 'number' && i.precio_mercado > 0).length;

        return {
          status: 200,
          data: {
            total_recetas:           store.recetas.length,
            por_estado,
            incompletas,
            ingredientes_catalogo:   store.ingredientes_catalogo.length,
            ingredientes_con_precio: con_precio,
            ingredientes_usados_unicos: ingredientesUsados.size
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.estadisticas', err, 'tool');
    }
  }

  async onIngredientes(params = {}) {
    const { project_id, categoria } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    try {
      return await this._readOnly(project_id, async (store) => {
        let arr = store.ingredientes_catalogo;
        if (categoria) arr = arr.filter(i => i.categoria === categoria);
        return { status: 200, data: { total: arr.length, ingredientes: arr } };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.ingredientes', err, 'tool');
    }
  }

  async onActualizarPrecio(params = {}) {
    const { project_id, nombre, precio_mercado } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      return this._errorResponse(400, 'INVALID_INPUT', 'nombre es obligatorio', { field: 'nombre' });
    }
    if (typeof precio_mercado !== 'number' || precio_mercado < 0 || Number.isNaN(precio_mercado)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'precio_mercado debe ser number >= 0', { field: 'precio_mercado' });
    }
    if (params.fuente !== undefined && !FUENTES_PRECIO.has(params.fuente)) {
      return this._errorResponse(400, 'INVALID_INPUT', `fuente debe ser una de: ${Array.from(FUENTES_PRECIO).join(', ')}`,
        { field: 'fuente', allowed: Array.from(FUENTES_PRECIO) });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const nombreTrim = nombre.trim();
        const lower = nombreTrim.toLowerCase();
        let item = store.ingredientes_catalogo.find(i => i.nombre.toLowerCase() === lower);
        const now = new Date().toISOString();

        if (!item) {
          item = {
            nombre:        nombreTrim,
            categoria:     typeof params.categoria === 'string' ? params.categoria : null,
            unidad:        typeof params.unidad === 'string' ? params.unidad : null,
            precio_mercado,
            fuente:        FUENTES_PRECIO.has(params.fuente) ? params.fuente : 'manual',
            created_at:    now,
            updated_at:    now
          };
          store.ingredientes_catalogo.push(item);
        } else {
          if (typeof params.categoria === 'string') item.categoria = params.categoria;
          if (typeof params.unidad === 'string')    item.unidad    = params.unidad;
          if (FUENTES_PRECIO.has(params.fuente))    item.fuente    = params.fuente;
          item.precio_mercado = precio_mercado;
          item.updated_at     = now;
        }

        const payload = {
          project_id,
          user_id:        params.user_id || DEFAULT_USER_ID,
          nombre:         item.nombre,
          precio_mercado: item.precio_mercado
        };
        if (item.unidad)    payload.unidad    = item.unidad;
        if (item.categoria) payload.categoria = item.categoria;
        if (item.fuente)    payload.fuente    = item.fuente;

        await this._publicarEvento('ingrediente.precio.actualizado', payload, params);

        this.metrics?.increment(`${this.name}.ingrediente.precio.actualizado.total`, 1, { project_id });
        this.metrics?.gauge(`${this.name}.ingredientes_catalogo.total`, store.ingredientes_catalogo.length, { project_id });

        return {
          status: 200,
          data: { nombre: item.nombre, precio_mercado: item.precio_mercado, unidad: item.unidad, status: 'actualizado' }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.actualizar_precio', err, 'tool');
    }
  }

  async onAnalizar(params = {}) {
    const { project_id, receta_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!receta_id)  return this._errorResponse(400, 'INVALID_INPUT', 'receta_id es obligatorio', { field: 'receta_id' });

    try {
      return await this._readOnly(project_id, async (store) => {
        const find = this._findRecetaByRefBuilder(store);
        const r = find(receta_id);
        if (!r) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Receta ${receta_id} no encontrada`,
            { entity_type: 'recipe', entity_ref: receta_id });
        }
        if (r.incompleta) {
          return this._errorResponse(422, 'PRECONDITION_FAILED', 'Receta incompleta — completala antes de analizar',
            { kind: 'incomplete_recipe', campos_pendientes: r.campos_pendientes });
        }

        let coste_total = 0;
        let costeReal   = true;
        const desglose  = [];
        for (const ing of r.ingredientes) {
          const cat = store.ingredientes_catalogo.find(i => i.nombre.toLowerCase() === String(ing.nombre).toLowerCase());
          let coste = null;
          if (cat && typeof cat.precio_mercado === 'number' && cat.unidad && cat.unidad === ing.unidad && typeof ing.cantidad === 'number') {
            coste = ing.cantidad * cat.precio_mercado;
            coste_total += coste;
          } else {
            costeReal = false;
          }
          desglose.push({
            nombre:         ing.nombre,
            cantidad:       ing.cantidad,
            unidad:         ing.unidad,
            precio_mercado: cat ? cat.precio_mercado : null,
            coste,
            en_catalogo:    !!cat
          });
        }

        const porciones = r.porciones || 1;
        const cpp = costeReal ? (coste_total / porciones) : null;

        return {
          status: 200,
          data: {
            receta_id: r.id,
            nombre: r.nombre,
            porciones: r.porciones,
            tiempo_min: r.tiempo_min,
            dificultad: r.dificultad,
            ingredientes: desglose,
            coste_total: costeReal ? coste_total : null,
            coste_por_porcion: cpp,
            coste_es_real: costeReal,
            nota: costeReal ? null : 'Faltan precios o unidades incompatibles en el catalogo para algunos ingredientes.'
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.analizar', err, 'tool');
    }
  }

  async onInvestigarReceta(params = {}) {
    const { project_id, nombre_receta } = params;
    if (!project_id)    return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio',    { field: 'project_id' });
    if (!nombre_receta) return this._errorResponse(400, 'INVALID_INPUT', 'nombre_receta es obligatorio', { field: 'nombre_receta' });

    try {
      return await this._readOnly(project_id, async (store) => {
        const find = this._findRecetaByRefBuilder(store);
        const r = find(nombre_receta);
        if (r) {
          const { history: _h, ...rest } = r;
          return { status: 200, data: { existe: true, receta: rest } };
        }
        return {
          status: 200,
          data: {
            existe: false,
            instruccion: 'No existe en el proyecto. Propon una receta y guardala con recetas.crear tras confirmacion del usuario.'
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetas.investigar_receta', err, 'tool');
    }
  }

  // ============================================================
  // Helpers POC2 — _errorResponse, _classifyHandlerError, _handleHandlerError,
  // _statusFromCode, _enrich vienen de BaseModule. Override _publicarEvento.
  // ============================================================

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) {
      this.logger?.warn(`${this.name}.publish.bus_no_disponible`, { event: name });
      return;
    }

    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      project_id:     payload?.project_id || sourcePayload?.project_id || DEFAULT_PROJECT_ID,
      user_id:        payload?.user_id    || sourcePayload?.user_id    || DEFAULT_USER_ID,
      timestamp:      new Date().toISOString(),
      ...payload
    };

    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.error(`${this.name}.publish_error`, {
        event:         name,
        error_message: err.message,
        stack:         err.stack
      });
      this.metrics?.increment(`${this.name}.publish_error`, 1, { event: name });
    }
  }

  // ============================================================
  // Dominio protegido — normalizaciones + lookup + incompleta
  // ============================================================

  _normalizeIngredientes(input) {
    if (Array.isArray(input)) {
      return input.map(it => {
        if (typeof it === 'string') {
          return { nombre: it.trim(), cantidad: null, unidad: null, notas: '' };
        }
        return {
          nombre:   typeof it?.nombre === 'string' ? it.nombre.trim() : '',
          cantidad: typeof it?.cantidad === 'number' ? it.cantidad : null,
          unidad:   typeof it?.unidad === 'string' ? it.unidad : null,
          notas:    typeof it?.notas === 'string' ? it.notas : ''
        };
      }).filter(i => i.nombre !== '');
    }
    if (typeof input === 'string' && input.trim() !== '') {
      return input.split(/\r?\n|;|,/).map(s => s.trim()).filter(s => s !== '')
        .map(s => ({ nombre: s, cantidad: null, unidad: null, notas: '' }));
    }
    return [];
  }

  _normalizeInstrucciones(input) {
    if (Array.isArray(input)) return input.map(String).filter(s => s.trim() !== '');
    if (typeof input === 'string' && input.trim() !== '') {
      return input.split(/\r?\n|\. /).map(s => s.trim()).filter(s => s !== '');
    }
    return [];
  }

  _calcIncompleta(receta) {
    const requeridos = this.config.campos_para_completa || CAMPOS_PARA_COMPLETA_DEFAULT;
    const pendientes = [];
    for (const campo of requeridos) {
      const v = receta[campo];
      if (campo === 'ingredientes' || campo === 'instrucciones') {
        if (!Array.isArray(v) || v.length === 0) pendientes.push(campo);
      } else if (campo === 'porciones') {
        if (typeof v !== 'number' || v <= 0) pendientes.push(campo);
      } else if (v === null || v === undefined || v === '') {
        pendientes.push(campo);
      }
    }
    receta.incompleta = pendientes.length > 0;
    receta.campos_pendientes = pendientes;
  }

  _findRecetaByRefBuilder(store) {
    return (ref) => {
      if (!ref) return null;
      const refLower = String(ref).toLowerCase();
      let r = store.recetas.find(x => x.id === ref);
      if (r) return r;
      r = store.recetas.find(x => x.nombre.toLowerCase() === refLower);
      if (r) return r;
      r = store.recetas.find(x => x.nombre.toLowerCase().includes(refLower));
      return r || null;
    };
  }

  // ============================================================
  // Persistencia json-per-project
  // ============================================================

  async _basePathForProject(project_id) {
    if (!project_id) {
      const err = new Error('project_id requerido');
      err._code = 'INVALID_INPUT';
      throw err;
    }
    if (this.projectBasePaths.has(project_id)) return this.projectBasePaths.get(project_id);

    if (!this.eventBus?.publish) {
      const err = new Error('eventBus no disponible para project.get.request');
      err._code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }

    const request_id = crypto.randomUUID();
    const basePath = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingProject.delete(request_id);
        const err = new Error(`project.get timeout para ${project_id}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, this.config.project_get_timeout_ms);
      this.pendingProject.set(request_id, { resolve, reject, timer });
      this.eventBus.publish('project.get.request', { request_id, project_id }).catch(err => {
        clearTimeout(timer);
        this.pendingProject.delete(request_id);
        err._code = err._code || 'UPSTREAM_UNREACHABLE';
        reject(err);
      });
    });

    this.projectBasePaths.set(project_id, basePath);
    return basePath;
  }

  async _loadStore(basePath) {
    const absPath = `${basePath}/recetas.json`.replace(/\/+/g, '/');
    const content = await this._readFile(absPath);
    if (!content) return this._emptyStore();
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.recetas))               parsed.recetas = [];
      if (!Array.isArray(parsed.ingredientes_catalogo)) parsed.ingredientes_catalogo = [];
      this._migrateStoreInPlace(parsed);
      return parsed;
    } catch (err) {
      this.logger?.warn(`${this.name}.persist.parse_error`, { abs_path: absPath, error_message: err.message });
      return this._emptyStore();
    }
  }

  /**
   * Migracion en lectura para storage legacy:
   *  - estado: 'activa' (v3) -> estado_operativo: 'en_servicio' (v4 canon).
   *  - estado_operativo faltante: copiar de 'estado' legacy si existe.
   *  - timestamps numericos epoch ms -> ISO 8601 string.
   *  - history.{_archived_at, created_at, updated_at} idem.
   *  - ingredientes_catalogo timestamps idem.
   */
  _migrateStoreInPlace(store) {
    const toIso = (v) => {
      if (typeof v === 'number' && Number.isFinite(v)) {
        try { return new Date(v).toISOString(); } catch { return v; }
      }
      return v;
    };
    const normEstado = (v) => (v === 'activa' ? ESTADOS.EN_SERVICIO : v);
    for (const r of store.recetas) {
      if (!r.estado_operativo && r.estado) r.estado_operativo = r.estado;
      r.estado_operativo = normEstado(r.estado_operativo) || ESTADOS.EN_SERVICIO;
      delete r.estado;
      r.created_at = toIso(r.created_at);
      r.updated_at = toIso(r.updated_at);
      if (Array.isArray(r.history)) {
        for (const h of r.history) {
          if (h.estado === 'activa') h.estado = ESTADOS.EN_SERVICIO;
          h._archived_at = toIso(h._archived_at);
          h.created_at = toIso(h.created_at);
          h.updated_at = toIso(h.updated_at);
        }
      }
    }
    for (const i of store.ingredientes_catalogo) {
      i.created_at = toIso(i.created_at);
      i.updated_at = toIso(i.updated_at);
    }
  }

  async _saveStore(basePath, store) {
    const absPath = `${basePath}/recetas.json`.replace(/\/+/g, '/');
    store._version    = this.version;
    store._updated_at = new Date().toISOString();
    await this._writeFile(absPath, JSON.stringify(store, null, 2));
  }

  _emptyStore() {
    return {
      _version:    this.version,
      _updated_at: null,
      recetas:                [],
      ingredientes_catalogo:  []
    };
  }

  async _withStore(project_id, mutator) {
    const basePath = await this._basePathForProject(project_id);

    const prev = this.writeQueues.get(project_id) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        const store  = await this._loadStore(basePath);
        const result = await mutator(store);
        if (!result || result.status === undefined || result.status < 400) {
          await this._saveStore(basePath, store);
        }
        return result;
      });

    this.writeQueues.set(project_id, next);
    try {
      return await next;
    } finally {
      if (this.writeQueues.get(project_id) === next) this.writeQueues.delete(project_id);
    }
  }

  async _readOnly(project_id, reader) {
    const basePath = await this._basePathForProject(project_id);
    const store    = await this._loadStore(basePath);
    return reader(store);
  }

  async _readFile(absPath) {
    if (!this.eventBus?.publish) {
      const err = new Error('eventBus no disponible para fs.read.request');
      err._code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        const err = new Error(`fs.read timeout para ${absPath}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, this.config.fs_request_timeout_ms);
      this.pendingFs.set(request_id, { resolve, reject, timer, op: 'read' });
      this.eventBus.publish('fs.read.request', { request_id, path: absPath, encoding: 'utf-8' }).catch(err => {
        clearTimeout(timer);
        this.pendingFs.delete(request_id);
        err._code = err._code || 'UPSTREAM_UNREACHABLE';
        reject(err);
      });
    });
  }

  async _writeFile(absPath, content) {
    if (!this.eventBus?.publish) {
      const err = new Error('eventBus no disponible para fs.write.request');
      err._code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        const err = new Error(`fs.write timeout para ${absPath}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, this.config.fs_request_timeout_ms);
      this.pendingFs.set(request_id, { resolve, reject, timer, op: 'write' });
      this.eventBus.publish('fs.write.request', { request_id, path: absPath, content, encoding: 'utf-8', atomic: true }).catch(err => {
        clearTimeout(timer);
        this.pendingFs.delete(request_id);
        err._code = err._code || 'UPSTREAM_UNREACHABLE';
        reject(err);
      });
    });
  }
}

module.exports = RecetasModule;
