/**
 * radar-fuente — REFLEJO JS: la célula del radar (hoja 1.1 FUENTE de la disección).
 *
 * Contrato (del esquema.md del observatorio):
 *   entrada = su configuración (canal, métrica, frecuencia, umbral propio)
 *   salida  = emisiones regulares de dato crudo
 *   garantía = respeta frecuencia y métrica declaradas
 *   no hace  = no analiza (solo emite) · no decide (solo escucha) ·
 *              no es el mecanismo técnico (eso es la adquisición)
 *
 * FORMA: REFLEJO — op determinista + evento de dominio.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// Las 6 fuentes iniciales del esquema, con su configuración semilla.
const FUENTES_SEMILLA = {
  bandcamp:         { canal: 'bandcamp',  metrica: 'saves_48h',      frecuencia_h: 12, umbral: 1.0 },
  soundcloud:       { canal: 'soundcloud', metrica: 'ratio_plays_reposts', frecuencia_h: 12, umbral: 0.8 },
  sellos_micro:     { canal: 'sellos_micro', metrica: 'apariciones_multi_sello', frecuencia_h: 24, umbral: 1.5 },
  demos:            { canal: 'demos',     metrica: 'respuesta_sello_7d', frecuencia_h: 24, umbral: 1.2 },
  playlists_nicho:  { canal: 'playlists_nicho', metrica: 'track_en_3_playlists_7d', frecuencia_h: 24, umbral: 0.7 },
  comunidades:      { canal: 'comunidades', metrica: 'menciones_con_engagement', frecuencia_h: 6, umbral: 0.5 }
};

class RadarFuenteReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'radar-fuente';
    this.version = 'reflejo-0.1.0';
  }

  // ── Handlers ──
  onListarRequest(e) {
    return this._atender(e, 'listar', 'radar-fuente.listar.response', () => this._listar());
  }

  onConfigurarRequest(e) {
    return this._atender(e, 'configurar', 'radar-fuente.configurar.response', d => this._configurar(d));
  }

  // ── Ops (REFLEJO: deterministas, sin estado fuera del contrato) ──

  _listar() {
    const fuentes = Object.values(FUENTES_SEMILLA).map(f => ({ ...f }));
    return { status: 200, data: { fuentes, total: fuentes.length } };
  }

  _configurar(input) {
    const id = input.id;
    if (!id) return { status: 400, data: { error: 'INVALID_INPUT', message: 'id de fuente requerido' } };
    const base = FUENTES_SEMILLA[id];
    if (!base) return { status: 404, data: { error: 'RESOURCE_NOT_FOUND', message: `fuente desconocida: ${id}` } };

    // Merge parcial: el comerciante ajusta canal/métrica/frecuencia/umbral.
    const config = { ...base, ...input.config };
    // Garantía del contrato: respeta frecuencia y métrica declaradas.
    if (!config.metrica || !config.frecuencia_h) {
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'métrica y frecuencia_h son obligatorias' } };
    }

    this._publicarEvento('radar-fuente.configurada', { id, config });
    return { status: 200, data: { id, config } };
  }
}

module.exports = RadarFuenteReflejo;
