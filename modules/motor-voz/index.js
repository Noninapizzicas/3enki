'use strict';

/**
 * motor-voz — PUENTE al 4º órgano SENSORIAL de enki-sense: DECIR (texto → voz).
 * Transductor DETERMINISTA (clase 1 del bisturí): mismo texto+voz → mismo audio.
 * Rust NATIVO (piper-rs = voces Piper ONNX vía ort), cero nube. Voces en ESPAÑOL.
 *
 * Reflejo bus↔HTTP:
 *   bus  motor-voz.decir.request {texto, voz?} → POST /speak → {audio_base64, sample_rate}
 * Tool de chat: decir (en GLOBAL_TOOLS).
 *
 * DISCIPLINA (patrón Enki):
 *   - SIN BOTÓN: decir es cómputo local puro (texto→audio, salida); no captura
 *     nada del entorno → un interruptor no protege ningún estado nombrable
 *     (a diferencia de oír, que toca el micrófono). Nace operativo.
 *   - DEGRADA HONESTO: motor no responde → 503 sin_motor. Voz no provisionada →
 *     422 VOZ_NO_DISPONIBLE. Nunca finge audio.
 *
 * Ver guión: arquitectura/decisiones/propuestas/enki-sense.md
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const DEFAULT_BASE = 'http://localhost:8124';

class MotorVozModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-voz';
    this.version = '0.1.0';       // SIN BOTÓN desde el nacimiento (principio enki-sense)
    this._baseUrl = DEFAULT_BASE;
    this._timeoutMs = 30000;
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config['motor-voz']))) || {};
    this._baseUrl = String(process.env.MOTOR_VOZ_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._timeoutMs = Number(cfg.timeout_ms) || 30000;
    this.logger?.info?.('motor-voz.loaded', { base_url: this._baseUrl });
  }

  // SIN BOTÓN: salida pura (no toca micrófono). Único guard: degradación honesta.

  onDecirRequest(e) { return this._atender(e, 'decir', 'motor-voz.decir.response', (d) => this._decir(d)); }
  async handleDecirTool(args) { return this._decir(args || {}); }

  _degradado(motivo) {
    const prescripcion = {
      sin_motor: 'el servicio enki-sense de voz no responde en MOTOR_VOZ_URL — verifica que esté desplegado y su /health. NO ES: texto inválido.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `motor-voz degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }

  async _decir(input) {
    if (!input || !input.texto) return this._invalid('texto');
    const payload = { texto: String(input.texto), ...(input.voz ? { voz: String(input.voz) } : {}) };
    let r;
    try { r = await this._motorCall('/speak', payload); }
    catch (_) { return this._degradado('sin_motor'); }
    if (r.body && r.body.fallo) {
      const f = r.body.fallo;
      const code = f.tipo === 'voz_no_disponible' ? 'VOZ_NO_DISPONIBLE' : 'SINTESIS_FALLIDA';
      return this._errorResponse(f.tipo === 'voz_no_disponible' ? 422 : 502, code, `no se pudo sintetizar: ${f.motivo || f.tipo}`, { fallo: f });
    }
    if (r.status < 200 || r.status >= 300 || !r.body || r.body.audio_base64 == null) {
      return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'el motor no devolvió audio', { status: r.status });
    }
    return { status: 200, data: { audio_base64: r.body.audio_base64, sample_rate: r.body.sample_rate ?? null, formato: 'wav', voz: r.body.voz ?? (input.voz || null) } };
  }

  async _motorCall(path, payload) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const resp = await fetch(this._baseUrl + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
      const text = await resp.text();
      let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
      return { status: resp.status, body: parsed };
    } finally { clearTimeout(to); }
  }
}

module.exports = MotorVozModule;
