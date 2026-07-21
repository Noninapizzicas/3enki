'use strict';

/**
 * motor-ojo — PUENTE al primer órgano SENSORIAL de enki-sense: RENDERIZAR
 * (datos/markup → SVG · PDF · imagen). Transductor DETERMINISTA (clase 1 del
 * bisturí): mismo input → mismos bytes; un test de fixture lo afirma. El motor
 * es Rust puro nativo (resvg/tiny-skia/svg2pdf), clon del molde OCR4RS.
 *
 * Este reflejo traduce bus↔HTTP y esconde el HTTP en el servicio:
 *   bus  motor-ojo.render.request {tipo, fuente} → POST /render → {base64, ext}
 * Tool de chat: renderizar (en GLOBAL_TOOLS → operativa desde el minuto 1).
 *
 * DISCIPLINA (patrón Enki):
 *   - SIN BOTÓN: nace operativo. El render es cómputo local puro (SVG→bytes, sin
 *     red/shell/ops peligrosas); un interruptor no protegería ningún estado
 *     nombrable → ceremonia, no invariante. Se disuelve (P0, la pregunta madre).
 *   - DEGRADA HONESTO: único guard = si el motor Rust no responde → 503 sin_motor.
 *     Nunca finge bytes. Vive en el bus ANTES que el motor esté desplegado.
 *
 * Ver guión: arquitectura/decisiones/propuestas/enki-sense.md
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// Puerto del servicio de render (enki-sense, Rust nativo). Rango sensorial :812x.
const DEFAULT_BASE = 'http://localhost:8120';
const TIPOS = new Set(['svg', 'pdf', 'imagen']);

class MotorOjoModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-ojo';
    this.version = '0.2.0';       // SIN BOTÓN: operativo desde el minuto 1
    this._baseUrl = DEFAULT_BASE;
    this._timeoutMs = 30000;
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config['motor-ojo']))) || {};
    this._baseUrl = String(process.env.MOTOR_OJO_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._timeoutMs = Number(cfg.timeout_ms) || 30000;
    this.logger?.info?.('motor-ojo.loaded', { base_url: this._baseUrl });
  }

  // SIN BOTÓN. El render es cómputo local puro (SVG→bytes): no toca red, ni shell,
  // ni ops peligrosas; usvg no ejecuta scripts ni carga entidades externas. Un
  // interruptor no protegería ningún estado nombrable → sería ceremonia (miedo),
  // no invariante. El ÚNICO guard es la degradación honesta: si el motor Rust no
  // responde, 503 sin_motor. Nace operativo desde el minuto 1.

  // ── RPC del bus + tool de chat ──
  onRenderRequest(e) { return this._atender(e, 'render', 'motor-ojo.render.response', (d) => this._render(d)); }
  async handleRenderTool(args) { return this._render(args || {}); }

  // ── degradación honesta: el ÚNICO guard es que el motor Rust responda ──
  _degradado(motivo) {
    const prescripcion = {
      sin_motor: 'el servicio enki-sense de render no responde en MOTOR_OJO_URL — verifica que esté desplegado y su /health. NO ES: fuente inválida.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `motor-ojo degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }

  // ── render: datos/markup → {base64, ext} ──
  async _render(input) {
    if (!input || !input.tipo) return this._invalid('tipo');
    if (!TIPOS.has(String(input.tipo))) return this._errorResponse(400, 'INVALID_INPUT', `tipo debe ser uno de: ${[...TIPOS].join(', ')}`, { tipo: input.tipo });
    if (input.fuente == null || input.fuente === '') return this._invalid('fuente');
    const payload = { tipo: String(input.tipo), fuente: input.fuente, ...(input.opts ? { opts: input.opts } : {}) };
    let r;
    try { r = await this._motorCall('/render', payload); }
    catch (_) { return this._degradado('sin_motor'); }
    // El motor NUNCA inventa: si no puede renderizar responde { fallo:{tipo,motivo} }.
    if (r.body && r.body.fallo) {
      const f = r.body.fallo;
      return this._errorResponse(422, 'RENDER_FALLIDO', `no se pudo renderizar: ${f.motivo || f.tipo}`, { fallo: f });
    }
    if (r.status < 200 || r.status >= 300 || !r.body || r.body.base64 == null) {
      return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'el motor no devolvió bytes', { status: r.status });
    }
    return { status: 200, data: { base64: r.body.base64, ext: r.body.ext || String(input.tipo), tipo: String(input.tipo) } };
  }

  // POST al servicio de render. Overridable en test.
  async _motorCall(path, payload) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const resp = await fetch(this._baseUrl + path, {
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
}

module.exports = MotorOjoModule;
