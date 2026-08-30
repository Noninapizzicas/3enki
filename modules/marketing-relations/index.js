'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const TRANSICIONES_SUSCRIPTOR = {
  activo:       ['pausado', 'dado_de_baja'],
  pausado:      ['activo', 'dado_de_baja'],
  dado_de_baja: []
};

const CANALES_VALIDOS = ['email', 'whatsapp', 'sms', 'push'];
const TIPOS_INTERACCION = ['envio', 'respuesta', 'feedback', 'queja', 'bounce'];
const RESULTADOS_VALIDOS = ['entregado', 'abierto', 'click', 'respondido', 'rebotado', 'queja'];

const STORE_VACIO = Object.freeze({
  esquema: 'marketing-relations-v1',
  suscriptores: [],
  interacciones: []
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingRelationsReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-relations';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-relations.json',
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
    return this._atender(e, 'get', 'marketing.relations.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.relations.update.response', d => this._update(d));
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
    let suscriptores = store.suscriptores;
    let interacciones = store.interacciones;

    if (input.filtros?.estado) {
      suscriptores = suscriptores.filter(s => s.estado === input.filtros.estado);
    }
    if (input.filtros?.canal_preferido) {
      suscriptores = suscriptores.filter(s => s.canal_preferido === input.filtros.canal_preferido);
    }
    if (input.filtros?.suscriptor_id) {
      interacciones = interacciones.filter(i => i.suscriptor_id === input.filtros.suscriptor_id);
    }

    const porEstado = {};
    for (const s of store.suscriptores) {
      porEstado[s.estado] = (porEstado[s.estado] || 0) + 1;
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        suscriptores,
        interacciones,
        resumen: {
          total_suscriptores: store.suscriptores.length,
          por_estado: porEstado,
          activos: store.suscriptores.filter(s => s.estado === 'activo').length,
          total_interacciones: store.interacciones.length
        }
      }
    };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (Array.isArray(input.suscriptores)) {
      for (const sub of input.suscriptores) {
        if (!sub.nombre && !sub.id) continue;

        const existente = sub.id ? store.suscriptores.find(s => s.id === sub.id) : null;

        if (existente) {
          if (sub.estado && sub.estado !== existente.estado) {
            const validas = TRANSICIONES_SUSCRIPTOR[existente.estado] || [];
            if (!validas.includes(sub.estado)) {
              return {
                status: 400,
                data: { error: 'INVALID_STATE_TRANSITION', message: `Suscriptor '${existente.id}': transición ${existente.estado} → ${sub.estado} no permitida`, transiciones_validas: validas }
              };
            }
            existente.estado = sub.estado;
          }
          if (sub.nombre !== undefined) existente.nombre = sub.nombre;
          if (sub.contacto !== undefined) existente.contacto = sub.contacto;
          if (sub.canal_preferido !== undefined) existente.canal_preferido = sub.canal_preferido;
          if (sub.segmentos_ids !== undefined) existente.segmentos_ids = sub.segmentos_ids;
          if (sub.preferencias !== undefined) existente.preferencias = sub.preferencias;
        } else {
          if (!sub.consentimiento || !sub.consentimiento.fecha || !sub.consentimiento.origen) {
            return {
              status: 400,
              data: { error: 'MISSING_CONSENT', message: 'Todo suscriptor nuevo requiere consentimiento con fecha y origen' }
            };
          }
          store.suscriptores.push({
            id: sub.id || crypto.randomUUID(),
            nombre: sub.nombre,
            contacto: sub.contacto || {},
            canal_preferido: sub.canal_preferido || 'email',
            segmentos_ids: sub.segmentos_ids || [],
            consentimiento: sub.consentimiento,
            preferencias: sub.preferencias || { frecuencia: 'semanal', temas: [], idioma: 'es' },
            estado: 'activo'
          });
        }
      }
      campos.push('suscriptores');
    }

    if (Array.isArray(input.interacciones)) {
      for (const inter of input.interacciones) {
        if (!inter.suscriptor_id) continue;

        const suscriptor = store.suscriptores.find(s => s.id === inter.suscriptor_id);
        if (!suscriptor) {
          return {
            status: 400,
            data: { error: 'SUBSCRIBER_NOT_FOUND', message: `Suscriptor '${inter.suscriptor_id}' no encontrado` }
          };
        }

        store.interacciones.push({
          id: crypto.randomUUID(),
          suscriptor_id: inter.suscriptor_id,
          tipo: inter.tipo || 'envio',
          canal_id: inter.canal_id || null,
          pieza_id: inter.pieza_id || null,
          fecha: new Date().toISOString(),
          resultado: inter.resultado || 'entregado',
          datos: inter.datos || {}
        });
      }
      campos.push('interacciones');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.relations.actualizado', {
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

module.exports = MarketingRelationsReflejo;
