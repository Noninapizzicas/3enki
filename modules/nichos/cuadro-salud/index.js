/**
 * nichos/cuadro-salud — REFLEJO JS (CUSTODIO del vertical NICHOS).
 *
 * Cuadro de salud financiera por proyecto. Compone vista con ingresos,
 * costes, flujo y estado (GENERA, SANGRA, NEUTRO). Recalcula
 * automaticamente al registrar cobro.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/cuadro-salud.json
 *   {
 *     _version, _updated,
 *     salud: {
 *       version:        Int,
 *       ingresos:       Number,
 *       costes:         Number,
 *       flujo:          Number,
 *       estado:         'GENERA' | 'SANGRA' | 'NEUTRO',
 *       recalculado_at: ISO8601
 *     }
 *   }
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
    ingresos: 0,
    costes: 0,
    flujo: 0,
    estado: 'NEUTRO',
    recalculado_at: null
  };
}

function calcularEstado(flujo) {
  if (flujo > 0) return 'GENERA';
  if (flujo < 0) return 'SANGRA';
  return 'NEUTRO';
}

class CuadroSalud extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuadro-salud';
    this.version = '0.1.0';
    this.saludPorProyecto = new Map();   // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cuadro-salud.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ salud: this.saludPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.salud && typeof data.salud === 'object') {
          this.saludPorProyecto.set(pid, data.salud);
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
  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'nichos.cuadro.salud.estado.response', d => this._estado(d));
  }

  onRecalcularRequest(e) {
    return this._atender(e, 'recalcular', 'nichos.cuadro.salud.recalcular.response', d => this._recalcular(d));
  }

  // ── F7b: recalcula al registrar cobro ──
  onCobroRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    const project_id = d.id_proyecto || d.project_id;
    if (!project_id) return;
    this._recalcular({ project_id });
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto vacio si no hay fichero.
  // =============================================================
  _store(project_id) {
    let s = this.saludPorProyecto.get(project_id);
    if (!s) {
      s = esqueletoVacio();
      this.saludPorProyecto.set(project_id, s);
    }
    return s;
  }

  // =============================================================
  // PROYECCIONES — logica pura
  // =============================================================
  _estado(input) {
    if (!input.project_id) return this._invalid('project_id');

    const store = this._store(input.project_id);

    return {
      status: 200,
      data: {
        vista_proyecto: {
          ingresos: store.ingresos,
          costes: store.costes,
          flujo: store.flujo,
          estado: store.estado,
          recalculado_at: store.recalculado_at
        }
      }
    };
  }

  _recalcular(input) {
    if (!input.project_id) return this._invalid('project_id');

    const store = this._store(input.project_id);

    // Solicitar cobros al registro-cobros
    const filtro = {};
    if (input.hasta) filtro.hasta = input.hasta;

    this.eventBus?.publish('nichos.registro.cobros.consultar.request', {
      project_id: input.project_id,
      filtro,
      _callback: (resp) => {
        if (!resp || resp.status !== 200) return;
        this._aplicarRecalculo(input.project_id, store, resp.data.entradas || []);
      }
    });

    // Solicitar costes imputados
    this.eventBus?.publish('nichos.costes.imputar.request', {
      project_id: input.project_id,
      hasta: input.hasta
    });

    // Recalculo sincrono con datos locales disponibles
    // (el recalculo completo se activa cuando llegan las respuestas)
    const ahora = nowISO();
    store.recalculado_at = ahora;
    store.version += 1;

    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.salud.recalculada', {
      id_proyecto: input.project_id,
      estado: store.estado,
      flujo: store.flujo,
      timestamp: ahora
    });

    return {
      status: 200,
      data: {
        vista_proyecto: {
          ingresos: store.ingresos,
          costes: store.costes,
          flujo: store.flujo,
          estado: store.estado,
          recalculado_at: ahora
        }
      }
    };
  }

  /**
   * Aplica recalculo con entradas reales del registro-cobros.
   * Suma EFECTIVO + COMPROMETIDO como ingresos; DEVUELTO resta.
   */
  _aplicarRecalculo(project_id, store, entradas) {
    let ingresos = 0;
    for (const e of entradas) {
      if (e.tipo === 'EFECTIVO' || e.tipo === 'COMPROMETIDO') {
        ingresos += e.importe;
      } else if (e.tipo === 'DEVUELTO') {
        ingresos -= e.importe;
      }
    }

    store.ingresos = ingresos;
    store.flujo = store.ingresos - store.costes;
    store.estado = calcularEstado(store.flujo);
    store.recalculado_at = nowISO();
    store.version += 1;

    this._persist.marcarDirty(project_id);

    if (store.estado === 'SANGRA') {
      this.eventBus?.publish('nichos.sangria.detectada', {
        id_proyecto: project_id,
        flujo: store.flujo,
        estado: store.estado,
        timestamp: store.recalculado_at
      });
    }

    this.eventBus?.publish('nichos.salud.recalculada', {
      id_proyecto: project_id,
      estado: store.estado,
      flujo: store.flujo,
      timestamp: store.recalculado_at
    });
  }
}

module.exports = CuadroSalud;
