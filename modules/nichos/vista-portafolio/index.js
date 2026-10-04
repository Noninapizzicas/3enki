/**
 * nichos/vista-portafolio — REFLEJO JS (CUSTODIO del vertical NICHOS).
 *
 * Snapshot agregado de salud por portafolio. Persiste la vista con los
 * proyectos, cuantos generan, cuantos sangran y el flujo total.
 * Se recalcula al recibir nichos.salud.recalculada.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/vista-portafolio.json
 *   {
 *     _version, _updated,
 *     vista: {
 *       version:      Int,
 *       proyectos:    [ { id, estado, flujo } ],
 *       generan:      Int,
 *       sangran:      Int,
 *       flujo_total:  Number
 *     }
 *   }
 *
 * Patron: ModuloHibridoReflejo + PosPersistencia. CUSTODIO.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

function esqueletoVacio() {
  return {
    version: 0,
    proyectos: [],
    generan: 0,
    sangran: 0,
    flujo_total: 0
  };
}

class VistaPortafolio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'vista-portafolio';
    this.version = '0.1.0';
    this.vistaPorProyecto = new Map();   // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'vista-portafolio.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ vista: this.vistaPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.vista && typeof data.vista === 'object') {
          this.vistaPorProyecto.set(pid, data.vista);
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

  // ── RPC HANDLER ──
  onVistaRequest(e) {
    return this._atender(e, 'vista', 'nichos.portafolio.vista.response', d => this._vista(d));
  }

  // ── PULSO HANDLER ──
  onSaludRecalculada(e) {
    const d = (e && (e.data || e)) || {};
    return this._actualizarDesde(d);
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto vacio si no hay fichero.
  // =============================================================
  _store(project_id) {
    let s = this.vistaPorProyecto.get(project_id);
    if (!s) {
      s = esqueletoVacio();
      this.vistaPorProyecto.set(project_id, s);
    }
    return s;
  }

  // =============================================================
  // PROYECCIONES — logica pura
  // =============================================================

  /**
   * _vista — devuelve el snapshot actual del portafolio.
   *
   * @param {Object} input
   * @param {string} input.project_id
   * @param {string} [input.ahora] - ISO timestamp (informativo)
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  _vista(input) {
    if (!input.project_id) return this._invalid('project_id');

    const store = this._store(input.project_id);

    return {
      status: 200,
      data: {
        vista_portafolio: {
          proyectos: store.proyectos.slice(),
          generan: store.generan,
          sangran: store.sangran,
          flujo_total: store.flujo_total,
          version: store.version
        }
      }
    };
  }

  /**
   * _actualizarDesde — recalcula la vista al recibir salud recalculada de un proyecto.
   *
   * @param {Object} data - payload de nichos.salud.recalculada
   */
  _actualizarDesde(data) {
    if (!data.project_id) return;
    if (!data.id || !data.estado) return;

    const store = this._store(data.project_id);

    // Buscar si el proyecto ya existe en la vista
    const idx = store.proyectos.findIndex(p => p.id === data.id);
    const entrada = {
      id: data.id,
      estado: data.estado,
      flujo: typeof data.flujo === 'number' ? data.flujo : 0
    };

    if (idx >= 0) {
      store.proyectos[idx] = entrada;
    } else {
      store.proyectos.push(entrada);
    }

    // Recalcular agregados
    store.generan = store.proyectos.filter(p => p.flujo > 0).length;
    store.sangran = store.proyectos.filter(p => p.flujo < 0).length;
    store.flujo_total = store.proyectos.reduce((sum, p) => sum + (p.flujo || 0), 0);
    store.version += 1;

    this._persist.marcarDirty(data.project_id);

    // PULSO
    this.eventBus?.publish('nichos.portafolio.recalculado', {
      vista: store.proyectos.slice(),
      generan: store.generan,
      sangran: store.sangran,
      flujo_total: store.flujo_total,
      timestamp: nowISO()
    });
  }
}

module.exports = VistaPortafolio;
