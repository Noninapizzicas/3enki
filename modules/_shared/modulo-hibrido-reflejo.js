/**
 * ModuloHibridoReflejo — base de la mitad REFLEJO de un módulo híbrido.
 *
 * Destilado de los dos primeros casos (recetas, escandallo). Concentra TODA la
 * fontanería del Patrón Módulo Híbrido para que cada nuevo reflejo solo escriba
 * sus PROYECCIONES deterministas (réplica fiel del contrato del blueprint), no
 * el cableado del bus. De ~200 líneas por reflejo a ~40.
 *
 * Qué da la base:
 *   - onLoad/onUnload (asigna logger/eventBus/metrics + log).
 *   - _rpc(evento, payload, {timeout_ms})        publishAndWait genérico al bus.
 *   - _atender(event, op, responseEvent, fn)      RPC request/response: guard +
 *                                                 proyección + publica la response.
 *   - _leerJson / _editarJson(project_id, path)   store JSON del módulo via fs reflejo.
 *   - _invalid(field) · _round(x,n)               utilidades.
 *
 * Qué pone el subclase:
 *   - name, version.
 *   - un on<Op>Request de UNA línea por op (delega a _atender).
 *   - las proyecciones _<op>(input): { status, data }.
 *   - handlers fire-and-forget (writes) propios si los hay.
 *
 * Híbrido: el módulo lleva además su <mod>.blueprint.json (mitad fuzzy) y
 * declara estos handlers en module.json.subscribes. El loader (soporte híbrido)
 * carga ambos; ai-gateway sigue viendo el blueprint por manifest.blueprint_driven.
 * Regla anti-colisión (la verifica scripts/validate-hibridos.js): un evento NO
 * puede estar a la vez en module.json.subscribes y en blueprint.eventos_que_escucho.
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('./base-module');

class ModuloHibridoReflejo extends BaseModule {
  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    this.logger?.info(`${this.name}.reflejo.loaded`, { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger?.info(`${this.name}.reflejo.unloaded`, { module: this.name });
  }

  // =============================================================
  // RPC al bus — publica <ev>.request y espera <ev>.response por request_id.
  // Best-effort: si no llega en timeout_ms, resuelve null (no cuelga el reflejo).
  // =============================================================
  async _rpc(evento, payload = {}, { timeout_ms = 8000 } = {}) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    const responseEvent = evento.endsWith('.request')
      ? evento.slice(0, -('.request'.length)) + '.response'
      : `${evento}.response`;
    return new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => { if (unsub) unsub(); resolve(null); }, timeout_ms);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const d = event?.data || event;
          if (!d || d.request_id !== request_id) return;
          clearTimeout(timeout);
          if (unsub) unsub();
          resolve(d);
        });
        this.eventBus.publish(evento, { request_id, ...payload });
      } catch (_) {
        clearTimeout(timeout);
        if (unsub) unsub();
        resolve(null);
      }
    });
  }

  // =============================================================
  // Atiende un RPC request/response del bus: guard + proyección + response
  // correlada. El on<Op>Request del subclase es una sola línea sobre esto.
  // =============================================================
  async _atender(event, op, responseEvent, proyeccion) {
    const d = (event && event.data) || event || {};
    let result;
    try {
      result = await proyeccion(d);
      this.metrics?.increment(`${this.name}.reflejo.served`, { op });
    } catch (err) {
      this.logger?.error(`${this.name}.reflejo.failed`, { op, error: err.message });
      this.metrics?.increment(`${this.name}.reflejo.errors`, { op });
      result = this._errorResponse(500, 'UNKNOWN_ERROR', err.message);
    }
    this.eventBus.publish(responseEvent, { request_id: d.request_id, ...result });
    return result;
  }

  // =============================================================
  // Store JSON del módulo — via el reflejo fs (JS↔JS, milisegundos)
  // =============================================================
  async _leerJson(project_id, path) {
    const resp = await this._rpc('fs.read.request', { project_id, path, encoding: 'utf-8' });
    if (!resp || resp.status === 404 || !resp.content) return null;
    try { return JSON.parse(resp.content); } catch (_) { return null; }
  }

  async _editarJson(project_id, path, patches) {
    return this._rpc('fs.edit.request', { project_id, path, patches });
  }

  // =============================================================
  // Utilidades
  // =============================================================
  _invalid(field) {
    return this._errorResponse(400, 'INVALID_INPUT', `${field} requerido`, { field });
  }

  _round(x, n = 2) {
    const f = Math.pow(10, n);
    return Math.round(x * f) / f;
  }
}

module.exports = ModuloHibridoReflejo;
