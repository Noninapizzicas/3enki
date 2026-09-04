/**
 * disenador_parametrico — Diseñador paramétrico → puente OpenSCAD MCP (PASO 4 del plan-construccion).
 *
 * Contrato: genera STL/3MF paramétricos y estima tiempo de impresión, alimentando
 * Modelo.tiempo_estimado de la cola. Es un REFLEJO + PUENTE: la mitad reflejo valida
 * y orquesta; la mitad puente habla con el servidor OpenSCAD MCP (SSE) por HTTP.
 *
 * FORMA: REFLEJO + PUERTO EXTERNO (portal-mcp.md / herramientas-externas.md).
 *   - generar_stl(parametros)  → export_model (scad_content + output_format) → { archivo }
 *   - estimar_tiempo(parametros) → heurística determinista (volumen/velocidad) → { minutos }
 *
 * El puente es un CLIENTE MCP SSE: initialize → mcp-session-id → tools/call. Sin acoplar
 * al motor tras él: si el servidor no responde, 503 UPSTREAM_UNREACHABLE (degradación
 * honesta, nunca silencio). El scad_content se construye desde parametros (diseño
 * paramétrico puro: la geometría es función de sus variables de entrada).
 *
 * Invariante (n.º 7 del plan): lo que genera es SUGERENCIA; solo pasa a Modelo real vía
 * cola_modelos.agregar. PARAMETROS_INVALIDOS → 422 con hint (freno fértil, no muro mudo).
 *
 * v0.1.0 (primera pasada del plan-construccion): puente SSE + generación STL + estimación.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const DEFAULT_BASE = 'http://localhost:3100';
const FORMATOS = new Set(['stl', '3mf', 'amf', 'off', 'dxf', 'svg']);

// Velocidad de impresión de referencia (mm³/min) para la estimación de tiempo.
// Creality SPARKX i7 · PETG · 0.4mm nozzle · ~60mm/s · capa 0.2mm → caudal volumétrico
// aproximado. Es una heurística determinista, NO un slicer: el tiempo real lo da la
// máquina/slicer; esto solo llena Modelo.tiempo_estimado como sugerencia.
const VELOCIDAD_REF = 7200; // mm³/min

/**
 * Construye el código OpenSCAD paramétrico desde los parámetros del diseño.
 * La geometría es función de sus variables de entrada (diseño paramétrico puro).
 * @param {Object} p  parametros { forma, dimensiones:{...}, ... }
 * @returns {string} código OpenSCAD
 */
function construirScad(p) {
  const forma = String(p.forma || 'caja').toLowerCase();
  const d = p.dimensiones || {};
  const w = Number(d.ancho) || 20;
  const h = Number(d.alto) || 20;
  const prof = Number(d.profundo) || 20;
  const pared = Number(d.pared) || 2;

  if (forma === 'caja') {
    // Caja paramétrica con pared: exterior w×h×prof, hueco interior restando pared.
    return [
      `// caja parametrica (generada por disenador_parametrico)`,
      `ancho = ${w}; alto = ${h}; profundo = ${prof}; pared = ${pared};`,
      `difference() {`,
      `  cube([ancho, alto, profundo]);`,
      `  translate([pared, pared, pared]) cube([ancho-2*pared, alto-2*pared, profundo]);`,
      `}`,
    ].join('\n');
  }
  if (forma === 'cilindro') {
    const r = Number(d.radio) || 10;
    return [
      `// cilindro parametrico`,
      `radio = ${r}; alto = ${h};`,
      `cylinder(h=alto, r=radio, $fn=64);`,
    ].join('\n');
  }
  // Forma desconocida → el validador la rechaza antes de llegar aquí.
  return `cube([${w}, ${h}, ${prof}]);`;
}

/**
 * Estima minutos de impresión por volumen (heurística determinista).
 * @param {Object} p  parametros
 * @returns {number} minutos estimados (>=1)
 */
function estimarMinutos(p) {
  const d = p.dimensiones || {};
  const w = Number(d.ancho) || 20;
  const h = Number(d.alto) || 20;
  const prof = Number(d.profundo) || 20;
  const volumen = w * h * prof; // mm³ (aprox. bruto del bounding box)
  const minutos = Math.max(1, Math.round(volumen / VELOCIDAD_REF));
  return minutos;
}

class DisenadorParametricoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'disenador_parametrico';
    this.version = 'reflejo-0.1.0';
    this._baseUrl = DEFAULT_BASE;
    this._timeoutMs = 30000;
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config['disenador_parametrico']))) || {};
    this._baseUrl = String(process.env.OPENSCAD_MCP_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._timeoutMs = Number(cfg.timeout_ms) || 30000;
    this.logger?.info?.('disenador_parametrico.loaded', { base_url: this._baseUrl });
  }

  // ── RPC del bus ──
  onGenerarStlRequest(e) { return this._atender(e, 'generar_stl', 'disenador_parametrico.generar_stl.response', (d) => this._generarStl(d)); }
  onEstimarTiempoRequest(e) { return this._atender(e, 'estimar_tiempo', 'disenador_parametrico.estimar_tiempo.response', (d) => this._estimarTiempo(d)); }

  // ── degradación honesta: el ÚNICO guard es que el servidor MCP responda ──
  _degradado(motivo) {
    const prescripcion = {
      sin_motor: 'el servidor OpenSCAD MCP no responde en OPENSCAD_MCP_URL — verifica que deployment/openscad-mcp esté levantado y su /mcp. NO ES: parámetros inválidos.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `disenador_parametrico degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }

  // ── generar_stl: parametros → { archivo } ──
  async _generarStl(input) {
    if (!input || !input.project_id) return this._invalid('project_id');
    if (!input.parametros || typeof input.parametros !== 'object') return this._invalid('parametros');
    const p = input.parametros;
    const formato = String(p.formato || 'stl').toLowerCase();
    if (!FORMATOS.has(formato)) {
      return this._errorResponse(422, 'PARAMETROS_INVALIDOS', `formato debe ser uno de: ${[...FORMATOS].join(', ')}`, { hint: 'usa stl o 3mf para impresión' });
    }
    const scad = construirScad(p);
    if (!scad) return this._errorResponse(422, 'PARAMETROS_INVALIDOS', 'no se pudo construir el diseño paramétrico', { hint: 'revisa forma y dimensiones' });

    let r;
    try { r = await this._mcpCall('export_model', { scad_content: scad, output_format: formato }); }
    catch (_) { return this._degradado('sin_motor'); }

    if (r.isError || !r.structuredContent || !r.structuredContent.success) {
      const msg = (r.texto || 'el servidor no exportó el modelo').slice(0, 300);
      return this._errorResponse(422, 'EXPORT_FALLIDO', `no se pudo exportar: ${msg}`, { hint: 'revisa el código OpenSCAD generado' });
    }
    const sc = r.structuredContent;
    return { status: 200, data: { archivo: sc.output_path, formato: sc.format || formato, bytes: sc.file_size_bytes } };
  }

  // ── estimar_tiempo: parametros → { minutos } ──
  async _estimarTiempo(input) {
    if (!input || !input.project_id) return this._invalid('project_id');
    if (!input.parametros || typeof input.parametros !== 'object') return this._invalid('parametros');
    const minutos = estimarMinutos(input.parametros);
    return { status: 200, data: { minutos, metodo: 'heuristica_volumen', nota: 'sugerencia — el tiempo real lo da el slicer/máquina' } };
  }

  // ── Cliente MCP SSE: initialize → session-id → tools/call ──
  // Overridable en test (se inyecta un _mcpCall falso).
  async _mcpCall(tool, args) {
    const sid = await this._mcpInitialize();
    if (!sid) throw new Error('no session');
    const body = await this._mcpPost('/mcp', {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: tool, arguments: args }
    }, sid);
    // body es la data line SSE del resultado (JSON-RPC con id 2).
    if (!body || body.id !== 2) return { isError: true, texto: 'respuesta MCP inesperada' };
    const res = body.result || {};
    const content = (res.content || []).find((c) => c.type === 'text');
    return {
      isError: !!res.isError,
      texto: content ? content.text : '',
      structuredContent: res.structuredContent || null
    };
  }

  async _mcpInitialize() {
    const body = await this._mcpPost('/mcp', {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'disenador_parametrico', version: '0.1.0' } }
    }, null, true);
    return body ? body.sessionId : null;
  }

  // POST SSE al servidor MCP. Devuelve la data line JSON-RPC (o {sessionId} en initialize).
  async _mcpPost(path, payload, sessionId, capturarSesion) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const headers = {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream'
      };
      if (sessionId) headers['mcp-session-id'] = sessionId;
      const resp = await fetch(this._baseUrl + path, {
        method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal
      });
      if (capturarSesion) {
        const sid = resp.headers.get('mcp-session-id');
        if (sid) return { sessionId: sid };
      }
      const text = await resp.text();
      // Parsear la última data line SSE con el id que buscamos.
      let resultado = null;
      for (const linea of text.split('\n')) {
        if (!linea.startsWith('data: ')) continue;
        try {
          const d = JSON.parse(linea.slice(6));
          if (d && d.id === payload.id) { resultado = d; break; }
        } catch (_) { /* ignorar líneas no-JSON */ }
      }
      return resultado;
    } finally { clearTimeout(to); }
  }
}

module.exports = DisenadorParametricoReflejo;
module.exports.construirScad = construirScad;
module.exports.estimarMinutos = estimarMinutos;
