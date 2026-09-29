/**
 * contabilidad-analitica/informe-rico — REFLEJO STATELESS (K3, hoja del plan).
 *
 * **COMPONE: cifra + contexto.** Toma una CIFRA ya calculada por otra pieza y la viste con
 * el CONTEXTO DECLARADO: el periodo, el origen (de donde sale la cifra), la unidad, la
 * comparativa (contra que se compara) y las notas declaradas. Mecanico y determinista.
 *
 * AQUI SOLO LA COMPOSICION. La NARRACION fuzzy (escribir el parrafo que lo explica), el
 * «que hacer» y el lenguaje del dueño NO viven aqui: son satelites posteriores
 * (`informe-accionable`, `narrador-estados`, `puente-lenguaje-dueno`, oleada 14). Este
 * reflejo NO interpreta, NO recomienda y NO decide nada — ordena lo que ya le dan.
 *
 * ATRIBUTOS del diseno: `cifra:Derivado`, `contexto:ParametroDeclarable`.
 * METODOS: `componer(cifra, contexto):Informe`.
 *
 * Invariantes:
 *  - DETERMINISTA: misma cifra + mismo contexto → mismo informe (una sola respuesta correcta).
 *  - Dato ausente = desconocido: sin cifra NO se compone un informe con un 0; se declara
 *    `compuesto:false` con lo que falta. La cifra NO se recalcula aqui: se recibe declarada
 *    o se PIDE a su fuente POR EVENTO (informe-conciliacion, best-effort).
 *  - LEY/PARAMETRO COMO DATO: periodo, unidad, comparativa y notas son DECLARABLES; cero
 *    plantillas de informe cableadas.
 *  - NO escribe, NO persiste, NO muta: el informe es un DERIVADO en memoria.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja K3 del plan-construccion y diseno-oop.md (CLASE InformeRico).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class InformeRico extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'informe-rico';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onComponerRequest(e) {
    return this._atender(e, 'componer', 'informe-rico.componer.response', async (d) => {
      const res = await this._componer(d);
      if (res.status !== 200) this.eventBus?.publish('informe-rico.componer.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: componer(cifra, contexto) → Informe (compone, no narra) ──
  async _componer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // 1 · La CIFRA: la que viene declarada o, si no, la que da su FUENTE por EVENTO.
    const { cifra, fuente, disponible } = await this._cifra(pid, input);

    // 2 · El CONTEXTO es todo dato DECLARADO. Nada se deduce de la cifra.
    const contexto = {
      periodo: input.periodo != null ? String(input.periodo) : null,
      fecha_desde: input.fecha_desde != null ? String(input.fecha_desde) : null,
      fecha_hasta: input.fecha_hasta != null ? String(input.fecha_hasta) : null,
      unidad: input.unidad != null ? String(input.unidad) : null,
      moneda: input.moneda != null ? String(input.moneda) : null,
      // De donde sale la cifra: declarado por el llamante o la fuente que respondio.
      origen: input.origen != null ? String(input.origen) : fuente,
      // Contra que se compara (periodo anterior, objetivo, presupuesto...): DECLARADO.
      comparativa: input.comparativa !== undefined ? input.comparativa : null,
      dimension: input.dimension != null ? String(input.dimension) : null,
      sociedad: input.sociedad != null ? String(input.sociedad) : null,
      // Notas libres declaradas por quien pide el informe. No se generan aqui.
      notas: Array.isArray(input.notas) ? input.notas.map((n) => String(n)) : []
    };

    // 3 · Sin cifra NO se compone un informe con un 0. Se declara y se dice que falta.
    const compuesto = disponible;
    const faltan = [];
    if (!disponible) faltan.push('cifra');
    if (contexto.periodo === null) faltan.push('periodo');

    const informe = compuesto ? {
      cifra,
      contexto,
      // La composicion es MECANICA: se ordena el dato ya calculado con su contexto. Ni una
      // palabra de narracion (eso es de los satelites K14/K15/oleada 14).
      narracion: null,
      narracion_por: 'satelites (informe-accionable, narrador-estados, puente-lenguaje-dueno)',
      que_hacer: null,
      compuesto_en: new Date().toISOString()
    } : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'informe-rico',
        emitido: compuesto,
        informe,
        // Se declara SIEMPRE de donde salio la cifra y si la fuente respondio.
        cifra,
        fuente_cifra: fuente,
        cifra_disponible: disponible,
        contexto,
        // Solo la composicion: lo fuzzy y el "que hacer" NO se fabrican aqui.
        compone: ['cifra', 'contexto'],
        delega_a: {
          narracion: 'narrador-estados (K15) / puente-lenguaje-dueno (oleada 14)',
          que_hacer: 'informe-accionable (K14)'
        },
        faltan,
        abierto: {
          cifra: disponible ? null : 'la cifra no llega declarada y su fuente no respondio: NO se compone un informe con un 0',
          periodo: contexto.periodo ? null : 'el periodo no esta declarado',
          narracion: 'la narracion NO vive aqui: la componen los satelites fuzzy (K14/K15)',
          que_hacer: 'el "que hacer" NO vive aqui: lo compone informe-accionable (K14)'
        }
      }
    };
  }

  // La CIFRA declarada, o pedida a su fuente POR EVENTO (best-effort). Nunca se recalcula.
  async _cifra(pid, input) {
    if (input.cifra && typeof input.cifra === 'object') {
      return { cifra: input.cifra, fuente: input.origen != null ? String(input.origen) : 'declarado', disponible: true };
    }
    if (input.cifra !== undefined && input.cifra !== null) {
      // Cifra escalar declarada: se viste como objeto con su valor.
      const valor = this._numero(input.cifra);
      return {
        cifra: { valor, valor_declarado: valor !== null },
        fuente: input.origen != null ? String(input.origen) : 'declarado',
        disponible: valor !== null
      };
    }
    // Sin cifra declarada: se PIDE a la fuente del informe de cuadre (E10) POR EVENTO.
    const r = await this._rpc('informe-conciliacion.componer.request',
      { project_id: pid, periodo: input.periodo, cuenta: input.cuenta }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (data && data.emitido === true) {
      return {
        cifra: { tipo: 'informe-conciliacion', ...data },
        fuente: 'informe-conciliacion',
        disponible: true
      };
    }
    return { cifra: null, fuente: data ? 'informe-conciliacion' : null, disponible: false };
  }

  _numero(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolComponer(params) { return this._componer(params); }
}

module.exports = InformeRico;
