/**
 * contabilidad-analitica/cuadro-mando-contable — REFLEJO STATELESS (J8, hoja del plan).
 *
 * LA LENTE DEL JEFE: el CONJUNTO economico visto desde arriba — caja, resultado, margen,
 * desviacion y ejercicio — SIN BAJAR AL ASIENTO.
 *
 * ======================== AGREGA. NO RECALCULA NADA. ========================
 * Este modulo es un AGREGADO DE CONJUNTO: pide cada cifra YA CALCULADA a su dueño POR EVENTO y
 * las compone en un solo informe. NO vuelve a sumar partidas, NO vuelve a derivar el mayor, NO
 * recalcula el margen ni la desviacion ni el saldo. Cada cifra llega con su ORIGEN declarado
 * (`origen`) para que el jefe sepa de donde sale; el cuadro es una COMPOSICION, no un calculo.
 *
 *   caja       ← saldo-tesoreria.calcular.request        (E4)  saldo ya derivado del mayor+maestro
 *   resultado  ← cuenta-resultados.calcular.request      (C2)  cuenta de resultados ya calculada
 *   margen     ← margen-analitico.calcular.request       (J2)  margen ya calculado por dimension
 *   desviacion ← desviacion.calcular.request             (J4)  desviacion ya medida vs presupuesto
 *   ejercicio  ← cierre-ejercicio.estado.request / declarado    el ejercicio vigente, DATO
 *   cobertura  ← completitud-cobertura.medir.request     (A12) LA metrica unica: se LEE, no se recalcula
 *
 * ATRIBUTOS del diseno: `caja:SaldoTesoreria`, `resultado:CuentaResultados`, `margen`,
 * `desviacion`, `ejercicio`.
 *   METODOS: componer(periodo):Informe.
 *   REGLA: agregacion de conjunto SIN bajar al asiento. Lente del jefe. Determinista.
 *
 * EL JEFE DECIDE Y DECLARA: el cuadro no decide nada — presenta. Lo que el jefe aun no ha declarado
 * (objetivo, umbral, que granularidad sube al cuadro I7, que agregado quiere ver I6) se DECLARA
 * como hueco: no se inventa. Una cifra que su dueño no puede dar queda `null` con su `[ABIERTO]`
 * y su motivo — JAMAS se rellena con 0 (un 0 afirmaria una cifra que nadie midio).
 *
 * UNA SOLA METRICA DE COBERTURA: si el cuadro muestra cobertura, LEE `completitud-cobertura`
 * (A12) POR EVENTO; no la recalcula. Y si la cobertura no esta declarada, la muestra dice eso:
 * declarada:false, tasa null.
 *
 * Invariantes:
 *  - AGREGA SIN RECALCULAR: ninguna cifra se computa aqui; todas se piden y se declara su origen.
 *  - DETERMINISTA: mismos agregados → mismo cuadro (composicion pura, sin juicio).
 *  - Dato ausente = desconocido: cifra no disponible → null + `abierto` + `faltan`; nunca 0.
 *  - NO escribe, NO persiste: el cuadro es un DERIVADO de lectura.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja J8 del plan-construccion y diseno-oop.md (CLASE CuadroMandoContable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CuadroMandoContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuadro-mando-contable';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onComponerRequest(e) {
    return this._atender(e, 'componer', 'cuadro-mando-contable.componer.response', async (d) => {
      const res = await this._componer(d);
      if (res.status !== 200) {
        this.eventBus?.publish('cuadro-mando-contable.componer.failed', res);
      } else if (res.data.publicable) {
        // Exito → evento de dominio: el cuadro del jefe quedo compuesto (lo LEEN los canales
        // de entrega del negocio; el cuadro NO decide nada, solo presenta).
        this.eventBus?.publish('contabilidad.cuadro_compuesto', {
          project_id: res.data.project_id,
          periodo: res.data.periodo,
          cuadro: res.data.cuadro,
          faltan: res.data.faltan,
          abierto: res.data.abierto,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // ── proyeccion determinista: componer(periodo) → Informe (AGREGA, no recalcula) ──
  async _componer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const periodo = input.periodo != null ? String(input.periodo) : null;
    const ejercicio = input.ejercicio != null ? input.ejercicio : periodo;

    // Se piden los agregados a sus dueños POR EVENTO, en paralelo (una composicion, no un calculo).
    const [caja, resultado, margen, desviacion, cobertura] = await Promise.all([
      this._pieza(pid, 'caja', input,
        input.caja != null ? null : ['saldo-tesoreria.calcular.request', { project_id: pid, fecha: input.fecha, ejercicio }, 'saldo-tesoreria'],
        (data) => this._num(data.saldo_total)),
      this._pieza(pid, 'resultado', input,
        input.resultado != null ? null : ['cuenta-resultados.calcular.request', { project_id: pid, ejercicio }, 'cuenta-resultados'],
        (data) => this._num(data.resultado)),
      this._pieza(pid, 'margen', input,
        input.margen != null ? null : ['margen-analitico.calcular.request', { project_id: pid, periodo, eje: input.eje }, 'margen-analitico'],
        (data) => this._num(data.margen_total)),
      this._pieza(pid, 'desviacion', input,
        input.desviacion != null ? null : ['desviacion.calcular.request', { project_id: pid, periodo, dimension: input.dimension }, 'desviacion'],
        (data) => this._num(data.desviacion)),
      // LA metrica unica de cobertura: se LEE de su dueño (A12). NUNCA se recalcula aqui.
      this._cobertura(pid, input)
    ]);

    // El EJERCICIO es DATO declarado (que ejercicio esta vivo): no se adivina por la fecha.
    const ejercicioDeclarado = ejercicio != null && String(ejercicio).trim() !== '';

    // Cada pieza con su ORIGEN declarado; ausente → null y a `faltan` (nunca 0).
    const piezas = { caja, resultado, margen, desviacion };
    const faltan = [];
    for (const [k, p] of Object.entries(piezas)) {
      if (p.valor === null) faltan.push(k);
    }
    if (!ejercicioDeclarado) faltan.push('ejercicio');
    if (cobertura.medida === null) faltan.push('cobertura');

    // El cuadro: agregacion de conjunto. SOLO las cifras ya calculadas por sus dueños + su origen.
    const cuadro = {
      periodo,
      ejercicio: ejercicioDeclarado ? ejercicio : null,
      // Cada celda: {valor, origen, fuente}; valor null = su dueño no lo dio (no se inventa un 0).
      caja: { valor: caja.valor, origen: caja.origen, fuente: caja.fuente },
      resultado: { valor: resultado.valor, origen: resultado.origen, fuente: resultado.fuente, signo: resultado.signo ?? null },
      margen: { valor: margen.valor, origen: margen.origen, fuente: margen.fuente },
      desviacion: { valor: desviacion.valor, origen: desviacion.origen, fuente: desviacion.fuente, signo: desviacion.signo ?? null, avisa: desviacion.avisa ?? null, umbral: desviacion.umbral ?? null },
      // LA cobertura se MUESTRA tal como la midio A12 (no se recalcula): declarada:false/tasa:null si no la hay.
      cobertura: cobertura.medida,
      // Lo que el jefe aun no ha declarado (granularidad del grupo I7, vista agregada I6...):
      // se declara como hueco, no se inventa.
      granularidad: input.granularidad != null ? String(input.granularidad) : null,
      granularidad_declarada: input.granularidad != null && String(input.granularidad).trim() !== ''
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        cuadro,
        // Traza de COMPOSICION: de donde salio cada cifra (el jefe no recibe caja negra).
        fuentes: {
          caja: 'saldo-tesoreria',
          resultado: 'cuenta-resultados',
          margen: 'margen-analitico',
          desviacion: 'desviacion',
          cobertura: 'completitud-cobertura'
        },
        faltan,
        n_piezas: 4,
        n_disponibles: 4 - faltan.filter(f => f in piezas).length,
        abierto: faltan.length > 0,
        // El cuadro es de LECTURA: nada se decide aqui, solo se presenta.
        decide: false,
        publicable: true,
        motivo: faltan.length > 0
          ? 'el cuadro se compone con lo disponible; queda [ABIERTO] ' + faltan.join(', ')
            + ' (cada cifra la calcula su dueño; aqui no se recalcula nada)'
          : null
      }
    };
  }

  // ── Una pieza del cuadro: valor DECLARADO, o pedido a su dueño POR EVENTO (nunca recalculado) ──
  async _pieza(pid, nombre, input, rpcSpec, extractor) {
    // 1) Declarada en la peticion: se toma tal cual (dato del jefe o de quien la calculo).
    const decl = input[nombre];
    if (decl !== undefined && decl !== null && typeof decl !== 'object' && this._num(decl) !== null) {
      return { valor: this._num(decl), origen: 'declarado', fuente: 'declarado', signo: null };
    }
    if (decl && typeof decl === 'object') {
      return {
        valor: this._num(decl.valor != null ? decl.valor : decl.importe),
        origen: 'declarado',
        fuente: decl.fuente != null ? String(decl.fuente) : 'declarado',
        signo: decl.signo != null ? decl.signo : null,
        avisa: decl.avisa != null ? decl.avisa : null,
        umbral: this._num(decl.umbral)
      };
    }
    // 2) Pedida a su dueño POR EVENTO. Si el dueño no responde → null (no se inventa la cifra).
    if (!rpcSpec) return { valor: null, origen: null, fuente: null, signo: null };
    const [evento, payload, dueño] = rpcSpec;
    const r = await this._rpc(evento, payload, { timeout_ms: 5000 });
    const data = r && r.data ? r.data : null;
    if (!data) return { valor: null, origen: null, fuente: null, signo: null };
    return {
      valor: extractor ? extractor(data) : this._num(data.valor),
      // ORIGEN declarado: el jefe ve de donde sale cada cifra.
      origen: 'agregado',
      fuente: dueño,
      signo: data.signo ?? null,
      avisa: data.avisa ?? null,
      umbral: this._num(data.umbral)
    };
  }

  // ── LA metrica unica de cobertura: se LEE de completitud-cobertura (A12). NO se recalcula. ──
  async _cobertura(pid, input = {}) {
    if (input.cobertura && typeof input.cobertura === 'object') {
      return { medida: { ...input.cobertura, origen: 'declarada_en_peticion' } };
    }
    const r = await this._rpc('completitud-cobertura.medir.request',
      { project_id: pid, vertical: input.vertical != null ? input.vertical : null }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (data && data.cobertura && typeof data.cobertura === 'object') {
      return { medida: { ...data.cobertura, origen: 'completitud-cobertura' } };
    }
    // Sin metrica de cobertura: se declara el hueco; NO se estima una tasa (un 0 afirmaria una medida que no se hizo).
    return { medida: null };
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolComponer(params) { return this._componer(params); }
}

module.exports = CuadroMandoContable;
