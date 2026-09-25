/**
 * nichos/corte-temprano — REFLEJO stateless (C6, hoja del plan).
 *
 * PROTEGE la salud financiera (F3): dado un VEREDICTO de viabilidad (C3,
 * nichos.veredicto.emitido), decide si el nicho PASA A CONSTRUCCION o se CORTA
 * a tiempo. REGLA DURA determinista: un veredicto NO_VIABLE NUNCA avanza a
 * construccion (estado ilegal NO_VIABLE -> CONSTRUIDO imposible). Los cortados
 * no sangran (protege F3); solo los viables entran al tramo caro con control.
 *
 * REFLEJO puro y determinista: sin estado, sin custodia, cada op es funcion pura
 * de su entrada.
 *
 *   _evaluar(veredicto) -> PasaAConstruccion:bool (NO_VIABLE -> false duro)
 *   _aplicar(resultado) -> emite el corte / pase al dominio
 *
 * Resultados:
 *   VIABLE   -> pasa_a_construccion = true  (entra al tramo caro con control)
 *   NO_VIABLE-> pasa_a_construccion = false, cortado = true  (CORTADO, no avanza)
 *   PUENTE   -> espera decision humana (no corta solo, no avanza solo): pendiente
 *
 * Publica nichos.corte.aplicado (+ nichos.corte.evaluar.failed si llega vacio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CorteTemprano extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'corte-temprano';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onEvaluarRequest(e) {
    return this._atender(e, 'evaluar', 'nichos.corte.evaluar.response', async (d) => {
      const res = this._evaluar(d);
      // Fire-and-forget de dominio: exito → aplica el corte/pase; fallo → par determinista.
      if (res.status === 200) {
        const aplicado = this._aplicar(res.data);
        this.eventBus?.publish('nichos.corte.aplicado', aplicado);
      } else {
        this.eventBus?.publish('nichos.corte.evaluar.failed', res);
      }
      return res;
    });
  }

  // ── REFLEJO puro: decide si el veredicto pasa a construccion ──
  _evaluar({ project_id, veredicto, nicho } = {}) {
    project_id = project_id || this.project_id;
    if (!veredicto || !veredicto.veredicto) {
      return this._errorResponse(400, 'VEREDICTO_INVALIDO', 'el veredicto de viabilidad es obligatorio para evaluar el corte', { project_id });
    }
    const v = veredicto.veredicto;
    const motivo = veredicto.motivo || null;
    const confianza = typeof veredicto.confianza === 'number' ? veredicto.confianza : null;

    // REGLA DURA: un NO_VIABLE NO pasa a construccion. Corte determinista.
    if (v === 'NO_VIABLE') {
      return {
        status: 200,
        data: {
          project_id,
          nicho: nicho || veredicto.candidato || null,
          veredicto: v,
          confianza,
          motivo,
          pasa_a_construccion: false,
          cortado: true,
          decision: 'CORTADO',
          evaluado: true
        }
      };
    }
    // VIABLE: entra al tramo caro con control (no se corta).
    if (v === 'VIABLE') {
      return {
        status: 200,
        data: {
          project_id,
          nicho: nicho || veredicto.candidato || null,
          veredicto: v,
          confianza,
          motivo,
          pasa_a_construccion: true,
          cortado: false,
          decision: 'PASA_A_CONSTRUCCION',
          evaluado: true
        }
      };
    }
    // PUENTE: no se corta solo ni avanza solo — espera decision humana (D2/K2).
    return {
      status: 200,
      data: {
        project_id,
        nicho: nicho || veredicto.candidato || null,
        veredicto: v,
        confianza,
        motivo,
        pasa_a_construccion: null,
        cortado: false,
        decision: 'PENDIENTE_DECISION',
        evaluado: true
      }
    };
  }

  // ── REFLEJO: materializa el corte/pase como dominio publicado ──
  _aplicar(d) {
    return {
      project_id: d.project_id,
      nicho: d.nicho,
      veredicto: d.veredicto,
      decision: d.decision,
      pasa_a_construccion: d.pasa_a_construccion,
      cortado: d.cortado,
      motivo: d.motivo,
      aplicado: true
    };
  }

  // ── Tools ──
  toolEvaluar(params) { return this._evaluar(params); }
}

module.exports = CorteTemprano;
