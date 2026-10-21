/**
 * contabilidad-entrada/maestro-terceros — CUSTODIO CON PERSISTENCIA (N1, hoja del plan).
 *
 * La FICHA UNICA de cliente/proveedor. UN SOLO maestro con roles (conflicto 1 resuelto):
 * el mismo tercero es cliente Y proveedor sin duplicarse — su ficha guarda los roles
 * declarados. Es la cara de MAESTRO del tercero; la faceta de IDENTIDAD (numero fiscal)
 * vive en `padron-terceros` (N2), cuyo hecho `contabilidad.tercero_unificado` esta ficha
 * ESCUCHA para completar la suya.
 *
 * Invariantes:
 *  - UN escritor por parcela (guard rol MAESTRO_TERCEROS; segundo escritor → 403).
 *  - No se borra: upsert SUMA (los roles se funden; las variantes de nombre se apilan).
 *  - Dato ausente = desconocido: un campo que no llega queda null, no se estima.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja N1 del plan-construccion y diseno-oop.md (CLASE MaestroTerceros).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor del maestro de terceros (comparte rol con padron-terceros N2).
const ROL_ESCRITOR = 'MAESTRO_TERCEROS';

class MaestroTerceros extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'maestro-terceros';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, fichas: Map<nif, Ficha> }
    this._maestros = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'maestro-terceros.json',
      dir: '/contabilidad/maestro-terceros',
      snapshot: (pid) => {
        const m = this._maestros.get(pid);
        if (!m) return null;
        return { project_id: pid, esquema: m.esquema, fichas: [...m.fichas.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const fichas = new Map();
        for (const f of (data.fichas || [])) if (f && f.nif != null) fichas.set(String(f.nif), f);
        this._maestros.set(pid, { esquema: data.esquema || 'contabilidad-maestro-terceros-v1', fichas });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el maestro del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC de lectura (PREGUNTA → sin ui_handler) ──
  onFichaRequest(e) {
    return this._atender(e, 'ficha', 'maestro-terceros.ficha.response', async (d) => {
      const res = this._ficha(d);
      if (res.status !== 200) this.eventBus?.publish('maestro-terceros.ficha.failed', res);
      return res;
    });
  }

  // ── handler RPC de escritura (ORDEN → ui_handler) ──
  onUpsertRequest(e) {
    return this._atender(e, 'upsert', 'maestro-terceros.upsert.response', async (d) => {
      const res = this._upsert(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: el tercero quedo actualizado en el maestro.
        this.eventBus?.publish('contabilidad.tercero_actualizado', {
          project_id: res.data.project_id,
          nif: res.data.tercero.nif,
          tercero: res.data.tercero,
          creada: res.data.creada,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('maestro-terceros.upsert.failed', res);
      }
      return res;
    });
  }

  // ── handler FIRE-AND-FORGET: el padron unifico una identidad (N2) → completa la ficha ──
  // No es un RPC: no publica response. Si la ficha existe (o el padron trae los datos),
  // se completa; y como ESCRIBE, anuncia contabilidad.tercero_actualizado (R2).
  onTerceroUnificado(e) {
    const d = (e && (e.data || e)) || {};
    try {
      const pid = d.project_id || this.project_id;
      if (!pid) return;
      const t = d.tercero && typeof d.tercero === 'object' ? d.tercero : null;
      if (!t || t.nif == null) return;

      const maestro = this._obtenerOCrear(pid);
      const nif = this._normalizaNif(t.nif);
      if (!nif) return;

      const ahora = new Date().toISOString();
      const ficha = maestro.fichas.get(nif) || {
        nif, nombre: null, variantes: [], roles: [], condiciones: null,
        origen: 'padron-terceros', creada_en: ahora, actualizada_en: ahora
      };
      // El padron manda en la IDENTIDAD: se completa sin borrar lo que ya hubiera.
      const variantes = new Set(Array.isArray(ficha.variantes) ? ficha.variantes : []);
      for (const v of (Array.isArray(t.variantes) ? t.variantes : [])) variantes.add(v);
      ficha.variantes = [...variantes];
      if (!ficha.nombre && t.nombre_canonico != null) ficha.nombre = String(t.nombre_canonico);
      const roles = new Set(Array.isArray(ficha.roles) ? ficha.roles : []);
      for (const r of (Array.isArray(t.roles) ? t.roles : [])) roles.add(String(r));
      ficha.roles = [...roles];
      ficha.actualizada_en = ahora;

      maestro.fichas.set(nif, ficha);
      maestro.updated_at = ahora;
      this._persist.marcarDirty(pid);

      // R2 · escribio (completo la ficha) → anuncia el hecho.
      this.eventBus?.publish('contabilidad.tercero_actualizado', {
        project_id: pid,
        nif,
        tercero: ficha,
        creada: false,
        origen: 'padron-terceros',
        correlation_id: d.correlation_id
      });
    } catch (err) {
      this.logger?.error(`${this.name}.tercero_unificado.error`, { error: err.message });
    }
  }

  // ── proyeccion de lectura: la ficha del tercero (por NIF normalizado) ──
  _ficha(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const nif = this._normalizaNif(input.nif ?? input.numero_fiscal ?? (input.tercero && input.tercero.nif));
    if (!nif) return this._invalid('nif');

    const m = this._maestros.get(pid) || null;
    const ficha = m ? (m.fichas.get(nif) || null) : null;
    if (!ficha) {
      return { status: 200, data: { project_id: pid, nif, ficha: null, existe: false } };
    }
    return { status: 200, data: { project_id: pid, nif, ficha, existe: true } };
  }

  // ── proyeccion de escritura (UN escritor) — upsert de la ficha ──
  _upsert(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor del maestro (MAESTRO_TERCEROS) puede actualizar terceros',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const t = input.tercero || input.ficha || input.t;
    if (!t || typeof t !== 'object') return this._invalid('tercero');

    const nif = this._normalizaNif(t.nif ?? t.numero_fiscal);
    if (!nif) return this._invalid('tercero.nif');

    const maestro = this._obtenerOCrear(pid);
    const existente = maestro.fichas.get(nif) || null;
    const ahora = new Date().toISOString();
    const nombre = t.nombre != null ? String(t.nombre).trim() : null;

    if (!existente) {
      const ficha = {
        nif,
        nombre,
        variantes: nombre ? [nombre] : [],
        roles: this._roles(t.roles),
        condiciones: (t.condiciones && typeof t.condiciones === 'object') ? t.condiciones : null,
        origen: t.origen != null ? String(t.origen) : 'maestro-terceros',
        creada_en: ahora,
        actualizada_en: ahora
      };
      maestro.fichas.set(nif, ficha);
      maestro.updated_at = ahora;
      this._persist.marcarDirty(pid);
      return { status: 200, data: { project_id: pid, tercero: ficha, creada: true } };
    }

    // Upsert SUMA (append-only): roles se funden, variantes se apilan, campos solo se completan.
    const variantes = Array.isArray(existente.variantes) ? existente.variantes : [];
    if (nombre && !variantes.includes(nombre)) variantes.push(nombre);
    existente.variantes = variantes;
    if (!existente.nombre && nombre) existente.nombre = nombre;
    const roles = new Set(Array.isArray(existente.roles) ? existente.roles : []);
    for (const r of this._roles(t.roles)) roles.add(r);
    existente.roles = [...roles];
    if (!existente.condiciones && t.condiciones && typeof t.condiciones === 'object') existente.condiciones = t.condiciones;
    existente.actualizada_en = ahora;

    maestro.fichas.set(nif, existente);
    maestro.updated_at = ahora;
    this._persist.marcarDirty(pid);
    return { status: 200, data: { project_id: pid, tercero: existente, creada: false } };
  }

  // Normalizacion MECANICA del numero fiscal (mayusculas, sin separadores). Sin validar leyes.
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
    let m = this._maestros.get(pid);
    if (!m) {
      m = { esquema: 'contabilidad-maestro-terceros-v1', fichas: new Map() };
      this._maestros.set(pid, m);
      this._persist.marcarDirty(pid);
    }
    return m;
  }

  // ── Tools ──
  toolFicha(params) { return this._ficha(params); }
  toolUpsert(params) { return this._upsert(params); }
}

module.exports = MaestroTerceros;
