/**
 * contabilidad-analitica/margen-analitico — REFLEJO STATELESS (J2, hoja del plan).
 *
 * EL MARGEN POR DIMENSION: ingreso − coste imputado, agrupado por la DIMENSION analitica
 * (centro, linea, producto). Determinista: las mismas lineas etiquetadas + el mismo eje →
 * el mismo margen, una sola respuesta correcta. No es un juicio.
 *
 * ATRIBUTOS del diseno: `ingresos`, `costes:Flujo<Cuantía>`.
 *   METODOS: calcular(dimension, periodo):Cuantía.
 *   REGLA: ingreso − coste imputado por dimension. Determinista.
 *
 * LAS LINEAS SON DATO ETIQUETADO: la magnitud de cada linea (importe, tipo ingreso/coste) y su
 * dimension llegan DECLARADAS en la peticion — el fruto del etiquetado que PROPONE J1
 * (`etiquetado-analitico`, que jamas escribe) o las lineas ya declaradas por el negocio. El
 * reflejo NUNCA cablea una regla de negocio: aqui solo se AGRUPA y se RESTA. Cero constantes.
 *
 * EL EJE ES DECLARABLE: la dimension por la que se corta (centro | linea | producto | cualquier
 * eje declarado) entra como DATO (`eje`). Si una linea trae varios campos de dimension y no hay
 * eje declarado, el corte seria una adivinanza → la linea se declara AMBIGUA y queda fuera del
 * margen (nada se estima). Del mismo modo, una linea SIN dimension no se asigna a ninguna cubeta:
 * se declara en `sin_dimension` y el margen se marca `[ABIERTO]` con lo que falta.
 *
 * EL CATALOGO DE DIMENSIONES ES DECLARABLE: las dimensiones validas se declaran en la peticion o
 * se piden a `cola-declaraciones-criterio` (K9) POR EVENTO (best-effort). Una linea cuya dimension
 * no esta en el catalogo declarado se declara en `no_declaradas` (se ve, no se oculta) — nunca se
 * descarta en silencio ni se le inventa un centro.
 *
 * Invariantes:
 *  - DETERMINISTA: mismas lineas + mismo eje → mismo margen (una sola respuesta).
 *  - Dato ausente = desconocido: sin lineas → `margen:null`, `abierto:true` (un flujo vacio NO es
 *    margen 0). Sin importe numerico, la linea se declara y no suma.
 *  - LEY/PARAMETRO COMO DATO: el eje y el catalogo de dimensiones son entrada; cero constantes.
 *  - NO escribe, NO persiste: el margen es DERIVADO; el asiento y la imputacion son de otros.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja J2 del plan-construccion y diseno-oop.md (CLASE MargenAnalitico).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Los tres ejes de dimension que la analitica nombra (solo los NOMBRES del molde: cero valores).
const EJES_CONOCIDOS = ['centro', 'linea', 'producto'];

class MargenAnalitico extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'margen-analitico';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'margen-analitico.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('margen-analitico.calcular.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: calcular(dimension, periodo) → Cuantía ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');
    const periodo = input.periodo != null ? String(input.periodo) : null;

    // 1) El CATALOGO de dimensiones: declarado, o pedido a la cola K9 POR EVENTO (best-effort).
    const { dimensiones, fuente_dimensiones } = await this._dimensiones(pid, input);

    // 2) El EJE del corte: declarable. Sin eje y con varias dimensiones en la linea → ambigua.
    const eje = this._eje(input);

    // 3) Las LINEAS etiquetadas: ingresos y costes imputados (dato declarado).
    const lineas = this._lineas(input);

    if (lineas.length === 0) {
      return {
        status: 200,
        data: {
          project_id: pid, periodo, eje, fuente_dimensiones,
          margen_total: null, ingresos_total: null, costes_total: null,
          por_dimension: [], sin_dimension: [], no_declaradas: [], ambiguas: [],
          abierto: true, faltan: ['lineas'],
          motivo: 'no hay lineas etiquetadas declaradas: no se deriva margen (un flujo vacio no es margen 0)'
        }
      };
    }

    // 4) AGRUPACION determinista por dimension + resta ingreso − coste. Nada se estima.
    const cubetas = new Map();       // clave → { dimension, ingresos, costes, n_lineas }
    const sin_dimension = [];
    const no_declaradas = [];
    const ambiguas = [];
    const catalogo = new Set(dimensiones.map(d => d.clave));

    for (const l of lineas) {
      const imp = this._num(l.importe);
      if (imp === null) { sin_dimension.push({ motivo: 'importe no numerico', ...this._resumenLinea(l) }); continue; }
      // Sin tipo declarado NO se adivina si la linea suma o resta: queda declarada y no entra.
      if (l.tipo !== 'INGRESO' && l.tipo !== 'COSTE') {
        sin_dimension.push({ motivo: 'tipo (INGRESO|COSTE) no declarado', ...this._resumenLinea(l) });
        continue;
      }

      const corte = this._corteDe(l, eje);
      if (corte === null) {
        // Sin dimension O con varias dimensiones y sin eje declarado: NO se adivina la cubeta.
        if (this._tieneDimension(l)) ambiguas.push(this._resumenLinea(l));
        else sin_dimension.push(this._resumenLinea(l));
        continue;
      }
      if (catalogo.size > 0 && !catalogo.has(corte)) {
        // Dimension fuera del catalogo DECLARADO: se declara, no se descarta en silencio.
        no_declaradas.push({ dimension: corte, ...this._resumenLinea(l) });
        continue;
      }

      let c = cubetas.get(corte);
      if (!c) { c = { dimension: corte, ingresos: 0, costes: 0, n_lineas: 0 }; cubetas.set(corte, c); }
      if (l.tipo === 'INGRESO') c.ingresos += imp;
      else c.costes += imp;
      c.n_lineas += 1;
    }

    let ingresos_total = 0;
    let costes_total = 0;
    const por_dimension = [];
    for (const c of cubetas.values()) {
      const margen = this._round(c.ingresos - c.costes, 2);
      ingresos_total += c.ingresos;
      costes_total += c.costes;
      por_dimension.push({
        dimension: c.dimension,
        ingresos: this._round(c.ingresos, 2),
        costes: this._round(c.costes, 2),
        // ingreso − coste imputado por dimension: la regla de J2, una sola respuesta.
        margen,
        ratio_margen: c.ingresos !== 0 ? this._round(margen / c.ingresos, 4) : null,
        n_lineas: c.n_lineas
      });
    }
    por_dimension.sort((a, b) => (a.dimension < b.dimension ? -1 : (a.dimension > b.dimension ? 1 : 0)));

    // Un margen solo se declara si TODAS las lineas entraron en una cubeta.
    const abierto = sin_dimension.length > 0 || ambiguas.length > 0 || no_declaradas.length > 0;
    const faltan = [];
    if (sin_dimension.length > 0) faltan.push('dimension_de_' + sin_dimension.length + '_linea(s)');
    if (ambiguas.length > 0) faltan.push('eje_declarado');
    if (no_declaradas.length > 0) faltan.push('catalogo_de_dimensiones');

    const ingresosR = this._round(ingresos_total, 2);
    const costesR = this._round(costes_total, 2);
    const margenTotal = this._round(ingresosR - costesR, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        eje,
        fuente_dimensiones,
        ingresos_total: ingresosR,
        costes_total: costesR,
        // El margen del conjunto: solo cerrado si todas las lineas estan imputadas a una dimension.
        margen_total: abierto ? null : margenTotal,
        // El parcial se declara igual (se ve lo que hay, no se oculta lo que falta).
        parcial: { ingresos: ingresosR, costes: costesR, margen: margenTotal,
          ratio_margen: ingresosR !== 0 ? this._round(margenTotal / ingresosR, 4) : null },
        por_dimension,
        n_dimensiones: por_dimension.length,
        n_lineas: lineas.length,
        sin_dimension,
        no_declaradas,
        ambiguas,
        abierto,
        faltan,
        motivo: abierto
          ? 'el margen no se cierra: hay lineas sin dimension/eje declarado o fuera del catalogo (no se imputa nada a dedo)'
          : null
      }
    };
  }

  // ── El catalogo de dimensiones: declarado en la peticion o pedido a la cola K9 POR EVENTO ──
  async _dimensiones(pid, input = {}) {
    const decl = input.dimensiones || (input.criterio && input.criterio.dimensiones);
    if (Array.isArray(decl)) {
      return { dimensiones: this._normalizarCatalogo(decl), fuente_dimensiones: 'declarado' };
    }
    const r = await this._rpc('cola-declaraciones-criterio.ratificar.request',
      { project_id: pid, clave: 'dimensiones' }, { timeout_ms: 4000 });
    const valor = r && r.data && r.data.criterio ? r.data.criterio.valor : null;
    if (valor && typeof valor === 'object' && Array.isArray(valor.dimensiones)) {
      return { dimensiones: this._normalizarCatalogo(valor.dimensiones), fuente_dimensiones: 'cola-declaraciones-criterio' };
    }
    if (Array.isArray(valor)) {
      return { dimensiones: this._normalizarCatalogo(valor), fuente_dimensiones: 'cola-declaraciones-criterio' };
    }
    // Sin catalogo declarado NO se inventa: se agrupa por lo que cada linea declare.
    return { dimensiones: [], fuente_dimensiones: null };
  }

  _normalizarCatalogo(lista = []) {
    const out = [];
    for (const d of (Array.isArray(lista) ? lista : [])) {
      if (d === null || d === undefined || d === '') continue;
      const clave = this._clave(d);
      if (clave === null) continue;
      const tipo = (d && typeof d === 'object') ? String(d.tipo || d.eje || '') || null : null;
      if (!out.some(x => x.clave === clave)) out.push({ clave, id: clave, tipo });
    }
    return out;
  }

  // ── El eje del corte: ParametroDeclarable. Sin eje, el corte es de una sola dimension. ──
  _eje(input = {}) {
    const e = input.eje != null ? String(input.eje) : null;
    return e;
  }

  // ── Las lineas: ingresos/costes etiquetados, declarados (dato). Nunca se inventan. ──
  _lineas(input = {}) {
    const out = [];
    const push = (arr, tipoForzado) => {
      for (const l of (Array.isArray(arr) ? arr : [])) {
        if (!l || typeof l !== 'object') continue;
        const tipoRaw = String(l.tipo || tipoForzado || '').toUpperCase();
        const tipo = tipoRaw === 'INGRESO' || tipoRaw === 'COSTE' ? tipoRaw : null;
        out.push({
          dimension: l.dimension != null ? l.dimension : null,
          centro: l.centro != null ? l.centro : null,
          linea: l.linea != null ? l.linea : null,
          producto: l.producto != null ? l.producto : null,
          eje: l.eje != null ? String(l.eje) : null,
          tipo,
          importe: l.importe != null ? l.importe : (l.cuantia != null ? l.cuantia : l.valor),
          hecho_id: l.hecho_id != null ? l.hecho_id : (l.id != null ? l.id : null),
          periodo: l.periodo != null ? String(l.periodo) : null
        });
      }
    };
    push(input.lineas, null);
    push(input.ingresos, 'INGRESO');
    push(input.costes, 'COSTE');
    push(input.costes_imputados, 'COSTE');
    return out;
  }

  _tieneDimension(l) {
    return l.dimension != null || l.centro != null || l.linea != null || l.producto != null;
  }

  // El corte de UNA linea: su dimension declarada, o el campo del eje declarado.
  _corteDe(l, eje) {
    if (l.dimension != null) return this._clave(l.dimension);
    const ef = l.eje || eje;
    if (ef) {
      const v = l[ef];
      if (v !== null && v !== undefined && v !== '') return this._clave(v);
      return null;
    }
    // Sin eje declarado: solo se corta si la linea trae EXACTAMENTE una dimension (una sola lectura).
    const candidatos = EJES_CONOCIDOS.filter(k => l[k] !== null && l[k] !== undefined && l[k] !== '');
    if (candidatos.length === 1) return this._clave(l[candidatos[0]]);
    return null; // 0 dimensiones (sin cubeta) o >1 sin eje (ambigua): no se adivina
  }

  _resumenLinea(l) {
    return {
      hecho_id: l.hecho_id ?? null,
      tipo: l.tipo ?? null,
      importe: this._num(l.importe),
      centro: l.centro ?? null,
      linea: l.linea ?? null,
      producto: l.producto ?? null,
      periodo: l.periodo ?? null
    };
  }

  _clave(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return this._clave(v.id ?? v.clave ?? v.nombre ?? v.centro ?? v.linea ?? v.producto);
    return String(v);
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = MargenAnalitico;
