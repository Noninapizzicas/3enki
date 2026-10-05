/**
 * nichos/perfil-cobro-entrega — REFLEJO JS (CUSTODIO del vertical NICHOS, bloque I).
 *
 * Guarda, POR tipo_nicho (empresa | persona | organismo), la plantilla declarada
 * de preferencias de cobro+entrega: {esquema, frecuencia, canal_cobro_default,
 * canal_entrega, tiempo_entrega_max}. Snapshot inmutable por versión: cada
 * declaración muta el store aplicando el cambio sobre el último snapshot del
 * tipo_nicho afectado, sellándolo con autor + instante, y PULSA
 * 'nichos.perfil.cobro.declarado'.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/perfil-cobro-entrega.json
 *   {
 *     _version, _updated,
 *     plantillas: {
 *       empresa:   { version, perfil:{...}, por_autor:[{version,autor,cambio,at}] },
 *       persona:   { version, perfil:{...}, por_autor:[...] },
 *       organismo: { version, perfil:{...}, por_autor:[...] }
 *     }
 *   }
 *
 * REGLA F3 (adaptada al I1 del diseño: "autor = Constructor | Dueño"):
 * escritores autorizados declarados en lista. Los autores previstos son:
 *   'dueño'       — el dueño por el canal.
 *   'constructor' — D1 ensamblador-solucion, cuando un nicho recién ensamblado
 *                   necesita sembrar un perfil inicial deducido.
 * Cualquier otro autor → 403 ESCRITOR_NO_AUTORIZADO.
 *
 * ABIERTO: todo campo puede nacer ABIERTO. El esqueleto por defecto entrega el
 * perfil del tipo_nicho con todos sus campos en 'ABIERTO'; el consumidor
 * (D4 proponedor-modelo-cobro, E3 motor-cobro, E4 canal-distribucion) decide
 * qué hacer con un ABIERTO — jamás se asume contrato de pago/entrega ausente.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista). Sin mitad
 * blueprint — la lógica es CRUD + aritmética de versión + indexado por tipo.
 * Lo fuzzy lo hace D4 o el dueño directamente desde su canal.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();
const AUTORES_AUTORIZADOS = ['dueño', 'constructor'];

const TIPOS_NICHO = ['empresa', 'persona', 'organismo'];

const CAMPOS_PERFIL = [
  'esquema',
  'frecuencia',
  'canal_cobro_default',
  'canal_entrega',
  'tiempo_entrega_max'
];

function esqueletoAbierto() {
  return {
    esquema: 'ABIERTO',
    frecuencia: 'ABIERTO',
    canal_cobro_default: 'ABIERTO',
    canal_entrega: 'ABIERTO',
    tiempo_entrega_max: 'ABIERTO'
  };
}

class PerfilCobroEntrega extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'perfil-cobro-entrega';
    this.version = '0.1.0';
    // project_id → { empresa:{version,perfil,por_autor[]}, persona:{...}, organismo:{...} }
    this.plantillasPorProyecto = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'perfil-cobro-entrega.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ plantillas: this.plantillasPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.plantillas && typeof data.plantillas === 'object') {
          this.plantillasPorProyecto.set(pid, data.plantillas);
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
  onPlantillaRequest(e) {
    return this._atender(e, 'plantilla', 'nichos.perfil.cobro.plantilla.response', d => this._plantilla(d));
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'nichos.perfil.cobro.declarar.response', d => this._declarar(d));
  }

  // =============================================================
  // Estado — plantillas por proyecto indexadas por tipo_nicho.
  // =============================================================
  _plantillas(project_id) {
    let p = this.plantillasPorProyecto.get(project_id);
    if (!p) {
      p = {};
      this.plantillasPorProyecto.set(project_id, p);
    }
    return p;
  }

  _plantillaDe(project_id, tipo_nicho) {
    const p = this._plantillas(project_id);
    if (!p[tipo_nicho]) {
      p[tipo_nicho] = { version: 0, perfil: esqueletoAbierto(), por_autor: [] };
    }
    return p[tipo_nicho];
  }

  // =============================================================
  // PROYECCIONES — lógica de dominio pura
  // =============================================================
  _plantilla(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.tipo_nicho) return this._invalid('tipo_nicho');
    if (!TIPOS_NICHO.includes(input.tipo_nicho)) {
      return this._errorResponse(
        400,
        'TIPO_NICHO_DESCONOCIDO',
        `tipo_nicho fuera del catálogo canónico; recibido '${input.tipo_nicho}'`,
        { tipo_nicho: input.tipo_nicho, tipos_validos: TIPOS_NICHO }
      );
    }
    const plantilla = this._plantillaDe(input.project_id, input.tipo_nicho);
    return {
      status: 200,
      data: {
        perfil_cobro_entrega: {
          tipo_nicho: input.tipo_nicho,
          version: plantilla.version,
          perfil: plantilla.perfil,
          por_autor: plantilla.por_autor
        }
      }
    };
  }

  _declarar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.tipo_nicho) return this._invalid('tipo_nicho');
    if (!input.por_autor) return this._invalid('por_autor');
    if (!input.cambio || typeof input.cambio !== 'object') return this._invalid('cambio');

    // Guard: tipo_nicho canónico.
    if (!TIPOS_NICHO.includes(input.tipo_nicho)) {
      const err = this._errorResponse(
        400,
        'TIPO_NICHO_DESCONOCIDO',
        `tipo_nicho fuera del catálogo canónico; recibido '${input.tipo_nicho}'`,
        { tipo_nicho: input.tipo_nicho, tipos_validos: TIPOS_NICHO }
      );
      this.eventBus?.publish('nichos.perfil.cobro.declarado.failed', {
        project_id: input.project_id,
        tipo_nicho: input.tipo_nicho,
        code: 'TIPO_NICHO_DESCONOCIDO',
        message: err.error.message,
        timestamp: nowISO()
      });
      return err;
    }

    // Guard F3: escritores autorizados.
    if (!AUTORES_AUTORIZADOS.includes(input.por_autor)) {
      const err = this._errorResponse(
        403,
        'PERMISSION_DENIED',
        'escritor_no_autorizado — solo el dueño o el constructor declaran el perfil de cobro+entrega',
        { por_autor: input.por_autor, autores_autorizados: AUTORES_AUTORIZADOS }
      );
      this.eventBus?.publish('nichos.perfil.cobro.declarado.failed', {
        project_id: input.project_id,
        tipo_nicho: input.tipo_nicho,
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
        'cambio contiene campos fuera del esquema del perfil de cobro+entrega',
        { campos_desconocidos: camposDesconocidos, campos_validos: CAMPOS_PERFIL }
      );
      this.eventBus?.publish('nichos.perfil.cobro.declarado.failed', {
        project_id: input.project_id,
        tipo_nicho: input.tipo_nicho,
        code: 'INVALID_INPUT',
        message: err.error.message,
        timestamp: nowISO()
      });
      return err;
    }

    // Aplica el cambio sobre el último snapshot del tipo_nicho — inmutabilidad por versión.
    const actual = this._plantillaDe(input.project_id, input.tipo_nicho);
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
    const plantillas = this._plantillas(input.project_id);
    plantillas[input.tipo_nicho] = nueva;
    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.perfil.cobro.declarado', {
      project_id: input.project_id,
      tipo_nicho: input.tipo_nicho,
      version: nueva.version,
      por_autor: input.por_autor,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: {
        nueva_version: nueva.version,
        perfil_cobro_entrega: {
          tipo_nicho: input.tipo_nicho,
          version: nueva.version,
          perfil: nueva.perfil,
          por_autor: nueva.por_autor
        }
      }
    };
  }
}

module.exports = PerfilCobroEntrega;
