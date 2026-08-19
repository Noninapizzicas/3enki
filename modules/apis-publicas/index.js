'use strict';

const fs = require('fs');
const path = require('path');
const BaseModule = require('../_shared/base-module');

/**
 * apis-publicas — CÚPULA DE APIS PÚBLICAS (el catálogo externo buscable).
 *
 * Sexta sustancia del patrón cúpula: lentes=conocimiento · cantera=skills ·
 * agentes=trabajadores · eventos=contratos del bus · tools=capacidades ·
 * apis-publicas=servicios REST externos. Lo que crawl4rs raspa, una API pública
 * lo sirve tipado (JSON estructurado, sin throttle, sin login). La API es la
 * PRIMERA opción; el scraping es fallback.
 *
 * Sigue el MISMO molde que cupula-tools / cupula-eventos (en prod):
 *   - hereda BaseModule
 *   - onLoad registra las tools en moduleLoader.toolsRegistry
 *   - on<Op>Request publica apis-publicas.*.response correlado por request_id
 *   - proyecciones PURAS (_buscar, _obtener…) con _errorResponse(400/404)
 *   - tools del LLM handle<Op>Tool(args) → { status, data|error } con _handleHandlerError
 *
 * Fuente: catálogo semilla en catalogo/semilla.json (las ~30 APIs prioritarias de
 * la rebanada). Crecido (importado en caliente) en data/apis-publicas/.
 */

const SEMILLA_PATH = path.join(__dirname, 'catalogo', 'semilla.json');
const COMPLETO_PATH = path.join(__dirname, 'catalogo', 'completo.json');

class ApisPublicasModule extends BaseModule {
  constructor() {
    super();
    this.name = 'apis-publicas';
    this.version = '0.1.0';
    this.moduleLoader = null;
    this.catalogo = new Map();   // nombre → ficha (todas, ~1671)
    this.prioritarias = new Set(); // nombres de las semilla (marcadas)
  }

  async onLoad(context) {
    this.logger = context.logger || null;
    this.metrics = context.metrics || null;
    this.eventBus = context.eventBus;
    this.moduleLoader = context.moduleLoader || null;
    this._cargarCatalogo();
    if (this.moduleLoader?.toolsRegistry) {
      this._registerBuscarApiTool();
      this._registerObtenerApiTool();
    }
    this.logger?.info?.('apis-publicas.loaded', {
      total: this.catalogo.size, prioritarias: this.prioritarias.size, integradas: this._integradas().length
    });
  }

  async onUnload() {
    this.moduleLoader?.toolsRegistry?.delete?.('buscar_api');
    this.moduleLoader?.toolsRegistry?.delete?.('obtener_api');
    this.catalogo.clear();
    this.prioritarias.clear();
    await super.onUnload();
  }

  // ── carga del catálogo (completo + semilla marcada como prioritaria) ──
  _cargarCatalogo() {
    // Fuente principal: el catálogo completo de public-apis (1671)
    try {
      const arr = JSON.parse(fs.readFileSync(COMPLETO_PATH, 'utf8'));
      for (const api of arr) if (api && api.nombre) this.catalogo.set(api.nombre, api);
    } catch (err) {
      this.logger?.warn?.('apis-publicas.completo.failed', { error: err.message });
    }
    // Semilla: las prioritarias — se marcan en `prioritarias` (para buscar_api poder filtrarlas)
    try {
      const arr = JSON.parse(fs.readFileSync(SEMILLA_PATH, 'utf8'));
      for (const api of arr) {
        if (!api || !api.nombre) continue;
        if (!this.catalogo.has(api.nombre)) this.catalogo.set(api.nombre, api);
        this.prioritarias.add(api.nombre);
      }
    } catch (err) {
      this.logger?.warn?.('apis-publicas.semilla.failed', { error: err.message });
    }
  }

  // ── registro de tools (patrón cupula-tools) ──
  _registerBuscarApiTool() {
    this.moduleLoader.toolsRegistry.set('buscar_api', {
      name: 'buscar_api',
      description: 'Busca en el CATÁLOGO de APIs públicas del sistema (Open Food Facts, Frankfurter, Open-Meteo, TheMealDB…) las que sirven para obtener un dato externo. Devuelve nombre + descripción + categoría + si requiere API key, top-K, sin cargar el catálogo. ÚSALA cuando necesites un dato que una API pública puede dar (p.ej. "nutrición de un alimento", "cambio de divisa", "receta por ingrediente"). La API es PRIMERA opción sobre el scraping — busca aquí antes de raspar.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          query: { type: 'string', minLength: 1, description: 'La necesidad (p.ej. "nutricion harina", "cambio euro", "validar iban").' },
          categoria: { type: 'string', description: 'Opcional: filtrar por categoría.' },
          dominio: { type: 'string', description: 'Opcional: dominio_enki (escandallo, pizzepos…).' },
          limite: { type: 'number', description: 'Opcional: cuántas devolver (default 10).' }
        },
        required: ['query']
      },
      module: 'apis-publicas',
      event_based: true
    });
  }

  _registerObtenerApiTool() {
    this.moduleLoader.toolsRegistry.set('obtener_api', {
      name: 'obtener_api',
      description: 'Devuelve la FICHA completa de UNA API pública: URL, autenticación, ejemplo de invocación, y si ya está integrada. ÚSALA cuando ya sepas qué API quieres (de buscar_api) y necesites su detalle para usarla o integrarla.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: { nombre: { type: 'string', minLength: 1, description: 'Nombre exacto de la API (tal cual de buscar_api).' } },
        required: ['nombre']
      },
      module: 'apis-publicas',
      event_based: true
    });
  }

  // ── handlers de bus (patrón cupula-tools: publican <op>.response correlado) ──
  async onBuscarRequest(event) {
    const d = event?.data || event || {};
    try {
      const result = this._buscar(d);
      this.metrics?.increment?.('apis-publicas.buscar.served');
      return this.eventBus.publish('apis-publicas.buscar.response', { request_id: d.request_id, result });
    } catch (err) {
      this.metrics?.increment?.('apis-publicas.errors', { kind: 'buscar' });
      return this.eventBus.publish('apis-publicas.buscar.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  async onObtenerRequest(event) {
    const d = event?.data || event || {};
    try {
      const r = this._obtener(d);
      if (r && r.status) return this.eventBus.publish('apis-publicas.obtener.response', { request_id: d.request_id, error: r.error });
      this.metrics?.increment?.('apis-publicas.obtener.served');
      return this.eventBus.publish('apis-publicas.obtener.response', { request_id: d.request_id, result: r });
    } catch (err) {
      this.metrics?.increment?.('apis-publicas.errors', { kind: 'obtener' });
      return this.eventBus.publish('apis-publicas.obtener.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  async onListarCategoriasRequest(event) {
    const d = event?.data || event || {};
    try {
      const result = this._listarCategorias();
      return this.eventBus.publish('apis-publicas.listar_categorias.response', { request_id: d.request_id, result });
    } catch (err) {
      this.metrics?.increment?.('apis-publicas.errors', { kind: 'categorias' });
      return this.eventBus.publish('apis-publicas.listar_categorias.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  async onEstadoRequest(event) {
    const d = event?.data || event || {};
    try {
      const result = this._estado();
      return this.eventBus.publish('apis-publicas.estado.response', { request_id: d.request_id, result });
    } catch (err) {
      this.metrics?.increment?.('apis-publicas.errors', { kind: 'estado' });
      return this.eventBus.publish('apis-publicas.estado.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  // ── Tools del LLM (patrón <name>Tool) ──
  async handleBuscarTool(args) {
    try {
      if (!args || typeof args !== 'object') {
        return this._errorResponse(400, 'INVALID_INPUT', 'args debe ser un object', { kind: 'shape' });
      }
      if (!args.query || typeof args.query !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'indica la query', { field: 'query' });
      }
      this.metrics?.increment?.('apis-publicas.buscar.served');
      return this._buscar(args);
    } catch (err) {
      return this._handleHandlerError('apis-publicas.buscar.tool.failed', err, 'tool_buscar');
    }
  }

  async handleObtenerTool(args) {
    try {
      if (!args || typeof args !== 'object') {
        return this._errorResponse(400, 'INVALID_INPUT', 'args debe ser un object', { kind: 'shape' });
      }
      if (!args.nombre || typeof args.nombre !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'indica el nombre de la API', { field: 'nombre' });
      }
      this.metrics?.increment?.('apis-publicas.obtener.served');
      return this._obtener(args);
    } catch (err) {
      return this._handleHandlerError('apis-publicas.obtener.tool.failed', err, 'tool_obtener');
    }
  }

  // ── proyecciones PURAS (patrón cupula-tools: _buscar, _detalle) ──
  _integradas() {
    return [...this.catalogo.values()].filter(a => a.integrada === true);
  }

  _buscar(d) {
    const q = String(d.query || '').toLowerCase().trim();
    if (!q) return { status: 200, data: { total: 0, integradas: 0, apis: [] } };
    const lim = Math.max(1, Number(d.limite) || 10);
    const toks = q.split(/\s+/).filter(Boolean);
    let items = [...this.catalogo.values()];
    if (d.categoria) items = items.filter(a => a.categoria === d.categoria);
    if (d.dominio) items = items.filter(a => a.dominio_enki === d.dominio);
    const scored = [];
    for (const a of items) {
      const heno = `${a.nombre} ${a.descripcion} ${(a.tags || []).join(' ')} ${a.categoria}`.toLowerCase();
      let s = 0;
      for (const t of toks) {
        if (a.nombre.toLowerCase().includes(t)) s += 2;
        else if (heno.includes(t)) s += 1;
      }
      if (s > 0) scored.push({ s, a });
    }
    scored.sort((x, y) => y.s - x.s || x.a.nombre.localeCompare(y.a.nombre));
    return {
      status: 200,
      data: {
        total: this.catalogo.size,
        integradas: this._integradas().length,
        apis: scored.slice(0, lim).map(({ a }) => ({ nombre: a.nombre, descripcion: a.descripcion, categoria: a.categoria, auth: a.auth, integrada: !!a.integrada, url: a.url }))
      }
    };
  }

  _obtener(d) {
    const nombre = String(d?.nombre || '').trim();
    if (!nombre) return this._errorResponse(400, 'INVALID_INPUT', 'indica el nombre de la API', { field: 'nombre' });
    const entry = this.catalogo.get(nombre);
    if (!entry) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `API '${nombre}' no está en el catálogo`, { api: nombre });
    return {
      status: 200,
      data: { ...entry, ejemplo: this._generarEjemplo(entry) }
    };
  }

  _listarCategorias() {
    const counts = new Map();
    for (const a of this.catalogo.values()) counts.set(a.categoria, (counts.get(a.categoria) || 0) + 1);
    const categorias = [...counts.entries()].map(([nombre, count]) => ({ nombre, count })).sort((a, b) => b.count - a.count);
    return { status: 200, data: { categorias, total: categorias.length } };
  }

  _estado() {
    return { status: 200, data: { total: this.catalogo.size, integradas: this._integradas().length, categorias: new Set([...this.catalogo.values()].map(a => a.categoria)).size } };
  }

  _generarEjemplo(entry) {
    if (entry.categoria === 'Currency') return `GET ${entry.url}`;
    if (entry.categoria === 'Food & Drink') return `GET ${entry.url}/api/v1/search?query=ejemplo`;
    return `GET ${entry.url}`;
  }
}

module.exports = ApisPublicasModule;
