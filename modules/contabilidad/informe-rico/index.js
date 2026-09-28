/**
 * contabilidad/informe-rico — REFLEJO STATELESS (K3, hoja del plan).
 *
 * EL NUCLEO DEL INFORME RICO: cifra YA calculada + contexto DECLARADO (periodo,
 * origen, comparativas, cobertura). No un numero pelado — el requisito del dueno
 * ("informacion rica") materializado en su nucleo MECANICO.
 *
 * INVARIANTE DE COMPOSICION: este modulo COMPONE (cifra + contexto). JAMAS mete
 * juicio dentro del reflejo: la NARRACION ("esto es lo que te ha pasado") es del
 * satelite informe-accionable (R3) y el "QUE HACER" tambien (R2). Aqui solo se
 * monta el informe: nada de recomendaciones, nada de prosa generada. Determinista:
 * misma cifra + mismo contexto → mismo informe (un test lo afirma).
 *
 * LA METRICA UNICA SIGUE SIENDO UNA: si el informe muestra cobertura, LEE
 * completitud-cobertura (A12) por EVENTO `contabilidad.cobertura.calcular.request`
 * — no la recalcula. La comparativa la aporta presupuesto (J4/J9) por EVENTO; el
 * estado del periodo lo aporta cierre-ejercicio (C4) por EVENTO. Lo que no
 * responde SE DECLARA (dependencias_no_disponibles) y jamas se rellena con un
 * contexto inventado (contrato TOLERANTE).
 *
 * REFLEJO stateless (patron real): SIN PosPersistencia y SIN project.activated en
 * el CODIGO — cada op entra objeto y sale objeto; el informe es una composicion
 * viva, no una parcela. Dependencia entre modulos por EVENTO, NUNCA por require
 * cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.informe_compuesto; error su par
 * determinista. NO REUTILIZA: el nucleo de informe rico se sirve en idiomas
 * distintos (dueno Q2 / cliente R3); no existe en el inventario.
 *
 * Ver hoja K3 del diseno-oop y bloque `informe-rico` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos de contexto que el nucleo sabe componer (DECLARABLES si faltan).
const CAMPOS_CONTEXTO = ['periodo', 'origen', 'comparativa', 'cobertura', 'estado_periodo'];

class InformeRico extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'informe-rico';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. El informe es composicion viva.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onComponerRequest(e) {
    return this._atender(e, 'componer', 'contabilidad.informe.componer.response', async (d) => {
      const res = await this._componer(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.informe_compuesto', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.informe.componer.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion pura (composicion, mecanica) ──
  // componer(cifra, contexto) -> InformeRico (K3). COMPONE, no juzga ni narra.
  async _componer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const cifra = (input && (input.cifra || input.resultado_calculo)) || null;
    if (!cifra || typeof cifra !== 'object') return this._invalid('cifra');

    const noDisponibles = [];

    // ── Contexto DECLARADO (payload) o aportado por EVENTO ──
    const periodo = (input && input.periodo) || (cifra && cifra.periodo) || null;

    // Comparativa (J4/J9 de presupuesto) por EVENTO si no viene declarada.
    let comparativa = (input && input.comparativa) || null;
    if (!comparativa && input && input.con_comparativa !== false) {
      const r = await this._rpc('contabilidad.periodos.comparar.request', {
        project_id: pid, tipo: (input && input.tipo_comparacion) || 'REAL_VS_PRESUPUESTO', periodo
      }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) comparativa = r.data;
      else noDisponibles.push('presupuesto');
    }

    // Cobertura (A12) por EVENTO — LA METRICA UNICA. No se recalcula aqui.
    let cobertura = (input && input.cobertura) || null;
    if (!cobertura && input && input.con_cobertura !== false) {
      const r = await this._rpc('contabilidad.cobertura.calcular.request', { project_id: pid, periodo }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) cobertura = r.data;
      else noDisponibles.push('completitud-cobertura');
    }

    // Estado del periodo (C4) por EVENTO.
    let estadoPeriodo = (input && input.estado_periodo) || null;
    if (!estadoPeriodo && input && input.con_estado === true) {
      const r = await this._rpc('contabilidad.cierre.estado.request', { project_id: pid, periodo }, { timeout_ms: 4000 });
      if (r && r.status === 200 && r.data) estadoPeriodo = r.data;
      else noDisponibles.push('cierre-ejercicio');
    }

    const informe = {
      // ── la CIFRA tal cual viene ya calculada (no se recalcula) ──
      cifra: {
        valor: this._valorDeCifra(cifra),
        etiqueta: (cifra.etiqueta || cifra.concepto || cifra.tipo) || null,
        unidad: (cifra.unidad || cifra.moneda) || 'EUR',
        detalle: cifra
      },
      // ── el CONTEXTO declarado compuesto (periodo, origen, comparativas, cobertura) ──
      contexto: {
        periodo,
        origen: (input && input.origen) || (cifra && cifra.origen) || null,
        comparativa: comparativa ? {
          tipo: comparativa.tipo || null,
          a: comparativa.a !== undefined ? comparativa.a : null,
          b: comparativa.b !== undefined ? comparativa.b : null,
          delta: comparativa.delta !== undefined ? comparativa.delta : null,
          delta_pct: comparativa.delta_pct !== undefined ? comparativa.delta_pct : null
        } : null,
        // LA METRICA UNICA: se muestra LEIDA de A12, jamas recalculada.
        cobertura: cobertura ? {
          tasa: cobertura.tasa !== undefined ? cobertura.tasa : null,
          esperados: cobertura.esperados !== undefined ? cobertura.esperados : null,
          recibidos: cobertura.recibidos !== undefined ? cobertura.recibidos : null,
          huecos: cobertura.huecos !== undefined ? cobertura.huecos : null,
          senal: cobertura.senal || null,
          es_metrica_unica: true,
          recalculada_aqui: false
        } : null,
        estado_periodo: estadoPeriodo ? {
          estado: this._estadoDe(estadoPeriodo),
          detalle: estadoPeriodo
        } : null,
        campos_declarables: CAMPOS_CONTEXTO
      },
      // ── lo que este nucleo NO hace: se declara para no confundir composicion con juicio ──
      compuesto: true,
      composicion_mecanica: true,
      narracion: null,
      que_hacer: null,
      narracion_en: 'informe-accionable (R3)',
      que_hacer_en: 'informe-accionable (R2)',
      determinista: true
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        informe,
        numero_pelado: false,
        dependencias_no_disponibles: noDisponibles,
        nota: 'COMPONE cifra + contexto (mecanico); el juicio (narracion y que-hacer) vive en el satelite informe-accionable'
      }
    };
  }

  // ── helpers internos ──
  _valorDeCifra(cifra) {
    if (cifra.valor !== undefined) return cifra.valor;
    if (cifra.total !== undefined) return cifra.total;
    if (cifra.resultado !== undefined) return cifra.resultado;
    if (cifra.margen !== undefined && typeof cifra.margen === 'object') return cifra.margen.margen;
    if (cifra.margen !== undefined) return cifra.margen;
    return null;
  }

  _estadoDe(estadoPeriodo) {
    const ultimo = (estadoPeriodo.ultimo_nivel2 || estadoPeriodo.cierre_del_periodo || estadoPeriodo.cierre) || null;
    if (ultimo && ultimo.estado) return ultimo.estado;
    if (estadoPeriodo.n_cierres !== undefined) return estadoPeriodo.n_cierres > 0 ? 'CON_CIERRES' : 'ABIERTO';
    return estadoPeriodo.estado || 'ABIERTO';
  }

  // ── Tools ──
  toolComponer(params) { return this._componer(params); }
}

module.exports = InformeRico;
