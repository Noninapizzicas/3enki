/**
 * nichos/cola-decisiones-gate — CUSTODIO CON PERSISTENCIA (K2, hoja del plan).
 *
 * UNA sola COLA de GATES por resolver en el proyecto. Encola las SOLICITUDES de
 * decision que el sistema no puede resolver solo:
 *   - gate de operar (E2, gate-decision-operar)
 *   - puente humano (D2, puente-humano)
 *   - alerta de sangria (F4, alerta-sangria)
 * y el JEFE resuelve la siguiente en orden FIFO (_resolverSiguiente). Es la
 * pieza que concentra las decisiones humanas del sistema en una ventanilla
 * unica para el dueño.
 *
 * CUSTODIO (patrón real de cola-candidatos L2): single-writer de la cola — se
 * auto-encola via evento o por RPC, y solo el jefe (rol DUEÑO) desencola y
 * resuelve. Proyecciones _encolar, _resolverSiguiente, _listar.
 * Persiste por proyecto (storage /prisma/nichos/cola-decisiones-gate.json),
 * restaura en project.activated y vuelca en onUnload.
 *
 * Ver hoja K2 del plan-construccion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol autorizado a resolver decisiones — el DUEÑO.
const ROL_DUENYO = 'DUEÑO';
// Resoluciones validas.
const RESOLUCIONES = new Set(['APRUEBA', 'RECHAZA', 'EXPIRA']);

// Shape base de la cola por proyecto.
function colaVacia() {
  return {
    esquema: 'nichos-cola-decisiones-gate-v1',
    solicitudes: [],    // [{ id, tipo, nicho, descripcion, solicitado_en }] — FIFO
    updated_at: null
  };
}

class ColaDecisionesGate extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cola-decisiones-gate';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> cola
    this._colas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cola-decisiones-gate.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const c = this._colas.get(pid);
        return c ? { project_id: pid, cola: c } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.cola) this._colas.set(pid, data.cola);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la cola del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender / fire-and-forget) ──
  onEncolarRequest(e) {
    return this._atender(e, 'encolar', 'nichos.gate.encolar.response', async (d) => {
      const res = this._encolar(d);
      // Emisor/par de fallo: exito → encolado; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.gate_encolado', res.data);
      } else {
        this.eventBus?.publish('nichos.gate.encolar.failed', res);
      }
      return res;
    });
  }

  onResolverRequest(e) {
    return this._atender(e, 'resolver', 'nichos.gate.resolver.response', async (d) => {
      const res = this._resolverSiguiente(d);
      // Emisor/par de fallo: exito → resuelto + decision; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.gate_resuelto', res.data);
        this.eventBus?.publish('nichos.decision.resuelta', {
          project_id: res.data.project_id,
          decision: res.data.solicitud,
          resolucion: res.data.resolucion
        });
      } else {
        this.eventBus?.publish('nichos.gate.encolar.failed', res);
      }
      return res;
    });
  }

  onListarRequest(e) {
    return this._atender(e, 'listar', 'nichos.gate.listar.response', (d) => this._listar(d));
  }

  // Fire-and-forget: gate/puente/alerta publican solicitud → se auto-encola.
  onSolicitudRecibida(e) {
    const d = (e && e.data) || e || {};
    if (!d.project_id) return null;
    const res = this._encolar({
      project_id: d.project_id,
      solicitud: {
        tipo: d.tipo || this._inferirTipo(d, e),
        nicho: d.nicho,
        descripcion: d.descripcion || d.mensaje || null
      }
    });
    if (res.status === 200) {
      this.eventBus?.publish('nichos.gate_encolado', res.data);
    } else {
      this.eventBus?.publish('nichos.gate.encolar.failed', res);
    }
    return res;
  }

  // Infiere el tipo de solicitud de la envoltura del evento recibido.
  _inferirTipo(d, e) {
    const evt = (e && e.event) || (d && d.event) || '';
    if (evt.includes('puente')) return 'PUENTE_HUMANO';
    if (evt.includes('alerta')) return 'ALERTA_SANGRIA';
    if (evt.includes('gate')) return 'GATE_OPERAR';
    return d.tipo || 'GATE_OPERAR';
  }

  // ── proyección de lectura (no muta) ──
  _obtenerOCrear(pid) {
    let c = this._colas.get(pid);
    if (!c) {
      c = colaVacia();
      this._colas.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  _listar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const c = this._obtenerOCrear(pid);
    return { status: 200, data: { project_id: pid, solicitudes: c.solicitudes, numero_en_cola: c.solicitudes.length } };
  }

  // ── proyección de escritura: encola una solicitud de decision ──
  _encolar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    let solicitud = input.solicitud;
    if (!solicitud || typeof solicitud !== 'object') {
      // Acepta una solicitud plana (tipo/nicho/descripcion sin envoltura).
      if (input.tipo || input.nicho || input.descripcion) {
        solicitud = { tipo: input.tipo, nicho: input.nicho, descripcion: input.descripcion };
      } else {
        return this._invalid('solicitud');
      }
    }
    if (!solicitud.nicho) return this._invalid('solicitud.nicho');

    const c = this._obtenerOCrear(pid);
    const item = {
      id: solicitud.id || `${pid}-${Date.now()}-${c.solicitudes.length + 1}`,
      tipo: solicitud.tipo || 'GATE_OPERAR',
      nicho: solicitud.nicho,
      descripcion: solicitud.descripcion || null,
      solicitado_en: new Date().toISOString()
    };
    c.solicitudes.push(item);
    c.updated_at = new Date().toISOString();
    this._colas.set(pid, c);
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, solicitud: item, posicion: c.solicitudes.length, encolado: true } };
  }

  // ── proyección de escritura: desencola la siguiente en orden y la resuelve ──
  _resolverSiguiente(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    // GUARD de rol: solo el DUEÑO resuelve decisiones.
    if (input.rol !== ROL_DUENYO) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUEÑO puede resolver las decisiones en cola', {
        rol_esperado: ROL_DUENYO, rol_recibido: input.rol
      });
    }
    const resolucion = String(input.resolucion || '').toUpperCase();
    if (!RESOLUCIONES.has(resolucion)) return this._invalid('resolucion');

    const c = this._obtenerOCrear(pid);
    if (!c.solicitudes.length) {
      return this._errorResponse(404, 'COLA_VACIA', 'no quedan solicitudes de decision por resolver', { project_id: pid });
    }
    const solicitud = c.solicitudes.shift(); // FIFO: la mas antigua primero
    c.updated_at = new Date().toISOString();
    this._colas.set(pid, c);
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, solicitud, resolucion, restantes: c.solicitudes.length, resuelto: true }
    };
  }

  // ── Tools ──
  toolEncolar(params) { return this._encolar(params); }
  toolResolverSiguiente(params) { return this._resolverSiguiente(params); }
  toolListar(params) { return this._listar(params); }
}

module.exports = ColaDecisionesGate;
