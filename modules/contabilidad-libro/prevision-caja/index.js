/**
 * contabilidad-libro/prevision-caja — REFLEJO STATELESS (E5, hoja del plan).
 *
 * PROYECTA ENTRADAS Y SALIDAS de caja a partir de los COMPROMISOS (vencimientos) y el SALDO
 * de tesoreria, aplicando la POLITICA DECLARADA. Determinista: misma lista de vencimientos +
 * mismo saldo + misma politica → misma serie.
 *
 * INVARIANTE 7 — NADA SE ESTIMA SIN BASE DECLARADA: la prevision solo suma lo que tiene fecha
 * de vencimiento CONOCIDA y una base declarada. Un vencimiento sin fecha (`[ABIERTO]`) NO se
 * coloca en ningun tramo: se declara aparte (`no_proyectables`) y no se rellena con una
 * suposicion. Si falta el saldo inicial, la serie se declara SIN base (`disponible:false`).
 *
 * DECLARA SUPUESTOS: todo supuesto que entra en la proyeccion viaja explicitamente en
 * `supuestos` (politica, horizonte, agrupacion, moneda) — nada queda implicito.
 *
 * Fuentes, todas POR EVENTO (nunca `require` cruzado):
 *   - `vencimiento-pago.calcular.request` (N6) por cada factura, o los vencimientos declarados.
 *   - `saldo-tesoreria.calcular.request` (E4) → el saldo inicial de la serie.
 *   - `regla-movimiento-bancario.aplicar.request` (E8) NO se usa aqui: el cierre por regla es E1.
 *
 * Invariantes:
 *  - Determinista y puro: NO escribe, NO persiste, NO muta.
 *  - La agrupacion de la serie (diaria/semanal/mensual) es DECLARABLE; sin declararla se usa
 *    la agrupacion por defecto declarada en `supuestos`.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja E5 del plan-construccion y diseno-oop.md (CLASE PrevisionCaja).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Agrupacion por defecto de la serie: DECLARADA como supuesto (no es una ley, es un default
// declarado y visible; el sitio puede declarar otra).
const AGRUPACION_DEFECTO = 'mensual';

class PrevisionCaja extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'prevision-caja';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onProyectarRequest(e) {
    return this._atender(e, 'proyectar', 'prevision-caja.proyectar.response', async (d) => {
      const res = await this._proyectar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: hay previsión con sus supuestos declarados. Lo LEEN
        // las cupulas de negocio / el aviso proactivo.
        for (const tramo of res.data.serie) {
          this.eventBus?.publish('contabilidad.vencimiento_proximo', {
            project_id: res.data.project_id,
            tramo,
            hasta: res.data.hasta,
            saldo_proyectado: tramo.saldo,
            supuestos: res.data.supuestos,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('prevision-caja.proyectar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion determinista: proyectar(hasta) → Serie<Cuantía> ──
  async _proyectar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const hasta = input.hasta != null ? String(input.hasta) : null;
    const agrupacion = input.agrupacion != null ? String(input.agrupacion).toLowerCase().trim() : AGRUPACION_DEFECTO;

    // 1) El SALDO inicial (E4) POR EVENTO. Sin saldo, la serie no tiene base: no se estima.
    const saldo_res = await this._rpc('saldo-tesoreria.calcular.request',
      { project_id: pid, cuenta: input.cuenta ?? null, fecha: input.desde ?? null }, { timeout_ms: 4000 });
    const saldo_data = saldo_res && saldo_res.data ? saldo_res.data : null;
    const saldo_inicial = saldo_data && typeof saldo_data.saldo_total === 'number' ? saldo_data.saldo_total : null;

    // 2) Los VENCIMIENTOS (compromisos): declarados en la peticion o calculados por N6.
    const vencimientos = await this._vencimientos(pid, input);

    // Supuestos: TODO lo que entra en la proyeccion, declarado explicitamente.
    const supuestos = {
      agrupacion,
      hasta,
      cuenta: input.cuenta != null ? String(input.cuenta) : 'todas',
      politica: input.politica && typeof input.politica === 'object' ? input.politica : null,
      saldo_inicial_fuente: saldo_data ? 'saldo-tesoreria' : null,
      solo_vencimientos_con_fecha: true     // invariante 7: nada se estima sin base declarada
    };

    // Sin saldo base: la serie se declara vacia y sin base (nada se estima).
    if (saldo_inicial === null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          hasta,
          agrupacion,
          disponible: false,
          supuestos,
          saldo_inicial: null,
          serie: [],
          no_proyectables: vencimientos.filter(v => !this._fechaDe(v)),
          motivo: 'no hay saldo de tesoreria (E4) disponible: la prevision no se estima sin base declarada'
        }
      };
    }

    // 3) Solo lo que tiene fecha conocida se coloca en un tramo; lo demas se declara aparte.
    const proyectables = [];
    const no_proyectables = [];
    for (const v of vencimientos) {
      const fecha = this._fechaDe(v);
      if (!fecha) { no_proyectables.push({ vencimiento: v, motivo: 'sin fecha de vencimiento declarada: [ABIERTO]' }); continue; }
      if (hasta && fecha > hasta) continue;    // fuera del horizonte declarado
      const importe = this._num(v.importe);
      if (importe === null) { no_proyectables.push({ vencimiento: v, motivo: 'sin importe declarado' }); continue; }
      // El SIGNO de la entrada/salida sale del LADO declarado del vencimiento (dato, no constante).
      const lado = v.lado != null ? String(v.lado).toLowerCase().trim() : null;
      const signo = lado === 'cobro' ? 1 : (lado === 'pago' ? -1 : 0);
      if (signo === 0) { no_proyectables.push({ vencimiento: v, motivo: 'sin lado (pago/cobro) declarado: no se sabe si entra o sale' }); continue; }
      proyectables.push({ fecha, importe, signo, clave: v.clave_natural != null ? String(v.clave_natural) : null, lado });
    }

    // 4) Agrupacion determinista de la serie por la clave de tramo declarada.
    const tramos = new Map();
    for (const p of proyectables) {
      const clave_tramo = this._tramo(p.fecha, agrupacion);
      let t = tramos.get(clave_tramo);
      if (!t) { t = { tramo: clave_tramo, entradas: 0, salidas: 0 }; tramos.set(clave_tramo, t); }
      const valor = this._round(p.importe, 2);
      if (p.signo > 0) t.entradas = this._round(t.entradas + valor, 2);
      else t.salidas = this._round(t.salidas + valor, 2);
    }

    // Serie ordenada (determinista) con el saldo proyectado acumulado.
    const serie = [...tramos.values()]
      .sort((a, b) => a.tramo.localeCompare(b.tramo))
      .map(t => {
        const neto = this._round(t.entradas - t.salidas, 2);
        const tramo = { tramo: t.tramo, entradas: t.entradas, salidas: t.salidas, neto, saldo: null };
        return { ...tramo, _neto: neto };
      })
      .reduce((acc, t) => {
        const anterior = acc.length ? acc[acc.length - 1].saldo : saldo_inicial;
        const saldo = this._round(anterior + t._neto, 2);
        acc.push({ tramo: t.tramo, entradas: t.entradas, salidas: t.salidas, neto: t._neto, saldo });
        return acc;
      }, []);

    return {
      status: 200,
      data: {
        project_id: pid,
        hasta,
        agrupacion,
        disponible: true,
        supuestos,
        saldo_inicial,
        saldo_final: serie.length ? serie[serie.length - 1].saldo : saldo_inicial,
        num_tramos: serie.length,
        serie,
        no_proyectables,
        // Se declara que lo no proyectable NO se ha estimado (invariante 7).
        completo: no_proyectables.length === 0
      }
    };
  }

  // Los vencimientos: declarados o calculados por N6 (vencimiento-pago) POR EVENTO.
  async _vencimientos(pid, input) {
    if (Array.isArray(input.vencimientos)) return input.vencimientos;
    if (!Array.isArray(input.facturas)) return [];
    const out = [];
    for (const f of input.facturas) {
      const r = await this._rpc('vencimiento-pago.calcular.request',
        { project_id: pid, factura: f, lado: input.lado ?? null, politica: input.politica ?? null, hoy: input.desde ?? null },
        { timeout_ms: 4000 });
      const v = r && r.data && r.data.vencimiento ? r.data.vencimiento : null;
      if (v) out.push(v);
    }
    return out;
  }

  _fechaDe(v) {
    const f = v && (v.fecha_vencimiento != null ? v.fecha_vencimiento : v.fecha);
    if (f === undefined || f === null || f === '') return null;
    const t = Date.parse(String(f));
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }

  // Clave de tramo segun la agrupacion declarada (determinista).
  _tramo(fecha_iso, agrupacion) {
    const s = String(fecha_iso).slice(0, 10);
    if (agrupacion === 'diaria') return s;
    if (agrupacion === 'anual') return s.slice(0, 4);
    if (agrupacion === 'semanal') {
      const t = Date.parse(s);
      const d = new Date(t);
      const dow = (d.getUTCDay() + 6) % 7;               // lunes = 0
      const lunes = new Date(t - dow * 86400000);
      return lunes.toISOString().slice(0, 10);
    }
    return s.slice(0, 7);                                // mensual (defecto declarado)
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.abs(n) : null;
  }

  // ── Tools ──
  toolProyectar(params) { return this._proyectar(params); }
}

module.exports = PrevisionCaja;
