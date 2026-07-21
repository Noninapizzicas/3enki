'use strict';

/**
 * motor-sonido — PUENTE al órgano PERCEPTOR de enki-sense: ANALIZAR-SONIDO
 * (audio → prosodia). Clase 2 del bisturí (PERCEPTOR), PARTIDO en dos:
 *   - la mitad MEDIBLE (features DSP: energía, tono f0, ritmo) = REFLEJO → este
 *     motor Rust las calcula, deterministas.
 *   - la mitad de JUICIO (etiqueta emocional: "frustrado", "calmado") = FUZZY →
 *     la pone el LLM DE PÁGINA al leer las features. El motor NO etiqueta emoción.
 * Su salida sube a la PROPIOCEPCIÓN — el LLM la lee al turno siguiente (la joya).
 *
 * Reflejo bus↔HTTP:
 *   bus  motor-sonido.analizar.request {audio_base64} → POST /analyze
 *        → {features:{...}}
 * Tool de chat: analizar_sonido (en GLOBAL_TOOLS).
 *
 * DISCIPLINA (patrón Enki):
 *   - SIN BOTÓN en el motor: cómputo local puro sobre un audio que YA llega. El
 *     guard de PRIVACIDAD del micrófono vive en el BORDE (al CAPTURAR), no aquí.
 *   - DEGRADA HONESTO: motor no responde → 503 sin_motor. NO inventa una emoción
 *     (solo da features; el juicio es del LLM).
 *
 * Ver guión: arquitectura/decisiones/propuestas/enki-sense.md
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const DEFAULT_BASE = 'http://localhost:8123';

class MotorSonidoModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-sonido';
    this.version = '0.1.0';       // SIN BOTÓN desde el nacimiento (principio enki-sense)
    this._baseUrl = DEFAULT_BASE;
    this._timeoutMs = 30000;
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config['motor-sonido']))) || {};
    this._baseUrl = String(process.env.MOTOR_SONIDO_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._timeoutMs = Number(cfg.timeout_ms) || 30000;
    this.logger?.info?.('motor-sonido.loaded', { base_url: this._baseUrl });
  }

  // SIN BOTÓN en el motor (guard de privacidad del micro = en el borde). Único
  // guard aquí: degradación honesta (sin_motor).

  // ── RPC del bus + tool de chat ──
  onAnalizarRequest(e) { return this._atender(e, 'analizar', 'motor-sonido.analizar.response', (d) => this._analizar(d)); }
  async handleAnalizarTool(args) { return this._analizar(args || {}); }

  // ── degradación honesta ──
  _degradado(motivo) {
    const prescripcion = {
      sin_motor: 'el servicio enki-sense de sonido no responde en MOTOR_SONIDO_URL — verifica que esté desplegado y su /health. NO ES: audio inválido.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `motor-sonido degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }

  // ── analizar: {audio_base64} → {features} ──
  async _analizar(input) {
    if (!input || !input.audio_base64) return this._invalid('audio_base64');
    let r;
    try { r = await this._motorCall('/analyze', { audio_base64: String(input.audio_base64) }); }
    catch (_) { return this._degradado('sin_motor'); }
    if (r.body && r.body.fallo) {
      const f = r.body.fallo;
      return this._errorResponse(f.tipo === 'timeout' ? 504 : 502, 'ANALISIS_FALLIDO', `no se pudo analizar: ${f.motivo || f.tipo}`, { fallo: f });
    }
    if (r.status < 200 || r.status >= 300 || !r.body || r.body.features == null) {
      return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'el motor no devolvió features', { status: r.status });
    }
    // features CRUDAS; la etiqueta emocional la pone el LLM (no el motor).
    return { status: 200, data: { features: r.body.features, nota: 'features de prosodia; la etiqueta emocional la infiere el LLM al leerlas.' } };
  }

  async _motorCall(path, payload) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const resp = await fetch(this._baseUrl + path, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal: ctrl.signal
      });
      const text = await resp.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
      return { status: resp.status, body: parsed };
    } finally { clearTimeout(to); }
  }
}

module.exports = MotorSonidoModule;
