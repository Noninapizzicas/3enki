'use strict';

/**
 * P2 · Registro de pipelines — CUSTODIO (del esquema del motor).
 *
 * Único escritor de la definición de cada agente: pasos (orden, tipo
 * reflejo|fuzzy, validaciones), entregable (qué promete + reglas) y
 * presupuesto. Nadie define un pipeline fuera del registro.
 *
 * Eventos (event-driven):
 *   pipeline.declarar.request { request_id, pipeline }  → pipeline.declarado
 *   pipeline.obtener.request  { request_id, nombre }    → pipeline.obtener.response
 *   pipeline.listar.request   { request_id }            → pipeline.listar.response
 *   Todo fallo responde su par *.failed (el círculo se cierra siempre).
 */

const fs = require('fs');
const path = require('path');
const BaseModule = require('../../_shared/base-module');

class AgentesRegistroModule extends BaseModule {
  constructor() {
    super();
    this.name = 'agentes-registro';
    this.version = '1.0.0';
    // Store configurable (en el smoke se apunta a un dir temporal).
    this.storeDir = path.resolve(__dirname, 'store');
    this.eventBus = null;
    this.logger = null;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
  }

  _pipePath(nombre) {
    return path.join(this.storeDir, `${String(nombre).replace(/[^a-z0-9-_]/gi, '')}.json`);
  }

  _publicar(topic, payload) {
    if (this.eventBus && typeof this.eventBus.publish === 'function') {
      this.eventBus.publish(topic, payload);
    }
  }

  _base(request_id) {
    return { request_id, timestamp: new Date().toISOString() };
  }

  // ── Validación del CONTRATO del pipeline (reglas fijas, determinista) ──
  _validarContrato(p) {
    const errores = [];
    if (!p || typeof p !== 'object') return ['pipeline no es un objeto'];
    if (!p.name || typeof p.name !== 'string' || !p.name.trim()) errores.push('name requerido (string)');
    if (!Array.isArray(p.pasos) || p.pasos.length === 0) {
      errores.push('pasos requeridos (array no vacío)');
    } else {
      let hayReflejo = false;
      let hayFuzzy = false;
      p.pasos.forEach((s, i) => {
        const nombre = s.paso || s.nombre || `paso_${i}`;
        if (!['reflejo', 'fuzzy'].includes(s.tipo)) {
          errores.push(`paso '${nombre}' con tipo inválido: ${s.tipo || '(sin tipo)'}`);
        } else if (s.tipo === 'reflejo') hayReflejo = true;
        else hayFuzzy = true;
      });
      if (hayFuzzy && !hayReflejo) errores.push('pipeline sin pasos reflejo (el determinismo es obligatorio)');
    }
    if (!p.entregable || typeof p.entregable !== 'object') {
      errores.push('entregable requerido (objeto)');
    } else {
      // Dos formas válidas (las MISMAS que el ejecutor resuelve):
      //  · path            → un archivo (esquema.md, module.json…)
      //  · dir + archivos[] → multi-archivo (F4 construir-modulos, F7 construir-interfaz)
      // El contrato de ESCRITURA debe aceptar lo que el de EJECUCIÓN corre.
      const tienePath = typeof p.entregable.path === 'string' && p.entregable.path.trim();
      const tieneMulti = typeof p.entregable.dir === 'string' && p.entregable.dir.trim() &&
        Array.isArray(p.entregable.archivos) && p.entregable.archivos.length > 0;
      if (!tienePath && !tieneMulti) {
        errores.push('entregable requiere path (un archivo) o dir+archivos[] (multi-archivo)');
      }
      if (!Array.isArray(p.entregable.reglas) || p.entregable.reglas.length === 0) {
        errores.push('entregable.reglas requerido (array no vacío — el JEFE necesita reglas)');
      }
    }
    return errores;
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  async onPipelineDeclararRequest(event) {
    const data = event?.data || event || {};
    const { request_id, pipeline } = data;
    try {
      const errores = this._validarContrato(pipeline);
      if (errores.length > 0) {
        throw Object.assign(new Error(`contrato inválido: ${errores.join('; ')}`), { code: 'INVALID_INPUT' });
      }
      const p = this._pipePath(pipeline.name);
      fs.writeFileSync(p, JSON.stringify(pipeline, null, 2), 'utf8');
      this._publicar('pipeline.declarado', { ...this._base(request_id), pipeline, creado: true });
    } catch (err) {
      this._publicar('pipeline.declarar.failed', {
        ...this._base(request_id),
        error: { code: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) }
      });
    }
  }

  async onPipelineObtenerRequest(event) {
    const data = event?.data || event || {};
    const { request_id, nombre } = data;
    try {
      const p = this._pipePath(nombre);
      if (!fs.existsSync(p)) {
        throw Object.assign(new Error(`pipeline '${nombre}' no encontrado`), { code: 'RESOURCE_NOT_FOUND' });
      }
      const pipeline = JSON.parse(fs.readFileSync(p, 'utf8'));
      this._publicar('pipeline.obtener.response', { ...this._base(request_id), pipeline });
    } catch (err) {
      this._publicar('pipeline.obtener.failed', {
        ...this._base(request_id),
        error: { code: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) }
      });
    }
  }

  async onPipelineListarRequest(event) {
    const data = event?.data || event || {};
    const { request_id } = data;
    try {
      const pipelines = [];
      if (fs.existsSync(this.storeDir)) {
        for (const f of fs.readdirSync(this.storeDir)) {
          if (f.endsWith('.json')) {
            try { pipelines.push(JSON.parse(fs.readFileSync(path.join(this.storeDir, f), 'utf8'))); } catch { /* fila corrupta se omite */ }
          }
        }
      }
      this._publicar('pipeline.listar.response', { ...this._base(request_id), pipelines });
    } catch (err) {
      this._publicar('pipeline.listar.failed', {
        ...this._base(request_id),
        error: { code: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) }
      });
    }
  }
}

module.exports = AgentesRegistroModule;
