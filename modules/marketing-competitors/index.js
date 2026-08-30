'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const TIPOS_COMPETIDOR = ['directo', 'indirecto', 'aspiracional'];

const TRANSICIONES_COMPETIDOR = {
  identificado: ['vigilado', 'descartado'],
  vigilado:     ['descartado'],
  descartado:   []
};

const TIPOS_SENAL = ['cambio_precio', 'nuevo_producto', 'campaña', 'movimiento_canal', 'otro'];

const STORE_VACIO = Object.freeze({
  esquema: 'marketing-competitors-v1',
  competidores: [],
  observaciones: [],
  dimensiones: [],
  puntuaciones: [],
  diferenciacion: [],
  info_accesible: null
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingCompetitorsReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-competitors';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-competitors.json',
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
    return this._atender(e, 'get', 'marketing.competitors.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.competitors.update.response', d => this._update(d));
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

    if (input.competidor_id) {
      const comp = store.competidores.find(c => c.id === input.competidor_id);
      if (!comp) return { status: 404, data: { error: 'COMPETIDOR_NOT_FOUND', message: `Competidor '${input.competidor_id}' no encontrado` } };
      const obs = store.observaciones.filter(o => o.competidor_id === input.competidor_id);
      const punts = store.puntuaciones.filter(p => p.sujeto_id === input.competidor_id);
      return { status: 200, data: { project_id: pid, competidor: comp, observaciones: obs, puntuaciones: punts } };
    }

    const comparativa = this._calcularComparativa(store);
    return {
      status: 200,
      data: {
        project_id: pid,
        competidores: store.competidores,
        observaciones: store.observaciones,
        dimensiones: store.dimensiones,
        puntuaciones: store.puntuaciones,
        diferenciacion: store.diferenciacion,
        comparativa
      }
    };
  }

  _calcularComparativa(store) {
    if (!store.dimensiones.length || !store.puntuaciones.length) return [];

    return store.dimensiones.map(dim => {
      const propia = store.puntuaciones.find(p => p.sujeto_tipo === 'proyecto' && p.dimension_id === dim.id);
      const ajenas = store.puntuaciones
        .filter(p => p.sujeto_tipo === 'competidor' && p.dimension_id === dim.id)
        .map(p => {
          const comp = store.competidores.find(c => c.id === p.sujeto_id);
          return { competidor_id: p.sujeto_id, nombre: comp ? comp.nombre : p.sujeto_id, valor: p.valor };
        });

      const todos = [...(propia ? [{ id: 'proyecto', valor: propia.valor }] : []), ...ajenas.map(a => ({ id: a.competidor_id, valor: a.valor }))];
      todos.sort((a, b) => b.valor - a.valor);
      const posicion = propia ? todos.findIndex(t => t.id === 'proyecto') + 1 : null;

      return {
        dimension: dim.nombre,
        dimension_id: dim.id,
        valor_propio: propia ? propia.valor : null,
        competidores: ajenas,
        posicion,
        total_participantes: todos.length
      };
    });
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (Array.isArray(input.competidores)) {
      for (const comp of input.competidores) {
        if (!comp.nombre && !comp.id) continue;

        const existente = comp.id ? store.competidores.find(c => c.id === comp.id) : null;

        if (existente) {
          if (comp.estado && comp.estado !== existente.estado) {
            const validas = TRANSICIONES_COMPETIDOR[existente.estado] || [];
            if (!validas.includes(comp.estado)) {
              return {
                status: 400,
                data: { error: 'INVALID_STATE_TRANSITION', message: `Competidor '${existente.id}': transición ${existente.estado} → ${comp.estado} no permitida`, transiciones_validas: validas }
              };
            }
            existente.estado = comp.estado;
          }
          if (comp.nombre !== undefined) existente.nombre = comp.nombre;
          if (comp.tipo !== undefined) existente.tipo = comp.tipo;
          if (comp.descripcion !== undefined) existente.descripcion = comp.descripcion;
          if (Array.isArray(comp.fortalezas)) existente.fortalezas = comp.fortalezas;
          if (Array.isArray(comp.debilidades)) existente.debilidades = comp.debilidades;
          if (Array.isArray(comp.canales_activos)) existente.canales_activos = comp.canales_activos;
          if (comp.url !== undefined) existente.url = comp.url;
          if (comp.frecuencia_revision !== undefined) existente.frecuencia_revision = comp.frecuencia_revision;
        } else {
          store.competidores.push({
            id: comp.id || crypto.randomUUID(),
            nombre: comp.nombre,
            tipo: TIPOS_COMPETIDOR.includes(comp.tipo) ? comp.tipo : 'directo',
            descripcion: comp.descripcion || null,
            fortalezas: comp.fortalezas || [],
            debilidades: comp.debilidades || [],
            canales_activos: comp.canales_activos || [],
            url: comp.url || null,
            estado: 'identificado',
            frecuencia_revision: comp.frecuencia_revision || 'mensual'
          });
        }
      }
      campos.push('competidores');
    }

    if (Array.isArray(input.observaciones)) {
      for (const obs of input.observaciones) {
        if (!obs.competidor_id || !obs.contenido) continue;
        const compExiste = store.competidores.find(c => c.id === obs.competidor_id);
        if (!compExiste) {
          return { status: 400, data: { error: 'COMPETIDOR_NOT_FOUND', message: `Competidor '${obs.competidor_id}' no existe` } };
        }
        store.observaciones.push({
          id: crypto.randomUUID(),
          competidor_id: obs.competidor_id,
          fecha: new Date().toISOString(),
          tipo_senal: TIPOS_SENAL.includes(obs.tipo_senal) ? obs.tipo_senal : 'otro',
          contenido: obs.contenido,
          alerta: obs.alerta || false
        });
      }
      campos.push('observaciones');
    }

    if (Array.isArray(input.dimensiones)) {
      for (const dim of input.dimensiones) {
        if (!dim.nombre) continue;
        const existente = dim.id ? store.dimensiones.find(d => d.id === dim.id) : null;
        if (existente) {
          if (dim.nombre !== undefined) existente.nombre = dim.nombre;
          if (dim.descripcion !== undefined) existente.descripcion = dim.descripcion;
        } else {
          store.dimensiones.push({
            id: dim.id || crypto.randomUUID(),
            nombre: dim.nombre,
            descripcion: dim.descripcion || null
          });
        }
      }
      campos.push('dimensiones');
    }

    if (Array.isArray(input.puntuaciones)) {
      for (const punt of input.puntuaciones) {
        if (!punt.dimension_id || punt.valor === undefined) continue;
        const dimExiste = store.dimensiones.find(d => d.id === punt.dimension_id);
        if (!dimExiste) {
          return { status: 400, data: { error: 'DIMENSION_NOT_FOUND', message: `Dimensión '${punt.dimension_id}' no existe` } };
        }
        if (punt.sujeto_tipo === 'competidor') {
          const compExiste = store.competidores.find(c => c.id === punt.sujeto_id);
          if (!compExiste) {
            return { status: 400, data: { error: 'COMPETIDOR_NOT_FOUND', message: `Competidor '${punt.sujeto_id}' no existe` } };
          }
        }

        const idx = store.puntuaciones.findIndex(p => p.sujeto_id === punt.sujeto_id && p.dimension_id === punt.dimension_id);
        const entry = {
          sujeto_id: punt.sujeto_id,
          sujeto_tipo: punt.sujeto_tipo || 'proyecto',
          dimension_id: punt.dimension_id,
          valor: punt.valor,
          fecha: new Date().toISOString()
        };
        if (idx >= 0) store.puntuaciones[idx] = entry;
        else store.puntuaciones.push(entry);
      }
      campos.push('puntuaciones');
    }

    if (Array.isArray(input.diferenciacion)) {
      store.diferenciacion = input.diferenciacion;
      campos.push('diferenciacion');
    }

    if (input.info_accesible !== undefined) {
      store.info_accesible = input.info_accesible;
      campos.push('info_accesible');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.competitors.actualizado', {
      project_id: pid,
      campos_actualizados: campos
    });

    return { status: 200, data: { project_id: pid, campos_actualizados: campos } };
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

module.exports = MarketingCompetitorsReflejo;
