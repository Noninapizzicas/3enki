'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const TRANSICIONES_SEGMENTO = {
  hipotesis:  ['validado', 'descartado'],
  validado:   ['activo', 'descartado'],
  activo:     ['descartado'],
  descartado: []
};

const ORIGENES_PERSONA = ['manual', 'generada'];

const STORE_VACIO = Object.freeze({
  esquema: 'marketing-audience-v1',
  segmentos: [],
  personas: [],
  datos_disponibles: null
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingAudienceReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-audience';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-audience.json',
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
    return this._atender(e, 'get', 'marketing.audience.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.audience.update.response', d => this._update(d));
  }

  _obtenerOCrear(pid) {
    let store = this._stores.get(pid);
    if (!store) {
      store = clonar(STORE_VACIO);
      this._stores.set(pid, store);
      this._persist.marcarDirty(pid);
    }
    return store;
  }

  _get(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const result = { project_id: pid, datos_disponibles: store.datos_disponibles };

    if (!input.tipo || input.tipo === 'segmentos') result.segmentos = store.segmentos;
    if (!input.tipo || input.tipo === 'personas') result.personas = store.personas;

    return { status: 200, data: result };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (Array.isArray(input.segmentos)) {
      for (const seg of input.segmentos) {
        if (!seg.nombre && !seg.id) continue;

        const existente = seg.id ? store.segmentos.find(s => s.id === seg.id) : null;

        if (existente) {
          if (seg.estado && seg.estado !== existente.estado) {
            const validas = TRANSICIONES_SEGMENTO[existente.estado] || [];
            if (!validas.includes(seg.estado)) {
              return {
                status: 400,
                data: {
                  error: 'INVALID_STATE_TRANSITION',
                  message: `Segmento '${existente.id}': transición ${existente.estado} → ${seg.estado} no permitida`,
                  transiciones_validas: validas
                }
              };
            }
            existente.estado = seg.estado;
          }
          if (seg.nombre !== undefined) existente.nombre = seg.nombre;
          if (seg.criterios) existente.criterios = { ...existente.criterios, ...seg.criterios };
          if (seg.necesidad !== undefined) existente.necesidad = seg.necesidad;
          if (seg.comportamiento) existente.comportamiento = { ...existente.comportamiento, ...seg.comportamiento };
          if (seg.tamano_estimado !== undefined) existente.tamano_estimado = seg.tamano_estimado;
          if (seg.prioridad !== undefined) existente.prioridad = seg.prioridad;
        } else {
          store.segmentos.push({
            id: seg.id || crypto.randomUUID(),
            nombre: seg.nombre,
            criterios: seg.criterios || { edad: null, genero: null, ubicacion: null, nivel_socioeconomico: null },
            necesidad: seg.necesidad || null,
            comportamiento: seg.comportamiento || { frecuencia_compra: null, canales_usados: [], sensibilidad_precio: null },
            tamano_estimado: seg.tamano_estimado || null,
            prioridad: seg.prioridad ?? store.segmentos.length + 1,
            estado: 'hipotesis'
          });
        }
      }
      campos.push('segmentos');
    }

    if (Array.isArray(input.personas)) {
      for (const per of input.personas) {
        if (!per.nombre && !per.id) continue;

        const existente = per.id ? store.personas.find(p => p.id === per.id) : null;

        if (existente) {
          if (per.nombre !== undefined) existente.nombre = per.nombre;
          if (per.perfil !== undefined) existente.perfil = per.perfil;
          if (per.segmento_id !== undefined) existente.segmento_id = per.segmento_id;
          if (per.necesidad !== undefined) existente.necesidad = per.necesidad;
          if (per.barrera !== undefined) existente.barrera = per.barrera;
          if (per.motivacion !== undefined) existente.motivacion = per.motivacion;
          if (per.canal_preferido !== undefined) existente.canal_preferido = per.canal_preferido;
          if (per.mensaje_clave !== undefined) existente.mensaje_clave = per.mensaje_clave;
        } else {
          if (per.segmento_id) {
            const segExiste = store.segmentos.find(s => s.id === per.segmento_id);
            if (!segExiste) {
              return {
                status: 400,
                data: { error: 'SEGMENTO_NOT_FOUND', message: `Segmento '${per.segmento_id}' no existe` }
              };
            }
          }

          store.personas.push({
            id: per.id || crypto.randomUUID(),
            segmento_id: per.segmento_id || null,
            nombre: per.nombre,
            perfil: per.perfil || null,
            necesidad: per.necesidad || null,
            barrera: per.barrera || null,
            motivacion: per.motivacion || null,
            canal_preferido: per.canal_preferido || null,
            mensaje_clave: per.mensaje_clave || null,
            origen: per.origen && ORIGENES_PERSONA.includes(per.origen) ? per.origen : 'manual'
          });
        }
      }
      campos.push('personas');
    }

    if (input.datos_disponibles !== undefined) {
      store.datos_disponibles = input.datos_disponibles;
      campos.push('datos_disponibles');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.audience.actualizada', {
      project_id: pid,
      campos_actualizados: campos
    });

    return { status: 200, data: { project_id: pid, segmentos: store.segmentos, personas: store.personas, campos_actualizados: campos } };
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

module.exports = MarketingAudienceReflejo;
