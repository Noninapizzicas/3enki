'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const TIPOS_METRICA = ['impresiones', 'clicks', 'conversiones', 'coste', 'roi', 'engagement', 'alcance', 'otro'];
const FUENTES_METRICA = ['manual', 'importado', 'calculado'];

const TRANSICIONES_EXPERIMENTO = {
  diseño: ['activo', 'cerrado'],
  activo: ['cerrado'],
  cerrado: []
};

const STORE_VACIO = Object.freeze({
  esquema: 'marketing-analytics-v1',
  metricas: [],
  experimentos: []
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingAnalyticsReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-analytics';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-analytics.json',
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
    return this._atender(e, 'get', 'marketing.analytics.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.analytics.update.response', d => this._update(d));
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

  _filtrarMetricas(metricas, filtros) {
    if (!filtros) return metricas;
    return metricas.filter(m => {
      if (filtros.tipo && m.tipo !== filtros.tipo) return false;
      if (filtros.canal_id && m.canal_id !== filtros.canal_id) return false;
      return true;
    });
  }

  _filtrarExperimentos(experimentos, filtros) {
    if (!filtros) return experimentos;
    return experimentos.filter(e => {
      if (filtros.estado_experimento && e.estado !== filtros.estado_experimento) return false;
      return true;
    });
  }

  _get(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const filtros = input.filtros || null;

    const metricas = this._filtrarMetricas(store.metricas, filtros);
    const experimentos = this._filtrarExperimentos(store.experimentos, filtros);

    const total_registros = store.metricas.reduce((s, m) => s + (m.registros?.length || 0), 0);

    return {
      status: 200,
      data: {
        project_id: pid,
        metricas,
        experimentos,
        resumen: {
          total_metricas: store.metricas.length,
          total_registros,
          experimentos_activos: store.experimentos.filter(e => e.estado === 'activo').length,
          experimentos_cerrados: store.experimentos.filter(e => e.estado === 'cerrado').length
        }
      }
    };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (Array.isArray(input.metricas)) {
      for (const met of input.metricas) {
        if (!met.nombre && !met.id) continue;

        const existente = met.id ? store.metricas.find(m => m.id === met.id) : null;

        if (existente) {
          if (met.nombre !== undefined) existente.nombre = met.nombre;
          if (met.tipo !== undefined) existente.tipo = met.tipo;
          if (met.fuente !== undefined) existente.fuente = met.fuente;
          if (met.canal_id !== undefined) existente.canal_id = met.canal_id;
          if (met.registro) {
            if (!existente.registros) existente.registros = [];
            existente.registros.push({
              fecha: met.registro.fecha || new Date().toISOString(),
              valor: met.registro.valor
            });
          }
        } else {
          const nueva = {
            id: met.id || crypto.randomUUID(),
            nombre: met.nombre,
            tipo: TIPOS_METRICA.includes(met.tipo) ? met.tipo : 'otro',
            fuente: FUENTES_METRICA.includes(met.fuente) ? met.fuente : 'manual',
            canal_id: met.canal_id || null,
            registros: []
          };
          if (met.registro) {
            nueva.registros.push({
              fecha: met.registro.fecha || new Date().toISOString(),
              valor: met.registro.valor
            });
          }
          store.metricas.push(nueva);
        }
      }
      campos.push('metricas');
    }

    if (Array.isArray(input.experimentos)) {
      for (const exp of input.experimentos) {
        if (!exp.hipotesis && !exp.id) continue;

        const existente = exp.id ? store.experimentos.find(e => e.id === exp.id) : null;

        if (existente) {
          if (exp.estado && exp.estado !== existente.estado) {
            const validas = TRANSICIONES_EXPERIMENTO[existente.estado] || [];
            if (!validas.includes(exp.estado)) {
              return {
                status: 400,
                data: { error: 'INVALID_STATE_TRANSITION', message: `Experimento '${existente.id}': transición ${existente.estado} → ${exp.estado} no permitida`, transiciones_validas: validas }
              };
            }
            existente.estado = exp.estado;
          }
          if (exp.hipotesis !== undefined) existente.hipotesis = exp.hipotesis;
          if (exp.variantes !== undefined) existente.variantes = exp.variantes;
          if (exp.metrica_id !== undefined) {
            const metrica = store.metricas.find(m => m.id === exp.metrica_id);
            if (!metrica) {
              return { status: 400, data: { error: 'METRICA_NOT_FOUND', message: `Métrica '${exp.metrica_id}' no existe` } };
            }
            existente.metrica_id = exp.metrica_id;
          }
          if (exp.dato) {
            existente.datos.push({
              variante: exp.dato.variante,
              valor: exp.dato.valor,
              fecha: new Date().toISOString()
            });
          }
          if (exp.veredicto !== undefined) existente.veredicto = exp.veredicto;
        } else {
          if (exp.metrica_id) {
            const metrica = store.metricas.find(m => m.id === exp.metrica_id);
            if (!metrica) {
              return { status: 400, data: { error: 'METRICA_NOT_FOUND', message: `Métrica '${exp.metrica_id}' no existe` } };
            }
          }

          store.experimentos.push({
            id: exp.id || crypto.randomUUID(),
            hipotesis: exp.hipotesis,
            variantes: exp.variantes || [],
            metrica_id: exp.metrica_id || null,
            datos: [],
            veredicto: null,
            estado: 'diseño'
          });
        }
      }
      campos.push('experimentos');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.analytics.actualizado', {
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

module.exports = MarketingAnalyticsReflejo;
