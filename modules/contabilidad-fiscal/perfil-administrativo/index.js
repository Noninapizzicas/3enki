/**
 * contabilidad-fiscal/perfil-administrativo — CUSTODIO CON PERSISTENCIA (D15, hoja del plan).
 *
 * Parcela DECLARABLE de QUE administraciones y QUE obligaciones aplican a este negocio:
 * TERRITORIO (los posibles nombres son dato del negocio/asesor; el codigo no los enumera),
 * REGIMEN (los nombres posibles — tipo de impuesto indirecto y tipo de impuesto sobre la
 * renta — son IGUALMENTE datos) y las OBLIGACIONES (cada una con su modelo y su cadencia
 * declaradas). Es LA fuente de los parametros territoriales/regimen que las demas hojas
 * fiscales leen: aqui no se decide nada, se GUARDA lo que el declarante dice.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): este modulo NO cablea ningun territorio, ningun
 * regimen, ningun tipo de impuesto, ningun modelo ni ningun plazo. Guarda cadenas y
 * estructuras tal como se declaran.
 *
 * Invariante 7 (dato ausente = desconocido): sin perfil declarado para un ejercicio, la
 * lectura devuelve `declarado:false` con territorio/regimen a null — JAMAS se asume un
 * regimen por defecto ni un territorio "comun" por omision.
 *
 * UN SOLO ESCRITOR de la parcela: el declarante fiscal (rol DECLARANTE_PERFIL_FISCAL:
 * el dueño o el asesor). Cualquier otro rol es rechazado (segundo escritor → 403) y el
 * segundo escritor NO espera ni hace cola.
 *
 * No se borra: re-declarar un ejercicio APPENDEA al historial; el valor vigente queda con
 * su fecha y su autor. Jamas se sobrescribe en silencio (invariante 3).
 *
 * Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en
 * onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja D15 del plan-construccion y diseno-oop.md (CLASE PerfilAdministrativo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela: el declarante fiscal (dueño o asesor).
const ROL_ESCRITOR = 'DECLARANTE_PERFIL_FISCAL';

class PerfilAdministrativo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'perfil-administrativo';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, por_ejercicio: Map<ejercicio, Perfil>, historial: [] }
    this._perfiles = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'perfil-administrativo.json',
      dir: '/contabilidad/perfil-administrativo',
      snapshot: (pid) => {
        const p = this._perfiles.get(pid);
        if (!p) return null;
        return {
          project_id: pid,
          esquema: p.esquema,
          perfiles: [...p.por_ejercicio.entries()].map(([ejercicio, perfil]) => ({ ejercicio, ...perfil })),
          historial: p.historial
        };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const por_ejercicio = new Map();
        for (const p of (data.perfiles || [])) {
          if (!p || p.ejercicio == null) continue;
          const { ejercicio, ...perfil } = p;
          por_ejercicio.set(String(ejercicio), perfil);
        }
        this._perfiles.set(pid, {
          esquema: data.esquema || 'contabilidad-perfil-administrativo-v1',
          por_ejercicio,
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

  // ── handlers RPC (una linea, delegan a _atender) ──
  onObligacionesRequest(e) {
    return this._atender(e, 'obligaciones', 'perfil-administrativo.obligaciones.response', async (d) => {
      const res = this._obligaciones(d);
      if (res.status !== 200) this.eventBus?.publish('perfil-administrativo.obligaciones.failed', res);
      return res;
    });
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'perfil-administrativo.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el perfil fiscal quedo declarado.
        this.eventBus?.publish('contabilidad.perfil_fiscal_declarado', {
          project_id: res.data.project_id,
          ejercicio: res.data.ejercicio,
          territorio: res.data.perfil.territorio,
          regimen: res.data.perfil.regimen,
          obligaciones: res.data.perfil.obligaciones,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('perfil-administrativo.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de lectura (NO muta): que obligaciones aplican a este ejercicio ──
  _obligaciones(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ejercicio = input.ejercicio != null ? String(input.ejercicio) : null;
    const p = this._perfiles.get(pid);
    const perfil = (p && ejercicio != null) ? (p.por_ejercicio.get(ejercicio) || null) : null;

    // Sin perfil declarado: se DECLARA no declarado; no se asume territorio ni regimen.
    if (!perfil) {
      return {
        status: 200,
        data: {
          project_id: pid,
          ejercicio,
          declarado: false,
          territorio: null,
          regimen: null,
          administraciones: null,
          obligaciones: null,
          motivo: 'no hay perfil administrativo declarado para este ejercicio (invariante 7: no se asume)'
        }
      };
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio,
        declarado: true,
        territorio: perfil.territorio != null ? perfil.territorio : null,
        regimen: perfil.regimen != null ? perfil.regimen : null,
        administraciones: Array.isArray(perfil.administraciones) ? perfil.administraciones : [],
        obligaciones: Array.isArray(perfil.obligaciones) ? perfil.obligaciones : [],
        declarado_en: perfil.declarado_en != null ? perfil.declarado_en : null
      }
    };
  }

  // ── proyeccion de escritura (UN escritor): el declarante fija territorio/regimen/obligaciones ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el declarante fiscal declara el perfil.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el declarante fiscal (DECLARANTE_PERFIL_FISCAL) declara el perfil administrativo',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    // El ejercicio es DATO declarado; sin ejercicio no se sabe a que anualidad aplica.
    if (input.ejercicio === undefined || input.ejercicio === null || String(input.ejercicio).trim() === '') {
      return this._invalid('ejercicio');
    }
    const ejercicio = String(input.ejercicio).trim();

    // Los valores son DATO declarado; se guardan como cadenas. Ausente → null (no se asume).
    const territorio = this._texto(input.territorio);
    const regimen = this._regimen(input.regimen);
    const administraciones = this._listaObjs(input.administraciones);
    const obligaciones = this._listaObjs(input.obligaciones);

    const ahora = new Date().toISOString();
    const p = this._obtenerOCrear(pid);
    const vigente = p.por_ejercicio.get(ejercicio) || null;

    const perfil = {
      territorio,
      regimen,
      administraciones,
      obligaciones,
      declarado_por: ROL_ESCRITOR,
      declarado_en: ahora,
      // Se conserva lo vigente anterior (vigencia declarada), no se pierde.
      vigente_desde: vigente && vigente.declarado_en ? vigente.declarado_en : ahora
    };
    p.por_ejercicio.set(ejercicio, perfil);

    // Re-declarar no borra: se APPENDEA al historial (invariante 3).
    p.historial.push({
      ejercicio,
      territorio,
      regimen,
      administraciones: administraciones.length,
      obligaciones: obligaciones.length,
      por: ROL_ESCRITOR,
      en: ahora
    });
    p.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio,
        perfil,
        declarado: true,
        // Se declara si la declaracion traia valores; ausente NO se rellena con default.
        territorio_declarado: territorio !== null,
        regimen_declarado: regimen !== null
      }
    };
  }

  _texto(raw) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    return s.length ? s : null;
  }

  // El regimen es DATO declarado: impuesto indirecto y/o impuesto sobre la renta, tal cual.
  // El codigo NO enumera valores posibles: guarda lo que se declara (nombres o null).
  _regimen(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(raw)) out[k] = this._texto(v);
      return out;
    }
    return this._texto(raw);
  }

  // Lista de estructuras declaradas (administraciones u obligaciones): se guardan tal cual,
  // sin inventar campos legales. Cada objeto se copia con sus propias claves.
  _listaObjs(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(x => x && typeof x === 'object')
      .map(x => {
        const out = {};
        for (const [k, v] of Object.entries(x)) out[k] = v;
        return out;
      });
  }

  _obtenerOCrear(pid) {
    let p = this._perfiles.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-perfil-administrativo-v1', por_ejercicio: new Map(), historial: [] };
      this._perfiles.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Lectura directa para otras hojas del proceso (no muta): perfil vigente de un ejercicio.
  perfilDe(pid, ejercicio) {
    const p = pid ? this._perfiles.get(pid) : null;
    if (!p || ejercicio == null) return null;
    return p.por_ejercicio.get(String(ejercicio)) || null;
  }

  // ── Tools ──
  toolObligaciones(params) { return this._obligaciones(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = PerfilAdministrativo;
