/**
 * contabilidad/cuadro-mando-contable — REFLEJO STATELESS (J8, hoja del plan).
 *
 * EL CUADRO DEL JEFE. Agregacion de CONJUNTO (caja · resultado · margen ·
 * desviacion · ejercicio) bajo la lente del JEFE: NO baja al asiento. Todo lo que
 * muestra lo AGREGA de lo que otros ya derivan, sin recalcularlo:
 *   · caja        → saldo-tesoreria (E4/E5)  por EVENTO contabilidad.tesoreria.saldo.request
 *   · resultado   → estados-contables (C2)   por EVENTO contabilidad.estado.resultado.request
 *   · margen      → margen-analitico (J2/J10) por EVENTO contabilidad.margen.calcular.request
 *                   / contabilidad.tablero.cruzar.request
 *   · desviacion  → presupuesto (J4)         por EVENTO contabilidad.desviacion.calcular.request
 *   · ejercicio   → cierre-ejercicio (C4)    por EVENTO contabilidad.cierre.estado.request
 *
 * INVARIANTE DURA: el cuadro NO baja al asiento. No lee el diario, no compone
 * apuntes, no recalcula el resultado ni la caja: agrega las proyecciones de
 * conjunto que ya existen. Si una fuente no responde, se DECLARA su ausencia en el
 * cuadro (dependencias_no_disponibles) y jamas se rellena con un numero inventado
 * (contrato TOLERANTE: cada seccion trae su disponible:true|false).
 *
 * REFLEJO stateless (patron real): SIN PosPersistencia y SIN project.activated en
 * el CODIGO — cada op entra objeto y sale objeto; el cuadro es una agregacion
 * viva, no una parcela. Dependencia entre modulos por EVENTO, NUNCA por require
 * cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.cuadro_mando_calculado; error su
 * par determinista. NO REUTILIZA: no existe cuadro de mando contable; reutiliza
 * J2/J3/J4/E4/E5/C1/C2 por RPC sin duplicarlos.
 *
 * Ver hoja J8 del diseno-oop y bloque `cuadro-mando-contable` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Lente unica de esta hoja: CONJUNTO (no se baja al asiento).
const LENTE = 'CONJUNTO';

class CuadroMandoContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuadro-mando-contable';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. El cuadro es agregacion viva.
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onAgregarRequest(e) {
    return this._atender(e, 'agregar', 'contabilidad.cuadro_mando.agregar.response', async (d) => {
      const res = await this._agregar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.cuadro_mando_calculado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.cuadro_mando.agregar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion pura (agregacion) ──
  // agregar(lente: CONJUNTO) -> CuadroMando (J8). Agrega SIN bajar al asiento.
  async _agregar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const periodo = (input && input.periodo) || null;
    const noDisponibles = [];

    // ── caja (E4/E5) por EVENTO — no se recalcula el saldo de tesoreria ──
    let caja = null;
    if (input && input.caja) {
      caja = input.caja;
    } else {
      const r = await this._rpc('contabilidad.tesoreria.saldo.request', { project_id: pid, periodo }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) caja = r.data;
      else noDisponibles.push('saldo-tesoreria');
    }

    // ── resultado (C2) por EVENTO — no se recompone la cuenta de resultados ──
    let resultado = null;
    if (input && input.resultado) {
      resultado = input.resultado;
    } else {
      const r = await this._rpc('contabilidad.estado.resultado.request', { project_id: pid, periodo }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) resultado = r.data.resultado || r.data;
      else noDisponibles.push('estados-contables');
    }

    // ── margen (J2/J10) por EVENTO — no se recalcula el margen ──
    // Acepta el margen de UNA dimension (dimension declarada) o el tablero cruzado.
    let margen = null;
    if (input && input.margen) {
      margen = input.margen;
    } else if (input && input.dimension) {
      const r = await this._rpc('contabilidad.margen.calcular.request', { project_id: pid, periodo, dimension: input.dimension }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) margen = r.data;
      else noDisponibles.push('margen-analitico');
    } else {
      const r = await this._rpc('contabilidad.tablero.cruzar.request', { project_id: pid, periodo }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) margen = r.data;
      else noDisponibles.push('margen-analitico');
    }

    // ── desviacion (J4) por EVENTO — no se recalcula real-vs-objetivo ──
    let desviacion = null;
    if (input && input.desviacion) {
      desviacion = input.desviacion;
    } else {
      const r = await this._rpc('contabilidad.desviacion.calcular.request', {
        project_id: pid, periodo, dimension: input && input.dimension
      }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) desviacion = r.data;
      else noDisponibles.push('presupuesto');
    }

    // ── ejercicio (C4) por EVENTO — estado del cierre, no el asiento ──
    let ejercicio = null;
    if (input && input.ejercicio) {
      ejercicio = input.ejercicio;
    } else {
      const r = await this._rpc('contabilidad.cierre.estado.request', { project_id: pid, periodo }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) ejercicio = r.data;
      else noDisponibles.push('cierre-ejercicio');
    }

    const secciones = {
      caja: { disponible: caja !== null, datos: caja },
      resultado: { disponible: resultado !== null, datos: resultado },
      margen: { disponible: margen !== null, datos: margen },
      desviacion: { disponible: desviacion !== null, datos: desviacion },
      ejercicio: { disponible: ejercicio !== null, datos: ejercicio }
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        lente: LENTE,
        cuadro: {
          caja: this._resumenCaja(caja),
          resultado: this._resumenResultado(resultado),
          margen: this._resumenMargen(margen),
          desviacion: this._resumenDesviacion(desviacion),
          ejercicio: this._resumenEjercicio(ejercicio)
        },
        secciones,
        agregado: true,
        no_baja_al_asiento: true,
        dependencias_no_disponibles: noDisponibles,
        n_secciones_disponibles: Object.values(secciones).filter((s) => s.disponible).length,
        determinista: true,
        nota: 'agregacion de CONJUNTO (caja · resultado · margen · desviacion · ejercicio) SIN bajar al asiento'
      }
    };
  }

  // ── resumenes (agregacion, deterministas) ──
  _resumenCaja(caja) {
    if (caja === null) return { caja: null, disponible: false };
    return {
      caja: this._round(Number(caja.total !== undefined ? caja.total : caja.caja) || 0, 2),
      posicion_real: caja.posicion_real || null,
      n_cuentas: caja.n_cuentas !== undefined ? caja.n_cuentas : null,
      disponible: true
    };
  }

  _resumenResultado(resultado) {
    if (resultado === null) return { resultado: null, ingreso: null, gasto: null, disponible: false };
    const r = resultado.resultado || resultado;
    const ingreso = r && r.ingresos ? (r.ingresos.total !== undefined ? r.ingresos.total : r.ingresos) : (r && r.ingreso);
    const gasto = r && r.gastos ? (r.gastos.total !== undefined ? r.gastos.total : r.gastos) : (r && r.gasto);
    return {
      resultado: this._round(Number(r && r.resultado !== undefined ? r.resultado : r) || 0, 2),
      ingreso: ingreso !== undefined && ingreso !== null ? this._round(Number(ingreso) || 0, 2) : null,
      gasto: gasto !== undefined && gasto !== null ? this._round(Number(gasto) || 0, 2) : null,
      disponible: true
    };
  }

  _resumenMargen(margen) {
    if (margen === null) return { margen: null, disponible: false };
    // Puede venir de J2 (uno) o de J10 (tablero).
    const m = margen.margen || {};
    const total = margen.totales || null;
    return {
      margen: this._round(Number((m && m.margen !== undefined) ? m.margen : (total && total.margen)) || 0, 2),
      ingreso: this._round(Number((m && m.ingreso !== undefined) ? m.ingreso : (total && total.ingreso)) || 0, 2),
      coste_imputado: this._round(Number((m && m.coste_imputado !== undefined) ? m.coste_imputado : (total && total.coste_imputado)) || 0, 2),
      por_dimension: margen.por_dimension || null,
      lente: margen.lente || LENTE,
      disponible: true
    };
  }

  _resumenDesviacion(desviacion) {
    if (desviacion === null) return { desviacion: null, disponible: false };
    return {
      desviacion: desviacion.desviacion !== undefined ? this._round(Number(desviacion.desviacion) || 0, 2) : null,
      desviacion_pct: desviacion.desviacion_pct !== undefined ? desviacion.desviacion_pct : null,
      signo: desviacion.signo || null,
      umbral_declarado: !!desviacion.umbral_declarado,
      excede: !!desviacion.excede,
      senal: desviacion.senal || null,
      disponible: true
    };
  }

  _resumenEjercicio(ejercicio) {
    if (ejercicio === null) return { estado: null, disponible: false };
    const ultimo = (ejercicio.ultimo_nivel2 || ejercicio.cierre_del_periodo || ejercicio.cierre) || null;
    return {
      estado: ultimo ? (ultimo.estado || 'CERRADO') : (ejercicio.cierres ? 'CON_CIERRES' : 'ABIERTO'),
      n_cierres: ejercicio.n_cierres !== undefined ? ejercicio.n_cierres : null,
      ultimo_cierre: ultimo,
      disponible: true
    };
  }

  // ── Tools ──
  toolAgregar(params) { return this._agregar(params); }
}

module.exports = CuadroMandoContable;
