/**
 * contabilidad/cola-declaraciones-criterio — CUSTODIO (K9, hoja del plan).
 *
 * UNA sola cola declarativa donde el jefe/asesor fija o ratifica TODOS los
 * criterios contables: plan de cuentas, periodo, plazos, amortizacion,
 * dimensiones, tipos fiscales, consolidacion, unidad_de_cierre... En vez de
 * cerrarse en 12 sitios distintos, se declaran AQUI (la PUERTA DECLARATIVA del
 * dominio). Las 23 piezas `[ABIERTO]` del diseno-oop son parametros declarables
 * que viven en esta cola: mientras el dueno/asesor no declare el valor, la
 * pieza NO ACTUA. Lo no declarado NO se estima: queda PENDIENTE.
 *
 * CUSTODIO (patron real): un unico escritor del store — _declarar valida rol
 * JEFE/ASESOR en guard; _leer y _pendientes son proyecciones PURAS de lectura
 * (no mutan). Persiste por proyecto con PosPersistencia (storage
 * /contabilidad/cola-declaraciones-criterio/*.json), restaura en
 * project.activated y vuelca en onUnload. Emisor/par de fallo: exito publica
 * contabilidad.criterio_declarado (y contabilidad.criterio_pendiente por cada
 * pieza aun abierta); error su par determinista. La consumen clave-natural
 * (M3, B7/M4), inmovilizado (F5), analitica (J6/J7), fiscal (D10/D11) y el
 * resto: dependencia por EVENTO. NO REUTILIZA: ninguna pieza del inventario
 * recoge criterios contables.
 *
 * Ver hoja K9 del diseno-oop y bloque `cola-declaraciones-criterio` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Roles con permiso de ESCRITURA sobre los criterios (un solo escritor de la cola).
const ROLES_AUTORIZADOS = new Set(['JEFE', 'ASESOR']);

// Las 23 piezas [ABIERTO] del diseno-oop: parametros declarables, NO huecos.
// Mientras el dueno/asesor no los declare, la pieza NO ACTUA (no se estima nada).
const CATALOGO_ABIERTO = [
  'A6.3', 'A8.3', 'A10', 'B7', 'C7', 'D10', 'D11', 'E6', 'E14', 'F5', 'G5', 'H5',
  'H6', 'I5', 'I6', 'I7', 'J6', 'J7', 'K6', 'K7', 'K8', 'L6', 'M4'
];

class ColaDeclaracionesCriterio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cola-declaraciones-criterio';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, declaraciones: { <criterio>: ParametroDeclarable } }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cola-declaraciones-criterio.json',
      dir: '/contabilidad/cola-declaraciones-criterio',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.declaraciones) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las declaraciones de criterio del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.criterio.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.criterio_declarado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.criterio.declarar.failed', res);
      }
      return res;
    });
  }

  onLeerRequest(e) {
    return this._atender(e, 'leer', 'contabilidad.criterio.leer.response', async (d) => {
      const res = this._leer(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.criterio.leer.failed', res);
      return res;
    });
  }

  onPendientesRequest(e) {
    return this._atender(e, 'pendientes', 'contabilidad.criterio.pendientes.response', async (d) => {
      const res = this._pendientes(d);
      if (res.status === 200) {
        // Una senal por cada pieza [ABIERTO]: la pieza que no se declara NO actua.
        for (const id of res.data.pendientes) {
          this.eventBus?.publish('contabilidad.criterio_pendiente', {
            project_id: res.data.project_id,
            criterio: id,
            pieza_abierta: true,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('contabilidad.criterio.pendientes.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-cola-declaraciones-criterio-v1', declaraciones: {} };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // declarar(rol, criterio, valor) -> ParametroDeclarable — un solo escritor (JEFE/ASESOR).
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (!ROLES_AUTORIZADOS.has(rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo JEFE/ASESOR declara criterios contables', {
        roles_esperados: [...ROLES_AUTORIZADOS], rol_recibido: rol
      });
    }

    const criterio = input && input.criterio;
    if (!criterio) return this._invalid('criterio');

    const valor = input && input.valor;
    if (valor === undefined || valor === null) return this._invalid('valor');

    const d = this._obtenerOCrear(pid);
    const param = {
      criterio: String(criterio),
      valor,
      descripcion: (input && input.descripcion) || null,
      en_catalogo: CATALOGO_ABIERTO.includes(String(criterio)),
      declarado_por: rol,
      declarado_en: new Date().toISOString()
    };
    d.declaraciones[String(criterio)] = param;
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, criterio: param.criterio, parametro: param, valor: param.valor, declarado_por: rol }
    };
  }

  // leer(criterio) -> ParametroDeclarable | AUSENTE — proyeccion PURA (no muta).
  _leer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const criterio = input && input.criterio;
    if (!criterio) return this._invalid('criterio');

    const d = this._obtenerOCrear(pid);
    const param = d.declaraciones[String(criterio)];
    if (!param) {
      // AUSENTE = [ABIERTO]; lo no declarado NO se estima.
      return {
        status: 200,
        data: { project_id: pid, criterio: String(criterio), hallado: false, estado: 'AUSENTE', parametro: null }
      };
    }
    return {
      status: 200,
      data: { project_id: pid, criterio: String(criterio), hallado: true, estado: 'DECLARADO', parametro: param }
    };
  }

  // pendientes() -> List<IdCriterio> — las 23 piezas [ABIERTO]; lo no declarado NO se estima.
  _pendientes(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const d = this._obtenerOCrear(pid);
    const pendientes = CATALOGO_ABIERTO.filter((id) => !d.declaraciones[id]);
    const declarados = CATALOGO_ABIERTO.filter((id) => !!d.declaraciones[id]);

    return {
      status: 200,
      data: {
        project_id: pid,
        pendientes,
        declarados,
        total_catalogo: CATALOGO_ABIERTO.length,
        n_pendientes: pendientes.length,
        nota: 'lo no declarado NO se estima: la pieza queda [ABIERTO] y no actua'
      }
    };
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolLeer(params) { return this._leer(params); }
  toolPendientes(params) { return this._pendientes(params); }
}

module.exports = ColaDeclaracionesCriterio;
