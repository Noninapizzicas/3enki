/**
 * contabilidad/perfil-administrativo — CUSTODIO (D15, hoja del plan).
 *
 * QUE administraciones y obligaciones aplican al negocio. El TERRITORIO
 * (COMUN / FORAL / CANARIAS / CEUTA_MELILLA) y el REGIMEN (IVA/IGIC/IPSI como
 * impuesto indirecto; IS o IRPF como sujeto) son DATOS DECLARABLES por negocio y
 * por ejercicio: LA LEY NUNCA SE CABLEA EN EL CODIGO. Cambia la ley → se DECLARA
 * el perfil; el sistema NUNCA asume un territorio (los cuatro son posibles y el
 * sistema no elige). Perfil administrativo != parametros fiscales (D11 = tipos y
 * bases): aqui solo se declara QUE aplica, no cuanto.
 *
 * CUSTODIO (patron real): store en memoria (un perfil por sociedad + secuencia
 * append-only de declaraciones, para poder AUDITAR que se declaro y cuando);
 * PosPersistencia (storage /contabilidad/perfil-administrativo/*.json); restaura
 * en project.activated; flush en onUnload. GUARD de un solo escritor: solo
 * DUENO/ASESOR declara — un segundo escritor se rechaza con ERROR_DOS_ESCRITORES.
 * Dependencia con cola-declaraciones-criterio (K9) por EVENTO, NUNCA por require
 * cruzado (el catalogo de territorios es declarable y ampliable).
 *
 * Emisor/par de fallo: exito publica contabilidad.perfil_declarado; error su par
 * determinista. Lo consumen liquidacion-iva (D1), retenciones-is-irpf (D4/D5) y
 * calendario-fiscal (D6): dependencia por EVENTO.
 * NO REUTILIZA: no existe perfil fiscal por sociedad en el inventario (fiscal =
 * 0 modulos en el inventario).
 *
 * Ver hoja D15 del diseno-oop y bloque `perfil-administrativo` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Un solo escritor de la parcela (D15): DUENO o ASESOR declaran el perfil.
const ROLES_AUTORIZADOS = new Set(['DUENO', 'ASESOR']);

// Codigo simbolico del cerrojo de escritor unico.
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';

// TERRITORIOS posibles: los CUATRO declarables. El sistema NO asume uno.
const TERRITORIOS = ['COMUN', 'FORAL', 'CANARIAS', 'CEUTA_MELILLA'];

// Impuestos indirectos y sujetos posibles: el sistema NO asume IVA ni IS.
const IMPUESTOS_INDIRECTOS = ['IVA', 'IGIC', 'IPSI'];
const SUJETOS = ['IS', 'IRPF'];

// Mapa DECLARABLE territorio -> impuesto indirecto por defecto. NO es la ley
// cableada: es un valor declarable que el dueno/asesor puede sobreescribir con
// impuesto_indirecto y con obligaciones explicitas. Cambia la ley → se declara.
const IMPUESTO_POR_TERRITORIO = {
  COMUN: 'IVA',
  FORAL: 'IVA',
  CANARIAS: 'IGIC',
  CEUTA_MELILLA: 'IPSI'
};

class PerfilAdministrativo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'perfil-administrativo';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, perfiles:{<sociedad>:{...}},
    //                                   declaraciones:[], catalogo_obligaciones:{} }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'perfil-administrativo.json',
      dir: '/contabilidad/perfil-administrativo',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.perfiles) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los perfiles declarados del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.perfil.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.perfil_declarado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.perfil.declarar.failed', res);
      }
      return res;
    });
  }

  onAplicablesRequest(e) {
    return this._atender(e, 'aplicables', 'contabilidad.perfil.aplicables.response', async (d) => {
      const res = this._aplicables(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.perfil.aplicables.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = {
        esquema: 'contabilidad-perfil-administrativo-v1',
        perfiles: {},
        declaraciones: [],
        catalogo_obligaciones: {},
        escritor: 'DUENO/ASESOR'
      };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (D15): solo DUENO/ASESOR declara el perfil.
  _verificarEscritorUnico(rol) {
    const r = String(rol || '').toUpperCase();
    if (!ROLES_AUTORIZADOS.has(r)) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'el perfil administrativo tiene UN escritor: solo DUENO/ASESOR declaran', {
          escritor_vigente: [...ROLES_AUTORIZADOS],
          rol_intentado: r || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    return null;
  }

  // declarar(rol, sociedad, perfil) -> ok — un solo escritor (DUENO/ASESOR).
  // La ley entra como DATO: territorio + regimen + impuestos + obligaciones.
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const sociedad = String((input && (input.sociedad || input.id_sociedad)) || '').trim();
    if (!sociedad) return this._invalid('sociedad');

    const perfilIn = (input && input.perfil) || {};
    const territorio = String((input && input.territorio) || perfilIn.territorio || '').toUpperCase();
    if (!territorio) {
      // El sistema NO asume territorio: sin declararlo, no hay perfil.
      return this._errorResponse(422, 'TERRITORIO_NO_DECLARADO',
        'el territorio es un DATO DECLARABLE (COMUN | FORAL | CANARIAS | CEUTA_MELILLA): el sistema no asume uno', {
          territorios_posibles: TERRITORIOS, asumido: false
        });
    }
    if (!TERRITORIOS.includes(territorio)) {
      return this._errorResponse(422, 'TERRITORIO_NO_VALIDO',
        `territorio ${territorio} fuera del catalogo declarable`, { territorios_posibles: TERRITORIOS });
    }

    const impuestoIndirecto = String(
      (input && input.impuesto_indirecto) || perfilIn.impuesto_indirecto || IMPUESTO_POR_TERRITORIO[territorio] || ''
    ).toUpperCase();
    if (!IMPUESTOS_INDIRECTOS.includes(impuestoIndirecto)) {
      return this._errorResponse(422, 'IMPUESTO_NO_VALIDO',
        `impuesto indirecto ${impuestoIndirecto} fuera del catalogo declarable`, {
          impuestos_posibles: IMPUESTOS_INDIRECTOS, nota: 'declarable; el sistema no asume IVA'
        });
    }

    const sujeto = String((input && input.sujeto) || perfilIn.sujeto || '').toUpperCase();
    if (sujeto && !SUJETOS.includes(sujeto)) {
      return this._errorResponse(422, 'SUJETO_NO_VALIDO',
        `sujeto fiscal ${sujeto} fuera del catalogo declarable`, { sujetos_posibles: SUJETOS });
    }

    const regimen = (input && input.regimen) || perfilIn.regimen || null;
    const ejercicio = (input && input.ejercicio) || perfilIn.ejercicio || null;
    const obligacionesExtra = Array.isArray(input && input.obligaciones) ? input.obligaciones
      : (Array.isArray(perfilIn.obligaciones) ? perfilIn.obligaciones : []);

    const d = this._obtenerOCrear(pid);
    const perfil = {
      sociedad,
      territorio,
      impuesto_indirecto: impuestoIndirecto,
      sujeto: sujeto || null,
      regimen,
      ejercicio,
      obligaciones_declaradas: obligacionesExtra,
      obligaciones: this._derivarObligaciones({
        territorio, impuesto_indirecto: impuestoIndirecto, sujeto, obligaciones: obligacionesExtra
      }),
      declarado_por: String((input && input.rol) || 'DUENO').toUpperCase(),
      declarado_en: new Date().toISOString(),
      ley_cableada: false,
      nota: 'territorio y regimen son DATOS DECLARABLES: la ley nunca se cablea en el codigo'
    };
    d.perfiles[sociedad] = perfil;
    d.declaraciones.push({
      sociedad,
      territorio,
      impuesto_indirecto: impuestoIndirecto,
      sujeto: sujeto || null,
      ejercicio,
      declarado_en: perfil.declarado_en,
      secuencia: d.declaraciones.length + 1
    });
    d.updated_at = perfil.declarado_en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        sociedad,
        perfil,
        obligaciones: perfil.obligaciones,
        n_obligaciones: perfil.obligaciones.length,
        ley_cableada: false,
        el_sistema_no_asume_territorio: true
      }
    };
  }

  // aplicables(sociedad) -> Set<IdObligacion> — territorio + regimen (D15).
  _aplicables(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const sociedad = String((input && (input.sociedad || input.id_sociedad)) || '').trim();
    if (!sociedad) return this._invalid('sociedad');

    const d = this._obtenerOCrear(pid);
    const perfil = d.perfiles[sociedad] || null;
    if (!perfil) {
      // Sin perfil declarado NO se asume territorio ni regimen.
      return this._errorResponse(404, 'PERFIL_NO_DECLARADO',
        `la sociedad ${sociedad} no tiene perfil administrativo declarado: el sistema no asume territorio`, {
          sociedad, accion: 'DECLARAR_PERFIL', asumido: false
        });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        sociedad,
        territorio: perfil.territorio,
        impuesto_indirecto: perfil.impuesto_indirecto,
        sujeto: perfil.sujeto,
        regimen: perfil.regimen,
        ejercicio: perfil.ejercicio,
        obligaciones: perfil.obligaciones,
        n_obligaciones: perfil.obligaciones.length,
        ley_cableada: false,
        determinista: true
      }
    };
  }

  // Deriva las obligaciones aplicables del perfil DECLARADO. No hay leyes
  // cableadas: los identificadores de obligacion son DATOS; el catalogo de
  // obligaciones es declarable y ampliable por el escritor.
  _derivarObligaciones({ territorio, impuesto_indirecto, sujeto, obligaciones }) {
    const ids = new Set();
    // Obligaciones del impuesto indirecto declarado: se nombran por su
    // identificador declarable (p.ej. MOD_303 del IVA, MOD_420 del IGIC).
    ids.add(`INDDIRECTO_${impuesto_indirecto}`);
    ids.add(`RESUMEN_ANUAL_${impuesto_indirecto}`);
    ids.add('LIBROS_REGISTRO');
    if (sujeto) ids.add(`SUJETO_${sujeto}`);
    if (territorio === 'FORAL') ids.add('NORMATIVA_FORAL');
    if (territorio === 'CANARIAS') ids.add('REF_IGIC');
    if (territorio === 'CEUTA_MELILLA') ids.add('REF_IPSI');
    for (const o of obligaciones) {
      if (o) ids.add(String(o).toUpperCase());
    }
    return [...ids];
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolAplicables(params) { return this._aplicables(params); }
}

module.exports = PerfilAdministrativo;
