/**
 * Modulo `escandallo` v4.0.0
 *
 * Satelite del subsistema-recetario. Calcula coste de recetas, food cost,
 * margenes, comparativas, simulaciones, impacto de ingredientes, optimizacion,
 * ficha tecnica. NO accede a recetas ni facturas via cross-modulo: el caller
 * pasa los datos como params.
 *
 * Cumple los 24 contratos transversales:
 *   - class EscandalloModule extends BaseModule.
 *   - Override _publicarEvento para anadir project_id + user_id canonicos.
 *   - Toda respuesta { status, data | error: { code, message, details? } }.
 *   - Persistencia json-per-project via bus.
 *   - 3 publishes canonicos del subsistema con AJV strict:
 *     escandallo.calculado, escandallo.alerta.detectada, escandallo.comparativa.calculada.
 *
 * Cambios v3.0.0 -> v4.0.0:
 *   - Persistencia: SQLite -> json-per-project via bus.
 *   - Rename eventos: escandallo.alerta -> .alerta.detectada;
 *                     escandallo.comparativa -> .comparativa.calculada.
 *   - Anade user_id a los 3 publishes.
 *   - Anade coste_es_real en escandallo.calculado (boolean canonico del schema).
 *   - Elimina _registerAnalyzerTools (acceso directo a moduleLoader).
 *   - Elimina ui_handlers (5 workspace_module legacy).
 *   - Elimina core/, db/, pipeline/, __tests__/ (subdirs).
 *   - Tools: 12 en runtime (7 manifest + 5 dinamicas) -> 8 declaradas canonicas.
 *   - El caller pasa precios_catalogo, precios_compra, recetas_afectadas como params
 *     (sin acceso cross-modulo a recetas ni facturas).
 *   - Hardcoded 35/25 -> config.food_cost_umbral_alerta / .food_cost_umbral_bajo.
 *   - Helpers POC2 heredados de BaseModule (no override de _classifyHandlerError).
 */

'use strict';

const crypto     = require('crypto');
const BaseModule = require('../_shared/base-module');

const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_USER_ID    = 'default';

class EscandalloModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'escandallo';
    this.version = '4.0.0';

    this.config = {
      data_file_pattern:         'data/projects/{slug}/escandallo.json',
      food_cost_umbral_alerta:   35,
      food_cost_umbral_bajo:     25,
      food_cost_default_maximo:  33,
      project_get_timeout_ms:    5000,
      fs_request_timeout_ms:     5000
    };

    // Persistencia / multi-tenancy
    this.projectBasePaths = new Map();
    this.pendingProject   = new Map();
    this.pendingFs        = new Map();
    this.writeQueues      = new Map();

    // Cache de snapshots calculados (invalidada por subscribes a receta.* / ingrediente.precio.actualizado)
    this.snapshotCache = new Map();  // key: `${project_id}|${receta_id}` -> { snapshot, ts }
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

    this.logger.info('escandallo.loaded', {
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
    this.snapshotCache.clear();

    this.logger?.info('escandallo.unloaded', { module: this.name });
  }

  // ============================================================
  // Bus subscribers — lifecycle de project + fs responses + invalidacion de cache
  // ============================================================

  onProjectActivated(event) {
    const data = event?.data || event || {};
    const id = data.project_id || data.id;
    const basePath = data.base_path || data.project?.base_path;
    if (id && basePath) {
      this.projectBasePaths.set(id, basePath);
      this.logger?.debug('escandallo.project.cached', { project_id: id, base_path: basePath });
    }
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

  onRecetaCreada(event) {
    // Compat hack: recetas aun publica con proyecto_id (drift heredado; cerrara con v4 de recetas).
    const data = event?.data || event || {};
    const project_id = data.project_id || data.proyecto_id;
    if (project_id) this._invalidateProjectCache(project_id);
  }

  onRecetaActualizada(event) {
    const data = event?.data || event || {};
    const project_id = data.project_id || data.proyecto_id;
    if (project_id) this._invalidateProjectCache(project_id);
  }

  onIngredientePrecioActualizado() {
    // Cambio cross-proyecto del precio de un ingrediente: invalida cache entera.
    this.snapshotCache.clear();
    this.logger?.debug('escandallo.cache.cleared', { reason: 'ingrediente.precio.actualizado' });
  }

  // ============================================================
  // Tools (invocadas por bus)
  // ============================================================

  async onCalcular(params = {}) {
    const start = Date.now();
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    const errores = this._validarCalcular(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const calculo = this._calcularEscandallo(params);

        const snapshot = {
          receta_id:               params.receta_id,
          nombre:                  params.nombre,
          porciones:               params.porciones,
          coste_total:             calculo.coste_total,
          coste_por_porcion:       calculo.coste_por_porcion,
          coste_es_real:           calculo.coste_es_real,
          food_cost_pct:           calculo.food_cost_pct,
          ingredientes_sin_precio: calculo.ingredientes_sin_precio,
          calculated_at:           new Date().toISOString()
        };
        const idx = store.snapshots.findIndex(s => s.receta_id === params.receta_id);
        if (idx === -1) store.snapshots.push(snapshot);
        else            store.snapshots[idx] = snapshot;

        this.snapshotCache.set(`${project_id}|${params.receta_id}`, { snapshot, ts: Date.now() });

        // Publicar escandallo.calculado (shape canonico AJV)
        const payload = {
          project_id,
          user_id:           params.user_id || DEFAULT_USER_ID,
          receta_id:         params.receta_id,
          nombre:            params.nombre,
          coste_total:       calculo.coste_total,
          coste_por_porcion: calculo.coste_por_porcion,
          coste_es_real:     calculo.coste_es_real
        };
        if (calculo.food_cost_pct !== null && calculo.food_cost_pct !== undefined) {
          payload.food_cost_pct = calculo.food_cost_pct;
        }
        if (calculo.ingredientes_sin_precio && calculo.ingredientes_sin_precio.length > 0) {
          payload.ingredientes_sin_precio = calculo.ingredientes_sin_precio;
        }
        await this._publicarEvento('escandallo.calculado', payload, params);

        // Detectar alerta de food cost si hay PVP y cruza umbral
        if (calculo.food_cost_pct !== null && calculo.food_cost_pct !== undefined && calculo.food_cost_pct > this.config.food_cost_umbral_alerta) {
          const alerta = {
            id:              this._generarId('alerta'),
            tipo:            'food_cost_alto',
            receta_id:       params.receta_id,
            nombre:          params.nombre,
            valor_observado: calculo.food_cost_pct,
            umbral:          this.config.food_cost_umbral_alerta,
            detalle:         `Food cost ${calculo.food_cost_pct.toFixed(1)}% supera el umbral configurado del ${this.config.food_cost_umbral_alerta}%.`,
            created_at:      new Date().toISOString()
          };
          store.alertas.push(alerta);

          await this._publicarEvento('escandallo.alerta.detectada', {
            project_id,
            user_id:         params.user_id || DEFAULT_USER_ID,
            tipo:            alerta.tipo,
            receta_id:       alerta.receta_id,
            nombre:          alerta.nombre,
            valor_observado: alerta.valor_observado,
            umbral:          alerta.umbral,
            detalle:         alerta.detalle
          }, params);

          this.metrics?.increment(`${this.name}.alerta.detectada.total`, 1, { project_id, tipo: alerta.tipo });
        }

        this.metrics?.increment(`${this.name}.calcular.total`, 1, { project_id });
        this.metrics?.timing(`${this.name}.calcular.duration`, Date.now() - start);
        this.metrics?.gauge(`${this.name}.snapshots.count`, store.snapshots.length, { project_id });
        this.metrics?.gauge(`${this.name}.alertas.count`, store.alertas.length, { project_id });

        return {
          status: 201,
          data: {
            receta_id:         snapshot.receta_id,
            coste_total:       snapshot.coste_total,
            coste_por_porcion: snapshot.coste_por_porcion,
            coste_es_real:     snapshot.coste_es_real,
            food_cost_pct:     snapshot.food_cost_pct,
            desglose:          calculo.desglose
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('escandallo.calcular', err, 'tool');
    }
  }

  async onCompararPrecios(params = {}) {
    const { project_id, precios_catalogo, precios_compra } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!precios_catalogo || typeof precios_catalogo !== 'object' || Array.isArray(precios_catalogo)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'precios_catalogo es obligatorio (objeto)', { field: 'precios_catalogo' });
    }
    if (!precios_compra || typeof precios_compra !== 'object' || Array.isArray(precios_compra)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'precios_compra es obligatorio (objeto)', { field: 'precios_compra' });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const ingredientes = new Set([...Object.keys(precios_catalogo), ...Object.keys(precios_compra)]);
        const lineas = [];
        const ingredientes_sin_compra_real = [];

        for (const ing of ingredientes) {
          const pc = precios_catalogo[ing];
          const pr = precios_compra[ing];
          const pc_num = typeof pc === 'number' ? pc : null;
          const pr_num = typeof pr === 'number' ? pr : null;
          let delta_pct = null;
          if (pc_num !== null && pr_num !== null && pc_num > 0) {
            delta_pct = ((pr_num - pc_num) / pc_num) * 100;
          }
          lineas.push({ ingrediente: ing, precio_catalogo: pc_num, precio_compra: pr_num, delta_pct });
          if (pr_num === null) ingredientes_sin_compra_real.push(ing);
        }

        const comparativa = {
          id:                          this._generarId('comp'),
          lineas,
          ingredientes_sin_compra_real,
          created_at:                  new Date().toISOString()
        };
        store.comparativas.push(comparativa);

        const payload = {
          project_id,
          user_id: params.user_id || DEFAULT_USER_ID,
          lineas
        };
        if (ingredientes_sin_compra_real.length > 0) payload.ingredientes_sin_compra_real = ingredientes_sin_compra_real;

        await this._publicarEvento('escandallo.comparativa.calculada', payload, params);

        this.metrics?.increment(`${this.name}.comparar.precios.total`, 1, { project_id });

        return {
          status: 201,
          data: { comparativa_id: comparativa.id, total_lineas: lineas.length, lineas, ingredientes_sin_compra_real }
        };
      });
    } catch (err) {
      return this._handleHandlerError('escandallo.comparar.precios', err, 'tool');
    }
  }

  async onSimularPrecio(params = {}) {
    const { project_id, receta_id, coste_por_porcion } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!receta_id)  return this._errorResponse(400, 'INVALID_INPUT', 'receta_id es obligatorio',  { field: 'receta_id' });
    if (typeof coste_por_porcion !== 'number' || coste_por_porcion < 0 || Number.isNaN(coste_por_porcion)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'coste_por_porcion debe ser number >= 0', { field: 'coste_por_porcion' });
    }

    try {
      const cost = coste_por_porcion;
      const preciosInput = Array.isArray(params.precios) && params.precios.length > 0
        ? params.precios.filter(p => typeof p === 'number' && p > 0)
        : [cost * 2.5, cost * 3, cost * 3.5, cost * 4];

      const simulaciones = preciosInput.map(pvp => {
        const food_cost_pct = cost > 0 ? (cost / pvp) * 100 : 0;
        const margen_euro   = pvp - cost;
        const multiplicador = cost > 0 ? pvp / cost : 0;
        return { precio_venta: pvp, food_cost_pct, margen_euro, multiplicador };
      });

      let pvp_objetivo = null;
      if (typeof params.food_cost_objetivo === 'number' && params.food_cost_objetivo > 0 && params.food_cost_objetivo <= 100) {
        pvp_objetivo = (cost / params.food_cost_objetivo) * 100;
      }

      this.metrics?.increment(`${this.name}.simular.precio.total`, 1, { project_id });

      return {
        status: 200,
        data: {
          receta_id,
          coste_por_porcion: cost,
          simulaciones,
          ...(pvp_objetivo !== null ? { food_cost_objetivo: params.food_cost_objetivo, pvp_objetivo } : {})
        }
      };
    } catch (err) {
      return this._handleHandlerError('escandallo.simular.precio', err, 'tool');
    }
  }

  async onIngredienteImpacto(params = {}) {
    const { project_id, ingrediente_nombre, precio_actual, recetas_afectadas } = params;
    if (!project_id)         return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio',         { field: 'project_id' });
    if (!ingrediente_nombre) return this._errorResponse(400, 'INVALID_INPUT', 'ingrediente_nombre es obligatorio', { field: 'ingrediente_nombre' });
    if (typeof precio_actual !== 'number' || precio_actual < 0) {
      return this._errorResponse(400, 'INVALID_INPUT', 'precio_actual debe ser number >= 0', { field: 'precio_actual' });
    }
    if (!Array.isArray(recetas_afectadas) || recetas_afectadas.length === 0) {
      return this._errorResponse(400, 'INVALID_INPUT', 'recetas_afectadas debe ser array no vacio', { field: 'recetas_afectadas' });
    }

    try {
      const subida_pct = typeof params.subida_pct === 'number' ? params.subida_pct : 10;
      const precio_simulado = precio_actual * (1 + subida_pct / 100);
      const delta_por_unidad = precio_simulado - precio_actual;

      const impactos = recetas_afectadas.map(r => {
        const coste_actual    = r.cantidad * precio_actual;
        const coste_simulado  = r.cantidad * precio_simulado;
        const delta_receta    = coste_simulado - coste_actual;
        return {
          receta_id: r.receta_id,
          nombre:    r.nombre,
          cantidad:  r.cantidad,
          unidad:    r.unidad,
          coste_actual,
          coste_simulado,
          delta_receta
        };
      });

      const delta_total = impactos.reduce((acc, i) => acc + i.delta_receta, 0);

      this.metrics?.increment(`${this.name}.ingrediente.impacto.total`, 1, { project_id });

      return {
        status: 200,
        data: {
          ingrediente_nombre,
          precio_actual,
          subida_pct,
          precio_simulado,
          delta_por_unidad,
          recetas_afectadas: impactos.length,
          impactos,
          delta_total
        }
      };
    } catch (err) {
      return this._handleHandlerError('escandallo.ingrediente.impacto', err, 'tool');
    }
  }

  async onOptimizar(params = {}) {
    const { project_id, calculos } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!Array.isArray(calculos) || calculos.length === 0) {
      return this._errorResponse(400, 'INVALID_INPUT', 'calculos debe ser array no vacio', { field: 'calculos' });
    }

    try {
      const food_cost_maximo = typeof params.food_cost_maximo === 'number'
        ? params.food_cost_maximo
        : this.config.food_cost_default_maximo;

      const recetas_food_cost_alto = calculos
        .filter(c => typeof c.food_cost_pct === 'number' && c.food_cost_pct > food_cost_maximo)
        .map(c => ({ receta_id: c.receta_id, nombre: c.nombre, food_cost_pct: c.food_cost_pct }));

      const coste_total = calculos.reduce((acc, c) => acc + (c.coste_por_porcion || 0), 0);
      const coste_medio = calculos.length > 0 ? coste_total / calculos.length : 0;

      const recetas_coste_alto = calculos
        .filter(c => c.coste_por_porcion > coste_medio * 1.5)
        .map(c => ({ receta_id: c.receta_id, nombre: c.nombre, coste_por_porcion: c.coste_por_porcion }));

      this.metrics?.increment(`${this.name}.optimizar.total`, 1, { project_id });

      return {
        status: 200,
        data: {
          food_cost_maximo,
          coste_medio,
          recetas_food_cost_alto: { total: recetas_food_cost_alto.length, items: recetas_food_cost_alto },
          recetas_coste_alto:     { total: recetas_coste_alto.length,     items: recetas_coste_alto }
        }
      };
    } catch (err) {
      return this._handleHandlerError('escandallo.optimizar', err, 'tool');
    }
  }

  async onFichaTecnica(params = {}) {
    const { project_id, receta_id, nombre, porciones, calculo } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!receta_id)  return this._errorResponse(400, 'INVALID_INPUT', 'receta_id es obligatorio',  { field: 'receta_id' });
    if (!nombre)     return this._errorResponse(400, 'INVALID_INPUT', 'nombre es obligatorio',     { field: 'nombre' });
    if (!Number.isInteger(porciones) || porciones < 1) {
      return this._errorResponse(400, 'INVALID_INPUT', 'porciones debe ser entero >= 1', { field: 'porciones' });
    }
    if (!calculo || typeof calculo.coste_total !== 'number' || typeof calculo.coste_por_porcion !== 'number') {
      return this._errorResponse(400, 'INVALID_INPUT', 'calculo.coste_total y calculo.coste_por_porcion son obligatorios', { field: 'calculo' });
    }

    try {
      const margen = (typeof params.precio_venta === 'number' && params.precio_venta > 0 && calculo.coste_por_porcion > 0)
        ? this._calcularMargen(calculo.coste_por_porcion, params.precio_venta)
        : null;

      const ficha = {
        receta_id,
        nombre,
        porciones,
        coste: {
          total:         calculo.coste_total,
          por_porcion:   calculo.coste_por_porcion,
          food_cost_pct: calculo.food_cost_pct ?? null
        },
        ...(margen ? { margen } : {}),
        instrucciones: typeof params.instrucciones === 'string' ? params.instrucciones : '',
        alergenos:     Array.isArray(params.alergenos) ? params.alergenos.map(a => String(a)) : []
      };

      this.metrics?.increment(`${this.name}.ficha.tecnica.total`, 1, { project_id });

      return { status: 200, data: ficha };
    } catch (err) {
      return this._handleHandlerError('escandallo.ficha.tecnica', err, 'tool');
    }
  }

  async onObtener(params = {}) {
    const { project_id, receta_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!receta_id)  return this._errorResponse(400, 'INVALID_INPUT', 'receta_id es obligatorio',  { field: 'receta_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        const snapshot = store.snapshots.find(s => s.receta_id === receta_id);
        if (!snapshot) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `No hay escandallo persistido para receta ${receta_id}`, { entity_type: 'recipe', entity_id: receta_id });
        }
        return { status: 200, data: snapshot };
      });
    } catch (err) {
      return this._handleHandlerError('escandallo.obtener', err, 'tool');
    }
  }

  async onListarAlertas(params = {}) {
    const { project_id, receta_id, tipo } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        let alertas = store.alertas;
        if (receta_id) alertas = alertas.filter(a => a.receta_id === receta_id);
        if (tipo)      alertas = alertas.filter(a => a.tipo === tipo);
        return { status: 200, data: { alertas, total: alertas.length } };
      });
    } catch (err) {
      return this._handleHandlerError('escandallo.alertas.listar', err, 'tool');
    }
  }

  // ============================================================
  // Helpers POC2 — _errorResponse, _classifyHandlerError, _handleHandlerError,
  // _statusFromCode, _enrich vienen de BaseModule. Override _publicarEvento
  // para enriquecer con project_id + user_id del subsistema-recetario.
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
  // Dominio protegido — validaciones + algoritmos + id
  // ============================================================

  _validarCalcular(data) {
    const errores = [];
    const { receta_id, nombre, porciones, ingredientes, precios_catalogo } = data;

    if (!receta_id || typeof receta_id !== 'string') {
      errores.push({ code: 'INVALID_INPUT', message: 'receta_id es obligatorio', details: { field: 'receta_id' } });
    }
    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      errores.push({ code: 'INVALID_INPUT', message: 'nombre es obligatorio', details: { field: 'nombre' } });
    }
    if (!Number.isInteger(porciones) || porciones < 1) {
      errores.push({ code: 'INVALID_INPUT', message: 'porciones debe ser entero >= 1', details: { field: 'porciones' } });
    }
    if (!Array.isArray(ingredientes) || ingredientes.length === 0) {
      errores.push({ code: 'INVALID_INPUT', message: 'ingredientes debe ser array no vacio', details: { field: 'ingredientes' } });
    } else {
      for (let i = 0; i < ingredientes.length; i++) {
        const ing = ingredientes[i];
        if (!ing || typeof ing.nombre !== 'string' || ing.nombre.trim() === '') {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes[${i}].nombre obligatorio`, details: { field: 'ingredientes', index: i } });
          break;
        }
        if (typeof ing.cantidad !== 'number' || ing.cantidad < 0) {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes[${i}].cantidad debe ser number >= 0`, details: { field: 'ingredientes', index: i } });
          break;
        }
        if (typeof ing.unidad !== 'string' || ing.unidad === '') {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes[${i}].unidad obligatorio`, details: { field: 'ingredientes', index: i } });
          break;
        }
      }
    }
    if (!precios_catalogo || typeof precios_catalogo !== 'object' || Array.isArray(precios_catalogo)) {
      errores.push({ code: 'INVALID_INPUT', message: 'precios_catalogo es obligatorio (objeto)', details: { field: 'precios_catalogo' } });
    }
    if (data.precio_venta !== undefined && (typeof data.precio_venta !== 'number' || data.precio_venta < 0)) {
      errores.push({ code: 'INVALID_INPUT', message: 'precio_venta debe ser number >= 0', details: { field: 'precio_venta' } });
    }

    return errores;
  }

  /**
   * Algoritmo central de escandallo.
   *   coste_ingrediente = cantidad * precio_por_unidad (si el catalogo lo tiene)
   *   coste_total = suma de coste_ingrediente
   *   coste_por_porcion = coste_total / porciones
   *   coste_es_real = true si TODOS los ingredientes tenian precio en catalogo
   *   food_cost_pct = (coste_por_porcion / precio_venta) * 100 (si hay PVP)
   *
   * precios_catalogo formato aceptado por ingrediente:
   *   number puro (precio_por_unidad directo)
   *   o { precio_por_unidad: number, unidad?: string }
   */
  _calcularEscandallo({ ingredientes, precios_catalogo, porciones, precio_venta }) {
    let coste_total = 0;
    const ingredientes_sin_precio = [];
    const desglose = [];

    for (const ing of ingredientes) {
      const precio = precios_catalogo[ing.nombre];
      let precio_unitario = null;
      if (typeof precio === 'number' && precio >= 0) {
        precio_unitario = precio;
      } else if (precio && typeof precio === 'object' && typeof precio.precio_por_unidad === 'number') {
        precio_unitario = precio.precio_por_unidad;
      }

      if (precio_unitario !== null) {
        const coste = ing.cantidad * precio_unitario;
        coste_total += coste;
        desglose.push({ nombre: ing.nombre, cantidad: ing.cantidad, unidad: ing.unidad, precio_por_unidad: precio_unitario, coste });
      } else {
        ingredientes_sin_precio.push(ing.nombre);
        desglose.push({ nombre: ing.nombre, cantidad: ing.cantidad, unidad: ing.unidad, precio_por_unidad: null, coste: null });
      }
    }

    const coste_es_real     = ingredientes_sin_precio.length === 0;
    const coste_por_porcion = porciones > 0 ? coste_total / porciones : 0;

    let food_cost_pct = null;
    if (typeof precio_venta === 'number' && precio_venta > 0) {
      food_cost_pct = (coste_por_porcion / precio_venta) * 100;
    }

    return { coste_total, coste_por_porcion, coste_es_real, food_cost_pct, ingredientes_sin_precio, desglose };
  }

  _calcularMargen(coste_por_porcion, precio_venta) {
    const food_cost_pct = (coste_por_porcion / precio_venta) * 100;
    const margen_euro   = precio_venta - coste_por_porcion;
    const multiplicador = precio_venta / coste_por_porcion;
    return { food_cost_pct, margen_euro, multiplicador };
  }

  _generarId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  }

  _invalidateProjectCache(project_id) {
    const prefix = `${project_id}|`;
    for (const k of this.snapshotCache.keys()) {
      if (k.startsWith(prefix)) this.snapshotCache.delete(k);
    }
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
    const absPath = `${basePath}/escandallo.json`.replace(/\/+/g, '/');
    const content = await this._readFile(absPath);
    if (!content) return this._emptyStore();
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.snapshots))    parsed.snapshots = [];
      if (!Array.isArray(parsed.alertas))      parsed.alertas = [];
      if (!Array.isArray(parsed.comparativas)) parsed.comparativas = [];
      return parsed;
    } catch (err) {
      this.logger?.warn(`${this.name}.persist.parse_error`, { abs_path: absPath, error_message: err.message });
      return this._emptyStore();
    }
  }

  async _saveStore(basePath, store) {
    const absPath = `${basePath}/escandallo.json`.replace(/\/+/g, '/');
    store._version = this.version;
    store._updated = new Date().toISOString();
    await this._writeFile(absPath, JSON.stringify(store, null, 2));
  }

  _emptyStore() {
    return { _version: this.version, _updated: null, snapshots: [], alertas: [], comparativas: [] };
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
      this.pendingFs.set(request_id, { resolve, reject, timer });
      this.eventBus.publish('fs.read.request', { request_id, path: absPath, encoding: 'utf8' }).catch(err => {
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
      this.pendingFs.set(request_id, { resolve, reject, timer });
      this.eventBus.publish('fs.write.request', { request_id, path: absPath, content, encoding: 'utf8', atomic: true }).catch(err => {
        clearTimeout(timer);
        this.pendingFs.delete(request_id);
        err._code = err._code || 'UPSTREAM_UNREACHABLE';
        reject(err);
      });
    });
  }
}

module.exports = EscandalloModule;
