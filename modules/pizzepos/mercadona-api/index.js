/**
 * mercadona-api v1.0.0 — POC2 canonico.
 *
 * Cliente HTTP no oficial de tienda.mercadona.es. Provee precios y catalogo
 * de productos del supermercado al subsistema-recetario (consumidor principal:
 * el blueprint de escandallo cuando estime coste de receta).
 *
 * Infraestructura JS deterministica — NO blueprint. IO HTTP externa, latencia
 * <1s requerida, sin razonamiento del dominio. La API no es oficial y puede
 * cambiar sin aviso: el parsing del JSON externo esta aislado en _parseProducto
 * y _parseCategoria para que un cambio de shape solo afecte dos funciones.
 *
 * Cache in-memory con TTL configurable (default 48h). Throttle interno
 * max N req/s (default 2) con backoff exponencial sobre HTTP 429.
 */

'use strict';

const BaseModule = require('../../_shared/base-module');

class MercadonaApiModule extends BaseModule {
  constructor() {
    super();
    this.name = 'mercadona-api';
    this.version = '1.0.0';

    // Config (sobrescrita en onLoad desde module.json.config si se expone)
    this.config = {
      postcode_default: '30840',
      warehouse_default: null,
      cache_ttl_hours: 48,
      throttle_rps: 2,
      base_url: 'https://tienda.mercadona.es/api',
      timeout_ms: 10000,
      max_retries: 2
    };

    // Estado runtime
    this.projectMeta = new Map();    // project_id -> { postcode?, base_path }
    this._lastActiveProjectId = null;
    this._cache = new Map();         // cacheKey -> { data, expiresAt }
    this._throttleQueue = [];        // [{run, resolve, reject}]
    this._throttleTimer = null;
    this._throttleInflight = 0;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    if (context.config && typeof context.config === 'object') {
      Object.assign(this.config, context.config);
    }
    this.logger?.info?.('module.loaded', {
      module: this.name,
      version: this.version,
      postcode_default: this.config.postcode_default,
      cache_ttl_hours: this.config.cache_ttl_hours,
      throttle_rps: this.config.throttle_rps
    });
  }

  async onUnload() {
    this._cache.clear();
    this._throttleQueue = [];
    if (this._throttleTimer) {
      clearInterval(this._throttleTimer);
      this._throttleTimer = null;
    }
    this.projectMeta.clear();
    this._lastActiveProjectId = null;
    this.logger?.info?.('module.unloaded', { module: this.name });
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
    const upstream = err?._upstream_code;
    if (upstream) return { status: this._statusForCode(upstream), code: upstream };
    if (/required|invalid|missing|requerido|debe ser/i.test(msg)) {
      return { status: 400, code: 'INVALID_INPUT' };
    }
    if (/not found|no encontrado|404/i.test(msg)) {
      return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    }
    if (/timeout/i.test(msg)) {
      return { status: 504, code: 'UPSTREAM_TIMEOUT' };
    }
    if (/rate.?limit|429/i.test(msg)) {
      return { status: 429, code: 'RATE_LIMITED' };
    }
    if (/network|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(msg)) {
      return { status: 503, code: 'UPSTREAM_UNREACHABLE' };
    }
    if (/JSON|shape|parseable|inesperado/i.test(msg)) {
      return { status: 502, code: 'UPSTREAM_INVALID_RESPONSE' };
    }
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _statusForCode(code) {
    const map = {
      INVALID_INPUT: 400,
      RESOURCE_NOT_FOUND: 404,
      RATE_LIMITED: 429,
      UPSTREAM_TIMEOUT: 504,
      UPSTREAM_UNREACHABLE: 503,
      UPSTREAM_INVALID_RESPONSE: 502,
      UNKNOWN_ERROR: 500
    };
    return map[code] || 500;
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('mercadona.upstream.errors', { code });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    await this.eventBus.publish(name, enriched);
    return enriched;
  }

  // ==========================================
  // Cache + Throttle
  // ==========================================

  _cacheKey(operation, params) {
    return `${operation}:${JSON.stringify(params)}`;
  }

  _cacheGet(key) {
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this._cache.delete(key);
      return null;
    }
    return entry.data;
  }

  _cacheSet(key, data) {
    const ttlMs = this.config.cache_ttl_hours * 3600 * 1000;
    this._cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  _scheduleThrottle() {
    if (this._throttleTimer) return;
    const intervalMs = Math.max(1, Math.floor(1000 / this.config.throttle_rps));
    this._throttleTimer = setInterval(() => {
      if (this._throttleQueue.length === 0) {
        clearInterval(this._throttleTimer);
        this._throttleTimer = null;
        return;
      }
      const next = this._throttleQueue.shift();
      this._throttleInflight++;
      Promise.resolve(next.run())
        .then(r => { this._throttleInflight--; next.resolve(r); })
        .catch(e => { this._throttleInflight--; next.reject(e); });
    }, intervalMs);
  }

  _throttledRequest(runFn) {
    return new Promise((resolve, reject) => {
      this._throttleQueue.push({ run: runFn, resolve, reject });
      this.metrics?.increment?.('mercadona.throttle.queued');
      this._scheduleThrottle();
    });
  }

  // ==========================================
  // HTTP helpers
  // ==========================================

  _buildUrl(pathSegment, postcode) {
    const base = this.config.base_url.replace(/\/+$/, '');
    const clean = pathSegment.replace(/^\/+/, '');
    const url = new URL(`${base}/${clean}`);
    url.searchParams.set('lang', 'es');
    if (postcode) url.searchParams.set('wh', postcode);
    return url.toString();
  }

  async _fetchJson(url, attempt = 0) {
    return this._throttledRequest(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout_ms);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json', 'User-Agent': '2enki/mercadona-api' }
        });
        clearTimeout(timeoutId);
        if (res.status === 429) {
          if (attempt < this.config.max_retries) {
            const backoffMs = Math.pow(2, attempt) * 1000;
            await new Promise(r => setTimeout(r, backoffMs));
            return this._fetchJson(url, attempt + 1);
          }
          const err = new Error(`Rate limited tras ${this.config.max_retries} reintentos`);
          err._upstream_code = 'RATE_LIMITED';
          throw err;
        }
        if (res.status === 404) {
          const err = new Error(`Recurso no encontrado: ${url}`);
          err._upstream_code = 'RESOURCE_NOT_FOUND';
          throw err;
        }
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status} de Mercadona`);
          err._upstream_code = res.status >= 500 ? 'UPSTREAM_UNREACHABLE' : 'UPSTREAM_INVALID_RESPONSE';
          throw err;
        }
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch (_) {
          const err = new Error('Respuesta de Mercadona no es JSON parseable');
          err._upstream_code = 'UPSTREAM_INVALID_RESPONSE';
          throw err;
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          const e = new Error(`Timeout ${this.config.timeout_ms}ms contactando Mercadona`);
          e._upstream_code = 'UPSTREAM_TIMEOUT';
          throw e;
        }
        if (err._upstream_code) throw err;
        const e = new Error(`Fallo de red contactando Mercadona: ${err.message}`);
        e._upstream_code = 'UPSTREAM_UNREACHABLE';
        throw e;
      }
    });
  }

  // ==========================================
  // Parsers (aislan el contrato externo del interno)
  // ==========================================

  _parseProducto(raw) {
    if (!raw || typeof raw !== 'object') {
      const err = new Error('Producto: shape inesperado (no objeto)');
      err._upstream_code = 'UPSTREAM_INVALID_RESPONSE';
      throw err;
    }
    const priceInstr = raw.price_instructions || {};
    return {
      producto_id: String(raw.id || ''),
      nombre: raw.display_name || raw.name || '',
      marca: raw.brand || null,
      formato: raw.packaging || priceInstr.size_format || null,
      precio_unidad: this._toNumberOrNull(priceInstr.unit_price),
      precio_kg: this._toNumberOrNull(priceInstr.bulk_price),
      precio_referencia: this._toNumberOrNull(priceInstr.reference_price),
      unidad_referencia: priceInstr.reference_format || null,
      imagen_url: raw.thumbnail || raw.photos?.[0]?.regular || null,
      categoria_id: raw.categories?.[0]?.id ? String(raw.categories[0].id) : null,
      disponible: raw.published !== false
    };
  }

  _parseCategoria(raw) {
    if (!raw || typeof raw !== 'object') {
      const err = new Error('Categoria: shape inesperado (no objeto)');
      err._upstream_code = 'UPSTREAM_INVALID_RESPONSE';
      throw err;
    }
    const result = {
      categoria_id: String(raw.id || ''),
      nombre: raw.name || '',
      orden: typeof raw.order === 'number' ? raw.order : null,
      subcategorias: Array.isArray(raw.categories)
        ? raw.categories.map(c => this._parseCategoria(c))
        : []
    };
    if (Array.isArray(raw.products)) {
      result.productos = raw.products.map(p => ({
        producto_id: String(p.id || ''),
        nombre: p.display_name || p.name || '',
        marca: p.brand || null,
        thumbnail: p.thumbnail || null
      }));
    }
    return result;
  }

  _toNumberOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  // ==========================================
  // Project Lifecycle
  // ==========================================

  async onProjectActivated(event) {
    const data = event?.data || event || {};
    const { project_id, base_path, metadata } = data;
    if (!project_id) return;
    const postcode = metadata?.postcode || metadata?.codigo_postal || null;
    this.projectMeta.set(project_id, { postcode, base_path });
    this._lastActiveProjectId = project_id;
  }

  async onProjectDeactivated() {
    // No-op multi-tenant: preserva projectMeta en memoria.
  }

  // ==========================================
  // Bus Handlers
  // ==========================================

  async onProductoObtener(event) {
    const t0 = Date.now();
    const data = event?.data || event || {};
    const { producto_id, postcode, project_id, request_id } = data;
    const responseEvent = 'mercadona.producto.obtener.response';
    const failedEvent = 'mercadona.producto.obtener.failed';

    if (!producto_id || typeof producto_id !== 'string' || !/^\d+$/.test(producto_id)) {
      const errResp = this._errorResponse(400, 'INVALID_INPUT', 'producto_id es obligatorio (string numerico)', { field: 'producto_id' });
      await this._publicarEvento(failedEvent, { request_id, project_id, ...errResp }, data);
      return errResp;
    }

    const pc = postcode || this._resolvePostcode(project_id);
    const cacheKey = this._cacheKey('producto', { producto_id, postcode: pc });
    const cached = this._cacheGet(cacheKey);
    if (cached) {
      this.metrics?.increment?.('mercadona.cache.hit', { operation: 'producto' });
      const resp = { status: 200, data: cached };
      await this._publicarEvento(responseEvent, { request_id, project_id, ...resp }, data);
      return resp;
    }
    this.metrics?.increment?.('mercadona.cache.miss', { operation: 'producto' });

    try {
      const url = this._buildUrl(`products/${producto_id}/`, pc);
      const raw = await this._fetchJson(url);
      const producto = this._parseProducto(raw);
      this._cacheSet(cacheKey, producto);

      this.metrics?.increment?.('mercadona.producto.obtener.total', { project_id, status: 'ok' });
      this.metrics?.observe?.('mercadona.producto.obtener.duration_ms', Date.now() - t0, { project_id });

      const resp = { status: 200, data: producto };
      await this._publicarEvento(responseEvent, { request_id, project_id, ...resp }, data);
      if (producto.precio_unidad !== null || producto.precio_kg !== null) {
        await this._publicarEvento('mercadona.precio.obtenido', {
          producto_id: producto.producto_id,
          nombre: producto.nombre,
          marca: producto.marca,
          formato: producto.formato,
          precio_unidad: producto.precio_unidad,
          precio_kg: producto.precio_kg,
          postcode: pc,
          project_id
        }, data);
      }
      return resp;
    } catch (err) {
      this.metrics?.increment?.('mercadona.producto.obtener.total', { project_id, status: 'error' });
      const errResp = this._handleHandlerError('mercadona.producto.obtener.error', err);
      await this._publicarEvento(failedEvent, { request_id, project_id, ...errResp }, data);
      return errResp;
    }
  }

  async onCategoriasListar(event) {
    const t0 = Date.now();
    const data = event?.data || event || {};
    const { parent_id, postcode, project_id, request_id } = data;
    const responseEvent = 'mercadona.categorias.listar.response';
    const failedEvent = 'mercadona.categorias.listar.failed';

    if (parent_id !== undefined && parent_id !== null) {
      if (typeof parent_id !== 'string' || !/^\d+$/.test(parent_id)) {
        const errResp = this._errorResponse(400, 'INVALID_INPUT', 'parent_id debe ser string numerico si se proporciona', { field: 'parent_id' });
        await this._publicarEvento(failedEvent, { request_id, project_id, ...errResp }, data);
        return errResp;
      }
    }

    const pc = postcode || this._resolvePostcode(project_id);
    const cacheKey = this._cacheKey('categorias', { parent_id: parent_id || null, postcode: pc });
    const cached = this._cacheGet(cacheKey);
    if (cached) {
      this.metrics?.increment?.('mercadona.cache.hit', { operation: 'categorias' });
      const resp = { status: 200, data: cached };
      await this._publicarEvento(responseEvent, { request_id, project_id, ...resp }, data);
      return resp;
    }
    this.metrics?.increment?.('mercadona.cache.miss', { operation: 'categorias' });

    try {
      const pathSeg = parent_id ? `categories/${parent_id}/` : 'categories/';
      const url = this._buildUrl(pathSeg, pc);
      const raw = await this._fetchJson(url);
      let categorias;
      if (parent_id) {
        categorias = this._parseCategoria(raw);
      } else {
        const results = raw?.results || raw?.categories || [];
        if (!Array.isArray(results)) {
          const err = new Error('Lista de categorias: shape inesperado (esperado array en results/categories)');
          err._upstream_code = 'UPSTREAM_INVALID_RESPONSE';
          throw err;
        }
        categorias = results.map(c => this._parseCategoria(c));
      }
      this._cacheSet(cacheKey, categorias);

      this.metrics?.increment?.('mercadona.categorias.listar.total', { project_id, status: 'ok' });
      this.metrics?.observe?.('mercadona.categorias.listar.duration_ms', Date.now() - t0, { project_id });

      const resp = { status: 200, data: categorias };
      await this._publicarEvento(responseEvent, { request_id, project_id, ...resp }, data);
      return resp;
    } catch (err) {
      this.metrics?.increment?.('mercadona.categorias.listar.total', { project_id, status: 'error' });
      const errResp = this._handleHandlerError('mercadona.categorias.listar.error', err);
      await this._publicarEvento(failedEvent, { request_id, project_id, ...errResp }, data);
      return errResp;
    }
  }

  // ==========================================
  // Internos
  // ==========================================

  _resolvePostcode(project_id) {
    if (project_id && this.projectMeta.has(project_id)) {
      const meta = this.projectMeta.get(project_id);
      if (meta.postcode) return meta.postcode;
    }
    if (this._lastActiveProjectId && this.projectMeta.has(this._lastActiveProjectId)) {
      const meta = this.projectMeta.get(this._lastActiveProjectId);
      if (meta.postcode) return meta.postcode;
    }
    return this.config.postcode_default;
  }
}

module.exports = MercadonaApiModule;
