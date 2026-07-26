/**
 * project-profile — REFLEJO JS: perfil extendido del proyecto.
 *
 * Propósito, temporalidad, recursos, stakeholders, entregables,
 * criterios de éxito y valor. Escucha project.created para
 * inicializar el perfil vacío. Persiste por proyecto.
 *
 * v0.1.0: CRUD básico del perfil.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const PERFIL_VACIO = Object.freeze({
  proposito: '',
  temporalidad: { inicio: null, fin_estimado: null },
  recursos: { personas: [], presupuesto: null },
  riesgos: [],
  stakeholders: [],
  entregables: [],
  criterios_exito: [],
  valor: ''
});

class ProjectProfileReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'project-profile';
    this.version = 'reflejo-0.1.0';
    this._perfiles = new Map();  // project_id → perfil

    this._persist = new PosPersistencia({
      modulo: this, file: 'project-profile.json',
      snapshot: (pid) => {
        const p = this._perfiles.get(pid);
        return p ? { project_id: pid, perfil: p } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.perfil) this._perfiles.set(pid, data.perfil);
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers ──

  onGetRequest(e) {
    return this._atender(e, 'get', 'project-profile.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'project-profile.update.response', d => this._update(d));
  }

  // ── Proyecciones ──

  _get(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    let perfil = this._perfiles.get(pid);
    if (!perfil) {
      // Bajo demanda: igual que carrito/cobro/cuenta
      perfil = { ...PERFIL_VACIO };
      this._perfiles.set(pid, perfil);
      this._persist.marcarDirty(pid);
    }

    return { status: 200, data: { project_id: pid, perfil } };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    let perfil = this._perfiles.get(pid);
    if (!perfil) {
      perfil = { ...PERFIL_VACIO };
      this._perfiles.set(pid, perfil);
    }

    const campos = [];
    for (const campo of ['proposito', 'temporalidad', 'recursos', 'riesgos',
                         'stakeholders', 'entregables', 'criterios_exito', 'valor']) {
      if (input[campo] !== undefined) {
        perfil[campo] = input[campo];
        campos.push(campo);
      }
    }

    this._publicarEvento('project-profile.actualizado', {
      project_id: pid, campos_actualizados: campos
    });

    return { status: 200, data: { project_id: pid, perfil, campos_actualizados: campos } };
  }

  // ── Tools ──

  toolGet(params) {
    return this._get(params);
  }

  toolUpdate(params) {
    return this._update(params);
  }

  // ── UI Handlers ──

  handleUiGet(msg, reply) {
    if (typeof reply !== 'function') {
      // Llamado desde el bus sin callback
      return this._get(msg.data || msg);
    }
    const pid = msg.project_id || msg.data?.project_id;
    if (!pid) return reply({ status: 400, error: 'project_id requerido' });
    return reply(this._get({ project_id: pid }));
  }

  handleUiUpdate(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') {
      return this._update(data);
    }
    return reply(this._update(data));
  }
}

module.exports = ProjectProfileReflejo;
