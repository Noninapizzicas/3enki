'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const CLASIFICACIONES = ['propio', 'ganado', 'pagado', 'compartido'];

const TRANSICIONES_CANAL = {
  en_setup: ['activo', 'retirado'],
  activo:   ['pausado', 'retirado'],
  pausado:  ['activo', 'retirado'],
  retirado: []
};

const ESTADOS_SALUD = ['creciendo', 'estable', 'decayendo', 'desconocido'];

const CANAL_VACIO = Object.freeze({
  esquema: 'marketing-channels-v1',
  canales: [],
  capacidad_operativa: null,
  prioridades: []
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingChannelsReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-channels';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-channels.json',
      dir: '/prisma/marketing',
      snapshot: (pid) => {
        const s = this._stores.get(pid);
        return s ? { project_id: pid, store: s } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.store) this._stores.set(pid, data.store);
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

  onGetRequest(e) {
    return this._atender(e, 'get', 'marketing.channels.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.channels.update.response', d => this._update(d));
  }

  _obtenerOCrear(pid) {
    let store = this._stores.get(pid);
    if (!store) {
      store = clonar(CANAL_VACIO);
      this._stores.set(pid, store);
      this._persist.marcarDirty(pid);
    }
    return store;
  }

  _get(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    let canales = store.canales;

    if (input.clasificacion) {
      if (!CLASIFICACIONES.includes(input.clasificacion)) {
        return { status: 400, data: { error: 'INVALID_CLASIFICACION', message: `Clasificación '${input.clasificacion}' no válida`, validas: CLASIFICACIONES } };
      }
      canales = canales.filter(c => c.clasificacion === input.clasificacion);
    }

    return { status: 200, data: { project_id: pid, canales, capacidad_operativa: store.capacidad_operativa } };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (Array.isArray(input.canales)) {
      for (const canal of input.canales) {
        if (!canal.nombre && !canal.id) continue;

        const existente = canal.id ? store.canales.find(c => c.id === canal.id) : null;

        if (existente) {
          if (canal.estado && canal.estado !== existente.estado) {
            if (existente.clasificacion === 'ganado') {
              if (!ESTADOS_SALUD.includes(canal.estado)) {
                return {
                  status: 400,
                  data: { error: 'INVALID_STATE_TRANSITION', message: `Canal ganado '${existente.id}': estado '${canal.estado}' no válido`, estados_validos: ESTADOS_SALUD }
                };
              }
              existente.observaciones = existente.observaciones || {};
              existente.observaciones.salud = canal.estado;
            } else {
              const validas = TRANSICIONES_CANAL[existente.estado] || [];
              if (!validas.includes(canal.estado)) {
                return {
                  status: 400,
                  data: { error: 'INVALID_STATE_TRANSITION', message: `Canal '${existente.id}': transición ${existente.estado} → ${canal.estado} no permitida`, transiciones_validas: validas }
                };
              }
              existente.estado = canal.estado;
            }
          }

          if (canal.nombre !== undefined) existente.nombre = canal.nombre;
          if (canal.tipo !== undefined) existente.tipo = canal.tipo;
          if (canal.localizador !== undefined) existente.localizador = canal.localizador;
          if (canal.responsable !== undefined) existente.responsable = canal.responsable;
          if (canal.frecuencia) existente.frecuencia = { ...existente.frecuencia, ...canal.frecuencia };
          if (canal.presupuesto) existente.presupuesto = { ...existente.presupuesto, ...canal.presupuesto };
          if (canal.roi_esperado) existente.roi_esperado = { ...existente.roi_esperado, ...canal.roi_esperado };
          if (canal.plataforma_cuenta !== undefined) existente.plataforma_cuenta = canal.plataforma_cuenta;
          if (Array.isArray(canal.activos_vinculados)) existente.activos_vinculados = canal.activos_vinculados;
          if (canal.observaciones) {
            existente.observaciones = existente.observaciones || {};
            if (canal.observaciones.salud !== undefined) existente.observaciones.salud = canal.observaciones.salud;
            if (Array.isArray(canal.observaciones.fuentes)) existente.observaciones.fuentes = canal.observaciones.fuentes;
            if (canal.observaciones.audiencia !== undefined) existente.observaciones.audiencia = canal.observaciones.audiencia;
            if (canal.observaciones.engagement !== undefined) existente.observaciones.engagement = canal.observaciones.engagement;
          }
          if (canal.prioridad !== undefined) existente.prioridad = canal.prioridad;

          this._publicarEvento('marketing.channels.actualizado', { project_id: pid, canal_id: existente.id, campos_actualizados: ['modificado'] });
        } else {
          if (!canal.clasificacion || !CLASIFICACIONES.includes(canal.clasificacion)) {
            return {
              status: 400,
              data: { error: 'INVALID_CLASIFICACION', message: `Clasificación '${canal.clasificacion}' no válida para canal nuevo`, validas: CLASIFICACIONES }
            };
          }

          const nuevo = {
            id: canal.id || crypto.randomUUID(),
            nombre: canal.nombre,
            clasificacion: canal.clasificacion,
            tipo: canal.tipo || 'otro',
            localizador: canal.localizador || null,
            fecha_alta: new Date().toISOString(),
            estado: canal.clasificacion === 'ganado' ? 'desconocido' : 'en_setup',
            responsable: canal.responsable || null,
            frecuencia: canal.frecuencia || { valor: null, origen: canal.clasificacion === 'ganado' ? 'observada' : 'declarada' },
            presupuesto: canal.presupuesto || null,
            roi_esperado: canal.roi_esperado || null,
            plataforma_cuenta: canal.plataforma_cuenta || null,
            activos_vinculados: canal.activos_vinculados || [],
            observaciones: {
              salud: canal.clasificacion === 'ganado' ? 'desconocido' : null,
              fuentes: [],
              audiencia: null,
              engagement: null
            },
            prioridad: canal.prioridad ?? store.canales.length + 1
          };

          store.canales.push(nuevo);
          this._publicarEvento('marketing.channels.actualizado', { project_id: pid, canal_id: nuevo.id, campos_actualizados: ['creado'] });
        }
      }
      campos.push('canales');
    }

    if (input.capacidad_operativa !== undefined) {
      store.capacidad_operativa = input.capacidad_operativa;
      campos.push('capacidad_operativa');
    }

    if (Array.isArray(input.prioridades)) {
      for (const p of input.prioridades) {
        const canal = store.canales.find(c => c.id === p.canal_id);
        if (canal && p.prioridad !== undefined) canal.prioridad = p.prioridad;
      }
      campos.push('prioridades');
    }

    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, canales: store.canales, campos_actualizados: campos } };
  }

  toolGet(params) { return this._get(params); }
  toolUpdate(params) { return this._update(params); }

  handleUiGet(msg, reply) {
    const data = msg.data || msg;
    const pid = data.project_id;
    if (typeof reply !== 'function') return this._get(data);
    if (!pid) return reply({ status: 400, error: 'project_id requerido' });
    return reply(this._get(data));
  }

  handleUiUpdate(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') return this._update(data);
    return reply(this._update(data));
  }
}

module.exports = MarketingChannelsReflejo;
