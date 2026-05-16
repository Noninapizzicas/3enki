/**
 * pizzepos/cuentas v3.0.0 — Gestion del lifecycle de cuentas POS (POC2 rewrite).
 *
 * 100% Event-Driven. Maquina de estados de 7 estados + re-entradas validas.
 *
 * State machine:
 *   pendiente ─→ con_pedido (primer item) ─→ en_preparacion (enviar cocina)
 *                                              ├─→ listo (todos pedidos OK)
 *                                              │     ├─→ entregado | para_cobrar
 *                                              │     │      └─→ cobrado
 *                                              └─re-entrada (mas pedidos)
 *
 * Eventos del bus:
 *   subscribes (8): comandero.{item_agregado, item_eliminado, item_actualizado, enviar_cocina},
 *                   cocina.pedido_listo, cobro.iniciado, cobro.procesado, cuenta.cerrada.
 *   publishes  (5): cuenta.{creada, actualizada, estado_cambiado, eliminada} + comandero.enviar_cocina
 *                   (este ultimo desde _inyectarPedidoInicial para integraciones delivery).
 *
 * 9 ui_handlers (auto-wired desde module.json.ui_handlers).
 */

'use strict';

const path   = require('path');
const fs     = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
const DEFAULT_PROJECT_ID  = 'default';
const ALERTA_PENDIENTE_MS = 30 * 60 * 1000;
const POST_COBRADO_MS     = 5 * 60 * 1000;
const TURNO_DEBOUNCE_MS   = 1000;
const METRICS_INTERVAL_MS = 10000;

// Re-entradas legitimas: con_pedido → con_pedido (mas items),
// con_pedido → pendiente (items=0), en_preparacion → en_preparacion (mas pedidos),
// listo → en_preparacion (cliente pide mas).
const TRANSICIONES_VALIDAS = {
  pendiente:      ['con_pedido'],
  con_pedido:     ['en_preparacion', 'con_pedido', 'pendiente', 'cobrado'],
  en_preparacion: ['listo', 'en_preparacion', 'entregado', 'cobrado'],
  listo:          ['entregado', 'para_cobrar', 'en_preparacion', 'cobrado'],
  entregado:      ['para_cobrar', 'en_preparacion', 'cobrado'],
  para_cobrar:    ['cobrado'],
  cobrado:        []
};

class CuentasModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'cuentas';
    this.version = '3.0.0';

    this.cuentas           = new Map();
    this._pendingTimeouts  = new Map();
    this._alertaTimers     = new Map();
    this._pedidosEnCocina  = new Map();

    this._turno         = 0;
    this._turnoFile     = null;
    this._turnoSaveTimer = null;

    this._metricsInterval = null;
  }

  static SIMBOLOS = {
    mesa: 'M', local: 'M',
    llevar: 'L',
    telefono: 'T',
    whatsapp: 'W',
    glovo: 'G',
    delivery: 'D',
    llevadoo: 'V'
  };

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger    = core.logger;
    this.metrics   = core.metrics;
    this.eventBus  = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    this._turnoFile = path.join('.', 'data', 'current', 'contador_global.json');
    await this._loadTurno();
    await this._restaurarDesdeArchivo();

    this._metricsInterval = setInterval(() => this._reportMetrics(), METRICS_INTERVAL_MS);

    this.logger.info('module.loaded', {
      module:           this.name,
      version:          this.version,
      cuentas_restored: this.cuentas.size,
      turno_actual:     this._turno
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this._metricsInterval) { clearInterval(this._metricsInterval); this._metricsInterval = null; }

    for (const t of this._pendingTimeouts.values()) clearTimeout(t);
    this._pendingTimeouts.clear();

    for (const t of this._alertaTimers.values()) clearTimeout(t);
    this._alertaTimers.clear();

    if (this._turnoSaveTimer) {
      clearTimeout(this._turnoSaveTimer);
      this._turnoSaveTimer = null;
      try { await this._saveTurno(); } catch (_) { /* flush best-effort */ }
    }

    this.cuentas.clear();
    this._pedidosEnCocina.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // State Machine
  // ==========================================

  async _transicionarEstado(cuenta_id, estado_nuevo, sourcePayload = null) {
    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return false;

    const estado_anterior = cuenta.estado;

    // No-op si ya esta en ese estado y la re-entrada NO es valida
    if (estado_anterior === estado_nuevo && !TRANSICIONES_VALIDAS[estado_anterior]?.includes(estado_nuevo)) {
      return false;
    }

    const transiciones = TRANSICIONES_VALIDAS[estado_anterior];
    if (!transiciones || !transiciones.includes(estado_nuevo)) {
      this.logger.warn('cuenta.transicion_invalida', { cuenta_id, estado_anterior, estado_nuevo });
      this.metrics?.increment?.('pizzepos-cuentas.errors', { kind: 'transicion_invalida', code: 'CONFLICT_STATE' });
      return false;
    }

    cuenta.estado     = estado_nuevo;
    cuenta.updated_at = new Date().toISOString();

    this._gestionarAlerta(cuenta_id, estado_nuevo);

    this.logger.info('cuenta.estado_cambiado', { cuenta_id, estado_anterior, estado_nuevo });
    this.metrics?.increment?.('cuenta.transicion.total');

    await this._publicarEvento('cuenta.estado_cambiado', {
      project_id:      cuenta.project_id,
      cuenta_id,
      estado_anterior,
      estado_nuevo,
      changed_at:      cuenta.updated_at
    }, sourcePayload);

    await this._publishCuentaActualizada(cuenta.project_id, cuenta_id, { estado: estado_nuevo }, sourcePayload);

    return true;
  }

  _gestionarAlerta(cuenta_id, estado) {
    const timerAnterior = this._alertaTimers.get(cuenta_id);
    if (timerAnterior) {
      clearTimeout(timerAnterior);
      this._alertaTimers.delete(cuenta_id);
    }

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    if (estado !== 'pendiente' && cuenta.alerta) {
      cuenta.alerta = false;
      this._publishCuentaActualizada(cuenta.project_id, cuenta_id, { alerta: false });
    }

    if (estado === 'pendiente') {
      const timer = setTimeout(() => {
        this._alertaTimers.delete(cuenta_id);
        const c = this.cuentas.get(cuenta_id);
        if (c && c.estado === 'pendiente') {
          c.alerta     = true;
          c.updated_at = new Date().toISOString();
          this.logger.warn('cuenta.alerta.activada', { cuenta_id });
          this._publishCuentaActualizada(c.project_id, cuenta_id, { alerta: true });
        }
      }, ALERTA_PENDIENTE_MS);
      this._alertaTimers.set(cuenta_id, timer);
    }
  }

  // ==========================================
  // Bus handlers (subscribes)
  // ==========================================

  async onComanderoItemAgregado(event) {
    const data = this._unwrap(event);
    const { cuenta_id, precio_total, cantidad } = data;

    this.logger.info('comandero.item_agregado.received', { cuenta_id });
    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) {
      this.logger.warn('cuenta.not_found', { cuenta_id });
      return;
    }

    cuenta.items     += (cantidad || 1);
    cuenta.total     += precio_total || 0;
    cuenta.updated_at = new Date().toISOString();

    if (cuenta.estado === 'pendiente') {
      await this._transicionarEstado(cuenta_id, 'con_pedido', data);
    }
    await this._publishCuentaActualizada(cuenta.project_id, cuenta_id, {
      items: cuenta.items, total: cuenta.total
    }, data);
  }

  async onComanderoItemEliminado(event) {
    const data = this._unwrap(event);
    const { cuenta_id, precio_total, cantidad } = data;

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    cuenta.items     = Math.max(0, cuenta.items - (cantidad || 1));
    cuenta.total     = Math.max(0, cuenta.total - (precio_total || 0));
    cuenta.updated_at = new Date().toISOString();

    if (cuenta.items === 0 && cuenta.estado === 'con_pedido') {
      await this._transicionarEstado(cuenta_id, 'pendiente', data);
    }

    await this._publishCuentaActualizada(cuenta.project_id, cuenta_id, {
      items: cuenta.items, total: cuenta.total
    }, data);
  }

  async onComanderoItemActualizado(event) {
    const data = this._unwrap(event);
    const { cuenta_id, diff_cantidad, diff_precio } = data;

    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    cuenta.items     = Math.max(0, cuenta.items + (diff_cantidad || 0));
    cuenta.total     = Math.max(0, cuenta.total + (diff_precio || 0));
    cuenta.updated_at = new Date().toISOString();

    await this._publishCuentaActualizada(cuenta.project_id, cuenta_id, {
      items: cuenta.items, total: cuenta.total
    }, data);
  }

  async onComanderoEnviarCocina(event) {
    const data = this._unwrap(event);
    const { cuenta_id, pedido_id } = data;

    this.logger.info('comandero.enviar_cocina.received', { cuenta_id, pedido_id });
    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    if (pedido_id) {
      if (!this._pedidosEnCocina.has(cuenta_id)) {
        this._pedidosEnCocina.set(cuenta_id, new Set());
      }
      this._pedidosEnCocina.get(cuenta_id).add(pedido_id);
    }

    if (['con_pedido', 'listo', 'entregado', 'en_preparacion'].includes(cuenta.estado)) {
      await this._transicionarEstado(cuenta_id, 'en_preparacion', data);
    }
  }

  async onCocinaPedidoListo(event) {
    const data = this._unwrap(event);
    const { cuenta_id, pedido_id } = data;

    this.logger.info('cocina.pedido_listo.received', { cuenta_id, pedido_id });
    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    const pedidosActivos = this._pedidosEnCocina.get(cuenta_id);
    if (pedidosActivos && pedido_id) {
      pedidosActivos.delete(pedido_id);
      if (pedidosActivos.size > 0) {
        this.logger.info('cocina.pedido_listo.pendientes_restantes', {
          cuenta_id, pedido_id, pedidos_restantes: pedidosActivos.size
        });
        return;
      }
      this._pedidosEnCocina.delete(cuenta_id);
    }

    if (cuenta.estado === 'en_preparacion') {
      await this._transicionarEstado(cuenta_id, 'listo', data);
    }
  }

  async onCobroIniciado(event) {
    const data = this._unwrap(event);
    const { cuenta_id } = data;

    this.logger.info('cobro.iniciado.received', { cuenta_id });
    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    if (this._pagoExterno(cuenta)) return;

    if (['listo', 'entregado'].includes(cuenta.estado)) {
      await this._transicionarEstado(cuenta_id, 'para_cobrar', data);
    }
  }

  async onCobroProcesado(event) {
    const data = this._unwrap(event);
    const { cuenta_id } = data;

    this.logger.info('cobro.procesado.received', { cuenta_id });
    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;

    // Idempotencia: ignorar duplicados
    if (cuenta.pagado || cuenta.estado === 'cobrado') {
      this.logger.warn('cobro.procesado.duplicado_ignorado', {
        cuenta_id, pagado: cuenta.pagado, estado: cuenta.estado
      });
      return;
    }

    cuenta.pagado     = true;
    cuenta.updated_at = new Date().toISOString();
    await this._publishCuentaActualizada(cuenta.project_id, cuenta_id, { pagado: true }, data);

    this.logger.info('cuenta.pagada', { cuenta_id, estado: cuenta.estado });

    if (this._pagoExterno(cuenta)) return;
    if (this._cerrarAlCobrar(cuenta) === false) return;

    await this._cerrarCuentaCobrada(cuenta_id, data);
  }

  async onCuentaExternaCerrada(event) {
    const data = this._unwrap(event);
    const { cuenta_id } = data;

    if (!cuenta_id) return;
    if (!this.cuentas.has(cuenta_id)) return;

    const cuenta = this.cuentas.get(cuenta_id);
    this.cuentas.delete(cuenta_id);
    this._pedidosEnCocina.delete(cuenta_id);

    const pendingTimeout = this._pendingTimeouts.get(cuenta_id);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this._pendingTimeouts.delete(cuenta_id);
    }

    if (this._alertaTimers.has(cuenta_id)) {
      clearTimeout(this._alertaTimers.get(cuenta_id));
      this._alertaTimers.delete(cuenta_id);
    }

    await this._publishCuentaEliminada(cuenta?.project_id, cuenta_id, cuenta?.tipo, 'cuenta_cerrada_canal', data);

    this.logger.info('cuenta.externa.cerrada', { cuenta_id, tipo: cuenta?.tipo });
  }

  // ==========================================
  // UI Handlers (auto-wired desde module.json.ui_handlers)
  // ==========================================

  async handleCreateCuenta(data) {
    const start_time = Date.now();
    try {
      const {
        project_id, tipo, nombre, metadata, pedido_inicial,
        total: totalInicial,
        cuenta_id: cuentaIdPropuesto
      } = data || {};

      if (!project_id) {
        this._logError('cuenta.create.validation_failed', { missing: 'project_id' }, 'ui_create', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      }

      const tipoFinal = tipo || 'local';
      const cuenta_id = cuentaIdPropuesto || this._buildCuentaId(tipoFinal);
      const { turno, ref_display } = this._generateRefDisplay(tipoFinal, nombre);

      const now  = new Date();
      const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const cuenta = {
        id: cuenta_id,
        project_id,
        turno,
        tipo: tipoFinal,
        nombre: nombre || null,
        ref_display,
        estado: 'pendiente',
        pagado: false,
        hora,
        items: 0,
        total: Number.isFinite(totalInicial) ? totalInicial : 0,
        alerta: false,
        metadata: metadata || {},
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };

      this.cuentas.set(cuenta_id, cuenta);
      this._gestionarAlerta(cuenta_id, 'pendiente');

      this.metrics?.increment?.('cuenta.creada.total');
      this.metrics?.increment?.(`cuenta.tipo.${tipoFinal}`);
      this.metrics?.gauge?.('cuenta.activas.count', this.cuentas.size);
      this.metrics?.timing?.('cuenta.create.duration', Date.now() - start_time);

      await this._publishCuentaCreada(cuenta, data);

      this.logger.info('cuenta.creada', {
        project_id, cuenta_id, tipo: tipoFinal, ref_display, duration: Date.now() - start_time
      });

      if (pedido_inicial && Array.isArray(pedido_inicial.items) && pedido_inicial.items.length > 0) {
        await this._inyectarPedidoInicial(cuenta, pedido_inicial, data);
      }

      return { status: 201, data: cuenta };
    } catch (err) {
      return this._handleHandlerError('cuenta.create.failed', err, 'ui_create');
    }
  }

  async handleListCuentas(data) {
    try {
      const { project_id, tipo, estado } = data || {};
      let cuentas = Array.from(this.cuentas.values());
      if (project_id) cuentas = cuentas.filter(c => c.project_id === project_id);
      if (tipo)       cuentas = cuentas.filter(c => c.tipo === tipo);
      if (estado)     cuentas = cuentas.filter(c => c.estado === estado);
      cuentas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { status: 200, data: { cuentas, total: cuentas.length } };
    } catch (err) {
      return this._handleHandlerError('cuenta.list.failed', err, 'ui_list');
    }
  }

  async handleGetCuenta(data) {
    try {
      const { project_id, id } = data || {};
      if (!id) {
        this._logError('cuenta.get.validation_failed', { missing: 'id' }, 'ui_get', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }
      const cuenta = this.cuentas.get(id);
      if (!cuenta || (project_id && cuenta.project_id !== project_id)) {
        this._logError('cuenta.get.not_found', { id, project_id }, 'ui_get', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Cuenta ${id} no encontrada`, {
          entity_type: 'cuenta', entity_id: id
        });
      }
      return { status: 200, data: cuenta };
    } catch (err) {
      return this._handleHandlerError('cuenta.get.failed', err, 'ui_get');
    }
  }

  async handleDeleteCuenta(data) {
    try {
      const { project_id, id } = data || {};
      if (!id) {
        this._logError('cuenta.delete.validation_failed', { missing: 'id' }, 'ui_delete', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }
      const cuenta = this.cuentas.get(id);
      if (!cuenta || (project_id && cuenta.project_id !== project_id)) {
        this._logError('cuenta.delete.not_found', { id, project_id }, 'ui_delete', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Cuenta ${id} no encontrada`, {
          entity_type: 'cuenta', entity_id: id
        });
      }

      this.cuentas.delete(id);
      this._pedidosEnCocina.delete(id);

      const alertaTimer = this._alertaTimers.get(id);
      if (alertaTimer) {
        clearTimeout(alertaTimer);
        this._alertaTimers.delete(id);
      }

      this.metrics?.increment?.('cuenta.eliminada.total');
      this.metrics?.gauge?.('cuenta.activas.count', this.cuentas.size);

      await this._publishCuentaEliminada(cuenta.project_id, id, cuenta.tipo, 'eliminacion_manual', data);

      this.logger.info('cuenta.eliminada', { project_id: cuenta.project_id, cuenta_id: id, tipo: cuenta.tipo });
      return { status: 200, data: { id, deleted: true } };
    } catch (err) {
      return this._handleHandlerError('cuenta.delete.failed', err, 'ui_delete');
    }
  }

  async handleMarcarEntregado(data) {
    try {
      const { project_id, id } = data || {};
      if (!id) {
        this._logError('cuenta.marcar_entregado.validation_failed', { missing: 'id' }, 'ui_marcar_entregado', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }
      const cuenta = this.cuentas.get(id);
      if (!cuenta || (project_id && cuenta.project_id !== project_id)) {
        this._logError('cuenta.marcar_entregado.not_found', { id, project_id }, 'ui_marcar_entregado', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Cuenta ${id} no encontrada`, {
          entity_type: 'cuenta', entity_id: id
        });
      }
      if (!['listo', 'en_preparacion'].includes(cuenta.estado)) {
        this._logError('cuenta.marcar_entregado.estado_invalido', { id, estado: cuenta.estado }, 'ui_marcar_entregado', 'CONFLICT_STATE');
        return this._errorResponse(409, 'CONFLICT_STATE',
          `Cuenta debe estar en estado 'listo' o 'en_preparacion' (actual: ${cuenta.estado})`,
          { current_state: cuenta.estado, allowed_states: ['listo', 'en_preparacion'] });
      }

      const ok = await this._transicionarEstado(id, 'entregado', data);
      if (!ok) {
        this._logError('cuenta.marcar_entregado.transicion_fallida', { id }, 'ui_marcar_entregado', 'UNKNOWN_ERROR');
        return this._errorResponse(500, 'UNKNOWN_ERROR', 'No se pudo transicionar a entregado');
      }

      this.logger.info('cuenta.marcada_entregado', { cuenta_id: id, pagado: cuenta.pagado });

      if (cuenta.pagado) {
        await this._cerrarCuentaCobrada(id, data);
      }
      return { status: 200, data: { id, estado: 'entregado' } };
    } catch (err) {
      return this._handleHandlerError('cuenta.marcar_entregado.failed', err, 'ui_marcar_entregado');
    }
  }

  async handleRenameCuenta(data) {
    try {
      const { project_id, id, nombre } = data || {};
      if (!id) {
        this._logError('cuenta.rename.validation_failed', { missing: 'id' }, 'ui_rename', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }
      if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
        this._logError('cuenta.rename.validation_failed', { id, missing: 'nombre' }, 'ui_rename', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      }
      const cuenta = this.cuentas.get(id);
      if (!cuenta || (project_id && cuenta.project_id !== project_id)) {
        this._logError('cuenta.rename.not_found', { id, project_id }, 'ui_rename', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Cuenta ${id} no encontrada`, {
          entity_type: 'cuenta', entity_id: id
        });
      }

      const nombre_anterior = cuenta.nombre;
      cuenta.nombre     = nombre.trim().slice(0, 50);
      cuenta.updated_at = new Date().toISOString();

      // Recomponer ref_display: si tenemos turno (fuente de verdad), regenerar
      // limpio desde turno+tipo+nombre. Si no (cuenta legacy restaurada),
      // extraer el codigo "X NNN" del ref_display actual.
      if (Number.isInteger(cuenta.turno)) {
        const numero = String(cuenta.turno).padStart(3, '0');
        const symbol = CuentasModule.SIMBOLOS[cuenta.tipo] || 'M';
        cuenta.ref_display = this._buildRefDisplay(symbol, numero, cuenta.nombre);
      } else if (cuenta.ref_display) {
        const match = cuenta.ref_display.match(/[A-Z]\s\d{3}/);
        const code  = match ? match[0] : cuenta.ref_display;
        cuenta.ref_display = cuenta.nombre ? `${cuenta.nombre} ${code}` : code;
      }

      await this._publishCuentaActualizada(cuenta.project_id, id, {
        nombre: cuenta.nombre, ref_display: cuenta.ref_display || null
      }, data);

      this.logger.info('cuenta.renombrada', { cuenta_id: id, nombre_anterior, nombre_nuevo: cuenta.nombre });
      return { status: 200, data: { id, nombre_anterior, nombre_nuevo: cuenta.nombre } };
    } catch (err) {
      return this._handleHandlerError('cuenta.rename.failed', err, 'ui_rename');
    }
  }

  async handleGetStats() {
    try {
      const total = this.cuentas.size;
      const por_tipo = { local: 0, delivery: 0, llevar: 0 };
      const por_estado = {};
      for (const cuenta of this.cuentas.values()) {
        if (por_tipo[cuenta.tipo] !== undefined) por_tipo[cuenta.tipo]++;
        por_estado[cuenta.estado] = (por_estado[cuenta.estado] || 0) + 1;
      }
      return { status: 200, data: { total, por_tipo, por_estado } };
    } catch (err) {
      return this._handleHandlerError('cuenta.stats.failed', err, 'ui_stats');
    }
  }

  async handleHealthCheck() {
    try {
      const is_healthy = this.cuentas.size < 100;
      return {
        status: is_healthy ? 200 : 503,
        data: {
          status: is_healthy ? 'healthy' : 'unhealthy',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          version: this.version,
          cuentas_activas: this.cuentas.size,
          pending_delete_timeouts: this._pendingTimeouts.size,
          alerta_timers: this._alertaTimers.size
        }
      };
    } catch (err) {
      return this._handleHandlerError('cuenta.health.failed', err, 'ui_health');
    }
  }

  async handleGetMetrics() {
    try {
      const por_estado = {};
      const por_tipo   = { local: 0, delivery: 0, llevar: 0 };
      let alertas_activas = 0;
      for (const cuenta of this.cuentas.values()) {
        por_estado[cuenta.estado] = (por_estado[cuenta.estado] || 0) + 1;
        if (por_tipo[cuenta.tipo] !== undefined) por_tipo[cuenta.tipo]++;
        if (cuenta.alerta) alertas_activas++;
      }
      return {
        status: 200,
        data: {
          cuentas_activas: this.cuentas.size,
          por_estado, por_tipo, alertas_activas,
          pending_delete_timeouts: this._pendingTimeouts.size,
          alerta_timers: this._alertaTimers.size,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err) {
      return this._handleHandlerError('cuenta.metrics.failed', err, 'ui_metrics');
    }
  }

  // ==========================================
  // Internals — pedido inicial, cobro cleanup, flags
  // ==========================================

  async _inyectarPedidoInicial(cuenta, pedido_inicial, sourcePayload = null) {
    const itemsCount = pedido_inicial.items.reduce((s, i) => s + (i.cantidad || 1), 0);
    const total = pedido_inicial.total ?? pedido_inicial.items.reduce(
      (s, i) => s + (i.subtotal || (i.precio || 0) * (i.cantidad || 1)), 0
    );

    cuenta.items     = itemsCount;
    cuenta.total     = total;
    cuenta.updated_at = new Date().toISOString();

    await this._transicionarEstado(cuenta.id, 'con_pedido', sourcePayload);
    await this._publishCuentaActualizada(cuenta.project_id, cuenta.id, {
      items: cuenta.items, total: cuenta.total
    }, sourcePayload);

    const pedido_id = `ped_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    await this._publicarEvento('comandero.enviar_cocina', {
      cuenta_id:       cuenta.id,
      pedido_id,
      project_id:      cuenta.project_id,
      ref_display:     cuenta.ref_display,
      items:           pedido_inicial.items,
      total,
      notas_generales: pedido_inicial.notas_generales || null,
      created_at:      cuenta.created_at
    }, sourcePayload);

    this.logger.info('cuenta.pedido_inicial.inyectado', {
      cuenta_id: cuenta.id, pedido_id, items_count: itemsCount, total
    });
  }

  async _cerrarCuentaCobrada(cuenta_id, sourcePayload = null) {
    const cuenta = this.cuentas.get(cuenta_id);
    if (!cuenta) return;
    if (cuenta.estado === 'cobrado') return;

    const ok = await this._transicionarEstado(cuenta_id, 'cobrado', sourcePayload);
    if (!ok) {
      this.logger.warn('cuenta.cerrar_cobrada.transicion_fallida', {
        cuenta_id, estado_actual: cuenta.estado
      });
      return;
    }

    this._pedidosEnCocina.delete(cuenta_id);

    const timeoutAnterior = this._pendingTimeouts.get(cuenta_id);
    if (timeoutAnterior) clearTimeout(timeoutAnterior);

    const project_id = cuenta.project_id;
    const tipo       = cuenta.tipo;
    const timeout    = setTimeout(() => {
      this._pendingTimeouts.delete(cuenta_id);
      this.cuentas.delete(cuenta_id);
      this._publishCuentaEliminada(project_id, cuenta_id, tipo, 'cobro_completado');
    }, POST_COBRADO_MS);

    this._pendingTimeouts.set(cuenta_id, timeout);
  }

  _pagoExterno(cuenta) {
    if (cuenta?.metadata?.pago_externo !== undefined) return !!cuenta.metadata.pago_externo;
    return cuenta?.tipo === 'llevadoo';
  }

  _cerrarAlCobrar(cuenta) {
    if (cuenta?.metadata?.cerrar_al_cobrar !== undefined) return !!cuenta.metadata.cerrar_al_cobrar;
    if (cuenta?.tipo === 'llevar') return false;
    return true;
  }

  // ==========================================
  // Publishers tipados (delegan a _publicarEvento)
  // ==========================================

  async _publishCuentaCreada(cuenta, sourcePayload = null) {
    await this._publicarEvento('cuenta.creada', {
      project_id:  cuenta.project_id,
      cuenta_id:   cuenta.id,
      turno:       cuenta.turno,
      tipo:        cuenta.tipo,
      nombre:      cuenta.nombre,
      ref_display: cuenta.ref_display,
      origen:      cuenta.nombre || cuenta.tipo,
      total:       cuenta.total,
      metadata:    cuenta.metadata || {},
      estado:      cuenta.estado,
      created_at:  cuenta.created_at
    }, sourcePayload);
  }

  async _publishCuentaActualizada(project_id, cuenta_id, cambios, sourcePayload = null) {
    await this._publicarEvento('cuenta.actualizada', {
      project_id, cuenta_id, cambios, updated_at: new Date().toISOString()
    }, sourcePayload);
  }

  async _publishCuentaEliminada(project_id, cuenta_id, tipo, motivo, sourcePayload = null) {
    await this._publicarEvento('cuenta.eliminada', {
      project_id, cuenta_id, tipo, motivo
    }, sourcePayload);
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
                   code === 'AUTHENTICATION_REQUIRED' ? 401 :
                   code === 'ALREADY_EXISTS'          ? 409 :
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'DEPENDENCY_UNAVAILABLE'  ? 503 :
                   code === 'EXTERNAL_API_FAILED'     ? 502 :
                   code === 'TIMEOUT'                 ? 504 :
                   code === 'FILESYSTEM_ERROR'        ? 500 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment?.('pizzepos-cuentas.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg  = (err?.message || '').toLowerCase();
    const ecod = err?.code || '';
    if (ecod === 'ENOENT' || msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (ecod === 'EACCES' || msg.includes('permission') || msg.includes('forbidden'))    return 'PERMISSION_DENIED';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (msg.includes('conflict') || msg.includes('already exists'))                       return 'ALREADY_EXISTS';
    if (ecod && ecod.startsWith('E'))                                                     return 'FILESYSTEM_ERROR';
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
      this.logger.error('pizzepos-cuentas.publish_error', { event: name, error: err.message });
      this.metrics?.increment?.('pizzepos-cuentas.errors', { kind: 'publish', code: 'UNKNOWN_ERROR' });
    }
  }

  // 5o helper auxiliar: escritura atomica .tmp + rename
  async _atomicWriteFile(absPath, contents) {
    const tmpPath = absPath + '.tmp';
    await fs.writeFile(tmpPath, contents, 'utf-8');
    await fs.rename(tmpPath, absPath);
  }

  // 6o helper: lectura JSON con log+metric en error (no swallow silencioso)
  async _readJsonSafe(filePath, kind) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('pizzepos-cuentas.read_error', { file: filePath, kind, error: err.message });
        this.metrics?.increment?.('pizzepos-cuentas.errors', { kind: kind || 'read_json', code: this._classifyHandlerError(err) });
      }
      return null;
    }
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment?.('pizzepos-cuentas.errors', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }

  // ==========================================
  // Persistencia (turno + restauracion)
  // ==========================================

  async _loadTurno() {
    const json = await this._readJsonSafe(this._turnoFile, 'turno_load');
    if (json) {
      this._turno = json.turno ?? json.counter ?? 0;
      this.logger.info('cuentas.turno.loaded', { turno: this._turno });
    } else {
      this._turno = 0;
    }
  }

  _saveTurnoDebounced() {
    if (this._turnoSaveTimer) clearTimeout(this._turnoSaveTimer);
    if (!this._turnoFile) return;
    this._turnoSaveTimer = setTimeout(() => this._saveTurno(), TURNO_DEBOUNCE_MS);
  }

  async _saveTurno() {
    if (!this._turnoFile) return;
    try {
      await fs.mkdir(path.dirname(this._turnoFile), { recursive: true });
      await this._atomicWriteFile(
        this._turnoFile,
        JSON.stringify({ turno: this._turno, counter: this._turno })
      );
    } catch (err) {
      this.logger.warn('cuentas.turno.save_error', { error: err.message });
      this.metrics?.increment?.('pizzepos-cuentas.errors', { kind: 'turno_save', code: 'FILESYSTEM_ERROR' });
    }
  }

  async _restaurarDesdeArchivo() {
    const datos = await this._readJsonSafe(
      path.join('./data/current', 'cuentas_activas.json'),
      'restaurar'
    );
    if (!datos?.cuentas || Object.keys(datos.cuentas).length === 0) return;

    let restauradas    = 0;
    let maxTurnoVisto  = 0;

    for (const [cuenta_id, cp] of Object.entries(datos.cuentas)) {
      let estado = cp.estado || 'pendiente';
      if (estado === 'abierta') {
        estado = (cp.pedidos && cp.pedidos.length > 0) ? 'con_pedido' : 'pendiente';
      }

      let itemsCount = cp.items || 0;
      if (!itemsCount && Array.isArray(cp.pedidos)) {
        for (const p of cp.pedidos) {
          if (Array.isArray(p.items)) {
            itemsCount += p.items.reduce((sum, i) => sum + (i.cantidad || 1), 0);
          }
        }
      }

      let hora = '--:--';
      try {
        const d = new Date(cp.created_at);
        hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      } catch (_) { /* defaults */ }

      const turnoRestaurado = Number.isInteger(cp.turno) ? cp.turno : null;
      if (turnoRestaurado && turnoRestaurado > maxTurnoVisto) maxTurnoVisto = turnoRestaurado;

      const nombreRestaurado = cp.datos_especificos?.nombre || cp.nombre || null;

      this.cuentas.set(cuenta_id, {
        id: cuenta_id,
        project_id:      cp.project_id || null,
        turno:           turnoRestaurado,
        tipo:            cp.tipo || 'local',
        nombre:          nombreRestaurado,
        cliente_nombre:  cp.datos_especificos?.cliente_nombre || cp.cliente_nombre || null,
        ref_display:     cp.ref_display || null,
        estado,
        pagado:          cp.pagado || false,
        hora,
        items:           itemsCount,
        total:           cp.total || 0,
        alerta:          false,
        metadata:        cp.datos_especificos || cp.metadata || {},
        created_at:      cp.created_at || new Date().toISOString(),
        updated_at:      cp.updated_at || cp.created_at || new Date().toISOString()
      });
      restauradas++;
    }

    if (maxTurnoVisto > this._turno) {
      this._turno = maxTurnoVisto;
      this._saveTurnoDebounced();
    }

    this.metrics?.gauge?.('cuenta.activas.count', this.cuentas.size);
    this.logger.info('cuentas.estado_restaurado', {
      cuentas_restauradas: restauradas,
      turno_actual:        this._turno
    });
  }

  // ==========================================
  // Helpers de identidad de cuenta (turno + ref_display)
  // ==========================================

  _buildCuentaId(tipo) {
    const tipoCanonico = tipo === 'local' ? 'mesa' : (tipo || 'cuenta');
    const uuid8 = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    return `${tipoCanonico}_${uuid8}`;
  }

  _getNextTurno() {
    this._turno++;
    if (this._turno > 999) this._turno = 1;
    this._saveTurnoDebounced();
    return this._turno;
  }

  _buildRefDisplay(symbol, number, nombre) {
    const code = `${symbol} ${number}`;
    return nombre ? `${nombre} ${code}` : code;
  }

  _generateRefDisplay(tipo, nombre) {
    const turno  = this._getNextTurno();
    const numero = String(turno).padStart(3, '0');
    const symbol = CuentasModule.SIMBOLOS[tipo] || 'M';
    const esAuto = nombre && /^(Mesa|Llevadoo|Cliente Glovo|Cliente WhatsApp|Cliente)(\s|$)/i.test(nombre);
    const nombreFinal = esAuto ? null : (nombre || null);
    return { turno, numero, ref_display: this._buildRefDisplay(symbol, numero, nombreFinal) };
  }

  // ==========================================
  // Metrics reporting (interval)
  // ==========================================

  _reportMetrics() {
    if (!this.metrics?.gauge) return;
    this.metrics.gauge('cuenta.activas.count', this.cuentas.size);

    const por_tipo = { local: 0, delivery: 0, llevar: 0 };
    const por_estado = {
      pendiente: 0, con_pedido: 0, en_preparacion: 0,
      listo: 0, entregado: 0, para_cobrar: 0, cobrado: 0
    };
    let alertas = 0;

    for (const cuenta of this.cuentas.values()) {
      if (por_tipo[cuenta.tipo] !== undefined)     por_tipo[cuenta.tipo]++;
      if (por_estado[cuenta.estado] !== undefined) por_estado[cuenta.estado]++;
      if (cuenta.alerta) alertas++;
    }

    for (const [tipo, count] of Object.entries(por_tipo)) {
      this.metrics.gauge(`cuenta.por_tipo.${tipo}`, count);
    }
    for (const [estado, count] of Object.entries(por_estado)) {
      this.metrics.gauge(`cuenta.por_estado.${estado}`, count);
    }
    this.metrics.gauge('cuenta.alertas.count', alertas);
  }
}

module.exports = CuentasModule;
