/**
 * nichos/criterio-viabilidad — REFLEJO JS (CUSTODIO del vertical NICHOS, bloque C validación).
 *
 * Único escritor del umbral de viabilidad para el motor de decisión 'VIABLE |
 * NO_VIABLE | PUENTE'. Snapshot inmutable por versión: cada declaración muta el
 * store aplicando el cambio sobre el último snapshot, sellándolo con autor +
 * instante, y PULSA 'nichos.criterio.viabilidad.declarado'.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/criterio-viabilidad.json
 *   { _version, _updated, version, umbral:{...}, por_autor:[ {version, autor, cambio, at} ] }
 *
 * REGLA F3: escritores autorizados declarados en lista; cualquier otro autor
 * → 403 ESCRITOR_NO_AUTORIZADO. Los autores previstos aquí son:
 *   'dueño'              — el dueño por el canal.
 *   'ajustador-umbrales' — K3, cuando promueve una propuesta aceptada.
 *
 * ABIERTO: todo campo puede nacer ABIERTO (sin declarar). El esqueleto por
 * defecto entrega el umbral con todos sus campos en 'ABIERTO'; el consumidor
 * (VeredictoViabilidad C3) degrada a PUENTE('umbral_sin_declarar') al toparse
 * con un ABIERTO — jamás se asume dato ausente.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista). Sin mitad
 * blueprint — la lógica es CRUD + aritmética de versión. Lo fuzzy lo hace
 * directamente el dueño o K3 desde su propia página LLM.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();
const AUTORES_AUTORIZADOS = ['dueño', 'ajustador-umbrales'];

const CAMPOS_UMBRAL = [
  'ingresos_semana_min',
  'ingresos_semana_objetivo',
  'disposicion_pagar_min',
  'por_tipo_nicho',
  'exige_vb_previo_construir'
];

function esqueletoAbierto() {
  return {
    ingresos_semana_min: 'ABIERTO',
    ingresos_semana_objetivo: 'ABIERTO',
    disposicion_pagar_min: 'ABIERTO',
    por_tipo_nicho: 'ABIERTO',
    exige_vb_previo_construir: 'ABIERTO'
  };
}

class CriterioViabilidad extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'criterio-viabilidad';
    this.version = '0.1.0';
    this.criterioPorProyecto = new Map();   // project_id → { version, umbral, por_autor:[] }

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'criterio-viabilidad.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ criterio: this.criterioPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.criterio && typeof data.criterio === 'object') {
          this.criterioPorProyecto.set(pid, data.criterio);
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
  onLeerRequest(e) {
    return this._atender(e, 'leer', 'nichos.criterio.viabilidad.leer.response', d => this._leer(d));
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'nichos.criterio.viabilidad.declarar.response', d => this._declarar(d));
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto por defecto si no hay fichero.
  // =============================================================
  _criterio(project_id) {
    let c = this.criterioPorProyecto.get(project_id);
    if (!c) {
      c = { version: 0, umbral: esqueletoAbierto(), por_autor: [] };
      this.criterioPorProyecto.set(project_id, c);
    }
    return c;
  }

  // =============================================================
  // PROYECCIONES — lógica de dominio pura
  // =============================================================
  _leer(input) {
    if (!input.project_id) return this._invalid('project_id');
    const criterio = this._criterio(input.project_id);
    return { status: 200, data: { umbral_viabilidad: criterio } };
  }

  _declarar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.por_autor) return this._invalid('por_autor');
    if (!input.cambio || typeof input.cambio !== 'object') return this._invalid('cambio');

    // Guard F3: escritores autorizados.
    if (!AUTORES_AUTORIZADOS.includes(input.por_autor)) {
      const err = this._errorResponse(
        403,
        'PERMISSION_DENIED',
        'escritor_no_autorizado — solo el dueño o el ajustador-umbrales declaran el criterio de viabilidad',
        { por_autor: input.por_autor, autores_autorizados: AUTORES_AUTORIZADOS }
      );
      this.eventBus?.publish('nichos.criterio.viabilidad.declarado.failed', {
        project_id: input.project_id,
        code: 'PERMISSION_DENIED',
        message: err.error.message,
        timestamp: nowISO()
      });
      return err;
    }

    // Validación de forma: cualquier campo del cambio debe pertenecer al esquema.
    const cambio = input.cambio;
    const camposDesconocidos = Object.keys(cambio).filter(k => !CAMPOS_UMBRAL.includes(k));
    if (camposDesconocidos.length) {
      const err = this._errorResponse(
        400,
        'INVALID_INPUT',
        'cambio contiene campos fuera del esquema del umbral',
        { campos_desconocidos: camposDesconocidos, campos_validos: CAMPOS_UMBRAL }
      );
      this.eventBus?.publish('nichos.criterio.viabilidad.declarado.failed', {
        project_id: input.project_id,
        code: 'INVALID_INPUT',
        message: err.error.message,
        timestamp: nowISO()
      });
      return err;
    }

    // Aplica el cambio sobre el último snapshot — inmutabilidad por versión.
    const actual = this._criterio(input.project_id);
    const umbralNuevo = Object.assign({}, actual.umbral);
    for (const k of CAMPOS_UMBRAL) {
      if (Object.prototype.hasOwnProperty.call(cambio, k)) {
        umbralNuevo[k] = cambio[k];
      }
    }
    const nueva = {
      version: actual.version + 1,
      umbral: umbralNuevo,
      por_autor: actual.por_autor.concat([{
        version: actual.version + 1,
        autor: input.por_autor,
        cambio,
        at: nowISO()
      }])
    };
    this.criterioPorProyecto.set(input.project_id, nueva);
    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.criterio.viabilidad.declarado', {
      project_id: input.project_id,
      version: nueva.version,
      por_autor: input.por_autor,
      timestamp: nowISO()
    });

    return { status: 200, data: { nueva_version: nueva.version, umbral_viabilidad: nueva } };
  }
}

module.exports = CriterioViabilidad;
