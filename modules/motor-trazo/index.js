'use strict';

/**
 * motor-trazo — PUENTE al órgano PERCEPTOR de enki-sense: INTERPRETAR-TRAZO
 * (trazos de canvas → geometría). Clase 2 del bisturí (PERCEPTOR), PARTIDO en dos:
 *   - la mitad MEDIBLE (geometría: línea/círculo/rectángulo/polígono, bbox,
 *     cerrado, nº de vértices) = REFLEJO → este motor Rust la calcula, determinista.
 *   - la mitad de JUICIO (la INTENCIÓN del trazo: "una flecha que apunta a X",
 *     "un boceto de mesa") = FUZZY → la infiere el LLM DE PÁGINA al leer la
 *     geometría. El motor NO adivina intención.
 * Su salida sube a la PROPIOCEPCIÓN — el LLM la lee al turno siguiente (la joya).
 *
 * Reflejo bus↔HTTP:
 *   bus  motor-trazo.interpretar.request {trazos:[[{x,y}...]...]} → POST /interpret
 *        → {elementos:[{tipo, bbox, cerrado, n_vertices}...]}
 * Tool de chat: interpretar_trazo (en GLOBAL_TOOLS).
 *
 * DISCIPLINA (patrón Enki):
 *   - SIN BOTÓN en el motor: geometría local pura sobre puntos que YA llegan. El
 *     guard (privacidad del canvas) vive en el BORDE (al capturar), no aquí.
 *   - DEGRADA HONESTO: motor no responde → 503 sin_motor. NO inventa una forma
 *     (solo da geometría; el juicio de intención es del LLM).
 *
 * Ver guión: arquitectura/decisiones/propuestas/enki-sense.md
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const DEFAULT_BASE = 'http://localhost:8125';

class MotorTrazoModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-trazo';
    this.version = '0.1.0';       // SIN BOTÓN desde el nacimiento (principio enki-sense)
    this._baseUrl = DEFAULT_BASE;
    this._timeoutMs = 15000;
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config['motor-trazo']))) || {};
    this._baseUrl = String(process.env.MOTOR_TRAZO_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._timeoutMs = Number(cfg.timeout_ms) || 15000;
    this.logger?.info?.('motor-trazo.loaded', { base_url: this._baseUrl });
  }

  // SIN BOTÓN en el motor (guard del canvas = en el borde). Único guard aquí:
  // degradación honesta (sin_motor).

  // ── RPC del bus + tool de chat ──
  onInterpretarRequest(e) { return this._atender(e, 'interpretar', 'motor-trazo.interpretar.response', (d) => this._interpretar(d)); }
  async handleInterpretarTool(args) { return this._interpretar(args || {}); }

  // ── degradación honesta ──
  _degradado(motivo) {
    const prescripcion = {
      sin_motor: 'el servicio enki-sense de trazo no responde en MOTOR_TRAZO_URL — verifica que esté desplegado y su /health. NO ES: trazos inválidos.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `motor-trazo degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }

  // ── interpretar: {trazos} → {elementos} ──
  async _interpretar(input) {
    if (!input || !Array.isArray(input.trazos)) return this._invalid('trazos');
    let r;
    try { r = await this._motorCall('/interpret', { trazos: input.trazos }); }
    catch (_) { return this._degradado('sin_motor'); }
    if (r.body && r.body.fallo) {
      const f = r.body.fallo;
      return this._errorResponse(f.tipo === 'timeout' ? 504 : 502, 'INTERPRETACION_FALLIDA', `no se pudo interpretar: ${f.motivo || f.tipo}`, { fallo: f });
    }
    if (r.status < 200 || r.status >= 300 || !r.body || !Array.isArray(r.body.elementos)) {
      return this._errorResponse(r.status >= 400 ? r.status : 502, 'UPSTREAM_INVALID_RESPONSE', 'el motor no devolvió elementos', { status: r.status });
    }
    // geometría CRUDA; la INTENCIÓN (flecha, boceto, tachón) la infiere el LLM.
    return { status: 200, data: { elementos: r.body.elementos, total: r.body.elementos.length, nota: 'geometría de los trazos; la INTENCIÓN (flecha, boceto, tachón) la infiere el LLM al leerla.' } };
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

module.exports = MotorTrazoModule;
