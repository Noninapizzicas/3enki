/**
 * contabilidad-libro/saldo-tesoreria — REFLEJO STATELESS (E4, hoja del plan).
 *
 * POSICION REAL DE DINERO POR CUENTA. Derivacion DETERMINISTA: el saldo de tesoreria de cada
 * cuenta bancaria sale del MAYOR (saldos por cuenta contable, derivados del diario B3) cruzado
 * con el MAESTRO DE CUENTAS BANCARIAS (E11), que dice que cuenta contable corresponde a cada
 * cuenta bancaria y en que moneda. Calculo PURO.
 *
 * Ambas fuentes se piden POR EVENTO (nunca un `require` cruzado):
 *   - `maestro-cuentas-bancarias.listar.request` (E11) → las cuentas declaradas del negocio.
 *   - `mayor-balanza.saldos.request` (B3) → los saldos por cuenta contable derivados del diario.
 *
 * Invariantes:
 *  - SIN MAESTRO NO HAY SALDO: si el maestro de cuentas bancarias no esta disponible, no se
 *    inventa ninguna cuenta ni saldo: `disponible:false`, `cuentas:[]` (invariante 7: dato
 *    ausente = desconocido; nada se estima).
 *  - Una cuenta del maestro sin `cuenta_contable` declarada queda `saldo:null` (`[ABIERTO]`):
 *    no se adivina de que cuenta del mayor sale su dinero.
 *  - Determinista: mismo mayor + mismo maestro → mismo saldo.
 *  - NO escribe, NO persiste, NO muta.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja E4 del plan-construccion y diseno-oop.md (CLASE SaldoTesoreria).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class SaldoTesoreria extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'saldo-tesoreria';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'saldo-tesoreria.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('saldo-tesoreria.calcular.failed', res);
      return res;
    });
  }

  // ── fire-and-forget: el diario (B2) registro un asiento → señal de que el mayor cambio ──
  // No muta nada ni estima: la derivacion determinista se hace en calcular.request.
  onAsientoRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    this.logger?.debug('saldo-tesoreria.asiento.observado', {
      project_id: d.project_id, numero: d.numero ?? null
    });
    return null;
  }

  // ── proyeccion determinista: calcular(cuenta?, fecha?) → Cuantía por cuenta ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const fecha = input.fecha != null ? String(input.fecha) : null;
    const cuenta_pedida = input.cuenta != null ? String(input.cuenta) : null;

    // 1) El MAESTRO de cuentas bancarias (E11) POR EVENTO. Sin el, no se inventa nada.
    const maestro = await this._maestro(pid);
    if (!maestro.disponible) {
      return {
        status: 200,
        data: {
          project_id: pid,
          fecha,
          maestro_disponible: false,
          mayor_disponible: false,
          disponible: false,
          saldo_total: null,
          cuentas: [],
          motivo: 'el maestro de cuentas bancarias (E11) no respondio: sin el, el banco es un numero falso'
        }
      };
    }

    // 2) El MAYOR (B3) POR EVENTO: saldos por cuenta contable derivados del diario.
    const mayor = await this._mayor(pid, fecha, input);

    // Indice del mayor: cuenta contable → saldo.
    const saldo_por_cuenta = new Map();
    for (const m of mayor.lineas) {
      if (m && m.cuenta != null) saldo_por_cuenta.set(String(m.cuenta), m.saldo);
    }

    // 3) Derivacion determinista: por cada cuenta declarada, su saldo (si su cuenta contable
    //    esta declarada y el mayor la conoce). Dato ausente = desconocido (null), no se estima.
    const cuentas = [];
    for (const c of maestro.cuentas) {
      const cuenta_contable = c.cuenta_contable != null ? String(c.cuenta_contable) : null;
      const abierto = [];
      if (cuenta_contable === null) abierto.push('cuenta_contable');
      if (!mayor.disponible) abierto.push('saldo');

      const bruto = cuenta_contable !== null && saldo_por_cuenta.has(cuenta_contable)
        ? saldo_por_cuenta.get(cuenta_contable) : null;
      const saldo = bruto !== null ? this._round(bruto, 2) : null;

      cuentas.push({
        id_cuenta: c.id_cuenta,
        moneda: c.moneda != null ? c.moneda : null,
        banco: c.banco != null ? c.banco : null,
        cuenta_contable,
        saldo,
        // Saldo de la cuenta contable puede ser deudor(>0)/acreedor(<0): se declara el signo.
        naturaleza: saldo === null ? null : (saldo > 0 ? 'deudor' : (saldo < 0 ? 'acreedor' : 'cero')),
        abierto
      });
    }

    const con_saldo = cuentas.filter(c => c.saldo !== null);
    const filtradas = cuenta_pedida ? cuentas.filter(c => c.id_cuenta === cuenta_pedida) : cuentas;

    return {
      status: 200,
      data: {
        project_id: pid,
        fecha,
        maestro_disponible: true,
        mayor_disponible: mayor.disponible,
        fuente_mayor: mayor.fuente,
        disponible: mayor.disponible,
        // Solo se suma lo conocido: si alguna cuenta quedo [ABIERTO], el total se declara parcial.
        saldo_total: con_saldo.length ? this._round(con_saldo.reduce((s, c) => s + c.saldo, 0), 2) : null,
        total_conocidas: con_saldo.length,
        total_cuentas: cuentas.length,
        completo: con_saldo.length === cuentas.length && mayor.disponible,
        cuentas: filtradas
      }
    };
  }

  // El maestro (E11) se pide por EVENTO.
  async _maestro(pid) {
    const r = await this._rpc('maestro-cuentas-bancarias.listar.request', { project_id: pid }, { timeout_ms: 4000 });
    if (r && r.data && Array.isArray(r.data.cuentas)) return { disponible: true, cuentas: r.data.cuentas };
    return { disponible: false, cuentas: [] };
  }

  // El mayor (B3) se pide por EVENTO. Si no responde, se declara y no se estima.
  async _mayor(pid, fecha, input) {
    const r = await this._rpc('mayor-balanza.saldos.request',
      { project_id: pid, ejercicio: input.ejercicio ?? null, fecha }, { timeout_ms: 4000 });
    const lineas = r && r.data && Array.isArray(r.data.mayor) ? r.data.mayor : null;
    if (lineas) return { disponible: true, fuente: r.data.fuente || 'diario', lineas };
    return { disponible: false, fuente: null, lineas: [] };
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = SaldoTesoreria;
