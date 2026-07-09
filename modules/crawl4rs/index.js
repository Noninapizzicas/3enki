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

// :8081 en el host — el :8080 local es de SearXNG (deployment/python-tools).
// El contenedor enki-crawl4rs (deployment/crawl4rs) publica 127.0.0.1:8081 → 8080 interno.
const DEFAULT_BASE = 'http://localhost:8081';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Crawl4rsModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'crawl4rs';
    this.version = '0.2.1';
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
    // Precedencia: env > config > default — el manifest siempre trae base_url,
    // así que el env solo manda si va primero (es el override por despliegue).
    this._baseUrl = String(process.env.CRAWL4RS_BASE_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._apiKey = process.env.CRAWL4RS_API_KEY || cfg.api_key || null;
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
  onBuscarRequest(e)   { return this._atender(e, 'buscar',   'crawl4rs.buscar.response',   (d) => this._buscar(d)); }
  onMapearRequest(e)   { return this._atender(e, 'mapear',   'crawl4rs.mapear.response',   (d) => this._mapear(d)); }

  // ── tool de chat ──
  async handleLeerTool(args) { return this._leer(args || {}); }

  // ── guardas ──
  _guard() {
    if (!this.activo) return this._degradado('apagado');
    return null;
  }
  _degradado(motivo) {
    // Error fértil: la prescripción viaja en message (la única capa que todo transporte preserva).
    const prescripcion = {
      apagado: 'el interruptor crawl4rs está OFF — enciéndelo en el panel (grupo sistema). NO ES: motor caído.',
      sin_servicio: 'el contenedor enki-crawl4rs no responde en :8081 — verifica docker ps y /health. NO ES: web inscrapeable.',
      auth_rechazada: 'el servidor Crawl4RS exige x-api-key (tiene CRAWL4RS_API_KEY configurada) y el puente no la tiene — ponla en el core (env CRAWL4RS_API_KEY) o retírala del contenedor. NO ES: motor caído ni throttle.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `crawl4rs degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }
  _motivoDe(err) { return err && err.code === 'AUTH' ? 'auth_rechazada' : 'sin_servicio'; }

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

  // ── buscar: búsqueda web (POST /search → SearXNG detrás del servidor) ──
  async _buscar(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.query) return this._invalid('query');
    const r = await this._directo('POST', '/search', {
      query: String(input.query),
      limit: Number.isInteger(input.limit) ? input.limit : 10
    });
    if (r.error) return r;
    const lista = Array.isArray(r.body) ? r.body : [];
    return { status: 200, data: {
      resultados: lista.map((x) => ({ titulo: x.title, url: x.url, resumen: x.snippet })),
      total: lista.length
    } };
  }

  // ── mapear: enlaces de una página, sin contenido (POST /map) ──
  async _mapear(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    const r = await this._directo('POST', '/map', {
      url: String(input.url), ...(input.mode ? { mode: input.mode } : {})
    });
    if (r.error) return r;
    const body = r.body || {};
    const enlaces = Array.isArray(body.links) ? body.links : [];
    return { status: 200, data: { url: body.url || String(input.url), enlaces, total: enlaces.length } };
  }

  // ── endpoint directo (sin job): token → llamada, retry tras 401 ──
  async _directo(method, path, payload) {
    let token;
    try { token = await this._ensureToken(); }
    catch (e) { return this._degradado(this._motivoDe(e)); }
    let r;
    try {
      r = await this._http(method, path, payload, token);
      if (r.status === 401) { this._token = null; token = await this._ensureToken(); r = await this._http(method, path, payload, token); }
    } catch (e) { return this._degradado(this._motivoDe(e)); }
    if (r.status < 200 || r.status >= 300) {
      // El servidor responde texto prescriptivo (p.ej. "search no disponible:
      // define SEARXNG_URL") — viaja en message, la única capa que todo transporte preserva.
      const msg = (typeof r.body === 'string' && r.body) ? r.body : 'crawl4rs rechazó la petición';
      const code = r.status === 503 ? 'UPSTREAM_UNREACHABLE' : 'UPSTREAM_INVALID_RESPONSE';
      return this._errorResponse(r.status >= 400 ? r.status : 502, code, msg, { status: r.status });
    }
    return { body: r.body };
  }

  // ── el flujo job-based: token → submit → poll → result ──
  async _crawl(body) {
    // 1. token (refrescable)
    let token;
    try { token = await this._ensureToken(); }
    catch (e) { return this._degradado(this._motivoDe(e)); }

    // 2. submit (con un reintento tras 401 → token caducado)
    let id;
    try {
      let r = await this._http('POST', '/crawl', body, token);
      if (r.status === 401) { this._token = null; token = await this._ensureToken(); r = await this._http('POST', '/crawl', body, token); }
      if (r.status >= 200 && r.status < 300) id = r.body && r.body.id;
      else return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'crawl4rs rechazó la petición', { status: r.status });
    } catch (e) { return this._degradado(this._motivoDe(e)); }
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
    const err = new Error('auth failed ' + r.status);
    // 401/403 = el servidor RESPONDE pero rechaza: es auth, no caída — el motivo debe distinguirse.
    if (r.status === 401 || r.status === 403) err.code = 'AUTH';
    throw err;
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
