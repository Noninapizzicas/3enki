/**
 * nichos/historial — REFLEJO JS (CUSTODIO del vertical NICHOS).
 *
 * Log append-only de eventos por nicho. Registra cada evento relevante del
 * ciclo de vida de un nicho y sirve la cronologia completa por RPC.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/historial.json
 *   {
 *     _version, _updated,
 *     historial: {
 *       version:          Int,
 *       logs:             { <id_nicho>: [ { evento, at } ] },
 *       total_registros:  Int
 *     }
 *   }
 *
 * Invariante: append-only — los eventos registrados NUNCA se mutan ni se
 * borran. Cada registro lleva timestamp de ingreso.
 *
 * Patron: ModuloHibridoReflejo + PosPersistencia. REFLEJO puro.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

function esqueletoVacio() {
  return {
    version: 0,
    logs: {},
    total_registros: 0
  };
}

class Historial extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'historial';
    this.version = '0.1.0';
    this.historialPorProyecto = new Map();   // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'historial.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ historial: this.historialPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.historial && typeof data.historial === 'object') {
          this.historialPorProyecto.set(pid, data.historial);
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

  // ── RPC HANDLERS ──
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'nichos.historial.registrar.response', d => this._registrar(d));
  }

  onCronologiaRequest(e) {
    return this._atender(e, 'cronologia', 'nichos.historial.cronologia.response', d => this._cronologia(d));
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto vacio si no hay fichero.
  // =============================================================
  _store(project_id) {
    let s = this.historialPorProyecto.get(project_id);
    if (!s) {
      s = esqueletoVacio();
      this.historialPorProyecto.set(project_id, s);
    }
    return s;
  }

  // =============================================================
  // PROYECCIONES — logica pura
  // =============================================================
  _registrar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');
    if (!input.evento || typeof input.evento !== 'object') return this._invalid('evento');

    const store = this._store(input.project_id);
    const idNicho = input.id;

    // Append-only: crear el array del nicho si no existe.
    if (!Array.isArray(store.logs[idNicho])) {
      store.logs[idNicho] = [];
    }

    const registro = {
      evento: input.evento,
      at: nowISO()
    };

    store.logs[idNicho].push(registro);
    store.version += 1;
    store.total_registros += 1;

    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.historial.registrado', {
      project_id: input.project_id,
      id: idNicho,
      evento: input.evento,
      at: registro.at,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: {
        registrado: true,
        total: store.logs[idNicho].length
      }
    };
  }

  _cronologia(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');

    const store = this._store(input.project_id);
    const idNicho = input.id;
    const eventos = Array.isArray(store.logs[idNicho])
      ? store.logs[idNicho].slice()
      : [];

    return {
      status: 200,
      data: {
        eventos
      }
    };
  }
}

module.exports = Historial;
