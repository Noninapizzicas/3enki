/**
 * contabilidad-analitica/informe-rico — REFLEJO STATELESS (K3, hoja del plan).
 *
 * COMPONE la cifra ya calculada con el contexto DECLARADO. El informe NO calcula
 * la cifra (eso es de mayor-balanza / balance-situacion / cuenta-resultados): la
 * RECIBE ya calculada y la RODEA de su contexto (periodo, unidad, criterio, comparativa)
 * para que sea legible. La NARRACION fuzzy vive en la hoja R3; el "que hacer" en R2.
 *
 * Invariante: dato ausente = desconocido. Sin cifra NO se compone nada (no se estima).
 * Lo que falta (periodo, unidad, criterio…) NO se rellena: se declara en `abierto`.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.asiento_asentado` y
 * `contabilidad.ejercicio_cerrado`. NINGUN modulo del repo los emite AUN (los emite
 * `escritor-diario` B2 y `cierre-ejercicio` C4, de grupos posteriores): declararlos
 * daria cadena colgada. NO se declaran hasta que su emisor exista.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja K3 del plan-construccion y diseno-oop.md (CLASE InformeRico).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// El contexto DECLARABLE que rodea a la cifra. No se inventa ninguno: si no viene, queda abierto.
const CAMPOS_CONTEXTO = ['periodo', 'unidad', 'criterio', 'comparativa', 'dimension', 'sociedad', 'nota'];

class InformeRico extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'informe-rico';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onComponerRequest(e) {
    return this._atender(e, 'componer', 'informe-rico.componer.response', async (d) => {
      const res = this._componer(d);
      // Reflejo: compone y declara; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('informe-rico.componer.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // componer(cifra, contexto) → informe (la cifra ya calculada + su contexto)
  // ══════════════════════════════════════════════════════════════════════
  _componer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La CIFRA viene YA CALCULADA. Este modulo NO la calcula: la compone.
    const cifra = input.cifra !== undefined ? input.cifra : input.cifra_calculada;
    if (cifra === undefined || cifra === null) {
      // Sin cifra NO se estima: no hay informe que componer.
      return this._invalid('cifra');
    }

    // El CONTEXTO declarado: solo lo que viene. Lo ausente NO se rellena → se declara abierto.
    const contexto = this._contexto(input);
    const abierto = {};
    for (const campo of CAMPOS_CONTEXTO) {
      if (contexto[campo] === null) {
        abierto[campo] = `sin ${campo} declarado: el informe lo declara, no lo inventa`;
      }
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'informe-rico',
        titulo: input.titulo != null ? String(input.titulo) : null,
        // La cifra tal cual llega: se COMPONE, no se recalcula.
        cifra,
        cifra_calculada_por: input.calculo_de != null ? String(input.calculo_de) : (input.origen_cifra != null ? String(input.origen_cifra) : null),
        contexto,
        // La composicion es determinista: misma cifra + mismo contexto → mismo informe.
        compuesto: true,
        recalculo: false,
        narracion_incluida: false,   // la narracion fuzzy vive en R3
        accion_incluida: false,      // el "que hacer" vive en R2
        abierto
      }
    };
  }

  // El contexto: DECLARADO, nunca estimado. Ausente → null (y se declara en `abierto`).
  _contexto(input = {}) {
    const raw = (input.contexto && typeof input.contexto === 'object') ? input.contexto : input;
    const out = {};
    for (const campo of CAMPOS_CONTEXTO) {
      const v = raw[campo];
      out[campo] = (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) ? null : v;
    }
    return out;
  }

  // ── Tools ──
  toolComponer(params) { return this._componer(params); }
}

module.exports = InformeRico;
