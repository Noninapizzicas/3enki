'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

// ── Transiciones válidas de un objetivo ──
const TRANSICIONES_OBJETIVO = {
  definido:    ['activo', 'retirado'],
  activo:      ['en_revision', 'alcanzado', 'fallido', 'retirado'],
  en_revision: ['activo', 'alcanzado', 'fallido', 'retirado'],
  alcanzado:   [],
  fallido:     ['activo', 'retirado'],
  retirado:    []
};

const ESTADOS_VALIDOS = Object.keys(TRANSICIONES_OBJETIVO);

const ESTRATEGIA_VACIA = Object.freeze({
  esquema: 'marketing-strategy-v1',
  posicionamiento: {
    declaracion: null,
    propuesta_valor: null,
    atributos_deseados: [],
    territorio: { categoria: null, vecinos: [] },
    credibilidad: { evidencias: [] },
    consistencia: { vigente_desde: null, historial_giros: [] }
  },
  objetivos: [],
  alineacion_negocio: [],
  conocimiento_disponible: { sabemos: [], no_sabemos: [] },
  revisiones: { proxima: null, historial: [] }
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingStrategyReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-strategy';
    this.version = 'reflejo-0.1.0';
    this._estrategias = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-strategy.json',
      dir: '/prisma/marketing',
      snapshot: (pid) => {
        const e = this._estrategias.get(pid);
        return e ? { project_id: pid, estrategia: e } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.estrategia) this._estrategias.set(pid, data.estrategia);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers (una línea, delegan a _atender) ──

  onGetRequest(e) {
    return this._atender(e, 'get', 'marketing.strategy.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.strategy.update.response', d => this._update(d));
  }

  // ── Proyecciones deterministas ──

  _obtenerOCrear(pid) {
    let est = this._estrategias.get(pid);
    if (!est) {
      est = clonar(ESTRATEGIA_VACIA);
      this._estrategias.set(pid, est);
      this._persist.marcarDirty(pid);
    }
    return est;
  }

  _get(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };
    const est = this._obtenerOCrear(pid);
    return { status: 200, data: { project_id: pid, estrategia: est } };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const est = this._obtenerOCrear(pid);
    const campos = [];

    // ── Posicionamiento (merge parcial) ──
    if (input.posicionamiento) {
      const p = input.posicionamiento;
      if (p.declaracion !== undefined) est.posicionamiento.declaracion = p.declaracion;
      if (p.propuesta_valor !== undefined) est.posicionamiento.propuesta_valor = p.propuesta_valor;
      if (Array.isArray(p.atributos_deseados)) est.posicionamiento.atributos_deseados = p.atributos_deseados;
      if (p.territorio) {
        if (p.territorio.categoria !== undefined) est.posicionamiento.territorio.categoria = p.territorio.categoria;
        if (Array.isArray(p.territorio.vecinos)) est.posicionamiento.territorio.vecinos = p.territorio.vecinos;
      }
      if (p.credibilidad && Array.isArray(p.credibilidad.evidencias)) {
        est.posicionamiento.credibilidad.evidencias = p.credibilidad.evidencias;
      }
      if (p.consistencia) {
        if (p.consistencia.vigente_desde !== undefined) est.posicionamiento.consistencia.vigente_desde = p.consistencia.vigente_desde;
        if (p.consistencia.giro) {
          est.posicionamiento.consistencia.historial_giros.push({
            fecha: new Date().toISOString(),
            motivo: p.consistencia.giro.motivo || '',
            de: p.consistencia.giro.de || null,
            a: p.consistencia.giro.a || null
          });
        }
      }
      campos.push('posicionamiento');
    }

    // ── Objetivos (reemplaza lista o merge por id) ──
    if (Array.isArray(input.objetivos)) {
      for (const obj of input.objetivos) {
        if (!obj.meta) continue;

        const existente = obj.id ? est.objetivos.find(o => o.id === obj.id) : null;

        if (existente) {
          // State machine: validar transición
          if (obj.estado && obj.estado !== existente.estado) {
            const validas = TRANSICIONES_OBJETIVO[existente.estado] || [];
            if (!validas.includes(obj.estado)) {
              return {
                status: 400,
                data: {
                  error: 'INVALID_STATE_TRANSITION',
                  message: `Objetivo '${existente.id}': transición ${existente.estado} → ${obj.estado} no permitida`,
                  transiciones_validas: validas
                }
              };
            }
            existente.estado = obj.estado;
          }
          if (obj.meta !== undefined) existente.meta = obj.meta;
          if (obj.target) existente.target = { ...existente.target, ...obj.target };
          if (obj.horizonte) existente.horizonte = { ...existente.horizonte, ...obj.horizonte };
          if (obj.prioridad !== undefined) existente.prioridad = obj.prioridad;
          if (obj.alineacion !== undefined) existente.alineacion = obj.alineacion;
          if (obj.criterio_revision) existente.criterio_revision = { ...existente.criterio_revision, ...obj.criterio_revision };
        } else {
          est.objetivos.push({
            id: obj.id || crypto.randomUUID(),
            meta: obj.meta,
            target: obj.target || { valor: null, unidad: null, direccion: 'subir' },
            horizonte: obj.horizonte || { fecha: null, tipo: 'fijo' },
            prioridad: obj.prioridad ?? est.objetivos.length + 1,
            alineacion: obj.alineacion || null,
            estado: 'definido',
            criterio_revision: obj.criterio_revision || { umbral_alerta: null, fecha_revision: null, accion_si_falla: null }
          });
        }
      }
      campos.push('objetivos');
    }

    // ── Alineación negocio ──
    if (Array.isArray(input.alineacion_negocio)) {
      est.alineacion_negocio = input.alineacion_negocio;
      campos.push('alineacion_negocio');
    }

    // ── Conocimiento disponible ──
    if (input.conocimiento_disponible) {
      const c = input.conocimiento_disponible;
      if (Array.isArray(c.sabemos)) est.conocimiento_disponible.sabemos = c.sabemos;
      if (Array.isArray(c.no_sabemos)) est.conocimiento_disponible.no_sabemos = c.no_sabemos;
      campos.push('conocimiento_disponible');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.strategy.actualizada', {
      project_id: pid,
      campos_actualizados: campos
    });

    return { status: 200, data: { project_id: pid, estrategia: est, campos_actualizados: campos } };
  }

  // ── Tools ──

  toolGet(params) { return this._get(params); }
  toolUpdate(params) { return this._update(params); }

  // ── UI Handlers ──

  handleUiGet(msg, reply) {
    const data = msg.data || msg;
    const pid = data.project_id;
    if (typeof reply !== 'function') return this._get(data);
    if (!pid) return reply({ status: 400, error: 'project_id requerido' });
    return reply(this._get({ project_id: pid }));
  }

  handleUiUpdate(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') return this._update(data);
    return reply(this._update(data));
  }
}

module.exports = MarketingStrategyReflejo;
