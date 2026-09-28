/**
 * contabilidad/contrato-hecho-minimo — CUSTODIO (A11, hoja del plan).
 *
 * El MINIMO EXIGIBLE por fuente, VISTO DESDE LA FUENTE: no un formato impuesto
 * por contabilidad, sino el conjunto de campos que cada vertical (VENTA, COBRO,
 * PAGO, COMPRA, CONSUMO, CIERRE_JORNADA, RECTIFICATIVO) DEBE traer para que su
 * hecho sea admisible. Lo declara DUENO/JEFE (un solo escritor por vertical).
 *
 * CUSTODIO (patron real, distinto del reflejo stateless): un unico escritor del
 * store por vertical — _declarar valida rol en guard; _exigir y _cubre son
 * proyecciones PURAS de lectura (no mutan). Persiste por proyecto con
 * PosPersistencia (storage /contabilidad/contrato-hecho-minimo/*.json), restaura
 * en project.activated y vuelca en onUnload. Emisor/par de fallo: exito publica
 * contabilidad.contrato_declarado; error su par determinista. Ningun modulo del
 * inventario declara un contrato minimo por vertical.
 *
 * Ver hoja A11 del diseno-oop y bloque `contrato-hecho-minimo` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Roles con permiso de ESCRITURA sobre el minimo. Un solo escritor por vertical.
const ROLES_AUTORIZADOS = new Set(['DUENO', 'JEFE']);

class ContratoHechoMinimo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'contrato-hecho-minimo';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, verticales: { <vertical>: [campos] } }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'contrato-hecho-minimo.json',
      dir: '/contabilidad/contrato-hecho-minimo',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.verticales) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los contratos minimos del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.contrato.declarar.response', async (d) => {
      const res = this._declarar(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.contrato_declarado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.contrato.declarar.failed', res);
      }
      return res;
    });
  }

  onExigirRequest(e) {
    return this._atender(e, 'exigir', 'contabilidad.contrato.exigir.response', async (d) => {
      const res = this._exigir(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.contrato.exigir.failed', res);
      return res;
    });
  }

  onCubreRequest(e) {
    return this._atender(e, 'cubre', 'contabilidad.contrato.cubre.response', async (d) => {
      const res = this._cubre(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.contrato.cubre.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-contrato-hecho-minimo-v1', verticales: {} };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // declarar(rol, vertical, campos) — un solo escritor del minimo por vertical.
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (!ROLES_AUTORIZADOS.has(rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUENO/JEFE declara el minimo por vertical', {
        roles_esperados: [...ROLES_AUTORIZADOS], rol_recibido: rol
      });
    }

    const vertical = input && input.vertical;
    if (!vertical) return this._invalid('vertical');

    const campos = Array.isArray(input.campos)
      ? [...new Set(input.campos.map((c) => String(c).trim()).filter(Boolean))]
      : [];
    if (campos.length === 0) return this._invalid('campos');

    const d = this._obtenerOCrear(pid);
    d.verticales[vertical] = campos;
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, vertical, campos, declarado_por: rol }
    };
  }

  // exigir(vertical) -> Set<Campo>
  _exigir(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const vertical = input && input.vertical;
    if (!vertical) return this._invalid('vertical');

    const d = this._obtenerOCrear(pid);
    const campos = d.verticales[vertical];
    if (!campos) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `no hay minimo declarado para la vertical ${vertical}`, { vertical });
    }
    return { status: 200, data: { project_id: pid, vertical, campos } };
  }

  // cubre(vertical, hecho) -> ok | Set<Campo> faltantes  (el hecho NO se rellena)
  _cubre(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const vertical = input && input.vertical;
    if (!vertical) return this._invalid('vertical');
    const hecho = (input && input.hecho) || {};

    const d = this._obtenerOCrear(pid);
    const campos = d.verticales[vertical] || [];
    const faltantes = campos.filter((c) => {
      const v = hecho[c];
      return v === undefined || v === null || v === '';
    });

    return {
      status: 200,
      data: { project_id: pid, vertical, cubre: faltantes.length === 0, faltantes }
    };
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolExigir(params) { return this._exigir(params); }
  toolCubre(params) { return this._cubre(params); }
}

module.exports = ContratoHechoMinimo;
