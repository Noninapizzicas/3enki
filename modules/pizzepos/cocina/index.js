/**
 * Modulo Cocina v3.2.0 — POC2 canonico
 *
 * Display de cocina en tiempo real con tracking item a item.
 *
 * Sistema de pases acumulativo:
 *   - General (pase 0): pendiente -> preparando -> pase++ (avanzado a horno)
 *   - Horno (pase 1): item llega como preparando, 1 tap -> ticket + listo
 *   - Cada estacion filtra por pase_minimo. Extensible a mas estaciones.
 *
 * Multi-device:
 *   - Cada device se registra con register-device y recibe color unico
 *   - Cada device puede filtrar por familias (client-side)
 *
 * Snapshot persistente atomico (tmp + rename) sobrevive reinicios.
 */

const fs = require('fs').promises;
const path = require('path');

const BaseModule = require('../../_shared/base-module');
const ResolutorProyecto = require('../../_shared/resolutor-proyecto');
const TIPOS_ESTACION = {
  general: {
    id: 'general',
    nombre: 'General',
    descripcion: 'Preparacion completada — se imprime el ticket al terminar el item',
    pase_minimo: 0,
    comportamientos: { imprime_al_completar: true, auto_preparar: false }
  }
};

const DEVICE_COLORS = [
  '#3b82f6', '#f97316', '#a855f7', '#14b8a6',
  '#f43f5e', '#84cc16', '#06b6d4', '#e879f9'
];

const SNAPSHOT_DEBOUNCE_MS = 1000;
const MAX_HISTORIAL = 50;
const MAX_TIEMPOS_PREPARACION = 100;

const UI_ACTIONS = [
  'list-active', 'get', 'history', 'prepare-item', 'mark-ready',
  'health', 'metrics', 'register-device', 'unregister-device',
  'list-devices', 'list-station-types', 'list-displays'
];

class CocinaModule extends BaseModule {
  constructor() {
    super();
    this.name = 'cocina';
    this.version = '3.5.0';
    this.uiHandler = null;
    this.validator = null;
    this.config = null;

    this.pedidosActivos = new Map();
    this.historial = [];
    this.cuentaNombres = new Map();
    this.tiemposPreparacion = [];
    this.tiposEstacion = { ...TIPOS_ESTACION };
    this.devices = new Map();

    // Identidad de proyecto en un solo camino: id (uuid) | slug -> slug.
    // El modulo es un singleton del core, asi que aqui conviven los pedidos de
    // todos los proyectos; esto es lo que permite recortarlos al que pregunta.
    this._proyectos = new ResolutorProyecto();
    this._avisadosSinProyecto = new Set();

    this._snapshotFile = null;
    this._snapshotSaveTimer = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.validator = core.validationManager || null;
    this.config = core.config || null;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // El resolutor necesita el bus vivo; se recrea con el para no quedar mudo.
    this._proyectos = new ResolutorProyecto({
      eventBus: this.eventBus, logger: this.logger, metrics: this.metrics
    });
    this._proyectos.calentar();

    this._registerSchemas();
    // tools.contract v1.2: el loader auto-wirea tools[] del module.json a uiHandler.

    this._snapshotFile = path.join('.', 'data', 'current', 'cocina_snapshot.json');
    const restoredFromSnapshot = await this._restaurarSnapshot();
    if (!restoredFromSnapshot) {
      await this._restaurarDesdeArchivo();
    }

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this._snapshotSaveTimer) {
      clearTimeout(this._snapshotSaveTimer);
      this._snapshotSaveTimer = null;
      try { await this._saveSnapshot(); } catch (_) { /* best-effort */ }
    }

    // El loader desregistra uiHandler entries automaticamente via unregisterToolsForAI.
    this.pedidosActivos.clear();
    this.historial = [];
    this.tiemposPreparacion = [];
    this.devices.clear();
    this.cuentaNombres.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (code === 'EACCES' || code === 'EPERM') return { status: 500, code: 'UNKNOWN_ERROR' };
    if (/required|invalid|missing/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/conflict|estado|already/i.test(msg)) return { status: 409, code: 'CONFLICT_STATE' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('cocina.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  // ==========================================
  // Identidad de proyecto (aislamiento entre cocinas)
  // ==========================================
  //
  // El modulo es un singleton: en `pedidosActivos` conviven los pedidos de TODOS
  // los proyectos del core. Cada pedido lleva su project_id desde
  // onPedidoEnviadoCocina, pero listar sin mirarlo hacia que la cocina de un
  // proyecto ensenara (y pudiera marcar listo) los pedidos de otro. Estas
  // funciones son el UNICO camino para recortar esa lista, y hablan la lengua
  // del resolutor compartido: se pregunta con uuid o con slug, responde el slug.

  async _slugProyecto(projectId) {
    return this._proyectos.slugDe(projectId);
  }

  // Un pedido es de este proyecto cuando su llave resuelve al mismo slug.
  // Un pedido sin project_id no es de nadie: se avisa (no_silent_drops) y queda fuera.
  async _esDelProyecto(cosa, slug) {
    if (!slug) return true;
    if (!cosa?.project_id) {
      const clave = cosa?.pedido_id || cosa?.device_id || 'desconocido';
      if (!this._avisadosSinProyecto.has(clave)) {
        this._avisadosSinProyecto.add(clave);
        this.logger?.warn?.('cocina.sin_proyecto', { entidad: clave });
        this.metrics?.increment?.('cocina.errors', { code: 'MISSING_PROJECT', kind: 'aislamiento' });
      }
      return false;
    }
    return (await this._slugProyecto(cosa.project_id)) === slug;
  }

  // Pedidos activos que puede ver quien pregunta. Sin project_id → todos
  // (el camino de los agentes y del bus, que ya hablan de un proyecto concreto).
  async _pedidosVisibles(projectId) {
    const todos = Array.from(this.pedidosActivos.values());
    if (!projectId) return todos;
    const slug = await this._slugProyecto(projectId);
    const visibles = [];
    for (const p of todos) {
      if (await this._esDelProyecto(p, slug)) visibles.push(p);
    }
    return visibles;
  }

  async _devicesVisibles(projectId) {
    const lista = this._getDeviceList();
    if (!projectId) return lista;
    const slug = await this._slugProyecto(projectId);
    const visibles = [];
    for (const d of lista) {
      if (await this._esDelProyecto(d, slug)) visibles.push(d);
    }
    return visibles;
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ||
      sourcePayload?.project_id ||
      sourcePayload?.data?.project_id ||
      null;
    const enriched = {
      ...payload,
      correlation_id,
      project_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    await this.eventBus.publish(name, enriched);
    return enriched;
  }

  async _atomicWriteFile(targetPath, data) {
    const tmp = `${targetPath}.tmp`;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(tmp, data);
    try {
      await fs.rename(tmp, targetPath);
    } catch (err) {
      try { await fs.unlink(tmp); } catch (_) { /* ignore */ }
      throw err;
    }
  }

  async _readJsonSafe(filePath, { silentEnoent = true } = {}) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT' && silentEnoent) return null;
      this.logger?.warn?.('cocina.read_json.error', {
        file: filePath,
        error_code: err.code || 'PARSE_ERROR',
        error_message: err.message
      });
      return null;
    }
  }

  // ==========================================
  // Snapshot persistente
  // ==========================================

  _saveSnapshotDebounced() {
    if (this._snapshotSaveTimer) clearTimeout(this._snapshotSaveTimer);
    if (!this._snapshotFile) return;
    this._snapshotSaveTimer = setTimeout(() => this._saveSnapshot(), SNAPSHOT_DEBOUNCE_MS);
  }

  async _saveSnapshot() {
    if (!this._snapshotFile) return;
    try {
      const snapshot = {
        _saved_at: new Date().toISOString(),
        pedidos: Object.fromEntries(this.pedidosActivos)
      };
      await this._atomicWriteFile(this._snapshotFile, JSON.stringify(snapshot));
    } catch (err) {
      this.logger?.warn?.('cocina.snapshot.save_error', {
        error_code: err.code || 'IO_ERROR',
        error_message: err.message
      });
    }
  }

  async _restaurarSnapshot() {
    const snapshot = await this._readJsonSafe(this._snapshotFile);
    if (!snapshot?.pedidos || Object.keys(snapshot.pedidos).length === 0) return false;

    for (const [pedido_id, pedido] of Object.entries(snapshot.pedidos)) {
      this.pedidosActivos.set(pedido_id, pedido);
    }

    this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);
    this.logger.info('cocina.snapshot_restaurado', {
      pedidos_restaurados: this.pedidosActivos.size,
      saved_at: snapshot._saved_at
    });
    return true;
  }

  // ==========================================
  // Validation
  // ==========================================

  _registerSchemas() {
    if (!this.validator) return;

    this.validator.registerSchema('cocina.register-device', {
      type: 'object',
      required: ['device_id'],
      properties: {
        device_id: { type: 'string', minLength: 1 },
        nombre: { type: 'string' },
        estacion: { type: 'string' },
        filtros: {
          type: 'object',
          properties: { familias: { type: 'array', items: { type: 'string' } } }
        },
        tipo_estacion: { type: 'string' }
      }
    });

    this.validator.registerSchema('cocina.prepare-item', {
      type: 'object',
      required: ['item_id'],
      properties: {
        item_id: { type: 'string', minLength: 1 },
        device_id: { type: 'string' },
        done: { type: 'boolean' }
      }
    });

    this.validator.registerSchema('cocina.mark-ready', {
      type: 'object',
      required: ['pedido_id'],
      properties: { pedido_id: { type: 'string', minLength: 1 } }
    });

    this.validator.registerSchema('cocina.get', {
      type: 'object',
      required: ['pedido_id'],
      properties: { pedido_id: { type: 'string', minLength: 1 } }
    });

    this.logger.info('cocina.schemas.registered', { count: 4 });
  }

  _validateInput(schemaId, data) {
    if (!this.validator) return null;
    const result = this.validator.validate(schemaId, data);
    if (!result.valid) {
      return this._errorResponse(400, 'INVALID_INPUT', 'Validacion fallida', {
        validation_errors: result.errors
      });
    }
    return null;
  }

  // ==========================================
  // Bus Subscribers (auto-wired desde manifest)
  // ==========================================

  async onCuentaCreada(event) {
    const data = event?.data || event?.payload || event;
    if (!data?.cuenta_id) return;
    const display = data.ref_display || data.metadata?.nombre || data.nombre || null;
    if (display) this.cuentaNombres.set(data.cuenta_id, display);
  }

  async onCuentaActualizada(event) {
    const data = event?.data || event?.payload || event;
    if (!data?.cuenta_id) return;

    const display = data.cambios?.ref_display || data.cambios?.nombre || null;
    if (!display) return;

    this.cuentaNombres.set(data.cuenta_id, display);

    for (const pedido of this.pedidosActivos.values()) {
      if (pedido.cuenta_id === data.cuenta_id) {
        pedido.nombre_cuenta = display;
        pedido.ref_display = display;
      }
    }
  }

  async onCuentaEliminada(event) {
    const data = event?.data || event?.payload || event;
    const cuenta_id = data?.cuenta_id;
    if (!cuenta_id) return;

    this.cuentaNombres.delete(cuenta_id);

    let removed = 0;
    for (const [pedido_id, pedido] of this.pedidosActivos) {
      if (pedido.cuenta_id === cuenta_id) {
        this.pedidosActivos.delete(pedido_id);
        removed++;
      }
    }
    if (removed > 0) {
      this._saveSnapshotDebounced();
      this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);
      this.logger.info('cocina.pedidos_huerfanos_limpiados', { cuenta_id, removed });
    }
  }

  // Reset de caja / dia iniciado. Antes vaciaba la cocina ENTERA del core: cerrar
  // la caja de un negocio borraba los pedidos activos de los demas. Ahora toca
  // solo los del proyecto del evento; sin project_id (evento legacy) limpia todo.
  async _resetCocina(event, motivo) {
    const data = event?.data || event?.payload || event;
    const projectId = data?.project_id || null;
    let limpiados = 0;

    if (!projectId) {
      limpiados = this.pedidosActivos.size;
      this.pedidosActivos.clear();
      this.cuentaNombres.clear();
      this.historial = [];
    } else {
      const slug = await this._slugProyecto(projectId);
      for (const [pedido_id, pedido] of Array.from(this.pedidosActivos)) {
        if (await this._esDelProyecto(pedido, slug)) {
          this.pedidosActivos.delete(pedido_id);
          limpiados++;
        }
      }
      const historialAjeno = [];
      for (const p of this.historial) {
        if (!(await this._esDelProyecto(p, slug))) historialAjeno.push(p);
      }
      this.historial = historialAjeno;
    }

    this._saveSnapshotDebounced();
    this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);
    this.logger.info(motivo, {
      pedidos_limpiados: limpiados,
      project_id: projectId,
      correlation_id: event?.metadata?.correlationId || null
    });
  }

  async onCajaCerrada(event) {
    await this._resetCocina(event, 'cocina.reset.caja_cerrada');
  }

  async onDiaIniciado(event) {
    await this._resetCocina(event, 'cocina.reset.dia_iniciado');
  }

  async onPedidoEnviadoCocina(event) {
    try {
      const data = event?.data || event?.payload || event;
      const correlationId = event?.metadata?.correlationId;
      const { pedido_id, items, cuenta_id, canal, ref_display, project_id, notas_generales, metadata } = data;

      this.logger.info('cocina.pedido.recibido', {
        correlation_id: correlationId,
        pedido_id,
        canal: canal || 'directo',
        ref_display: ref_display || null,
        items_count: items?.length || 0
      });

      const nombre_cuenta = ref_display || this.cuentaNombres.get(cuenta_id) || metadata?.nombre || null;
      if (cuenta_id && ref_display) this.cuentaNombres.set(cuenta_id, ref_display);

      // RED DE SALIDA (defensa en profundidad): una linea sin nombre no es accionable en cocina
      // (es la "fila fantasma" del autoservicio). Se descarta PERO con rastro — nunca en silencio
      // (no_silent_failures): si un emisor manda un item mudo, queda el warn para cazarlo. El gate
      // fuerte es el comandero (rechaza en la puerta); esto garantiza que el cocinero nunca la vea.
      const itemsCocina = [];
      for (const it of (items || [])) {
        const ci = this._buildCocinaItem(it);
        if (!ci.nombre) {
          this.logger.warn('cocina.item.sin_nombre_descartado', {
            pedido_id, cuenta_id, producto_id: it?.producto_id || null
          });
          continue;
        }
        itemsCocina.push(ci);
      }

      const pedidoCocina = {
        pedido_id,
        cuenta_id,
        nombre_cuenta,
        ref_display: nombre_cuenta,
        canal: canal || null,
        items: itemsCocina,
        estado: 'activo',
        project_id: project_id || null,
        notas_generales: notas_generales || '',
        recibido_at: new Date().toISOString(),
        metadata: metadata || null
      };

      this.pedidosActivos.set(pedido_id, pedidoCocina);
      this._saveSnapshotDebounced();

      this.metrics?.increment?.('cocina.pedido_recibido.total');
      this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);

      await this._publishDisplayCocina('nuevo_pedido', {
        pedido_id,
        cuenta_id,
        nombre_cuenta,
        canal: canal || null,
        items: pedidoCocina.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, categoria: i.categoria })),
        items_count: pedidoCocina.items.length
      }, data);
    } catch (err) {
      this._handleHandlerError('cocina.pedido_enviado.error', err, 'subscribe');
    }
  }

  async onPedidoCancelado(event) {
    try {
      const data = event?.data || event?.payload || event;
      const { pedido_id } = data;

      if (!this.pedidosActivos.has(pedido_id)) return;

      this.pedidosActivos.delete(pedido_id);
      this._saveSnapshotDebounced();

      this.metrics?.increment?.('cocina.pedido_cancelado.total');
      this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);

      this.logger.info('cocina.pedido.cancelado', { pedido_id });
    } catch (err) {
      this._handleHandlerError('cocina.pedido_cancelado.error', err, 'subscribe');
    }
  }

  _buildCocinaItem(item) {
    const cocinaItem = {
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      categoria: item.categoria || null,
      cantidad: item.cantidad,
      variaciones: item.variaciones || null,
      notas: item.notas || '',
      estado: 'pendiente',
      pase: 0
    };
    if (item.tipo) cocinaItem.tipo = item.tipo;
    if (item.pizza_izquierda) cocinaItem.pizza_izquierda = item.pizza_izquierda;
    if (item.pizza_derecha) cocinaItem.pizza_derecha = item.pizza_derecha;
    if (item.ingredientes) cocinaItem.ingredientes = item.ingredientes;
    if (item.ingredientes_base) cocinaItem.ingredientes_base = item.ingredientes_base;
    return cocinaItem;
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleGetActivos(data) {
    try {
      const { project_id } = data || {};
      // Solo los pedidos del proyecto que pregunta: la cocina de un negocio no
      // ensena la cola de otro (antes se veian todas las del core).
      const activos = await this._pedidosVisibles(project_id);
      // La identidad resuelta vuelve con la respuesta: así la pantalla conoce las
      // DOS llaves del proyecto (uuid y slug) y puede reconocer sus eventos en vivo.
      const slugProyecto = project_id ? await this._slugProyecto(project_id) : null;
      const proyecto = slugProyecto
        ? { id: await this._proyectos.idDe(slugProyecto), slug: slugProyecto }
        : null;
      activos.sort((a, b) => new Date(a.recibido_at) - new Date(b.recibido_at));

      let itemsPendientes = 0;
      let itemsPreparando = 0;
      for (const p of activos) {
        for (const i of p.items) {
          if (i.estado === 'pendiente') itemsPendientes++;
          else if (i.estado === 'preparando') itemsPreparando++;
        }
      }

      return {
        status: 200,
        data: {
          pedidos: activos,
          total: activos.length,
          items_pendientes: itemsPendientes,
          items_preparando: itemsPreparando,
          proyecto,
          devices: await this._devicesVisibles(project_id)
        }
      };
    } catch (err) {
      return this._handleHandlerError('cocina.list_active.error', err);
    }
  }

  async handleGetHistorial(data) {
    try {
      const { limit, project_id } = data || {};
      let historial = this.historial;
      if (project_id) {
        const slug = await this._slugProyecto(project_id);
        historial = [];
        for (const p of this.historial) {
          if (await this._esDelProyecto(p, slug)) historial.push(p);
        }
      }
      historial = historial.slice(0, parseInt(limit) || 20);
      return { status: 200, data: { pedidos: historial, total: historial.length } };
    } catch (err) {
      return this._handleHandlerError('cocina.history.error', err);
    }
  }

  async handleGetPedido(data) {
    try {
      const invalid = this._validateInput('cocina.get', data);
      if (invalid) return invalid;

      const { pedido_id, project_id } = data;
      const pedido = this.pedidosActivos.get(pedido_id);

      if (!pedido || (project_id && !(await this._esDelProyecto(pedido, await this._slugProyecto(project_id))))) {
        this.metrics?.increment?.('cocina.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'get' });
        this.logger.warn('cocina.get.not_found', { pedido_id, project_id: project_id || null });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado en cocina', { pedido_id });
      }

      return { status: 200, data: pedido };
    } catch (err) {
      return this._handleHandlerError('cocina.get.error', err);
    }
  }

  async handlePrepararItem(data) {
    try {
      const invalid = this._validateInput('cocina.prepare-item', data);
      if (invalid) return invalid;

      const { item_id, device_id, project_id } = data;
      const device = device_id ? this.devices.get(device_id) : null;
      if (device) device.last_seen = new Date().toISOString();

      let pedidoEncontrado = null;
      let itemEncontrado = null;
      // Se busca SOLO entre los pedidos del proyecto que actua: un item de otra
      // cocina no se encuentra (404), que es lo que impide marcarlo listo por error.
      for (const pedido of await this._pedidosVisibles(project_id)) {
        const item = pedido.items.find(i => i.item_id === item_id);
        if (item) {
          pedidoEncontrado = pedido;
          itemEncontrado = item;
          break;
        }
      }

      if (!itemEncontrado) {
        this.metrics?.increment?.('cocina.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'prepare-item' });
        this.logger.warn('cocina.prepare_item.not_found', { item_id, project_id: project_id || null });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Item no encontrado en cocina', { item_id });
      }

      if (itemEncontrado.estado === 'listo') {
        this.metrics?.increment?.('cocina.errors', { code: 'CONFLICT_STATE', kind: 'prepare-item' });
        this.logger.warn('cocina.prepare_item.already_done', { item_id });
        return this._errorResponse(409, 'CONFLICT_STATE', 'Item ya esta listo', { item_id });
      }

      const now = new Date().toISOString();
      if (!itemEncontrado.fases) itemEncontrado.fases = [];
      const estacion = device?.estacion || device?.nombre || null;
      const tipoEstacion = device?.tipo_estacion || 'general';

      // Botón rojo de cocina (terminado directo): un toque marca el item LISTO desde
      // cualquier estado (pendiente o preparando), saltando el pase intermedio. El tap en
      // la tarjeta ahora solo despliega/pliega el detalle; terminar es un acto explícito.
      if (data.done === true) {
        const faseAbierta = itemEncontrado.fases.find(f => !f.fin);
        if (faseAbierta) {
          faseAbierta.fin = now;
          faseAbierta.duracion_seg = Math.round((new Date(now) - new Date(faseAbierta.inicio)) / 1000);
        }
        itemEncontrado.estado = 'listo';
        itemEncontrado.preparado_at = now;
        this.metrics?.increment?.('cocina.item_preparado.total', { via: 'terminado_directo' });
        await this._publishItemPreparado(pedidoEncontrado, itemEncontrado, estacion);
        // Impresion del ticket de pieza al completar (estacion unica: general)
        if (estacion && device) {
          const tipoEst = this.tiposEstacion[tipoEstacion];
          if (tipoEst?.comportamientos?.imprime_al_completar) {
            await this._publishItemTicket(pedidoEncontrado, itemEncontrado, estacion, device);
          }
        }

        const completo = pedidoEncontrado.items.every(i => i.estado === 'listo');
        if (completo) await this._marcarPedidoListo(pedidoEncontrado);

        this.logger.info('cocina.item.terminado_directo', {
          pedido_id: pedidoEncontrado.pedido_id, item_id, pedido_completo: completo
        });
        if (!completo) this._saveSnapshotDebounced();
        return { status: 200, data: { item: itemEncontrado, pedido_completo: completo } };
      }

      // Tap 1: pendiente -> preparando
      if (itemEncontrado.estado === 'pendiente') {
        itemEncontrado.estado = 'preparando';
        itemEncontrado.preparando_at = now;
        if (device) {
          itemEncontrado.device_id = device_id;
          itemEncontrado.device_color = device.color;
          itemEncontrado.device_nombre = device.nombre;
        }

        itemEncontrado.fases.push({
          estacion,
          device_id: device_id || null,
          device_nombre: device?.nombre || null,
          inicio: now,
          fin: null
        });

        await this._publishItemPreparando(pedidoEncontrado, itemEncontrado, estacion);

        this.logger.info('cocina.item.preparando', {
          pedido_id: pedidoEncontrado.pedido_id, item_id, pase: itemEncontrado.pase
        });

        this._saveSnapshotDebounced();
        return { status: 200, data: { item: itemEncontrado, pedido_completo: false } };
      }

      // Tap 2: preparando -> avanzar pase
      const faseActiva = itemEncontrado.fases.find(f => !f.fin);
      if (faseActiva) {
        faseActiva.fin = now;
        faseActiva.duracion_seg = Math.round((new Date(now) - new Date(faseActiva.inicio)) / 1000);
      }

      const paseAnterior = itemEncontrado.pase || 0;
      itemEncontrado.pase = paseAnterior + 1;

      if (device) {
        const tipoEst = this.tiposEstacion[tipoEstacion];
        if (tipoEst?.comportamientos?.imprime_al_completar) {
          await this._publishItemTicket(pedidoEncontrado, itemEncontrado, estacion, device);
        }
      }

      const siguienteTipo = Object.values(this.tiposEstacion).find(t => t.pase_minimo === itemEncontrado.pase);

      if (siguienteTipo) {
        delete itemEncontrado.device_id;
        delete itemEncontrado.device_color;
        delete itemEncontrado.device_nombre;
        delete itemEncontrado.preparando_at;

        if (siguienteTipo.comportamientos?.auto_preparar) {
          itemEncontrado.estado = 'preparando';
          itemEncontrado.preparando_at = now;
          itemEncontrado.fases.push({
            estacion: siguienteTipo.id,
            device_id: null,
            device_nombre: null,
            inicio: now,
            fin: null
          });
        } else {
          itemEncontrado.estado = 'pendiente';
        }

        this.metrics?.increment?.('cocina.item_avanzado.total');
        await this._publishItemAvanzado(pedidoEncontrado, itemEncontrado, estacion);

        this.logger.info('cocina.item.avanzado', {
          pedido_id: pedidoEncontrado.pedido_id, item_id,
          pase: itemEncontrado.pase, siguiente: siguienteTipo.id
        });

        this._saveSnapshotDebounced();
        return { status: 200, data: { item: itemEncontrado, pedido_completo: false, avanzado: true } };
      }

      // No hay mas estaciones -> item listo
      itemEncontrado.estado = 'listo';
      itemEncontrado.preparado_at = now;

      this.metrics?.increment?.('cocina.item_preparado.total');
      await this._publishItemPreparado(pedidoEncontrado, itemEncontrado, estacion);

      const todosListos = pedidoEncontrado.items.every(i => i.estado === 'listo');
      if (todosListos) {
        await this._marcarPedidoListo(pedidoEncontrado);
      }

      this.logger.info('cocina.item.preparado', {
        pedido_id: pedidoEncontrado.pedido_id, item_id, pase: itemEncontrado.pase,
        pedido_completo: todosListos
      });

      if (!todosListos) this._saveSnapshotDebounced();
      return { status: 200, data: { item: itemEncontrado, pedido_completo: todosListos } };
    } catch (err) {
      return this._handleHandlerError('cocina.prepare_item.error', err);
    }
  }

  async handleMarcarListo(data) {
    try {
      const invalid = this._validateInput('cocina.mark-ready', data);
      if (invalid) return invalid;

      const { pedido_id, project_id } = data;
      const pedido = this.pedidosActivos.get(pedido_id);
      if (!pedido || (project_id && !(await this._esDelProyecto(pedido, await this._slugProyecto(project_id))))) {
        this.metrics?.increment?.('cocina.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'mark-ready' });
        this.logger.warn('cocina.mark_ready.not_found', { pedido_id, project_id: project_id || null });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado en cocina', { pedido_id });
      }

      const maxPase = Math.max(...Object.values(this.tiposEstacion).map(t => t.pase_minimo)) + 1;
      const now = new Date().toISOString();
      pedido.items.forEach(item => {
        if (item.estado !== 'listo') {
          item.estado = 'listo';
          item.pase = maxPase;
          item.preparado_at = now;
          this.metrics?.increment?.('cocina.item_preparado.total');
        }
      });

      await this._marcarPedidoListo(pedido);
      return { status: 200, data: pedido };
    } catch (err) {
      return this._handleHandlerError('cocina.mark_ready.error', err);
    }
  }

  // ==========================================
  // Device Management
  // ==========================================

  async handleRegisterDevice(data) {
    try {
      const invalid = this._validateInput('cocina.register-device', data);
      if (invalid) return invalid;

      const { device_id, nombre, estacion, filtros, tipo_estacion, impresora } = data;

      if (tipo_estacion && !this.tiposEstacion[tipo_estacion]) {
        this.metrics?.increment?.('cocina.errors', { code: 'INVALID_INPUT', kind: 'register-device' });
        this.logger.warn('cocina.register_device.tipo_invalido', { tipo_estacion });
        return this._errorResponse(400, 'INVALID_INPUT',
          `Tipo de estacion desconocido: ${tipo_estacion}`,
          { valid_types: Object.keys(this.tiposEstacion) });
      }

      // El device pertenece al proyecto de la pantalla que lo registra: sin esto,
      // la 'Estacion 1' de un negocio salia tambien en la cocina de los demas.
      const slugProyecto = data.project_id ? await this._slugProyecto(data.project_id) : null;

      const existing = this.devices.get(device_id);

      if (existing) {
        existing.nombre = nombre || existing.nombre;
        existing.estacion = estacion || existing.estacion;
        existing.filtros = filtros || existing.filtros;
        if (tipo_estacion !== undefined) existing.tipo_estacion = tipo_estacion;
        if (impresora !== undefined) existing.impresora = impresora;
        if (slugProyecto) existing.project_id = slugProyecto;
        existing.last_seen = new Date().toISOString();

        await this._publicarEvento('cocina.device_updated', {
          device_id,
          nombre: existing.nombre,
          color: existing.color,
          estacion: existing.estacion,
          filtros: existing.filtros,
          tipo_estacion: existing.tipo_estacion,
          impresora: existing.impresora || null
        }, data);

        return {
          status: 200,
          data: {
            device_id,
            color: existing.color,
            nombre: existing.nombre,
            estacion: existing.estacion,
            filtros: existing.filtros,
            tipo_estacion: existing.tipo_estacion,
            tipo_estacion_info: this.tiposEstacion[existing.tipo_estacion] || null,
            impresora: existing.impresora || null,
            devices: await this._devicesVisibles(data.project_id)
          }
        };
      }

      const colorIndex = this.devices.size % DEVICE_COLORS.length;
      const color = DEVICE_COLORS[colorIndex];

      const device = {
        device_id,
        project_id: slugProyecto,
        nombre: nombre || `Estacion ${this.devices.size + 1}`,
        estacion: estacion || null,
        color,
        filtros: filtros || { familias: [] },
        tipo_estacion: tipo_estacion || 'general',
        impresora: impresora || null,
        connected_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      };

      this.devices.set(device_id, device);

      await this._publicarEvento('cocina.device_registered', {
        device_id,
        nombre: device.nombre,
        estacion: device.estacion,
        color,
        filtros: device.filtros,
        tipo_estacion: device.tipo_estacion,
        impresora: device.impresora
      }, data);

      this.logger.info('cocina.device.registered', {
        device_id, nombre: device.nombre, color,
        tipo_estacion: device.tipo_estacion, total_devices: this.devices.size
      });

      return {
        status: 201,
        data: {
          device_id,
          color,
          nombre: device.nombre,
          estacion: device.estacion,
          filtros: device.filtros,
          tipo_estacion: device.tipo_estacion,
          tipo_estacion_info: this.tiposEstacion[device.tipo_estacion] || null,
          impresora: device.impresora,
          devices: await this._devicesVisibles(data.project_id)
        }
      };
    } catch (err) {
      return this._handleHandlerError('cocina.register_device.error', err);
    }
  }

  async handleUnregisterDevice(data) {
    try {
      const { device_id } = data || {};
      if (!device_id) {
        this.metrics?.increment?.('cocina.errors', { code: 'INVALID_INPUT', kind: 'unregister-device' });
        this.logger.warn('cocina.unregister_device.missing', { field: 'device_id' });
        return this._errorResponse(400, 'INVALID_INPUT', 'device_id requerido', { field: 'device_id' });
      }

      const existed = this.devices.delete(device_id);

      if (existed) {
        await this._publicarEvento('cocina.device_unregistered', { device_id }, data);
        this.logger.info('cocina.device.unregistered', {
          device_id, total_devices: this.devices.size
        });
      }

      return { status: 200, data: { removed: existed, devices: await this._devicesVisibles(data.project_id) } };
    } catch (err) {
      return this._handleHandlerError('cocina.unregister_device.error', err);
    }
  }

  async handleListDevices(data) {
    return { status: 200, data: { devices: await this._devicesVisibles(data?.project_id) } };
  }

  _getDeviceList() {
    return Array.from(this.devices.values()).map(d => ({
      device_id: d.device_id,
      project_id: d.project_id || null,
      nombre: d.nombre,
      estacion: d.estacion || null,
      color: d.color,
      filtros: d.filtros,
      tipo_estacion: d.tipo_estacion || 'general',
      connected_at: d.connected_at,
      last_seen: d.last_seen
    }));
  }

  async handleListTiposEstacion() {
    return {
      status: 200,
      data: { tipos: Object.values(this.tiposEstacion) }
    };
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        pedidos_activos: this.pedidosActivos.size,
        devices_count: this.devices.size
      }
    };
  }

  async handleGetMetrics() {
    let itemsPendientes = 0;
    let itemsPreparando = 0;
    for (const p of this.pedidosActivos.values()) {
      for (const i of p.items) {
        if (i.estado === 'pendiente') itemsPendientes++;
        else if (i.estado === 'preparando') itemsPreparando++;
      }
    }

    const tiempoPromedio = this.tiemposPreparacion.length > 0
      ? this.tiemposPreparacion.reduce((a, b) => a + b, 0) / this.tiemposPreparacion.length
      : 0;

    return {
      status: 200,
      data: {
        pedidos_activos: this.pedidosActivos.size,
        items_pendientes: itemsPendientes,
        items_preparando: itemsPreparando,
        historial_count: this.historial.length,
        tiempo_promedio_preparacion: Math.round(tiempoPromedio),
        timestamp: new Date().toISOString()
      }
    };
  }

  async handleListarDisplays() {
    try {
      const result = await this.eventBus.request('perifericos', 'listar-por-capacidad', {
        capacidad: 'display'
      });
      const displays = result?.data?.dispositivos || [];
      return {
        status: 200,
        data: {
          displays,
          total: displays.length,
          display_default: this.config?.display_destino || 'display-cocina'
        }
      };
    } catch (err) {
      this.logger.warn('cocina.listar_displays.error', { error_message: err.message });
      return {
        status: 200,
        data: {
          displays: [],
          total: 0,
          display_default: this.config?.display_destino || 'display-cocina',
          nota: 'No se pudo consultar perifericos'
        }
      };
    }
  }

  // ==========================================
  // Restauracion legacy desde cuentas_activas.json
  // ==========================================

  async _restaurarDesdeArchivo() {
    const archivo = path.join('./data/current', 'cuentas_activas.json');
    const datos = await this._readJsonSafe(archivo);
    if (!datos?.cuentas) return;

    let restaurados = 0;
    const ESTADOS_POST_COCINA = new Set(['listo', 'entregado', 'para_cobrar', 'cobrado']);

    for (const [cuenta_id, cuenta] of Object.entries(datos.cuentas)) {
      if (!cuenta.pedidos || cuenta.pedidos.length === 0) continue;
      if (ESTADOS_POST_COCINA.has(cuenta.estado)) continue;

      for (const pedidoData of cuenta.pedidos) {
        const pedido_id = pedidoData.pedido_id;
        if (!pedido_id || this.pedidosActivos.has(pedido_id)) continue;

        const items = (pedidoData.items || []).map((item, idx) => {
          const cocinaItem = this._buildCocinaItem({
            ...item,
            item_id: item.item_id || item.id || `${pedido_id}_item_${idx + 1}`,
            cantidad: item.cantidad || 1
          });
          return cocinaItem;
        });

        if (items.length === 0) continue;

        const canal = cuenta.tipo || this._detectCanalFromCuentaId(cuenta_id);

        const pedidoCocina = {
          pedido_id,
          cuenta_id,
          canal,
          items,
          estado: 'activo',
          notas_generales: '',
          recibido_at: cuenta.created_at || new Date().toISOString(),
          metadata: null
        };

        this.pedidosActivos.set(pedido_id, pedidoCocina);
        restaurados++;
      }
    }

    if (restaurados > 0) {
      this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size);
      this.logger.info('cocina.estado_restaurado', { pedidos_restaurados: restaurados });
    }
  }

  _detectCanalFromCuentaId(cuenta_id) {
    if (!cuenta_id) return null;
    const longPrefixes = [
      ['mesa_', 'mesa'], ['llevar_', 'llevar'],
      ['telefono_', 'telefono'], ['tel_', 'telefono'],
      ['whatsapp_', 'whatsapp'], ['wa_', 'whatsapp'],
      ['glovo_', 'glovo'], ['delivery_', 'delivery'], ['llevadoo_', 'llevadoo']
    ];
    for (const [prefix, canal] of longPrefixes) {
      if (cuenta_id.startsWith(prefix)) return canal;
    }
    const shortPrefixes = [
      ['M_', 'mesa'], ['L_', 'llevar'], ['T_', 'telefono'],
      ['W_', 'whatsapp'], ['G_', 'glovo'], ['D_', 'llevadoo']
    ];
    for (const [prefix, canal] of shortPrefixes) {
      if (cuenta_id.startsWith(prefix)) return canal;
    }
    return null;
  }

  // ==========================================
  // Logica interna pedido listo
  // ==========================================

  async _marcarPedidoListo(pedido) {
    pedido.estado = 'listo';
    pedido.listo_at = new Date().toISOString();

    const tiempoPreparacion = (new Date(pedido.listo_at) - new Date(pedido.recibido_at)) / 1000;
    pedido.tiempo_preparacion = tiempoPreparacion;

    this.tiemposPreparacion.push(tiempoPreparacion);
    if (this.tiemposPreparacion.length > MAX_TIEMPOS_PREPARACION) {
      this.tiemposPreparacion.shift();
    }

    this.metrics?.increment?.('cocina.pedido_listo.total');
    this.metrics?.timing?.('cocina.preparacion_pedido.duration', tiempoPreparacion * 1000);
    this.metrics?.gauge?.('cocina.pedidos_activos.count', this.pedidosActivos.size - 1);

    this.historial.unshift(pedido);
    if (this.historial.length > MAX_HISTORIAL) this.historial.pop();

    this.pedidosActivos.delete(pedido.pedido_id);
    this._saveSnapshotDebounced();

    await this._publishPedidoListo(pedido);

    await this._publishDisplayCocina('pedido_listo', {
      pedido_id: pedido.pedido_id,
      cuenta_id: pedido.cuenta_id,
      canal: pedido.canal || null,
      items_count: pedido.items.length,
      tiempo_preparacion: tiempoPreparacion
    }, pedido);

    this.logger.info('cocina.pedido.listo', {
      pedido_id: pedido.pedido_id,
      canal: pedido.canal || null,
      tiempo_preparacion: tiempoPreparacion
    });
  }

  // ==========================================
  // Event Publishers (canonicos via _publicarEvento)
  // ==========================================

  async _publishItemPreparando(pedidoCocina, item, estacion) {
    const payload = {
      pedido_id: pedidoCocina.pedido_id,
      cuenta_id: pedidoCocina.cuenta_id,
      canal: pedidoCocina.canal || null,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      categoria: item.categoria || null,
      estacion: estacion || null,
      pase: item.pase || 0,
      preparando_at: item.preparando_at,
      project_id: pedidoCocina.project_id || null
    };
    if (item.device_id) payload.device_id = item.device_id;
    if (item.device_color) payload.device_color = item.device_color;
    if (item.device_nombre) payload.device_nombre = item.device_nombre;
    await this._publicarEvento('cocina.item_preparando', payload, pedidoCocina);
  }

  async _publishItemAvanzado(pedidoCocina, item, estacionAnterior) {
    await this._publicarEvento('cocina.item_avanzado', {
      pedido_id: pedidoCocina.pedido_id,
      cuenta_id: pedidoCocina.cuenta_id,
      canal: pedidoCocina.canal || null,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      categoria: item.categoria || null,
      estado: item.estado,
      pase: item.pase,
      preparando_at: item.preparando_at || null,
      desde_estacion: estacionAnterior,
      project_id: pedidoCocina.project_id || null
    }, pedidoCocina);
  }

  async _publishItemPreparado(pedidoCocina, item, estacion) {
    const payload = {
      pedido_id: pedidoCocina.pedido_id,
      cuenta_id: pedidoCocina.cuenta_id,
      canal: pedidoCocina.canal || null,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      categoria: item.categoria || null,
      estacion: estacion || null,
      pase: item.pase || 0,
      fases: item.fases || [],
      preparado_at: item.preparado_at,
      project_id: pedidoCocina.project_id || null
    };
    if (item.device_id) payload.device_id = item.device_id;
    if (item.device_color) payload.device_color = item.device_color;
    if (item.device_nombre) payload.device_nombre = item.device_nombre;
    await this._publicarEvento('cocina.item_preparado', payload, pedidoCocina);
  }

  async _publishItemTicket(pedidoCocina, item, estacion, device) {
    await this._publicarEvento('cocina.item_ticket', {
      pedido_id: pedidoCocina.pedido_id,
      cuenta_id: pedidoCocina.cuenta_id,
      project_id: pedidoCocina.project_id || null,
      ref_display: pedidoCocina.ref_display || null,
      canal: pedidoCocina.canal || null,
      item_id: item.item_id,
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      categoria: item.categoria || null,
      estacion,
      ingredientes: item.ingredientes || item.ingredientes_base || null,
      variaciones: item.variaciones || null,
      notas: item.notas || null,
      fases: item.fases || [],
      impresora: device?.impresora || null
    }, pedidoCocina);

    this.logger.info('cocina.item_ticket.published', {
      pedido_id: pedidoCocina.pedido_id,
      item_id: item.item_id,
      nombre: item.nombre,
      estacion
    });
  }

  async _publishPedidoListo(pedido) {
    await this._publicarEvento('cocina.pedido_listo', {
      pedido_id: pedido.pedido_id,
      cuenta_id: pedido.cuenta_id,
      ref_display: pedido.ref_display || null,
      canal: pedido.canal || null,
      items_count: pedido.items.length,
      tiempo_preparacion: pedido.tiempo_preparacion,
      listo_at: pedido.listo_at,
      project_id: pedido.project_id || null
    }, pedido);
  }

  async _publishDisplayCocina(accion, contenido, sourcePayload) {
    try {
      const destino = this.config?.display_destino || 'display-cocina';
      await this._publicarEvento('periferico.display', {
        destino,
        data: {
          accion,
          modulo: 'cocina',
          contenido,
          pedidos_activos: this.pedidosActivos.size
        },
        prioridad: accion === 'pedido_listo' ? 2 : 3
      }, sourcePayload);
    } catch (err) {
      this.logger.warn('cocina.display.error', { accion, error_message: err.message });
    }
  }
}

module.exports = CocinaModule;
