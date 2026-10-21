'use strict';

const fs = require('fs');
const path = require('path');
const BaseModule = require('../_shared/base-module');

/**
 * cupula-eventos — CÚPULA DE EVENTOS, cara RUNTIME (el contrato del bus servido al LLM).
 *
 * Hermana de cupula-tools (capacidades) y del bibliotecario (bóveda): mientras
 * cupula-tools sirve las TOOLS que el LLM puede invocar, esta sirve el IDIOMA del
 * bus — qué eventos se emiten, quién los atiende, quién los conduce, quién los
 * publica, y dónde hay FANTASMAS (evento conducido que nadie atiende → timeout
 * silencioso).
 *
 * Reutiliza la MISMA lógica de extracción del vigilante estático
 * (scripts/cupula-eventos/vigilante.js) para que CI y runtime coincidan en la
 * verdad. La diferencia: el vigilante corre en CI y canta; este módulo corre en
 * runtime, construye el CENSO en memoria al cargar (y bajo demanda con rescanear)
 * y lo sirve al LLM con tools de consulta.
 *
 * Cuatro tools universales (candidatas a GLOBAL_TOOLS):
 *   - evento_indice    → resumen del censo (cuántos atendidos/conducidos/publicados/fantasmas)
 *   - evento_detalle   → contrato de UN evento (quién atiende/conduce/publica)
 *   - evento_buscar    → eventos por palabra
 *   - evento_fantasma  → los huecos (rpc fantasma + publish huérfano)
 *
 * Fuente: escaneo de modules/ — manifest module.json + blueprints + pseudocódigo
 * + código + skills de la cantera. Same regexes que el vigilante.
 */

const MODULES = path.join(__dirname, '..', '..', 'modules');
const ATENDIDOS_POR_EL_CORE = new Set(['ui.request']);
const PREFIJOS_DINAMICOS = ['${', '<', '{', '+'];

class CupulaEventosModule extends BaseModule {
  constructor() {
    super();
    this.name = 'cupula-eventos';
    this.version = '0.1.0';

    // Censo en memoria (se reconstruye en onLoad y en rescanear)
    this.atendidos = new Map();   // evento → [quienes lo escuchan]
    this.conducidos = [];         // {evento, por}
    this.publicados = [];         // {evento, por, via}
    this.intenciones = [];        // {evento, por, id, estado}
    this.rechazosMudos = new Map();
    this.censadoEn = null;
  }

  async onLoad(context) {
    this.logger = context.logger || null;
    this.metrics = context.metrics || null;
    this.eventBus = context.eventBus;
    this._escanear();
    this.logger?.info?.('cupula-eventos.loaded', {
      atendidos: this.atendidos.size,
      conducidos: this.conducidos.length,
      publicados: this.publicados.length,
      fantasmas: this._rpcFantasma().length
    });
  }

  async onUnload() {
    this.atendidos.clear();
    this.conducidos = [];
    this.publicados = [];
    this.intenciones = [];
    this.rechazosMudos.clear();
    this.censadoEn = null;
  }

  // =============================================================
  // Escaneo — reutiliza la lógica del vigilante estático
  // =============================================================

  _walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...this._walk(p));
      else out.push(p);
    }
    return out;
  }

  _rel(p) { return path.relative(path.resolve(__dirname, '..', '..'), p); }
  _esDinamico(ev) { return !ev || PREFIJOS_DINAMICOS.some((d) => ev.includes(d)); }

  _sinComentario(linea) {
    const m = linea.match(/(^|[^:])\/\//);
    return m ? linea.slice(0, m.index + m[1].length) : linea;
  }

  _atiende(ev, quien) {
    if (this._esDinamico(ev)) return;
    if (!this.atendidos.has(ev)) this.atendidos.set(ev, []);
    this.atendidos.get(ev).push(quien);
  }

  _escanear() {
    this.atendidos.clear();
    this.conducidos = [];
    this.publicados = [];
    this.intenciones = [];
    this.rechazosMudos.clear();

    const RE_WAIT = /publishAndWait\(\s*['"`]([^'"`]+)['"`]/g;
    const RE_RPC = /_rpc\(\s*['"`]([^'"`]+)['"`]/g;
    const RE_PUB = /(?<!And)[Pp]ublish\(\s*['"`]([^'"`]+)['"`]/g;
    const RE_SUB = /\bsub(?:scribe)?\(\s*['"`]([^'"`]+)['"`]/g;

    const escanearTexto = (texto, por) => {
      let m;
      RE_WAIT.lastIndex = 0; RE_RPC.lastIndex = 0; RE_PUB.lastIndex = 0;
      while ((m = RE_WAIT.exec(texto))) if (!this._esDinamico(m[1])) this.conducidos.push({ evento: m[1], por });
      while ((m = RE_RPC.exec(texto))) if (!this._esDinamico(m[1])) this.conducidos.push({ evento: m[1], por });
      while ((m = RE_PUB.exec(texto))) if (!this._esDinamico(m[1])) this.publicados.push({ evento: m[1], por });
    };

    const escanearJS = (texto, por) => {
      let m; RE_SUB.lastIndex = 0;
      while ((m = RE_SUB.exec(texto))) this._atiende(m[1], por + ' (código)');
      escanearTexto(texto, por);
    };

    for (const f of this._walk(MODULES)) {
      const base = path.basename(f);
      const quien = this._rel(f);

      if (base === 'module.json') {
        let mj; try { mj = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
        const subs = mj.subscribes || (mj.events && mj.events.subscribes) || [];
        const arrSubs = Array.isArray(subs) ? subs : Object.keys(subs);  // tolera dict (banco-ideas)
        for (const s of arrSubs) this._atiende(typeof s === 'string' ? s : s.event, quien);
        const pubs = mj.publishes || (mj.events && mj.events.publishes) || [];
        const arrPubs = Array.isArray(pubs) ? pubs : [];
        for (const p of arrPubs) {
          const ev = typeof p === 'string' ? p : p.event;
          if (!this._esDinamico(ev)) this.publicados.push({ evento: ev, por: quien });
        }
        for (const t of [...(mj.tools || []), ...(mj.tools_http || [])]) if (t && t.name) this._atiende(t.name, quien + ' (tool)');
      }

      if (base.endsWith('.blueprint.json')) {
        let bp; try { bp = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
        for (const e of bp.eventos_que_escucho || []) this._atiende(typeof e === 'string' ? e : e.event, quien);
        for (const e of bp.eventos_publicados || []) {
          const ev = typeof e === 'string' ? e : e.event;
          if (!this._esDinamico(ev)) this.publicados.push({ evento: ev, por: quien });
        }
        const lineasPseudo = [];
        const sinComentario = (linea) => {
          const mm = linea.match(/(^|[^:])\/\//);
          return mm ? linea.slice(0, mm.index + mm[1].length) : linea;
        };
        (function recoger(nodo, bajoPseudo) {
          if (typeof nodo === 'string') { if (bajoPseudo) lineasPseudo.push(sinComentario(nodo)); return; }
          if (Array.isArray(nodo)) { nodo.forEach((n) => recoger(n, bajoPseudo)); return; }
          if (nodo && typeof nodo === 'object') for (const [k, v] of Object.entries(nodo)) recoger(v, bajoPseudo || k === 'pseudocodigo');
        })(bp, false);
        escanearTexto(lineasPseudo.join('\n'), quien);
        for (const t of bp.trabajo_pendiente || []) {
          if (t && typeof t.evento_esperado === 'string') this.intenciones.push({ evento: t.evento_esperado, por: quien, id: t.id || null, estado: t.estado || null });
        }
      }

      if (base === 'SKILL.md') escanearTexto(fs.readFileSync(f, 'utf8'), quien);

      if (base.endsWith('.js') && !f.includes('__tests__') && !f.includes('/frontend/')) {
        escanearJS(fs.readFileSync(f, 'utf8'), quien);
      }
    }

    // blueprints atienden sus operaciones como <modulo>.<op>.request
    for (const f of this._walk(MODULES)) {
      if (!f.endsWith('.blueprint.json')) continue;
      let bp; try { bp = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
      if (!bp.id || !bp.operaciones) continue;
      for (const op of Object.keys(bp.operaciones)) {
        if (op.startsWith('_')) continue;
        this._atiende(`${bp.id}.${op}.request`, this._rel(f) + ' (operación blueprint)');
      }
    }

    this.censadoEn = new Date().toISOString();
  }

  // =============================================================
  // Proyecciones deterministas
  // =============================================================

  _rpcFantasma() {
    const esRespuesta = (ev) => /\.(response|failed|respuesta)$/.test(ev);
    const respondeAlguien = (ev) => this.atendidos.has(ev) || ATENDIDOS_POR_EL_CORE.has(ev);
    const visto = new Set();
    const out = [];
    for (const c of this.conducidos) {
      const key = c.evento + '|' + c.por;
      if (visto.has(key)) continue;
      visto.add(key);
      if (!respondeAlguien(c.evento)) out.push(c);
    }
    return out;
  }

  _publishHuerfano() {
    const esRespuesta = (ev) => /\.(response|failed|respuesta)$/.test(ev);
    const respondeAlguien = (ev) => this.atendidos.has(ev) || ATENDIDOS_POR_EL_CORE.has(ev);
    const visto = new Set();
    const out = [];
    for (const p of this.publicados) {
      if (esRespuesta(p.evento)) continue;
      const key = p.evento + '|' + p.por;
      if (visto.has(key)) continue;
      visto.add(key);
      if (!respondeAlguien(p.evento)) out.push(p);
    }
    return out;
  }

  // =============================================================
  // Bus API — on<Op>Request
  // =============================================================

  async onIndiceRequest(event) { return this._responder(event, 'indice', 'cupula-eventos.indice.response', () => this._indice()); }
  async onDetalleRequest(event) { return this._responder(event, 'detalle', 'cupula-eventos.detalle.response', (d) => this._detalle(d)); }
  async onBuscarRequest(event) { return this._responder(event, 'buscar', 'cupula-eventos.buscar.response', (d) => this._buscar(d)); }
  async onFantasmaRequest(event) { return this._responder(event, 'fantasma', 'cupula-eventos.fantasma.response', () => this._fantasma()); }
  async onRescanearRequest(event) {
    const t0 = Date.now();
    try {
      this._escanear();
      this.metrics?.timing?.('cupula-eventos.rescanear.duration_ms', Date.now() - t0);
      return this._responder(event, 'rescanear', 'cupula-eventos.rescanear.response', () => ({
        actualizado: this.censadoEn, atendidos: this.atendidos.size, conducidos: this.conducidos.length, publicados: this.publicados.length
      }));
    } catch (err) {
      return this.eventBus.publish('cupula-eventos.rescanear.response', { request_id: event?.data?.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  async _responder(event, op, respEvent, fn) {
    const d = event?.data || event || {};
    const request_id = d.request_id;
    try {
      const r = fn(d);
      if (r && r.status) return this.eventBus.publish(respEvent, { request_id, error: r.error });
      this.metrics?.increment?.(`cupula-eventos.${op}.served`);
      return this.eventBus.publish(respEvent, { request_id, result: r });
    } catch (err) {
      this.metrics?.increment?.('cupula-eventos.errors', { kind: op });
      return this.eventBus.publish(respEvent, { request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  // =============================================================
  // Tools del LLM
  // =============================================================

  async handleIndiceTool() {
    try { this.metrics?.increment?.('cupula-eventos.indice.served'); return this._indice(); }
    catch (err) { return this._handleHandlerError('cupula-eventos.indice.tool.failed', err, 'tool_indice'); }
  }

  async handleDetalleTool(args) {
    try {
      if (!args || typeof args !== 'object') return this._errorResponse(400, 'INVALID_INPUT', 'args debe ser un object', { kind: 'shape' });
      if (!args.nombre || typeof args.nombre !== 'string') return this._errorResponse(400, 'INVALID_INPUT', 'indica el nombre del evento', { field: 'nombre' });
      return this._detalle(args);
    } catch (err) { return this._handleHandlerError('cupula-eventos.detalle.tool.failed', err, 'tool_detalle'); }
  }

  async handleBuscarTool(args) {
    try {
      if (!args || typeof args !== 'object') return this._errorResponse(400, 'INVALID_INPUT', 'args debe ser un object', { kind: 'shape' });
      if (!args.q || typeof args.q !== 'string') return this._errorResponse(400, 'INVALID_INPUT', 'indica la palabra a buscar', { field: 'q' });
      return this._buscar(args);
    } catch (err) { return this._handleHandlerError('cupula-eventos.buscar.tool.failed', err, 'tool_buscar'); }
  }

  async handleFantasmaTool() {
    try { this.metrics?.increment?.('cupula-eventos.fantasma.served'); return this._fantasma(); }
    catch (err) { return this._handleHandlerError('cupula-eventos.fantasma.tool.failed', err, 'tool_fantasma'); }
  }

  // =============================================================
  // Proyecciones
  // =============================================================

  _indice() {
    const fantasmas = this._rpcFantasma();
    return {
      status: 200,
      data: {
        actualizado: this.censadoEn,
        atendidos: this.atendidos.size,
        conducidos: this.conducidos.length,
        publicados: this.publicados.length,
        rpc_fantasma: fantasmas.length,
        publish_huerfano: this._publishHuerfano().length,
        intenciones: this.intenciones.length
      }
    };
  }

  _detalle(d) {
    const nombre = String(d?.nombre || '').trim();
    if (!nombre) return this._errorResponse(400, 'INVALID_INPUT', 'indica el nombre del evento', { field: 'nombre' });
    const atendido = this.atendidos.get(nombre);
    const conducido = this.conducidos.filter(c => c.evento === nombre).map(c => c.por);
    const publicado = this.publicados.filter(p => p.evento === nombre).map(p => p.por);
    if (!atendido && !conducido.length && !publicado.length) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `evento '${nombre}' no existe en el contrato del bus`, { evento: nombre });
    }
    return {
      status: 200,
      data: { nombre, atendido_por: atendido || [], conducido_por: conducido, publicado_por: publicado }
    };
  }

  _buscar(d) {
    const q = String(d.q).toLowerCase();
    const topK = (typeof d.topK === 'number' && d.topK > 0) ? d.topK : 15;
    const evs = new Map();
    for (const ev of this.atendidos.keys()) evs.set(ev, 'atendido');
    for (const c of this.conducidos) if (!evs.has(c.evento)) evs.set(c.evento, 'conducido');
    for (const p of this.publicados) if (!evs.has(p.evento)) evs.set(p.evento, 'publicado');
    const hits = [...evs.entries()]
      .filter(([ev]) => ev.toLowerCase().includes(q))
      .slice(0, topK)
      .map(([nombre, tipo]) => ({ nombre, tipo }));
    return { status: 200, data: { q, total: hits.length, eventos: hits } };
  }

  _fantasma() {
    return {
      status: 200,
      data: { rpc_fantasma: this._rpcFantasma(), publish_huerfano: this._publishHuerfano().slice(0, 40) }
    };
  }
}

module.exports = CupulaEventosModule;
