'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const FORMATOS = ['articulo', 'video', 'infografia', 'landing', 'email', 'post_social', 'podcast', 'caso_exito', 'guia', 'faq', 'otro'];
const ETAPAS_FUNNEL = ['awareness', 'consideration', 'conversion', 'retention', 'advocacy'];

const TRANSICIONES_PIEZA = {
  idea:      ['borrador', 'retirado'],
  borrador:  ['revision', 'retirado'],
  revision:  ['borrador', 'publicado', 'retirado'],
  publicado: ['retirado'],
  retirado:  []
};

const STORE_VACIO = Object.freeze({
  esquema: 'marketing-content-v1',
  piezas: []
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingContentReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-content';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-content.json',
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
    return this._atender(e, 'get', 'marketing.content.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.content.update.response', d => this._update(d));
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

  _filtrar(piezas, filtros) {
    if (!filtros) return piezas;
    return piezas.filter(p => {
      if (filtros.formato && p.formato !== filtros.formato) return false;
      if (filtros.canal_id && p.canal_id !== filtros.canal_id) return false;
      if (filtros.etapa_funnel && p.etapa_funnel !== filtros.etapa_funnel) return false;
      if (filtros.estado && p.estado !== filtros.estado) return false;
      if (filtros.madre_id !== undefined) {
        if (filtros.madre_id === null && p.madre_id !== null) return false;
        if (filtros.madre_id !== null && p.madre_id !== filtros.madre_id) return false;
      }
      return true;
    });
  }

  _get(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const piezas = this._filtrar(store.piezas, input.filtros);

    const porEstado = {};
    for (const p of store.piezas) {
      porEstado[p.estado] = (porEstado[p.estado] || 0) + 1;
    }
    const madres = store.piezas.filter(p => store.piezas.some(h => h.madre_id === p.id)).length;

    return {
      status: 200,
      data: {
        project_id: pid,
        piezas,
        resumen: {
          total: store.piezas.length,
          por_estado: porEstado,
          madres_con_hijas: madres,
          originales: store.piezas.filter(p => !p.madre_id).length
        }
      }
    };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (Array.isArray(input.piezas)) {
      for (const pieza of input.piezas) {
        if (!pieza.titulo && !pieza.id) continue;

        const existente = pieza.id ? store.piezas.find(p => p.id === pieza.id) : null;

        if (existente) {
          if (pieza.estado && pieza.estado !== existente.estado) {
            const validas = TRANSICIONES_PIEZA[existente.estado] || [];
            if (!validas.includes(pieza.estado)) {
              return {
                status: 400,
                data: { error: 'INVALID_STATE_TRANSITION', message: `Pieza '${existente.id}': transición ${existente.estado} → ${pieza.estado} no permitida`, transiciones_validas: validas }
              };
            }
            existente.estado = pieza.estado;
          }
          if (pieza.titulo !== undefined) existente.titulo = pieza.titulo;
          if (pieza.formato !== undefined) existente.formato = pieza.formato;
          if (pieza.canal_id !== undefined) existente.canal_id = pieza.canal_id;
          if (pieza.etapa_funnel !== undefined) existente.etapa_funnel = pieza.etapa_funnel;
          if (pieza.descripcion !== undefined) existente.descripcion = pieza.descripcion;
        } else {
          if (pieza.madre_id) {
            const madre = store.piezas.find(p => p.id === pieza.madre_id);
            if (!madre) {
              return { status: 400, data: { error: 'MADRE_NOT_FOUND', message: `Pieza madre '${pieza.madre_id}' no existe` } };
            }
          }

          store.piezas.push({
            id: pieza.id || crypto.randomUUID(),
            titulo: pieza.titulo,
            formato: FORMATOS.includes(pieza.formato) ? pieza.formato : 'otro',
            canal_id: pieza.canal_id || null,
            etapa_funnel: ETAPAS_FUNNEL.includes(pieza.etapa_funnel) ? pieza.etapa_funnel : null,
            estado: 'idea',
            madre_id: pieza.madre_id || null,
            descripcion: pieza.descripcion || '',
            creado: new Date().toISOString()
          });
        }
      }
      campos.push('piezas');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.content.actualizado', {
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

module.exports = MarketingContentReflejo;
