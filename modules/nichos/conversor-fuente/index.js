/**
 * nichos/conversor-fuente — CONVERSOR (bloque J · interlocutor proveedor).
 *
 * Homogeneiza crudo heterogéneo de fuentes externas (crawl4rs, APIs, scrapers)
 * en un dato con esquema estable para los consumidores del vertical NICHOS.
 *
 * RPC puro sin estado: recibe { crudo, origen } → devuelve { dato_homogeneo }.
 * Si el origen es desconocido, envuelve el crudo con marca origen_desconocido:true
 * (degradación honesta, no falla).
 *
 * Esquema dato_homogeneo:
 *   {
 *     titulo:    String | null,
 *     contenido: String | null,
 *     url:       String | null,
 *     meta:      Object,
 *     origen:    String,
 *     normalizado_en: ISO,
 *     origen_desconocido: Boolean
 *   }
 *
 * Patrón: ModuloHibridoReflejo (CONVERSOR puro). Sin estado, sin PosPersistencia,
 * sin mitad blueprint. Transformación determinista crudo→estable.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

// ── Normalizadores por origen ──
const NORMALIZADORES = {
  crawl4rs(crudo) {
    return {
      titulo:    crudo.title || crudo.titulo || null,
      contenido: crudo.text || crudo.content || crudo.contenido || crudo.resumen || null,
      url:       crudo.url || crudo.link || null,
      meta:      crudo.meta || {}
    };
  },
  'google-trends'(crudo) {
    return {
      titulo:    crudo.query || crudo.keyword || null,
      contenido: crudo.summary || crudo.description || null,
      url:       crudo.url || null,
      meta:      { interest: crudo.interest, region: crudo.region, ...(crudo.meta || {}) }
    };
  },
  'api-mercado'(crudo) {
    return {
      titulo:    crudo.name || crudo.titulo || null,
      contenido: crudo.body || crudo.contenido || null,
      url:       crudo.endpoint || crudo.url || null,
      meta:      crudo.meta || {}
    };
  },
  searxng(crudo) {
    return {
      titulo:    crudo.title || crudo.titulo || null,
      contenido: crudo.content || crudo.snippet || crudo.resumen || null,
      url:       crudo.url || crudo.href || null,
      meta:      { engine: crudo.engine, score: crudo.score, ...(crudo.meta || {}) }
    };
  }
};

function normalizarDesconocido(crudo) {
  return {
    titulo:    crudo.title || crudo.titulo || crudo.name || null,
    contenido: crudo.content || crudo.contenido || crudo.text || crudo.body || null,
    url:       crudo.url || crudo.link || null,
    meta:      crudo.meta || {}
  };
}

class ConversorFuente extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'conversor-fuente';
    this.version = '0.1.0';
  }

  // ── RPC HANDLER ──
  onNormalizarRequest(e) {
    return this._atender(e, 'normalizar', 'nichos.conversor.normalizar.response', d => this._normalizar(d));
  }

  // ── PROYECCION ──
  _normalizar(input) {
    if (!input.crudo || typeof input.crudo !== 'object') return this._invalid('crudo');
    if (!input.origen) return this._invalid('origen');

    const origen = String(input.origen).toLowerCase();
    const fn = NORMALIZADORES[origen];
    const origenDesconocido = !fn;
    const parcial = fn ? fn(input.crudo) : normalizarDesconocido(input.crudo);

    const dato_homogeneo = {
      titulo:             parcial.titulo,
      contenido:          parcial.contenido,
      url:                parcial.url,
      meta:               parcial.meta || {},
      origen:             input.origen,
      normalizado_en:     nowISO(),
      origen_desconocido: origenDesconocido
    };

    return {
      status: 200,
      data: { dato_homogeneo }
    };
  }
}

module.exports = ConversorFuente;
