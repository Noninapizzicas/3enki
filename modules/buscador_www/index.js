/**
 * buscador_www — BUSCADOR de modelos 3D en el ecosistema público (PASO 5 del plan-construccion).
 *
 * Contrato: busca modelos imprimibles en las fuentes web de referencia (Cults3D,
 * Printables, Thingiverse, MakerWorld) y devuelve resultados con origen/ref para
 * que el orquestador los pueda volcar a la cola (cola_modelos) con dedup por
 * (origen, ref). NO custodia nada ni decide prioridad: busca y devuelve.
 *
 * FORMA: REFLEJO (módulo híbrido) sin persistencia — es un buscador, no una cripta.
 * Cada fuente se consulta en su propio try/catch: si una falla (red, bloqueo,
 * HTML cambiado) se anota el error en por_fuente y se sigue con las demás
 * (degradación limpia, nunca un fallo de una fuente tumba la búsqueda entera).
 *
 * Fuentes (todas públicas, sin API key):
 *   - cults3d     https://cults3d.com/en/search?q=<query>
 *   - printables  https://www.printables.com/search/models?q=<query>
 *   - thingiverse https://www.thingiverse.com/search?q=<query>&type=things
 *   - makerworld  https://makerworld.com/en/search/models?keyword=<query>
 *
 * La extracción es por regex sobre el HTML (sin dependencias): cada fuente tiene
 * su extractor. Si el HTML cambia y no matchea, la fuente devuelve 0 resultados
 * con un aviso (no inventa resultados).
 *
 * v0.1.0 (primera pasada del plan-construccion): el buscador de primer orden.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const FUENTES = Object.freeze({
  cults3d:     { url: (q) => `https://cults3d.com/en/search?q=${encodeURIComponent(q)}`, extractor: 'cults3d' },
  printables:  { url: (q) => `https://www.printables.com/search/models?q=${encodeURIComponent(q)}`, extractor: 'printables' },
  thingiverse: { url: (q) => `https://www.thingiverse.com/search?q=${encodeURIComponent(q)}&type=things`, extractor: 'thingiverse' },
  makerworld:  { url: (q) => `https://makerworld.com/en/search/models?keyword=${encodeURIComponent(q)}`, extractor: 'makerworld' }
});

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ── Extractores por fuente (regex sobre HTML). Devuelven [{titulo, url, autor?, precio?}] ──

function _extractCults3d(html) {
  const out = [];
  // Cults3D: tarjetas con <a href="/en/3d-model/..."> y título en <h3> o data-title.
  const re = /<a[^>]+href="(\/en\/3d-model\/[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 20) {
    const titulo = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (titulo) out.push({ titulo, url: `https://cults3d.com${m[1]}`, fuente: 'cults3d' });
  }
  return out;
}

function _extractPrintables(html) {
  const out = [];
  // Printables: tarjetas con <a href="/model/..."> y título en <span class="name"> o aria-label.
  const re = /<a[^>]+href="(\/model\/[^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*name[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 20) {
    const titulo = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (titulo) out.push({ titulo, url: `https://www.printables.com${m[1]}`, fuente: 'printables' });
  }
  return out;
}

function _extractThingiverse(html) {
  const out = [];
  // Thingiverse: tarjetas con <a href="/thing:..."> y título en <span class="card-title"> o alt.
  const re = /<a[^>]+href="(\/thing:\d+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*card-title[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 20) {
    const titulo = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (titulo) out.push({ titulo, url: `https://www.thingiverse.com${m[1]}`, fuente: 'thingiverse' });
  }
  return out;
}

function _extractMakerworld(html) {
  const out = [];
  // MakerWorld: tarjetas con <a href="/en/models/..."> y título en <span class="model-name"> o aria-label.
  const re = /<a[^>]+href="(\/en\/models\/[^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*model-name[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 20) {
    const titulo = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (titulo) out.push({ titulo, url: `https://makerworld.com${m[1]}`, fuente: 'makerworld' });
  }
  return out;
}

const EXTRACTORES = {
  cults3d: _extractCults3d,
  printables: _extractPrintables,
  thingiverse: _extractThingiverse,
  makerworld: _extractMakerworld
};

class BuscadorWwwReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'buscador_www';
    this.version = 'reflejo-0.1.0';
  }

  // ── Handlers RPC ──
  onBuscarRequest(e) { return this._atender(e, 'buscar', 'buscador_www.buscar.response', d => this._buscar(d)); }

  // ── PROYECCIÓN (dominio) ──

  // _buscar: consulta las fuentes pedidas (todas por defecto) en paralelo, cada
  // una con su try/catch. Devuelve resultados + por_fuente (ok/n/error). Nunca
  // lanza: una fuente caída se anota y se sigue.
  async _buscar(input) {
    if (!input.query || !String(input.query).trim()) return this._invalid('query');

    const query = String(input.query).trim();
    const fuentes = Array.isArray(input.fuentes) && input.fuentes.length
      ? input.fuentes.filter(f => FUENTES[f])
      : Object.keys(FUENTES);
    const limite = Math.min(input.limite || 20, 50);

    const resultados = [];
    const por_fuente = {};

    await Promise.all(fuentes.map(async (f) => {
      try {
        const res = await this._fetchHtml(FUENTES[f].url(query));
        if (!res) { por_fuente[f] = { ok: false, n: 0, error: 'sin_respuesta' }; return; }
        const extraidos = EXTRACTORES[f](res).slice(0, limite);
        for (const r of extraidos) resultados.push(r);
        por_fuente[f] = { ok: true, n: extraidos.length };
      } catch (err) {
        por_fuente[f] = { ok: false, n: 0, error: err.message };
      }
    }));

    // Dedup por url (una misma pieza puede aparecer en varias fuentes).
    const vistos = new Set();
    const unicos = resultados.filter(r => {
      if (vistos.has(r.url)) return false;
      vistos.add(r.url);
      return true;
    });

    return {
      status: 200,
      data: {
        query,
        resultados: unicos,
        total: unicos.length,
        por_fuente
      }
    };
  }

  // _fetchHtml: fetch con timeout y user-agent. Devuelve el HTML o null si no hay
  // respuesta (red caída, bloqueo, timeout). Nunca lanza hacia arriba.
  async _fetchHtml(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, 'accept': 'text/html' },
        signal: ctrl.signal
      });
      if (!res.ok) return null;
      return await res.text();
    } catch (_) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }
}

module.exports = BuscadorWwwReflejo;
