/**
 * puente_creality — PUENTE CrealityPrint (PASO 8 del plan-construccion).
 *
 * Contrato: frontera con el PC del dueño (CrealityPrint V7.2.1, 8GB RAM). Orquesta
 * el slice del STL → gcode, sube el gcode, arranca la impresión y la monitorea.
 * El perfil CrealityPrint se gestiona desde Enki. La detección de 'complete' se
 * hace por evento (no por polling): cuando la máquina termina, se emite
 * maquina.liberada para que el orquestador encadene la siguiente pieza.
 *
 * FORMA: REFLEJO + PUERTO EXTERNO (portal-mcp.md / herramientas-externas.md).
 *   - orquestar_slice(stl_id, maquina) → gcode_id (consulta cupula_stl, slica via
 *     CrealityPrint, registra en cupula_gcode).
 *   - arrancar_impresion(gcode_id) → dispara la impresión en la máquina.
 *   - estado_impresion() → reporta el estado actual.
 *   - onComplete (evento) → emite maquina.liberada.
 *
 * El puente es un CLIENTE HTTP hacia el agente CrealityPrint del PC del dueño
 * (un servicio local que habla con CrealityPrint). Sin acoplar al motor tras él:
 * si el PC no responde, 503 UPSTREAM_UNREACHABLE (degradación honesta, nunca silencio).
 *
 * Invariante (n.º 6 del plan): si arrancar_impresion falla, el orquestador revierte
 * a PENDIENTE y reintenta — el puente nunca deja la máquina muda.
 *
 * v0.1.0 (primera pasada del plan-construccion): puente HTTP + slice + arranque + monitoreo.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const DEFAULT_BASE = 'http://localhost:3200'; // agente CrealityPrint del PC del dueño
const MAQUINA_DEFAULT = 'SPARKX_i7';

class PuenteCrealityReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puente_creality';
    this.version = 'reflejo-0.1.0';
    this._baseUrl = DEFAULT_BASE;
    this._timeoutMs = 30000;
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config['puente_creality']))) || {};
    this._baseUrl = String(process.env.CREALITY_BRIDGE_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    this._timeoutMs = Number(cfg.timeout_ms) || 30000;
    this.logger?.info?.('puente_creality.loaded', { base_url: this._baseUrl });
  }

  // ── RPC del bus ──
  onOrquestarSliceRequest(e)     { return this._atender(e, 'orquestar_slice', 'puente_creality.orquestar_slice.response', (d) => this._orquestarSlice(d)); }
  onArrancarImpresionRequest(e)  { return this._atender(e, 'arrancar_impresion', 'puente_creality.arrancar_impresion.response', (d) => this._arrancarImpresion(d)); }
  onEstadoImpresionRequest(e)    { return this._atender(e, 'estado_impresion', 'puente_creality.estado_impresion.response', (d) => this._estadoImpresion(d)); }

  // ── degradación honesta: el ÚNICO guard es que el agente del PC responda ──
  _degradado(motivo) {
    const prescripcion = {
      sin_pc: 'el agente CrealityPrint del PC del dueño no responde en CREALITY_BRIDGE_URL — verifica que el servicio local esté levantado. NO ES: parámetros inválidos.'
    }[motivo] || '';
    return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: `puente_creality degradado: ${motivo}${prescripcion ? ' — ' + prescripcion : ''}`, details: { degradado: true, motivo } } };
  }

  // ── orquestar_slice: stl_id + maquina → gcode_id ──
  // 1. Consulta cupula_stl.obtener (el STL universal).
  // 2. Consulta cupula_gcode.obtener_por_maquina (¿ya hay receta firmada para esa máquina?).
  // 3. Si no hay, pide al agente CrealityPrint que slicee (perfil gestionado desde Enki).
  // 4. Registra el gcode en cupula_gcode (firmado, cacheado por máquina).
  async _orquestarSlice(input) {
    if (!input || !input.project_id) return this._invalid('project_id');
    if (!input.stl_id) return this._invalid('stl_id');
    const maquina = input.maquina || MAQUINA_DEFAULT;

    // 1. STL universal.
    const stlResp = await this._rpc('cupula_stl.obtener.request', { project_id: input.project_id, id: input.stl_id });
    if (!stlResp) return this._errorResponse(502, 'UPSTREAM_UNREACHABLE', 'no se pudo consultar la cúpula STL', {});
    if (stlResp.status !== 200) {
      return this._errorResponse(stlResp.status, stlResp.error?.code || 'RESOURCE_NOT_FOUND', stlResp.error?.message || 'stl_no_encontrado', { stl_id: input.stl_id });
    }
    const stl = stlResp.data.stl;

    // 2. ¿Ya hay receta firmada para esa máquina? (cache por máquina).
    const gcodeResp = await this._rpc('cupula_gcode.obtener_por_maquina.request', { project_id: input.project_id, stl_id: input.stl_id, maquina });
    if (gcodeResp && gcodeResp.status === 200 && gcodeResp.data && gcodeResp.data.gcode) {
      return { status: 200, data: { gcode_id: gcodeResp.data.gcode.id, cacheado: true } };
    }

    // 3. Slicear via el agente CrealityPrint del PC del dueño.
    let r;
    try {
      r = await this._httpPost('/slice', { stl: stl.archivo, maquina, perfil: input.perfil || 'default' });
    } catch (_) { return this._degradado('sin_pc'); }
    if (!r || r.error) {
      return this._errorResponse(422, 'SLICE_FALLIDO', (r && r.error) || 'el agente no pudo slicear el STL', { hint: 'revisa el perfil CrealityPrint y el archivo STL' });
    }

    // 4. Registrar el gcode firmado en la cúpula.
    const reg = await this._rpc('cupula_gcode.registrar.request', {
      project_id: input.project_id,
      stl_id: input.stl_id,
      maquina,
      archivo: r.gcode_path,
      hash: r.hash || null,
      firma: r.firma || null,
      perfil: input.perfil || 'default'
    });
    if (!reg || reg.status < 200 || reg.status >= 300) {
      return this._errorResponse(502, 'UPSTREAM_UNREACHABLE', 'no se pudo registrar el gcode en la cúpula', {});
    }
    return { status: 200, data: { gcode_id: reg.data.gcode.id, cacheado: false } };
  }

  // ── arrancar_impresion: gcode_id → dispara la impresión ──
  async _arrancarImpresion(input) {
    if (!input || !input.project_id) return this._invalid('project_id');
    if (!input.gcode_id) return this._invalid('gcode_id');

    // Obtener el gcode (para saber su archivo y máquina).
    const gcodeResp = await this._rpc('cupula_gcode.listar.request', { project_id: input.project_id });
    if (!gcodeResp || gcodeResp.status !== 200) {
      return this._errorResponse(502, 'UPSTREAM_UNREACHABLE', 'no se pudo consultar la cúpula GCODE', {});
    }
    const gcode = (gcodeResp.data.gcodes || []).find(g => g.id === input.gcode_id);
    if (!gcode) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'gcode_no_encontrado', { gcode_id: input.gcode_id });

    let r;
    try {
      r = await this._httpPost('/print', { gcode: gcode.archivo, maquina: gcode.maquina });
    } catch (_) { return this._degradado('sin_pc'); }
    if (!r || r.error) {
      // Invariante n.º 6: el orquestador revierte a PENDIENTE y reintenta.
      return this._errorResponse(502, 'ARRANQUE_FALLIDO', (r && r.error) || 'el agente no pudo arrancar la impresión', { hint: 'revisa la máquina y el gcode' });
    }
    this._publicarEvento('puente_creality.impresion_arrancada', { project_id: input.project_id, gcode_id: input.gcode_id, instante: new Date().toISOString() });
    return { status: 200, data: { arrancada: true, trabajo: r.trabajo || null } };
  }

  // ── estado_impresion: reporta el estado actual de la máquina ──
  async _estadoImpresion(input) {
    if (!input || !input.project_id) return this._invalid('project_id');

    let r;
    try {
      r = await this._httpGet('/status');
    } catch (_) { return this._degradado('sin_pc'); }
    if (!r) return this._errorResponse(502, 'UPSTREAM_UNREACHABLE', 'el agente no reportó estado', {});
    return { status: 200, data: { estado: r.estado || 'desconocido', progreso: r.progreso || 0, trabajo: r.trabajo || null } };
  }

  // ── onComplete: la máquina terminó → emite maquina.liberada ──
  // El agente del PC llama a este endpoint (o el puente escucha el evento) cuando
  // CrealityPrint reporta 'complete'. Emitimos maquina.liberada para que el
  // orquestador encadene la siguiente pieza (cierra el ciclo).
  onComplete(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return;
    this._publicarEvento('maquina.liberada', { project_id: d.project_id, instante: new Date().toISOString(), trabajo: d.trabajo || null });
  }

  // ── Cliente HTTP hacia el agente CrealityPrint ──
  async _httpPost(path, body) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const resp = await fetch(this._baseUrl + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      if (!resp.ok) return { error: `HTTP ${resp.status}` };
      return await resp.json();
    } finally { clearTimeout(to); }
  }

  async _httpGet(path) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this._timeoutMs);
    try {
      const resp = await fetch(this._baseUrl + path, { signal: ctrl.signal });
      if (!resp.ok) return null;
      return await resp.json();
    } finally { clearTimeout(to); }
  }

  _publicarEvento(evento, payload) {
    try { this.eventBus?.publish(evento, payload); } catch (_) { /* best-effort */ }
  }
}

module.exports = PuenteCrealityReflejo;
