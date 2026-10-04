/**
 * nichos/cola-decisiones — REFLEJO JS (CUSTODIO del vertical NICHOS).
 *
 * Cola de solicitudes de decision pendientes por proyecto.
 * Encola, lista por dueno/vencimiento, cierra con respuesta y barre
 * caducadas via scheduler.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/cola-decisiones.json
 *   {
 *     _version, _updated,
 *     cola: {
 *       version:       Int,
 *       solicitudes:   [ { id, tipo, contexto, opciones, caducidad, estado, respuesta? } ]
 *     }
 *   }
 *
 * Estados de solicitud: ABIERTA | RESPONDIDA | CADUCADA
 *
 * Patron: ModuloHibridoReflejo + PosPersistencia. CUSTODIO.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

let _seqId = 0;
function nuevoId() {
  _seqId += 1;
  return `dec_${Date.now()}_${_seqId}`;
}

const ESTADOS = { ABIERTA: 'ABIERTA', RESPONDIDA: 'RESPONDIDA', CADUCADA: 'CADUCADA' };

function esqueletoVacio() {
  return {
    version: 0,
    solicitudes: []
  };
}

class ColaDecisiones extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cola-decisiones';
    this.version = '0.1.0';
    this.colaPorProyecto = new Map();   // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cola-decisiones.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ cola: this.colaPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.cola && typeof data.cola === 'object') {
          this.colaPorProyecto.set(pid, data.cola);
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
  onEncolarRequest(e) {
    return this._atender(e, 'encolar', 'nichos.cola.decisiones.encolar.response', d => this._encolar(d));
  }

  onSiguientesRequest(e) {
    return this._atender(e, 'siguientes', 'nichos.cola.decisiones.siguientes.response', d => this._siguientes(d));
  }

  onCerrarRequest(e) {
    return this._atender(e, 'cerrar', 'nichos.cola.decisiones.cerrar.response', d => this._cerrar(d));
  }

  // ── SCHEDULER HANDLER ──
  onSchedulerTriggered(e) {
    const d = (e && (e.data || e)) || {};
    // Solo reaccionar a jobs propios
    if (d.job_name !== 'nichos.cola-decisiones.barrer') return;
    return this._barrerCaducadas(d);
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto vacio si no hay fichero.
  // =============================================================
  _store(project_id) {
    let s = this.colaPorProyecto.get(project_id);
    if (!s) {
      s = esqueletoVacio();
      this.colaPorProyecto.set(project_id, s);
    }
    return s;
  }

  // =============================================================
  // PROYECCIONES — logica pura
  // =============================================================

  /**
   * _encolar — anade solicitud de decision al store.
   */
  _encolar(input) {
    if (!input.project_id) return this._invalid('project_id');

    const sol = input.solicitud_decision;
    if (!sol || typeof sol !== 'object') return this._invalid('solicitud_decision');
    if (!sol.tipo) return this._invalid('solicitud_decision.tipo');
    if (!Array.isArray(sol.opciones) || sol.opciones.length === 0) {
      return this._invalid('solicitud_decision.opciones');
    }

    const store = this._store(input.project_id);
    const solicitud_id = nuevoId();

    const entrada = {
      id: solicitud_id,
      tipo: sol.tipo,
      contexto: sol.contexto || null,
      opciones: sol.opciones,
      caducidad: sol.caducidad || null,
      estado: ESTADOS.ABIERTA,
      dueno: sol.dueno || null,
      creada_at: nowISO()
    };

    store.solicitudes.push(entrada);
    store.version += 1;

    this._persist.marcarDirty(input.project_id);

    // PULSO
    this.eventBus?.publish('nichos.decision.solicitud.abierta', {
      solicitud_id,
      tipo: entrada.tipo,
      contexto: entrada.contexto,
      opciones: entrada.opciones,
      caducidad: entrada.caducidad,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: {
        encolada: true,
        solicitud_id
      }
    };
  }

  /**
   * _siguientes — lista solicitudes abiertas, opcionalmente filtradas por dueno,
   * ordenadas por caducidad (las mas urgentes primero).
   */
  _siguientes(input) {
    if (!input.project_id) return this._invalid('project_id');

    const store = this._store(input.project_id);
    let abiertas = store.solicitudes.filter(s => s.estado === ESTADOS.ABIERTA);

    // Filtrar por dueno si se indica
    if (input.dueno) {
      abiertas = abiertas.filter(s => s.dueno === input.dueno);
    }

    // Ordenar por caducidad ascendente (las mas urgentes primero, sin caducidad al final)
    abiertas.sort((a, b) => {
      if (!a.caducidad && !b.caducidad) return 0;
      if (!a.caducidad) return 1;
      if (!b.caducidad) return -1;
      return a.caducidad < b.caducidad ? -1 : 1;
    });

    return {
      status: 200,
      data: {
        solicitudes: abiertas
      }
    };
  }

  /**
   * _cerrar — marca solicitud como respondida y persiste la eleccion.
   */
  _cerrar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.solicitud_id) return this._invalid('solicitud_id');
    if (input.respuesta === undefined || input.respuesta === null) {
      return this._invalid('respuesta');
    }

    const store = this._store(input.project_id);
    const sol = store.solicitudes.find(s => s.id === input.solicitud_id);

    if (!sol) {
      return { status: 404, error: { code: 'NOT_FOUND', message: `Solicitud ${input.solicitud_id} no encontrada` } };
    }
    if (sol.estado !== ESTADOS.ABIERTA) {
      return { status: 409, error: { code: 'ALREADY_CLOSED', message: `Solicitud ${input.solicitud_id} ya esta ${sol.estado}` } };
    }

    sol.estado = ESTADOS.RESPONDIDA;
    sol.respuesta = {
      opcion_elegida: input.respuesta,
      dueno: input.dueno || null,
      nota_libre: input.nota_libre || null,
      cerrada_at: nowISO()
    };
    store.version += 1;

    this._persist.marcarDirty(input.project_id);

    // PULSO
    this.eventBus?.publish('nichos.decision.solicitud.respondida', {
      solicitud_id: input.solicitud_id,
      opcion_elegida: input.respuesta,
      dueno: input.dueno || null,
      nota_libre: input.nota_libre || null,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: {
        cerrada: true,
        solicitud_id: input.solicitud_id
      }
    };
  }

  /**
   * _barrerCaducadas — recorre todos los proyectos y emite .caducada
   * para solicitudes abiertas cuya caducidad ha pasado.
   */
  _barrerCaducadas(data) {
    const ahora = data.ahora || nowISO();

    for (const [project_id, store] of this.colaPorProyecto.entries()) {
      let dirty = false;
      for (const sol of store.solicitudes) {
        if (sol.estado !== ESTADOS.ABIERTA) continue;
        if (!sol.caducidad) continue;
        if (sol.caducidad <= ahora) {
          sol.estado = ESTADOS.CADUCADA;
          sol.caducada_at = ahora;
          dirty = true;

          // PULSO
          this.eventBus?.publish('nichos.decision.solicitud.caducada', {
            solicitud_id: sol.id,
            caducidad: sol.caducidad,
            timestamp: nowISO()
          });
        }
      }
      if (dirty) {
        store.version += 1;
        this._persist.marcarDirty(project_id);
      }
    }
  }
}

module.exports = ColaDecisiones;
