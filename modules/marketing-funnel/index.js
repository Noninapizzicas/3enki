'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const ETAPAS_DEFAULT = [
  { nombre: 'Awareness', orden: 1, descripcion: 'El proyecto es visible para la audiencia', metrica_principal: 'alcance', acciones: [] },
  { nombre: 'Consideration', orden: 2, descripcion: 'La audiencia evalúa si el proyecto le sirve', metrica_principal: 'engagement', acciones: [] },
  { nombre: 'Conversion', orden: 3, descripcion: 'La audiencia actúa (comprar, registrar, contactar)', metrica_principal: 'conversiones', acciones: [] },
  { nombre: 'Retention', orden: 4, descripcion: 'El cliente vuelve', metrica_principal: 'retencion', acciones: [] },
  { nombre: 'Advocacy', orden: 5, descripcion: 'El cliente recomienda', metrica_principal: 'referidos', acciones: [] }
];

const STORE_VACIO = Object.freeze({
  esquema: 'marketing-funnel-v1',
  etapas: [],
  flujos: []
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingFunnelReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-funnel';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-funnel.json',
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
    return this._atender(e, 'get', 'marketing.funnel.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.funnel.update.response', d => this._update(d));
  }

  _obtenerOCrear(pid) {
    let store = this._stores.get(pid);
    if (!store) {
      store = clonar(STORE_VACIO);
      store.etapas = ETAPAS_DEFAULT.map(e => ({ id: crypto.randomUUID(), ...e, volumen: null }));
      this._stores.set(pid, store);
      this._persist.marcarDirty(pid);
    }
    return store;
  }

  _calcularCuelloDeBotella(store) {
    if (store.flujos.length === 0) return null;

    let peor = null;
    for (const flujo of store.flujos) {
      if (!flujo.registros || flujo.registros.length === 0) continue;
      const ultimo = flujo.registros[flujo.registros.length - 1];
      if (peor === null || ultimo.tasa < peor.tasa) {
        const origen = store.etapas.find(e => e.id === flujo.etapa_origen_id);
        const destino = store.etapas.find(e => e.id === flujo.etapa_destino_id);
        peor = {
          flujo_id: flujo.id,
          etapa_origen: origen?.nombre || flujo.etapa_origen_id,
          etapa_destino: destino?.nombre || flujo.etapa_destino_id,
          tasa: this._round(ultimo.tasa)
        };
      }
    }
    return peor;
  }

  _get(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const cuello_de_botella = this._calcularCuelloDeBotella(store);

    return {
      status: 200,
      data: {
        project_id: pid,
        etapas: store.etapas,
        flujos: store.flujos,
        cuello_de_botella,
        resumen: {
          total_etapas: store.etapas.length,
          flujos_medidos: store.flujos.filter(f => f.registros && f.registros.length > 0).length,
          total_registros: store.flujos.reduce((s, f) => s + (f.registros?.length || 0), 0)
        }
      }
    };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (Array.isArray(input.etapas)) {
      for (const etapa of input.etapas) {
        if (!etapa.nombre && !etapa.id) continue;

        const existente = etapa.id ? store.etapas.find(e => e.id === etapa.id) : null;

        if (existente) {
          if (etapa.nombre !== undefined) existente.nombre = etapa.nombre;
          if (etapa.orden !== undefined) existente.orden = etapa.orden;
          if (etapa.descripcion !== undefined) existente.descripcion = etapa.descripcion;
          if (etapa.metrica_principal !== undefined) existente.metrica_principal = etapa.metrica_principal;
          if (etapa.acciones !== undefined) existente.acciones = etapa.acciones;
          if (etapa.volumen !== undefined) existente.volumen = etapa.volumen;
        } else {
          store.etapas.push({
            id: etapa.id || crypto.randomUUID(),
            nombre: etapa.nombre,
            orden: etapa.orden || store.etapas.length + 1,
            descripcion: etapa.descripcion || '',
            metrica_principal: etapa.metrica_principal || null,
            acciones: etapa.acciones || [],
            volumen: etapa.volumen || null
          });
        }
      }
      store.etapas.sort((a, b) => a.orden - b.orden);
      campos.push('etapas');
    }

    if (Array.isArray(input.flujos)) {
      for (const flujo of input.flujos) {
        if (!flujo.etapa_origen_id && !flujo.id) continue;

        const existente = flujo.id ? store.flujos.find(f => f.id === flujo.id) : null;

        if (existente) {
          if (flujo.registro) {
            existente.registros.push({
              fecha: new Date().toISOString(),
              tasa: flujo.registro.tasa,
              volumen_origen: flujo.registro.volumen_origen || null,
              volumen_destino: flujo.registro.volumen_destino || null
            });
            existente.tasa = flujo.registro.tasa;
          }
        } else {
          const origen = store.etapas.find(e => e.id === flujo.etapa_origen_id);
          if (!origen) {
            return { status: 400, data: { error: 'ETAPA_NOT_FOUND', message: `Etapa origen '${flujo.etapa_origen_id}' no existe` } };
          }
          const destino = store.etapas.find(e => e.id === flujo.etapa_destino_id);
          if (!destino) {
            return { status: 400, data: { error: 'ETAPA_NOT_FOUND', message: `Etapa destino '${flujo.etapa_destino_id}' no existe` } };
          }

          const nuevo = {
            id: flujo.id || crypto.randomUUID(),
            etapa_origen_id: flujo.etapa_origen_id,
            etapa_destino_id: flujo.etapa_destino_id,
            tasa: null,
            registros: []
          };

          if (flujo.registro) {
            nuevo.registros.push({
              fecha: new Date().toISOString(),
              tasa: flujo.registro.tasa,
              volumen_origen: flujo.registro.volumen_origen || null,
              volumen_destino: flujo.registro.volumen_destino || null
            });
            nuevo.tasa = flujo.registro.tasa;
          }

          store.flujos.push(nuevo);
        }
      }
      campos.push('flujos');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.funnel.actualizado', {
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

module.exports = MarketingFunnelReflejo;
