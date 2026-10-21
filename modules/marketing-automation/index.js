'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const TRANSICIONES_FLUJO = {
  borrador: ['activo'],
  activo:   ['pausado', 'retirado'],
  pausado:  ['activo', 'retirado'],
  retirado: []
};

const TIPOS_PASO = ['enviar', 'esperar', 'evaluar', 'bifurcar'];

const STORE_VACIO = Object.freeze({
  esquema: 'marketing-automation-v1',
  flujos: []
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingAutomationReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-automation';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-automation.json',
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
    return this._atender(e, 'get', 'marketing.automation.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.automation.update.response', d => this._update(d));
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
    let flujos = store.flujos;

    if (input.filtros?.estado) {
      flujos = flujos.filter(f => f.estado === input.filtros.estado);
    }
    if (input.filtros?.trigger_evento) {
      flujos = flujos.filter(f => f.trigger && f.trigger.evento === input.filtros.trigger_evento);
    }

    const porEstado = {};
    for (const f of store.flujos) {
      porEstado[f.estado] = (porEstado[f.estado] || 0) + 1;
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        flujos,
        resumen: {
          total: store.flujos.length,
          por_estado: porEstado,
          activos: store.flujos.filter(f => f.estado === 'activo').length
        }
      }
    };
  }

  _validarFlujo(flujo) {
    if (!flujo.trigger || !flujo.trigger.evento) {
      return 'Trigger definido: todo trigger debe nombrar un evento';
    }
    if (!Array.isArray(flujo.pasos) || flujo.pasos.length === 0) {
      return 'Flujo completo: todo flujo necesita al menos un paso';
    }
    for (const paso of flujo.pasos) {
      if (!TIPOS_PASO.includes(paso.tipo)) {
        return `Tipo de paso '${paso.tipo}' no válido. Válidos: ${TIPOS_PASO.join(', ')}`;
      }
    }
    return null;
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (Array.isArray(input.flujos)) {
      for (const flujo of input.flujos) {
        if (!flujo.nombre && !flujo.id) continue;

        const existente = flujo.id ? store.flujos.find(f => f.id === flujo.id) : null;

        if (existente) {
          if (flujo.estado && flujo.estado !== existente.estado) {
            const validas = TRANSICIONES_FLUJO[existente.estado] || [];
            if (!validas.includes(flujo.estado)) {
              return {
                status: 400,
                data: { error: 'INVALID_STATE_TRANSITION', message: `Flujo '${existente.id}': transición ${existente.estado} → ${flujo.estado} no permitida`, transiciones_validas: validas }
              };
            }
            if (flujo.estado === 'activo') {
              const err = this._validarFlujo(existente);
              if (err) {
                return { status: 400, data: { error: 'INVALID_FLOW', message: err } };
              }
            }
            existente.estado = flujo.estado;
          }
          if (flujo.nombre !== undefined) existente.nombre = flujo.nombre;
          if (flujo.trigger !== undefined) existente.trigger = flujo.trigger;
          if (flujo.pasos !== undefined) existente.pasos = flujo.pasos;
          if (flujo.reglas !== undefined) existente.reglas = flujo.reglas;

          if (flujo.ejecucion) {
            existente.historial.push({
              fecha: flujo.ejecucion.fecha || new Date().toISOString(),
              trigger_data: flujo.ejecucion.trigger_data || {},
              pasos_ejecutados: flujo.ejecucion.pasos_ejecutados || [],
              resultado: flujo.ejecucion.resultado || 'completado'
            });
          }
        } else {
          const nuevo = {
            id: flujo.id || crypto.randomUUID(),
            nombre: flujo.nombre,
            trigger: flujo.trigger || { evento: null, condiciones: {} },
            pasos: flujo.pasos || [],
            reglas: flujo.reglas || [],
            estado: 'borrador',
            historial: []
          };
          store.flujos.push(nuevo);
        }
      }
      campos.push('flujos');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.automation.actualizado', {
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

module.exports = MarketingAutomationReflejo;
