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
 *   OJOS     _render()           abre Chromium (puppeteer-core ya en el repo) y mide el DOM
 *
 * DEGRADACIÓN ELEGANTE: si no hay navegador en el host, el órgano NO bloquea
 * (fail-open) — devuelve {ok:true, verificado:false, motivo:'sin_navegador'} y deja
 * testigo. Donde SÍ hay Chromium, verifica de verdad (fail-closed sobre render roto).
 *
 * TESTIGO: render.verificado (ok) / verificacion-visual.failed (roto). El .failed
 * canónico lo capta la homeostasis (sensor de *.failed) → el cuerpo siente cuándo
 * produce un diseño roto sin que nadie se lo diga.
 *
 * Puerta (RPC del bus):
 *   render.verificar.request { html, etiqueta? } → { ok, verificado, motivos[], metricas }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const DEFAULTS = {
  timeout_ms: 15000,
  viewport: { width: 1280, height: 900 },
  max_overflow_px: 4,      // tolerancia de scroll horizontal antes de declarar overflow
  min_text_len: 12,        // menos texto que esto = página en blanco
  executable_path: null    // si se fija, manda; si no, _resolverChromium busca
};

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
    this.version = '1.0.0';
    this.config = null;
    this._chromium = null;     // ruta resuelta (o null = sin ojos)
  }

  async onLoad(context) {
    await super.onLoad(context);
    this.config = Object.assign({}, DEFAULTS, context.moduleConfig || {});
    this.config.viewport = Object.assign({}, DEFAULTS.viewport, (context.moduleConfig || {}).viewport || {});
    this._chromium = this._resolverChromium();
    this.logger?.info('verificador-visual.loaded', {
      module: this.name, version: this.version,
      ojos: this._chromium ? 'chromium' : 'sin_navegador', chromium: this._chromium || null
    });
  }

  _resolverChromium() {
    if (this.config.executable_path && fs.existsSync(this.config.executable_path)) return this.config.executable_path;
    for (const p of _candidatosChromium()) {
      try { if (p && fs.existsSync(p)) return p; } catch (_) { /* */ }
    }
    return null;
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

    if (!this._chromium) {
      // DEGRADACIÓN: no podemos mirar; no bloqueamos, pero lo testificamos.
      this.metrics?.increment?.('verificador-visual.sin_navegador.total');
      this._emit('verificacion-visual.sin_navegador', { etiqueta });
      return { status: 200, data: { ok: true, verificado: false, motivo: 'sin_navegador', motivos: [], metricas: null } };
    }

    let snapshot;
    try {
      snapshot = await this._render(html);
    } catch (err) {
      // el navegador falló al renderizar = render roto de la peor clase.
      this.metrics?.increment?.('verificador-visual.render_error.total');
      this._emit('verificacion-visual.failed', { etiqueta, ok: false, motivos: ['render_error'], detalle: err.message });
      return { status: 200, data: { ok: false, verificado: true, motivos: ['render_error'], detalle: err.message, metricas: null } };
    }

    const { ok, motivos } = this._evaluarSnapshot(snapshot, this.config);
    const data = { ok, verificado: true, motivos, metricas: snapshot };
    if (ok) {
      this.metrics?.increment?.('verificador-visual.ok.total');
      this._emit('render.verificado', { etiqueta, metricas: snapshot });
    } else {
      this.metrics?.increment?.('verificador-visual.roto.total');
      this._emit('verificacion-visual.failed', { etiqueta, ok: false, motivos });  // .failed → lo siente la homeostasis
    }
    return { status: 200, data };
  }

  // ── CEREBRO: función PURA. Métricas del DOM → veredicto. Cero navegador aquí. ──
  _evaluarSnapshot(s, cfg = DEFAULTS) {
    const motivos = [];
    if (Array.isArray(s.consoleErrors) && s.consoleErrors.length) motivos.push('errores_consola');
    if (Array.isArray(s.pageErrors) && s.pageErrors.length) motivos.push('errores_js');
    if (typeof s.scrollWidth === 'number' && typeof s.clientWidth === 'number' &&
        s.scrollWidth > s.clientWidth + (cfg.max_overflow_px ?? DEFAULTS.max_overflow_px)) motivos.push('overflow_horizontal');
    if (typeof s.textLength === 'number' && s.textLength < (cfg.min_text_len ?? DEFAULTS.min_text_len)) motivos.push('pagina_en_blanco');
    if (typeof s.imgRoto === 'number' && s.imgRoto > 0) motivos.push('imagenes_rotas');
    return { ok: motivos.length === 0, motivos };
  }

  // ── OJOS: abre Chromium (puppeteer-core, ya en el repo) y mide el DOM ──
  async _render(html) {
    const puppeteer = require('puppeteer-core');
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: this._chromium,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      const page = await browser.newPage();
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
      return { consoleErrors, pageErrors, ...dom };
    } finally {
      if (browser) { try { await browser.close(); } catch (_) { /* */ } }
    }
  }

  _emit(evento, payload) {
    try {
      this.eventBus?.publish?.(evento, { ...payload, correlation_id: require('crypto').randomUUID(), timestamp: new Date().toISOString() });
    } catch (_) { /* best-effort */ }
  }

  // ── UI/diagnóstico ──
  async handleHealthCheck() {
    return { status: 200, data: { module: this.name, version: this.version, ojos: this._chromium ? 'chromium' : 'sin_navegador' } };
  }
}

module.exports = VerificadorVisualModule;
