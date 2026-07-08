'use strict';

/**
 * crawl4rs — el PUENTE a Crawl4RS (D-os): crawler Rust self-hosted (navegador real
 * Chromium/CDP + stealth + extracción), envuelto como órgano del bus.
 *
 * Crawl4RS habla HTTP (servidor axum, job-based). Este reflejo traduce el bus ↔ HTTP:
 *   bus  crawl4rs.leer.request {url}      → POST /crawl → poll → GET result → markdown
 *   bus  crawl4rs.rastrear.request {url}  → crawl profundo BFS/DFS
 * y una tool de chat `leer_web`. Cierra el "rechinar" de que el crawler no hablara el
 * bus: desde Enki se publica al bus; el HTTP vive escondido en el contenedor.
 *
 * DISCIPLINA (patrón Enki):
 *   - NACE OFF (interruptor 'crawl4rs', grupo 'sistema'). El servicio corre ON-DEMAND;
 *     encender el puente es decisión consciente.
 *   - DEGRADA HONESTO: interruptor OFF, o servicio no alcanzable → 503 {degradado, motivo}.
 *     Nunca finge un resultado ni revienta el sistema.
 *   - AUTH: /crawl va tras JWT; el token se obtiene de POST /auth/token (libre si el
 *     servidor no configura api_key) y se cachea, refrescándose ante un 401.
 *
 * NOTA: el `stealth` NO es per-petición — es config de arranque del servidor Crawl4RS
 * (`crawl4rs serve` con stealth). Aquí solo se pide el crawl; el contenedor decide.
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const DEFAULT_BASE = 'http://localhost:8080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Crawl4rsModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'crawl4rs';
    this.version = '0.1.0';
    this.activo = false;          // interruptor OFF por defecto (on-demand)
    this._baseUrl = DEFAULT_BASE;
    this._apiKey = null;
    this._timeoutMs = 120000;
    this._pollMs = 500;
    this._token = null;           // JWT cacheado
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config.crawl4rs))) || {};
    this._baseUrl = String(cfg.base_url || process.env.CRAWL4RS_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
    this._apiKey = cfg.api_key || process.env.CRAWL4RS_API_KEY || null;
    this._timeoutMs = Number(cfg.timeout_ms) || 120000;
    this._registrarBoton();
    this.logger?.info('crawl4rs.loaded', { base_url: this._baseUrl, activo: this.activo });
  }

  // ── interruptor ──
  _registrarBoton() {
    try {
      this.eventBus?.publish?.('interruptor.registrar', {
        id: 'crawl4rs',
        label: 'Crawl4RS (leer/rastrear web · navegador+stealth)',
        grupo: 'sistema',
        descripcion: 'Puente al servicio Crawl4RS (Rust, navegador real + stealth) por HTTP. Lee una URL o rastrea un sitio → markdown limpio + extracción. OFF = apagado (el servicio corre on-demand). Degrada honesto si no está.',
        default: false
      });
    } catch (_) { /* best-effort */ }
  }
  onSolicitarRegistro() { this._registrarBoton(); }
  onInterruptorCambiado(event) {
    const d = (event && event.data) || event || {};
    if (d.id === 'crawl4rs') {
      this.activo = !!d.enabled;
      this.logger?.info?.('crawl4rs.toggled', { activo: this.activo });
    }
  }

  // ── RPC del bus ──
  onLeerRequest(e)     { return this._atender(e, 'leer',     'crawl4rs.leer.response',     (d) => this._leer(d)); }
  onRastrearRequest(e) { return this._atender(e, 'rastrear', 'crawl4rs.rastrear.response', (d) => this._rastrear(d)); }

  // ── tool de chat ──
  async handleLeerTool(args) { return this._leer(args || {}); }

  // ── guardas ──
  _guard() {
    if (!this.activo) return this._degradado('apagado');
    return null;
  }
  _degradado(motivo) {
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `crawl4rs degradado: ${motivo}`, details: { degradado: true, motivo } } };
  }

  // ── leer: una URL → markdown (+extracción opcional) ──
  async _leer(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    return this._crawl({
      url: String(input.url), query: input.query || undefined,
      max_depth: 0, max_pages: 1,
      extract_css: input.extract_css || {}, extract_semantic: !!input.extract_semantic
    });
  }

  // ── rastrear: crawl profundo BFS/DFS ──
  async _rastrear(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    return this._crawl({
      url: String(input.url), query: input.query || undefined,
      max_depth: Number.isInteger(input.max_depth) ? input.max_depth : 2,
      max_pages: Number.isInteger(input.max_pages) ? input.max_pages : 25,
      cross_domain: !!input.cross_domain,
      extract_css: input.extract_css || {}, extract_semantic: !!input.extract_semantic
    });
  }

  // ── el flujo job-based: token → submit → poll → result ──
  async _crawl(body) {
    // 1. token (refrescable)
    let token;
    try { token = await this._ensureToken(); }
    catch (_) { return this._degradado('sin_servicio'); }

    // 2. submit (con un reintento tras 401 → token caducado)
    let id;
    try {
      let r = await this._http('POST', '/crawl', body, token);
      if (r.status === 401) { this._token = null; token = await this._ensureToken(); r = await this._http('POST', '/crawl', body, token); }
      if (r.status >= 200 && r.status < 300) id = r.body && r.body.id;
      else return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'crawl4rs rechazó la petición', { status: r.status });
    } catch (_) { return this._degradado('sin_servicio'); }
    if (!id) return this._degradado('sin_id');

    // 3. poll hasta done/failed (acotado por timeout)
    const started = Date.now();
    let estado = 'queued';
    while (Date.now() - started < this._timeoutMs) {
      await sleep(this._pollMs);
      let st;
      try { st = await this._http('GET', `/crawl/${id}/status`, null, token); }
      catch (_) { return this._degradado('sin_servicio'); }
      estado = st.body && st.body.state;
      if (estado === 'done') break;
      if (estado === 'failed') return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'el crawl falló', { error: st.body && st.body.error });
    }
    if (estado !== 'done') return this._errorResponse(504, 'UPSTREAM_TIMEOUT', 'el crawl no terminó a tiempo', { timeout_ms: this._timeoutMs });

    // 4. result → proyección al bus
    let res;
    try { res = await this._http('GET', `/crawl/${id}/result`, null, token); }
    catch (_) { return this._degradado('sin_servicio'); }
    const pages = (res.body && (res.body.pages || res.body)) || [];
    const lista = Array.isArray(pages) ? pages : [];
    const first = lista[0] || null;
    return { status: 200, data: {
      markdown: (first && first.fit_markdown) || '',
      extraido: (first && (first.extracted ?? null)),
      paginas: lista.map((p) => ({ url: p.url, markdown: p.fit_markdown, extraido: p.extracted ?? null })),
      total: lista.length
    } };
  }

  // ── token: POST /auth/token (x-api-key opcional), cacheado ──
  async _ensureToken() {
    if (this._token) return this._token;
    const headers = this._apiKey ? { 'x-api-key': this._apiKey } : {};
    const r = await this._http('POST', '/auth/token', {}, null, headers);
    if (r.status >= 200 && r.status < 300 && r.body && r.body.token) { this._token = r.body.token; return this._token; }
    throw new Error('auth failed ' + r.status);
  }

  // ── HTTP (fetch global, node ≥18). Overridable en test. ──
  async _http(method, path, body, token, extraHeaders) {
    const headers = { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(extraHeaders || {}) };
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const resp = await fetch(this._baseUrl + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      const text = await resp.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
      return { status: resp.status, body: parsed };
    } finally { clearTimeout(to); }
  }
}

module.exports = Crawl4rsModule;
