/**
 * contabilidad/maestro-terceros — CUSTODIO (N1+N2 fusionados, hoja del plan).
 *
 * MAESTRO UNICO del tercero con ROLES (conflicto 1 resuelto): la ficha
 * funcional (N1) + la identidad por NIF (N2) viven en la MISMA parcela. Un
 * mismo tercero cliente y proveedor NO se duplica: es un maestro con dos
 * facetas. "Un proveedor escrito de tres formas = uno" (identidad por numero
 * fiscal). Un solo escritor del store: DUENO/ASESOR para la ficha; la identidad
 * se unifica por SISTEMA (identificar/unificar) — dos escritores sobre la
 * identidad = terceros contradictorios = prohibido.
 *
 * CUSTODIO (patron real): store en memoria (terceros por id + indice NIF);
 * PosPersistencia (storage /contabilidad/maestro-terceros/*.json); restaura en
 * project.activated; flush en onUnload. Guard de escritor. Emisor/par de fallo.
 * NO REUTILIZA: no existe maestro fiscal de terceros en el inventario.
 *
 * Ver hojas N1/N2 del diseno-oop y bloque `maestro-terceros` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Roles con permiso de ESCRITURA sobre la ficha del tercero.
const ROLES_FICHA = new Set(['DUENO', 'ASESOR']);
// Rol que gobierna la IDENTIDAD (índice por NIF) — unificación del sistema.
const ROL_SISTEMA = 'SISTEMA';

// Roles validos de un tercero (cliente, proveedor, empleado... — declarable).
const ROLES_TERCERO_DEFECTO = ['CLIENTE', 'PROVEEDOR', 'EMPLEADO', 'ACREEDOR', 'SOCIO'];

class MaestroTerceros extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'maestro-terceros';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, terceros: {}, porNIF: {}, historial: {} }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'maestro-terceros.json',
      dir: '/contabilidad/maestro-terceros',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.terceros) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el maestro de terceros del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.tercero.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.tercero_declarado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.tercero.declarar.failed', res);
      }
      return res;
    });
  }

  onFichaRequest(e) {
    return this._atender(e, 'ficha', 'contabilidad.tercero.ficha.response', async (d) => {
      const res = this._ficha(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.tercero.ficha.failed', res);
      return res;
    });
  }

  onIdentificarRequest(e) {
    return this._atender(e, 'identificar', 'contabilidad.tercero.identificar.response', async (d) => {
      const res = this._identificar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.tercero_identificado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.tercero.identificar.failed', res);
      }
      return res;
    });
  }

  onHistorialRequest(e) {
    return this._atender(e, 'historial', 'contabilidad.tercero.historial.response', async (d) => {
      const res = this._historial(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.tercero.historial.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-maestro-terceros-v1', terceros: {}, porNIF: {}, historial: {} };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  _normNIF(nif) {
    return String(nif || '').replace(/[\s-]/g, '').toUpperCase();
  }

  // declarar(rol, tercero) — un solo escritor (DUENO/ASESOR). NO duplica por NIF.
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (!ROLES_FICHA.has(rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo DUENO/ASESOR declara terceros', {
        roles_esperados: [...ROLES_FICHA], rol_recibido: rol
      });
    }

    const t = input && input.tercero;
    if (!t || typeof t !== 'object') return this._invalid('tercero');
    if (!t.nombreFiscal) return this._invalid('tercero.nombreFiscal');

    const d = this._obtenerOCrear(pid);
    const nif = this._normNIF(t.nif);
    // Identidad: si el NIF ya existe, se REUSA el tercero (no se duplica).
    let id = nif ? d.porNIF[nif] : null;
    const roles = Array.isArray(t.roles) && t.roles.length ? t.roles.map((r) => String(r).toUpperCase()) : [];

    if (id && d.terceros[id]) {
      // anadirRol implicito: cliente+proveedor NO duplica al tercero.
      for (const r of roles) if (!d.terceros[id].roles.includes(r)) d.terceros[id].roles.push(r);
      d.terceros[id].updated_at = new Date().toISOString();
      this._persist.marcarDirty(pid);
      return { status: 200, data: { project_id: pid, tercero: d.terceros[id], reusado: true } };
    }

    id = t.id || `${pid}-t${Object.keys(d.terceros).length + 1}`;
    d.terceros[id] = {
      id,
      nif: nif || null,
      nombreFiscal: String(t.nombreFiscal),
      nombreComercial: t.nombreComercial || null,
      roles: roles.length ? roles : ['CLIENTE'],
      condiciones: t.condiciones || {},
      roles_disponibles: ROLES_TERCERO_DEFECTO,
      declarado_por: rol,
      created_at: new Date().toISOString()
    };
    if (nif) d.porNIF[nif] = id;
    if (!d.historial[id]) d.historial[id] = [];
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, tercero: d.terceros[id], reusado: false } };
  }

  // ficha(idTercero) -> Tercero (no muta).
  _ficha(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const id = input && input.id_tercero;
    if (!id) return this._invalid('id_tercero');
    const d = this._obtenerOCrear(pid);
    const t = d.terceros[id];
    if (!t) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `tercero ${id} no hallado`, { id_tercero: id });
    return { status: 200, data: { project_id: pid, tercero: t } };
  }

  // historial(idTercero) -> List<IdAsiento|IdDocumento> (no muta).
  _historial(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const id = input && input.id_tercero;
    if (!id) return this._invalid('id_tercero');
    const d = this._obtenerOCrear(pid);
    if (!d.terceros[id]) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `tercero ${id} no hallado`, { id_tercero: id });
    return { status: 200, data: { project_id: pid, id_tercero: id, historial: d.historial[id] || [] } };
  }

  // anadirRol(idTercero, rol) — cliente+proveedor NO duplica al tercero.
  _anadirRol(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const id = input && input.id_tercero;
    if (!id) return this._invalid('id_tercero');
    const rol = String((input && input.rol_tercero) || (input && input.rol) || '').toUpperCase();
    if (!rol) return this._invalid('rol');

    const d = this._obtenerOCrear(pid);
    const t = d.terceros[id];
    if (!t) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `tercero ${id} no hallado`, { id_tercero: id });
    if (!t.roles.includes(rol)) t.roles.push(rol);
    t.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);
    return { status: 200, data: { project_id: pid, tercero: t, rol_anadido: rol } };
  }

  // identificar(nif, nombreFiscal) -> IdTercero (N2, faceta de identidad).
  _identificar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || ROL_SISTEMA).toUpperCase();
    if (rol !== ROL_SISTEMA && !ROLES_FICHA.has(rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'la identidad la gobierna SISTEMA/DUENO/ASESOR', {
        rol_recibido: rol
      });
    }

    const nif = this._normNIF(input && input.nif);
    if (!nif) return this._invalid('nif');

    const d = this._obtenerOCrear(pid);
    const idExistente = d.porNIF[nif];
    if (idExistente) {
      return { status: 200, data: { project_id: pid, id_tercero: idExistente, hallado: true, nif } };
    }
    // No existe: se identifica con un id nuevo (aun sin ficha) — "tres formas = uno".
    const id = `${pid}-t${Object.keys(d.terceros).length + 1}`;
    d.terceros[id] = {
      id,
      nif,
      nombreFiscal: input.nombreFiscal ? String(input.nombreFiscal) : null,
      nombreComercial: null,
      roles: [],
      condiciones: {},
      identificado_por: rol,
      created_at: new Date().toISOString()
    };
    d.porNIF[nif] = id;
    d.historial[id] = [];
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, id_tercero: id, hallado: false, nif } };
  }

  // unificar(idA, idB, evidencia) -> IdTercero — "un proveedor escrito de tres formas = uno".
  _unificar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const rol = String((input && input.rol) || ROL_SISTEMA).toUpperCase();
    if (rol !== ROL_SISTEMA && !ROLES_FICHA.has(rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'la unificacion la gobierna SISTEMA', { rol_recibido: rol });
    }
    const idA = input && input.id_a;
    const idB = input && input.id_b;
    if (!idA || !idB) return this._invalid('id_a/id_b');
    if (idA === idB) return this._invalid('id_a/id_b');

    const d = this._obtenerOCrear(pid);
    const a = d.terceros[idA];
    const b = d.terceros[idB];
    if (!a || !b) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'uno de los terceros a unificar no existe', { id_a: idA, id_b: idB });
    }
    // Se conserva A como superviviente; B se absorbe (roles + historial).
    for (const r of b.roles) if (!a.roles.includes(r)) a.roles.push(r);
    if (!a.nif && b.nif) { a.nif = b.nif; d.porNIF[b.nif] = idA; }
    d.historial[idA] = (d.historial[idA] || []).concat(d.historial[idB] || []);
    a.unificado_con = (a.unificado_con || []).concat([idB]);
    a.evidencia_unificacion = input.evidencia || null;
    a.updated_at = new Date().toISOString();
    delete d.terceros[idB];
    delete d.historial[idB];
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, id_tercero: idA, absorbido: idB, tercero: a } };
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolFicha(params) { return this._ficha(params); }
  toolIdentificar(params) { return this._identificar(params); }
  toolHistorial(params) { return this._historial(params); }
  toolUnificar(params) { return this._unificar(params); }
}

module.exports = MaestroTerceros;
