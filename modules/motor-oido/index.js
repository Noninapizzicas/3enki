'use strict';

/**
 * motor-oido — PUENTE al 3er órgano SENSORIAL de enki-sense: OÍR (audio → texto).
 * Transductor DETERMINISTA (clase 1 del bisturí): whisper transcribe la señal; la
 * confianza la REPORTA, no la juzga. Interpretar lo que se QUISO decir ya es el
 * LLM de página; este órgano solo transcribe lo que se DIJO. Rust puro NATIVO
 * (candle-whisper), cero nube. Molde OCR4RS/motor-traduce.
 *
 * Reflejo bus↔HTTP:
 *   bus  motor-oido.transcribir.request {audio_base64, idioma?} → POST /transcribe
 *        → {texto, idioma, confianza}
 * Tool de chat: transcribir (en GLOBAL_TOOLS → operativa desde el minuto 1).
 *
 * DISCIPLINA (patrón Enki):
 *   - SIN BOTÓN en el MOTOR: transcribir es cómputo local puro sobre un audio que
 *     YA llega. El guard de PRIVACIDAD del micrófono (no escuchar sin
 *     consentimiento) es real, PERO vive en el BORDE (permiso del dispositivo al
 *     CAPTURAR), no como un toggle de este servidor. Aquí no hay estado nombrable
 *     que un botón proteja → sin botón.
 *   - DEGRADA HONESTO: si el motor no responde → 503 sin_motor. Audio ilegible →
 *     {texto:'', confianza:0}. Nunca inventa palabras.
 *
 * Ver guión: arquitectura/decisiones/propuestas/enki-sense.md
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// Puerto del servicio de transcripción (enki-sense, Rust nativo). Rango sensorial :812x.
const DEFAULT_BASE = 'http://localhost:8122';

class MotorOidoModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-oido';
    this.version = '0.1.0';       // SIN BOTÓN desde el nacimiento (principio enki-sense)
    this._baseUrl = DEFAULT_BASE;
    this._timeoutMs = 60000;      // transcribir tarda más que render/traducir
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config['motor-oido']))) || {};
    this._baseUrl = String(process.env.MOTOR_OIDO_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._timeoutMs = Number(cfg.timeout_ms) || 60000;
    this.logger?.info?.('motor-oido.loaded', { base_url: this._baseUrl });
  }

  // SIN BOTÓN en el motor. El guard de privacidad del micro vive en el BORDE
  // (consentimiento al CAPTURAR). Único guard aquí: degradación honesta (sin_motor).

  // ── RPC del bus + tool de chat ──
  onTranscribirRequest(e) { return this._atender(e, 'transcribir', 'motor-oido.transcribir.response', (d) => this._transcribir(d)); }
  async handleTranscribirTool(args) { return this._transcribir(args || {}); }

  // ── degradación honesta: el ÚNICO guard es que el motor Rust responda ──
  _degradado(motivo) {
    const prescripcion = {
      sin_motor: 'el servicio enki-sense de transcripción no responde en MOTOR_OIDO_URL — verifica que esté desplegado y su /health. NO ES: audio inválido.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `motor-oido degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }

  // ── transcribir: {audio_base64, idioma?} → {texto, idioma, confianza} ──
  async _transcribir(input) {
    if (!input || !input.audio_base64) return this._invalid('audio_base64');
    const payload = { audio_base64: String(input.audio_base64), ...(input.idioma ? { idioma: this._normalizarIdioma(input.idioma) } : {}) };
    let r;
    try { r = await this._motorCall('/transcribe', payload); }
    catch (_) { return this._degradado('sin_motor'); }
    if (r.body && r.body.fallo) {
      const f = r.body.fallo;
      return this._errorResponse(f.tipo === 'timeout' ? 504 : 502, 'TRANSCRIPCION_FALLIDA', `no se pudo transcribir: ${f.motivo || f.tipo}`, { fallo: f });
    }
    if (r.status < 200 || r.status >= 300 || !r.body || r.body.texto == null) {
      return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'el motor no devolvió transcripción', { status: r.status });
    }
    return { status: 200, data: { texto: r.body.texto, idioma: r.body.idioma ?? (input.idioma || null), confianza: r.body.confianza ?? null } };
  }

  _normalizarIdioma(code) {
    return String(code || '').trim().toLowerCase().split(/[-_]/)[0];
  }

  // POST al servicio de transcripción. Overridable en test.
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

module.exports = MotorOidoModule;
