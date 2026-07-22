'use strict';

/**
 * crawl4rs — el ÓRGANO WEB de Enki, NATIVO sobre OBSCURA (navegador Rust, CDP).
 *
 * Antes vivía en el repo hermano D-os (Docker + Chromium + un wrapper Playwright
 * aparte). Se CENTRALIZÓ en Enki: como obscura (navegador headless en Rust, sin
 * Chromium, stealth) ya corre en :9222, este módulo la conduce por CDP con
 * puppeteer-core — el mismo patrón que verificador-visual. Adiós al contenedor D-os.
 *
 * Reparto de las 7 puertas del contrato (idéntico al de antes → drop-in):
 *   leer · rastrear · mapear   → OBSCURA por CDP (render real + extracción)
 *   entrar · abrir (login)     → OBSCURA por CDP (cookies/localStorage = storageState)
 *   buscar                     → SearXNG directo (HTTP; ya provisionado en Enki)
 *   descargar                  → fetch binario plano (ni navegador hace falta)
 *
 * DISCIPLINA (patrón Enki):
 *   - NACE OFF (interruptor 'crawl4rs', grupo 'sistema'). El botón aquí SÍ protege un
 *     estado real: EGRESS a la web (salir a internet) — se queda (excepción sin-botón).
 *   - DEGRADA HONESTO: interruptor OFF → 503 apagado; obscura no responde → 503
 *     sin_navegador; SearXNG caído → 503 sin_busqueda. Nunca finge un resultado.
 *
 * Seams del navegador (aislados y overridables → el resto es lógica pura testeable):
 *   _render(url, opts)          una página en obscura → { html, markdown, enlaces, ... }
 *   _ejecutarLogin(url, pasos)  el guion de login en obscura → { storageState, final_url }
 *   _buscarSearx(query, limit)  SearXNG → resultados
 *   _fetchBinario(url)          GET binario (descargar)
 */

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// obscura por CDP (navegador Rust nativo, :9222). Compartida con verificador-visual.
const OBSCURA_DEFAULT = 'ws://127.0.0.1:9222/devtools/browser';
// SearXNG (búsqueda) — su propio contenedor en Enki (deployment/python-tools), :8080.
const SEARXNG_DEFAULT = 'http://localhost:8080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Crawl4rsModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'crawl4rs';
    this.version = '0.5.0';
    this.activo = false;          // interruptor OFF por defecto (egress consciente)
    this._obscura = OBSCURA_DEFAULT;
    this._searxng = SEARXNG_DEFAULT;
    this._timeoutMs = 120000;
    this._maxDescargaBytes = 10 * 1024 * 1024;   // tope del binario que baja descargar (10 MB)
    // Sesiones de la marcha larga: el LLM recibe un sesion_id (handle); el storageState
    // (cookies + localStorage = SECRETO) se queda AQUÍ, nunca sale al bus.
    this._sesiones = new Map();   // sesion_id → { storageState, final_url, creada }
    this._sesionTtlMs = 30 * 60 * 1000;          // la sesión caduca a los 30 min
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config.crawl4rs))) || {};
    this._obscura = String(process.env.CRAWL4RS_OBSCURA_URL || cfg.obscura_url || OBSCURA_DEFAULT);
    this._searxng = String(process.env.SEARXNG_URL || cfg.searxng_url || SEARXNG_DEFAULT).replace(/\/+$/, '');
    this._timeoutMs = Number(cfg.timeout_ms) || 120000;
    this._maxDescargaBytes = Number(cfg.max_descarga_bytes) || 10 * 1024 * 1024;
    if (Number(cfg.sesion_ttl_ms) > 0) this._sesionTtlMs = Number(cfg.sesion_ttl_ms);
    this._registrarBoton();
    this.logger?.info('crawl4rs.loaded', { obscura: this._obscura, searxng: this._searxng, activo: this.activo });
  }

  // ── interruptor (el botón protege el EGRESS a la web → se queda) ──
  _registrarBoton() {
    try {
      this.eventBus?.publish?.('interruptor.registrar', {
        id: 'crawl4rs',
        label: 'Crawl4RS (leer/rastrear web · obscura + stealth)',
        grupo: 'sistema',
        descripcion: 'Órgano web de Enki sobre obscura (navegador Rust nativo, sin Chromium). Lee/rastrea/mapea una URL → markdown + enlaces; busca (SearXNG); login (marcha larga). OFF = sin salir a internet. Degrada honesto si obscura no responde.',
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
    const prescripcion = {
      apagado: 'el interruptor crawl4rs está OFF — enciéndelo en el panel (grupo sistema). NO ES: motor caído.',
      sin_navegador: 'obscura no responde en CRAWL4RS_OBSCURA_URL (:9222) — verifica el servicio obscura (systemd/docker) y su CDP. NO ES: web inscrapeable.',
      sin_busqueda: 'SearXNG no responde en SEARXNG_URL (:8080) — verifica el contenedor enki-searxng. NO ES: sin resultados.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `crawl4rs degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }

  // ── leer: una URL → markdown (+extracción opcional) ──
  async _leer(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    let r;
    try { r = await this._render(String(input.url), { extract_css: input.extract_css || {}, stealth: input.stealth, emular: input.emular }); }
    catch (_) { return this._degradado('sin_navegador'); }
    if (r && r.fallo) return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', `no se pudo leer: ${r.fallo.motivo || r.fallo.tipo}`, { fallo: r.fallo });
    return { status: 200, data: {
      markdown: r.markdown || '',
      extraido: r.extraido ?? null,
      paginas: [{ url: r.final_url || String(input.url), markdown: r.markdown || '', extraido: r.extraido ?? null }],
      total: 1
    } };
  }

  // ── rastrear: crawl profundo BFS sobre obscura (dedup + tope de páginas/profundidad) ──
  async _rastrear(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    const maxDepth = Number.isInteger(input.max_depth) ? input.max_depth : 2;
    const maxPages = Number.isInteger(input.max_pages) ? input.max_pages : 25;
    const crossDomain = !!input.cross_domain;
    const raiz = String(input.url);
    let dominioRaiz;
    try { dominioRaiz = new URL(raiz).hostname; } catch (_) { return this._invalid('url'); }

    const vistas = new Set();
    const paginas = [];
    let cola = [{ url: raiz, prof: 0 }];
    const inicio = Date.now();

    while (cola.length && paginas.length < maxPages && (Date.now() - inicio) < this._timeoutMs) {
      const { url, prof } = cola.shift();
      const clave = url.split('#')[0];
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      let r;
      try { r = await this._render(url, { extract_css: input.extract_css || {}, stealth: input.stealth }); }
      catch (_) { if (paginas.length === 0) return this._degradado('sin_navegador'); continue; }
      if (r && r.fallo) continue;
      paginas.push({ url: r.final_url || url, markdown: r.markdown || '', extraido: r.extraido ?? null });
      if (prof < maxDepth) {
        for (const enlace of (r.enlaces || [])) {
          let h;
          try { h = new URL(enlace).hostname; } catch (_) { continue; }
          if (!crossDomain && h !== dominioRaiz) continue;
          const k = enlace.split('#')[0];
          if (!vistas.has(k)) cola.push({ url: enlace, prof: prof + 1 });
        }
      }
    }
    const first = paginas[0] || null;
    return { status: 200, data: {
      markdown: (first && first.markdown) || '',
      extraido: (first && first.extraido) ?? null,
      paginas, total: paginas.length
    } };
  }

  // ── mapear: enlaces de una página, sin contenido ──
  async _mapear(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    let r;
    try { r = await this._render(String(input.url), { soloEnlaces: true, stealth: input.stealth }); }
    catch (_) { return this._degradado('sin_navegador'); }
    if (r && r.fallo) return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', `no se pudo mapear: ${r.fallo.motivo || r.fallo.tipo}`, { fallo: r.fallo });
    const enlaces = Array.isArray(r.enlaces) ? r.enlaces : [];
    return { status: 200, data: { url: r.final_url || String(input.url), enlaces, total: enlaces.length } };
  }

  // ── buscar: SearXNG directo ──
  async _buscar(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.query) return this._invalid('query');
    let lista;
    try { lista = await this._buscarSearx(String(input.query), Number.isInteger(input.limit) ? input.limit : 10); }
    catch (_) { return this._degradado('sin_busqueda'); }
    return { status: 200, data: {
      resultados: (lista || []).map((x) => ({ titulo: x.title, url: x.url, resumen: x.snippet })),
      total: (lista || []).length
    } };
  }

  // ── descargar: una URL de recurso → BYTES (base64 + content_type). fetch plano. ──
  async _descargar(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    let r;
    try { r = await this._fetchBinario(String(input.url)); }
    catch (_) { return this._errorResponse(502, 'DESCARGA_FALLIDA', 'no se pudo descargar el recurso (red)', { url: input.url }); }
    if (r.status === 413) return this._errorResponse(413, 'DEMASIADO_GRANDE', `el recurso supera el tope (${Math.round(this._maxDescargaBytes / 1024 / 1024)} MB)`, { url: input.url });
    if (r.status < 200 || r.status >= 300) return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'no se pudo descargar el recurso', { status: r.status, url: input.url });
    return { status: 200, data: { url: String(input.url), content_type: r.content_type, ext: r.ext, bytes: r.bytes, base64: r.base64 } };
  }

  // ── MARCHA LARGA: entrar (login → sesión) ──
  async _entrar(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    if (!Array.isArray(input.pasos) || input.pasos.length === 0) return this._invalid('pasos');
    let r;
    try { r = await this._ejecutarLogin(String(input.url), input.pasos, { stealth: input.stealth, emular: input.emular, proxy: input.proxy }); }
    catch (_) { return this._degradado('sin_navegador'); }
    if (r && r.fallo) {
      return this._errorResponse(r.fallo.tipo === 'timeout' ? 504 : 502, 'LOGIN_FALLIDO', `el login no cuajó: ${r.fallo.motivo || r.fallo.tipo}`, { fallo: r.fallo });
    }
    if (!r || r.storageState == null) {
      return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'la marcha larga no devolvió sesión', {});
    }
    const sesion_id = this._guardarSesion(r.storageState, r.final_url);
    return { status: 200, data: { sesion_id, final_url: r.final_url || String(input.url), expira_en_ms: this._sesionTtlMs } };
  }

  // ── MARCHA LARGA: abrir una URL YA autenticado (reusa la sesión por handle) ──
  async _abrir(input) {
    const g = this._guard(); if (g) return g;
    if (!input || !input.url) return this._invalid('url');
    if (!input.sesion_id) return this._invalid('sesion_id');
    const storageState = this._leerSesion(input.sesion_id);
    if (storageState == null) {
      return this._errorResponse(409, 'SESION_DESCONOCIDA', 'ese sesion_id no existe o caducó — vuelve a entrar (crawl4rs.entrar) para renovar la sesión', { sesion_id: input.sesion_id });
    }
    let r;
    try { r = await this._render(String(input.url), { storageState, interceptar: input.interceptar, interactuar: input.interactuar, stealth: input.stealth, emular: input.emular }); }
    catch (_) { return this._degradado('sin_navegador'); }
    if (r && r.fallo) {
      return this._errorResponse(r.fallo.tipo === 'timeout' ? 504 : 502, 'UPSTREAM_INVALID_RESPONSE', `no se pudo abrir: ${r.fallo.motivo || r.fallo.tipo}`, { fallo: r.fallo });
    }
    return { status: 200, data: {
      html: r.html || '',
      final_url: r.final_url || String(input.url),
      status_http: r.status ?? null,
      intercepted: Array.isArray(r.intercepted) ? r.intercepted : []
    } };
  }

  // ── sesiones (handle in-memory; el secreto no sale al bus) ──
  _guardarSesion(storageState, final_url) {
    this._purgarSesiones();
    const sesion_id = 'ses_' + crypto.randomUUID();
    this._sesiones.set(sesion_id, { storageState, final_url, creada: Date.now() });
    return sesion_id;
  }
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

  // =============================================================
  // SEAMS DEL NAVEGADOR (obscura por CDP) — aislados, overridables en test.
  // Sin obscura viva no se verifican aquí; misma honestidad que verificador-visual.
  // =============================================================

  // Una página en obscura: navega, (opcional) restaura sesión, intercepta, interactúa,
  // extrae markdown+enlaces. Devuelve { html, markdown, enlaces, final_url, status, intercepted }
  // o { fallo:{tipo,motivo} } si un paso concreto falla (conexión → throw → sin_navegador).
  async _render(url, opts = {}) {
    const puppeteer = require('puppeteer-core');
    const browser = await puppeteer.connect({ browserWSEndpoint: this._obscura });
    let page;
    try {
      page = await browser.newPage();
      if (opts.emular?.user_agent) { try { await page.setUserAgent(String(opts.emular.user_agent)); } catch (_) {} }
      if (opts.emular?.viewport) { try { await page.setViewport(opts.emular.viewport); } catch (_) {} }

      // restaurar sesión (cookies primero; localStorage tras navegar al origen)
      const ss = opts.storageState;
      if (ss && Array.isArray(ss.cookies) && ss.cookies.length) {
        try { await page.setCookie(...ss.cookies); } catch (_) {}
      }

      // interceptar respuestas JSON de APIs internas (la jugada de precios)
      const intercepted = [];
      const contiene = opts.interceptar && Array.isArray(opts.interceptar.contiene) ? opts.interceptar.contiene : null;
      if (contiene) {
        page.on('response', async (res) => {
          try {
            const u = res.url();
            if (!contiene.some((frag) => u.includes(frag))) return;
            const ct = (res.headers()['content-type'] || '').toLowerCase();
            if (!ct.includes('json')) return;
            const json = await res.json().catch(() => null);
            if (json != null) intercepted.push({ url: u, status: res.status(), json });
          } catch (_) { /* best-effort */ }
        });
      }

      let resp;
      try { resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: this._timeoutMs }); }
      catch (e) { return { fallo: { tipo: /timeout/i.test(e.message) ? 'timeout' : 'nav', motivo: e.message } }; }

      // localStorage best-effort tras estar en el origen
      if (ss && Array.isArray(ss.origins)) {
        const origen = ss.origins.find((o) => { try { return new URL(url).origin === o.origin; } catch (_) { return false; } });
        if (origen && Array.isArray(origen.localStorage)) {
          try { await page.evaluate((items) => { for (const it of items) localStorage.setItem(it.name, it.value); }, origen.localStorage); } catch (_) {}
        }
      }

      // interactuar (revelar precios, expandir, aceptar cookies…) — mismo vocabulario que los pasos
      if (Array.isArray(opts.interactuar) && opts.interactuar.length) {
        const f = await this._ejecutarPasos(page, opts.interactuar);
        if (f) return { fallo: f };
      }

      const final_url = page.url();
      const status = resp ? resp.status() : null;
      const html = await page.content().catch(() => '');
      const enlaces = await this._extraerEnlaces(page);
      let markdown = '';
      if (!opts.soloEnlaces) markdown = await this._extraerMarkdown(page);
      // extracción CSS opcional (selector → texto)
      let extraido = null;
      if (opts.extract_css && Object.keys(opts.extract_css).length) {
        extraido = await page.evaluate((mapa) => {
          const out = {};
          for (const [clave, sel] of Object.entries(mapa)) {
            const el = document.querySelector(sel);
            out[clave] = el ? (el.innerText || el.textContent || '').trim() : null;
          }
          return out;
        }, opts.extract_css).catch(() => null);
      }
      return { html, markdown, enlaces, final_url, status, intercepted, extraido };
    } finally {
      try { if (page) await page.close(); } catch (_) {}
      try { browser.disconnect(); } catch (_) {}   // obscura es servidor compartido
    }
  }

  // El guion de login: navega, ejecuta los pasos, captura el storageState (cookies +
  // localStorage). Devuelve { storageState, final_url } o { fallo } (conexión → throw).
  async _ejecutarLogin(url, pasos, opts = {}) {
    const puppeteer = require('puppeteer-core');
    const browser = await puppeteer.connect({ browserWSEndpoint: this._obscura });
    let page;
    try {
      page = await browser.newPage();
      if (opts.emular?.user_agent) { try { await page.setUserAgent(String(opts.emular.user_agent)); } catch (_) {} }
      try { await page.goto(url, { waitUntil: 'networkidle2', timeout: this._timeoutMs }); }
      catch (e) { return { fallo: { tipo: /timeout/i.test(e.message) ? 'timeout' : 'nav', motivo: e.message } }; }
      const f = await this._ejecutarPasos(page, pasos);
      if (f) return { fallo: f };
      const cookies = await page.cookies().catch(() => []);
      const origins = await page.evaluate(() => {
        const items = [];
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); items.push({ name: k, value: localStorage.getItem(k) }); } } catch (_) {}
        return [{ origin: location.origin, localStorage: items }];
      }).catch(() => []);
      return { storageState: { cookies, origins }, final_url: page.url() };
    } finally {
      try { if (page) await page.close(); } catch (_) {}
      try { browser.disconnect(); } catch (_) {}
    }
  }

  // Ejecuta el vocabulario de pasos sobre una page. Devuelve null (ok) o {tipo,motivo} (fallo).
  async _ejecutarPasos(page, pasos) {
    for (const paso of pasos) {
      try {
        switch (paso.tipo) {
          case 'fill':
            await page.waitForSelector(paso.selector, { timeout: this._timeoutMs });
            await page.type(paso.selector, String(paso.valor ?? ''));
            break;
          case 'click':
            await page.waitForSelector(paso.selector, { timeout: this._timeoutMs });
            await page.click(paso.selector);
            break;
          case 'wait':
            if (paso.selector) await page.waitForSelector(paso.selector, { timeout: this._timeoutMs });
            else await sleep(Number(paso.ms) || 500);
            break;
          case 'scroll':
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            break;
          case 'press':
            await page.keyboard.press(String(paso.key || 'Enter'));
            break;
          default:
            return { tipo: 'error', motivo: `paso desconocido: ${paso.tipo}` };
        }
      } catch (e) {
        return { tipo: /timeout/i.test(e.message) ? 'timeout' : 'error', motivo: `paso ${paso.tipo} (${paso.selector || ''}): ${e.message}` };
      }
    }
    return null;
  }

  async _extraerEnlaces(page) {
    try {
      const enlaces = await page.evaluate(() => {
        const set = new Set();
        for (const a of document.querySelectorAll('a[href]')) {
          try { const u = new URL(a.href, location.href); if (u.protocol === 'http:' || u.protocol === 'https:') set.add(u.href); } catch (_) {}
        }
        return [...set];
      });
      return Array.isArray(enlaces) ? enlaces : [];
    } catch (_) { return []; }
  }

  // Extracción readability-lite → markdown, EN la página (obscura V8, sin deps de Node).
  async _extraerMarkdown(page) {
    try {
      return await page.evaluate(() => {
        const raiz = document.querySelector('article, main, [role="main"]') || document.body;
        if (!raiz) return '';
        const clon = raiz.cloneNode(true);
        for (const sel of ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'svg', 'form']) {
          for (const el of clon.querySelectorAll(sel)) el.remove();
        }
        const out = [];
        const md = (el) => {
          for (const n of el.childNodes) {
            if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, ' '); if (t.trim()) out.push(t); continue; }
            if (n.nodeType !== 1) continue;
            const tag = n.tagName.toLowerCase();
            if (/^h[1-6]$/.test(tag)) { out.push('\n\n' + '#'.repeat(+tag[1]) + ' ' + n.innerText.trim() + '\n'); continue; }
            if (tag === 'p') { out.push('\n\n' + n.innerText.trim() + '\n'); continue; }
            if (tag === 'li') { out.push('\n- ' + n.innerText.trim()); continue; }
            if (tag === 'br') { out.push('\n'); continue; }
            if (tag === 'a' && n.getAttribute('href')) { const t = n.innerText.trim(); if (t) out.push(`[${t}](${n.href})`); continue; }
            if (tag === 'pre' || tag === 'code') { out.push('\n\n```\n' + n.innerText + '\n```\n'); continue; }
            if (tag === 'img' && n.getAttribute('src')) { out.push(`![${n.alt || ''}](${n.src})`); continue; }
            md(n);
          }
        };
        md(clon);
        return out.join(' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      });
    } catch (_) { return ''; }
  }

  // ── buscar en SearXNG (JSON API). Overridable en test. ──
  async _buscarSearx(query, limit) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const u = `${this._searxng}/search?q=${encodeURIComponent(query)}&format=json`;
      const resp = await fetch(u, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (resp.status < 200 || resp.status >= 300) throw new Error('searxng ' + resp.status);
      const body = await resp.json();
      const lista = Array.isArray(body.results) ? body.results : [];
      return lista.slice(0, limit).map((x) => ({ title: x.title, url: x.url, snippet: x.content || '' }));
    } finally { clearTimeout(to); }
  }

  // ── GET binario directo (fetch global). Overridable en test. NO throw por tamaño (→ 413). ──
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

  _extDe(contentType, url) {
    const ct = String(contentType || '').toLowerCase();
    const map = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' };
    for (const k of Object.keys(map)) if (ct.includes(k)) return map[k];
    const m = String(url || '').match(/\.([a-z0-9]{2,4})(?:[?#]|$)/i);
    return m ? m[1].toLowerCase() : 'bin';
  }
}

module.exports = Crawl4rsModule;
