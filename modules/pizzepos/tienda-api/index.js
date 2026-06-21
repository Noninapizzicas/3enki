'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');

class TiendaApiModule extends BaseModule {
  constructor() {
    super();
    this.name = 'tienda-api';
    this.version = '1.0.0';

    this.config = null;
    // request_id -> { project_slug, res, timeoutHandle, started_at, correlation_id }
    this.pendingRequests = new Map();
  }

  // ==========================================
  // Helpers de dominio (5to POC2 auxiliar)
  // ==========================================

  _validatePedidoBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'body must be an object', details: { kind: 'invalid_format' } } };
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'items required (non-empty array)', details: { kind: 'missing', field: 'items' } } };
    }
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i];
      if (!item || typeof item !== 'object') {
        return { ok: false, error: { code: 'INVALID_INPUT', message: `items[${i}] must be an object`, details: { kind: 'invalid_format', field: `items[${i}]` } } };
      }
      if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: `items[${i}].cantidad must be integer > 0`, details: { kind: 'invalid_format', field: `items[${i}].cantidad` } } };
      }
      if (!item.descripcion || typeof item.descripcion !== 'string' || item.descripcion.trim().length === 0) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: `items[${i}].descripcion required`, details: { kind: 'missing', field: `items[${i}].descripcion` } } };
      }
    }
    if (!Number.isInteger(body.total_centimos) || body.total_centimos < 0) {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'total_centimos must be integer >= 0', details: { kind: 'invalid_format', field: 'total_centimos' } } };
    }
    if (body.cliente_telefono != null && typeof body.cliente_telefono !== 'string') {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'cliente_telefono must be a string', details: { kind: 'invalid_format', field: 'cliente_telefono' } } };
    }
    if (body.nombre_cliente != null && typeof body.nombre_cliente !== 'string') {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'nombre_cliente must be a string', details: { kind: 'invalid_format', field: 'nombre_cliente' } } };
    }
    if (body.mayor_edad_confirmado != null && typeof body.mayor_edad_confirmado !== 'boolean') {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'mayor_edad_confirmado must be boolean or null', details: { kind: 'invalid_format', field: 'mayor_edad_confirmado' } } };
    }
    if (body.expira_horas != null) {
      if (!Number.isInteger(body.expira_horas) || body.expira_horas < 1 || body.expira_horas > 720) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'expira_horas must be integer in [1, 720]', details: { kind: 'invalid_format', field: 'expira_horas' } } };
      }
    }
    if (body.notas_generales != null && typeof body.notas_generales !== 'string') {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'notas_generales must be a string', details: { kind: 'invalid_format', field: 'notas_generales' } } };
    }
    return { ok: true, normalized: body };
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

    this.logger.info('module.loading', { module: this.name, version: this.version });
    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      pedido_wait_timeout_ms: this.config.pedido_wait_timeout_ms
    });
  }

  async onUnload() {
    this.logger?.info?.('module.unloading', { module: this.name });
    for (const [, pending] of this.pendingRequests) {
      if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
      try {
        if (pending.res && typeof pending.res.status === 'function' && !pending.res.headersSent) {
          pending.res.status(503).json({
            status: 503,
            error: {
              code: 'UPSTREAM_UNREACHABLE',
              message: 'Modulo descargado durante el procesamiento del pedido',
              details: { kind: 'dependency' }
            }
          });
        }
      } catch (_err) { /* ignore */ }
    }
    this.pendingRequests.clear();
    this.logger?.info?.('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus API (handlers de eventos)
  // ==========================================

  // RPC de bus para iniciar el pago (líder pago-gateway).
  async _rpc(evento, payload = {}, { timeout_ms = 15000 } = {}) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    const responseEvent = evento.endsWith('.request') ? evento.slice(0, -8) + '.response' : `${evento}.response`;
    return new Promise((resolve) => {
      let unsub = null;
      const t = setTimeout(() => { if (unsub) unsub(); resolve(null); }, timeout_ms);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (ev) => {
          const dd = ev?.data || ev;
          if (!dd || dd.request_id !== request_id) return;
          clearTimeout(t); if (unsub) unsub(); resolve(dd);
        });
        this.eventBus.publish(evento, { request_id, ...payload });
      } catch (_) { clearTimeout(t); if (unsub) unsub(); resolve(null); }
    });
  }

  async onPedidoCrearTiendaResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this._consumePending(request_id);
    if (!pending) return;

    const duration_ms = Date.now() - pending.started_at;
    this.metrics?.timing?.('tienda-api.pedido.duration', duration_ms, { project: pending.project_slug });

    if (data.error) {
      const code = data.error.code || 'UNKNOWN_ERROR';
      const status = this._statusFromCode(code);
      this.logger.warn('tienda-api.pedido.bus_error', {
        request_id,
        project_slug: pending.project_slug,
        error: data.error,
        duration_ms
      });
      this.metrics?.increment('tienda.pedido.fallido.total', {
        project: pending.project_slug,
        fase: 'bus_error',
        code
      });
      await this._publicarEvento('tienda.pedido.fallido', {
        project_slug: pending.project_slug,
        fase: 'bus_error',
        error: data.error
      }, { correlation_id: pending.correlation_id });
      this._respondToClient(pending, status, { status, error: data.error });
      return;
    }

    const result = data.result || data.data || {};
    this.logger.info('tienda-api.pedido.completado', {
      request_id,
      project_slug: pending.project_slug,
      pedido_id: result.pedido_id,
      duration_ms
    });
    this.metrics?.increment('tienda.pedido.completado.total', { project: pending.project_slug });
    await this._publicarEvento('tienda.pedido.completado', {
      project_slug: pending.project_slug,
      pedido_id: result.pedido_id,
      codigo_recogida: result.codigo_recogida
    }, { correlation_id: pending.correlation_id });
    const respData = {
      pedido_id: result.pedido_id,
      codigo_recogida: result.codigo_recogida,
      correlation_id: pending.correlation_id
    };

    // Pago online opcional: inicia el pago en la pasarela → devuelve checkout_url.
    // Si no hay pasarela (NO_PASARELA) o falla, el pedido YA está creado (recogida) — no se pierde.
    if (pending.pago_online) {
      const pago = await this._rpc('pago.iniciar.request', {
        pedido_id: result.pedido_id, project_id: pending.project_slug,
        monto_centimos: pending.total_centimos, concepto: 'Pedido ' + (result.codigo_recogida || ''),
        return_url: pending.return_url || ''
      }, { timeout_ms: 20000 });
      if (pago && pago.status === 200 && pago.data?.checkout_url) {
        respData.checkout_url = pago.data.checkout_url;
        respData.pago_session_id = pago.data.session_id;
      } else {
        respData.pago_error = (pago && pago.error) ? pago.error.code : 'PAGO_NO_DISPONIBLE';
        this.logger.warn('tienda-api.pago.no_iniciado', { pedido_id: result.pedido_id, error: respData.pago_error });
      }
    }

    this._respondToClient(pending, 201, { status: 201, data: respData });
  }

  // ==========================================
  // HTTP API
  // ==========================================

  async handlePedidoPost(req, res) {
    const project_slug = req?.params?.project;
    const correlation_id = crypto.randomUUID();

    try {
      if (!project_slug || typeof project_slug !== 'string') {
        const errResp = this._errorResponse(400, 'INVALID_INPUT', 'project param required in path', { kind: 'missing', field: 'project' });
        return this._respondNow(res, errResp.status, errResp);
      }

      const body = req?.body || {};
      const validation = this._validatePedidoBody(body);
      if (!validation.ok) {
        this.metrics?.increment('tienda.pedido.fallido.total', {
          project: project_slug,
          fase: 'validar',
          code: validation.error.code
        });
        await this._publicarEvento('tienda.pedido.fallido', {
          project_slug,
          fase: 'validar',
          error: validation.error
        }, { correlation_id });
        return this._respondNow(res, 400, { status: 400, error: validation.error });
      }

      const normalized = validation.normalized;

      this.metrics?.increment('tienda.pedido.recibido.total', { project: project_slug });
      await this._publicarEvento('tienda.pedido.recibido', {
        project_slug,
        items_count: normalized.items.length,
        total_centimos: normalized.total_centimos,
        canal_origen: 'web',
        has_telefono: !!normalized.cliente_telefono,
        has_nombre: !!normalized.nombre_cliente
      }, { correlation_id });

      const request_id = crypto.randomUUID();
      const timeoutMs = this.config?.pedido_wait_timeout_ms || 30000;
      const timeoutHandle = setTimeout(() => this._handleTimeout(request_id), timeoutMs);
      if (timeoutHandle.unref) timeoutHandle.unref();

      this.pendingRequests.set(request_id, {
        project_slug,
        res,
        timeoutHandle,
        started_at: Date.now(),
        correlation_id,
        // Pago online opcional: si pago_online, tras crear el pedido se inicia el pago
        // en la pasarela y se devuelve checkout_url (en vez de solo código de recogida).
        pago_online: normalized.pago_online === true,
        return_url: typeof normalized.return_url === 'string' ? normalized.return_url : '',
        total_centimos: normalized.total_centimos
      });

      // Auto-wire de tools (tools.contract v1.2): el loader auto-subscribe el handler
      // de pizzepos/pedidos al evento `pedido.crear-tienda` y publica la response
      // como `pedido.crear-tienda.response` correlacionada por request_id.
      await this._publicarEvento('pedido.crear-tienda', {
        request_id,
        project_slug,
        items: normalized.items,
        total_centimos: normalized.total_centimos,
        canal_origen: 'web',
        cliente_telefono: normalized.cliente_telefono,
        nombre_cliente: normalized.nombre_cliente,
        mayor_edad_confirmado: normalized.mayor_edad_confirmado,
        expira_horas: normalized.expira_horas,
        notas_generales: normalized.notas_generales
      }, { correlation_id });
      // No respondemos aqui — la response llega por onPedidoCrearTiendaResponse o por timeout.
    } catch (err) {
      const errResp = this._handleHandlerError('tienda-api.pedido.error', err, 'http');
      try {
        await this._publicarEvento('tienda.pedido.fallido', {
          project_slug: project_slug || null,
          fase: 'bus_error',
          error: errResp.error
        }, { correlation_id });
      } catch (_publishErr) { /* ignore */ }
      return this._respondNow(res, errResp.status, errResp);
    }
  }

  async handlePedidoOptions(req, res) {
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (res && typeof res.status === 'function') {
      res.status(204).end();
    }
  }

  async handleHealthCheck(req, res) {
    const body = {
      module: this.name,
      version: this.version,
      requests_pendientes: this.pendingRequests.size
    };
    if (res && typeof res.status === 'function') {
      return res.status(200).json({ status: 'ok', ...body });
    }
    return { status: 200, data: body };
  }

  // ==========================================
  // Dominio protegido (correlation + timeout)
  // ==========================================

  _consumePending(request_id) {
    const pending = this.pendingRequests.get(request_id);
    if (!pending) return null;
    if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
    this.pendingRequests.delete(request_id);
    return pending;
  }

  _respondToClient(pending, status, body) {
    try {
      const res = pending?.res;
      if (!res || typeof res.status !== 'function') return;
      if (res.headersSent) {
        this.logger?.warn?.('tienda-api.response_after_headers_sent', {
          project_slug: pending.project_slug
        });
        return;
      }
      if (typeof res.setHeader === 'function') {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.status(status).json(body);
    } catch (err) {
      this.logger?.error?.('tienda-api.respond_error', { error: err?.message });
    }
  }

  _respondNow(res, status, body) {
    try {
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      if (res && typeof res.status === 'function' && !res.headersSent) {
        res.status(status).json(body);
      }
    } catch (_err) { /* ignore */ }
    return body;
  }

  _handleTimeout(request_id) {
    const pending = this._consumePending(request_id);
    if (!pending) return;
    const duration_ms = Date.now() - pending.started_at;
    this.logger?.warn?.('tienda-api.pedido.timeout', {
      request_id,
      project_slug: pending.project_slug,
      duration_ms
    });
    this.metrics?.increment('tienda.pedido.fallido.total', {
      project: pending.project_slug,
      fase: 'bus_timeout',
      code: 'UPSTREAM_TIMEOUT'
    });
    const timeoutError = {
      code: 'UPSTREAM_TIMEOUT',
      message: 'pedidos no respondio en el plazo configurado',
      details: { timeout_ms: this.config?.pedido_wait_timeout_ms || 30000 }
    };
    this._publicarEvento('tienda.pedido.fallido', {
      project_slug: pending.project_slug,
      fase: 'bus_timeout',
      error: timeoutError
    }, { correlation_id: pending.correlation_id }).catch(err => {
      this.logger?.error?.('tienda-api.publish_timeout_event_error', { error: err?.message });
    });
    this._respondToClient(pending, 504, { status: 504, error: timeoutError });
  }
}

module.exports = TiendaApiModule;
