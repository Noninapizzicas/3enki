/**
 * contabilidad-libro/partida-conciliatoria — REFLEJO STATELESS (E9, hoja del plan).
 *
 * PARTIDAS EN TRANSITO que EXPLICAN el desfase entre el banco y la contabilidad.
 * El desfase se EXPLICA, no se esconde.
 *
 * No calcula el saldo contable por su cuenta: SUBE por EVENTO a
 * `saldo-tesoreria.calcular.request` (E3) para leerlo, y compara con el saldo BANCARIO
 * declarado. La diferencia se descompone en las partidas en transito declaradas (cheques
 * emitidos no cobrados, ingresos pendientes de abono, comisiones no contabilizadas...).
 *
 * Honestidad (invariante 13): el desfase que NO queda cubierto por una partida declarada
 * NO se esconde ni se reparte en una partida inventada: queda declarado en `no_explicado`.
 * "Cuadrar" aqui significa que las partidas EXPLICAN el desfase, no que el desfase sea 0.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA (desfase) → sin ui_handler.
 * Ver hoja E9 del plan-construccion y diseno-oop.md (CLASE PartidaConciliatoria).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const EPSILON = 0.005;

class PartidaConciliatoria extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'partida-conciliatoria';
    this.version = 'reflejo-0.1.0';
    this._vistos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onDesfaseRequest(e) {
    return this._atender(e, 'desfase', 'partida-conciliatoria.desfase.response', async (d) => {
      const res = await this._desfase(d);
      // Reflejo: explica el desfase; no escribe → no hay hecho de dominio que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('partida-conciliatoria.desfase.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): el libro cambio → se observa (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    let arr = this._vistos.get(pid);
    if (!arr) { arr = []; this._vistos.set(pid, arr); }
    if (d.asiento) arr.push(d.asiento);
    if (arr.length > 1000) arr.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // desfase(banco vs contable) → desfase explicado por partidas en transito
  // ══════════════════════════════════════════════════════════════════════
  async _desfase(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const saldoBanco = this._num(input.saldo_banco != null ? input.saldo_banco : input.banco);
    if (saldoBanco == null) return this._invalid('saldo_banco');

    // Saldo contable: declarado o subido por EVENTO a saldo-tesoreria (E3).
    let saldoContable = this._num(input.saldo_contable);
    let fuente = saldoContable != null ? 'declarado' : null;
    if (saldoContable == null) {
      const resp = await this._rpc('saldo-tesoreria.calcular.request', {
        project_id: pid, cuenta: input.cuenta, fecha: input.fecha, ejercicio: input.ejercicio
      }, { timeout_ms: 3000 });
      const d = resp && (resp.data || resp);
      const s = this._num(d && (d.saldo != null ? d.saldo : d.saldo_contable));
      if (s != null) { saldoContable = s; fuente = 'saldo-tesoreria'; }
    }
    if (saldoContable == null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'partida-conciliatoria',
          saldo_banco: saldoBanco,
          saldo_contable: null,
          desfase: null,
          abierto: { saldo_contable: 'no se obtuvo el saldo contable (ni declarado ni de saldo-tesoreria): el desfase no se inventa' }
        }
      };
    }

    const desfase = this._round(saldoBanco - saldoContable, 2);

    // Partidas en transito DECLARADAS (cada una con su importe con signo y su tipo).
    const partidas = (Array.isArray(input.partidas) ? input.partidas : []).map((p) => {
      const importe = this._num(p && (p.importe != null ? p.importe : p.saldo)) || 0;
      const signo = this._signo(p);
      return {
        concepto: p && p.concepto != null ? String(p.concepto) : (p && p.tipo != null ? String(p.tipo) : null),
        tipo: p && p.tipo != null ? String(p.tipo) : null,
        importe: this._round(Math.abs(importe), 2),
        signo,
        efecto: this._round(signo * Math.abs(importe), 2),
        fecha: p && p.fecha != null ? String(p.fecha) : null
      };
    });

    const explicado = this._round(partidas.reduce((t, p) => t + p.efecto, 0), 2);
    const noExplicado = this._round(desfase - explicado, 2);
    const explica = Math.abs(noExplicado) <= EPSILON;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'partida-conciliatoria',
        cuenta: input.cuenta != null ? String(input.cuenta) : null,
        saldo_banco: saldoBanco,
        saldo_contable: saldoContable,
        fuente: fuente || null,
        desfase,
        partidas,
        total_partidas: partidas.length,
        desfase_explicado: explicado,
        no_explicado: explica ? 0 : noExplicado,
        explica_desfase: explica,
        convenio: 'desfase = saldo_banco - saldo_contable; partidas en transito lo EXPLICAN (no lo esconden)',
        determinista: true,
        abierto: {
          // El desfase que no cubre una partida declarada NO se esconde: se declara.
          no_explicado: explica ? null : `quedan ${noExplicado} sin explicar por ninguna partida declarada (no se reparte en una partida inventada)`,
          partidas: partidas.length ? null : 'no se declararon partidas en transito: el desfase completo queda sin explicar'
        }
      }
    };
  }

  _signo(p) {
    if (!p || typeof p !== 'object') return 1;
    if (p.signo != null) { const n = Number(p.signo); if (Number.isFinite(n) && n !== 0) return n > 0 ? 1 : -1; }
    const t = String(p.tipo || '').toLowerCase();
    if (t.includes('ingreso') || t.includes('abono') || t.includes('deposito') || t.includes('pendiente_abono')) return 1;
    if (t.includes('cheque') || t.includes('comision') || t.includes('cargo') || t.includes('gasto')) return -1;
    return 1;
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolDesfase(params) { return this._desfase(params); }
}

module.exports = PartidaConciliatoria;
