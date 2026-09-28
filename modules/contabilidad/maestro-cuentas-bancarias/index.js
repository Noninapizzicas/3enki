/**
 * contabilidad/maestro-cuentas-bancarias — CUSTODIO (E11, hoja del plan).
 *
 * Catalogo DECLARABLE de cuentas bancarias y su MONEDA. Sin el, "el banco" es un
 * solo numero falso: cada movimiento del extracto (E2) debe apuntar a UNA cuenta
 * declarada y con su moneda. Multi-moneda es parametro DECLARABLE: si el dueno no
 * la declara → una sola moneda base; si la declara → la aritmetica entre monedas
 * exige tipo de cambio declarado (E14).
 *
 * CUSTODIO (patron real): un unico escritor del catalogo — el DUENO declara en
 * guard (second-writer rechazado); _cuentas es proyeccion PURA de lectura (no
 * muta). Persiste por proyecto con PosPersistencia (storage
 * /contabilidad/maestro-cuentas-bancarias/*.json), restaura en project.activated
 * y vuelca en onUnload. Emisor/par de fallo. NO REUTILIZA: no existe maestro de
 * cuentas bancarias; ningun modulo del inventario toca banca.
 *
 * Ver hoja E11 del diseno-oop y bloque `maestro-cuentas-bancarias` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor del catalogo de cuentas bancarias.
const ROL_ESCRITOR = 'DUENO';

class MaestroCuentasBancarias extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'maestro-cuentas-bancarias';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, cuentas: {}, moneda_base, multi_moneda }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'maestro-cuentas-bancarias.json',
      dir: '/contabilidad/maestro-cuentas-bancarias',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.cuentas) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el catalogo de cuentas bancarias del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.cuenta_bancaria.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.cuenta_bancaria_declarada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.cuenta_bancaria.declarar.failed', res);
      }
      return res;
    });
  }

  onListarRequest(e) {
    return this._atender(e, 'listar', 'contabilidad.cuenta_bancaria.listar.response', async (d) => {
      const res = this._cuentas(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.cuenta_bancaria.listar.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = {
        esquema: 'contabilidad-maestro-cuentas-bancarias-v1',
        cuentas: {},
        moneda_base: null,
        multi_moneda: false
      };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // declarar(rol, cuenta, moneda) — un solo escritor (DUENO). La moneda se DECLARA.
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUENO declara cuentas bancarias', {
        rol_esperado: ROL_ESCRITOR, rol_recibido: rol
      });
    }

    const cuenta = input && input.cuenta;
    if (!cuenta || typeof cuenta !== 'object') return this._invalid('cuenta');
    const idCuenta = cuenta.id_cuenta_bancaria || cuenta.id || cuenta.iban;
    if (!idCuenta) return this._invalid('cuenta.id_cuenta_bancaria');

    const moneda = String((input && input.moneda) || cuenta.moneda || '').toUpperCase();
    if (!moneda) {
      // La moneda se declara; sin ella la cuenta no entra (no se asume EUR).
      return this._errorResponse(422, 'PRECONDITION_FAILED', 'la moneda de la cuenta no esta declarada', {
        cuenta: idCuenta, nota: 'multi-moneda es parametro declarable'
      });
    }

    const d = this._obtenerOCrear(pid);
    if (!d.moneda_base) d.moneda_base = moneda;
    if (moneda !== d.moneda_base) d.multi_moneda = true;

    const asentada = {
      id_cuenta_bancaria: idCuenta,
      iban: cuenta.iban || null,
      alias: cuenta.alias || null,
      banco: cuenta.banco || null,
      moneda,
      activa: cuenta.activa !== false,
      declarado_por: ROL_ESCRITOR,
      declarado_en: new Date().toISOString()
    };
    d.cuentas[idCuenta] = asentada;
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        cuenta: asentada,
        moneda_base: d.moneda_base,
        multi_moneda: d.multi_moneda,
        tipo_cambio_requerido: d.multi_moneda
      }
    };
  }

  // cuentas() -> List<CuentaBancaria> (proyeccion PURA: no muta).
  _cuentas(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);
    const moneda = (input && input.moneda) ? String(input.moneda).toUpperCase() : null;
    const lista = Object.values(d.cuentas).filter((c) => (moneda ? c.moneda === moneda : true));
    return {
      status: 200,
      data: {
        project_id: pid,
        cuentas: lista,
        n: lista.length,
        moneda_base: d.moneda_base,
        multi_moneda: d.multi_moneda
      }
    };
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolCuentas(params) { return this._cuentas(params); }
}

module.exports = MaestroCuentasBancarias;
