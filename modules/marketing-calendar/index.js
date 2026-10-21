'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const TIPOS_ACCION = ['publicacion', 'campaña', 'evento', 'mantenimiento', 'otro'];
const TIPOS_MARCA = ['festividad', 'temporada', 'lanzamiento', 'otro'];
const RECURRENCIAS = ['anual', 'mensual', 'puntual'];
const IMPACTOS = ['alto', 'medio', 'bajo'];
const UNIDADES_CADENCIA = ['diario', 'semanal', 'quincenal', 'mensual'];

const TRANSICIONES_ENTRADA = {
  borrador:   ['programado', 'cancelado'],
  programado: ['ejecutado', 'cancelado'],
  ejecutado:  [],
  cancelado:  []
};

const STORE_VACIO = Object.freeze({
  esquema: 'marketing-calendar-v1',
  entradas: [],
  marcas: [],
  cadencias: []
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingCalendarReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-calendar';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-calendar.json',
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
    return this._atender(e, 'get', 'marketing.calendar.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.calendar.update.response', d => this._update(d));
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

  _filtrarPorRango(items, rango, campoFecha) {
    if (!rango || (!rango.inicio && !rango.fin)) return items;
    return items.filter(item => {
      const fecha = typeof item[campoFecha] === 'object' ? item[campoFecha].inicio : item[campoFecha];
      if (!fecha) return true;
      if (rango.inicio && fecha < rango.inicio) return false;
      if (rango.fin && fecha > rango.fin) return false;
      return true;
    });
  }

  _get(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const rango = input.rango || null;

    const entradas = this._filtrarPorRango(store.entradas, rango, 'fecha');
    const marcas = this._filtrarPorRango(store.marcas, rango, 'periodo');

    const total = store.entradas.length;
    const programadas = store.entradas.filter(e => e.estado === 'programado').length;
    const ejecutadas = store.entradas.filter(e => e.estado === 'ejecutado').length;

    return {
      status: 200,
      data: {
        project_id: pid,
        entradas,
        marcas,
        cadencias: store.cadencias,
        resumen: { total, programadas, ejecutadas, marcas_estacionales: store.marcas.length, cadencias_activas: store.cadencias.filter(c => c.activa).length }
      }
    };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (Array.isArray(input.entradas)) {
      for (const ent of input.entradas) {
        if (!ent.titulo && !ent.id) continue;

        const existente = ent.id ? store.entradas.find(e => e.id === ent.id) : null;

        if (existente) {
          if (ent.estado && ent.estado !== existente.estado) {
            const validas = TRANSICIONES_ENTRADA[existente.estado] || [];
            if (!validas.includes(ent.estado)) {
              return {
                status: 400,
                data: { error: 'INVALID_STATE_TRANSITION', message: `Entrada '${existente.id}': transición ${existente.estado} → ${ent.estado} no permitida`, transiciones_validas: validas }
              };
            }
            existente.estado = ent.estado;
          }
          if (ent.titulo !== undefined) existente.titulo = ent.titulo;
          if (ent.tipo !== undefined) existente.tipo = ent.tipo;
          if (ent.canal_id !== undefined) existente.canal_id = ent.canal_id;
          if (ent.fecha !== undefined) existente.fecha = ent.fecha;
          if (ent.responsable !== undefined) existente.responsable = ent.responsable;
          if (ent.notas !== undefined) existente.notas = ent.notas;
        } else {
          store.entradas.push({
            id: ent.id || crypto.randomUUID(),
            titulo: ent.titulo,
            tipo: TIPOS_ACCION.includes(ent.tipo) ? ent.tipo : 'otro',
            canal_id: ent.canal_id || null,
            fecha: ent.fecha || null,
            responsable: ent.responsable || null,
            estado: 'borrador',
            notas: ent.notas || ''
          });
        }
      }
      campos.push('entradas');
    }

    if (Array.isArray(input.marcas)) {
      for (const marca of input.marcas) {
        if (!marca.nombre && !marca.id) continue;

        const existente = marca.id ? store.marcas.find(m => m.id === marca.id) : null;

        if (existente) {
          if (marca.nombre !== undefined) existente.nombre = marca.nombre;
          if (marca.tipo !== undefined) existente.tipo = marca.tipo;
          if (marca.periodo) existente.periodo = { ...existente.periodo, ...marca.periodo };
          if (marca.recurrencia !== undefined) existente.recurrencia = marca.recurrencia;
          if (marca.impacto !== undefined) existente.impacto = marca.impacto;
        } else {
          store.marcas.push({
            id: marca.id || crypto.randomUUID(),
            nombre: marca.nombre,
            tipo: TIPOS_MARCA.includes(marca.tipo) ? marca.tipo : 'otro',
            periodo: marca.periodo || { inicio: null, fin: null },
            recurrencia: RECURRENCIAS.includes(marca.recurrencia) ? marca.recurrencia : 'puntual',
            impacto: IMPACTOS.includes(marca.impacto) ? marca.impacto : 'medio'
          });
        }
      }
      campos.push('marcas');
    }

    if (Array.isArray(input.cadencias)) {
      for (const cad of input.cadencias) {
        if (!cad.canal_id && !cad.id) continue;

        const existente = cad.id ? store.cadencias.find(c => c.id === cad.id) : null;

        if (existente) {
          if (cad.canal_id !== undefined) existente.canal_id = cad.canal_id;
          if (cad.frecuencia !== undefined) existente.frecuencia = cad.frecuencia;
          if (cad.unidad !== undefined) existente.unidad = cad.unidad;
          if (cad.activa !== undefined) existente.activa = cad.activa;
        } else {
          store.cadencias.push({
            id: cad.id || crypto.randomUUID(),
            canal_id: cad.canal_id,
            frecuencia: cad.frecuencia || 1,
            unidad: UNIDADES_CADENCIA.includes(cad.unidad) ? cad.unidad : 'semanal',
            activa: cad.activa !== false
          });
        }
      }
      campos.push('cadencias');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.calendar.actualizado', {
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

module.exports = MarketingCalendarReflejo;
