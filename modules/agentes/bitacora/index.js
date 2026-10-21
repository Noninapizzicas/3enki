'use strict';

/**
 * P6 · Bitácora — CUSTODIO (del esquema del motor).
 *
 * Único escritor de los pasos de cada ejecución. Todo lo que el pipeline hace
 * queda ESCRITO en el storage del proyecto:
 *   data/projects/<project_id>/storage/agentes/bitacoras/<request_id>.json
 *
 * Eventos (event-driven):
 *   bitacora.abrir.request  { request_id, project_id, agent_name, task } → bitacora.abierta
 *   bitacora.paso.request   { request_id, project_id, paso, message?, tool_invoked? } → bitacora.paso.registrado
 *   bitacora.sellar.request { request_id, project_id, veredicto, duracion_ms } → bitacora.sellada
 *   bitacora.leer.request   { request_id, project_id } → bitacora.leer.response
 *   Todo fallo responde su par *.failed.
 */

const fs = require('fs');
const path = require('path');
const BaseModule = require('../../_shared/base-module');

class AgentesBitacoraModule extends BaseModule {
  constructor() {
    super();
    this.name = 'agentes-bitacora';
    this.version = '1.0.0';
    // Data root configurable (en el smoke se apunta a un dir temporal).
    this.dataDir = path.resolve(__dirname, '../../../data');
    this.eventBus = null;
    this.logger = null;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
  }

  _bitacoraPath(project_id, request_id) {
    return path.join(
      this.dataDir, 'projects', String(project_id), 'storage', 'agentes', 'bitacoras',
      `${String(request_id).replace(/[^a-z0-9-_]/gi, '')}.json`
    );
  }

  _publicar(topic, payload) {
    if (this.eventBus && typeof this.eventBus.publish === 'function') {
      this.eventBus.publish(topic, payload);
    }
  }

  _base(request_id) {
    return { request_id, timestamp: new Date().toISOString() };
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  async onBitacoraAbrirRequest(event) {
    const data = event?.data || event || {};
    const { request_id, project_id, agent_name, task } = data;
    try {
      if (!request_id || !project_id) {
        throw Object.assign(new Error('request_id y project_id requeridos'), { code: 'INVALID_INPUT' });
      }
      const p = this._bitacoraPath(project_id, request_id);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const bitacora = {
        request_id,
        agent_name: agent_name || 'agente',
        task: task || null,
        estado: 'ejecutando',
        pasos: [{ paso: 'started', ts: new Date().toISOString() }],
        startedAt: Date.now(),
        veredicto: null
      };
      fs.writeFileSync(p, JSON.stringify(bitacora, null, 2), 'utf8');
      this._publicar('bitacora.abierta', { ...this._base(request_id), project_id, agent_name, task, bitacora });
    } catch (err) {
      this._publicar('bitacora.abrir.failed', {
        ...this._base(data?.request_id),
        error: { code: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) }
      });
    }
  }

  async onBitacoraPasoRequest(event) {
    const data = event?.data || event || {};
    const { request_id, project_id } = data;
    try {
      const p = this._bitacoraPath(project_id, request_id);
      if (!fs.existsSync(p)) {
        throw Object.assign(new Error(`bitácora ${request_id} no existe`), { code: 'RESOURCE_NOT_FOUND' });
      }
      const bitacora = JSON.parse(fs.readFileSync(p, 'utf8'));
      const paso = {
        paso: data.paso || 'paso',
        message: data.message || null,
        tool_invoked: data.tool_invoked || null,
        ts: new Date().toISOString()
      };
      bitacora.pasos.push(paso);
      fs.writeFileSync(p, JSON.stringify(bitacora, null, 2), 'utf8');
      this._publicar('bitacora.paso.registrado', { ...this._base(request_id), project_id, paso });
    } catch (err) {
      this._publicar('bitacora.paso.failed', {
        ...this._base(data?.request_id),
        error: { code: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) }
      });
    }
  }

  async onBitacoraSellarRequest(event) {
    const data = event?.data || event || {};
    const { request_id, project_id } = data;
    try {
      const p = this._bitacoraPath(project_id, request_id);
      if (!fs.existsSync(p)) {
        throw Object.assign(new Error(`bitácora ${request_id} no existe`), { code: 'RESOURCE_NOT_FOUND' });
      }
      const bitacora = JSON.parse(fs.readFileSync(p, 'utf8'));
      const veredicto = data.veredicto || null;
      bitacora.veredicto = veredicto;
      bitacora.estado = veredicto && veredicto.verificado === true ? 'verificada' : 'fallida';
      bitacora.duracion_ms = typeof data.duracion_ms === 'number' ? data.duracion_ms : Date.now() - (bitacora.startedAt || Date.now());
      bitacora.pasos.push({ paso: 'final', ts: new Date().toISOString() });
      fs.writeFileSync(p, JSON.stringify(bitacora, null, 2), 'utf8');
      this._publicar('bitacora.sellada', { ...this._base(request_id), project_id, bitacora });
    } catch (err) {
      this._publicar('bitacora.sellar.failed', {
        ...this._base(data?.request_id),
        error: { code: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) }
      });
    }
  }

  async onBitacoraLeerRequest(event) {
    const data = event?.data || event || {};
    const { request_id, project_id } = data;
    try {
      const p = this._bitacoraPath(project_id, request_id);
      if (!fs.existsSync(p)) {
        throw Object.assign(new Error(`bitácora ${request_id} no existe`), { code: 'RESOURCE_NOT_FOUND' });
      }
      const bitacora = JSON.parse(fs.readFileSync(p, 'utf8'));
      this._publicar('bitacora.leer.response', { ...this._base(request_id), project_id, bitacora });
    } catch (err) {
      this._publicar('bitacora.leer.failed', {
        ...this._base(data?.request_id),
        error: { code: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) }
      });
    }
  }
}

module.exports = AgentesBitacoraModule;
