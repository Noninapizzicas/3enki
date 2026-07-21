'use strict';

/**
 * motor-traduce — PUENTE al 2º órgano SENSORIAL de enki-sense: TRADUCIR
 * (texto → texto en otro idioma). Transductor DETERMINISTA (clase 1 del bisturí):
 * el motor es una caja determinista; el "¿está bien traducido?" no lo juzga el
 * sistema, lo transduce el modelo. Rust puro NATIVO (candle + MarianMT/Opus-MT),
 * cero nube. Molde OCR4RS/motor-ojo.
 *
 * Reflejo bus↔HTTP:
 *   bus  motor-traduce.request {texto, de, a} → POST /translate → {texto_traducido}
 * Tool de chat: traducir (en GLOBAL_TOOLS → operativa desde el minuto 1).
 *
 * DISCIPLINA (patrón Enki):
 *   - SIN BOTÓN: nace operativo. Traducir es cómputo local puro (texto→texto, sin
 *     red/shell/ops peligrosas); un interruptor no protegería ningún estado
 *     nombrable → ceremonia, se disuelve (P0, la pregunta madre).
 *   - DEGRADA HONESTO: si el motor no responde → 503 sin_motor. Par de idiomas no
 *     soportado → 422 PAR_NO_SOPORTADO (no inventa una traducción de un par que no
 *     tiene). Nunca finge texto.
 *
 * Ver guión: arquitectura/decisiones/propuestas/enki-sense.md
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// Puerto del servicio de traducción (enki-sense, Rust nativo). Rango sensorial :812x.
const DEFAULT_BASE = 'http://localhost:8121';

class MotorTraduceModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-traduce';
    this.version = '0.1.0';       // SIN BOTÓN desde el nacimiento (principio enki-sense)
    this._baseUrl = DEFAULT_BASE;
    this._timeoutMs = 30000;
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config['motor-traduce']))) || {};
    this._baseUrl = String(process.env.MOTOR_TRADUCE_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._timeoutMs = Number(cfg.timeout_ms) || 30000;
    this.logger?.info?.('motor-traduce.loaded', { base_url: this._baseUrl });
  }

  // SIN BOTÓN. Traducir es cómputo local puro: un interruptor no protege ningún
  // estado nombrable. Único guard: degradación honesta (sin_motor). Operativo ya.

  // ── RPC del bus + tool de chat ──
  onTraducirRequest(e) { return this._atender(e, 'traducir', 'motor-traduce.response', (d) => this._traducir(d)); }
  async handleTraducirTool(args) { return this._traducir(args || {}); }

  // ── degradación honesta: el ÚNICO guard es que el motor Rust responda ──
  _degradado(motivo) {
    const prescripcion = {
      sin_motor: 'el servicio enki-sense de traducción no responde en MOTOR_TRADUCE_URL — verifica que esté desplegado y su /health. NO ES: par inválido.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `motor-traduce degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }

  // ── traducir: {texto, de, a} → {texto_traducido} ──
  async _traducir(input) {
    if (!input || !input.texto) return this._invalid('texto');
    if (!input.de) return this._invalid('de');
    if (!input.a) return this._invalid('a');
    // Normaliza códigos de idioma en UNA frontera (es-ES → es, EN → en).
    const de = this._normalizarIdioma(input.de);
    const a = this._normalizarIdioma(input.a);
    if (de === a) return { status: 200, data: { texto_traducido: String(input.texto), de, a, sin_cambio: true } };
    let r;
    try { r = await this._motorCall('/translate', { texto: String(input.texto), de, a }); }
    catch (_) { return this._degradado('sin_motor'); }
    // El motor NUNCA inventa: par no soportado / fallo → {fallo:{tipo,motivo}}.
    if (r.body && r.body.fallo) {
      const f = r.body.fallo;
      const code = f.tipo === 'par_no_soportado' ? 'PAR_NO_SOPORTADO' : 'TRADUCCION_FALLIDA';
      return this._errorResponse(f.tipo === 'par_no_soportado' ? 422 : (f.tipo === 'timeout' ? 504 : 502), code, `no se pudo traducir: ${f.motivo || f.tipo}`, { fallo: f, de, a });
    }
    if (r.status < 200 || r.status >= 300 || !r.body || r.body.texto_traducido == null) {
      return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'el motor no devolvió traducción', { status: r.status });
    }
    return { status: 200, data: { texto_traducido: r.body.texto_traducido, de, a } };
  }

  // Códigos de idioma → ISO 639-1 de dos letras, minúsculas (es-ES → es).
  _normalizarIdioma(code) {
    return String(code || '').trim().toLowerCase().split(/[-_]/)[0];
  }

  // POST al servicio de traducción. Overridable en test.
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

module.exports = MotorTraduceModule;
