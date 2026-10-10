'use strict';

/**
 * nichos/batch-validacion — REFLEJO JS (orquestador de micro-flujo) del vertical NICHOS.
 *
 * Saca candidatos de la cola, y por cada uno encadena:
 *   1. nichos.demanda.estudiar.request      → { informe }
 *   2. nichos.veredicto.emitir.request      → { veredicto }
 *   3. nichos.camino.decidir.request        → { camino }
 *   4. nichos.cortar.temprano.request       (si NO_VIABLE)
 *
 * Emite pulsos .lote.iniciado y .lote.completado con contadores + `detalle`
 * (la lista de viables con su informe/veredicto/camino) para que el
 * orquestador pueda encadenar el ensamblaje con el contrato correcto.
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
    const correlationId = input.correlation_id;

    // 1. Sacar candidatos de la cola.
    // La cola recibe el tamaño como `n` (su parámetro canónico). Se envía
    // también `tamano` por compatibilidad. La respuesta trae `lote` y su
    // alias `candidatos` — se aceptan ambos.
    const colResp = await this._rpc('nichos.cola.candidatos.sacar.request', {
      project_id: projectId,
      n: tamano,
      tamano
    }, { timeout_ms: 10000 });

    const cd = (colResp && colResp.data) || {};
    const candidatos = Array.isArray(cd.candidatos) ? cd.candidatos
      : Array.isArray(cd.lote) ? cd.lote
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
    const viablesIds = [];
    const detalle = []; // { id_nicho, informe, veredicto, camino } por cada VIABLE

    for (const candidato of candidatos) {
      const id_nicho = candidato.id_nicho || candidato.id;
      if (!id_nicho) continue;

      try {
        const r = await this._procesarCandidato(candidato, projectId);
        if (r.codigo === 'VIABLE') {
          viables++; viablesIds.push(id_nicho);
          detalle.push({
            id_nicho: r.id_nicho,
            informe: r.informe,
            veredicto: r.veredicto,
            camino: r.camino
          });
        } else if (r.codigo === 'NO_VIABLE') {
          no_viables++;
        } else {
          puentes++;
        }
      } catch (err) {
        this.logger?.error('batch-validacion.candidato.error', {
          id_nicho, error: err.message
        });
        // Honesto: un candidato que no se pudo evaluar NO es un viable.
        puentes++;
      }
    }

    // PULSO: lote completado.
    // Lleva `correlation_id` (el orquestador lo exige para hallar el ciclo),
    // los contadores y `detalle` (los nichos viables CON su informe/veredicto/
    // camino) para que el ensamblaje se dispare con el contrato correcto.
    this.eventBus?.publish('nichos.validacion.lote.completado', {
      project_id: projectId,
      lote_id,
      correlation_id: correlationId || null,
      viables,
      no_viables,
      puentes,
      resultados: viablesIds,
      detalle,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: { lote_id, procesados: candidatos.length, viables, no_viables, puentes }
    };
  }

  // =============================================================
  // Micro-flujo por candidato — CADA SALTO CON EL CONTRATO DEL CONSUMIDOR
  // =============================================================
  async _procesarCandidato(candidato, projectId) {
    const id_nicho = candidato.id_nicho || candidato.id;
    const semilla = (candidato.payload && candidato.payload.semilla) || {};

    // El estudio de demanda exige un OBJETO candidato con `.nombre`
    // (lo usa como query de fuentes externas y como etiqueta del prompt).
    // Antes se le pasaba solo `id_nicho` → "candidato requerido" (400) y
    // toda la validación se saltaba en silencio.
    const candidatoObj = {
      id: id_nicho,
      nombre: semilla.vertical_sugerido || semilla.titulo
        || semilla.texto_original || id_nicho,
      ...semilla
    };

    // 2a. Estudiar demanda → devuelve { informe }.
    const demandaResp = await this._rpc('nichos.demanda.estudiar.request', {
      project_id: projectId,
      candidato: candidatoObj
    }, { timeout_ms: 120000 });
    const informe = (demandaResp && demandaResp.data && demandaResp.data.informe) || null;

    // 2b. Emitir veredicto — exige `informe` (antes se le pasaba
    //     `estudio_demanda`, nombre que no reconoce → 400). Si no hay
    //     informe, NO se inventa un VIABLE: degradación honesta → PUENTE.
    let veredicto;
    if (!informe) {
      veredicto = { codigo: 'PUENTE', razon: 'sin_informe_demanda' };
    } else {
      const veredictoResp = await this._rpc('nichos.veredicto.emitir.request', {
        project_id: projectId,
        id_nicho,
        informe
      }, { timeout_ms: 90000 });
      veredicto = (veredictoResp && veredictoResp.data && veredictoResp.data.veredicto)
        || { codigo: 'PUENTE', razon: 'veredicto_no_emitido' };
    }

    const codigo = (veredicto && veredicto.codigo) || 'PUENTE';

    // 2d. Cortar si NO_VIABLE.
    if (codigo === 'NO_VIABLE') {
      await this._rpc('nichos.cortar.temprano.request', {
        project_id: projectId,
        id_nicho,
        veredicto
      }, { timeout_ms: 10000 });
      return { id_nicho, codigo };
    }

    // Ni VIABLE ni NO_VIABLE → PUENTE (necesita humano). No ensambla.
    if (codigo !== 'VIABLE') return { id_nicho, codigo };

    // 2c. Decidir camino — exige `informe` + `veredicto`.
    const caminoResp = await this._rpc('nichos.camino.decidir.request', {
      project_id: projectId,
      id_nicho,
      informe,
      veredicto
    }, { timeout_ms: 30000 });
    const camino = (caminoResp && caminoResp.data && caminoResp.data.camino)
      || { tipo: 'CONSTRUIR', razon: 'camino_no_decidido' };

    return { id_nicho, codigo, informe, veredicto, camino };
  }
}

module.exports = BatchValidacion;
