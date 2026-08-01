/**
 * rpc-index v0.1.0 — Reflejo JS: EL ÍNDICE RPC del sistema.
 *
 * Genera en onLoad el catálogo de TODOS los RPC .request del ecosistema
 * (escanea los module.json bajo modules/ → subscribes con evento *.request) y lo
 * sirve bajo demanda. Es el cierre del círculo del chat: el LLM consulta el
 * nombre EXACTO de un evento + su entrada antes de publicar con
 * bus.publishAndWait — no lo improvisa (causa de cascadas de tools fallidas).
 *
 *   rpc.buscar { query } → [{ evento, modulo, descripcion }]  (match por nombre/módulo/descripción)
 *   rpc.ver    { modulo } → todos los RPC .request de ese módulo
 *
 * Patrón gemelo de la cantera: índice + consulta bajo demanda. El índice NO se
 * inyecta entero (~20 KB por turno) — se busca cuando hace falta.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BaseModule = require('../_shared/base-module');

class RpcIndexReflejo extends BaseModule {
  constructor() {
    super();
    this.name = 'rpc-index';
    this.version = '0.1.0';
    this.indice = [];        // [{ evento, modulo, descripcion }]
    this.porModulo = new Map(); // modulo → [{ evento, descripcion }]
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.eventBus = context.eventBus;
    this._generar();
    this.logger?.info?.('rpc-index.loaded', { rpc_total: this.indice.length, modulos: this.porModulo.size });
  }

  async onUnload() {
    this.indice = [];
    this.porModulo.clear();
  }

  // ==========================================
  // Generación del índice (determinista, en memoria)
  // ==========================================

  _generar() {
    const modulesRoot = path.resolve(__dirname, '..');
    const cola = [modulesRoot];
    const vistos = new Set();
    while (cola.length > 0) {
      const dir = cola.pop();
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { cola.push(p); continue; }
        if (e.name !== 'module.json') continue;
        if (vistos.has(p)) continue;
        vistos.add(p);
        this._indexarManifest(p);
      }
    }
    // Orden estable por evento
    this.indice.sort((a, b) => a.evento.localeCompare(b.evento));
  }

  _indexarManifest(moduleJsonPath) {
    let mj;
    try { mj = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8')); } catch (_) { return; }
    const modulo = mj.name || path.basename(path.dirname(moduleJsonPath));
    const subs = Array.isArray(mj.subscribes) ? mj.subscribes : [];
    const rpcs = [];
    for (const s of subs) {
      const ev = (s && typeof s === 'object' && s.event) || null;
      if (!ev || !ev.endsWith('.request')) continue;
      const descripcion = (s && typeof s === 'object' && s.description) || '';
      rpcs.push({ evento: ev, descripcion });
      this.indice.push({ evento: ev, modulo, descripcion });
    }
    if (rpcs.length > 0) this.porModulo.set(modulo, rpcs);
  }

  // ==========================================
  // Handlers (rpc.<op>.request → .response)
  // ==========================================

  async onBuscarRequest(event) {
    const d = (event && event.data) || event || {};
    let result;
    try {
      result = this._buscar(d);
      this.metrics?.increment?.('rpc-index.buscar.served');
    } catch (err) {
      this.logger?.error?.('rpc-index.buscar.failed', { error: err.message });
      this.metrics?.increment?.('rpc-index.buscar.errors');
      result = this._errorResponse(500, 'UNKNOWN_ERROR', err.message);
    }
    this.eventBus?.publish('rpc.buscar.response', { request_id: d.request_id, ...result });
    return result;
  }

  async onVerRequest(event) {
    const d = (event && event.data) || event || {};
    let result;
    try {
      result = this._ver(d);
      this.metrics?.increment?.('rpc-index.ver.served');
    } catch (err) {
      this.logger?.error?.('rpc-index.ver.failed', { error: err.message });
      this.metrics?.increment?.('rpc-index.ver.errors');
      result = this._errorResponse(500, 'UNKNOWN_ERROR', err.message);
    }
    this.eventBus?.publish('rpc.ver.response', { request_id: d.request_id, ...result });
    return result;
  }

  _buscar(input) {
    const { query, modulo, limite } = input || {};
    if (!query && !modulo) {
      return this._errorResponse(400, 'INVALID_INPUT', 'query o modulo requerido', { kind: 'domain', field: 'query' });
    }
    const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
    const mod = typeof modulo === 'string' ? modulo.trim().toLowerCase() : '';
    const lim = Math.min(Math.max(parseInt(limite, 10) || 20, 1), 50);

    const hits = this.indice.filter((r) => {
      if (mod && r.modulo.toLowerCase() !== mod) return false;
      if (!q) return true;
      const enEvento = r.evento.toLowerCase().includes(q);
      const enModulo = r.modulo.toLowerCase().includes(q);
      const enDesc = r.descripcion.toLowerCase().includes(q);
      return enEvento || enModulo || enDesc;
    });

    const top = hits.slice(0, lim).map((r) => ({
      evento: r.evento,
      modulo: r.modulo,
      descripcion: r.descripcion.slice(0, 200)
    }));
    return { status: 200, data: { rpcs: top, total: hits.length, mostrados: top.length } };
  }

  _ver(input) {
    const { modulo } = input || {};
    if (!modulo) {
      return this._errorResponse(400, 'INVALID_INPUT', 'modulo requerido', { kind: 'domain', field: 'modulo' });
    }
    const rpcs = this.porModulo.get(modulo) || [];
    if (rpcs.length === 0) {
      return { status: 200, data: { modulo, rpcs: [], total: 0, nota: 'ese módulo no declara RPC .request (o el nombre no coincide)' } };
    }
    return { status: 200, data: { modulo, rpcs, total: rpcs.length } };
  }
}

module.exports = RpcIndexReflejo;
