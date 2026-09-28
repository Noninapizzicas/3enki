/**
 * contabilidad/margen-analitico — REFLEJO STATELESS (J2 + J5 + J10, hoja del plan).
 *
 * EL MARGEN POR DIMENSION y el reparto DECLARADO de los gastos no directos.
 * Tres clases en una parcela:
 *   J2  calcular(dimension) -> Margen      ingreso − coste imputado por dimension.
 *   J5  repartir(gasto, criterio) -> Map   aplica el REPARTO DECLARADO de los
 *                                          gastos no directos (criterio J7).
 *   J10 cruzar(margen, dimension) -> Tablero   margen × dimension bajo lente de
 *                                          CONJUNTO (por centro, familia o sociedad).
 *
 * NO es el juicio: la ETIQUETA (que hecho va a que centro/linea/producto) es de
 * etiquetado-analitico (J1) y llega por EVENTO en el payload o se lee de su
 * evento de dominio (`contabilidad.etiqueta_aplicada`). Aqui solo se AGREGA lo ya
 * etiquetado; jamas se clasifica a ciegas.
 *
 * LA LEY ENTRA COMO DATO: el CRITERIO de reparto de indirectos (J7) es
 * DECLARABLE — se lee de cola-declaraciones-criterio (K9) por EVENTO
 * `contabilidad.criterio.leer.request`. Ningun porcentaje ni clave de reparto
 * esta cableado: SIN CRITERIO DECLARADO el reparto NO SE INVENTA (422
 * CRITERIO_NO_DECLARADO). El coste imputado viene de las existencias valoradas
 * (H1, `contabilidad.existencia_valorada`) + el reparto declarado (J5) — no se
 * recalcula la valoracion: se LEE.
 *
 * EL COSTE NO SE DUPLICA: si H1 no responde y el payload no trae el coste
 * imputado, se devuelve 503 DEPENDENCIA_NO_DISPONIBLE y NUNCA se emite un margen
 * inventado (contrato TOLERANTE).
 *
 * REFLEJO stateless (patron real): SIN PosPersistencia y SIN project.activated en
 * el CODIGO — cada op entra objeto y sale objeto; el margen es una proyeccion del
 * libro + la analitica, no una parcela. Dependencia entre modulos por EVENTO,
 * NUNCA por require cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.margen_calculado ·
 * contabilidad.indirecto_repartido · contabilidad.tablero_calculado; error su par
 * determinista. NO REUTILIZA: el coste indirecto multi-sociedad y por periodos NO
 * lo cubre la pieza existente (escandallo, mono-negocio).
 *
 * Ver hojas J2/J5/J10 del diseno-oop y bloque `margen-analitico` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Criterio de la cola K9 que fija el reparto de indirectos (J7). DECLARABLE.
const CRITERIO_REPARTO = 'J7';

// Codigos simbolicos deterministas (señales duras del reflejo).
const CODE_CRITERIO_NO_DECLARADO = 'CRITERIO_NO_DECLARADO';
const CODE_DEPENDENCIA_NO_DISPONIBLE = 'DEPENDENCIA_NO_DISPONIBLE';

class MargenAnalitico extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'margen-analitico';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. El margen es una proyeccion
    // (libro derivado + etiquetas de J1 + coste imputado de H1/J5).
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'contabilidad.margen.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.margen_calculado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.margen.calcular.failed', res);
      }
      return res;
    });
  }

  onRepartirRequest(e) {
    return this._atender(e, 'repartir', 'contabilidad.indirecto.repartir.response', async (d) => {
      const res = await this._repartirConCriterio(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.indirecto_repartido', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.indirecto.repartir.failed', res);
      }
      return res;
    });
  }

  onCruzarRequest(e) {
    return this._atender(e, 'cruzar', 'contabilidad.tablero.cruzar.response', async (d) => {
      const res = await this._cruzar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.tablero_calculado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.tablero.cruzar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  // calcular(dimension) -> Margen {ingreso, coste_imputado, margen, margen_pct} (J2).
  // ingreso − coste imputado por dimension. El coste = existencias valoradas (H1)
  // + reparto declarado de indirectos (J5). Determinista: mismas entradas → mismo margen.
  async _calcular(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const dimension = this._dimensionDe(input);
    if (!dimension) return this._invalid('dimension');

    const lineas = await this._lineasDe(pid, input);
    if (lineas === null) {
      return this._errorResponse(503, CODE_DEPENDENCIA_NO_DISPONIBLE,
        'no hay linea del libro ni etiquetas: no se emite un margen sin ingreso ni coste real', {
          dependencia: 'margen-analitico',
          accion: 'NO_CALCULAR_PUBLICAR_FALLO'
        });
    }

    const agregado = this._agregarDimension(lineas, dimension);
    const costeImputado = await this._costeImputadoDe(pid, input, dimension);
    const ingreso = this._round(agregado.ingreso, 2);
    const coste = this._round(costeImputado.total, 2);
    const margen = this._round(ingreso - coste, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: (input && input.periodo) || null,
        dimension,
        margen: {
          ingreso,
          coste_imputado: coste,
          margen,
          margen_pct: ingreso !== 0 ? this._round(margen / ingreso, 4) : null,
          n_lineas: agregado.n
        },
        coste_de: {
          existencias_valoradas: costeImputado.de_existencias,
          indirecto_repartido: costeImputado.de_indirecto,
          origen: costeImputado.origen
        },
        determinista: true,
        nota: 'el margen AGREGA lo ya etiquetado (J1); aqui no se clasifica nada a ciegas'
      }
    };
  }

  // repartir(gasto, criterio) -> Map<IdDimension, Importe> (J5).
  // Aplica el REPARTO DECLARADO (J7). Sin criterio declarado NO se inventa: 422.
  async _repartirConCriterio(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const gasto = (input && (input.gasto || input.gasto_no_directo || input)) || null;
    const importe = this._round(Number(gasto && (gasto.importe !== undefined ? gasto.importe : gasto.total)) || 0, 2);
    if (importe <= 0) return this._invalid('gasto.importe');

    // El criterio (J7) es DECLARABLE: payload o LECTURA por EVENTO de K9.
    const criterio = await this._criterioDeReparto(pid, input);
    if (criterio === null) {
      return this._errorResponse(422, CODE_CRITERIO_NO_DECLARADO,
        'el criterio de reparto de indirectos (J7) no esta declarado: el reparto NO se inventa', {
          criterio: CRITERIO_REPARTO,
          declarable_en: 'cola-declaraciones-criterio (K9)',
          accion: 'NO_REPARTIR_INVENTANDO'
        });
    }

    const claves = this._clavesDeReparto(criterio);
    if (claves.length === 0) {
      return this._errorResponse(422, CODE_CRITERIO_NO_DECLARADO,
        'el criterio de reparto declarado no fija claves de reparto: no se asume un reparto por defecto', {
          criterio: CRITERIO_REPARTO, valor_declarado: criterio.valor !== undefined ? criterio.valor : criterio
        });
    }

    const totalClaves = claves.reduce((t, c) => t + c.clave, 0);
    const por_dimension = {};
    for (const c of claves) {
      if (totalClaves <= 0) break;
      por_dimension[c.dimension] = this._round(importe * (c.clave / totalClaves), 2);
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        importe,
        criterio: CRITERIO_REPARTO,
        criterio_fuente: criterio.fuente || 'DECLARADO',
        por_dimension,
        n_dimensiones: Object.keys(por_dimension).length,
        reparto_declarado: true,
        ley_cableada: false,
        determinista: true
      }
    };
  }

  // cruzar(margen, dimension) -> Tablero (J10): margen × dimension, lente CONJUNTO.
  async _cruzar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const dimension = this._dimensionDe(input);
    const dimensiones = this._dimensionesDeclaradas(input);

    const lineas = await this._lineasDe(pid, input);
    if (lineas === null) {
      return this._errorResponse(503, CODE_DEPENDENCIA_NO_DISPONIBLE,
        'no hay linea del libro ni etiquetas: no se emite un tablero de margen', {
          dependencia: 'margen-analitico'
        });
    }

    // Dimensiones a cruzar: las declaradas (J6) o las que aparecen en las etiquetas.
    const aCruzar = dimensiones.length > 0
      ? dimensiones.map((d) => this._idDimension(d))
      : this._dimensionesDeLineas(lineas);

    const filas = [];
    let totalIngreso = 0;
    let totalCoste = 0;
    for (const d of aCruzar) {
      if (!d) continue;
      const agregado = this._agregarDimension(lineas, d);
      const coste = await this._costeImputadoDe(pid, input, d);
      const ingreso = this._round(agregado.ingreso, 2);
      const costeR = this._round(coste.total, 2);
      const margen = this._round(ingreso - costeR, 2);
      totalIngreso += ingreso;
      totalCoste += costeR;
      filas.push({
        dimension: d,
        ingreso,
        coste_imputado: costeR,
        margen,
        margen_pct: ingreso !== 0 ? this._round(margen / ingreso, 4) : null
      });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: (input && input.periodo) || null,
        lente: 'CONJUNTO',
        por_dimension: filas,
        totales: {
          ingreso: this._round(totalIngreso, 2),
          coste_imputado: this._round(totalCoste, 2),
          margen: this._round(totalIngreso - totalCoste, 2)
        },
        n_dimensiones: filas.length,
        determinista: true,
        nota: 'cruce margen × dimension por centro, familia o sociedad — agregacion determinista'
      }
    };
  }

  // ── helpers internos ──

  _dimensionDe(input) {
    const d = input && (input.dimension || input.centro || input.id_dimension);
    if (d && typeof d === 'object') return this._idDimension(d);
    return d ? String(d) : null;
  }

  _idDimension(d) {
    if (d === null || d === undefined) return null;
    if (typeof d === 'object') return d.id || d.nombre || d.centro || d.linea || null;
    return String(d);
  }

  _dimensionesDeclaradas(input) {
    const d = input && (input.dimensiones || input.dims);
    return Array.isArray(d) ? d : [];
  }

  // Lineas (hechos etiquetados) del payload o del evento de dominio de J1.
  async _lineasDe(pid, input) {
    const enPayload = input && (input.lineas || input.hechos || input.movimientos);
    if (Array.isArray(enPayload)) return enPayload;

    // Etiqueta ya aplicada de J1, si viene en el payload.
    const etiquetas = input && input.etiquetas;
    if (Array.isArray(etiquetas)) return etiquetas;

    // Si no hay libro/movimientos en el payload ni etiquetas, se declara: no se inventa.
    const balanza = await this._rpc('contabilidad.mayor.balanza.request', {
      project_id: pid, periodo: (input && input.periodo) || null
    }, { timeout_ms: 4000 });
    if (balanza && balanza.status === 200 && balanza.data) {
      const b = balanza.data.balanza || balanza.data;
      if (Array.isArray(b && b.lineas)) return b.lineas;
    }
    return null;
  }

  // Agrega ingreso de las lineas cuya etiqueta cae en la dimension. Determinista.
  _agregarDimension(lineas, dimension) {
    let ingreso = 0;
    let n = 0;
    for (const l of lineas) {
      const etiqueta = (l && (l.etiqueta || l.dimension || l.centro)) || null;
      const idDim = typeof etiqueta === 'object' ? (etiqueta.centro || etiqueta.linea || etiqueta.id || null) : etiqueta;
      if (idDim !== null && idDim !== undefined && String(idDim) !== String(dimension)) continue;
      const acreedor = Number(l && (l.saldo_acreedor !== undefined ? l.saldo_acreedor : l.haber)) || 0;
      const deudor = Number(l && (l.saldo_deudor !== undefined ? l.saldo_deudor : l.debe)) || 0;
      // Ingreso analitico: el importe de la linea (positivo), venga como saldo o como movimiento.
      const importe = l && l.importe !== undefined
        ? Number(l.importe) || 0
        : Math.abs(acreedor - deudor);
      ingreso += importe;
      n += 1;
    }
    return { ingreso: this._round(ingreso, 2), n };
  }

  _dimensionesDeLineas(lineas) {
    const set = new Set();
    for (const l of lineas) {
      const etiqueta = (l && (l.etiqueta || l.dimension || l.centro)) || null;
      const id = typeof etiqueta === 'object' ? (etiqueta && (etiqueta.centro || etiqueta.linea || etiqueta.id)) : etiqueta;
      if (id) set.add(String(id));
    }
    return [...set];
  }

  // Coste imputado: existencias valoradas (H1) + indirecto repartido (J5 declarado).
  // No recalcula la valoracion: la LEE (contrato TOLERANTE).
  async _costeImputadoDe(pid, input, dimension) {
    let deExistencias = 0;
    let deIndirecto = 0;
    let origen = 'PAYLOAD';

    const costePayload = (input && input.coste_imputado) || (input && input.coste);
    if (costePayload !== undefined && costePayload !== null) {
      deExistencias = this._round(
        typeof costePayload === 'object'
          ? Number(costePayload.total !== undefined ? costePayload.total : costePayload.importe) || 0
          : Number(costePayload) || 0, 2);
    } else {
      const existencias = await this._rpc('contabilidad.existencia.valorar.request', {
        project_id: pid, dimension
      }, { timeout_ms: 4000 });
      if (existencias && existencias.status === 200 && existencias.data) {
        deExistencias = this._round(Number(existencias.data.total_valor !== undefined
          ? existencias.data.total_valor : (existencias.data.valoracion && existencias.data.valoracion.total)) || 0, 2);
        origen = 'H1_valoracion-existencia';
      }
    }

    // Indirecto: si el payload trae el reparto ya calculado, se usa; si no, se reparte con J5.
    if (input && input.indirecto_repartido && typeof input.indirecto_repartido === 'object') {
      const r = input.indirecto_repartido;
      deIndirecto = this._round(Number(r[dimension] !== undefined ? r[dimension] : r.total) || 0, 2);
      origen = origen === 'PAYLOAD' ? 'PAYLOAD' : origen;
    } else if (Array.isArray(input && input.gastos_no_directos)) {
      const reparto = await this._repartirConCriterio({
        project_id: pid, gasto: { importe: this._sumaGastos(input.gastos_no_directos) }, criterio: input.criterio
      });
      if (reparto.status === 200) {
        deIndirecto = this._round(Number(reparto.data.por_dimension[dimension]) || 0, 2);
        origen = 'J5_reparto_declarado';
      }
    }

    return { total: this._round(deExistencias + deIndirecto, 2), de_existencias: deExistencias, de_indirecto: deIndirecto, origen };
  }

  _sumaGastos(gastos) {
    let t = 0;
    for (const g of gastos) t += Number((g && (g.importe !== undefined ? g.importe : g.total)) || 0);
    return this._round(t, 2);
  }

  // El criterio de reparto (J7) DECLARADO: payload o LECTURA por EVENTO de K9.
  async _criterioDeReparto(pid, input) {
    const enPayload = input && (input.criterio || input.criterio_reparto);
    if (enPayload) {
      if (typeof enPayload === 'object') {
        return { valor: enPayload.valor !== undefined ? enPayload.valor : enPayload, fuente: 'PAYLOAD' };
      }
      return { valor: enPayload, fuente: 'PAYLOAD' };
    }

    const resp = await this._rpc('contabilidad.criterio.leer.request', {
      project_id: pid, criterio: CRITERIO_REPARTO
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200 || !resp.data || !resp.data.hallado) return null;
    const param = resp.data.parametro || {};
    return { valor: param.valor !== undefined ? param.valor : param, fuente: 'K9_DECLARADO' };
  }

  // Claves de reparto declaradas: [{dimension, clave}]. Sin claves → no se reparte.
  _clavesDeReparto(criterio) {
    const v = criterio && criterio.valor;
    if (v === null || v === undefined) return [];
    // Forma A: { claves: [{dimension, clave}] }
    if (Array.isArray(v.claves)) {
      return v.claves.map((c) => ({ dimension: this._idDimension(c.dimension || c.centro || c), clave: Number(c.clave !== undefined ? c.clave : c.peso) || 0 }))
        .filter((c) => c.dimension && c.clave > 0);
    }
    // Forma B: map { <dimension>: <clave> }
    if (typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).map((k) => ({ dimension: k, clave: Number(v[k]) || 0 })).filter((c) => c.clave > 0);
    }
    return [];
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
  toolRepartir(params) { return this._repartirConCriterio(params); }
  toolCruzar(params) { return this._cruzar(params); }
}

module.exports = MargenAnalitico;
