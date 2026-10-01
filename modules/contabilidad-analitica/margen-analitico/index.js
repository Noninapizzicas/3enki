/**
 * contabilidad-analitica/margen-analitico — REFLEJO STATELESS (J2, hoja del plan).
 *
 * MARGEN ANALITICO: INGRESO − COSTE IMPUTADO, por DIMENSION (linea de negocio, producto,
 * centro...). Determinista: mismos saldos + mismos costes → mismo margen.
 *
 * No calcula las cifras por su cuenta: RECIBE los saldos y los costes (declarados) o los
 * sube por EVENTO a quien le toca — `mayor-balanza.saldos.request` (B6, los ingresos),
 * `valoracion-existencia.valorar.request` (H1, el coste de las existencias) y
 * `coste-indirecto.repartir.request` (K1, el reparto de indirectos). Esta hoja solo
 * AGREGA y REPARTA por dimension, y declara lo que no puede imputar.
 *
 * Honestidad (invariante 13): un ingreso/coste sin dimension declarada NO se reparte a
 * ojo: queda en `sin_dimension` y se declara. Sin datos, el margen de la dimension es
 * `null`, no 0.
 *
 * ESCUCHA (R3): el plan declara la escucha de `contabilidad.asiento_asentado` (B2
 * escritor-diario, emitido) y `contabilidad.ejercicio_cerrado` (la analitica de cierre
 * corresponde al ejercicio cerrado). El emisor de este ultimo (`cierre-ejercicio`, C4)
 * aun NO existe, asi que esa escucha NO se declara (R3: nadie la emite todavia). Se
 * declarara cuando su emisor exista.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA (calcular) → sin ui_handler.
 * Ver hoja J2 del plan-construccion y diseno-oop.md (CLASE MargenAnalitico).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class MargenAnalitico extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'margen-analitico';
    this.version = 'reflejo-0.1.0';
    // Derivado en memoria: project_id -> [asientos observados]
    this._vistos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'margen-analitico.calcular.response', async (d) => {
      const res = await this._calcular(d);
      // Reflejo: agrega; no escribe → no hay hecho de dominio que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('margen-analitico.calcular.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): el libro cambio → se observa ──
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
  // calcular(movimientos) → margen por dimension = ingreso − coste imputado
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { movimientos, fuente } = await this._movimientosDe(input);

    const porDim = new Map();
    let ingresoTotal = 0, costeTotal = 0, sinDimension = 0;

    for (const m of movimientos) {
      const importe = this._num(m && (m.importe != null ? m.importe : (m.saldo != null ? m.saldo : (Number(m.debe || 0) - Number(m.haber || 0)))));
      if (importe == null) continue;
      const tipo = this._tipo(m);                       // 'ingreso' | 'coste'
      const dim = this._dimension(m);
      if (!dim) { sinDimension++; continue; }            // sin dimension no se imputa a ojo
      let acc = porDim.get(dim);
      if (!acc) { acc = { dimension: dim, ingreso: 0, coste: 0 }; porDim.set(dim, acc); }
      if (tipo === 'coste') { acc.coste += Math.abs(importe); costeTotal += Math.abs(importe); }
      else { acc.ingreso += Math.abs(importe); ingresoTotal += Math.abs(importe); }
    }

    const margenes = [...porDim.values()].map((a) => {
      const ingreso = this._round(a.ingreso, 2);
      const coste = this._round(a.coste, 2);
      const margen = this._round(ingreso - coste, 2);
      return {
        dimension: a.dimension,
        ingreso,
        coste,
        margen,
        margen_pct: ingreso > 0 ? this._round((margen / ingreso) * 100, 2) : null
      };
    }).sort((a, b) => a.dimension.localeCompare(b.dimension));

    const ingresoR = this._round(ingresoTotal, 2);
    const costeR = this._round(costeTotal, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'margen-analitico',
        fuente: fuente || null,
        ingreso: ingresoR,
        coste: costeR,
        margen: this._round(ingresoR - costeR, 2),
        margen_pct: ingresoR > 0 ? this._round(((ingresoR - costeR) / ingresoR) * 100, 2) : null,
        margenes,
        total_dimensiones: margenes.length,
        movimientos_imputados: movimientos.length - sinDimension,
        formula: 'INGRESO - COSTE_IMPUTADO',
        determinista: true,
        abierto: {
          fuente: movimientos.length ? null : 'no se recibieron movimientos (ni declarados ni de mayor-balanza): el margen no se inventa',
          sin_dimension: sinDimension ? `${sinDimension} movimiento(s) sin dimension declarada: no se reparten a ojo` : null
        }
      }
    };
  }

  // Trae los movimientos: declarados en el input, o compuestos por EVENTO de las fuentes
  // del plan (mayor-balanza, valoracion-existencia, coste-indirecto).
  async _movimientosDe(input) {
    if (Array.isArray(input.movimientos)) return { movimientos: input.movimientos, fuente: 'declarado' };
    if (Array.isArray(input.saldos)) return { movimientos: input.saldos, fuente: 'declarado' };

    const pid = input.project_id || this.project_id;
    const out = [];

    const saldos = await this._rpc('mayor-balanza.saldos.request', {
      project_id: pid, fecha: input.fecha, ejercicio: input.ejercicio
    }, { timeout_ms: 800 });
    if (saldos && Array.isArray(saldos.saldos)) out.push(...saldos.saldos);

    if (Array.isArray(input.existencias)) {
      const val = await this._rpc('valoracion-existencia.valorar.request', {
        project_id: pid, existencias: input.existencias, metodo: input.metodo
      }, { timeout_ms: 3000 });
      const v = val && (val.data || val);
      if (v && Array.isArray(v.lineas)) {
        for (const l of v.lineas) out.push({ dimension: l.dimension || l.articulo, importe: l.valor, tipo: 'coste' });
      }
    }

    const indirectos = await this._rpc('coste-indirecto.repartir.request', {
      project_id: pid, costes: input.costes, criterio: input.criterio, ejercicio: input.ejercicio
    }, { timeout_ms: 800 });
    if (indirectos && Array.isArray(indirectos.reparto)) out.push(...indirectos.reparto);

    return { movimientos: out, fuente: out.length ? 'fuentes_evento' : null };
  }

  _tipo(m) {
    if (!m || typeof m !== 'object') return 'ingreso';
    if (m.tipo != null) {
      const t = String(m.tipo).toLowerCase();
      if (t.includes('ingres') || t === 'venta') return 'ingreso';
      if (t.includes('cost') || t.includes('gast')) return 'coste';
    }
    const c = m.cuenta != null ? String(m.cuenta) : '';
    if (c[0] === '7') return 'ingreso';
    if (c[0] === '6') return 'coste';
    return m.masa ? (String(m.masa).toLowerCase() === 'ingreso' ? 'ingreso' : 'coste') : 'ingreso';
  }

  _dimension(m) {
    if (!m || typeof m !== 'object') return null;
    for (const k of ['dimension', 'linea', 'centro', 'proyecto', 'producto', 'articulo']) {
      if (m[k] != null && String(m[k]).trim() !== '') return String(m[k]).trim();
    }
    return null;
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = MargenAnalitico;
