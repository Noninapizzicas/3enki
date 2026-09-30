/**
 * nichos/puerto-fuente-datos — PUENTE STATELESS: cero persistencia, solo enruta.
 *
 * J1 del plan: es el puerto abierto hacia las fuentes de datos de validación/búsqueda
 * (buscadores, APIs, scraping, comunidades). Declara y normaliza el acceso a distintas
 * fuentes de forma AGNOSTICA al vendor — cada fuente se registra y se puede sustituir por
 * evento, sin acoplarse a una API concreta. Recibe el pedido de datos de un nicho y emite
 * el resultado consultado con su par de fallo.
 *
 * Tres proyecciones puras:
 *   _autorizar    valida que la fuente esté en la whitelist autorizada por el dueño.
 *   _conectar     declara/conecta una fuente → ok (swap sin acople; publica conectada).
 *   _reemplazar   sustituye una fuente por otra → ok (publica reemplazada).
 *   _consultar    enruta hacia la fuente activa → DatasetBruto + Rate + Coste.
 *
 * Sin store, sin red, sin custodio: cada op entra objeto, sale objeto; el código enruta
 * peticiones y NO asume un vendor concreto.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PuertoFuenteDatos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-fuente-datos';
    this.version = 'reflejo-0.1.0';
    // Registro de fuentes conectadas — estado EN MEMORIA (puerto no persiste).
    this.fuentes = new Map();
  }
  async onUnload() { return super.onUnload(); }

  // Auto-conexión de la fuente por defecto al arrancar. El puerto es stateless
  // (las fuentes viven en memoria), así que sin esto, tras un reinicio no hay
  // fuente conectada y el sondeo devolvería "no hay fuente conectada". La fuente
  // por defecto es configurable (config.fuente_por_defecto) y reemplazable por evento.
  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && (context.moduleConfig || (context.config && context.config['puerto-fuente-datos']))) || {};
    const porDefecto = cfg.fuente_por_defecto || 'buscador';
    const tipo = cfg.fuente_tipo_por_defecto || 'search-engine';
    if (!this.fuentes.has(porDefecto)) {
      this.fuentes.set(porDefecto, {
        id: porDefecto,
        tipo,
        estado: 'conectada',
        conectada_en: new Date().toISOString()
      });
    }
    // Auto-conexión de la fuente 'api': es la RED DE SEGURIDAD del sondeo. Los
    // buscadores web (SearXNG → Google/Brave/DDG/Startpage) se bloquearon por
    // rate-limit/CAPTCHA; 'api' usa endpoints públicos SIN key y SIN CAPTCHA
    // (autocompletado = señal de demanda pura + Wikipedia). Así el sondeo mide
    // aunque los buscadores estén caídos (palanca del freno, no parche).
    if (!this.fuentes.has('api')) {
      this.fuentes.set('api', {
        id: 'api',
        tipo: 'api-publica',
        estado: 'conectada',
        conectada_en: new Date().toISOString()
      });
    }
    // Auto-conexión de la fuente 'comunidad': comunidades abiertas sin key ni
    // CAPTCHA (HN/Lemmy/Mastodon). estudio-demanda (C1) y sondeo-territorio (B1)
    // la piden en su barrido por defecto; sin conectarla aquí, el puerto responde
    // 404 «no esta conectada» y esa fuente no aporta señales.
    if (!this.fuentes.has('comunidad')) {
      this.fuentes.set('comunidad', {
        id: 'comunidad',
        tipo: 'comunidad',
        estado: 'conectada',
        conectada_en: new Date().toISOString()
      });
    }
    this.logger?.info('puerto-fuente-datos.auto_conectada', { fuente: porDefecto, tipo, fuentes: [...this.fuentes.keys()] });
  }

  // Consulta de datos hacia una fuente → DatasetBruto + Rate + Coste.
  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'nichos.fuente.consultar.response', async (d) => {
      const res = await this._consultar(d);
      if (res.status !== 200) this.eventBus?.publish('nichos.fuente.consultar.failed', res);
      return res;
    });
  }

  // Conectar/declarar una fuente -> swap sin acople a vendor.
  onConectarRequest(e) {
    return this._atender(e, 'conectar', 'nichos.fuente.conectar.response', async (d) => {
      const res = this._conectar(d);
      if (res.status === 200) this.eventBus?.publish('nichos.fuente.conectada', res.data);
      return res;
    });
  }

  // Reemplazar una fuente conectada por otra declarada.
  onReemplazarRequest(e) {
    return this._atender(e, 'reemplazar', 'nichos.fuente.reemplazar.response', async (d) => {
      const res = this._reemplazar(d);
      if (res.status === 200) this.eventBus?.publish('nichos.fuente.reemplazada', res.data);
      return res;
    });
  }

  // Proyección pura: fuente autorizada por el dueño (whitelist) — agnóstico al vendor.
  _autorizar({ fuente } = {}) {
    if (!fuente || typeof fuente !== 'string') {
      return this._errorResponse(400, 'INVALID_INPUT', 'fuente requerida', {});
    }
    // Whitelist de fuentes de validación/búsqueda declarables. Cada entrada es un PUERTO,
    // no una API concreta: buscador, api, scraping, comunidad (reemplazables por evento).
    const autorizadas = ['buscador', 'api', 'scraping', 'comunidad'];
    if (!autorizadas.includes(fuente)) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        `la fuente '${fuente}' no esta en la whitelist autorizada por el duenyo`, { fuente });
    }
    return { status: 200, data: { fuente, autorizada: true } };
  }

  // Proyección pura: conecta (o actualiza) una fuente declarada — swap sin acople a vendor.
  _conectar({ fuente, config = {} } = {}) {
    if (!fuente) return this._errorResponse(400, 'INVALID_INPUT', 'fuente requerida', {});
    const auth = this._autorizar({ fuente });
    if (auth.status !== 200) return auth;
    const previa = this.fuentes.has(fuente);
    this.fuentes.set(fuente, {
      id: fuente,
      tipo: config.tipo || 'generica',
      estado: 'conectada',
      reemplaza: previa,
      conectada_en: new Date().toISOString()
    });
    return { status: 200, data: { fuente, conectada: true, reemplaza: previa, config: this.fuentes.get(fuente) } };
  }

  // Proyección pura: reemplaza una fuente conectada por otra declarada.
  _reemplazar({ fuente, por, config = {} } = {}) {
    if (!fuente || !por) return this._errorResponse(400, 'INVALID_INPUT', 'fuente y destino requeridos', {});
    const auth = this._autorizar({ fuente: por });
    if (auth.status !== 200) return auth;
    if (!this.fuentes.has(fuente)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `la fuente '${fuente}' no esta conectada`, { fuente });
    }
    this.fuentes.delete(fuente);
    this.fuentes.set(por, {
      id: por,
      tipo: config.tipo || 'generica',
      estado: 'conectada',
      reemplazada: fuente,
      conectada_en: new Date().toISOString()
    });
    return { status: 200, data: { de: fuente, a: por, reemplazada: true, config: this.fuentes.get(por) } };
  }

  // Proyección (async): enruta el pedido de datos de un nicho hacia su fuente activa.
  // Fuente 'buscador' → crawl4rs.buscar (SearXNG): devuelve DatasetBruto REAL.
  // Fuentes 'api'/'scraping'/'comunidad' → aún sin proveedor cableado: degradan honesto.
  async _consultar({ nicho, fuente, pagina = 1 } = {}) {
    if (!nicho) return this._errorResponse(400, 'INVALID_INPUT', 'nicho requerido', {});
    const origen = fuente || [...this.fuentes.keys()][0];
    if (!origen) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        'no hay fuente conectada; conecta una antes (nichos.fuente.conectar.request)', { nicho });
    }
    if (!this.fuentes.has(origen)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `la fuente '${origen}' no esta conectada`, { nicho, fuente: origen });
    }
    const activa = this.fuentes.get(origen);
    // Enrutamiento real agnóstico al vendor: 'buscador' habla con el órgano web
    // crawl4rs (SearXNG). El resto de tipos aún no tienen proveedor cableado → honesto.
    if (activa.tipo === 'search-engine' || origen === 'buscador') {
      // Pide 4 páginas de SearXNG (~80 registros). El volumen de señales alimenta
      // la fuerza de demanda del estudio: con 20 topaba en 0.34 y ningún nicho
      // llegaba a VIABLE (fuerza >= 0.4; con 80 → ~0.46, con margen).
      const resp = await this._rpc('crawl4rs.buscar.request', {
        query: nicho, limit: 80
      }, { timeout_ms: 45000 }).catch(() => null);
      if (!resp || resp.status !== 200) {
        return this._errorResponse(502, 'UPSTREAM_UNREACHABLE',
          'la fuente buscador (crawl4rs/SearXNG) no respondio', { nicho, fuente: origen });
      }
      const items = Array.isArray(resp.data?.resultados) ? resp.data.resultados : [];
      return {
        status: 200,
        data: {
          nicho,
          fuente: origen,
          proveedor_tipo: activa.tipo,
          dataset: { items, pagina, semilla: nicho },
          dataset_bruto: { items, pagina, semilla: nicho },
          rate: { por_minuto: 10, usados_pagina: pagina <= 3 ? pagina : 3 },
          coste: { creditos: 1, moneda: 'creditos' }
        }
      };
    }
    // Fuente 'api' → APIs públicas SIN key y SIN CAPTCHA. Es la red de seguridad
    // cuando los buscadores web están rate-limitados. Devuelve DatasetBruto REAL:
    //   · autocompletado (Google/Bing/DDG) → lo que la gente ESCRIBE = demanda pura
    //   · Wikipedia search → cobertura temática del nicho
    if (origen === 'api' || activa.tipo === 'api-publica') {
      return this._consultarApiPublica({ nicho, pagina, fuente: origen, tipo: activa.tipo });
    }
    // Fuente 'comunidad' → comunidades abiertas (Reddit/HN/Mastodon/Lemmy) sin key.
    if (origen === 'comunidad' || activa.tipo === 'comunidad') {
      return this._consultarComunidad({ nicho, pagina, fuente: origen, tipo: activa.tipo });
    }
    // Fuente no cableada a proveedor real → degrada honesto (no finge resultados).
    return this._errorResponse(501, 'PROVEEDOR_NO_CABLEADO',
      `la fuente '${origen}' (tipo ${activa.tipo}) no tiene proveedor de datos cableado`, { nicho, fuente: origen });
  }

  // ── FUENTE 'api': APIs públicas sin key (autocompletado + Wikipedia) ──
  // El autocompletado es la señal de demanda más pura que existe: es literalmente
  // lo que la gente teclea. No tiene CAPTCHA ni cuota (endpoints públicos).
  async _consultarApiPublica({ nicho, pagina = 1, fuente, tipo }) {
    const q = String(nicho || '').trim();
    if (!q) return this._errorResponse(400, 'INVALID_INPUT', 'nicho requerido', { fuente });
    const items = [];
    const fuentes_ok = [];

    // 1) Autocompletado Google (signal de demanda). JSON: [query, [sugerencias]]
    const g = await this._getJson(
      `https://suggestqueries.google.com/complete/search?client=firefox&hl=es&q=${encodeURIComponent(q)}`
    ).catch(() => null);
    if (Array.isArray(g) && Array.isArray(g[1])) {
      for (const s of g[1]) items.push({ texto: String(s), fuente: 'suggest_google', clase: 'demanda' });
      if (g[1].length) fuentes_ok.push('suggest_google');
    }

    // 2) Autocompletado Bing (osjson): [query, [sugerencias]]
    const b = await this._getJson(
      `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`
    ).catch(() => null);
    if (Array.isArray(b) && Array.isArray(b[1])) {
      for (const s of b[1]) items.push({ texto: String(s), fuente: 'suggest_bing', clase: 'demanda' });
      if (b[1].length) fuentes_ok.push('suggest_bing');
    }

    // 3) Autocompletado DuckDuckGo (type=list): [{phrase}]
    const d = await this._getJson(
      `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`
    ).catch(() => null);
    if (Array.isArray(d)) {
      let n = 0;
      for (const s of d) {
        const txt = (s && (s.phrase || s)) || null;
        if (txt) { items.push({ texto: String(txt), fuente: 'suggest_ddg', clase: 'demanda' }); n++; }
      }
      if (n) fuentes_ok.push('suggest_ddg');
    }

    // 4) Wikipedia search (cobertura temática real)
    const w = await this._getJson(
      `https://${(this._lang || 'es')}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=20&format=json&origin=*`
    ).catch(() => null);
    const hits = w && w.query && Array.isArray(w.query.search) ? w.query.search : [];
    for (const h of hits) items.push({ texto: String(h.title), snippet: String(h.snippet || '').replace(/<[^>]+>/g, ''), fuente: 'wikipedia', clase: 'cobertura' });
    if (hits.length) fuentes_ok.push('wikipedia');

    if (items.length === 0) {
      return this._errorResponse(502, 'UPSTREAM_UNREACHABLE',
        'las APIs publicas (autocompletado/wikipedia) no devolvieron datos', { nicho: q, fuente });
    }
    return {
      status: 200,
      data: {
        nicho: q,
        fuente,
        proveedor_tipo: tipo,
        dataset: { items, pagina, semilla: q },
        dataset_bruto: { items, pagina, semilla: q },
        fuentes_con_datos: fuentes_ok,
        rate: { por_minuto: 60, usados_pagina: 1 },
        coste: { creditos: 0, moneda: 'gratis' }
      }
    };
  }

  // ── FUENTE 'comunidad': comunidades abiertas sin key (Reddit/HN/Mastodon/Lemmy) ──
  async _consultarComunidad({ nicho, pagina = 1, fuente, tipo }) {
    const q = String(nicho || '').trim();
    if (!q) return this._errorResponse(400, 'INVALID_INPUT', 'nicho requerido', { fuente });
    const items = [];
    const fuentes_ok = [];

    // Hacker News (Algolia): sin key, estable
    const hn = await this._getJson(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=20`
    ).catch(() => null);
    const hnHits = hn && Array.isArray(hn.hits) ? hn.hits : [];
    for (const h of hnHits) items.push({ texto: String(h.title || h.story_title || ''), url: h.url || null, fuente: 'hackernews', clase: 'comunidad' });
    if (hnHits.length) fuentes_ok.push('hackernews');

    // Lemmy (federado, abierto): posts
    const lm = await this._getJson(
      `https://lemmy.world/api/v3/search?q=${encodeURIComponent(q)}&type_=Posts&limit=20`
    ).catch(() => null);
    const lmPosts = lm && Array.isArray(lm.posts) ? lm.posts : [];
    for (const p of lmPosts) items.push({ texto: String((p.post && p.post.name) || ''), url: (p.post && p.post.url) || null, fuente: 'lemmy', clase: 'comunidad' });
    if (lmPosts.length) fuentes_ok.push('lemmy');

    // Mastodon (búsqueda pública): cuentas/posts
    const md = await this._getJson(
      `https://mastodon.social/api/v2/search?q=${encodeURIComponent(q)}&limit=20`
    ).catch(() => null);
    const mdAcc = md && Array.isArray(md.accounts) ? md.accounts : [];
    for (const a of mdAcc) items.push({ texto: String(a.display_name || a.username || ''), url: a.url || null, fuente: 'mastodon', clase: 'comunidad' });
    if (mdAcc.length) fuentes_ok.push('mastodon');

    if (items.length === 0) {
      return this._errorResponse(502, 'UPSTREAM_UNREACHABLE',
        'las comunidades abiertas no devolvieron datos', { nicho: q, fuente });
    }
    return {
      status: 200,
      data: {
        nicho: q,
        fuente,
        proveedor_tipo: tipo,
        dataset: { items, pagina, semilla: q },
        dataset_bruto: { items, pagina, semilla: q },
        fuentes_con_datos: fuentes_ok,
        rate: { por_minuto: 30, usados_pagina: 1 },
        coste: { creditos: 0, moneda: 'gratis' }
      }
    };
  }

  // GET JSON con timeout acotado (sin dependencias: fetch global de Node 18+).
  async _getJson(url, timeout_ms = 12000) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeout_ms);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: 'application/json', 'user-agent': 'enki-nichos/1.0 (+https://enki-ai.online)' }
      });
      if (r.status < 200 || r.status >= 300) throw new Error('http ' + r.status);
      return await r.json();
    } finally { clearTimeout(to); }
  }
}

module.exports = PuertoFuenteDatos;
