/**
 * nichos/perfil-limite-busqueda — REFLEJO JS (CUSTODIO del vertical NICHOS, bloque A entrada).
 *
 * Único escritor del perfil de límites de búsqueda del dueño. Snapshot inmutable
 * por versión: cada declaración muta el store aplicando el cambio sobre el último
 * snapshot, sellándolo con autor + instante, y PULSA 'nichos.perfil.limite.declarado'.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/perfil-limite.json
 *   { _version, _updated, version, limites:{...}, por_autor:[ {version, autor, cambio, at} ] }
 *
 * REGLA F3: "un solo escritor (el dueño por el canal). Lectores: libres." El autor
 * declarante debe venir como 'dueño' en el payload (por_autor === 'dueño'); otro
 * autor → 403 ESCRITOR_NO_AUTORIZADO (expresión en positivo: la ranura la rellena
 * sólo quien tiene la llave; cualquier otro acceso de escritura queda sin molde).
 *
 * ABIERTO: todo campo puede nacer ABIERTO (sin declarar). El esqueleto por defecto
 * entrega el perfil con todos sus campos en 'ABIERTO'; el consumidor (buscador,
 * planificador) decide qué hacer con un ABIERTO — jamás se asume dato ausente.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista). No tiene mitad
 * blueprint — la lógica es CRUD + aritmética de versión (una respuesta correcta
 * computable). Lo fuzzy lo hará el Jefe/panel desde su propia página LLM.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();
const AUTOR_AUTORIZADO = 'dueño';

const CAMPOS_PERFIL = [
  'max_candidatos_por_semilla',
  'presupuesto_fuentes_por_hr',
  'territorios_vetados',
  'fuentes_autorizadas'
];

function esqueletoAbierto() {
  return {
    max_candidatos_por_semilla: 'ABIERTO',
    presupuesto_fuentes_por_hr: 'ABIERTO',
    territorios_vetados: [],
    fuentes_autorizadas: 'ABIERTO'
  };
}

class PerfilLimiteBusqueda extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'perfil-limite-busqueda';
    this.version = '0.1.0';
    this.perfilPorProyecto = new Map();   // project_id → { version, limites, por_autor:[] }

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'perfil-limite.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ perfil: this.perfilPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.perfil && typeof data.perfil === 'object') {
          this.perfilPorProyecto.set(pid, data.perfil);
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
    return this._atender(e, 'leer', 'nichos.perfil.limite.leer.response', d => this._leer(d));
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'nichos.perfil.limite.declarar.response', d => this._declarar(d));
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto por defecto si no hay fichero.
  // =============================================================
  _perfil(project_id) {
    let p = this.perfilPorProyecto.get(project_id);
    if (!p) {
      p = { version: 0, limites: esqueletoAbierto(), por_autor: [] };
      this.perfilPorProyecto.set(project_id, p);
    }
    return p;
  }

  // =============================================================
  // PROYECCIONES — lógica de dominio pura
  // =============================================================
  _leer(input) {
    if (!input.project_id) return this._invalid('project_id');
    const perfil = this._perfil(input.project_id);
    return { status: 200, data: { perfil_limite: perfil } };
  }

  _declarar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.por_autor) return this._invalid('por_autor');
    if (!input.cambio || typeof input.cambio !== 'object') return this._invalid('cambio');

    // Guard F3: un solo escritor — el dueño por el canal.
    if (input.por_autor !== AUTOR_AUTORIZADO) {
      const err = this._errorResponse(
        403,
        'PERMISSION_DENIED',
        'escritor_no_autorizado — solo el dueño declara el perfil de límites de búsqueda',
        { por_autor: input.por_autor, autor_autorizado: AUTOR_AUTORIZADO }
      );
      this.eventBus?.publish('nichos.perfil.limite.declarado.failed', {
        project_id: input.project_id,
        code: 'PERMISSION_DENIED',
        message: err.error.message,
        timestamp: nowISO()
      });
      return err;
    }

    // Validación de forma: cualquier campo del cambio debe pertenecer al esquema.
    const cambio = input.cambio;
    const camposDesconocidos = Object.keys(cambio).filter(k => !CAMPOS_PERFIL.includes(k));
    if (camposDesconocidos.length) {
      const err = this._errorResponse(
        400,
        'INVALID_INPUT',
        'cambio contiene campos fuera del esquema del perfil',
        { campos_desconocidos: camposDesconocidos, campos_validos: CAMPOS_PERFIL }
      );
      this.eventBus?.publish('nichos.perfil.limite.declarado.failed', {
        project_id: input.project_id,
        code: 'INVALID_INPUT',
        message: err.error.message,
        timestamp: nowISO()
      });
      return err;
    }

    // Aplica el cambio sobre el último snapshot — inmutabilidad por versión.
    const actual = this._perfil(input.project_id);
    const limitesNuevos = Object.assign({}, actual.limites);
    for (const k of CAMPOS_PERFIL) {
      if (Object.prototype.hasOwnProperty.call(cambio, k)) {
        limitesNuevos[k] = cambio[k];
      }
    }
    const nueva = {
      version: actual.version + 1,
      limites: limitesNuevos,
      por_autor: actual.por_autor.concat([{
        version: actual.version + 1,
        autor: input.por_autor,
        cambio,
        at: nowISO()
      }])
    };
    this.perfilPorProyecto.set(input.project_id, nueva);
    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.perfil.limite.declarado', {
      project_id: input.project_id,
      version: nueva.version,
      por_autor: input.por_autor,
      timestamp: nowISO()
    });

    return { status: 200, data: { nueva_version: nueva.version, perfil_limite: nueva } };
  }
}

module.exports = PerfilLimiteBusqueda;
