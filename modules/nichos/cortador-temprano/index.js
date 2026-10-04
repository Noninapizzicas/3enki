'use strict';

/**
 * nichos/cortador-temprano — REFLEJO JS (sin estado) del vertical NICHOS.
 *
 * Corta un nicho antes de la fase de construccion cuando el veredicto es
 * NO_VIABLE. Ejecuta la transicion del pipeline a CORTADO y registra el
 * evento en el historial.
 *
 * Sin estado propio — REFLEJO puro.
 * Patron: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class CortadorTemprano extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cortador-temprano';
    this.version = '0.1.0';
  }

  // -- RPC HANDLER --
  onCortarRequest(e) {
    return this._atender(e, 'cortar', 'nichos.cortar.temprano.response', d => this._cortar(d));
  }

  // =============================================================
  // PROYECCION: _cortar (transita a CORTADO y registra)
  // =============================================================
  async _cortar(input) {
    if (!input.id_nicho) return this._invalid('id_nicho');
    if (!input.veredicto) return this._invalid('veredicto');

    const razon = input.veredicto.razon || input.veredicto.codigo || 'NO_VIABLE';
    const ts = nowISO();

    // 1. Transitar pipeline a CORTADO.
    const transicion = await this._rpc('nichos.pipeline.transitar.request', {
      id_nicho: input.id_nicho,
      estado_destino: 'CORTADO',
      razon,
      timestamp: ts
    });

    // 2. Registrar en historial.
    await this._rpc('nichos.historial.registrar.request', {
      id_nicho: input.id_nicho,
      accion: 'corte_temprano',
      detalle: {
        razon,
        veredicto: input.veredicto,
        fase: 'pre_construccion'
      },
      timestamp: ts
    });

    // 3. Emitir pulso.
    this.eventBus?.publish('nichos.cortado.pre.construccion', {
      id_nicho: input.id_nicho,
      razon,
      timestamp: ts
    });

    return {
      status: 200,
      data: {
        transicion: {
          id_nicho: input.id_nicho,
          estado_destino: 'CORTADO',
          resultado: transicion ? 'transitado' : 'pendiente',
          razon
        }
      }
    };
  }
}

module.exports = CortadorTemprano;
