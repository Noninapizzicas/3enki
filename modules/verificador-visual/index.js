/**
 * verificador-visual — el órgano que MIRA si un diseño RENDERIZA bien (Teoría del Órgano).
 *
 * Es un órgano tipo PROVIDER en la tabla de §5: MOTOR + EVENTO, SIN memoria. No
 * sabe de cartas ni de marca; SABE abrir un navegador y comprobar que el HTML no
 * sale roto. Cierra el bucle que el freno estructural de carta-design deja abierto:
 *
 *   carta-design.validar   ¿están todos los productos? ¿alérgenos?   → ESTRUCTURA
 *   verificador-visual     ¿renderiza sin romperse? ¿sin overflow?   → RENDER REAL
 *
 * ANATOMÍA del motor (dos mitades):
 *   CEREBRO  _evaluarSnapshot()  función PURA sobre métricas del DOM (siempre presente, testeable)
 *   OJOS     _render()           abre un navegador (puppeteer-core) y mide el DOM
 *
 * OJOS por CDP (v1.2.0): prefiere OBSCURA — navegador headless en RUST (h4ckf0r0day/obscura),
 * V8 embebido, SIN Chromium, stealth. Se conecta por CDP (puppeteer.connect a
 * ws://127.0.0.1:9222/devtools/browser). Si obscura no responde, cae honesto a un Chromium
 * local (puppeteer.launch). Misma medición del DOM en ambos — obscura es drop-in de puppeteer.
 *
 * DEGRADACIÓN ELEGANTE: si no hay navegador (ni obscura ni Chromium), el órgano NO bloquea
 * (fail-open) — devuelve {ok:true, verificado:false, motivo:'sin_navegador'} y deja
 * testigo. Donde SÍ hay ojos, verifica de verdad (fail-closed sobre render roto).
 *
 * TESTIGO: render.verificado (ok) / verificacion-visual.failed (roto). El .failed
 * canónico lo capta la homeostasis (sensor de *.failed) → el cuerpo siente cuándo
 * produce un diseño roto sin que nadie se lo diga.
 *
 * MULTI-ÁNGULO (v1.1.0, cosechado del ui-test de Browserbase — funcional/adversarial/a11y):
 *   dos severidades. motivos[] = HARD (bloquea 422; los de siempre: consola/js/overflow/
 *   blanco/img-rota, SIN regresión). avisos[] = SOFT (surfaced, NO bloquea): ángulo
 *   RESPONSIVE (overflow_movil) + ACCESIBILIDAD (img_sin_alt · lang_ausente · texto_ilegible
 *   · contraste_bajo). ok = motivos vacíos (invariante: el freno bloquea exactamente lo mismo).
 *   Los avisos se surfacean SIEMPRE (aun con render OK) → la propiocepción los ve; un caller
 *   (p.ej. carta-digital, PWA de móvil) puede promover un aviso a bloqueo. Graduado: exponer
 *   antes que enforcer. SECUENCIAL (una sesión de navegador): cabe en un VPS de 1-2GB; el
 *   fan-out paralelo de ui-test pide una caja mayor y queda fuera por la RAM.
 *
 * Puerta (RPC del bus):
 *   render.verificar.request { html, etiqueta? } → { ok, verificado, motivos[], avisos[], metricas }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const DEFAULTS = {
  timeout_ms: 15000,
  viewport: { width: 1280, height: 900 },
  viewport_movil: { width: 390, height: 844 },   // ángulo responsive: la carta debe leerse en el móvil
  max_overflow_px: 4,      // tolerancia de scroll horizontal antes de declarar overflow
  min_text_len: 12,        // menos texto que esto = página en blanco
  min_font_px: 10,         // texto por debajo de esto = ilegible (a11y)
  contrast_min: 4.5,       // WCAG AA para texto normal (a11y)
  a11y_scan_max: 60,       // tope de elementos que escanea el sampler de contraste (no reventar la página)
  executable_path: null,   // si se fija, manda; si no, _resolverChromium busca
  obscura_url: null        // endpoint CDP de obscura; null → default ws://127.0.0.1:9222/devtools/browser
};

// Endpoint CDP de obscura (navegador Rust nativo). Default operativo desde el minuto 1;
// se apaga con obscura:false en config o VERIFICADOR_OBSCURA_URL vacío deliberado.
const OBSCURA_DEFAULT = 'ws://127.0.0.1:9222/devtools/browser';

// Rutas candidatas del binario de Chromium (este entorno + sistemas comunes).
function _candidatosChromium() {
  const c = [];
  const env = process.env.VERIFICADOR_CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
  if (env) c.push(env);
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base)) {
      if (/^chromium-\d+/.test(d)) c.push(path.join(base, d, 'chrome-linux', 'chrome'));
    }
  } catch (_) { /* dir ausente */ }
  c.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable');
  return c;
}

class VerificadorVisualModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'verificador-visual';
    this.version = '1.2.0';
    this.config = null;
    this._chromium = null;     // ruta del Chromium local (fallback), o null
    this._obscura = null;      // endpoint CDP de obscura (preferido), o null
  }

  async onLoad(context) {
    await super.onLoad(context);
    this.config = Object.assign({}, DEFAULTS, context.moduleConfig || {});
    this.config.viewport = Object.assign({}, DEFAULTS.viewport, (context.moduleConfig || {}).viewport || {});
    this._chromium = this._resolverChromium();
    this._obscura = this._resolverObscura();
    this.logger?.info('verificador-visual.loaded', {
      module: this.name, version: this.version,
      ojos: this._describeOjos(), obscura: this._obscura || null, chromium: this._chromium || null
    });
  }

  _resolverChromium() {
    if (this.config.executable_path && fs.existsSync(this.config.executable_path)) return this.config.executable_path;
    for (const p of _candidatosChromium()) {
      try { if (p && fs.existsSync(p)) return p; } catch (_) { /* */ }
    }
    return null;
  }

  // Endpoint CDP de obscura. env manda; luego config; default ON (obscura nace operativo).
  // obscura:false en config lo apaga (solo Chromium). Si el server no está, _abrirNavegador
  // cae a Chromium — resolver un endpoint NO garantiza que responda (eso se sabe al conectar).
  _resolverObscura() {
    const cfg = this.config || {};
    if (typeof process.env.VERIFICADOR_OBSCURA_URL === 'string' && process.env.VERIFICADOR_OBSCURA_URL) return process.env.VERIFICADOR_OBSCURA_URL;
    if (cfg.obscura_url) return cfg.obscura_url;
    if (cfg.obscura === false) return null;
    return OBSCURA_DEFAULT;
  }

  _describeOjos() {
    const partes = [];
    if (this._obscura) partes.push('obscura');
    if (this._chromium) partes.push('chromium');
    return partes.length ? partes.join('+') : 'sin_navegador';
  }

  // ── handler del bus ──
  onVerificarRequest(e) { return this._atender(e, 'verificar', 'render.verificar.response', d => this._verificar(d)); }

  // ── orquesta: sin ojos → fail-open con testigo; con ojos → mira de verdad ──
  async _verificar(d) {
    const html = d?.html;
    if (typeof html !== 'string' || html.trim().length === 0) {
      return this._errorResponse(400, 'INVALID_INPUT', 'html requerido (string no vacío)', { field: 'html' });
    }
    const etiqueta = d?.etiqueta || null;

    let snapshot;
    try {
      snapshot = await this._render(html);
    } catch (err) {
      if (err && err.code === 'SIN_OJOS') {
        // DEGRADACIÓN: no hay navegador (ni obscura ni Chromium); no bloqueamos, testificamos.
        this.metrics?.increment?.('verificador-visual.sin_navegador.total');
        this._emit('verificacion-visual.sin_navegador', { etiqueta });
        return { status: 200, data: { ok: true, verificado: false, motivo: 'sin_navegador', motivos: [], metricas: null } };
      }
      // el navegador falló al renderizar = render roto de la peor clase.
      this.metrics?.increment?.('verificador-visual.render_error.total');
      this._emit('verificacion-visual.failed', { etiqueta, ok: false, motivos: ['render_error'], detalle: err.message });
      return { status: 200, data: { ok: false, verificado: true, motivos: ['render_error'], detalle: err.message, metricas: null } };
    }

    const { ok, motivos, avisos } = this._evaluarSnapshot(snapshot, this.config);
    const data = { ok, verificado: true, motivos, avisos, metricas: snapshot };
    if (ok) {
      this.metrics?.increment?.('verificador-visual.ok.total');
      this._emit('render.verificado', { etiqueta, avisos, metricas: snapshot });
    } else {
      this.metrics?.increment?.('verificador-visual.roto.total');
      this._emit('verificacion-visual.failed', { etiqueta, ok: false, motivos, avisos });  // .failed → lo siente la homeostasis
    }
    // los ángulos SOFT (a11y/móvil) se surfacean SIEMPRE que existan, aunque el render pase —
    // así la propiocepción los ve sin que bloqueen el freno (exponer antes que enforcer).
    if (avisos.length) {
      this.metrics?.increment?.('verificador-visual.avisos.total', { n: avisos.length });
      this._emit('verificacion-visual.avisos', { etiqueta, ok, avisos });
    }
    return { status: 200, data };
  }

  // ── CEREBRO: función PURA. Métricas del DOM → veredicto. Cero navegador aquí. ──
  // DOS niveles de severidad (patrón graduado, cosechado de ui-test de Browserbase —
  // funcional/adversarial/accesibilidad): motivos = HARD (bloquea, 422; los de siempre,
  // sin regresión) · avisos = SOFT (surfaced, NO bloquea; los ángulos nuevos a11y+móvil).
  // ok = motivos vacíos (INVARIANTE: el freno sigue bloqueando exactamente lo mismo).
  // Un caller (p.ej. carta-digital, PWA de móvil) puede ELEGIR promover un aviso a bloqueo.
  _evaluarSnapshot(s, cfg = DEFAULTS) {
    const motivos = [];
    const avisos = [];
    const overflowTol = cfg.max_overflow_px ?? DEFAULTS.max_overflow_px;

    // ── ángulo FUNCIONAL (HARD, los de siempre) ──
    if (Array.isArray(s.consoleErrors) && s.consoleErrors.length) motivos.push('errores_consola');
    if (Array.isArray(s.pageErrors) && s.pageErrors.length) motivos.push('errores_js');
    if (typeof s.scrollWidth === 'number' && typeof s.clientWidth === 'number' &&
        s.scrollWidth > s.clientWidth + overflowTol) motivos.push('overflow_horizontal');
    if (typeof s.textLength === 'number' && s.textLength < (cfg.min_text_len ?? DEFAULTS.min_text_len)) motivos.push('pagina_en_blanco');
    if (typeof s.imgRoto === 'number' && s.imgRoto > 0) motivos.push('imagenes_rotas');

    // ── ángulo RESPONSIVE (SOFT): ¿se sale del ancho en el móvil? ──
    if (s.movil && typeof s.movil.scrollWidth === 'number' && typeof s.movil.clientWidth === 'number' &&
        s.movil.scrollWidth > s.movil.clientWidth + overflowTol) avisos.push('overflow_movil');

    // ── ángulo ACCESIBILIDAD (SOFT): alt, lang, legibilidad, contraste ──
    const a = s.a11y || {};
    if (typeof a.imgSinAlt === 'number' && a.imgSinAlt > 0) avisos.push('img_sin_alt');
    if (a.langAusente === true) avisos.push('lang_ausente');
    if (typeof a.textoIlegible === 'number' && a.textoIlegible > 0) avisos.push('texto_ilegible');
    if (typeof a.contrasteBajo === 'number' && a.contrasteBajo > 0) avisos.push('contraste_bajo');

    return { ok: motivos.length === 0, motivos, avisos };
  }

  // ── OJOS: abre obscura (CDP) o Chromium (fallback) y mide el DOM ──
  async _render(html) {
    const { browser, tipo } = await this._abrirNavegador();
    let page;
    try {
      page = await browser.newPage();
      await page.setViewport(this.config.viewport);
      const consoleErrors = [], pageErrors = [];
      page.on('console', m => { try { if (m.type() === 'error') consoleErrors.push(m.text()); } catch (_) {} });
      page.on('pageerror', e => { try { pageErrors.push(e.message); } catch (_) {} });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: this.config.timeout_ms });
      const dom = await page.evaluate(() => {
        const de = document.documentElement;
        let imgRoto = 0;
        for (const img of Array.from(document.images)) if (img.complete && img.naturalWidth === 0) imgRoto++;
        return {
          scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
          scrollHeight: de.scrollHeight, clientHeight: de.clientHeight,
          textLength: ((document.body && document.body.innerText) || '').trim().length,
          imgRoto
        };
      });

      // ── ángulo ACCESIBILIDAD (a11y): alt · lang · legibilidad · contraste (sampler acotado) ──
      const a11y = await page.evaluate((minFontPx, contrastMin, scanMax) => {
        const parseRGB = (s) => {
          const m = /rgba?\(([^)]+)\)/.exec(s || '');
          if (!m) return null;
          const p = m[1].split(',').map(x => parseFloat(x.trim()));
          if (p.length < 3 || p.some(Number.isNaN)) return null;
          return { r: p[0], g: p[1], b: p[2], a: p.length >= 4 ? p[3] : 1 };
        };
        const lum = ({ r, g, b }) => {
          const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const ratio = (fg, bg) => { const L1 = lum(fg), L2 = lum(bg), hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); };
        const bgSolido = (el) => {                       // sube por padres hasta un fondo opaco; defensivo → blanco
          let n = el;
          while (n && n !== document.documentElement) {
            const c = parseRGB(getComputedStyle(n).backgroundColor);
            if (c && c.a >= 0.95) return c;
            n = n.parentElement;
          }
          const cd = parseRGB(getComputedStyle(document.documentElement).backgroundColor);
          return (cd && cd.a >= 0.95) ? cd : { r: 255, g: 255, b: 255, a: 1 };
        };
        let imgSinAlt = 0;
        for (const img of Array.from(document.images)) if (!img.hasAttribute('alt')) imgSinAlt++;   // alt="" decorativo es válido
        const langAusente = !document.documentElement.getAttribute('lang');
        let textoIlegible = 0, contrasteBajo = 0, escaneados = 0;
        const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT);
        let el;
        while ((el = walker.nextNode()) && escaneados < scanMax) {
          const propio = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
          if (!propio) continue;                         // solo elementos con texto PROPIO
          if (el.offsetParent === null && el !== document.body) continue;   // invisible
          const cs = getComputedStyle(el);
          escaneados++;
          const fs = parseFloat(cs.fontSize);
          if (!Number.isNaN(fs) && fs < minFontPx) textoIlegible++;
          const fg = parseRGB(cs.color);
          if (fg && fg.a >= 0.95 && ratio(fg, bgSolido(el)) < contrastMin) contrasteBajo++;
        }
        return { imgSinAlt, langAusente, textoIlegible, contrasteBajo, escaneados };
      }, this.config.min_font_px, this.config.contrast_min, this.config.a11y_scan_max);

      // ── ángulo RESPONSIVE: re-mide el overflow en viewport móvil (reflow, misma página) ──
      let movil = null;
      try {
        await page.setViewport(this.config.viewport_movil);
        movil = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      } catch (_) { /* móvil best-effort */ }

      return { consoleErrors, pageErrors, ...dom, a11y, movil };
    } finally {
      try { if (page) await page.close(); } catch (_) { /* */ }
      // obscura es un servidor COMPARTIDO: nos desconectamos (no lo matamos). El Chromium
      // que lanzamos SÍ se cierra (era nuestro proceso).
      try {
        if (tipo === 'obscura') browser.disconnect();
        else await browser.close();
      } catch (_) { /* */ }
    }
  }

  // Abre el navegador: obscura por CDP (preferido, Rust nativo) → Chromium local (fallback).
  // Sin ninguno → error SIN_OJOS (lo traduce _verificar a fail-open sin_navegador).
  async _abrirNavegador() {
    let puppeteer;
    try { puppeteer = require('puppeteer-core'); }
    catch (_) { const e = new Error('puppeteer-core ausente'); e.code = 'SIN_OJOS'; throw e; }

    // 1. obscura — navegador headless en Rust (V8, sin Chromium, stealth), por CDP.
    if (this._obscura) {
      try {
        const browser = await puppeteer.connect({ browserWSEndpoint: this._obscura });
        return { browser, tipo: 'obscura' };
      } catch (e) {
        this.logger?.debug?.('verificador-visual.obscura.no_disponible', { endpoint: this._obscura, error: e.message });
      }
    }
    // 2. Chromium local — fallback honesto.
    if (this._chromium) {
      const browser = await puppeteer.launch({
        executablePath: this._chromium,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      return { browser, tipo: 'chromium' };
    }
    const e = new Error('sin navegador: ni obscura (CDP) ni Chromium local'); e.code = 'SIN_OJOS'; throw e;
  }

  _emit(evento, payload) {
    try {
      this.eventBus?.publish?.(evento, { ...payload, correlation_id: require('crypto').randomUUID(), timestamp: new Date().toISOString() });
    } catch (_) { /* best-effort */ }
  }

  // ── UI/diagnóstico ──
  async handleHealthCheck() {
    return { status: 200, data: { module: this.name, version: this.version, ojos: this._describeOjos(), obscura: this._obscura || null, chromium: this._chromium || null } };
  }
}

module.exports = VerificadorVisualModule;
