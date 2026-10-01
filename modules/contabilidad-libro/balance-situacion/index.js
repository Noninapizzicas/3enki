/**
 * contabilidad-libro/balance-situacion — REFLEJO STATELESS (C1, hoja del plan).
 *
 * Activo / pasivo / patrimonio DERIVADO del mayor. La invariante que lo define:
 *   ACTIVO = PASIVO + PATRIMONIO
 * No calcula por su cuenta la cifra de cada cuenta (eso es mayor-balanza): RECIBE los saldos
 * (o los sube por EVENTO a mayor-balanza.saldos.request) y los AGRUPA en las masas.
 *
 * Honestidad (invariante 13): lo que no se puede clasificar NO se adivina — se declara en
 * `abierto`. La masa de cada cuenta sale de su `masa` declarada; si no, de una heurística PGC
 * por prefijo (documentada y sustituible). Ambiguo (grupo 4) → `desconocido`, no una masa inventada.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (calcular) → sin ui_handler.
 * Ver hoja C1 del plan-construccion y diseno-oop.md (CLASE BalanceSituacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const EPSILON = 0.005;

class BalanceSituacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'balance-situacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'balance-situacion.calcular.response', async (d) => {
      const res = await this._calcular(d);
      // Reflejo: calcula; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('balance-situacion.calcular.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): el libro cambio → se observa (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._vistos = this._vistos || [];
    if (d.asiento) this._vistos.push(d.asiento);
    if (this._vistos.length > 1000) this._vistos.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // calcular(saldos) → { activo, pasivo, patrimonio, cuadra }
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { saldos, fuente } = await this._saldosDe(input);

    let activo = 0, pasivo = 0, patrimonio = 0, gasto = 0, ingreso = 0;
    const desconocidas = [];
    const partidas = [];

    for (const s of saldos) {
      const cuenta = s && s.cuenta != null ? String(s.cuenta) : null;
      // Convencion DECLARADA: el saldo entrante es DEBE − HABER (firmado, estandar contable).
      const raw = this._round(this._num(s && (s.saldo != null ? s.saldo : (Number(s.debe || 0) - Number(s.haber || 0)))), 2);
      const masa = this._masa(cuenta, s);
      // Saldo NATURAL: activo/gasto son deudoras (debe−haber); pasivo/patrimonio/ingreso son
      // acreedoras (haber−debe). Asi cada masa se acumula en positivo.
      const natural = (masa === 'activo' || masa === 'gasto') ? raw : -raw;
      partidas.push({ cuenta, saldo: raw, masa, saldo_natural: masa === 'desconocido' ? null : this._round(natural, 2) });
      switch (masa) {
        case 'activo': activo += natural; break;
        case 'pasivo': pasivo += natural; break;
        case 'patrimonio': patrimonio += natural; break;
        case 'gasto': gasto += natural; break;
        case 'ingreso': ingreso += natural; break;
        default: desconocidas.push({ cuenta, saldo: raw }); break;
      }
    }

    const resultado = this._round(ingreso - gasto, 2);
    activo = this._round(activo, 2);
    pasivo = this._round(pasivo, 2);
    patrimonio = this._round(patrimonio, 2);
    // El resultado del ejercicio forma parte del patrimonio hasta su distribucion.
    const patrimonio_total = this._round(patrimonio + resultado, 2);

    // La invariante solo es afirmable si NO hay partidas sin clasificar (dato ausente = desconocido).
    const verificable = desconocidas.length === 0 && saldos.length > 0;
    const diferencia = this._round(activo - (pasivo + patrimonio_total), 2);
    const cuadra = verificable ? Math.abs(diferencia) <= EPSILON : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'balance-situacion',
        fuente: fuente || null,
        activo,
        pasivo,
        patrimonio,
        resultado,
        patrimonio_total,
        convenio_saldo: 'DEBE - HABER (firmado); natural por naturaleza (activo/gasto deudora, pasivo/patrimonio/ingreso acreedora)',
        total_cuentas: saldos.length,
        cuadra,
        verificable,
        invariante: 'ACTIVO = PASIVO + PATRIMONIO (incluye el resultado del ejercicio)',
        diferencia: verificable ? diferencia : null,
        partidas,
        abierto: {
          fuente: fuente ? null : 'no se recibieron saldos (ni declarados ni de mayor-balanza): el balance no se inventa',
          clasificacion: desconocidas.length
            ? `${desconocidas.length} cuenta(s) sin masa declarada ni clasificable por prefijo: no se suman (invariante no verificable)`
            : null
        }
      }
    };
  }

  // Trae los saldos: declarados en el input, o subidos por EVENTO a mayor-balanza.
  async _saldosDe(input) {
    if (Array.isArray(input.saldos)) return { saldos: input.saldos, fuente: 'declarado' };
    const resp = await this._rpc('mayor-balanza.saldos.request', {
      project_id: input.project_id || this.project_id,
      fecha: input.fecha, ejercicio: input.ejercicio
    }, { timeout_ms: 800 });
    if (resp && Array.isArray(resp.saldos)) return { saldos: resp.saldos, fuente: 'mayor-balanza' };
    return { saldos: [], fuente: null };
  }

  // Masa de una cuenta: declarada (`masa`/`plano`), o heuristica PGC por prefijo. Ambiguo → desconocido.
  _masa(cuenta, s) {
    const declarada = s && (s.masa || s.plano);
    if (declarada) {
      const m = String(declarada).toLowerCase().trim();
      if (['activo', 'pasivo', 'patrimonio', 'gasto', 'ingreso'].includes(m)) return m;
    }
    const c = String(cuenta || '');
    switch (c[0]) {
      case '1':
        // Grupo 1 (financiacion basica): PGC 10-15 = patrimonio neto; 16-19 = pasivo (no corriente).
        if (c.startsWith('1') && c >= '10' && c < '16') return 'patrimonio';
        return 'pasivo';
      case '2': return 'activo';
      case '3': return 'activo';
      case '5': return 'patrimonio';
      case '6': return 'gasto';
      case '7': return 'ingreso';
      case '4':
        if (c.startsWith('43') || c.startsWith('44')) return 'activo';
        if (c.startsWith('40') || c.startsWith('41')) return 'pasivo';
        return 'desconocido';
      default: return 'desconocido';
    }
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = BalanceSituacion;
