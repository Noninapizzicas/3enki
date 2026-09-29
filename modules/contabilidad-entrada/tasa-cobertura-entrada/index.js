/**
 * contabilidad-entrada/tasa-cobertura-entrada — REFLEJO STATELESS (P4, hoja del plan).
 *
 * La PROPORCION de hechos que entran SIN intervencion vs los que CAEN A COLA. Es la prueba de
 * la promesa del dueno: "sin una persona digitando".
 *
 * ⚠️ LEE LA METRICA UNICA, NO LA RECALCULA. La cobertura la produce `completitud-cobertura` (A12)
 * y la declara en `contabilidad.cobertura_medida`. Aqui NO se vuelve a medir la cobertura: se TOMA
 * la tasa ya medida (declarada en la peticion o pedida POR EVENTO a su dueno) y se PRESENTA para
 * la ENTRADA. Recalcularla seria crear una SEGUNDA metrica de cobertura — la invariante lo prohibe.
 *
 * ATRIBUTOS del diseno: `cobertura:Cobertura`.
 *   METODOS: calcular():Ratio.
 *   REGLA: proporcion de hechos que entran SIN intervencion vs caen a cola. LEE la metrica unica.
 *
 * Invariantes:
 *  - LEE, NO RECALCULA: la tasa de cobertura llega declarada o de su dueno (A12) POR EVENTO; aqui
 *    jamas se recomputa desde esperados/llegados.
 *  - Lo que SI computa esta hoja es su PROPIO ratio de entrada: hechos sin intervencion (procesados
 *    solos, con la intervencion declarada `0`) sobre el total. Es la operacion de la clase P4, no la
 *    metrica unica.
 *  - DETERMINISTA: mismas cuentas → mismo ratio.
 *  - Dato ausente = desconocido: sin total (o sin las cuentas de intervencion) el ratio es `null`,
 *    no un 0 que afirme una medida que no se hizo.
 *  - NO escribe, NO persiste.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja P4 del plan-construccion y diseno-oop.md (CLASE TasaCoberturaEntrada).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class TasaCoberturaEntrada extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'tasa-cobertura-entrada';
    this.version = 'reflejo-0.1.0';
    // ULTIMA metrica unica de cobertura OBSERVADA (por evento de dominio). Es una LECTURA
    // cacheada, no un recalculo: las demas piezas la LEEN, no la producen aqui.
    this._cobertura = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'tasa-cobertura-entrada.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('tasa-cobertura-entrada.calcular.failed', res);
      return res;
    });
  }

  // ── Fire-and-forget: LA metrica unica (A12) quedo medida → se LEE y se guarda para presentar ──
  onCoberturaMedida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    this._cobertura.set(d.project_id, d.cobertura || null);
    return { status: 200, data: { project_id: d.project_id, leida: 'contabilidad.cobertura_medida' } };
  }

  // ── proyeccion determinista: calcular() → Ratio (LEE la metrica unica; no la recalcula) ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // 1) LA METRICA UNICA (A12): declarada, o LEIDA (de lo emitido o pedida a su dueno POR EVENTO).
    //    ⚠️ No se recalcula: se TOMA tal cual la produjo `completitud-cobertura`.
    const cobertura = await this._leerCobertura(pid, input);

    // 2) Las CUENTAS de intervencion de la entrada: cuantos hechos entraron SIN intervencion y
    //    cuantos cayeron a cola. Es el ratio PROPIO de P4 (la prueba de "sin una persona digitando").
    const sin_intervencion = this._num(input.sin_intervencion != null ? input.sin_intervencion : input.automaticos);
    const con_intervencion = this._num(input.con_intervencion != null ? input.con_intervencion : input.a_cola);
    const total = this._num(input.total);

    const totalEfectivo = total !== null ? total
      : (sin_intervencion !== null && con_intervencion !== null ? sin_intervencion + con_intervencion : null);

    // Sin total (ni las dos cuentas) no hay ratio: null, jamas un 0 inventado.
    if (totalEfectivo === null || totalEfectivo === 0) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tasa_entrada: null,
          ratio: null,
          cobertura_leida: cobertura,
          lee_metrica_unica: true,
          recalcula_cobertura: false,
          abierto: true,
          faltan: totalEfectivo === null ? ['total|sin_intervencion+con_intervencion'] : [],
          motivo: totalEfectivo === null
            ? 'no hay cuenta de hechos de entrada: el ratio es desconocido (no se afirma un 0)'
            : 'el total es 0: no hay proporcion que calcular'
        }
      };
    }

    const tasa = this._round(sin_intervencion / totalEfectivo, 4);
    return {
      status: 200,
      data: {
        project_id: pid,
        // El RATIO de la entrada (P4): hechos que entran sin intervencion / total.
        tasa_entrada: tasa,
        ratio: tasa,
        sin_intervencion,
        con_intervencion,
        total: totalEfectivo,
        // La proporcion que la promesa exige: cuanto entra SIN una persona digitando.
        cumple_promesa: tasa >= 1,
        // La metrica unica de cobertura (A12) se LEE y se adjunta; NO se recalcula aqui.
        cobertura_leida: cobertura,
        lee_metrica_unica: true,
        recalcula_cobertura: false,
        abierto: {
          sin_intervencion: sin_intervencion === null ? 'no se declaro cuantos hechos entraron sin intervencion' : null,
          con_intervencion: con_intervencion === null ? 'no se declaro cuantos hechos cayeron a cola' : null,
          cobertura: cobertura ? null : 'completitud-cobertura (A12) no respondio: la metrica unica se declara ausente, no se recalcula'
        },
        faltan: [
          ...(sin_intervencion === null ? ['sin_intervencion'] : []),
          ...(con_intervencion === null ? ['con_intervencion'] : [])
        ]
      }
    };
  }

  // Lee LA metrica unica: declarada en la peticion, la ultima observada, o pedida a A12 POR EVENTO.
  async _leerCobertura(pid, input = {}) {
    if (input.cobertura && typeof input.cobertura === 'object') return input.cobertura;
    const cache = this._cobertura.get(pid);
    if (cache) return cache;
    const r = await this._rpc('completitud-cobertura.medir.request',
      { project_id: pid, vertical: input.vertical }, { timeout_ms: 4000 }).catch(() => null);
    const data = r && r.data ? r.data : null;
    return data && data.cobertura ? data.cobertura : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = TasaCoberturaEntrada;
