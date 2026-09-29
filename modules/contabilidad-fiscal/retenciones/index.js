/**
 * contabilidad-fiscal/retenciones — REFLEJO STATELESS (D4, hoja del plan).
 *
 * LIQUIDA las RETENCIONES de un periodo, en sus DOS sentidos:
 *   - PRACTICADAS: las que el negocio retuvo a terceros (acreedoras).
 *   - SOPORTADAS:  las que le retuvieron a el (deudoras).
 * Deriva del MAYOR (B3); NO recalcula ni reescribe asientos.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): los TIPOS de retencion no son constantes
 * cableadas. Llegan DECLARADOS por negocio y ejercicio (`tipos`, catalogo declarable) y,
 * por apunte, el tipo declarado en el asiento. Sin catalogo, cada apunte se agrupa por su
 * propio `tipo_retencion` — NUNCA se inventa un porcentaje. El sentido de las cuentas es
 * `reglas` declarable; sin declarar se usa la particion estandar por GRUPO (4751/473
 * practicadas y soportadas de trabajo, 4752/472 de capital mobiliario, etc. por prefijo),
 * que es la MISMA regla declarable que usan las demas hojas fiscales.
 *
 * Determinista: mismo mayor + mismos tipos declarados → mismas retenciones. Cero reloj.
 *
 * El mayor llega por DOS vias, ninguna es un `require` cruzado:
 *   - `contabilidad.asiento_registrado` (fire-and-forget): espejo idempotente por clave.
 *   - `retenciones.calcular.request`: se PIDE el mayor a mayor-balanza POR EVENTO; si no
 *     responde, se deriva del espejo. Se declara la fuente.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja D4 del plan-construccion y diseno-oop.md (CLASE Retenciones).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Composicion por defecto (declarable; NO es una ley cableada): prefijo de cuenta → sentido.
// Declararla sobrescribe completamente esta particion por grupo.
const REGLAS_DEFECTO = [
  { prefijo: '4751', sentido: 'PRACTICADA' },   // HP acreedora por retenciones practicadas (trabajo)
  { prefijo: '4752', sentido: 'PRACTICADA' },   // HP acreedora (capital mobiliario/otros)
  { prefijo: '473',  sentido: 'SOPORTADA' },    // HP retenciones y pagos a cuenta (deudora)
  { prefijo: '472',  sentido: 'SOPORTADA' }
];

class Retenciones extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'retenciones';
    this.version = 'reflejo-0.1.0';
    // espejo en memoria de los asientos registrados: project_id -> Map<clave, asiento>
    this._espejo = new Map();
    // ultimo catalogo de tipos de retencion declarado por proyecto: pid -> Map<ejercicio, [tipo]>
    this._tipos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── fire-and-forget: el diario publico un asiento → se refleja (idempotente, no decide) ──
  onAsientoRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    const asiento = d.asiento;
    if (!pid || !asiento || typeof asiento !== 'object') return null;
    const clave = asiento.clave_natural != null ? String(asiento.clave_natural)
      : (asiento.numero != null ? String(asiento.numero) : null);
    if (!clave) return null;
    this._espejoDe(pid).set(clave, asiento);
    return null;
  }

  // ── handler RPC (una linea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'retenciones.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('retenciones.calcular.failed', res);
      return res;
    });
  }

  // ── RETENCIONES: practicadas/soportadas desde el mayor (agrupa por tipo declarado) ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { mayor, fuente } = await this._mayor(pid, input);
    const reglas = this._reglas(input.reglas);

    const practicadas = [];
    const soportadas = [];
    const otro = [];

    for (const linea of mayor) {
      const sentido = this._sentidoDe(linea.cuenta, reglas);
      const ret = this._retencionDeclarada(linea);
      const item = {
        cuenta: linea.cuenta,
        tipo: ret.tipo,                    // tipo DECLARADO en el dato (puede ser null)
        base: ret.base,
        retencion: ret.retencion,
        procedencia: ret.procedencia      // 'declarada' | 'derivada_de_base_y_tipo_declarados' | 'derivada_del_saldo'
      };
      if (sentido === 'PRACTICADA') practicadas.push(item);
      else if (sentido === 'SOPORTADA') soportadas.push(item);
      else otro.push(item);
    }

    const total_practicado = this._round(practicadas.reduce((s, x) => s + x.retencion, 0), 2);
    const total_soportado = this._round(soportadas.reduce((s, x) => s + x.retencion, 0), 2);
    const diferencia = this._round(total_practicado - total_soportado, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio: input.ejercicio != null ? input.ejercicio : null,
        periodo: input.periodo != null ? String(input.periodo) : null,
        regimen: input.regimen != null ? String(input.regimen) : null,
        territorio: input.territorio != null ? String(input.territorio) : null,
        fuente,
        tipos_declarados: this._tiposDe(pid, input.ejercicio, input.tipos),
        reglas_declaradas: Array.isArray(input.reglas) ? input.reglas : null,
        total_practicado,
        total_soportado,
        diferencia,
        // La diferencia es del libro; su signo es dato, no un juicio cableado.
        signo: diferencia > 0 ? 'A_INGRESAR' : (diferencia < 0 ? 'A_COMPENSAR_O_DEVOLVER' : 'NULA'),
        detalle: { practicadas, soportadas, otro }
      }
    };
  }

  // Retencion por linea: si el asiento DECLARA base/tipo/retencion, se respetan tal cual;
  // si solo hay base+tipo declarados, se deriva; si no, el importe ES el saldo de la cuenta.
  _retencionDeclarada(linea) {
    const baseDeclarada = this._num(linea.base_retencion);
    const tipoDeclarado = linea.tipo_retencion != null && linea.tipo_retencion !== '' ? linea.tipo_retencion : null;
    const retDeclarada = this._num(linea.retencion);
    if (retDeclarada !== null) {
      return { tipo: tipoDeclarado, base: baseDeclarada, retencion: retDeclarada, procedencia: 'declarada' };
    }
    const saldo = Math.abs(linea.saldo != null ? Number(linea.saldo) : 0);
    const retencion = Number.isFinite(saldo) ? this._round(saldo, 2) : 0;
    if (baseDeclarada !== null && tipoDeclarado !== null) {
      const t = this._num(tipoDeclarado);
      if (t !== null) {
        return { tipo: tipoDeclarado, base: baseDeclarada, retencion: this._round(baseDeclarada * t, 2), procedencia: 'derivada_de_base_y_tipo_declarados' };
      }
      return { tipo: tipoDeclarado, base: baseDeclarada, retencion, procedencia: 'derivada_del_saldo' };
    }
    return { tipo: tipoDeclarado, base: baseDeclarada, retencion, procedencia: 'derivada_del_saldo' };
  }

  // Pide el mayor a mayor-balanza POR EVENTO; si no responde, lo deriva del espejo.
  async _mayor(pid, input = {}) {
    const r = await this._rpc('mayor-balanza.saldos.request',
      { project_id: pid, ejercicio: input.ejercicio ?? null }, { timeout_ms: 4000 });
    if (r && r.status === 200 && r.data && Array.isArray(r.data.mayor)) {
      return { mayor: r.data.mayor, fuente: 'mayor-balanza' };
    }
    return { mayor: this._derivarMayor(pid), fuente: 'espejo' };
  }

  _derivarMayor(pid) {
    const por = new Map();
    for (const a of this._espejoDe(pid).values()) {
      if (!a || !Array.isArray(a.apuntes)) continue;
      for (const ap of a.apuntes) {
        if (!ap || ap.cuenta == null) continue;
        const cuenta = String(ap.cuenta);
        const debe = this._num(ap.debe);
        const haber = this._num(ap.haber);
        if (debe === null || haber === null) continue;
        let s = por.get(cuenta);
        if (!s) { s = { cuenta, debe: 0, haber: 0, base_retencion: null, tipo_retencion: null, retencion: null }; por.set(cuenta, s); }
        s.debe = this._round(s.debe + debe, 2);
        s.haber = this._round(s.haber + haber, 2);
        if (s.tipo_retencion == null && ap.tipo_retencion != null) s.tipo_retencion = ap.tipo_retencion;
        if (s.base_retencion == null && ap.base_retencion != null) s.base_retencion = this._num(ap.base_retencion);
        if (s.retencion == null && ap.retencion != null) s.retencion = this._num(ap.retencion);
      }
    }
    return [...por.values()].sort((x, y) => x.cuenta.localeCompare(y.cuenta)).map(s => {
      const saldo = this._round(s.debe - s.haber, 2);
      return {
        cuenta: s.cuenta, debe: s.debe, haber: s.haber, saldo,
        base_retencion: s.base_retencion, tipo_retencion: s.tipo_retencion, retencion: s.retencion
      };
    });
  }

  // Reglas declarables; sin declarar → las de defecto (particion estandar por grupo).
  _reglas(raw) {
    if (!Array.isArray(raw)) return REGLAS_DEFECTO;
    const reglas = raw
      .filter(r => r && r.prefijo != null && r.sentido != null)
      .map(r => ({ prefijo: String(r.prefijo), sentido: String(r.sentido).toUpperCase() }));
    return reglas.length ? reglas : REGLAS_DEFECTO;
  }

  // Clasifica por el prefijo MAS LARGO que casa (determinista).
  _sentidoDe(cuenta, reglas) {
    const codigo = String(cuenta);
    let mejor = null;
    for (const r of reglas) {
      if (codigo.startsWith(r.prefijo) && (!mejor || r.prefijo.length > mejor.prefijo.length)) mejor = r;
    }
    return mejor ? mejor.sentido : 'OTRO';
  }

  // El catalogo de tipos es DATO declarable; se recuerda por proyecto+ejercicio.
  _tiposDe(pid, ejercicio, declarados) {
    if (!this._tipos.has(pid)) this._tipos.set(pid, new Map());
    const porEj = this._tipos.get(pid);
    const ej = ejercicio != null ? String(ejercicio) : 'sin-ejercicio';
    if (Array.isArray(declarados)) {
      porEj.set(ej, declarados);
      return declarados;
    }
    return porEj.get(ej) || null;
  }

  _espejoDe(pid) {
    let m = this._espejo.get(pid);
    if (!m) { m = new Map(); this._espejo.set(pid, m); }
    return m;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = Retenciones;
