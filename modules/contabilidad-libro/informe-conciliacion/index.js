/**
 * contabilidad-libro/informe-conciliacion — REFLEJO STATELESS (E10, hoja del plan).
 *
 * El DOCUMENTO DE CUADRE entre el SALDO BANCO y el SALDO CONTABLE AJUSTADO por las
 * partidas conciliatorias. Es LA PRUEBA de que cuadra:
 *
 *   saldo_contable_ajustado = saldo_contable + Σ partidas conciliatorias
 *   cuadra                  = saldo_banco == saldo_contable_ajustado
 *
 * Depende de `conciliacion-bancaria` (E1) y `partida-conciliatoria` (E8) por EVENTO:
 * les SUBE `conciliacion-bancaria.cruzar.request` y `partida-conciliatoria.desfase.request`
 * (aqui NO se concilia ni se calcula el desfase: se COMPONE el informe).
 *
 * Invariante (honestidad, invariante 13): el cuadre SOLO se afirma si estan los dos
 * lados (saldo del banco y saldo contable). Si falta cualquiera → `cuadra: null` y un
 * `abierto` explicito (dato ausente = desconocido). Jamas se finge que cuadra.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (componer) → sin ui_handler.
 * Ver hoja E10 del plan-construccion y diseno-oop.md (CLASE InformeConciliacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const EPSILON = 0.005;

class InformeConciliacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'informe-conciliacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onComponerRequest(e) {
    return this._atender(e, 'componer', 'informe-conciliacion.componer.response', async (d) => {
      const res = await this._componer(d);
      // Reflejo: compone; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('informe-conciliacion.componer.failed', res);
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
  // componer(input) → { saldo_banco, partidas, saldo_contable_ajustado, cuadra }
  // ══════════════════════════════════════════════════════════════════════
  async _componer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Lado BANCO: declarado, o subido a conciliacion-bancaria (E1).
    const banco = await this._ladoBanco(input);
    // Lado CONTABLE: declarado, o subido a partida-conciliatoria (E8) como el ajuste.
    const contable = await this._ladoContable(input);

    const saldo_banco = banco.saldo != null ? this._num(banco.saldo) : null;
    const saldo_contable = contable.saldo != null ? this._num(contable.saldo) : null;
    const partidas = Array.isArray(contable.partidas) ? contable.partidas : [];

    // El ajuste: suma de las partidas conciliatorias (importe firmado).
    let ajuste = 0;
    const detalle = [];
    for (const p of partidas) {
      const importe = this._num(p && (p.importe != null ? p.importe : (Number(p.debe || 0) - Number(p.haber || 0))));
      ajuste += importe;
      detalle.push({ partida_id: (p && p.partida_id) || null, concepto: (p && p.concepto) || null, importe: this._round(importe, 2) });
    }
    ajuste = this._round(ajuste, 2);

    const saldo_contable_ajustado = saldo_contable == null ? null : this._round(saldo_contable + ajuste, 2);

    // El cuadre SOLO se afirma con los dos lados. Sin uno de ellos, no hay prueba.
    const verificable = saldo_banco != null && saldo_contable_ajustado != null;
    const diferencia = verificable ? this._round(saldo_banco - saldo_contable_ajustado, 2) : null;
    const cuadra = verificable ? Math.abs(diferencia) <= EPSILON : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'informe-conciliacion',
        cuenta: input.cuenta != null ? input.cuenta : null,
        fecha: input.fecha != null ? input.fecha : null,
        fuente: { banco: banco.fuente || null, contable: contable.fuente || null },
        saldo_banco,
        saldo_contable,
        partidas: detalle,
        ajuste,
        saldo_contable_ajustado,
        diferencia,
        cuadra,
        verificable,
        invariante: 'SALDO_BANCO = SALDO_CONTABLE + Σ partidas conciliatorias (saldo contable ajustado)',
        abierto: {
          banco: saldo_banco == null ? 'falta el saldo del banco: el cuadre no se afirma' : null,
          contable: saldo_contable == null ? 'falta el saldo contable: el cuadre no se afirma' : null
        }
      }
    };
  }

  // Lado BANCO: declarado, o subido a conciliacion-bancaria (E1). No se inventa.
  async _ladoBanco(input) {
    if (input.saldo_banco != null) return { saldo: input.saldo_banco, fuente: 'declarado' };
    const resp = await this._rpc('conciliacion-bancaria.cruzar.request', {
      project_id: input.project_id || this.project_id, cuenta: input.cuenta, fecha: input.fecha
    }, { timeout_ms: 800 });
    const d = (resp && (resp.data || resp)) || null;
    if (d && d.saldo_banco != null) return { saldo: d.saldo_banco, fuente: 'conciliacion-bancaria' };
    return { saldo: null, fuente: null };
  }

  // Lado CONTABLE: declarado, o subido a partida-conciliatoria (E8) — que devuelve el
  // saldo contable y las partidas de desfase. No se inventa.
  async _ladoContable(input) {
    if (input.saldo_contable != null || Array.isArray(input.partidas)) {
      return { saldo: input.saldo_contable != null ? input.saldo_contable : null, partidas: input.partidas || [], fuente: 'declarado' };
    }
    const resp = await this._rpc('partida-conciliatoria.desfase.request', {
      project_id: input.project_id || this.project_id, cuenta: input.cuenta, fecha: input.fecha
    }, { timeout_ms: 800 });
    const d = (resp && (resp.data || resp)) || null;
    if (!d) return { saldo: null, partidas: [], fuente: null };
    return {
      saldo: d.saldo_contable != null ? d.saldo_contable : null,
      partidas: Array.isArray(d.partidas) ? d.partidas : [],
      fuente: 'partida-conciliatoria'
    };
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolComponer(params) { return this._componer(params); }
}

module.exports = InformeConciliacion;
