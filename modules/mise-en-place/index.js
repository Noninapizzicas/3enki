/**
 * Modulo `mise-en-place` v1.0.0
 *
 * Planificacion previa al servicio: escalado de recetas, planes de produccion,
 * consolidacion de listas de compra. Eventos canonicos con prefix `produccion.*`
 * (decision del sub-contrato).
 *
 * Cumple los 24 contratos transversales:
 *   - extends BaseModule.
 *   - Override _publicarEvento para anadir project_id + user_id canonicos.
 *   - Toda respuesta { status, data | error: { code, message, details? } }.
 *   - Persistencia json-per-project via bus.
 *   - Sin acceso cross-modulo: el caller pasa los datos de las recetas.
 *
 * Payloads canonicos: ver arquitectura/decisiones/_schemas/subsistema-recetario/.
 */

'use strict';

const crypto     = require('crypto');
const BaseModule = require('../_shared/base-module');

const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_USER_ID    = 'default';
const ENTITY_TYPE        = 'production-plan';

const VALID_FRANJAS         = new Set(['desayuno', 'comida', 'merienda', 'cena', 'all_day']);
const VALID_HORIZONTE_TIPOS = new Set(['servicio', 'dia', 'semana', 'evento', 'personalizado']);
const FRANJA_HORA_SERVICIO   = { desayuno: 9, comida: 14, merienda: 17.5, cena: 21, all_day: 13 };

// A2 — estado del plan (contrato plan-v1 del diseno-oop): state machine cerrada.
// Transiciones: propuesto -> aprobado -> en_ejecucion -> cerrado.
const ESTADO_INICIAL_PLAN  = 'propuesto';
const ESTADOS_PLAN         = new Set(['propuesto', 'aprobado', 'en_ejecucion', 'cerrado']);
const TRANSICIONES_PLAN    = {
  propuesto:    ['aprobado'],
  aprobado:     ['en_ejecucion'],
  en_ejecucion: ['cerrado']
};

class MiseEnPlaceModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'mise-en-place';
    this.version = '1.0.0';

    this.config = {
      data_file_pattern:      'data/projects/{slug}/mise-en-place.json',
      project_get_timeout_ms: 5000,
      fs_request_timeout_ms:  5000,
      retroplanning: {
        ventana_default_min_horas: 24,
        ventana_default_max_horas: 72,
        masa_request_timeout_ms:   5000
      },
      agrupacion: {
        formato_default:         '33cm',
        gramaje_default_gramos:  280,
        tanda_default_kg:        10,
        masa_request_timeout_ms: 5000
      }
    };

    this.projectBasePaths = new Map();
    this.pendingProject   = new Map();
    this.pendingFs        = new Map();
    this.pendingMasa      = new Map();
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

    this.logger.info('mise-en-place.loaded', {
      module:  this.name,
      version: this.version,
      storage: 'json-per-project'
    });
  }

  async onUnload() {
    for (const { timer } of this.pendingProject.values()) clearTimeout(timer);
    for (const { timer } of this.pendingFs.values())      clearTimeout(timer);
    for (const { timer } of this.pendingMasa.values())    clearTimeout(timer);

    this.pendingProject.clear();
    this.pendingFs.clear();
    this.pendingMasa.clear();
    this.writeQueues.clear();
    this.projectBasePaths.clear();

    this.logger?.info('mise-en-place.unloaded', { module: this.name });
  }

  // ============================================================
  // Bus subscribers (lifecycle + fs responses)
  // ============================================================

  onProjectActivated(event) {
    const data = event?.data || event || {};
    const id = data.project_id || data.id;
    const basePath = data.base_path || data.project?.base_path;
    if (id && basePath) {
      this.projectBasePaths.set(id, basePath);
      this.logger?.debug('mise-en-place.project.cached', { project_id: id, base_path: basePath });
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

  onMasaReglasResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this.pendingMasa.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingMasa.delete(request_id);

    if (data.error) {
      pending.resolve(null);
      return;
    }
    pending.resolve(data.data ?? null);
  }

  onMasaGramajeResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this.pendingMasa.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingMasa.delete(request_id);

    if (data.error) {
      pending.resolve(null);
      return;
    }
    pending.resolve(data.data ?? null);
  }

  onMasaRendimientoResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this.pendingMasa.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingMasa.delete(request_id);

    if (data.error) {
      pending.resolve(null);
      return;
    }
    pending.resolve(data.data ?? null);
  }

  // ============================================================
  // Tools (invocadas por bus)
  // ============================================================

  async onCalcularEscalado(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    const errores = this._validarEscalado(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const ahora = new Date().toISOString();
        const { factor, ingredientes_escalados } = this._calcularEscalado(
          { ingredientes: params.ingredientes, porciones_origen: params.porciones_origen },
          params.porciones_destino
        );

        const escalado = {
          id:                     this._generarId('esc'),
          receta_id:              params.receta_id,
          porciones_origen:       params.porciones_origen,
          porciones_destino:      params.porciones_destino,
          factor,
          ingredientes_escalados,
          created_at:             ahora
        };
        store.escalados.push(escalado);

        const payload = {
          project_id,
          user_id:                params.user_id || DEFAULT_USER_ID,
          receta_id:              escalado.receta_id,
          porciones_origen:       escalado.porciones_origen,
          porciones_destino:      escalado.porciones_destino,
          factor:                 escalado.factor,
          ingredientes_escalados: escalado.ingredientes_escalados
        };

        await this._publicarEvento('produccion.escalado.calculado', payload, params);

        this.metrics?.increment(`${this.name}.escalado.calculado.total`, 1, { project_id });

        return {
          status: 201,
          data: {
            escalado_id:            escalado.id,
            receta_id:              escalado.receta_id,
            factor:                 escalado.factor,
            ingredientes_escalados: escalado.ingredientes_escalados
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.calcular_escalado', err, 'tool');
    }
  }

  async onPublicarPlan(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    const errores = this._validarPlan(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const ahora = new Date().toISOString();
        const plan_id = (typeof params.plan_id === 'string' && params.plan_id.trim() !== '')
          ? params.plan_id.trim()
          : this._generarId('plan');

        const lineas = params.lineas.map(l => {
          const linea = { receta_id: l.receta_id, porciones: l.porciones, franja: l.franja };
          if (typeof l.dia === 'string' && l.dia !== '') linea.dia = l.dia;
          return linea;
        });

        const plan = {
          id:              plan_id,
          horizonte_desde: params.horizonte_desde,
          horizonte_hasta: params.horizonte_hasta,
          lineas,
          estado:          ESTADO_INICIAL_PLAN,
          created_at:      ahora
        };
        store.planes.push(plan);

        const payload = {
          project_id,
          user_id:         params.user_id || DEFAULT_USER_ID,
          plan_id:         plan.id,
          horizonte_desde: plan.horizonte_desde,
          horizonte_hasta: plan.horizonte_hasta,
          lineas:          plan.lineas
        };

        await this._publicarEvento('produccion.plan.publicado', payload, params);

        this.metrics?.increment(`${this.name}.plan.publicado.total`, 1, { project_id });
        this.metrics?.gauge(`${this.name}.planes.count`, store.planes.length, { project_id });

        return {
          status: 201,
          data: {
            plan_id:    plan.id,
            total_lineas: plan.lineas.length
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.publicar_plan', err, 'tool');
    }
  }

  async onCalcularCompra(params = {}) {
    const start = Date.now();
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    const errores = this._validarCompra(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const items = this._agregarCompra(params.recetas);
        const ahora = new Date().toISOString();

        const compra = {
          id:                     this._generarId('compra'),
          horizonte:              { ...params.horizonte },
          recetas_consideradas:   params.recetas.map(r => ({ receta_id: r.receta_id, porciones: r.porciones })),
          items,
          created_at:             ahora
        };
        store.compras.push(compra);

        const payload = {
          project_id,
          user_id:                params.user_id || DEFAULT_USER_ID,
          horizonte:              compra.horizonte,
          recetas_consideradas:   compra.recetas_consideradas,
          items:                  compra.items
        };

        await this._publicarEvento('produccion.compra.calculada', payload, params);

        this.metrics?.increment(`${this.name}.compra.calculada.total`, 1, { project_id });
        this.metrics?.timing(`${this.name}.compra.duration`, Date.now() - start);

        return {
          status: 201,
          data: {
            compra_id:         compra.id,
            items_total:       compra.items.length,
            items:             compra.items
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.calcular_compra', err, 'tool');
    }
  }

  async onObtenerPlan(params = {}) {
    const { project_id, plan_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!plan_id)    return this._errorResponse(400, 'INVALID_INPUT', 'plan_id es obligatorio',    { field: 'plan_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        const plan = this._normalizarPlan(store.planes.find(p => p.id === plan_id));
        if (!plan) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Plan con id ${plan_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: plan_id });
        }
        return { status: 200, data: plan };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.obtener_plan', err, 'tool');
    }
  }

  async onListarPlanes(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        return {
          status: 200,
          data: {
            planes: store.planes.map(p => this._normalizarPlan({
              id:               p.id,
              horizonte_desde:  p.horizonte_desde,
              horizonte_hasta:  p.horizonte_hasta,
              total_lineas:     p.lineas.length,
              created_at:       p.created_at
            })),
            total: store.planes.length
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.listar_planes', err, 'tool');
    }
  }

  async onCalcularRetroplanning(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    const errores = this._validarRetroplanning(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      const { datos } = await this._calcularRetroplanning(params);

      const payload = {
        project_id,
        user_id:      params.user_id || DEFAULT_USER_ID,
        ...datos
      };

      await this._publicarEvento('produccion.retroplanning.calculado', payload, params);

      this.metrics?.increment(`${this.name}.retroplanning.calculado.total`, 1, { project_id });

      return { status: 200, data: datos };
    } catch (err) {
      return this._handleHandlerError('mise-en-place.calcular_retroplanning', err, 'tool');
    }
  }

  // ============================================================
  // A3 — agrupacion-tanda: lineas -> tandas de masa
  // ============================================================

  /**
   * Agrupa lineas de demanda en tandas de masa. Pide a masa el gramaje por
   * pieza (masa.gramaje.calcular) y el rendimiento por tanda
   * (masa.rendimiento.calcular). Si masa no responde (aun no cargado), usa
   * defaults de config y lo declara en la respuesta (fuente). Conversor puro:
   * no persiste.
   */
  async onAgruparTandas(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    const errores = this._validarAgrupacion(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      const datos = await this._agruparTandas(params);

      const payload = {
        project_id,
        user_id:   params.user_id || DEFAULT_USER_ID,
        ...datos
      };

      await this._publicarEvento('produccion.tandas.agrupadas', payload, params);

      this.metrics?.increment(`${this.name}.tandas.agrupadas.total`, 1, { project_id });

      return { status: 200, data: datos };
    } catch (err) {
      return this._handleHandlerError('mise-en-place.agrupar_tandas', err, 'tool');
    }
  }

  // ============================================================
  // Helpers POC2 — heredados de BaseModule + override _publicarEvento
  // ============================================================

  async onAprobarPlan(params = {}) {
    return this._transicionarPlanRequest(params, 'aprobado');
  }

  async onEjecutarPlan(params = {}) {
    return this._transicionarPlanRequest(params, 'en_ejecucion');
  }

  async onCerrarPlan(params = {}) {
    return this._transicionarPlanRequest(params, 'cerrado');
  }

  /** A2 — custodio estado-plan: una sola maquina de transiciones para las 3 ops. */
  async _transicionarPlanRequest(params, hacia) {
    const { project_id, plan_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!plan_id)    return this._errorResponse(400, 'INVALID_INPUT', 'plan_id es obligatorio',    { field: 'plan_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        const plan = this._normalizarPlan(store.planes.find(p => p.id === plan_id));
        if (!plan) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Plan con id ${plan_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: plan_id });
        }
        if (plan.estado === hacia) {
          return this._errorResponse(409, 'CONFLICT_STATE', `El plan ya esta en estado ${hacia}`, { plan_id, estado_actual: plan.estado });
        }
        const permitidas = TRANSICIONES_PLAN[plan.estado] || [];
        if (!permitidas.includes(hacia)) {
          return this._errorResponse(409, 'CONFLICT_STATE', `Transicion ${plan.estado} -> ${hacia} no permitida`, {
            plan_id, estado_actual: plan.estado, transiciones_permitidas: permitidas
          });
        }
        // Precondicion del diseno: aprobar requiere decision_pendiente vacia o confirmada (M3).
        if (hacia === 'aprobado' && Array.isArray(plan.decision_pendiente) && plan.decision_pendiente.length > 0) {
          return this._errorResponse(409, 'CONFLICT_STATE', 'El plan tiene decisiones pendientes sin confirmar', {
            plan_id, decision_pendiente: plan.decision_pendiente
          });
        }

        const desde = plan.estado;
        plan.estado = hacia;
        plan.estado_actualizado_at = new Date().toISOString();

        const payload = {
          project_id,
          user_id:         params.user_id || DEFAULT_USER_ID,
          plan_id:         plan.id,
          desde,
          hacia,
          horizonte_desde: plan.horizonte_desde,
          horizonte_hasta: plan.horizonte_hasta,
          total_lineas:    plan.lineas.length
        };

        await this._publicarEvento('produccion.plan.estado.avanzado', payload, params);
        this.metrics?.increment(`${this.name}.plan.estado.avanzado.total`, 1, { project_id, desde, hacia });

        return { status: 200, data: { plan_id: plan.id, estado: plan.estado, desde, hacia } };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.transicionar_plan', err, 'tool');
    }
  }

  /** A2 — planes previos al cambio de shape (sin estado) se leen como propuestos. */
  _normalizarPlan(plan) {
    if (!plan) return null;
    if (!ESTADOS_PLAN.has(plan.estado)) plan.estado = ESTADO_INICIAL_PLAN;
    return plan;
  }

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
  // Dominio protegido — validaciones + id + algoritmos
  // ============================================================

  _validarEscalado(data) {
    const errores = [];
    const { receta_id, porciones_origen, porciones_destino, ingredientes } = data;

    if (!receta_id || typeof receta_id !== 'string') {
      errores.push({ code: 'INVALID_INPUT', message: 'receta_id es obligatorio', details: { field: 'receta_id' } });
    }
    if (!Number.isInteger(porciones_origen) || porciones_origen < 1) {
      errores.push({ code: 'INVALID_INPUT', message: 'porciones_origen debe ser entero >= 1', details: { field: 'porciones_origen' } });
    }
    if (!Number.isInteger(porciones_destino) || porciones_destino < 1) {
      errores.push({ code: 'INVALID_INPUT', message: 'porciones_destino debe ser entero >= 1', details: { field: 'porciones_destino' } });
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
        if (typeof ing.cantidad !== 'number' || ing.cantidad < 0 || Number.isNaN(ing.cantidad)) {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes[${i}].cantidad debe ser number >= 0`, details: { field: 'ingredientes', index: i } });
          break;
        }
        if (typeof ing.unidad !== 'string' || ing.unidad === '') {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes[${i}].unidad obligatorio`, details: { field: 'ingredientes', index: i } });
          break;
        }
      }
    }

    return errores;
  }

  _validarPlan(data) {
    const errores = [];
    const { horizonte_desde, horizonte_hasta, lineas } = data;

    if (!horizonte_desde || typeof horizonte_desde !== 'string') {
      errores.push({ code: 'INVALID_INPUT', message: 'horizonte_desde es obligatorio (ISO 8601 date-time)', details: { field: 'horizonte_desde' } });
    }
    if (!horizonte_hasta || typeof horizonte_hasta !== 'string') {
      errores.push({ code: 'INVALID_INPUT', message: 'horizonte_hasta es obligatorio (ISO 8601 date-time)', details: { field: 'horizonte_hasta' } });
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
      errores.push({ code: 'INVALID_INPUT', message: 'lineas debe ser array no vacio', details: { field: 'lineas' } });
    } else {
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        if (!l || typeof l.receta_id !== 'string' || l.receta_id === '') {
          errores.push({ code: 'INVALID_INPUT', message: `lineas[${i}].receta_id obligatorio`, details: { field: 'lineas', index: i } });
          break;
        }
        if (!Number.isInteger(l.porciones) || l.porciones < 1) {
          errores.push({ code: 'INVALID_INPUT', message: `lineas[${i}].porciones debe ser entero >= 1`, details: { field: 'lineas', index: i } });
          break;
        }
        if (!VALID_FRANJAS.has(l.franja)) {
          errores.push({ code: 'INVALID_INPUT', message: `lineas[${i}].franja debe ser una de: ${Array.from(VALID_FRANJAS).join(', ')}`, details: { field: 'lineas', index: i, allowed: Array.from(VALID_FRANJAS) } });
          break;
        }
      }
    }

    return errores;
  }

  _validarCompra(data) {
    const errores = [];
    const { horizonte, recetas } = data;

    if (!horizonte || typeof horizonte !== 'object' || Array.isArray(horizonte)) {
      errores.push({ code: 'INVALID_INPUT', message: 'horizonte es obligatorio (objeto)', details: { field: 'horizonte' } });
    } else if (!VALID_HORIZONTE_TIPOS.has(horizonte.tipo)) {
      errores.push({ code: 'INVALID_INPUT', message: `horizonte.tipo debe ser uno de: ${Array.from(VALID_HORIZONTE_TIPOS).join(', ')}`, details: { field: 'horizonte.tipo', allowed: Array.from(VALID_HORIZONTE_TIPOS) } });
    }

    if (!Array.isArray(recetas) || recetas.length === 0) {
      errores.push({ code: 'INVALID_INPUT', message: 'recetas debe ser array no vacio', details: { field: 'recetas' } });
    } else {
      for (let i = 0; i < recetas.length; i++) {
        const r = recetas[i];
        if (!r || typeof r.receta_id !== 'string' || r.receta_id === '') {
          errores.push({ code: 'INVALID_INPUT', message: `recetas[${i}].receta_id obligatorio`, details: { field: 'recetas', index: i } });
          break;
        }
        if (!Number.isInteger(r.porciones) || r.porciones < 1) {
          errores.push({ code: 'INVALID_INPUT', message: `recetas[${i}].porciones debe ser entero >= 1`, details: { field: 'recetas', index: i } });
          break;
        }
        if (!Array.isArray(r.ingredientes) || r.ingredientes.length === 0) {
          errores.push({ code: 'INVALID_INPUT', message: `recetas[${i}].ingredientes debe ser array no vacio`, details: { field: 'recetas', index: i } });
          break;
        }
      }
    }

    return errores;
  }

  _generarId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  }

  _validarRetroplanning(data) {
    const errores = [];
    const { fecha_servicio, franja, lineas } = data;

    if (!fecha_servicio || typeof fecha_servicio !== 'string' || Number.isNaN(Date.parse(fecha_servicio))) {
      errores.push({ code: 'INVALID_INPUT', message: 'fecha_servicio es obligatoria y debe ser fecha válida (YYYY-MM-DD o ISO 8601)', details: { field: 'fecha_servicio' } });
    }
    if (!VALID_FRANJAS.has(franja)) {
      errores.push({ code: 'INVALID_INPUT', message: `franja debe ser una de: ${Array.from(VALID_FRANJAS).join(', ')}`, details: { field: 'franja', allowed: Array.from(VALID_FRANJAS) } });
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
      errores.push({ code: 'INVALID_INPUT', message: 'lineas debe ser array no vacio', details: { field: 'lineas' } });
    } else {
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        if (!l || typeof l.receta_id !== 'string' || l.receta_id === '') {
          errores.push({ code: 'INVALID_INPUT', message: `lineas[${i}].receta_id obligatorio`, details: { field: 'lineas', index: i } });
          break;
        }
        if (!Number.isInteger(l.porciones) || l.porciones < 1) {
          errores.push({ code: 'INVALID_INPUT', message: `lineas[${i}].porciones debe ser entero >= 1`, details: { field: 'lineas', index: i } });
          break;
        }
      }
    }

    return errores;
  }

  _validarAgrupacion(data) {
    const errores = [];
    const { lineas } = data;

    if (!Array.isArray(lineas) || lineas.length === 0) {
      errores.push({ code: 'INVALID_INPUT', message: 'lineas debe ser array no vacio', details: { field: 'lineas' } });
    } else {
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        if (!l || typeof l.receta_id !== 'string' || l.receta_id === '') {
          errores.push({ code: 'INVALID_INPUT', message: `lineas[${i}].receta_id obligatorio`, details: { field: 'lineas', index: i } });
          break;
        }
        if (!Number.isInteger(l.porciones) || l.porciones < 1) {
          errores.push({ code: 'INVALID_INPUT', message: `lineas[${i}].porciones debe ser entero >= 1`, details: { field: 'lineas', index: i } });
          break;
        }
      }
    }

    return errores;
  }

  /**
   * Escalado lineal proporcional: factor = porciones_destino / porciones_origen.
   * cantidad_nueva = cantidad_original * factor.
   */
  _calcularEscalado(receta, porciones_destino) {
    const factor = porciones_destino / receta.porciones_origen;
    const ingredientes_escalados = receta.ingredientes.map(ing => ({
      nombre:   ing.nombre,
      cantidad: ing.cantidad * factor,
      unidad:   ing.unidad
    }));
    return { factor, ingredientes_escalados };
  }

  /**
   * Agregacion de compra por (ingrediente_nombre_lower, unidad). Aplica merma
   * cuando esta presente: cantidad_efectiva = cantidad * (1 + merma_pct/100).
   * El primer merma_pct visto para una clave (nombre,unidad) se preserva en el
   * item agregado.
   */
  _agregarCompra(recetas) {
    const acc = new Map();  // key -> { ingrediente, unidad, cantidad_neta, merma_pct? }
    for (const r of recetas) {
      for (const ing of r.ingredientes) {
        const nombre = String(ing.nombre);
        const unidad = String(ing.unidad);
        const key = `${nombre.toLowerCase()}|${unidad}`;
        const merma = (typeof ing.merma_pct === 'number') ? ing.merma_pct : null;
        const cantidad_efectiva = merma !== null
          ? ing.cantidad * (1 + merma / 100)
          : ing.cantidad;

        if (!acc.has(key)) {
          const item = { ingrediente: nombre, unidad, cantidad_neta: cantidad_efectiva };
          if (merma !== null) item.merma_pct = merma;
          acc.set(key, item);
        } else {
          const item = acc.get(key);
          item.cantidad_neta += cantidad_efectiva;
        }
      }
    }
    return Array.from(acc.values());
  }

  /**
   * Retroplanning (A1): dada la señal de demanda (fecha_servicio + franja +
   * recetas con porciones) devuelve la VENTANA de producción de cada receta:
   *   desde  = servicio − ventana.max  (lo más pronto que se puede producir)
   *   hasta  = servicio − ventana.min  (lo más tarde, con margen mínimo)
   *   recomendada = punto medio de la ventana.
   * La ventana de maduración la pide a masa (masa.reglas.leer); si masa no
   * responde (aún no cargado), usa el default de config y lo declara en
   * ventana.fuente. Conversor puro: no persiste nada.
   */
  async _calcularRetroplanning(params) {
    const { fecha_servicio, franja, lineas } = params;

    const servicio = this._resolverInstanteServicio(fecha_servicio, franja);
    const ahora    = new Date();

    const masaReglas = await this._requestMasaReglas(params.project_id);
    let ventana;
    if (masaReglas?.reglas?.ventana_uso && masaReglas.reglas.ventana_uso.min_horas > 0) {
      ventana = {
        min_horas:     masaReglas.reglas.ventana_uso.min_horas,
        max_horas:     masaReglas.reglas.ventana_uso.max_horas,
        fuente:        'masa.reglas',
        reglas_fuente: masaReglas.fuente || 'persistida'
      };
    } else {
      ventana = {
        min_horas: this.config.retroplanning.ventana_default_min_horas,
        max_horas: this.config.retroplanning.ventana_default_max_horas,
        fuente:    'config_default'
      };
    }

    const producciones = lineas.map((l) => {
      const desde       = this._restarHoras(servicio, ventana.max_horas);
      const hasta       = this._restarHoras(servicio, ventana.min_horas);
      const recomendada = this._restarHoras(servicio, (ventana.min_horas + ventana.max_horas) / 2);
      return {
        receta_id:              l.receta_id,
        porciones:              l.porciones,
        produccion_desde:       desde.toISOString(),
        produccion_hasta:       hasta.toISOString(),
        produccion_recomendada: recomendada.toISOString(),
        dentro_de_plazo:        hasta.getTime() > ahora.getTime()
      };
    });

    producciones.sort((a, b) => a.produccion_recomendada.localeCompare(b.produccion_recomendada));

    return {
      datos: {
        fecha_servicio: servicio.toISOString(),
        franja,
        franja_hora:    FRANJA_HORA_SERVICIO[franja],
        ventana,
        lineas:         producciones
      }
    };
  }

  _resolverInstanteServicio(fecha_servicio, franja) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha_servicio)) {
      const [y, m, d] = fecha_servicio.split('-').map(Number);
      const hora = FRANJA_HORA_SERVICIO[franja] ?? 13;
      const hh = Math.floor(hora);
      const mm = Math.round((hora - hh) * 60);
      return new Date(Date.UTC(y, m - 1, d, hh, mm));
    }
    return new Date(fecha_servicio);
  }

  _restarHoras(fecha, horas) {
    return new Date(fecha.getTime() - horas * 3600 * 1000);
  }

  async _requestMasaReglas(project_id) {
    if (!this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingMasa.delete(request_id);
        resolve(null);
      }, this.config.retroplanning.masa_request_timeout_ms);
      this.pendingMasa.set(request_id, { resolve, timer });
      this.eventBus.publish('masa.reglas.leer.request', { request_id, project_id }).catch(() => {
        clearTimeout(timer);
        this.pendingMasa.delete(request_id);
        resolve(null);
      });
    });
  }

  async _requestMasaGramaje(project_id, formato) {
    if (!this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingMasa.delete(request_id);
        resolve(null);
      }, this.config.agrupacion.masa_request_timeout_ms);
      this.pendingMasa.set(request_id, { resolve, timer });
      this.eventBus.publish('masa.gramaje.calcular.request', { request_id, project_id, formato }).catch(() => {
        clearTimeout(timer);
        this.pendingMasa.delete(request_id);
        resolve(null);
      });
    });
  }

  async _requestMasaRendimiento(project_id, formato, kilos) {
    if (!this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingMasa.delete(request_id);
        resolve(null);
      }, this.config.agrupacion.masa_request_timeout_ms);
      this.pendingMasa.set(request_id, { resolve, timer });
      this.eventBus.publish('masa.rendimiento.calcular.request', { request_id, project_id, formato, kilos }).catch(() => {
        clearTimeout(timer);
        this.pendingMasa.delete(request_id);
        resolve(null);
      });
    });
  }

  /**
   * Agrupacion-tanda (A3): empaqueta lineas de demanda en tandas de masa.
   * - Pide a masa el gramaje por pieza (gramaje_gramos) del formato.
   * - Pide a masa el rendimiento (bolas) para una tanda de `tamano_tanda_kg`.
   * - Si masa no responde (aun no cargado), usa defaults de config y declara
   *   fuente: 'config_default'.
   * - Empaqueta las lineas por franja primero (misma franja -> misma tanda si
   *   cabe); si una linea excede la capacidad de una tanda, abre tanda nueva.
   * Conversor puro: no persiste.
   */
  async _agruparTandas(params) {
    const { project_id, lineas } = params;
    const formato = params.formato || this.config.agrupacion.formato_default;
    const tamanoTandaKg = params.tamano_tanda_kg || this.config.agrupacion.tanda_default_kg;

    const [gramaje, rendimiento] = await Promise.all([
      this._requestMasaGramaje(project_id, formato),
      this._requestMasaRendimiento(project_id, formato, tamanoTandaKg)
    ]);

    const gramajePieza = (gramaje && typeof gramaje.gramaje_gramos === 'number')
      ? gramaje.gramaje_gramos
      : this.config.agrupacion.gramaje_default_gramos;

    const bolasPorTanda = (rendimiento && typeof rendimiento.bolas === 'number' && rendimiento.bolas > 0)
      ? rendimiento.bolas
      : Math.max(1, Math.floor((tamanoTandaKg * 1000) / gramajePieza));

    const fuente = (gramaje && rendimiento) ? 'masa' : 'config_default';

    // Porciones por linea = bolas necesarias (1 bola por porcion de pizza).
    const conBolas = lineas.map(l => ({
      receta_id: l.receta_id,
      porciones: l.porciones,
      bolas:     l.porciones,
      franja:    l.franja || null
    }));

    // Orden: franja (agrupa servicios) y dentro, porciones desc (first-fit decreasing).
    const orden = [...conBolas].sort((a, b) => {
      const f = (a.franja || '').localeCompare(b.franja || '');
      return f !== 0 ? f : b.porciones - a.porciones;
    });

    const tandas = [];
    const franjaActual = new Map(); // franja -> indice de tanda en curso

    for (const linea of orden) {
      const franja = linea.franja || null;
      const idx = franjaActual.get(franja);
      const abierta = (idx !== undefined && tandas[idx]) ? tandas[idx] : null;
      const cabe = abierta && (abierta.bolas + linea.bolas) <= bolasPorTanda;

      if (cabe) {
        abierta.lineas.push({ receta_id: linea.receta_id, porciones: linea.porciones });
        abierta.bolas += linea.bolas;
        abierta.gramos_masa = abierta.bolas * gramajePieza;
        continue;
      }

      const nueva = {
        tanda_id:   this._generarId('tanda'),
        formato,
        franja,
        bolas:      linea.bolas,
        gramos_masa: linea.bolas * gramajePieza,
        capacidad_bolas: bolasPorTanda,
        lineas:     [{ receta_id: linea.receta_id, porciones: linea.porciones }]
      };
      tandas.push(nueva);
      franjaActual.set(franja, tandas.length - 1);
    }

    return {
      formato,
      tamano_tanda_kg: tamanoTandaKg,
      gramaje_pieza_gramos: gramajePieza,
      bolas_por_tanda: bolasPorTanda,
      fuente,
      tandas,
      resumen: {
        total_lineas:  lineas.length,
        total_bolas:   conBolas.reduce((s, l) => s + l.bolas, 0),
        total_gramos:  tandas.reduce((s, t) => s + t.gramos_masa, 0),
        total_tandas:  tandas.length
      }
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

  async _loadStore(project_id) {
    // Convencion canonica del filesystem: path relativo al storage del proyecto
    // (leading-slash -> raiz del storage) + project_id en el payload del request.
    // El base_path absoluto del proyecto NO se usa: validatePath lo rechaza
    // (Absolute system path rejected) y resuelve con el project_id del payload.
    const relPath = '/mise-en-place.json';
    const content = await this._readFile(project_id, relPath);
    if (!content) return this._emptyStore();
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.planes))    parsed.planes = [];
      if (!Array.isArray(parsed.escalados)) parsed.escalados = [];
      if (!Array.isArray(parsed.compras))   parsed.compras = [];
      return parsed;
    } catch (err) {
      this.logger?.warn(`${this.name}.persist.parse_error`, { rel_path: relPath, error_message: err.message });
      return this._emptyStore();
    }
  }

  async _saveStore(project_id, store) {
    const relPath = '/mise-en-place.json';
    store._version = this.version;
    store._updated = new Date().toISOString();
    await this._writeFile(project_id, relPath, JSON.stringify(store, null, 2));
  }

  _emptyStore() {
    return { _version: this.version, _updated: null, planes: [], escalados: [], compras: [] };
  }

  async _withStore(project_id, mutator) {
    const prev = this.writeQueues.get(project_id) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        const store  = await this._loadStore(project_id);
        const result = await mutator(store);
        if (!result || result.status === undefined || result.status < 400) {
          await this._saveStore(project_id, store);
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

  async _readFile(project_id, relPath) {
    if (!this.eventBus?.publish) {
      const err = new Error('eventBus no disponible para fs.read.request');
      err._code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        const err = new Error(`fs.read timeout para ${relPath}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, this.config.fs_request_timeout_ms);
      this.pendingFs.set(request_id, { resolve, reject, timer });
      this.eventBus.publish('fs.read.request', { request_id, project_id, path: relPath, encoding: 'utf8' }).catch(err => {
        clearTimeout(timer);
        this.pendingFs.delete(request_id);
        err._code = err._code || 'UPSTREAM_UNREACHABLE';
        reject(err);
      });
    });
  }

  async _writeFile(project_id, relPath, content) {
    if (!this.eventBus?.publish) {
      const err = new Error('eventBus no disponible para fs.write.request');
      err._code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        const err = new Error(`fs.write timeout para ${relPath}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, this.config.fs_request_timeout_ms);
      this.pendingFs.set(request_id, { resolve, reject, timer });
      this.eventBus.publish('fs.write.request', { request_id, project_id, path: relPath, content, encoding: 'utf8', atomic: true }).catch(err => {
        clearTimeout(timer);
        this.pendingFs.delete(request_id);
        err._code = err._code || 'UPSTREAM_UNREACHABLE';
        reject(err);
      });
    });
  }
}

module.exports = MiseEnPlaceModule;
