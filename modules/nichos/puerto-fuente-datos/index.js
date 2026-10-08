/**
 * nichos/puerto-fuente-datos — PUENTE JS (bloque J del vertical NICHOS, J1).
 *
 * Fachada que orquesta el consumo de fuentes externas (crawl4rs, APIs) sin que
 * el consumidor conozca el proveedor. Flujo:
 *   1. Pre-check de límites (J3 gestion-limites-fuente)
 *   2. Llamada externa via bus (crawl4rs.buscar / crawl4rs.leer)
 *   3. Normalización (J2 conversor-fuente)
 *   4. Imputación de coste (J4 imputacion-coste-fuente)
 *   5. PULSO nichos.fuente.consumida
 *   6. Response al solicitante
 *
 * Sin estado propio — es orquestador de paso. No hace HTTP directo: toda
 * llamada externa se delega al bus (desacoplamiento total).
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

/**
 * Mapa fuente.tipo → topic de crawl4rs que resuelve la llamada.
 * El PUENTE no conoce la implementación de crawl4rs, solo el topic del bus.
 */
const FUENTE_TOPIC = {
  buscar: 'crawl4rs.buscar.request',
  leer:   'crawl4rs.leer.request'
};

class PuertoFuenteDatos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-fuente-datos';
    this.version = '0.1.0';
  }

  // ── RPC HANDLER ──
  onConsumirRequest(e) {
    return this._atender(e, 'consumir', 'nichos.fuente.consumir.response', d => this._consumir(d));
  }

  // =============================================================
  // PROYECCIÓN — orquestación de paso (pre-check + bus + imputar)
  // =============================================================

  /**
   * _consumir — orquesta el flujo completo de consumo de una fuente.
   *
   * @param {Object} input
   * @param {Object} input.fuente       - { tipo:'buscar'|'leer', nombre, config? }
   * @param {Object} input.peticion     - payload que viaja a crawl4rs (query, url, opciones)
   * @param {string} [input.project_id] - para imputación de coste
   * @param {string} [input.correlation_id]
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _consumir(input) {
    if (!input.fuente || typeof input.fuente !== 'object') return this._invalid('fuente');
    if (!input.peticion || typeof input.peticion !== 'object') return this._invalid('peticion');

    const { fuente, peticion, project_id, correlation_id } = input;
    const tipo = fuente.tipo || 'buscar';

    // ── 1. Pre-check de límites (J3) ──
    const limiteCheck = await this._rpcAlBus(
      'nichos.fuente.limites.puede.consumir.request',
      { fuente: fuente.nombre || tipo, project_id },
      correlation_id
    );

    if (limiteCheck && limiteCheck.data && limiteCheck.data.puede === false) {
      return this._errorResponse(
        429,
        'LIMITE_EXCEDIDO',
        'la fuente ha alcanzado el límite de consumo permitido',
        { fuente: fuente.nombre || tipo, margen: limiteCheck.data.margen }
      );
    }

    // ── 2. Llamada externa via bus (crawl4rs) ──
    const topicCrawl = FUENTE_TOPIC[tipo] || FUENTE_TOPIC.buscar;
    const resultadoCrawl = await this._rpcAlBus(topicCrawl, peticion, correlation_id);

    if (!resultadoCrawl || resultadoCrawl.error) {
      return this._errorResponse(
        502,
        'FUENTE_NO_DISPONIBLE',
        'la fuente externa no respondió o devolvió error',
        { fuente: fuente.nombre || tipo, detalle: resultadoCrawl?.error }
      );
    }

    // ── 3. Normalización (J2) ──
    const normalizado = await this._rpcAlBus(
      'nichos.conversor.normalizar.request',
      { crudo: resultadoCrawl.data, origen: fuente.nombre || tipo },
      correlation_id
    );

    const resultado_crudo = (normalizado && normalizado.data)
      ? normalizado.data
      : resultadoCrawl.data;

    // ── 4. Imputación de coste (fire-and-forget a J4) ──
    const importe = fuente.coste_unitario || 0;
    if (project_id) {
      this.eventBus?.publish('nichos.fuente.coste.registrado', {
        id_proyecto: project_id,
        fuente: fuente.nombre || tipo,
        importe,
        timestamp: nowISO()
      });
    }

    // ── 5. PULSO nichos.fuente.consumida ──
    const margen_restante = (limiteCheck && limiteCheck.data)
      ? (limiteCheck.data.margen - importe)
      : null;
    this.eventBus?.publish('nichos.fuente.consumida', {
      fuente: fuente.nombre || tipo,
      importe,
      margen_restante,
      timestamp: nowISO()
    });

    // ── 6. Response al solicitante ──
    return {
      status: 200,
      data: { resultado_crudo }
    };
  }

  // =============================================================
  // Utilidad — RPC genérico via bus (publish + espera response)
  // =============================================================
  async _rpcAlBus(topic, payload, correlation_id) {
    if (!this.eventBus?.publishAndWait) {
      // Modo degradado: sin bus con espera, publicamos fire-and-forget.
      this.eventBus?.publish(topic, { ...payload, correlation_id });
      return { data: payload };
    }
    try {
      return await this.eventBus.publishAndWait(topic, {
        ...payload,
        correlation_id
      });
    } catch (err) {
      return { error: { code: 'RPC_TIMEOUT', message: String(err) } };
    }
  }
}

module.exports = PuertoFuenteDatos;
