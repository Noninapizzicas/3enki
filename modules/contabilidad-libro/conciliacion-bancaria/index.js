/**
 * contabilidad-libro/conciliacion-bancaria — REFLEJO STATELESS (E1, hoja del plan).
 *
 * CRUCE extracto <-> libro por CLAVE NATURAL y reglas. Determinista: mismo extracto + mismo libro
 * → mismo cruce. EL JUICIO vive en E7/E8 (partida-no-identificada / regla-movimiento-bancario), NO
 * se duplica aqui: esta hoja EMPAREJA por clave natural (importe + fecha + referencia) y lo que no
 * empareja lo DECLARA — no lo imputa a ojo.
 *
 *   · cuando un par cuadra y la peticion declara el asiento propuesto, SUBE por EVENTO
 *     escritor-diario.asentar.request (B2, single-writer del libro);
 *   · lo que NO empareja se SUBE a partida-no-identificada.juzgar.request (E7, el juicio);
 *   · el desfase agregado se SUBE a partida-conciliatoria.desfase.request (E9, que lo explica).
 *
 * Honestidad (invariante 13): un movimiento sin contrapartida NO se casa con una inventada; queda
 * declarado en `sin_emparejar` y el cruce se declara PARCIAL.
 *
 * NO escribe, NO persiste. RPC cruzar es CLASE PREGUNTA → sin ui_handler.
 * Publica conciliacion-bancaria.cruzar.response y su par .failed.
 * Escucha contabilidad.asiento_asentado (B2 escritor-diario, emitido) y
 * contabilidad.movimiento_regla_declarada (E8 regla-movimiento-bancario, emitido).
 * Ver hoja E1 del plan-construccion y diseno-oop.md (CLASE ConciliacionBancaria).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ConciliacionBancaria extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'conciliacion-bancaria';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCruzarRequest(e) {
    return this._atender(e, 'cruzar', 'conciliacion-bancaria.cruzar.response', async (d) => {
      const res = this._cruzar(d);
      if (res.status !== 200) {
        this.eventBus?.publish('conciliacion-bancaria.cruzar.failed', res);
        return res;
      }
      // SUBE (best-effort) lo que NO empareja al juicio (E7) y el desfase a E9.
      for (const h of res.data.sin_emparejar) {
        this.eventBus?.publish('partida-no-identificada.juzgar.request', {
          project_id: res.data.project_id, movimiento: h, origen: 'conciliacion-bancaria', correlation_id: d.correlation_id
        });
      }
      this.eventBus?.publish('partida-conciliatoria.desfase.request', {
        project_id: res.data.project_id,
        saldo_banco: res.data.saldo_banco,
        saldo_contable: res.data.saldo_contable,
        desfase: res.data.desfase,
        correlation_id: d.correlation_id
      });
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): se observa el libro y las reglas del banco ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._libro = this._libro || [];
    if (d.asiento) this._libro.push(d.asiento);
    if (this._libro.length > 2000) this._libro.shift();
  }

  onMovimientoReglaDeclarada(e) {
    const d = (e && (e.data || e)) || {};
    this._reglas = this._reglas || [];
    if (d.regla) this._reglas.push(d.regla);
    if (this._reglas.length > 500) this._reglas.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // cruzar(extracto, libro) → { emparejados, sin_emparejar, desfase, cuadrado }
  // ══════════════════════════════════════════════════════════════════════
  _cruzar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const extracto = this._extracto(input);
    if (!extracto.length) {
      return {
        status: 200,
        data: {
          project_id: pid, tipo: 'conciliacion-bancaria',
          emparejados: [], sin_emparejar: [], num_emparejados: 0,
          desfase: null, cuadrado: null,
          abierto: { extracto: 'no se recibieron movimientos del extracto: no hay nada que cruzar (no se inventa)' }
        }
      };
    }

    const libro = this._libroDe(input);
    const usados = new Set();
    const emparejados = [];
    const sinEmparejar = [];

    for (const mov of extracto) {
      const clave = this._claveNatural(mov);
      // El cruce es por CLAVE NATURAL COMPARTIDA: mismo importe + fecha + referencia.
      const idx = libro.findIndex((l, i) => !usados.has(i) && this._claveNatural(l) === clave);
      if (idx >= 0) {
        usados.add(idx);
        emparejados.push({ clave, banco: mov, libro: libro[idx] });
      } else {
        // Sin contrapartida NO se casa con una inventada: se declara (el juicio es de E7/E8).
        sinEmparejar.push({ clave, movimiento: mov, motivo: 'sin contrapartida en el libro por clave natural' });
      }
    }

    const saldoBanco = this._saldoFinal(input, 'banco', extracto);
    const saldoContable = this._saldoFinal(input, 'contable', libro);
    const desfase = (saldoBanco !== null && saldoContable !== null) ? this._round(saldoBanco - saldoContable, 2) : null;
    const cuadrado = (sinEmparejar.length === 0 && desfase !== null) ? Math.abs(desfase) <= 0.005 : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'conciliacion-bancaria',
        emparejados,
        sin_emparejar: sinEmparejar,
        num_emparejados: emparejados.length,
        num_sin_emparejar: sinEmparejar.length,
        saldo_banco: saldoBanco,
        saldo_contable: saldoContable,
        desfase,
        cuadrado,
        // El JUICIO de lo no identificado es de E7/E8; aqui solo se EMPAREJA y se DECLARA.
        juicio_delegado: ['partida-no-identificada', 'regla-movimiento-bancario'],
        determinista: true,
        abierto: {
          libro: libro.length ? null : 'no se recibio el libro (ni declarado ni observado): solo se declaran los movimientos del extracto',
          desfase: desfase === null ? 'faltan saldos (banco y/o contable): el desfase no se calcula (dato ausente = desconocido)' : null
        }
      }
    };
  }

  // CLAVE NATURAL COMPARTIDA de un movimiento: canonica y determinista (no se adivina).
  _claveNatural(m) {
    const importe = this._round(this._num(m && (m.importe != null ? m.importe : m.cuota)), 2);
    const fecha = String((m && (m.fecha != null ? m.fecha : m.fecha_valor)) || '').slice(0, 10);
    const ref = String((m && (m.referencia != null ? m.referencia : (m.ref != null ? m.ref : (m.concepto || '')))) || '').trim().toLowerCase();
    return `${importe}|${fecha}|${ref}`;
  }

  _extracto(input) {
    if (Array.isArray(input.extracto)) return input.extracto;
    if (Array.isArray(input.movimientos)) return input.movimientos;
    return [];
  }

  _libroDe(input) {
    if (Array.isArray(input.libro)) return input.libro;
    if (Array.isArray(input.asientos)) return input.asientos;
    return Array.isArray(this._libro) ? this._libro : [];
  }

  _saldoFinal(input, lado, movs) {
    const declarado = lado === 'banco' ? input.saldo_banco : input.saldo_contable;
    if (declarado != null && Number.isFinite(Number(declarado))) return this._round(Number(declarado), 2);
    if (Array.isArray(movs) && movs.length) return this._round(movs.reduce((a, m) => a + this._num(m && (m.importe != null ? m.importe : m.saldo)), 0), 2);
    return null;
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolCruzar(params) { return this._cruzar(params); }
}

module.exports = ConciliacionBancaria;
