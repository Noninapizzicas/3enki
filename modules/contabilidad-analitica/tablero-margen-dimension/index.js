/**
 * contabilidad-analitica/tablero-margen-dimension — REFLEJO STATELESS (J10, hoja del plan).
 *
 * El CRUCE margen x DIMENSION bajo LENTE DE CONJUNTO: por centro, familia o sociedad. No
 * calcula el margen (eso es margen-analitico H2, al que SUBE por EVENTO): AGREGA el margen YA
 * calculado por cada dimension declarada y compone el tablero.
 *
 * Invariante: dato ausente = desconocido. Sin margen no se compone tablero (no se estima); lo
 * que falta (margen, dimension) se declara ABIERTO. La dimension es DATO declarable
 * (`centro`/`familia`/`sociedad`/…): no se cablea una lista cerrada.
 *
 * R3 (honestidad de la escucha): el plan declara escucha de `contabilidad.asiento_asentado`
 * (escritor-diario B2) y `contabilidad.criterio_fijado` (cola-declaraciones-criterio) — AMBOS
 * emisores YA existen → SI se declaran.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. RPC cruzar = PREGUNTA → sin ui_handler.
 * Ver hoja J10 del plan-construccion y diseno-oop.md (CLASE TableroMargenDimension).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const DIMENSIONES = ['centro', 'familia', 'sociedad', 'producto', 'canal', 'periodo', 'dimension', 'proyecto'];

class TableroMargenDimension extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'tablero-margen-dimension';
    this.version = 'reflejo-0.1.0';
    // Observacion acotada (fire-and-forget)
    this._vistos = { asientos: [], criterios: [] };
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (PREGUNTA → sin ui_handler) ──
  onCruzarRequest(e) {
    return this._atender(e, 'cruzar', 'tablero-margen-dimension.cruzar.response', async (d) => {
      const res = await this._cruzar(d);
      // Reflejo: agrega y declara; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('tablero-margen-dimension.cruzar.failed', res);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): el libro cambio / se fijo un criterio ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    if (d.asiento) { this._vistos.asientos.push(d.asiento); if (this._vistos.asientos.length > 2000) this._vistos.asientos.shift(); }
  }

  onCriterioFijado(e) {
    const d = (e && (e.data || e)) || {};
    if (d.criterio || d.clave) { this._vistos.criterios.push(d.criterio || d); if (this._vistos.criterios.length > 1000) this._vistos.criterios.shift(); }
  }

  // ══════════════════════════════════════════════════════════════════════
  // _cruzar(input) → tablero: margen agregado por cada DIMENSION declarada
  // ══════════════════════════════════════════════════════════════════════
  async _cruzar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Las dimensiones a cruzar: DECLARADAS (por defecto, las reconocidas). No se cablea la de negocio.
    const dimensiones = this._dimensiones(input);
    if (dimensiones.length === 0) return this._invalid('dimensiones');

    // El MARGEN por fila: declarado en el input, o subido por EVENTO a margen-analitico (H2).
    const { filas, fuente } = await this._filasDe(input);

    // Sin margen NO se compone tablero (dato ausente = desconocido): se declara ABIERTO.
    if (filas.length === 0) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'tablero-margen-dimension',
          dimensiones,
          tablero: [],
          total: 0,
          calcula_margen: false,
          abierto: { margen: 'no hay margen (ni declarado ni de margen-analitico): el tablero no se inventa' }
        }
      };
    }

    // Cruce: por cada dimension, agrega el margen de las filas que la declaran.
    const tablero = [];
    for (const dim of dimensiones) {
      const porValor = new Map();
      let sinDimension = 0, margenSinDimension = 0;
      for (const f of filas) {
        const valor = f[dim] != null ? String(f[dim]) : null;
        const margen = this._num(f.margen != null ? f.margen : (this._num(f.ingreso) != null ? this._num(f.ingreso) - (this._num(f.coste) || 0) : null));
        if (valor === null) { sinDimension++; if (margen != null) margenSinDimension += margen; continue; }
        const acc = porValor.get(valor) || { valor, margen: 0, filas: 0 };
        if (margen != null) acc.margen += margen;
        acc.filas++;
        porValor.set(valor, acc);
      }
      const celdas = [...porValor.values()]
        .map((c) => ({ valor: c.valor, margen: this._round(c.margen, 2), filas: c.filas }))
        .sort((a, b) => b.margen - a.margen);
      tablero.push({
        dimension: dim,
        celdas,
        total_margen: this._round(celdas.reduce((a, c) => a + c.margen, 0), 2),
        sin_dimension: sinDimension
      });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'tablero-margen-dimension',
        fuente_margen: fuente,
        dimensiones,
        tablero,
        total_filas: filas.length,
        // Este modulo NO calcula el margen: lo AGREGA (eso es de margen-analitico H2).
        calcula_margen: false,
        abierto: {
          dimensiones_sin_valor: tablero.some((t) => t.sin_dimension > 0)
            ? `${tablero.filter((t) => t.sin_dimension > 0).map((t) => t.dimension).join(', ')}: hay filas sin ese valor declarado (no se reparten, se declaran)`
            : null
        }
      }
    };
  }

  // Trae las filas con margen: declaradas, o subidas por EVENTO a margen-analitico (H2).
  async _filasDe(input) {
    if (Array.isArray(input.filas)) return { filas: input.filas, fuente: 'declarado' };
    const resp = await this._rpc('margen-analitico.calcular.request', {
      project_id: input.project_id || this.project_id,
      periodo: input.periodo, ejercicio: input.ejercicio, granularidad: input.granularidad
    }, { timeout_ms: 3000 });
    const v = resp && resp.data ? resp.data : null;
    if (v && Array.isArray(v.filas)) return { filas: v.filas, fuente: 'margen-analitico' };
    if (v && Array.isArray(v.margenes)) return { filas: v.margenes, fuente: 'margen-analitico' };
    return { filas: [], fuente: null };
  }

  // Las dimensiones a cruzar: declaradas, o las reconocidas por defecto (subconjunto generico).
  _dimensiones(input) {
    const raw = Array.isArray(input.dimensiones) ? input.dimensiones
      : (input.dimension != null ? [input.dimension] : null);
    if (raw) return raw.map((d) => String(d).trim()).filter(Boolean);
    // Por defecto: el cruce mas comun (centro/familia/sociedad) — declarable, no cableado de negocio.
    return ['centro', 'familia', 'sociedad'];
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCruzar(params) { return this._cruzar(params); }
}

module.exports = TableroMargenDimension;
