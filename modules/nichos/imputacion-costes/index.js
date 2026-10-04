/**
 * nichos/imputacion-costes — REFLEJO JS del vertical NICHOS.
 *
 * Agrega coste de un proyecto hasta un instante dado por categoria.
 * Sin estado propio: consulta por bus a registro-cobros e
 * imputacion-coste-fuente, agrega y responde.
 *
 * Patron: ModuloHibridoReflejo. REFLEJO puro (sin persistencia).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class ImputacionCostes extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'imputacion-costes';
    this.version = '0.1.0';
  }

  // ── RPC HANDLER ──
  onImputarRequest(e) {
    return this._atender(e, 'imputar', 'nichos.costes.imputar.response', d => this._imputar(d));
  }

  // =============================================================
  // PROYECCION — agrega coste por categoria
  // =============================================================

  /**
   * _imputar — agrega coste proyecto hasta instante consultando fuentes por bus.
   *
   * @param {Object} input
   * @param {string} input.id_proyecto
   * @param {string} [input.hasta] - ISO timestamp; default ahora
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _imputar(input) {
    if (!input.id_proyecto) return this._invalid('id_proyecto');

    const hasta = input.hasta || nowISO();

    // Consultar ambas fuentes en paralelo via bus
    const [costeFuentes, costeCobros] = await Promise.all([
      this._consultarFuentes(input.id_proyecto, hasta),
      this._consultarCobros(input.id_proyecto, hasta)
    ]);

    const coste_total = {
      fuentes: costeFuentes,
      cobros: costeCobros,
      total: (costeFuentes.total || 0) + (costeCobros.total || 0),
      hasta,
      timestamp: nowISO()
    };

    return {
      status: 200,
      data: { coste_total }
    };
  }

  // =============================================================
  // Consultas al bus
  // =============================================================

  /**
   * Consulta coste de fuentes via RPC a imputacion-coste-fuente.
   */
  async _consultarFuentes(id_proyecto, hasta) {
    if (!this.eventBus?.publishAndWait) return { total: 0, detalle: [] };
    try {
      const resp = await this.eventBus.publishAndWait(
        'nichos.fuente.coste.consultar.request',
        { id_proyecto, hasta }
      );
      return (resp && resp.data) || { total: 0, detalle: [] };
    } catch (_) {
      // Degradacion honesta: fuente no disponible, coste = 0
      return { total: 0, detalle: [], error: 'fuente_no_disponible' };
    }
  }

  /**
   * Consulta cobros via RPC a registro-cobros.
   */
  async _consultarCobros(id_proyecto, hasta) {
    if (!this.eventBus?.publishAndWait) return { total: 0, detalle: [] };
    try {
      const resp = await this.eventBus.publishAndWait(
        'nichos.registro.cobros.consultar.request',
        { id_proyecto, hasta }
      );
      return (resp && resp.data) || { total: 0, detalle: [] };
    } catch (_) {
      // Degradacion honesta: cobros no disponible, coste = 0
      return { total: 0, detalle: [], error: 'cobros_no_disponible' };
    }
  }
}

module.exports = ImputacionCostes;
