/**
 * nichos/perfil-supervision — REFLEJO JS (CUSTODIO del vertical NICHOS, bloque H dueño).
 *
 * Único escritor del perfil de supervisión del dueño: cadencia, qué exige
 * respuesta sí-o-sí, umbral de nitidez para disparar solicitudes de decisión,
 * canales elegidos y techo de pérdida por proyecto. Snapshot inmutable por
 * versión: cada declaración muta el store aplicando el cambio sobre el último
 * snapshot, sellándolo con autor + instante, y PULSA
 * 'nichos.perfil.supervision.declarado'.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/perfil-supervision.json
 *   { _version, _updated, version, perfil:{...}, por_autor:[ {version, autor, cambio, at} ] }
 *
 * REGLA F3: "un solo escritor (el dueño por el canal). Lectores: libres." El
 * autor declarante debe venir como 'dueño' en el payload; otro autor → 403
 * ESCRITOR_NO_AUTORIZADO. K3 (ajustador-umbrales) NO toca este perfil, solo
 * el dueño: aquí se gobierna la cadencia y la cara del sistema.
 *
 * ABIERTO: todo campo puede nacer ABIERTO. El esqueleto por defecto entrega el
 * perfil con todos sus campos en 'ABIERTO'; el consumidor (escalones-mensaje,
 * puerto-canal, gate-decision-operar, alerta-sangria, paquetador-decision,
 * normalizador-semilla) decide qué hacer con un ABIERTO.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista). Sin mitad
 * blueprint — la lógica es CRUD + aritmética de versión.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();
const AUTOR_AUTORIZADO = 'dueño';

const CAMPOS_PERFIL = [
  'cadencia_pulso',
  'decide_siempre',
  'umbral_nitidez_semilla',
  'canales_elegidos',
  'techo_perdida_proyecto',
  'cadencia_cuadro'
];

function esqueletoAbierto() {
  return {
    cadencia_pulso: 'ABIERTO',
    decide_siempre: [],
    umbral_nitidez_semilla: 'ABIERTO',
    canales_elegidos: 'ABIERTO',
    techo_perdida_proyecto: 'ABIERTO',
    cadencia_cuadro: 'ABIERTO'
  };
}

class PerfilSupervision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'perfil-supervision';
    this.version = '0.1.0';
    this.perfilPorProyecto = new Map();   // project_id → { version, perfil, por_autor:[] }

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'perfil-supervision.json',
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
    return this._atender(e, 'leer', 'nichos.perfil.supervision.leer.response', d => this._leer(d));
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'nichos.perfil.supervision.declarar.response', d => this._declarar(d));
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto por defecto si no hay fichero.
  // =============================================================
  _perfil(project_id) {
    let p = this.perfilPorProyecto.get(project_id);
    if (!p) {
      p = { version: 0, perfil: esqueletoAbierto(), por_autor: [] };
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
    return { status: 200, data: { perfil_supervision: perfil } };
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
        'escritor_no_autorizado — solo el dueño declara el perfil de supervisión',
        { por_autor: input.por_autor, autor_autorizado: AUTOR_AUTORIZADO }
      );
      this.eventBus?.publish('nichos.perfil.supervision.declarado.failed', {
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
        'cambio contiene campos fuera del esquema del perfil de supervisión',
        { campos_desconocidos: camposDesconocidos, campos_validos: CAMPOS_PERFIL }
      );
      this.eventBus?.publish('nichos.perfil.supervision.declarado.failed', {
        project_id: input.project_id,
        code: 'INVALID_INPUT',
        message: err.error.message,
        timestamp: nowISO()
      });
      return err;
    }

    // Aplica el cambio sobre el último snapshot — inmutabilidad por versión.
    const actual = this._perfil(input.project_id);
    const perfilNuevo = Object.assign({}, actual.perfil);
    for (const k of CAMPOS_PERFIL) {
      if (Object.prototype.hasOwnProperty.call(cambio, k)) {
        perfilNuevo[k] = cambio[k];
      }
    }
    const nueva = {
      version: actual.version + 1,
      perfil: perfilNuevo,
      por_autor: actual.por_autor.concat([{
        version: actual.version + 1,
        autor: input.por_autor,
        cambio,
        at: nowISO()
      }])
    };
    this.perfilPorProyecto.set(input.project_id, nueva);
    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.perfil.supervision.declarado', {
      project_id: input.project_id,
      version: nueva.version,
      por_autor: input.por_autor,
      timestamp: nowISO()
    });

    return { status: 200, data: { nueva_version: nueva.version, perfil_supervision: nueva } };
  }
}

module.exports = PerfilSupervision;
