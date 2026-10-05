/**
 * nichos/reglas-exclusion — REFLEJO JS (CUSTODIO del vertical NICHOS, bloque B búsqueda).
 *
 * Guarda las reglas aprendidas de EXCLUSIÓN indexadas por firma de semilla y
 * las sirve al sondeador-territorio. Ingiere los sondeos cerrados como feedback
 * (append-only) para que una futura destilación (blueprint o K3) induzca
 * patrones. Este reflejo NO destila por sí solo: solo almacena, consulta y
 * re-emite el .actualizadas cuando el conjunto activo cambia por escritura
 * autorizada.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/reglas-exclusion.json
 *   {
 *     _version, _updated,
 *     reglas: {
 *       version: Int,
 *       reglas_por_firma: { <firma>: { patrones: [String], actualizada_por, at } },
 *       sondeos_ingeridos: [ { semilla_firma, candidatos_total, at } ],
 *       por_autor: [ { version, autor, firma, cambio, at } ]
 *     }
 *   }
 *
 * REGLA F3: un canal de escritura por autor. Autores autorizados:
 *   'dueño' — el dueño por el canal.
 *   'ajustador-umbrales' — K3, cuando promueve una propuesta aceptada.
 *
 * Patrón: ModuloHibridoReflejo. Sin mitad blueprint — la destilación semántica
 * de patrones vive fuera (o se añade cuando se cablee la fuzzy).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();
const AUTORES_AUTORIZADOS = ['dueño', 'ajustador-umbrales'];

function esqueletoVacio() {
  return {
    version: 0,
    reglas_por_firma: {},
    sondeos_ingeridos: [],
    por_autor: []
  };
}

class ReglasExclusion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'reglas-exclusion';
    this.version = '0.1.0';
    this.reglasPorProyecto = new Map();   // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'reglas-exclusion.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ reglas: this.reglasPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.reglas && typeof data.reglas === 'object') {
          this.reglasPorProyecto.set(pid, data.reglas);
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
  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'nichos.reglas.exclusion.consultar.response', d => this._consultar(d));
  }

  onActualizarRequest(e) {
    return this._atender(e, 'actualizar', 'nichos.reglas.exclusion.actualizar.response', d => this._actualizar(d));
  }

  // Fire-and-forget: ingesta de sondeos cerrados.
  onSondeoCompletado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id || !d.semilla_firma) return;
    const store = this._store(d.project_id);
    store.sondeos_ingeridos.push({
      semilla_firma: d.semilla_firma,
      candidatos_total: d.candidatos_total || 0,
      at: nowISO()
    });
    this._persist.marcarDirty(d.project_id);
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto vacío si no hay fichero.
  // =============================================================
  _store(project_id) {
    let s = this.reglasPorProyecto.get(project_id);
    if (!s) {
      s = esqueletoVacio();
      this.reglasPorProyecto.set(project_id, s);
    }
    return s;
  }

  // =============================================================
  // PROYECCIONES — lógica pura
  // =============================================================
  _consultar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.semilla_firma) return this._invalid('semilla_firma');
    const store = this._store(input.project_id);
    const entrada = store.reglas_por_firma[input.semilla_firma];
    const patrones = (entrada && Array.isArray(entrada.patrones)) ? entrada.patrones.slice() : [];
    return {
      status: 200,
      data: {
        conjunto_reglas: {
          semilla_firma: input.semilla_firma,
          patrones_excluir: patrones,
          version: store.version
        }
      }
    };
  }

  _actualizar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.semilla_firma) return this._invalid('semilla_firma');
    if (!input.por_autor) return this._invalid('por_autor');
    if (!input.cambio || typeof input.cambio !== 'object') return this._invalid('cambio');

    // Guard F3: autores autorizados.
    if (!AUTORES_AUTORIZADOS.includes(input.por_autor)) {
      const err = this._errorResponse(
        403,
        'PERMISSION_DENIED',
        'escritor_no_autorizado — solo el dueño o el ajustador-umbrales actualizan reglas de exclusión',
        { por_autor: input.por_autor, autores_autorizados: AUTORES_AUTORIZADOS }
      );
      this.eventBus?.publish('nichos.reglas.exclusion.actualizadas.failed', {
        project_id: input.project_id,
        code: 'PERMISSION_DENIED',
        message: err.error.message,
        timestamp: nowISO()
      });
      return err;
    }

    // Cambio esperado: { añadir?: [String], quitar?: [String], reemplazar?: [String] }
    const cambio = input.cambio;
    const añadir = Array.isArray(cambio.añadir) ? cambio.añadir : [];
    const quitar = Array.isArray(cambio.quitar) ? cambio.quitar : [];
    const reemplazar = Array.isArray(cambio.reemplazar) ? cambio.reemplazar : null;

    if (!añadir.length && !quitar.length && !reemplazar) {
      const err = this._errorResponse(
        400,
        'INVALID_INPUT',
        'cambio vacío — se espera {añadir?, quitar?, reemplazar?} con al menos uno no vacío',
        { cambio }
      );
      this.eventBus?.publish('nichos.reglas.exclusion.actualizadas.failed', {
        project_id: input.project_id,
        code: 'INVALID_INPUT',
        message: err.error.message,
        timestamp: nowISO()
      });
      return err;
    }

    const store = this._store(input.project_id);
    const previa = store.reglas_por_firma[input.semilla_firma] || { patrones: [], actualizada_por: null, at: null };
    let patronesNuevos;
    if (reemplazar) {
      patronesNuevos = reemplazar.filter(p => typeof p === 'string');
    } else {
      const base = previa.patrones.slice();
      for (const p of añadir) if (typeof p === 'string' && !base.includes(p)) base.push(p);
      patronesNuevos = base.filter(p => !quitar.includes(p));
    }

    const nuevaVersion = store.version + 1;
    store.version = nuevaVersion;
    store.reglas_por_firma[input.semilla_firma] = {
      patrones: patronesNuevos,
      actualizada_por: input.por_autor,
      at: nowISO()
    };
    store.por_autor.push({
      version: nuevaVersion,
      autor: input.por_autor,
      firma: input.semilla_firma,
      cambio,
      at: nowISO()
    });

    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.reglas.exclusion.actualizadas', {
      project_id: input.project_id,
      semilla_firma: input.semilla_firma,
      patrones_total: patronesNuevos.length,
      actualizada_por: input.por_autor,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: {
        nueva_version: nuevaVersion,
        conjunto_reglas: {
          semilla_firma: input.semilla_firma,
          patrones_excluir: patronesNuevos,
          version: nuevaVersion
        }
      }
    };
  }
}

module.exports = ReglasExclusion;
