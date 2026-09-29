/**
 * contabilidad-analitica/tablero-margen-dimension — REFLEJO STATELESS (J10, hoja del plan).
 *
 * EL CRUCE MARGEN × DIMENSION: el jefe ve que linea mueve su margen. Una TABLA de conjunto — por
 * centro, por linea, por producto, por sociedad — construida cruzando la MISMA cifra de margen por
 * cada eje declarado.
 *
 * ATRIBUTOS del diseno: `margen:MargenAnalitico`, `dimensiones:Set<Dimension>`.
 *   METODOS: cruzar():Tabla.
 *   REGLA: cruce margen × dimension bajo lente de conjunto: por centro, familia o sociedad.
 *
 * =============== NO DUPLICA J2: LEE EL MARGEN YA CALCULADO ===============
 * Este modulo NO calcula margen: para cada EJE declarado PIDE a `margen-analitico` (J2) POR EVENTO
 * (`margen-analitico.calcular.request`) su `por_dimension` ya calculado y lo COLOCA en la tabla.
 * Cero aritmetica de margen aqui: la suma, la resta y el ratio son de J2. El tablero solo pivota y
 * presenta. Los hechos etiquetados (lo que hace posible el corte) proceden del etiquetado de J1
 * (`etiquetado-analitico`, que PROPONE y jamas escribe) a traves de J2.
 *
 * EL EJE ES DECLARABLE: por que ejes se cruza (centro | linea | producto | sociedad | cualquier eje
 * declarado) es DATO. Sin ejes declarados se usan los que declare el CATALOGO de dimensiones
 * (cada dimension declara su `tipo`); si tampoco hay catalogo, NO se elige un eje por defecto — la
 * tabla queda `[ABIERTO]` con lo que falta (elegir el eje seria decidir por el jefe).
 *
 * Invariantes:
 *  - NO RECALCULA MARGEN: cada fila es la cifra de J2, con su ORIGEN declarado.
 *  - DETERMINISTA: mismo margen + mismos ejes → misma tabla.
 *  - Dato ausente = desconocido: un eje sin cubetas → fila con `margen:null` y su motivo, NUNCA 0.
 *  - LEY/PARAMETRO COMO DATO: ejes y catalogo de dimensiones son entrada; cero constantes.
 *  - NO escribe, NO persiste: la tabla es un DERIVADO de lectura.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja J10 del plan-construccion y diseno-oop.md (CLASE TableroMargenDimension).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class TableroMargenDimension extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'tablero-margen-dimension';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCruzarRequest(e) {
    return this._atender(e, 'cruzar', 'tablero-margen-dimension.cruzar.response', async (d) => {
      const res = await this._cruzar(d);
      if (res.status !== 200) this.eventBus?.publish('tablero-margen-dimension.cruzar.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: cruzar() → Tabla (LEE el margen de J2, no lo recalcula) ──
  async _cruzar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');
    const periodo = input.periodo != null ? String(input.periodo) : null;

    // 1) Las DIMENSIONES declaradas (el catalogo): que centros/lineas/productos existen.
    const { dimensiones, fuente_dimensiones } = await this._dimensiones(pid, input);

    // 2) Los EJES del cruce: declarados, o los tipos del catalogo declarado. NUNCA un default.
    const { ejes, fuente_ejes } = this._ejes(input, dimensiones);

    if (ejes.length === 0) {
      return {
        status: 200,
        data: {
          project_id: pid, periodo, fuente_dimensiones, fuente_ejes,
          ejes: [], tabla: [], filas: 0,
          abierto: true, faltan: ['ejes'],
          motivo: 'no se cruza el tablero: el eje (centro | linea | producto | sociedad) es DECLARABLE y no se declaro (elegirlo seria decidir por el jefe)'
        }
      };
    }

    // 3) Por cada EJE, se PIDE a J2 su margen YA CALCULADO (por evento) y se coloca en la tabla.
    const tabla = [];
    const faltan = [];
    for (const eje of ejes) {
      const r = await this._rpc('margen-analitico.calcular.request',
        { project_id: pid, periodo, eje, dimensiones }, { timeout_ms: 5000 });
      const data = r && r.data ? r.data : null;

      if (!data || !Array.isArray(data.por_dimension) || data.por_dimension.length === 0) {
        // Sin margen para ese eje: la fila se DECLARA sin cifra. No se rellena con 0.
        faltan.push(eje);
        tabla.push({
          eje,
          fuente: 'margen-analitico',
          margen: null,
          ingresos: null,
          costes: null,
          ratio_margen: null,
          dimensiones: [],
          abierto: true,
          motivo: data
            ? 'el margen por ese eje no esta cerrado (J2 lo devolvio abierto): el tablero no lo completa por su cuenta'
            : 'margen-analitico (J2) no respondio: el tablero no recalcula el margen'
        });
        continue;
      }

      // La fila del eje: las cubetas de J2 TAL CUAL (su cifra, su origen).
      tabla.push({
        eje,
        fuente: 'margen-analitico',
        margen: this._num(data.margen_total),
        ingresos: this._num(data.ingresos_total),
        costes: this._num(data.costes_total),
        ratio_margen: data.parcial ? this._num(data.parcial.ratio_margen) : null,
        dimensiones: data.por_dimension.map(c => ({
          dimension: c.dimension,
          ingresos: this._num(c.ingresos),
          costes: this._num(c.costes),
          margen: this._num(c.margen),
          ratio_margen: this._num(c.ratio_margen),
          n_lineas: c.n_lineas ?? null
        })),
        abierto: data.abierto === true,
        motivo: data.motivo ?? null
      });
    }

    // El catalogo declarado que NO aparece en ningun eje: se declara (se ve el hueco, no se oculta).
    const vistas = new Set();
    for (const fila of tabla) for (const d of fila.dimensiones) vistas.add(String(d.dimension));
    const sin_margen = dimensiones.filter(d => !vistas.has(d.clave)).map(d => d.clave);

    const abierto = faltan.length > 0 || sin_margen.length > 0;
    if (sin_margen.length > 0) faltan.push('margen_de_' + sin_margen.length + '_dimension(es)');

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        fuente_dimensiones,
        fuente_ejes,
        ejes,
        // Tabla: una fila por eje, con sus cubetas (cifra de J2) bajo la lente de conjunto.
        tabla,
        filas: tabla.length,
        dimensiones_declaradas: dimensiones.map(d => d.clave),
        sin_margen,
        abierto,
        faltan,
        // La lente de conjunto del jefe: mismo margen, cortado por todos los ejes que declaro.
        lente: 'conjunto',
        motivo: abierto
          ? 'el tablero se compone con lo disponible; queda [ABIERTO] ' + faltan.join(', ')
          : null
      }
    };
  }

  // ── Las dimensiones: catalogo declarado, o pedido a la cola K9 POR EVENTO (best-effort) ──
  async _dimensiones(pid, input = {}) {
    const decl = input.dimensiones || (input.criterio && input.criterio.dimensiones);
    if (Array.isArray(decl)) return { dimensiones: this._catalogo(decl), fuente_dimensiones: 'declarado' };
    const r = await this._rpc('cola-declaraciones-criterio.ratificar.request',
      { project_id: pid, clave: 'dimensiones' }, { timeout_ms: 4000 });
    const valor = r && r.data && r.data.criterio ? r.data.criterio.valor : null;
    const lista = Array.isArray(valor) ? valor : (valor && typeof valor === 'object' && Array.isArray(valor.dimensiones) ? valor.dimensiones : null);
    if (lista) return { dimensiones: this._catalogo(lista), fuente_dimensiones: 'cola-declaraciones-criterio' };
    return { dimensiones: [], fuente_dimensiones: null };
  }

  _catalogo(lista = []) {
    const out = [];
    for (const d of (Array.isArray(lista) ? lista : [])) {
      if (d === null || d === undefined || d === '') continue;
      const clave = this._clave(d);
      if (clave === null || out.some(x => x.clave === clave)) continue;
      out.push({
        clave,
        tipo: (d && typeof d === 'object') ? (d.tipo != null ? String(d.tipo) : (d.eje != null ? String(d.eje) : null)) : null
      });
    }
    return out;
  }

  // ── Los ejes del cruce: declarados, o los tipos del catalogo declarado. Cero defaults. ──
  _ejes(input = {}, dimensiones = []) {
    const raw = input.ejes != null ? input.ejes : (input.eje != null ? [input.eje] : null);
    if (raw != null) {
      const lista = Array.isArray(raw) ? raw : [raw];
      const out = [];
      for (const e of lista) {
        if (e === null || e === undefined || e === '') continue;
        const s = String(e).trim();
        if (s && !out.includes(s)) out.push(s);
      }
      if (out.length > 0) return { ejes: out, fuente_ejes: 'declarado' };
    }
    // Sin ejes declarados: los que declare el TIPO de cada dimension del catalogo (dato declarado).
    const delCatalogo = [];
    for (const d of dimensiones) {
      if (d.tipo && !delCatalogo.includes(d.tipo)) delCatalogo.push(d.tipo);
    }
    return { ejes: delCatalogo, fuente_ejes: delCatalogo.length > 0 ? 'catalogo_dimensiones' : null };
  }

  _clave(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return this._clave(v.id ?? v.clave ?? v.nombre ?? v.centro ?? v.linea ?? v.producto ?? v.sociedad);
    return String(v);
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCruzar(params) { return this._cruzar(params); }
}

module.exports = TableroMargenDimension;
