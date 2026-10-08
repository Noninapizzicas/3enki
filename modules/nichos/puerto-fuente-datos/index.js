/**
 * nichos/puerto-fuente-datos — PUENTE JS (bloque J del vertical NICHOS, J1).
 *
 * Fachada que orquesta el consumo de fuentes externas (crawl4rs, APIs) sin que
 * el consumidor conozca el proveedor. Flujo:
 *   1. Pre-check de límites (J3 gestion-limites-fuente)
 *   2. Llamada externa via bus (crawl4rs.buscar / crawl4rs.leer)
 *   3. Normalización por ítem (J2 conversor-fuente)
 *   4. Imputación de coste (J4 imputacion-coste-fuente)
 *   5. PULSO nichos.fuente.consumida
 *   6. Response al solicitante
 *
 * Sin estado propio — es orquestador de paso. No hace HTTP directo: toda
 * llamada externa se delega al bus (desacoplamiento total).
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 *
 * ── CONTRATO DE ENTRADA (reconciliado 2026-10-05) ──────────────────────────
 * Acepta DOS formas, porque el puerto nació como fachada {fuente,peticion} pero
 * los tres consumidores del vertical (sondeador-territorio, estudio-demanda,
 * estudio-competencia) hablan la forma semántica {query,candidato}:
 *   A) { fuente:{tipo:'buscar'|'leer', nombre?, coste_unitario?}, peticion:{query|url} }
 *   B) { query:'...' | semilla+territorio | candidato:{nombre} | solucion }
 * Normaliza ambas a la llamada real de crawl4rs.
 *
 * ── CONTRATO DE SALIDA ─────────────────────────────────────────────────────
 *   { status:200, data:{ resultados: DatoHomogeneo[], resultado_crudo } }
 *   - resultados      : array homogéneo (J2), 1 por resultado de la fuente.
 *   - resultado_crudo : el dato crudo tal como llegó (compat/con diagnóstico).
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
    this.version = '0.2.0';
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
   * @param {Object} [input.fuente]      - { tipo:'buscar'|'leer', nombre, coste_unitario? }
   * @param {Object} [input.peticion]    - payload a crawl4rs (query, url, opciones)
   * @param {string} [input.query]       - forma semántica directa (alternativa a peticion)
   * @param {Object} [input.semilla]     - semilla normalizada (sondeador)
   * @param {string} [input.territorio]  - territorio (sondeador)
   * @param {Object} [input.candidato]   - candidato (estudio-demanda)
   * @param {*}      [input.solucion]    - solución (estudio-competencia)
   * @param {string} [input.project_id]  - para imputación de coste
   * @param {string} [input.correlation_id]
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _consumir(input) {
    const normalized = this._normalizarEntrada(input);
    if (normalized.error) return normalized.error;

    const { fuente, peticion, project_id, correlation_id } = normalized;
    const tipo = fuente.tipo || 'buscar';

    // ── 1. Pre-check de límites (J3) ──
    // J3 exige {project_id, fuente}. Sin project_id no hay presupuesto que
    // consultar: se trata como fuente abierta y se omite el pre-check (no es
    // motivo para rechazar la petición).
    let limiteCheck = null;
    if (project_id) {
      limiteCheck = await this._rpc(
        'nichos.fuente.limites.puede.consumir.request',
        { fuente: fuente.nombre || tipo, project_id },
        { timeout_ms: 5000 }
      );

      const ld = limiteCheck && limiteCheck.data ? limiteCheck.data : null;
      if (ld && ld.puede === false) {
        return this._errorResponse(
          429,
          'LIMITE_EXCEDIDO',
          'la fuente ha alcanzado el límite de consumo permitido',
          { fuente: fuente.nombre || tipo, margen: ld.margen }
        );
      }
    }

    // ── 2. Llamada externa via bus (crawl4rs) ──
    const topicCrawl = FUENTE_TOPIC[tipo] || FUENTE_TOPIC.buscar;
    const resultadoCrawl = await this._rpc(topicCrawl, peticion, { timeout_ms: 30000 });

    if (!resultadoCrawl || resultadoCrawl.error || resultadoCrawl.status >= 400) {
      return this._errorResponse(
        502,
        'FUENTE_NO_DISPONIBLE',
        'la fuente externa no respondió o devolvió error',
        { fuente: fuente.nombre || tipo, detalle: resultadoCrawl && resultadoCrawl.error }
      );
    }

    // El crudo útil vive en .data (crawl4rs: {resultados:[...]} | {paginas:[...]})
    const crudo = resultadoCrawl.data != null ? resultadoCrawl.data : resultadoCrawl;

    // ── 3. Normalización por ítem (J2) ──
    const origen = fuente.nombre || (tipo === 'leer' ? 'crawl4rs' : 'searxng');
    const items = this._extraerItems(crudo, tipo);
    const resultados = await this._normalizarItems(items, origen, correlation_id);

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
    const margen_restante = (limiteCheck && limiteCheck.data && typeof limiteCheck.data.margen === 'number')
      ? (limiteCheck.data.margen - importe)
      : null;
    this.eventBus?.publish('nichos.fuente.consumida', {
      fuente: fuente.nombre || tipo,
      importe,
      margen_restante,
      timestamp: nowISO()
    });

    // ── 6. Response al solicitante ──
    // Devuelve AMBAS caras: 'resultados' (consumidores del vertical) y
    // 'resultado_crudo' (compat con la descripción del módulo). El array
    // 'resultados' lleva el esquema homogéneo de J2 + alias de consumo.
    return {
      status: 200,
      data: {
        resultados,
        resultado_crudo: crudo
      }
    };
  }

  // =============================================================
  // Normalización de ENTRADA — acepta las dos formas de contrato
  // =============================================================
  _normalizarEntrada(input) {
    const d = input || {};

    // Forma A — explícita {fuente, peticion}
    if (d.fuente && typeof d.fuente === 'object' && d.peticion && typeof d.peticion === 'object') {
      return {
        fuente: d.fuente,
        peticion: d.peticion,
        project_id: d.project_id,
        correlation_id: d.correlation_id
      };
    }

    // Forma B — semántica (los 3 consumidores del vertical)
    const q = this._querySemantica(d);
    if (q != null) {
      return {
        fuente: (d.fuente && typeof d.fuente === 'object') ? d.fuente : { tipo: 'buscar' },
        peticion: { query: q },
        project_id: d.project_id,
        correlation_id: d.correlation_id
      };
    }

    return { error: this._invalid('query|peticion') };
  }

  /** Deriva la query de las formas semánticas conocidas. */
  _querySemantica(d) {
    if (typeof d.query === 'string' && d.query.trim()) return d.query;
    if (d.candidato && typeof d.candidato === 'object') {
      return d.candidato.nombre || d.candidato.descripcion || JSON.stringify(d.candidato);
    }
    if (typeof d.candidato === 'string' && d.candidato.trim()) return d.candidato;
    if (d.semilla != null) {
      const s = d.semilla;
      if (typeof s === 'string') return s;
      if (typeof s === 'object') return s.territorio || s.nombre || String(d.territorio || '');
    }
    if (typeof d.territorio === 'string' && d.territorio.trim()) return d.territorio;
    if (d.solucion != null) {
      return typeof d.solucion === 'string' ? d.solucion : JSON.stringify(d.solucion);
    }
    if (typeof d.peticion === 'string' && d.peticion.trim()) return d.peticion;
    return null;
  }

  /** Extrae el array de ítems crudos de la respuesta de crawl4rs. */
  _extraerItems(crudo, tipo) {
    if (Array.isArray(crudo)) return crudo;
    if (crudo && Array.isArray(crudo.resultados)) return crudo.resultados;
    if (crudo && Array.isArray(crudo.paginas)) return crudo.paginas;
    if (crudo && typeof crudo === 'object') return [crudo];
    return [];
  }

  /** Normaliza cada ítem via J2 y le añade alias de consumo del vertical. */
  async _normalizarItems(items, origen, correlation_id) {
    const out = [];
    for (const crudo of items) {
      const norm = await this._rpc(
        'nichos.conversor.normalizar.request',
        { crudo, origen },
        { timeout_ms: 5000 }
      );
      const dato = (norm && norm.data && norm.data.dato_homogeneo)
        ? norm.data.dato_homogeneo
        : { titulo: null, contenido: null, url: null, meta: {}, origen, origen_desconocido: true };

      out.push({
        ...dato,
        // alias de consumo — la forma que esperan los consumidores del vertical
        nombre: dato.titulo || null,
        fuente: dato.origen || origen,
        tipo: 'web',
        evidencia: dato.url ? [dato.url] : []
      });
    }
    return out;
  }
}

module.exports = PuertoFuenteDatos;
