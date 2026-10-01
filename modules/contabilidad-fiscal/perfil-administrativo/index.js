/**
 * contabilidad-fiscal/perfil-administrativo — CUSTODIO CON PERSISTENCIA (D15, hoja del plan).
 *
 * La PARCELA DECLARABLE de que administraciones y obligaciones aplican (territorio y
 * regimen). UN SOLO ESCRITOR: solo el rol ADMINISTRATIVO declara el perfil; cualquier otro
 * rol es rechazado (segundo escritor → 403).
 *
 * Es el PARAMETRO DECLARABLE, no una regla: que modelos tocan lo DERIVA
 * cola-declaraciones-criterio (D3); el calendario lo fija calendario-fiscal (D6). Aqui se
 * guarda la DECLARACION y se responde por ella. Este modulo NO calcula obligaciones: las
 * DECLARA el jefe (dato ausente = desconocido, jamas se estima con un valor por defecto).
 *
 * Invariantes:
 *  - Nada se estima: un perfil sin regimen/territorio declarado queda [ABIERTO]; el sistema
 *    pregunta, no decide.
 *  - No se borra: re-declarar APPENDEA al historial con su fecha y su autor.
 *  - Dato ausente = desconocido: lo que no viene queda null, nunca un valor inventado.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R2 · ESCRIBE → ANUNCIA: al declarar publica `contabilidad.perfil_administrativo_declarado`
 * (lo escucha calendario-fiscal D6). Sin ese hecho, el perfil quedaria invisible.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja D15 del plan-construccion y diseno-oop.md (CLASE PerfilAdministrativo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela del perfil administrativo.
const ROL_ESCRITOR = 'ADMINISTRATIVO';

class PerfilAdministrativo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'perfil-administrativo';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, perfil, historial: [append-only] }
    this._perfiles = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'perfil-administrativo.json',
      dir: '/contabilidad/perfil-administrativo',
      snapshot: (pid) => {
        const p = this._perfiles.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, perfil: p.perfil, historial: p.historial };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        this._perfiles.set(pid, {
          esquema: data.esquema || 'contabilidad-perfil-administrativo-v1',
          perfil: data.perfil || null,
          historial: Array.isArray(data.historial) ? data.historial : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el perfil del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC de LECTURA (PREGUNTA → sin ui_handler: su cara es el bus) ──
  onObligacionesRequest(e) {
    return this._atender(e, 'obligaciones', 'perfil-administrativo.obligaciones.response', async (d) => {
      const res = this._obligaciones(d);
      // Reflejo de lectura: no cambia estado → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('perfil-administrativo.obligaciones.failed', res);
      return res;
    });
  }

  // ── handler RPC de ESCRITURA (ORDEN → ui_handler: mesa del asesor) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'perfil-administrativo.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: el perfil administrativo quedo declarado (o sigue [ABIERTO]).
        this.eventBus?.publish('contabilidad.perfil_administrativo_declarado', {
          project_id: res.data.project_id,
          regimen: res.data.perfil.regimen,
          territorio: res.data.perfil.territorio,
          obligaciones: res.data.perfil.obligaciones,
          estado: res.data.perfil.estado,
          abierto: res.data.abierto,
          correlation_id: d.correlation_id
        });
        // SUBE (best-effort por EVENTO) la fijacion de criterio a D3 y el calendario a D6.
        this.eventBus?.publish('cola-declaraciones-criterio.fijar.request', {
          project_id: res.data.project_id,
          perfil: res.data.perfil,
          correlation_id: d.correlation_id
        });
        this.eventBus?.publish('calendario-fiscal.declarar.request', {
          project_id: res.data.project_id,
          obligaciones: res.data.perfil.obligaciones,
          regimen: res.data.perfil.regimen,
          territorio: res.data.perfil.territorio,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('perfil-administrativo.declarar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _declarar(input) → { status, data }  ·  UN escritor declara el perfil
  // ══════════════════════════════════════════════════════════════════════
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el rol del perfil administrativo declara.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor del perfil administrativo (ADMINISTRATIVO) declara el perfil',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    // Los campos DECLARABLES. Ausente → null (no se estima territorio ni regimen).
    const regimen = this._txt(input.regimen);
    const territorio = this._txt(input.territorio);
    const obligaciones = Array.isArray(input.obligaciones)
      ? input.obligaciones.filter((o) => o && typeof o === 'object').map((o) => ({
        modelo: o.modelo != null ? String(o.modelo) : null,
        periodicidad: o.periodicidad != null ? String(o.periodicidad) : null,
        administracion: o.administracion != null ? String(o.administracion) : null
      }))
      : [];

    const p = this._obtenerOCrear(pid);
    const ahora = new Date().toISOString();
    const existente = p.perfil || null;

    // El perfil es una DECLARACION: sin regimen NI territorio NI obligaciones → [ABIERTO].
    const declarado = Boolean(regimen || territorio || obligaciones.length);
    const perfil = existente || {
      regimen: null, territorio: null, obligaciones: [],
      estado: 'ABIERTO', declarado_por: null, declarado_en: null
    };
    if (regimen !== null) perfil.regimen = regimen;
    if (territorio !== null) perfil.territorio = territorio;
    if (obligaciones.length) perfil.obligaciones = obligaciones;

    perfil.estado = declarado ? 'DECLARADO' : 'ABIERTO';
    perfil.declarado_por = ROL_ESCRITOR;
    perfil.declarado_en = ahora;

    p.perfil = perfil;
    p.historial.push({ estado: perfil.estado, regimen: perfil.regimen, territorio: perfil.territorio, num_obligaciones: perfil.obligaciones.length, por: ROL_ESCRITOR, en: ahora });
    p.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, perfil, declarado, abierto: perfil.estado === 'ABIERTO' }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // _obligaciones(input) → { status, data }  ·  LEE el perfil declarado (no lo calcula)
  // ══════════════════════════════════════════════════════════════════════
  _obligaciones(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const p = this._perfiles.get(pid) || null;
    const perfil = p ? p.perfil : null;

    if (!perfil) {
      // El sistema pregunta y NO estima: sin perfil declarado no se inventan obligaciones.
      return {
        status: 200,
        data: {
          project_id: pid, regimen: null, territorio: null, obligaciones: [],
          abierto: true, motivo: 'el perfil administrativo no esta declarado: el sistema pregunta, no estima'
        }
      };
    }
    return {
      status: 200,
      data: {
        project_id: pid,
        regimen: perfil.regimen,
        territorio: perfil.territorio,
        obligaciones: perfil.obligaciones || [],
        estado: perfil.estado,
        declarado_en: perfil.declarado_en,
        abierto: perfil.estado === 'ABIERTO'
      }
    };
  }

  _txt(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }

  _obtenerOCrear(pid) {
    let p = this._perfiles.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-perfil-administrativo-v1', perfil: null, historial: [] };
      this._perfiles.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolObligaciones(params) { return this._obligaciones(params); }
}

module.exports = PerfilAdministrativo;
