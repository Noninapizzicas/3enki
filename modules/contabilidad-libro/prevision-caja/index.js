/**
 * contabilidad-libro/prevision-caja — REFLEJO STATELESS (E5, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * PROYECTA entradas/salidas desde los COMPROMISOS con la POLITICA DECLARADA. Determinista.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * No inventa el saldo inicial (eso es saldo-tesoreria) ni la politica (eso es una
 * declaracion de criterio): RECIBE el saldo y los compromisos, aplica la politica
 * declarada y proyecta el saldo periodo a periodo.
 *
 * Honestidad (invariante 13): con los COMPROMISOS NO declarados, la prevision NO se
 * inventa: se declara ABIERTO. Un compromiso sin fecha NO se coloca en un periodo
 * inventado — se lista aparte en `abierto.compromisos_sin_fecha`.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (proyectar) → sin ui_handler.
 * Ver hoja E5 del plan-construccion y diseno-oop.md (CLASE PrevisionCaja).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PrevisionCaja extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'prevision-caja';
    this.version = 'reflejo-0.1.0';
    // Politica/saldo observados por proyecto (memoria acotada, no store).
    this._obs = new Map(); // project_id -> { politica, saldo }
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onProyectarRequest(e) {
    return this._atender(e, 'proyectar', 'prevision-caja.proyectar.response', async (d) => {
      const res = await this._proyectar(d);
      if (res.status !== 200) this.eventBus?.publish('prevision-caja.proyectar.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): se fijo un criterio → hay politica declarada ──
  onCriterioFijado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    const o = this._obs.get(pid) || {};
    if (d.politica_caja != null || d.criterio != null || d.politica != null) {
      o.politica = d.politica_caja || d.criterio || d.politica;
    }
    this._obs.set(pid, o);
  }

  // ── handler de dominio (fire-and-forget): el libro cambio → se observa (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    if (d.asiento) {
      this._vistos = this._vistos || new Map();
      const pid = d.project_id || this.project_id || '_';
      const lista = this._vistos.get(pid) || [];
      lista.push(d.asiento);
      if (lista.length > 1000) lista.shift();
      this._vistos.set(pid, lista);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // _proyectar(input) → { status, data }  ·  saldo proyectado periodo a periodo
  // ══════════════════════════════════════════════════════════════════════
  async _proyectar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const obs = this._obs.get(pid) || {};

    // El SALDO inicial: declarado, o subido por EVENTO a saldo-tesoreria (best-effort).
    let saldo = this._num(input.saldo_inicial ?? input.saldo);
    let fuente_saldo = saldo != null ? 'declarado' : null;
    if (saldo == null) {
      const r = await this._rpc('saldo-tesoreria.calcular.request', { project_id: pid }, { timeout_ms: 800 });
      const v = r && this._num(r.saldo ?? r.importe);
      if (v != null) { saldo = v; fuente_saldo = 'saldo-tesoreria'; }
    }

    // Los COMPROMISOS: lo declarado (o vacio). Sin compromisos NO hay prevision.
    const compromisos = Array.isArray(input.compromisos) ? input.compromisos
      : (Array.isArray(input.movimientos) ? input.movimientos : null);
    if (compromisos == null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'prevision-caja',
          periodos: [],
          saldo_inicial: saldo != null ? saldo : null,
          senal_presente: false,
          abierto: {
            compromisos: 'no se declararon compromisos: la prevision no se inventa (nada que proyectar)',
            politica: this._politica(input, obs) ? null : 'no se declaro politica de caja'
          }
        }
      };
    }

    const politica = this._politica(input, obs);
    const periodos = this._periodos(compromisos, politica);

    // Proyeccion determinista: saldo acumulado periodo a periodo.
    let acumulado = saldo != null ? saldo : 0;
    const filas = [];
    for (const p of periodos) {
      const inicio = acumulado;
      acumulado = this._round(acumulado + p.entradas - p.salidas, 2);
      filas.push({ ...p, saldo_inicio: this._round(inicio, 2), saldo_fin: acumulado });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'prevision-caja',
        saldo_inicial: saldo != null ? saldo : null,
        fuente_saldo: fuente_saldo,
        politica: politica || null,
        periodos: filas,
        saldo_final: this._round(acumulado, 2),
        total_entradas: this._round(filas.reduce((a, f) => a + f.entradas, 0), 2),
        total_salidas: this._round(filas.reduce((a, f) => a + f.salidas, 0), 2),
        determinista: true,
        abierto: {
          saldo_inicial: saldo != null ? null : 'no llego el saldo inicial (ni declarado ni de saldo-tesoreria): la proyeccion arranca de 0 y se declara',
          politica: politica ? null : 'no se declaro politica de caja: se proyecta sin ella (no se inventa)',
          compromisos_sin_fecha: this._sinFecha(compromisos, politica)
        }
      }
    };
  }

  // Politica de caja: declarada en el input, o el criterio observado. Sin default oculto.
  _politica(input, obs) {
    if (input.politica_caja != null) return input.politica_caja;
    if (input.politica != null) return input.politica;
    if (input.dias_pago != null || input.dias_cobro != null) {
      return { dias_pago: input.dias_pago ?? null, dias_cobro: input.dias_cobro ?? null };
    }
    if (obs.politica != null) return obs.politica;
    return null;
  }

  // Agrupa los compromisos por periodo. Sin fecha → NO se coloca (se declara aparte).
  _periodos(compromisos, politica) {
    const mapa = new Map();
    for (const c of compromisos) {
      if (!c || typeof c !== 'object') continue;
      const fecha = c.fecha_proyectada ?? c.fecha ?? (c.vencimiento != null ? c.vencimiento : null);
      if (!fecha) continue; // sin fecha no se inventa el periodo
      const periodo = String(fecha).slice(0, 7); // YYYY-MM
      const importe = this._num(c.importe ?? c.total) || 0;
      const esEntrada = c.tipo === 'entrada' || c.signo === '+' || (c.importe != null && Number(c.importe) > 0 && c.tipo !== 'salida');
      const fila = mapa.get(periodo) || { periodo, entradas: 0, salidas: 0, compromisos: 0 };
      if (esEntrada) fila.entradas = this._round(fila.entradas + Math.abs(importe), 2);
      else fila.salidas = this._round(fila.salidas + Math.abs(importe), 2);
      fila.compromisos++;
      mapa.set(periodo, fila);
    }
    return [...mapa.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  }

  // Los compromisos SIN fecha declarada: se listan, no se colocan en un periodo inventado.
  _sinFecha(compromisos, politica) {
    const sin = compromisos.filter((c) => c && typeof c === 'object' &&
      (c.fecha_proyectada ?? c.fecha ?? c.vencimiento) == null);
    return sin.length ? `${sin.length} compromiso(s) sin fecha: no se colocan en un periodo inventado` : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolProyectar(params) { return this._proyectar(params); }
}

module.exports = PrevisionCaja;
