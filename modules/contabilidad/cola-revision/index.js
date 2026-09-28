/**
 * contabilidad/cola-revision — CUSTODIO (A8.1, hoja del plan).
 *
 * DOS colas de excepciones por NATURALEZA (decision tomada): cola ASESOR
 * (excepciones contables) y cola DUENO (excepciones del negocio). El flujo
 * NUNCA se bloquea: lo dudoso espera en su cola, la operacion continua. Un solo
 * escritor de cada cola: el encolado entra por ADMISION (una sola puerta) y la
 * resolucion la firma el ROL dueno de esa cola.
 *
 * CUSTODIO (patron real): store en memoria con dos colas por proyecto;
 * PosPersistencia (storage /contabilidad/cola-revision/*.json); restaura en
 * project.activated; flush en onUnload. Guard de escritor POR COLA en _resolver.
 * Emisor/par de fallo. No existe cola de revision contable en el inventario;
 * `manejo-fallo` (nichos) es fallo de CANAL, otro dominio (patron tomado).
 *
 * Ver hoja A8.1 del diseno-oop y bloque `cola-revision` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Las DOS colas por naturaleza.
const COLAS = new Set(['ASESOR', 'DUENO']);

// Rol unico escritor del ENCOLADO (la admision mete; nadie mas).
const ROL_ADMISION = 'ADMISION';

// Naturalezas de excepcion → cola. Lo no declarado va al ASESOR (contable).
const RUTA_NATURALEZA = {
  CONTABLE: 'ASESOR',
  DOCUMENTO_DESCUADRADO: 'ASESOR',
  SIN_COBERTURA: 'ASESOR',
  NEGOCIO: 'DUENO',
  DECISION_DUENO: 'DUENO',
  FUENTE_FALTANTE: 'DUENO'
};

class ColaRevision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cola-revision';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, colas: { ASESOR:[], DUENO:[] }, resueltas:[] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cola-revision.json',
      dir: '/contabilidad/cola-revision',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.colas) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las dos colas del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onEncolarRequest(e) {
    return this._atender(e, 'encolar', 'contabilidad.excepcion.encolar.response', async (d) => {
      const res = this._encolar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.excepcion_encolada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.excepcion.encolar.failed', res);
      }
      return res;
    });
  }

  onResolverRequest(e) {
    return this._atender(e, 'resolver', 'contabilidad.excepcion.resolver.response', async (d) => {
      const res = this._resolver(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.excepcion_resuelta', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.excepcion.resolver.failed', res);
      }
      return res;
    });
  }

  onSiguienteRequest(e) {
    return this._atender(e, 'siguiente', 'contabilidad.excepcion.siguiente.response', async (d) => {
      const res = this._siguiente(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.excepcion.siguiente.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-cola-revision-v1', colas: { ASESOR: [], DUENO: [] }, resueltas: [] };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // ROUTING por NATURALEZA de la excepcion -> cola ASESOR | cola DUENO.
  _colaDe(excepcion) {
    const nat = String((excepcion && excepcion.naturaleza) || '').toUpperCase();
    if (COLAS.has(nat)) return nat;
    return RUTA_NATURALEZA[nat] || 'ASESOR';
  }

  // encolar(excepcion) — un solo escritor (ADMISION).
  _encolar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (rol !== ROL_ADMISION) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo ADMISION encola excepciones', {
        rol_esperado: ROL_ADMISION, rol_recibido: rol
      });
    }

    const excepcion = input && input.excepcion;
    if (!excepcion || typeof excepcion !== 'object') return this._invalid('excepcion');

    const cola = this._colaDe(excepcion);
    const d = this._obtenerOCrear(pid);
    const entrada = {
      id: excepcion.id || `${pid}-${cola}-x${d.colas[cola].length + 1}`,
      naturaleza: excepcion.naturaleza || null,
      motivo: excepcion.motivo || null,
      hecho: excepcion.hecho || null,
      estado: 'PENDIENTE',
      encolada_en: new Date().toISOString()
    };
    d.colas[cola].push(entrada);
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, cola, excepcion: entrada } };
  }

  // siguiente(cola) -> Excepcion | VACIA (no muta; solo mira la cabeza).
  _siguiente(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const cola = String((input && input.cola) || '').toUpperCase();
    if (!COLAS.has(cola)) return this._invalid('cola');

    const d = this._obtenerOCrear(pid);
    const pendientes = d.colas[cola].filter((x) => x.estado === 'PENDIENTE');
    if (pendientes.length === 0) {
      return { status: 200, data: { project_id: pid, cola, vacia: true, excepcion: null } };
    }
    return { status: 200, data: { project_id: pid, cola, vacia: false, excepcion: pendientes[0] } };
  }

  // resolver(rol, excepcion, resolucion) — guard de escritor POR COLA.
  _resolver(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const cola = String((input && input.cola) || '').toUpperCase();
    if (!COLAS.has(cola)) return this._invalid('cola');

    const rol = String((input && input.rol) || '').toUpperCase();
    // Guard por cola: la cola ASESOR la resuelve el ASESOR; la DUENO, el DUENO.
    if (rol !== cola) {
      return this._errorResponse(403, 'PERMISSION_DENIED', `la cola ${cola} solo la resuelve ${cola}`, {
        cola, rol_esperado: cola, rol_recibido: rol
      });
    }

    const id = input && input.excepcion_id;
    if (!id) return this._invalid('excepcion_id');
    const resolucion = input && input.resolucion;
    if (!resolucion || typeof resolucion !== 'object') return this._invalid('resolucion');

    const d = this._obtenerOCrear(pid);
    const entrada = d.colas[cola].find((x) => x.id === id && x.estado === 'PENDIENTE');
    if (!entrada) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `excepcion ${id} no pendiente en la cola ${cola}`, { cola, excepcion_id: id });
    }
    entrada.estado = 'RESUELTA';
    entrada.resolucion = resolucion;
    entrada.resuelta_por = rol;
    entrada.resuelta_en = new Date().toISOString();
    d.resueltas.push({ id, cola, resolucion, resuelta_por: rol });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, cola, excepcion_id: id, excepcion: entrada, resuelta_por: rol } };
  }

  // ── Tools ──
  toolEncolar(params) { return this._encolar(params); }
  toolResolver(params) { return this._resolver(params); }
  toolSiguiente(params) { return this._siguiente(params); }
}

module.exports = ColaRevision;
