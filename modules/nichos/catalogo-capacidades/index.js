/**
 * nichos/catalogo-capacidades — REFLEJO JS (CUSTODIO del vertical NICHOS, bloque D).
 *
 * Materializa la invariante F3 'si no existe, se crea': cada falta de capacidad
 * se encola como ENCARGO; cuando se cubre, pasa a DISPONIBLE. Nada se asume.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/catalogo-capacidades.json
 *   {
 *     _version, _updated,
 *     catalogo: {
 *       version:     Int,
 *       disponibles: [{ id, descripcion, cableada_por, cableada_en, meta? }],
 *       encargos:    [{ id, descripcion, encargada_por, encargada_en, estado:'PENDIENTE', meta? }],
 *       por_autor:   [{ version, autor, op:'ENCARGAR'|'PROMOVER', capacidad_id, at }]
 *     }
 *   }
 *
 * REGLA F3 (adaptada al D3 del diseño): autores autorizados:
 *   'ensamblador' — D1 ensamblador-solucion (el flujo normal).
 *   'dueño'       — el dueño por el canal (registra manualmente).
 *   'constructor' — un operador que cableó una capacidad fuera del flujo.
 * Cualquier otro autor → 403 ESCRITOR_NO_AUTORIZADO.
 *
 * Factory: toda falta nace como EncargoCapacidad; promover() es la única puerta
 * por la que un encargo se convierte en disponible. El id de la capacidad es su
 * identidad: encargar() es IDEMPOTENTE por id — repetir no duplica.
 *
 * Patrón: ModuloHibridoReflejo (REFLEJO puro). Sin mitad blueprint — la lógica
 * es CRUD + aritmética de versión + guard de legalidad del estado del encargo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();
const AUTORES_AUTORIZADOS = ['ensamblador', 'dueño', 'constructor'];

function esqueletoVacio() {
  return {
    version: 0,
    disponibles: [],
    encargos: [],
    por_autor: []
  };
}

class CatalogoCapacidades extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'catalogo-capacidades';
    this.version = '0.1.0';
    this.catalogoPorProyecto = new Map();   // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'catalogo-capacidades.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ catalogo: this.catalogoPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.catalogo && typeof data.catalogo === 'object') {
          this.catalogoPorProyecto.set(pid, data.catalogo);
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
  onDisponiblesRequest(e) {
    return this._atender(e, 'disponibles', 'nichos.catalogo.capacidad.disponibles.response', d => this._disponibles(d));
  }

  onEncargarRequest(e) {
    return this._atender(e, 'encargar', 'nichos.catalogo.capacidad.encargar.response', d => this._encargar(d));
  }

  onPromoverRequest(e) {
    return this._atender(e, 'promover', 'nichos.catalogo.capacidad.promover.response', d => this._promover(d));
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto vacío si no hay fichero.
  // =============================================================
  _catalogo(project_id) {
    let c = this.catalogoPorProyecto.get(project_id);
    if (!c) {
      c = esqueletoVacio();
      this.catalogoPorProyecto.set(project_id, c);
    }
    return c;
  }

  // =============================================================
  // PROYECCIONES — lógica de dominio pura
  // =============================================================
  _disponibles(input) {
    if (!input.project_id) return this._invalid('project_id');
    const catalogo = this._catalogo(input.project_id);
    return {
      status: 200,
      data: {
        capacidades: catalogo.disponibles.slice()
      }
    };
  }

  _encargar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.por_autor) return this._invalid('por_autor');
    if (!input.capacidad || typeof input.capacidad !== 'object') return this._invalid('capacidad');
    if (!input.capacidad.id) return this._invalid('capacidad.id');
    if (!input.capacidad.descripcion) return this._invalid('capacidad.descripcion');

    // Guard F3: autores autorizados.
    if (!AUTORES_AUTORIZADOS.includes(input.por_autor)) {
      return this._errorResponse(
        403,
        'PERMISSION_DENIED',
        'escritor_no_autorizado — solo el ensamblador, el dueño o el constructor escriben el catálogo de capacidades',
        { por_autor: input.por_autor, autores_autorizados: AUTORES_AUTORIZADOS }
      );
    }

    const catalogo = this._catalogo(input.project_id);
    const id = input.capacidad.id;

    // Idempotencia: si ya está DISPONIBLE, devuelve la vigente sin tocar.
    const yaDisponible = catalogo.disponibles.find(c => c.id === id);
    if (yaDisponible) {
      return {
        status: 200,
        data: {
          encargo: {
            id,
            descripcion: yaDisponible.descripcion,
            encargada_por: input.por_autor,
            encargada_en: nowISO(),
            estado: 'YA_DISPONIBLE'
          }
        }
      };
    }

    // Idempotencia: si ya hay un encargo pendiente, devuelve el vigente.
    const yaEncargada = catalogo.encargos.find(c => c.id === id);
    if (yaEncargada) {
      return {
        status: 200,
        data: {
          encargo: yaEncargada
        }
      };
    }

    // Factory: nace el encargo.
    const encargo = {
      id,
      descripcion: input.capacidad.descripcion,
      encargada_por: input.por_autor,
      encargada_en: nowISO(),
      estado: 'PENDIENTE',
      meta: (input.capacidad.meta && typeof input.capacidad.meta === 'object') ? input.capacidad.meta : null
    };
    catalogo.version += 1;
    catalogo.encargos.push(encargo);
    catalogo.por_autor.push({
      version: catalogo.version,
      autor: input.por_autor,
      op: 'ENCARGAR',
      capacidad_id: id,
      at: nowISO()
    });

    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.catalogo.capacidad.encargada', {
      project_id: input.project_id,
      capacidad_id: id,
      descripcion: encargo.descripcion,
      encargada_por: input.por_autor,
      timestamp: nowISO()
    });

    return { status: 200, data: { encargo } };
  }

  _promover(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.por_autor) return this._invalid('por_autor');
    if (!input.capacidad || typeof input.capacidad !== 'object') return this._invalid('capacidad');
    if (!input.capacidad.id) return this._invalid('capacidad.id');

    // Guard F3: autores autorizados.
    if (!AUTORES_AUTORIZADOS.includes(input.por_autor)) {
      return this._errorResponse(
        403,
        'PERMISSION_DENIED',
        'escritor_no_autorizado — solo el ensamblador, el dueño o el constructor escriben el catálogo de capacidades',
        { por_autor: input.por_autor, autores_autorizados: AUTORES_AUTORIZADOS }
      );
    }

    const catalogo = this._catalogo(input.project_id);
    const id = input.capacidad.id;

    // Idempotencia: si ya está disponible, devuelve el estado vigente sin tocar.
    const yaDisponible = catalogo.disponibles.find(c => c.id === id);
    if (yaDisponible) {
      return {
        status: 200,
        data: {
          estado_catalogo: {
            version: catalogo.version,
            disponibles: catalogo.disponibles.slice(),
            encargos: catalogo.encargos.slice(),
            ya_disponible: true
          }
        }
      };
    }

    // Guard de legalidad: solo se promueve lo que estaba ENCARGADO.
    const idxEncargo = catalogo.encargos.findIndex(c => c.id === id);
    if (idxEncargo < 0) {
      return this._errorResponse(
        404,
        'CAPACIDAD_NO_ENCARGADA',
        'no hay encargo pendiente para esta capacidad; encargar primero',
        { capacidad_id: id }
      );
    }

    const encargo = catalogo.encargos[idxEncargo];
    const disponible = {
      id: encargo.id,
      descripcion: (input.capacidad.descripcion || encargo.descripcion),
      cableada_por: input.por_autor,
      cableada_en: nowISO(),
      meta: (input.capacidad.meta && typeof input.capacidad.meta === 'object') ? input.capacidad.meta : encargo.meta
    };
    catalogo.encargos.splice(idxEncargo, 1);
    catalogo.disponibles.push(disponible);
    catalogo.version += 1;
    catalogo.por_autor.push({
      version: catalogo.version,
      autor: input.por_autor,
      op: 'PROMOVER',
      capacidad_id: id,
      at: nowISO()
    });

    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.catalogo.capacidad.disponible', {
      project_id: input.project_id,
      capacidad_id: id,
      descripcion: disponible.descripcion,
      promovida_por: input.por_autor,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: {
        estado_catalogo: {
          version: catalogo.version,
          disponibles: catalogo.disponibles.slice(),
          encargos: catalogo.encargos.slice()
        }
      }
    };
  }
}

module.exports = CatalogoCapacidades;
