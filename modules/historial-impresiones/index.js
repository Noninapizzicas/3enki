'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

// Valor canonico para dato ausente (invariante 5: dato ausente nombrado, nunca inventado).
const DESCONOCIDO = 'desconocido';

class HistorialImpresionesReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'historial-impresiones';
    this.version = 'reflejo-0.1.0';
    // store: Map<project_id, Array<RegistroImpresion>>  — append-only, mas reciente primero.
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'historial-impresiones.json',
      dir: '/3d/historial-impresiones',
      snapshot: (pid) => {
        const s = this._stores.get(pid);
        return s ? { project_id: pid, registros: s } : null;
      },
      hidratar: (pid, data) => {
        if (!data || !Array.isArray(data.registros)) return;
        const s = this._obtenerOCrear(pid);
        for (const item of data.registros) {
          if (item && item.id) s.push(item);
        }
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

  // =============================================================
  // Handlers RPC (una linea cada uno, delegan a _atender)
  // =============================================================
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'historial.registrar.response', d => this._registrar(d));
  }
  onListarRequest(e) {
    return this._atender(e, 'listar', 'historial.listar.response', d => this._listar(d));
  }

  // =============================================================
  // Handler fire-and-forget: impresion.completada → registrar
  // =============================================================
  onImpresionCompletada(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid) return;
    const r = this._registrar({
      project_id: pid,
      modelo_id: d.modelo_id,
      modelo_nombre: d.modelo_nombre,
      material: d.material,
      filamento_usado: d.filamento_usado,
      tiempo: d.tiempo,
      resultado: d.resultado || 'completada'
    });
    // El par de fallo ya se emite dentro de _registrar si aplica.
    return r;
  }

  // =============================================================
  // Store
  // =============================================================
  _obtenerOCrear(pid) {
    let store = this._stores.get(pid);
    if (!store) {
      store = [];
      this._stores.set(pid, store);
    }
    return store;
  }

  // =============================================================
  // Proyecciones
  // =============================================================
  _registrar(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };
    if (!input.modelo_id) {
      this._publicarEvento('historial.registrar.failed', {
        project_id: pid, motivo: 'modelo_id_requerido'
      });
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'modelo_id requerido' } };
    }

    const store = this._obtenerOCrear(pid);

    // Append-only: entrada inmutable con id unico y fecha de registro.
    const registro = {
      id: crypto.randomUUID(),
      project_id: pid,
      modelo_id: input.modelo_id,
      modelo_nombre: input.modelo_nombre || DESCONOCIDO,
      material: input.material || DESCONOCIDO,
      filamento_usado: input.filamento_usado || DESCONOCIDO,
      tiempo: input.tiempo || DESCONOCIDO,
      resultado: input.resultado || DESCONOCIDO,
      fecha: input.fecha || new Date().toISOString(),
      registrado_en: new Date().toISOString()
    };
    store.unshift(registro); // mas reciente primero
    this._persist.marcarDirty(pid);

    this._publicarEvento('historial.impresion_registrada', {
      project_id: pid, id: registro.id, modelo_id: registro.modelo_id, resultado: registro.resultado
    });

    return { status: 200, data: { project_id: pid, id: registro.id, registrado: true } };
  }

  _listar(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._stores.get(pid);
    if (!store) {
      return { status: 200, data: { project_id: pid, registros: [], total: 0 } };
    }
    return { status: 200, data: { project_id: pid, registros: store, total: store.length } };
  }

  // =============================================================
  // Utilidades
  // =============================================================
  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) {
      this.eventBus.publish(evento, { ...data, timestamp: new Date().toISOString() });
    }
  }

  // =============================================================
  // Tools (para el LLM / UI)
  // =============================================================
  toolRegistrar(params) { return this._registrar(params); }
  toolListar(params) { return this._listar(params); }

  handleUiRegistrar(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') return this._registrar(data);
    return reply(this._registrar(data));
  }
  handleUiListar(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') return this._listar(data);
    return reply(this._listar(data));
  }
}

module.exports = HistorialImpresionesReflejo;
