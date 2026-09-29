/**
 * contabilidad-entrada/padron-terceros — CUSTODIO CON PERSISTENCIA (N2, hoja del plan).
 *
 * Identidad UNICA por numero fiscal: un proveedor escrito de tres formas sigue siendo
 * UNO. Es la faceta de IDENTIDAD del mismo maestro (N1 maestro-terceros): UN solo
 * maestro con roles. UN SOLO ESCRITOR — el escritor del maestro; cualquier otro rol
 * es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - UN escritor por parcela; el segundo es rechazado.
 *  - No se borra: unificar SUMA. Las formas escritas se apilan como `variantes`
 *    (append-only); la identidad canonica solo se completa, nunca se pierde historia.
 *  - Dato ausente = desconocido: un campo que no llega queda `null`, no se estima.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja N2 del plan-construccion y diseno-oop.md (CLASE PadronTerceros).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la identidad del maestro de terceros (N1-N2).
const ROL_ESCRITOR = 'MAESTRO_TERCEROS';

class PadronTerceros extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'padron-terceros';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, identidades: Map<nif, Tercero> }
    this._padrones = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'padron-terceros.json',
      dir: '/contabilidad/padron-terceros',
      snapshot: (pid) => {
        const p = this._padrones.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, identidades: [...p.identidades.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const identidades = new Map();
        for (const t of (data.identidades || [])) if (t && t.nif != null) identidades.set(String(t.nif), t);
        this._padrones.set(pid, { esquema: data.esquema || 'contabilidad-padron-terceros-v1', identidades });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el padron del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una linea, delega a _atender) ──
  onUnificarRequest(e) {
    return this._atender(e, 'unificar', 'padron-terceros.unificar.response', async (d) => {
      const res = this._unificar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.identidad_unificada', {
          project_id: res.data.project_id,
          tercero: res.data.tercero,
          creada: res.data.creada,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('padron-terceros.unificar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor) — unifica por numero fiscal ──
  _unificar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: la identidad la fija solo el escritor del maestro.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor del maestro (MAESTRO_TERCEROS) puede unificar identidades',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const t = input.tercero || input.t;
    if (!t || typeof t !== 'object') return this._invalid('tercero');

    const nif = this._normalizaNif(t.nif ?? t.numero_fiscal);
    if (!nif) return this._invalid('tercero.nif');

    const padron = this._obtenerOCrear(pid);
    const existente = padron.identidades.get(nif);
    const nombre_escrito = t.nombre != null ? String(t.nombre).trim() : null;

    if (!existente) {
      // Identidad nueva: se crea con su primera forma escrita.
      const tercero = {
        nif,
        nombre_canonico: nombre_escrito,
        variantes: nombre_escrito ? [nombre_escrito] : [],
        roles: this._roles(t.roles),
        condiciones: null,                       // desconocido — no se estima
        creada_en: new Date().toISOString(),
        actualizada_en: new Date().toISOString()
      };
      padron.identidades.set(nif, tercero);
      padron.updated_at = tercero.actualizada_en;
      this._persist.marcarDirty(pid);
      return { status: 200, data: { project_id: pid, tercero, creada: true } };
    }

    // Ya existe: unificar SUMA (append-only). La forma escrita se apila como variante
    // si es nueva; la canonica solo se completa si estaba desconocida. Nada se borra.
    const variantes = Array.isArray(existente.variantes) ? existente.variantes : [];
    if (nombre_escrito && !variantes.includes(nombre_escrito)) variantes.push(nombre_escrito);
    existente.variantes = variantes;
    if (!existente.nombre_canonico && nombre_escrito) existente.nombre_canonico = nombre_escrito;

    const roles_nuevos = this._roles(t.roles);
    const roles = new Set(Array.isArray(existente.roles) ? existente.roles : []);
    for (const r of roles_nuevos) roles.add(r);
    existente.roles = [...roles];
    existente.actualizada_en = new Date().toISOString();

    padron.identidades.set(nif, existente);
    padron.updated_at = existente.actualizada_en;
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, tercero: existente, creada: false } };
  }

  // Normalizacion MECANICA del numero fiscal (mayusculas, sin separadores).
  // No valida contra ninguna ley (eso seria una constante legal cableada): solo unifica
  // las escrituras superficialmente distintas de un mismo numero.
  _normalizaNif(raw) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).toUpperCase().replace(/[\s.\-_/]/g, '');
    return s.length ? s : null;
  }

  _roles(raw) {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map(r => String(r)).filter(Boolean);
  }

  _obtenerOCrear(pid) {
    let p = this._padrones.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-padron-terceros-v1', identidades: new Map() };
      this._padrones.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Lectura directa de la identidad unificada (no muta).
  identidadDe(pid, nif) {
    const p = pid ? this._padrones.get(pid) : null;
    const n = this._normalizaNif(nif);
    return (p && n) ? (p.identidades.get(n) || null) : null;
  }

  // ── Tools ──
  toolUnificar(params) { return this._unificar(params); }
}

module.exports = PadronTerceros;
