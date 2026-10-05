/**
 * nichos/ajustador-umbrales — REFLEJO JS del vertical NICHOS.
 *
 * Traduce respuestas de decision en declaraciones de ajuste a los custodios
 * pertinentes (criterio-viabilidad, perfil-limite, perfil-supervision).
 * Escucha nichos.decision.solicitud.respondida (F7b) para auto-ajustar
 * y atiende el RPC nichos.umbrales.ajustar.
 *
 * Destinos validos:
 *   CRITERIO            — propaga a nichos.criterio.viabilidad.declarar.request
 *   PERFIL_LIMITE       — propaga a nichos.perfil.limite.declarar.request
 *   PERFIL_SUPERVISION  — propaga a nichos.perfil.supervision.declarar.request
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/ajustador-umbrales.json
 *   { _version, _updated, historial: [ {destino, cambio, por_autor, at} ] }
 *
 * Patron: ModuloHibridoReflejo + PosPersistencia. Sin mitad blueprint.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

const DESTINOS = {
  CRITERIO: 'nichos.criterio.viabilidad.declarar.request',
  PERFIL_LIMITE: 'nichos.perfil.limite.declarar.request',
  PERFIL_SUPERVISION: 'nichos.perfil.supervision.declarar.request'
};

const DESTINOS_VALIDOS = Object.keys(DESTINOS);

class AjustadorUmbrales extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ajustador-umbrales';
    this.version = '0.1.0';
    this.historialPorProyecto = new Map(); // project_id → { historial: [] }

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'ajustador-umbrales.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ historial: (this.historialPorProyecto.get(pid) || {}).historial || [] }),
      hidratar: (pid, data) => {
        if (data && Array.isArray(data.historial)) {
          this.historialPorProyecto.set(pid, { historial: data.historial });
        }
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── RPC HANDLER ──
  onAjustarRequest(e) {
    return this._atender(e, 'ajustar', 'nichos.umbrales.ajustar.response', d => this._ajustar(d));
  }

  // ── FIRE-AND-FORGET: reaccion a decision respondida (F7b) ──
  onDecisionRespondida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.respuesta_decision || !d.project_id) return;

    const ajustes = this._extraerAjustes(d.respuesta_decision);
    if (!ajustes.length) return;

    for (const ajuste of ajustes) {
      this._propagar({
        project_id: d.project_id,
        destino: ajuste.destino,
        cambio: ajuste.cambio,
        por_autor: d.por_autor || 'sistema'
      });
    }
  }

  // =============================================================
  // Estado — historial por proyecto
  // =============================================================
  _historial(project_id) {
    let h = this.historialPorProyecto.get(project_id);
    if (!h) {
      h = { historial: [] };
      this.historialPorProyecto.set(project_id, h);
    }
    return h;
  }

  // =============================================================
  // PROYECCIONES
  // =============================================================
  _ajustar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.respuesta_decision) return this._invalid('respuesta_decision');

    const ajustes = this._extraerAjustes(input.respuesta_decision);
    if (!ajustes.length) {
      return {
        status: 200,
        data: { aplicados: [] }
      };
    }

    const aplicados = [];
    for (const ajuste of ajustes) {
      const resultado = this._propagar({
        project_id: input.project_id,
        destino: ajuste.destino,
        cambio: ajuste.cambio,
        por_autor: input.por_autor || 'sistema'
      });
      aplicados.push(resultado);
    }

    return {
      status: 200,
      data: { aplicados }
    };
  }

  /**
   * Extrae ajustes de la respuesta de decision.
   * La respuesta puede contener ajustes directos con destino y cambio.
   */
  _extraerAjustes(respuesta) {
    if (!respuesta || typeof respuesta !== 'object') return [];

    // Caso: ajustes explícitos en la respuesta.
    if (Array.isArray(respuesta.ajustes)) {
      return respuesta.ajustes.filter(a =>
        a && a.destino && DESTINOS_VALIDOS.includes(a.destino) && a.cambio
      );
    }

    // Caso: un solo ajuste con destino y cambio en la raíz.
    if (respuesta.destino && DESTINOS_VALIDOS.includes(respuesta.destino) && respuesta.cambio) {
      return [{ destino: respuesta.destino, cambio: respuesta.cambio }];
    }

    return [];
  }

  /**
   * Propaga un ajuste al custodio destino y registra en el historial.
   */
  _propagar(input) {
    const { project_id, destino, cambio, por_autor } = input;
    const topic = DESTINOS[destino];

    if (!topic) {
      this.eventBus?.publish('nichos.umbral.ajustado.failed', {
        project_id,
        code: 'DESTINO_DESCONOCIDO',
        message: `destino ${destino} no reconocido — validos: ${DESTINOS_VALIDOS.join(', ')}`,
        timestamp: nowISO()
      });
      return { destino, status: 'failed', code: 'DESTINO_DESCONOCIDO' };
    }

    // Publicar la declaracion al custodio destino.
    this.eventBus?.publish(topic, {
      project_id,
      por_autor,
      cambio
    });

    // Registrar en el historial.
    const entrada = { destino, cambio, por_autor, at: nowISO() };
    this._historial(project_id).historial.push(entrada);
    this._persist.marcarDirty(project_id);

    // Emitir pulso de ajuste aplicado.
    this.eventBus?.publish('nichos.umbral.ajustado', {
      project_id,
      destino,
      cambio,
      por_autor,
      timestamp: nowISO()
    });

    return { destino, status: 'ok' };
  }
}

module.exports = AjustadorUmbrales;
