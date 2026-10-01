/**
 * contabilidad-libro/maestro-cuentas-bancarias — CUSTODIO CON PERSISTENCIA (E11, hoja del plan).
 *
 * Parcela DECLARABLE de cuentas bancarias y su MONEDA. UN escritor.
 * Sin este maestro, 'el banco' es un número falso: la cuenta y su moneda se DECLARAN, no se adivinan.
 *
 * Invariantes:
 *  - La identidad de la cuenta es su identificador (iban/cuenta) declarado: sin él NO se declara.
 *  - La MONEDA es declarable; ausente = desconocida (se declara en `abierto`), no se asume EUR.
 *  - `declarar` es ESCRITURA → anuncia el HECHO. `listar` es PREGUNTA → no anuncia.
 *  - No se pisa en silencio: re-declarar una cuenta APPENDEA al historial.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + UN escritor.
 * Ver hoja E11 del plan-construccion y diseno-oop.md (CLASE MaestroCuentasBancarias).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class MaestroCuentasBancarias extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'maestro-cuentas-bancarias';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, cuentas: Map<cuenta_id, Cuenta> }
    this._maestros = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'maestro-cuentas-bancarias.json',
      dir: '/contabilidad/maestro-cuentas-bancarias',
      snapshot: (pid) => {
        const m = this._maestros.get(pid);
        if (!m) return null;
        return { project_id: pid, esquema: m.esquema, cuentas: [...m.cuentas.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const cuentas = new Map();
        for (const cu of (data.cuentas || [])) {
          if (cu && cu.cuenta_id != null) cuentas.set(String(cu.cuenta_id), cu);
        }
        this._maestros.set(pid, { esquema: data.esquema || 'contabilidad-maestro-cuentas-bancarias-v1', cuentas });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el maestro de cuentas bancarias del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC: declarar (ORDEN → ui_handler panel) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'maestro-cuentas-bancarias.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: quedo declarada una cuenta bancaria y su moneda.
        this.eventBus?.publish('contabilidad.cuenta_bancaria_declarada', {
          project_id: res.data.project_id,
          cuenta_id: res.data.cuenta.cuenta_id,
          cuenta: res.data.cuenta,
          moneda: res.data.cuenta.moneda,
          declarada: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('maestro-cuentas-bancarias.declarar.failed', res);
      }
      return res;
    });
  }

  // ── handler RPC: listar (PREGUNTA → sin ui_handler; su cara es el bus) ──
  onListarRequest(e) {
    return this._atender(e, 'listar', 'maestro-cuentas-bancarias.listar.response', async (d) => {
      const res = this._listar(d);
      // PREGUNTA: no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('maestro-cuentas-bancarias.listar.failed', res);
      return res;
    });
  }

  // ── proyeccion ORDEN (UN escritor): declarar una cuenta bancaria ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const cuenta_id = input.cuenta_id != null ? String(input.cuenta_id).trim()
      : (input.iban != null ? String(input.iban).trim() : '');
    if (!cuenta_id) return this._invalid('cuenta_id');

    const maestro = this._obtenerOCrear(pid);
    const existente = maestro.cuentas.get(cuenta_id) || null;
    const ahora = new Date().toISOString();

    const cuenta = existente || {
      cuenta_id,
      alias: null,
      banco: null,
      moneda: null,          // declarable — ausente = desconocida (NO se asume EUR)
      declarado_en: null,
      historial: []
    };
    if (input.alias != null) cuenta.alias = String(input.alias);
    if (input.banco != null) cuenta.banco = String(input.banco);
    if (input.moneda != null) cuenta.moneda = String(input.moneda).toUpperCase();
    cuenta.declarado_en = ahora;
    cuenta.historial = Array.isArray(cuenta.historial) ? cuenta.historial : [];
    // No se pisa en silencio: re-declarar apila el estado anterior.
    cuenta.historial.push({ alias: cuenta.alias, banco: cuenta.banco, moneda: cuenta.moneda, en: ahora });

    maestro.cuentas.set(cuenta_id, cuenta);
    maestro.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        cuenta,
        declarada: true,
        total: maestro.cuentas.size,
        abierto: {
          moneda: cuenta.moneda ? null : 'la cuenta no declaró moneda (se anota el hueco, no se asume EUR)'
        }
      }
    };
  }

  // ── proyeccion PREGUNTA (NO muta): listar cuentas del maestro ──
  _listar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const maestro = this._maestros.get(pid);
    const todas = maestro ? [...maestro.cuentas.values()] : [];

    const moneda = input.moneda != null ? String(input.moneda).toUpperCase().trim() : '';
    const banco = input.banco != null ? String(input.banco).trim() : '';

    let cuentas = todas;
    if (moneda) cuentas = cuentas.filter((c) => c.moneda === moneda);
    if (banco) cuentas = cuentas.filter((c) => c.banco === banco);

    return {
      status: 200,
      data: {
        project_id: pid,
        cuentas,
        total: cuentas.length,
        total_maestro: todas.length,
        // Sin maestro declarado NO se inventa: se declara el hueco.
        abierto: todas.length ? null : { maestro: 'no hay cuentas bancarias declaradas todavía' }
      }
    };
  }

  _obtenerOCrear(pid) {
    let m = this._maestros.get(pid);
    if (!m) {
      m = { esquema: 'contabilidad-maestro-cuentas-bancarias-v1', cuentas: new Map() };
      this._maestros.set(pid, m);
      this._persist.marcarDirty(pid);
    }
    return m;
  }

  // Cuenta concreta (mismo proceso) — no muta.
  cuentaDe(pid, cuenta_id) {
    const m = pid ? this._maestros.get(pid) : null;
    return m && cuenta_id != null ? (m.cuentas.get(String(cuenta_id)) || null) : null;
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolListar(params) { return this._listar(params); }
}

module.exports = MaestroCuentasBancarias;
