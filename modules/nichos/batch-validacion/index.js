'use strict';

/**
 * nichos/batch-validacion — REFLEJO JS (orquestador de micro-flujo) del vertical NICHOS.
 *
 * Saca candidatos de la cola, y por cada uno encadena:
 *   1. nichos.demanda.estudiar.request
 *   2. nichos.veredicto.emitir.request
 *   3. nichos.camino.decidir.request
 *   4. nichos.cortar.temprano.request (si NO_VIABLE)
 *
 * Emite pulsos .lote.iniciado y .lote.completado con contadores.
 *
 * Sin estado propio — orquesta via _rpc sobre el bus.
 * Patron: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();
const TAMANO_DEFAULT = 5;

class BatchValidacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'batch-validacion';
    this.version = '0.1.0';
  }

  // -- RPC HANDLER --
  onCorrerRequest(e) {
    return this._atender(e, 'correr', 'nichos.validacion.lote.correr.response', d => this._correr(d));
  }

  // =============================================================
  // PROYECCION: _correr (saca N de cola y encadena micro-flujos)
  // =============================================================
  async _correr(input) {
    const tamano = (typeof input.tamano === 'number' && input.tamano > 0)
      ? input.tamano
      : TAMANO_DEFAULT;

    const lote_id = `lote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const projectId = input.project_id;

    // 1. Sacar candidatos de la cola.
    const colResp = await this._rpc('nichos.cola.candidatos.sacar.request', {
      project_id: projectId,
      tamano
    }, { timeout_ms: 10000 });

    const candidatos = (colResp && colResp.data && Array.isArray(colResp.data.candidatos))
      ? colResp.data.candidatos
      : [];

    if (candidatos.length === 0) {
      return {
        status: 200,
        data: { lote_id, procesados: 0, razon: 'cola_vacia' }
      };
    }

    // PULSO: lote iniciado.
    this.eventBus?.publish('nichos.validacion.lote.iniciado', {
      project_id: projectId,
      lote_id,
      candidatos_total: candidatos.length,
      timestamp: nowISO()
    });

    // 2. Procesar cada candidato en serie.
    let viables = 0;
    let no_viables = 0;
    let puentes = 0;

    for (const candidato of candidatos) {
      const id_nicho = candidato.id_nicho || candidato.id;
      if (!id_nicho) continue;

      try {
        const resultado = await this._procesarCandidato(id_nicho, projectId);
        if (resultado === 'VIABLE') viables++;
        else if (resultado === 'NO_VIABLE') no_viables++;
        else if (resultado === 'PUENTE') puentes++;
        else viables++; // default seguro
      } catch (err) {
        this.logger?.error('batch-validacion.candidato.error', {
          id_nicho, error: err.message
        });
        // Continuar con el siguiente candidato.
      }
    }

    // PULSO: lote completado.
    this.eventBus?.publish('nichos.validacion.lote.completado', {
      project_id: projectId,
      lote_id,
      viables,
      no_viables,
      puentes,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: { lote_id, procesados: candidatos.length, viables, no_viables, puentes }
    };
  }

  // =============================================================
  // Micro-flujo por candidato
  // =============================================================
  async _procesarCandidato(id_nicho, projectId) {
    // 2a. Estudiar demanda.
    const demandaResp = await this._rpc('nichos.demanda.estudiar.request', {
      project_id: projectId,
      id_nicho
    }, { timeout_ms: 15000 });

    const estudio_demanda = (demandaResp && demandaResp.data) || {};

    // 2b. Emitir veredicto.
    const veredictoResp = await this._rpc('nichos.veredicto.emitir.request', {
      project_id: projectId,
      id_nicho,
      estudio_demanda
    }, { timeout_ms: 10000 });

    const veredicto = (veredictoResp && veredictoResp.data && veredictoResp.data.veredicto)
      || { codigo: 'VIABLE' };

    // 2c. Decidir camino.
    await this._rpc('nichos.camino.decidir.request', {
      project_id: projectId,
      id_nicho,
      veredicto
    }, { timeout_ms: 10000 });

    // 2d. Cortar si NO_VIABLE.
    const codigo = veredicto.codigo || veredicto;
    if (codigo === 'NO_VIABLE') {
      await this._rpc('nichos.cortar.temprano.request', {
        project_id: projectId,
        id_nicho,
        veredicto
      }, { timeout_ms: 10000 });
      return 'NO_VIABLE';
    }

    if (codigo === 'PUENTE') return 'PUENTE';
    return 'VIABLE';
  }
}

module.exports = BatchValidacion;
