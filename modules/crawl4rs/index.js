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

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// :8081 en el host — el :8080 local es de SearXNG (deployment/python-tools).
// El contenedor enki-crawl4rs (deployment/crawl4rs) publica 127.0.0.1:8081 → 8080 interno.
const DEFAULT_BASE = 'http://localhost:8081';
// La MARCHA LARGA vive en OTRO servicio: el wrapper Playwright (D-os
// bridge/playwright-wrapper) — POST /login → sesión, POST /abrir {sesion}. En el
// compose es http://browser:8100; en host, :8100. Es la puerta del login, NO el
// servidor axum (:8081), cuyo /crawl no conserva sesión.
const DEFAULT_PLAYWRIGHT = 'http://localhost:8100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Crawl4rsModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'crawl4rs';
    this.version = '0.4.0';
    this.activo = false;          // interruptor OFF por defecto (on-demand)
    this._baseUrl = DEFAULT_BASE;
    this._playwrightUrl = DEFAULT_PLAYWRIGHT;   // la marcha larga (wrapper Playwright)
    this._apiKey = null;
    this._timeoutMs = 120000;
    this._pollMs = 500;
    this._token = null;           // JWT cacheado
    this._maxDescargaBytes = 10 * 1024 * 1024;   // tope del binario que baja descargar (10 MB)
    // Almacén de sesiones de la marcha larga: el LLM recibe un sesion_id (handle);
    // el storageState (cookies + localStorage = SECRETO) se queda AQUÍ, nunca sale al bus.
    this._sesiones = new Map();   // sesion_id → { storageState, final_url, creada }
    this._sesionTtlMs = 30 * 60 * 1000;          // la sesión caduca a los 30 min
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config.crawl4rs))) || {};
    // Precedencia: env > config > default — el manifest siempre trae base_url,
    // así que el env solo manda si va primero (es el override por despliegue).
    this._baseUrl = String(process.env.CRAWL4RS_BASE_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._playwrightUrl = String(process.env.CRAWL4RS_PLAYWRIGHT_URL || cfg.playwright_url || DEFAULT_PLAYWRIGHT).replace(/\/+$/, '');
    this._apiKey = process.env.CRAWL4RS_API_KEY || cfg.api_key || null;
    this._timeoutMs = Number(cfg.timeout_ms) || 120000;
    this._maxDescargaBytes = Number(cfg.max_descarga_bytes) || 10 * 1024 * 1024;
    if (Number(cfg.sesion_ttl_ms) > 0) this._sesionTtlMs = Number(cfg.sesion_ttl_ms);
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
  onDescargarRequest(e){ return this._atender(e, 'descargar','crawl4rs.descargar.response',(d) => this._descargar(d)); }
  // marcha larga (login → sesión)
  onEntrarRequest(e)   { return this._atender(e, 'entrar',   'crawl4rs.entrar.response',   (d) => this._entrar(d)); }
  onAbrirRequest(e)    { return this._atender(e, 'abrir',    'crawl4rs.abrir.response',    (d) => this._abrir(d)); }

  // ── tool de chat ──
  async handleBuscarTool(args)    { return this._buscar(args || {}); }
  async handleLeerTool(args)      { return this._leer(args || {}); }
  async handleDescargarTool(args) { return this._descargar(args || {}); }
  async handleEntrarTool(args)    { return this._entrar(args || {}); }
  async handleAbrirTool(args)     { return this._abrir(args || {}); }

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
      auth_rechazada: 'el servidor Crawl4RS exige x-api-key (tiene CRAWL4RS_API_KEY configurada) y el puente no la tiene — ponla en el core (env CRAWL4RS_API_KEY) o retírala del contenedor. NO ES: motor caído ni throttle.',
      sin_marcha_larga: 'la marcha larga (wrapper Playwright) no responde en CRAWL4RS_PLAYWRIGHT_URL — verifica el servicio browser (docker) y su /health. La marcha larga es OTRO servicio que el axum :8081; sin ella hay leer/buscar/mapear/rastrear pero NO login. NO ES: web inscrapeable.'
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

  // ── descargar: una URL de recurso (imagen/pdf/asset) → BYTES (base64 + content_type).
  // El eslabón que faltaba entre leer_web (encuentra la url) y contenido.add_imagen (persiste
  // los bytes): antes el LLM tenía que curlear por el ejecutor (gated) y se atascaba. GET
  // directo del asset público; acota el tamaño; degrada honesto si la red falla. ──
  async _descargar(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    let r;
    try { r = await this._fetchBinario(String(input.url)); }
    catch (e) { return this._degradado(this._motivoDe(e)); }
    if (r.status === 413) return this._errorResponse(413, 'DEMASIADO_GRANDE', `el recurso supera el tope (${Math.round(this._maxDescargaBytes / 1024 / 1024)} MB)`, { url: input.url });
    if (r.status < 200 || r.status >= 300) return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'no se pudo descargar el recurso', { status: r.status, url: input.url });
    return { status: 200, data: { url: String(input.url), content_type: r.content_type, ext: r.ext, bytes: r.bytes, base64: r.base64 } };
  }

  // ── MARCHA LARGA: login → sesión (el wrapper Playwright, no el axum) ──
  // _entrar: ejecuta el guion de pasos (fill/click/wait/scroll) contra el
  // formulario, captura la sesión (storageState) y la GUARDA aquí. Devuelve al
  // LLM solo un sesion_id (handle) + final_url — NUNCA el storageState (secreto).
  async _entrar(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    if (!Array.isArray(input.pasos) || input.pasos.length === 0) return this._invalid('pasos');
    const payload = {
      url: String(input.url),
      pasos: input.pasos,
      ...(input.stealth ? { stealth: true } : {}),
      ...(input.emular ? { emular: input.emular } : {}),
      ...(input.proxy ? { proxy: input.proxy } : {})
    };
    let r;
    try { r = await this._playwrightCall('/login', payload); }
    catch (_) { return this._degradado('sin_marcha_larga'); }
    // El wrapper NUNCA inventa: si un paso falla responde { fallo:{tipo,motivo} }.
    if (r.body && r.body.fallo) {
      const f = r.body.fallo;
      return this._errorResponse(f.tipo === 'timeout' ? 504 : 502, 'LOGIN_FALLIDO', `el login no cuajó: ${f.motivo || f.tipo}`, { fallo: f });
    }
    if (r.status < 200 || r.status >= 300 || !r.body || r.body.sesion == null) {
      return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'la marcha larga no devolvió sesión', { status: r.status });
    }
    const sesion_id = this._guardarSesion(r.body.sesion, r.body.final_url);
    return { status: 200, data: { sesion_id, final_url: r.body.final_url || String(input.url), expira_en_ms: this._sesionTtlMs } };
  }

  // _abrir: abre una URL YA autenticado, reusando la sesión guardada. Admite
  // interactuar (revelar) e interceptar (capturar el JSON de la API interna — la
  // jugada de precios). El storageState se inyecta AQUÍ desde el sesion_id.
  async _abrir(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    if (!input.sesion_id) return this._invalid('sesion_id');
    const storageState = this._leerSesion(input.sesion_id);
    if (storageState == null) {
      return this._errorResponse(409, 'SESION_DESCONOCIDA', 'ese sesion_id no existe o caducó — vuelve a entrar (crawl4rs.entrar) para renovar la sesión', { sesion_id: input.sesion_id });
    }
    const payload = {
      url: String(input.url),
      sesion: storageState,
      ...(input.interactuar ? { interactuar: input.interactuar } : {}),
      ...(input.interceptar ? { interceptar: input.interceptar } : {}),
      ...(input.stealth ? { stealth: true } : {}),
      ...(input.emular ? { emular: input.emular } : {}),
      ...(input.proxy ? { proxy: input.proxy } : {})
    };
    let r;
    try { r = await this._playwrightCall('/abrir', payload); }
    catch (_) { return this._degradado('sin_marcha_larga'); }
    if (r.body && r.body.fallo) {
      const f = r.body.fallo;
      return this._errorResponse(f.tipo === 'timeout' ? 504 : 502, 'UPSTREAM_INVALID_RESPONSE', `no se pudo abrir: ${f.motivo || f.tipo}`, { fallo: f });
    }
    if (r.status < 200 || r.status >= 300 || !r.body) {
      return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'la marcha larga rechazó la petición', { status: r.status });
    }
    return { status: 200, data: {
      html: r.body.html || '',
      final_url: r.body.final_url || String(input.url),
      status_http: r.body.status ?? null,
      intercepted: Array.isArray(r.body.intercepted) ? r.body.intercepted : []
    } };
  }

  // Guarda una sesión y devuelve su handle. Purga las caducadas de paso.
  _guardarSesion(storageState, final_url) {
    this._purgarSesiones();
    const sesion_id = 'ses_' + crypto.randomUUID();
    this._sesiones.set(sesion_id, { storageState, final_url, creada: Date.now() });
    return sesion_id;
  }
  // Devuelve el storageState de un handle vivo (o null si no existe/caducó).
  _leerSesion(sesion_id) {
    const s = this._sesiones.get(sesion_id);
    if (!s) return null;
    if (Date.now() - s.creada > this._sesionTtlMs) { this._sesiones.delete(sesion_id); return null; }
    return s.storageState;
  }
  _purgarSesiones() {
    const ahora = Date.now();
    for (const [k, s] of this._sesiones) if (ahora - s.creada > this._sesionTtlMs) this._sesiones.delete(k);
  }

  // POST al wrapper Playwright (otro servicio, sin JWT). Overridable en test.
  async _playwrightCall(path, payload) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const resp = await fetch(this._playwrightUrl + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      const text = await resp.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
      return { status: resp.status, body: parsed };
    } finally { clearTimeout(to); }
  }

  // GET binario directo (fetch global). Overridable en test. NO throw por tamaño (→ 413).
  async _fetchBinario(url) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const resp = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
      if (resp.status < 200 || resp.status >= 300) return { status: resp.status };
      const ab = await resp.arrayBuffer();
      if (ab.byteLength > this._maxDescargaBytes) return { status: 413 };
      const ct = resp.headers.get('content-type') || 'application/octet-stream';
      return { status: 200, content_type: ct, ext: this._extDe(ct, url), bytes: ab.byteLength, base64: Buffer.from(ab).toString('base64') };
    } finally { clearTimeout(to); }
  }

  // extensión canónica desde el content-type (o la url como respaldo).
  _extDe(contentType, url) {
    const ct = String(contentType || '').toLowerCase();
    const map = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' };
    for (const k of Object.keys(map)) if (ct.includes(k)) return map[k];
    const m = String(url || '').match(/\.([a-z0-9]{2,4})(?:[?#]|$)/i);
    return m ? m[1].toLowerCase() : 'bin';
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
