/**
 * contabilidad-entrada/maestro-terceros — CUSTODIO CON PERSISTENCIA (N1, hoja del plan).
 *
 * EL MAESTRO UNICO de terceros. Decision del dueno (conflicto 1 resuelto): UN TERCERO,
 * UN REGISTRO — la cuenta 430 (cliente) y la 400 (proveedor) cuelgan del MISMO tercero;
 * un tercero que es cliente Y proveedor sigue siendo UNO, con `roles` acumulados. NO hay
 * dos maestros: `padron-terceros` (N2) es la faceta de IDENTIDAD por numero fiscal de
 * este mismo maestro, no otro maestro.
 *
 * Parcela del maestro: UN SOLO ESCRITOR — el escritor del maestro (MAESTRO_TERCEROS);
 * cualquier otro rol es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - Un tercero, un registro: la ficha se completa y SUMA roles; nunca se parte en dos.
 *  - No se borra: `historial` es append-only; las condiciones solo se completan.
 *  - Dato ausente = desconocido: un campo que no llega queda `null`, no se estima.
 *  - La clave es MECANICA (numero fiscal normalizado en mayusculas/sin separadores);
 *    no valida contra ninguna ley cableada ni cablea codigos de cuenta.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja N1 del plan-construccion y diseno-oop.md (CLASE MaestroTerceros).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela del maestro (N1).
const ROL_ESCRITOR = 'MAESTRO_TERCEROS';

class MaestroTerceros extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'maestro-terceros';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, terceros: Map<clave, Tercero> }
    this._maestros = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'maestro-terceros.json',
      dir: '/contabilidad/maestro-terceros',
      snapshot: (pid) => {
        const m = this._maestros.get(pid);
        if (!m) return null;
        return { project_id: pid, esquema: m.esquema, terceros: [...m.terceros.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const terceros = new Map();
        for (const t of (data.terceros || [])) if (t && t.clave != null) terceros.set(String(t.clave), t);
        this._maestros.set(pid, { esquema: data.esquema || 'contabilidad-maestro-terceros-v1', terceros });
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

  // ── handlers RPC (una linea, delegan a _atender) ──
  onFichaRequest(e) {
    return this._atender(e, 'ficha', 'maestro-terceros.ficha.response', d => this._ficha(d));
  }

  onUpsertRequest(e) {
    return this._atender(e, 'upsert', 'maestro-terceros.upsert.response', async (d) => {
      const res = this._upsert(d);
      if (res.status === 200) {
        // Exito → evento de dominio: un tercero quedo actualizado (ficha unica con roles).
        this.eventBus?.publish('contabilidad.tercero_actualizado', {
          project_id: res.data.project_id,
          tercero: res.data.tercero,
          creado: res.data.creado,
          roles: res.data.tercero.roles,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('maestro-terceros.upsert.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de lectura (NO muta) ──
  _ficha(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const clave = this._clave(input.tercero || input);
    if (!clave) return this._invalid('tercero.nif');

    const maestro = this._obtenerOCrear(pid);
    const tercero = maestro.terceros.get(clave) || null;   // sin match → null (no se inventa)

    return {
      status: 200,
      data: {
        project_id: pid,
        clave,
        encontrado: Boolean(tercero),
        tercero,
        roles: tercero ? (tercero.roles || []) : []
      }
    };
  }

  // ── proyeccion de escritura (UN escritor) — upsert del maestro UNICO ──
  _upsert(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: la ficha la fija solo el escritor del maestro.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor del maestro (MAESTRO_TERCEROS) puede asentar terceros',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const t = input.tercero || input.t;
    if (!t || typeof t !== 'object') return this._invalid('tercero');

    const clave = this._clave(t);
    if (!clave) return this._invalid('tercero.nif');

    // Roles: UNION. Un tercero que es cliente Y proveedor es UNO con ambos roles.
    const roles_nuevos = this._roles(t.roles);
    const maestro = this._obtenerOCrear(pid);
    const existente = maestro.terceros.get(clave);

    if (!existente) {
      const tercero = {
        clave,
        nif: this._normalizaNif(t.nif ?? t.numero_fiscal) || null,
        nombre: t.nombre != null ? String(t.nombre) : null,            // ausente → desconocido
        roles: roles_nuevos,
        es_ambos: this._esAmbos(roles_nuevos),
        condiciones: t.condiciones && typeof t.condiciones === 'object' ? t.condiciones : null,
        historial: [],
        creada_en: new Date().toISOString(),
        actualizada_en: new Date().toISOString()
      };
      maestro.terceros.set(clave, tercero);
      maestro.updated_at = tercero.actualizada_en;
      this._persist.marcarDirty(pid);
      return { status: 200, data: { project_id: pid, tercero, creado: true } };
    }

    // Ya existe: UN registro — se completa y SUMA; nada se borra.
    const roles = new Set(Array.isArray(existente.roles) ? existente.roles : []);
    for (const r of roles_nuevos) roles.add(r);
    existente.roles = [...roles];
    existente.es_ambos = this._esAmbos(existente.roles);
    if (!existente.nombre && t.nombre != null) existente.nombre = String(t.nombre);
    if (t.condiciones && typeof t.condiciones === 'object') {
      // Las condiciones se completan campo a campo; lo ausente queda desconocido.
      existente.condiciones = Object.assign({}, existente.condiciones || {}, t.condiciones);
    }
    if (t.historial_nota != null) {
      existente.historial = Array.isArray(existente.historial) ? existente.historial : [];
      existente.historial.push({ nota: String(t.historial_nota), en: new Date().toISOString() });
    }
    existente.actualizada_en = new Date().toISOString();

    maestro.terceros.set(clave, existente);
    maestro.updated_at = existente.actualizada_en;
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, tercero: existente, creado: false } };
  }

  // Clave del tercero: numero fiscal normalizado (MECANICO), o clave declarada.
  _clave(t) {
    if (!t || typeof t !== 'object') return null;
    const nif = this._normalizaNif(t.nif ?? t.numero_fiscal ?? t.clave);
    return nif || null;
  }

  // Normalizacion MECANICA del numero fiscal (mayusculas, sin separadores).
  // No valida contra ninguna ley (eso seria una constante legal cableada).
  _normalizaNif(raw) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).toUpperCase().replace(/[\s.\-_/]/g, '');
    return s.length ? s : null;
  }

  _roles(raw) {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map(r => String(r).toUpperCase()).filter(Boolean);
  }

  _esAmbos(roles) {
    const r = Array.isArray(roles) ? roles : [];
    return r.includes('CLIENTE') && r.includes('PROVEEDOR');
  }

  _obtenerOCrear(pid) {
    let m = this._maestros.get(pid);
    if (!m) {
      m = { esquema: 'contabilidad-maestro-terceros-v1', terceros: new Map() };
      this._maestros.set(pid, m);
      this._persist.marcarDirty(pid);
    }
    return m;
  }

  // Lectura directa de la ficha (mismo proceso) — no muta.
  fichaDe(pid, nif) {
    const m = pid ? this._maestros.get(pid) : null;
    const clave = this._normalizaNif(nif);
    return (m && clave) ? (m.terceros.get(clave) || null) : null;
  }

  // ── Tools ──
  toolFicha(params) { return this._ficha(params); }
  toolUpsert(params) { return this._upsert(params); }
}

module.exports = MaestroTerceros;
