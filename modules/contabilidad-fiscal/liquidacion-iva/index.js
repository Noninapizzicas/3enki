/**
 * contabilidad-fiscal/liquidacion-iva — REFLEJO STATELESS (D1, hoja del plan).
 *
 * LIQUIDA el IVA de un periodo: IVA DEVENGADO (repercutido) − IVA SOPORTADO (deducible)
 * → CUOTA. Deriva del MAYOR (B3); NO recalcula ni reescribe asientos.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): los TIPOS de IVA no son constantes cableadas.
 * Llegan DECLARADOS por negocio y ejercicio (`tipos`, catálogo declarable del régimen:
 * comun/foral/Canarias/Ceuta-Melilla → IVA/IGIC/IPSI). Sin catálogo declarado, cada
 * apunte de cuota se agrupa por su propio `tipo` declarado en el asiento — NUNCA se
 * inventa un tipo. Tampoco se cablea el sentido de las cuentas: `reglas` es declarable,
 * y sin declarar se usa la composición por defecto sobre grupos estándar (47x deudor /
 * 477 acreedor), que es la MISMA regla declarable que ya usa cuenta-resultados.
 *
 * Determinista: mismo mayor + mismos tipos declarados → misma liquidación. Cero reloj.
 *
 * El mayor llega por DOS vías, ninguna es un `require` cruzado:
 *   - `contabilidad.asiento_registrado` (fire-and-forget): se ACUMULA la muestra del
 *     asiento en un espejo en memoria (idempotente por clave natural).
 *   - `liquidacion-iva.calcular.request`: se PIDE el mayor a mayor-balanza POR EVENTO;
 *     si no responde, se deriva del espejo. Se declara la fuente.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja D1 del plan-construccion y diseno-oop.md (CLASE LiquidacionIva).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Composicion por defecto de las cuentas de IVA (declarable; NO es una ley cableada,
// es la particion estandar del plan por GRUPO de cuenta). Declararla sobrescribe esto.
const REGLAS_DEFECTO = [
  { prefijo: '477', lado: 'DEVENGADO' },   // IVA repercutido (acreedor)
  { prefijo: '472', lado: 'SOPORTADO' },   // IVA deducible (deudor)
  { prefijo: '470', lado: 'DEVENGADO' }
];

class LiquidacionIva extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'liquidacion-iva';
    this.version = 'reflejo-0.1.0';
    // espejo en memoria de los asientos registrados: project_id -> Map<clave, asiento>
    this._espejo = new Map();
    // ultimo catalogo de tipos declarado por proyecto: pid -> { ejercicio -> [tipo,...] }
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
    return this._atender(e, 'calcular', 'liquidacion-iva.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('liquidacion-iva.calcular.failed', res);
      return res;
    });
  }

  // ── LIQUIDACION: devengado/soportado → cuota (deriva del mayor, no recalcula asientos) ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { mayor, fuente } = await this._mayor(pid, input);
    const reglas = this._reglas(input.reglas);

    const devengado = [];
    const soportado = [];
    const otro = [];

    for (const linea of mayor) {
      const lado = this._ladoDe(linea.cuenta, reglas);
      const cuota = this._cuotaDeclarada(linea);
      const item = {
        cuenta: linea.cuenta,
        tipo: cuota.tipo,                    // tipo DECLARADO en el dato (puede ser null)
        base: cuota.base,
        cuota: cuota.cuota,
        procedencia: cuota.procedencia      // 'declarada' | 'derivada_del_saldo'
      };
      if (lado === 'DEVENGADO') devengado.push(item);
      else if (lado === 'SOPORTADO') soportado.push(item);
      else otro.push(item);
    }

    // Los importes SON los del libro; el signo viene del lado, no de un tipo cableado.
    const total_devengado = this._round(devengado.reduce((s, x) => s + x.cuota, 0), 2);
    const total_soportado = this._round(soportado.reduce((s, x) => s + x.cuota, 0), 2);
    const cuota = this._round(total_devengado - total_soportado, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio: input.ejercicio != null ? input.ejercicio : null,
        periodo: input.periodo != null ? String(input.periodo) : null,
        regimen: input.regimen != null ? String(input.regimen) : null,   // declarable (IVA/IGIC/IPSI)
        territorio: input.territorio != null ? String(input.territorio) : null,
        fuente,
        // Los TIPOS son dato: se devuelve el catalogo declarado que se uso, o null.
        tipos_declarados: this._tiposDe(pid, input.ejercicio, input.tipos),
        reglas_declaradas: Array.isArray(input.reglas) ? input.reglas : null,
        total_devengado,
        total_soportado,
        cuota,
        // Un resultado negativo es una cuota A COMPENSAR/DEVOLVER declarada, no un error.
        signo: cuota > 0 ? 'A_INGRESAR' : (cuota < 0 ? 'A_COMPENSAR_O_DEVOLVER' : 'NULA'),
        detalle: { devengado, soportado, otro }
      }
    };
  }

  // Cuota por linea: si el asiento DECLARA base/tipo/cuota, se respetan tal cual; si no,
  // se toma el saldo de la cuenta y se declara que se derivo del saldo (no se estima tipo).
  _cuotaDeclarada(linea) {
    const baseDeclarada = this._num(linea.base_iva);
    const tipoDeclarado = linea.tipo_iva != null && linea.tipo_iva !== '' ? linea.tipo_iva : null;
    const cuotaDeclarada = this._num(linea.cuota_iva);
    if (cuotaDeclarada !== null) {
      return { tipo: tipoDeclarado, base: baseDeclarada, cuota: cuotaDeclarada, procedencia: 'declarada' };
    }
    // Sin cuota declarada: el importe del IVA ES el saldo de la cuenta de IVA del libro.
    const saldo = Math.abs(linea.saldo != null ? Number(linea.saldo) : 0);
    const cuota = Number.isFinite(saldo) ? this._round(saldo, 2) : 0;
    // Con base y tipo declarados, la cuota se deriva; el TIPO sigue siendo dato, no constante.
    if (baseDeclarada !== null && tipoDeclarado !== null) {
      const t = this._num(tipoDeclarado);
      if (t !== null) {
        return { tipo: tipoDeclarado, base: baseDeclarada, cuota: this._round(baseDeclarada * t, 2), procedencia: 'derivada_de_base_y_tipo_declarados' };
      }
      return { tipo: tipoDeclarado, base: baseDeclarada, cuota, procedencia: 'derivada_del_saldo' };
    }
    return { tipo: tipoDeclarado, base: baseDeclarada, cuota, procedencia: 'derivada_del_saldo' };
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
        if (!s) { s = { cuenta, debe: 0, haber: 0, base_iva: null, tipo_iva: null, cuota_iva: null }; por.set(cuenta, s); }
        s.debe = this._round(s.debe + debe, 2);
        s.haber = this._round(s.haber + haber, 2);
        // Los tipos/bases del asiento se conservan como DATO si vienen declarados.
        if (s.tipo_iva == null && ap.tipo_iva != null) s.tipo_iva = ap.tipo_iva;
        if (s.base_iva == null && ap.base_iva != null) s.base_iva = this._num(ap.base_iva);
        if (s.cuota_iva == null && ap.cuota_iva != null) s.cuota_iva = this._num(ap.cuota_iva);
      }
    }
    return [...por.values()].sort((x, y) => x.cuenta.localeCompare(y.cuenta)).map(s => {
      const saldo = this._round(s.debe - s.haber, 2);
      return {
        cuenta: s.cuenta, debe: s.debe, haber: s.haber, saldo,
        base_iva: s.base_iva, tipo_iva: s.tipo_iva, cuota_iva: s.cuota_iva
      };
    });
  }

  // Reglas declarables; sin declarar → las de defecto (particion estandar por grupo).
  _reglas(raw) {
    if (!Array.isArray(raw)) return REGLAS_DEFECTO;
    const reglas = raw
      .filter(r => r && r.prefijo != null && r.lado != null)
      .map(r => ({ prefijo: String(r.prefijo), lado: String(r.lado).toUpperCase() }));
    return reglas.length ? reglas : REGLAS_DEFECTO;
  }

  // Clasifica por el prefijo MAS LARGO que casa (determinista).
  _ladoDe(cuenta, reglas) {
    const codigo = String(cuenta);
    let mejor = null;
    for (const r of reglas) {
      if (codigo.startsWith(r.prefijo) && (!mejor || r.prefijo.length > mejor.prefijo.length)) mejor = r;
    }
    return mejor ? mejor.lado : 'OTRO';
  }

  // El catalogo de tipos es DATO declarable; se recuerda por proyecto+ejercicio.
  _tiposDe(pid, ejercicio, declarados) {
    if (Array.isArray(declarados)) {
      if (!this._tipos.has(pid)) this._tipos.set(pid, new Map());
      const ej = ejercicio != null ? String(ejercicio) : 'sin-ejercicio';
      this._tipos.get(pid).set(ej, declarados);
      return declarados;
    }
    const porEj = this._tipos.get(pid);
    if (!porEj) return null;
    const ej = ejercicio != null ? String(ejercicio) : 'sin-ejercicio';
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

module.exports = LiquidacionIva;
