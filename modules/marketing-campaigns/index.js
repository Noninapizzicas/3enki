'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const TRANSICIONES_CAMPAÑA = {
  borrador:  ['aprobado', 'cancelada'],
  aprobado:  ['activa', 'cancelada'],
  activa:    ['cerrada', 'cancelada'],
  cerrada:   [],
  cancelada: []
};

const STORE_VACIO = Object.freeze({
  esquema: 'marketing-campaigns-v1',
  campañas: []
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingCampaignsReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-campaigns';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-campaigns.json',
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
    return this._atender(e, 'get', 'marketing.campaigns.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.campaigns.update.response', d => this._update(d));
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
    let campañas = store.campañas;

    if (input.filtros?.estado) {
      campañas = campañas.filter(c => c.estado === input.filtros.estado);
    }

    const porEstado = {};
    for (const c of store.campañas) {
      porEstado[c.estado] = (porEstado[c.estado] || 0) + 1;
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        campañas,
        resumen: {
          total: store.campañas.length,
          por_estado: porEstado,
          activas: store.campañas.filter(c => c.estado === 'activa').length
        }
      }
    };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (Array.isArray(input.campañas)) {
      for (const camp of input.campañas) {
        if (!camp.nombre && !camp.id) continue;

        const existente = camp.id ? store.campañas.find(c => c.id === camp.id) : null;

        if (existente) {
          if (camp.estado && camp.estado !== existente.estado) {
            const validas = TRANSICIONES_CAMPAÑA[existente.estado] || [];
            if (!validas.includes(camp.estado)) {
              return {
                status: 400,
                data: { error: 'INVALID_STATE_TRANSITION', message: `Campaña '${existente.id}': transición ${existente.estado} → ${camp.estado} no permitida`, transiciones_validas: validas }
              };
            }
            existente.estado = camp.estado;
          }
          if (camp.nombre !== undefined) existente.nombre = camp.nombre;
          if (camp.objetivo !== undefined) existente.objetivo = camp.objetivo;
          if (camp.audiencia_id !== undefined) existente.audiencia_id = camp.audiencia_id;
          if (camp.canales_ids !== undefined) existente.canales_ids = camp.canales_ids;
          if (camp.presupuesto !== undefined) existente.presupuesto = camp.presupuesto;
          if (camp.periodo !== undefined) existente.periodo = camp.periodo;
          if (camp.kpis !== undefined) existente.kpis = camp.kpis;
          if (camp.assets_ids !== undefined) existente.assets_ids = camp.assets_ids;
          if (camp.cierre !== undefined) existente.cierre = camp.cierre;
        } else {
          store.campañas.push({
            id: camp.id || crypto.randomUUID(),
            nombre: camp.nombre,
            objetivo: camp.objetivo || { texto: '', metrica: null, valor_objetivo: null },
            audiencia_id: camp.audiencia_id || null,
            canales_ids: camp.canales_ids || [],
            presupuesto: camp.presupuesto || { cantidad: 0, moneda: 'EUR' },
            periodo: camp.periodo || { inicio: null, fin: null },
            kpis: camp.kpis || [],
            assets_ids: camp.assets_ids || [],
            estado: 'borrador',
            cierre: null
          });
        }
      }
      campos.push('campañas');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.campaigns.actualizado', {
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

module.exports = MarketingCampaignsReflejo;
