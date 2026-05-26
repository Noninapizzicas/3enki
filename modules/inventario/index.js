'use strict';

const path = require('path');
const fs = require('fs').promises;

const BaseModule = require('../_shared/base-module');
const { SafeUpdate } = require('./services/safe-update');

class InventarioModule extends BaseModule {
  constructor() {
    super();
    this.name = 'inventario';
    this.version = '1.0.0';

    this.config = null;
    this.safeUpdate = null;
    this.expirationTimer = null;
    // project_slug -> reserva_expiracion_horas resuelto de config/project.json
    this.projectExpiracionHoras = new Map();
  }

  // ==========================================
  // Helpers de dominio
  // ==========================================

  _inventarioFile(slug) {
    return path.join(this.config?.projects_dir || 'data/projects', slug, 'inventario.json');
  }

  _projectConfigFile(slug) {
    return path.join(this.config?.projects_dir || 'data/projects', slug, 'config', 'project.json');
  }

  _emptyStore() {
    return { productos: {} };
  }

  _isReservaViva(reserva, now = Date.now()) {
    if (!reserva?.expira_at) return false;
    return new Date(reserva.expira_at).getTime() > now;
  }

  _cantidadReservadaViva(producto, now = Date.now()) {
    if (!producto?.reservas) return 0;
    return producto.reservas
      .filter(r => this._isReservaViva(r, now))
      .reduce((sum, r) => sum + (r.cantidad || 0), 0);
  }

  _disponible(producto, now = Date.now()) {
    const real = producto?.stock_real || 0;
    return Math.max(0, real - this._cantidadReservadaViva(producto, now));
  }

  _diffStockBajoMinimo(producto_id, antes, despues, stock_minimo) {
    if (typeof stock_minimo !== 'number' || stock_minimo <= 0) return false;
    return antes > stock_minimo && despues <= stock_minimo;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    const moduleJson = JSON.parse(await fs.readFile(path.join(__dirname, 'module.json'), 'utf8'));
    this.config = moduleJson.config || {};
    this.safeUpdate = new SafeUpdate();

    this.logger.info('module.loading', { module: this.name, version: this.version });

    await this._hidratarConfigsProyectos();
    this._iniciarJobExpiracion();

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      projects_configured: this.projectExpiracionHoras.size
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = null;
    }
    this.projectExpiracionHoras.clear();
    this.safeUpdate = null;
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus API (handlers de eventos)
  // ==========================================

  async onPedidoCompletado(event) {
    const data = event?.data || event;
    if (data?.tipo !== 'tienda') return;
    const project_slug = data?.project_slug || data?.project_id;
    const pedido_id = data?.pedido_id;
    if (!project_slug || !pedido_id) return;
    this.logger.info('inventario.pedido.completado.recibido', { project_slug, pedido_id });
    await this.handleConfirmar({ project_slug, pedido_id, correlation_id: data?.correlation_id });
  }

  async onPedidoCancelado(event) {
    const data = event?.data || event;
    const project_slug = data?.project_slug || data?.project_id;
    const pedido_id = data?.pedido_id;
    if (!project_slug || !pedido_id) return;
    if (data?.tipo && data.tipo !== 'tienda') return; // ignora cancelaciones POS
    this.logger.info('inventario.pedido.cancelado.recibido', { project_slug, pedido_id });
    await this.handleLiberar({ project_slug, pedido_id, motivo: data?.motivo || 'pedido_cancelado', correlation_id: data?.correlation_id });
  }

  // ==========================================
  // HTTP API
  // ==========================================

  async handleHealthCheck(req, res) {
    const body = {
      module: this.name,
      version: this.version,
      projects_configured: this.projectExpiracionHoras.size,
      expiration_job_running: !!this.expirationTimer
    };
    if (res && typeof res.status === 'function') {
      return res.status(200).json({ status: 'ok', ...body });
    }
    return { status: 200, data: body };
  }

  // ==========================================
  // Tool handlers (canonical {status, data|error})
  // ==========================================

  async handleConsultar(data) {
    try {
      const { project_slug, producto_id } = data || {};
      if (!project_slug) return this._errorResponse(400, 'INVALID_INPUT', 'project_slug requerido', { field: 'project_slug' });
      if (!producto_id) return this._errorResponse(400, 'INVALID_INPUT', 'producto_id requerido', { field: 'producto_id' });

      const store = await this.safeUpdate.read(this._inventarioFile(project_slug)) || this._emptyStore();
      const producto = store.productos?.[producto_id];
      if (!producto) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Producto '${producto_id}' no existe en inventario de '${project_slug}'`, { project_slug, producto_id });
      }
      const now = Date.now();
      const reservas_vivas = (producto.reservas || []).filter(r => this._isReservaViva(r, now));
      return {
        status: 200,
        data: {
          project_slug,
          producto_id,
          nombre: producto.nombre || null,
          stock_real: producto.stock_real || 0,
          stock_minimo: producto.stock_minimo || 0,
          stock_disponible: this._disponible(producto, now),
          reservas_vivas_count: reservas_vivas.length,
          reservas_vivas_cantidad: reservas_vivas.reduce((s, r) => s + r.cantidad, 0)
        }
      };
    } catch (err) {
      return this._handleHandlerError('inventario.consultar.error', err, 'tool');
    }
  }

  async handleReservar(data) {
    try {
      const { project_slug, producto_id, cantidad, pedido_id } = data || {};
      const expira_horas_input = data?.expira_horas;
      const correlation_id = data?.correlation_id;

      if (!project_slug) return this._errorResponse(400, 'INVALID_INPUT', 'project_slug requerido', { field: 'project_slug' });
      if (!producto_id)  return this._errorResponse(400, 'INVALID_INPUT', 'producto_id requerido',  { field: 'producto_id' });
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        return this._errorResponse(400, 'INVALID_INPUT', 'cantidad debe ser entero > 0', { field: 'cantidad' });
      }
      if (!pedido_id)    return this._errorResponse(400, 'INVALID_INPUT', 'pedido_id requerido',    { field: 'pedido_id' });

      const horas = Number.isInteger(expira_horas_input) && expira_horas_input > 0
        ? expira_horas_input
        : (this.projectExpiracionHoras.get(project_slug) || this.config?.default_reserva_expiracion_horas || 24);
      const expira_at = new Date(Date.now() + horas * 3600_000).toISOString();

      let publishPayload = null;
      let publishBajoMinimo = null;
      let conflict = null;

      const updated = await this.safeUpdate.update(this._inventarioFile(project_slug), (snapshot) => {
        const store = snapshot ? this._cloneStore(snapshot) : this._emptyStore();
        const producto = store.productos[producto_id];
        if (!producto) {
          conflict = { code: 'RESOURCE_NOT_FOUND', message: `Producto '${producto_id}' no existe`, details: { project_slug, producto_id } };
          return undefined;
        }
        producto.reservas = producto.reservas || [];
        const now = Date.now();
        // Idempotencia: si ya existe reserva para (pedido_id, producto_id) con misma cantidad y viva, no duplicar.
        const existente = producto.reservas.find(r =>
          r.pedido_id === pedido_id && this._isReservaViva(r, now)
        );
        if (existente) {
          publishPayload = null; // no nueva reserva
          return undefined;
        }
        // Verificar disponibilidad
        const disponible = this._disponible(producto, now);
        if (disponible < cantidad) {
          conflict = {
            code: 'CONFLICT_STATE',
            message: `Stock insuficiente: disponible ${disponible}, solicitado ${cantidad}`,
            details: { project_slug, producto_id, disponible, solicitado: cantidad }
          };
          return undefined;
        }
        const stockAntes = disponible;
        producto.reservas.push({
          pedido_id,
          cantidad,
          expira_at,
          created_at: new Date().toISOString()
        });
        const stockDespues = this._disponible(producto, now);
        publishPayload = {
          project_slug,
          producto_id,
          pedido_id,
          cantidad,
          expira_at,
          stock_disponible_restante: stockDespues,
          correlation_id
        };
        if (this._diffStockBajoMinimo(producto_id, stockAntes, stockDespues, producto.stock_minimo)) {
          publishBajoMinimo = {
            project_slug,
            producto_id,
            stock_disponible: stockDespues,
            stock_minimo: producto.stock_minimo,
            correlation_id
          };
        }
        return store;
      });

      if (conflict) {
        this.metrics?.increment('inventario.reservar.conflict', { code: conflict.code, project: project_slug });
        return this._errorResponse(conflict.code === 'RESOURCE_NOT_FOUND' ? 404 : 409, conflict.code, conflict.message, conflict.details);
      }

      // Si fue idempotente (no-op): leer estado actual para devolver la reserva existente
      if (!publishPayload) {
        const store = await this.safeUpdate.read(this._inventarioFile(project_slug));
        const producto = store?.productos?.[producto_id];
        const existente = (producto?.reservas || []).find(r => r.pedido_id === pedido_id);
        this.metrics?.increment('inventario.reservar.idempotente', { project: project_slug });
        return {
          status: 200,
          data: {
            project_slug,
            producto_id,
            pedido_id,
            cantidad: existente?.cantidad || cantidad,
            expira_at: existente?.expira_at || expira_at,
            idempotente: true
          }
        };
      }

      this.metrics?.increment('inventario.reservar.creada', { project: project_slug });
      await this._publicarEvento('inventario.reserva.creada', publishPayload);
      if (publishBajoMinimo) {
        await this._publicarEvento('inventario.stock.bajo_minimo', publishBajoMinimo);
      }

      return {
        status: 201,
        data: {
          project_slug,
          producto_id,
          pedido_id,
          cantidad,
          expira_at,
          stock_disponible_restante: publishPayload.stock_disponible_restante
        }
      };
    } catch (err) {
      return this._handleHandlerError('inventario.reservar.error', err, 'tool');
    }
  }

  async handleConfirmar(data) {
    try {
      const { project_slug, pedido_id } = data || {};
      const correlation_id = data?.correlation_id;
      if (!project_slug) return this._errorResponse(400, 'INVALID_INPUT', 'project_slug requerido', { field: 'project_slug' });
      if (!pedido_id)    return this._errorResponse(400, 'INVALID_INPUT', 'pedido_id requerido', { field: 'pedido_id' });

      const confirmaciones = []; // [{ producto_id, cantidad, stock_real_restante }]

      const updated = await this.safeUpdate.update(this._inventarioFile(project_slug), (snapshot) => {
        if (!snapshot || !snapshot.productos) return undefined;
        const store = this._cloneStore(snapshot);
        let touched = false;
        for (const [producto_id, producto] of Object.entries(store.productos)) {
          if (!producto.reservas) continue;
          const reservasDeEste = producto.reservas.filter(r => r.pedido_id === pedido_id);
          if (reservasDeEste.length === 0) continue;
          const totalCantidad = reservasDeEste.reduce((s, r) => s + (r.cantidad || 0), 0);
          producto.stock_real = Math.max(0, (producto.stock_real || 0) - totalCantidad);
          producto.reservas = producto.reservas.filter(r => r.pedido_id !== pedido_id);
          confirmaciones.push({ producto_id, cantidad: totalCantidad, stock_real_restante: producto.stock_real });
          touched = true;
        }
        return touched ? store : undefined;
      });

      if (confirmaciones.length === 0) {
        // Idempotente: no habia reservas (ya confirmado o pedido_id desconocido)
        return { status: 200, data: { project_slug, pedido_id, confirmaciones: [], idempotente: true } };
      }

      this.metrics?.increment('inventario.confirmar.ok', { project: project_slug });
      for (const c of confirmaciones) {
        await this._publicarEvento('inventario.confirmado', {
          project_slug,
          producto_id: c.producto_id,
          pedido_id,
          cantidad: c.cantidad,
          stock_real_restante: c.stock_real_restante,
          correlation_id
        });
      }

      return { status: 200, data: { project_slug, pedido_id, confirmaciones } };
    } catch (err) {
      return this._handleHandlerError('inventario.confirmar.error', err, 'tool');
    }
  }

  async handleLiberar(data) {
    try {
      const { project_slug, pedido_id } = data || {};
      const motivo = data?.motivo || 'liberacion_manual';
      const correlation_id = data?.correlation_id;
      if (!project_slug) return this._errorResponse(400, 'INVALID_INPUT', 'project_slug requerido', { field: 'project_slug' });
      if (!pedido_id)    return this._errorResponse(400, 'INVALID_INPUT', 'pedido_id requerido', { field: 'pedido_id' });

      const liberaciones = [];

      const updated = await this.safeUpdate.update(this._inventarioFile(project_slug), (snapshot) => {
        if (!snapshot || !snapshot.productos) return undefined;
        const store = this._cloneStore(snapshot);
        let touched = false;
        for (const [producto_id, producto] of Object.entries(store.productos)) {
          if (!producto.reservas) continue;
          const reservasDeEste = producto.reservas.filter(r => r.pedido_id === pedido_id);
          if (reservasDeEste.length === 0) continue;
          const totalCantidad = reservasDeEste.reduce((s, r) => s + (r.cantidad || 0), 0);
          producto.reservas = producto.reservas.filter(r => r.pedido_id !== pedido_id);
          liberaciones.push({ producto_id, cantidad: totalCantidad });
          touched = true;
        }
        return touched ? store : undefined;
      });

      if (liberaciones.length === 0) {
        return { status: 200, data: { project_slug, pedido_id, liberaciones: [], idempotente: true } };
      }

      this.metrics?.increment('inventario.liberar.ok', { project: project_slug });
      for (const l of liberaciones) {
        await this._publicarEvento('inventario.reserva.liberada', {
          project_slug,
          producto_id: l.producto_id,
          pedido_id,
          cantidad: l.cantidad,
          motivo,
          correlation_id
        });
      }

      return { status: 200, data: { project_slug, pedido_id, liberaciones } };
    } catch (err) {
      return this._handleHandlerError('inventario.liberar.error', err, 'tool');
    }
  }

  async handleAjustar(data) {
    try {
      const { project_slug, producto_id, delta, motivo } = data || {};
      const correlation_id = data?.correlation_id;
      if (!project_slug) return this._errorResponse(400, 'INVALID_INPUT', 'project_slug requerido', { field: 'project_slug' });
      if (!producto_id)  return this._errorResponse(400, 'INVALID_INPUT', 'producto_id requerido', { field: 'producto_id' });
      if (!Number.isInteger(delta) || delta === 0) {
        return this._errorResponse(400, 'INVALID_INPUT', 'delta debe ser entero distinto de 0', { field: 'delta' });
      }
      if (!motivo || typeof motivo !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'motivo requerido', { field: 'motivo' });
      }

      let conflict = null;
      let stock_nuevo = null;
      let publishBajoMinimo = null;

      const updated = await this.safeUpdate.update(this._inventarioFile(project_slug), (snapshot) => {
        const store = snapshot ? this._cloneStore(snapshot) : this._emptyStore();
        const producto = store.productos[producto_id];
        if (!producto) {
          conflict = { code: 'RESOURCE_NOT_FOUND', message: `Producto '${producto_id}' no existe`, details: { project_slug, producto_id } };
          return undefined;
        }
        const nuevoReal = (producto.stock_real || 0) + delta;
        if (nuevoReal < 0) {
          conflict = {
            code: 'CONFLICT_STATE',
            message: `Ajuste resultaria en stock_real negativo (${nuevoReal})`,
            details: { project_slug, producto_id, stock_real_actual: producto.stock_real, delta }
          };
          return undefined;
        }
        const now = Date.now();
        const dispAntes = this._disponible(producto, now);
        producto.stock_real = nuevoReal;
        const dispDespues = this._disponible(producto, now);
        stock_nuevo = nuevoReal;
        if (this._diffStockBajoMinimo(producto_id, dispAntes, dispDespues, producto.stock_minimo)) {
          publishBajoMinimo = {
            project_slug,
            producto_id,
            stock_disponible: dispDespues,
            stock_minimo: producto.stock_minimo,
            correlation_id
          };
        }
        return store;
      });

      if (conflict) {
        this.metrics?.increment('inventario.ajustar.error', { code: conflict.code, project: project_slug });
        return this._errorResponse(conflict.code === 'RESOURCE_NOT_FOUND' ? 404 : 409, conflict.code, conflict.message, conflict.details);
      }

      this.metrics?.increment('inventario.ajustar.ok', { project: project_slug });
      await this._publicarEvento('inventario.ajustado', {
        project_slug,
        producto_id,
        delta,
        motivo,
        stock_real_nuevo: stock_nuevo,
        correlation_id
      });
      if (publishBajoMinimo) {
        await this._publicarEvento('inventario.stock.bajo_minimo', publishBajoMinimo);
      }

      return { status: 200, data: { project_slug, producto_id, stock_real: stock_nuevo, delta, motivo } };
    } catch (err) {
      return this._handleHandlerError('inventario.ajustar.error', err, 'tool');
    }
  }

  async handleEstadoCatalogo(data) {
    try {
      const { project_slug } = data || {};
      if (!project_slug) return this._errorResponse(400, 'INVALID_INPUT', 'project_slug requerido', { field: 'project_slug' });

      const store = await this.safeUpdate.read(this._inventarioFile(project_slug));
      if (!store || !store.productos) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Inventario de '${project_slug}' no existe`, { project_slug });
      }
      const now = Date.now();
      const productos = Object.entries(store.productos).map(([producto_id, p]) => {
        const reservas_vivas = (p.reservas || []).filter(r => this._isReservaViva(r, now));
        return {
          producto_id,
          nombre: p.nombre || null,
          stock_real: p.stock_real || 0,
          stock_minimo: p.stock_minimo || 0,
          stock_disponible: this._disponible(p, now),
          reservas_vivas_count: reservas_vivas.length,
          reservas_vivas_cantidad: reservas_vivas.reduce((s, r) => s + r.cantidad, 0)
        };
      });
      return { status: 200, data: { project_slug, productos } };
    } catch (err) {
      return this._handleHandlerError('inventario.estado.error', err, 'tool');
    }
  }

  // ==========================================
  // Dominio protegido (configs, expiracion job)
  // ==========================================

  _cloneStore(store) {
    return JSON.parse(JSON.stringify(store));
  }

  async _hidratarConfigsProyectos() {
    const projectsDir = this.config?.projects_dir || 'data/projects';
    let entries;
    try {
      entries = await fs.readdir(projectsDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.logger.warn('inventario.projects_dir.missing', { projects_dir: projectsDir });
        return;
      }
      throw err;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const cfg = await this._readProjectConfig(entry.name);
      if (cfg?.inventario?.reserva_expiracion_horas) {
        this.projectExpiracionHoras.set(entry.name, cfg.inventario.reserva_expiracion_horas);
      }
    }
  }

  async _readProjectConfig(slug) {
    try {
      const raw = await fs.readFile(this._projectConfigFile(slug), 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      this.logger.warn('inventario.project_config.read_error', { slug, error: err.message });
      return null;
    }
  }

  _iniciarJobExpiracion() {
    const interval = this.config?.expiration_job_interval_ms || 60000;
    if (interval <= 0) return;
    this.expirationTimer = setInterval(() => {
      this._expirarReservasVencidas().catch(err => {
        this.logger?.error?.('inventario.expiracion_job.error', { error: err.message });
      });
    }, interval);
    if (this.expirationTimer.unref) this.expirationTimer.unref();
  }

  async _expirarReservasVencidas(now = Date.now()) {
    const projectsDir = this.config?.projects_dir || 'data/projects';
    let entries;
    try {
      entries = await fs.readdir(projectsDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const expiradasTotales = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const expiradas = await this._expirarProyecto(entry.name, now);
      for (const e of expiradas) expiradasTotales.push(e);
    }
    return expiradasTotales;
  }

  async _expirarProyecto(project_slug, now) {
    const file = this._inventarioFile(project_slug);
    const expiradas = [];
    await this.safeUpdate.update(file, (snapshot) => {
      if (!snapshot || !snapshot.productos) return undefined;
      const store = this._cloneStore(snapshot);
      let touched = false;
      for (const [producto_id, producto] of Object.entries(store.productos)) {
        if (!producto.reservas || producto.reservas.length === 0) continue;
        const vivas = [];
        for (const r of producto.reservas) {
          if (this._isReservaViva(r, now)) {
            vivas.push(r);
          } else {
            expiradas.push({ project_slug, producto_id, ...r });
            touched = true;
          }
        }
        producto.reservas = vivas;
      }
      return touched ? store : undefined;
    });
    for (const exp of expiradas) {
      this.metrics?.increment('inventario.reserva.expirada', { project: project_slug });
      await this._publicarEvento('inventario.reserva.expirada', {
        project_slug: exp.project_slug,
        producto_id: exp.producto_id,
        pedido_id: exp.pedido_id,
        cantidad: exp.cantidad,
        expira_at: exp.expira_at,
        motivo: 'expirada'
      });
    }
    return expiradas;
  }
}

module.exports = InventarioModule;
