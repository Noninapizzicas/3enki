/**
 * buscador-repositorios — PUENTE del taller 3D (pieza 9). Búsqueda desde repositorios
 * externos (Printables, MakerWorld, Cults3D, Thingiverse, etc.).
 *
 * Es PUENTE stateless: NO tiene store, escucha y delega. Reutiliza crawl4rs como
 * transporte de búsqueda (crawl4rs.buscar.request → SearXNG; infraestructura, NO pieza).
 * NO inventa resultados: devuelve lo que el puerto obtiene, mapeado a la forma
 * `ResultadoRepositorio` { fuente, titulo, url, autor, formatos } (diseno-oop.md).
 * El dueño elige y aprueba.
 *
 * Proyecciones del plano (plan-construccion.md 6.6): _buscar (mapea transport →
 * resultados tipados) y _resultadoDe. Par de fallo buscador-repositorios.buscar.failed.
 *
 * CONFIG: transporte 'crawl4rs' por defecto. Se puede inyectar otro puerto
 * RepositoriosPort (this._transport) respetando la misma forma { resultados:[{titulo,url,resumen}] }.
 *
 * v0.1.0: FASE 4 TANDA 1.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// Candidatos reales del dominio 3D por hostname (ABIERTO); no decisorio, solo etiqueta.
const FUENTE_POR_HOST = Object.freeze({
  'printables.com': 'Printables',
  'makerworld.com': 'MakerWorld',
  'makerworld.com.cn': 'MakerWorld',
  'cults3d.com': 'Cults3D',
  'thingiverse.com': 'Thingiverse',
  'thangs.com': 'Thangs'
});
const DEFAULT_FUENTE = 'Repositorio';

function fuenteDe(url) {
  try {
    const u = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(u).hostname.replace(/^www\./, '');
    for (const k of Object.keys(FUENTE_POR_HOST)) if (host === k || host.endsWith('.' + k)) return FUENTE_POR_HOST[k];
  } catch (_) { /* url inválida → default */ }
  return DEFAULT_FUENTE;
}

class BuscadorRepositoriosReflejo extends ModuloHibridoReflejo {
  constructor(opts) {
    super();
    this.name = 'buscador-repositorios';
    this.version = 'reflejo-0.1.0';
    // Puerto RepositoriosPort ABIERTO: transporte de búsqueda (default crawl4rs).
    this._transport = opts?.transport || 'crawl4rs';
  }

  onBuscarRequest(e) { return this._atender(e, 'buscar', 'buscador-repositorios.buscar.response', d => this._buscar(d)); }

  // ── PROYECCIONES (dominio) ──

  // _buscar: delega la búsqueda al puerto y MAPEA los resultados crudos del transport
  // a ResultadoRepositorio tipado. CERO inventado: si el transport no devuelve
  // resultados, devuelve lista vacía (honesto); nunca fabrica entradas.
  async _buscar(input) {
    if (!input.query) return this._invalid('query');

    let crudos;
    if (this._transport === 'crawl4rs') {
      const resp = await this._rpc('crawl4rs.buscar.request', { query: input.query, limit: input.limit || input.n || 10 }, { timeout_ms: 20000 });
      if (!resp) return this._errorResponse(502, 'TRANSPORTE_SIN_RESPUESTA', 'el transporte de búsqueda no respondió', { transporte: this._transport });
      if (resp.status >= 400) {
        return this._errorResponse(resp.status, resp.error?.code || 'TRANSPORTE_FALLO',
          resp.error?.message || 'el transporte de búsqueda falló', { transporte: this._transport });
      }
      crudos = (resp.data && resp.data.resultados) || resp.resultados || [];
    } else {
      // Puerto inyectado: función síncrona/async { query, limit } → resultados crudos
      const fn = this._transport;
      if (typeof fn === 'function') {
        try { crudos = await fn({ query: input.query, limit: input.limit || 10 }); }
        catch (err) { return this._errorResponse(502, 'TRANSPORTE_FALLO', err.message, { transporte: 'inyectado' }); }
      } else {
        return this._errorResponse(502, 'TRANSPORTE_DESCONOCIDO', `transporte no soportado: ${this._transport}`, { transporte: this._transport });
      }
    }

    const resultados = (crudos || []).map(r => this._resultadoDe(r)).filter(Boolean);
    return { status: 200, data: { resultados, total: resultados.length } };
  }

  // _resultadoDe: mapea un resultado crudo del transport → ResultadoRepositorio.
  // Campos ausentes se nombran como nulos (nunca se inventan). formatos se etiqueta
  // por extensión de la url/titulo cuando es evidente; si no, [ 'GCODE' ] NO se
  // asume → se deja [] hasta que el dueño lo confirme.
  _resultadoDe(r) {
    if (!r || !r.url) return null; // sin url no hay resultado
    const titulo = String(r.titulo || r.title || r.nombre || 'Sin título').trim();
    const url = String(r.url || '');
    const autor = r.autor != null ? String(r.autor) : (r.author != null ? String(r.author) : null);
    const fuente = r.fuente || r.fuente_sitio || fuenteDe(url);
    const formatos = this._formatosDe(r, url, titulo);
    return { fuente, titulo, url, autor, formatos };
  }

  // Etiqueta formatos por pistas visibles; CERO inventado: si no hay pista evidente → [].
  _formatosDe(r, url, titulo) {
    const set = new Set();
    for (const f of ['STL', '3MF', 'GCODE']) {
      if (r.formato === f || r.formatos?.includes?.(f)) set.add(f);
      if (new RegExp(`\\.${f.toLowerCase()}(\\?|$)`).test(' ' + url)) set.add(f);
      if (new RegExp(`\\b${f}\\b`, 'i').test(' ' + titulo)) set.add(f);
    }
    if ((r.formatos && !Array.isArray(r.formatos)) || r.formatos === 'STL' || r.formatos === '3MF' || r.formatos === 'GCODE') {
      if (['STL', '3MF', 'GCODE'].includes(r.formatos)) set.add(r.formatos);
    }
    return [...set];
  }
}

module.exports = BuscadorRepositoriosReflejo;
