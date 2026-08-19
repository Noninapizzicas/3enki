'use strict';

/**
 * cupula-tools — CÚPULA GLOBAL DE LAS TOOLS DEL SISTEMA.
 *
 * Hermana de la cantera (skills) y del bibliotecario (bóveda), otra cara de la
 * Teoría del Órgano: el toolsRegistry es GLOBAL (las 439 tools son las mismas
 * para todos los proyectos), y esta cúpula lo proyecta en el MISMO molde que la
 * bóveda — ÍNDICE BARATO + detalle A DEMANDA (reach-not-resident):
 *
 *   - indice   → dominios + conteo (descubrir qué existe, sin schemas)
 *   - dominio  → las tools de un dominio (name + descripción 1 línea)
 *   - detalle  → UNA tool con su schema completo (lo que se necesita para ejecutar)
 *   - buscar   → por palabra en nombre/descripción
 *
 * Nace para que el LLM deje de pagar el catálogo completo (~60K tokens en
 * formato function-calling) y consulte solo lo que necesita. Generada AL VUELO
 * desde el toolsRegistry del moduleLoader (la MISMA fuente que sirve el
 * hermes-bridge /catalog) → siempre fresca: si nace un módulo, aparece.
 *
 * NOTA DE DISEÑO (v0.1.0): esta cúpula SOLO proyecta y sirve. La decisión de
 * inyección/consulta (índice en el primer turno, detalle a demanda, o nada) es
 * un paso POSTERIOR — primero la cúpula existe como superficie consultable.
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

class CupulaToolsModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cupula-tools';
    this.version = '0.1.0';
    this.moduleLoader = null;
  }

  async onLoad(context) {
    await super.onLoad(context);
    this.moduleLoader = context.moduleLoader || null;
    this.logger?.info('cupula-tools.loaded', {
      module: this.name, version: this.version,
      total: this._total(), dominios: this._dominios().length
    });
  }

  async onUnload() {
    this.moduleLoader = null;
    await super.onUnload();
  }

  // =============================================================
  // Acceso al registry (fuente única)
  // =============================================================

  /** Devuelve el toolsRegistry como array, o [] si no hay loader/registry. */
  _registry() {
    const reg = this.moduleLoader?.toolsRegistry;
    if (!reg || typeof reg.values !== 'function') return [];
    return Array.from(reg.values());
  }

  _dominioDe(name) {
    const n = String(name || '');
    const i = n.indexOf('.');
    return i > 0 ? n.slice(0, i) : n;
  }

  _total() { return this._registry().length; }

  /** Dominios agrupados con conteo, ordenados por nº desc. */
  _dominios() {
    const counts = new Map();
    for (const t of this._registry()) {
      const d0 = this._dominioDe(t.name);
      counts.set(d0, (counts.get(d0) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([dominio, count]) => ({ dominio, count }))
      .sort((a, b) => b.count - a.count || a.dominio.localeCompare(b.dominio));
  }

  // =============================================================
  // Bus API — on<Op>Request de una línea, delega a _atender (base)
  // =============================================================

  async onIndiceRequest(event)  { return this._atender(event, 'indice',  'cupula-tools.indice.response',  ()  => this._indice()); }
  async onDominioRequest(event) { return this._atender(event, 'dominio',  'cupula-tools.dominio.response', (d) => this._dominio(d)); }
  async onDetalleRequest(event) { return this._atender(event, 'detalle',  'cupula-tools.detalle.response', (d) => this._detalle(d)); }
  async onBuscarRequest(event)  { return this._atender(event, 'buscar',   'cupula-tools.buscar.response',  (d) => this._buscar(d)); }

  // =============================================================
  // Tools del LLM — shape canónico { status, data | error }
  // =============================================================

  async handleIndiceTool() {
    try {
      this.metrics?.increment('cupula-tools.indice.served');
      return this._indice();
    } catch (err) {
      return this._handleHandlerError('cupula-tools.indice.tool.failed', err, 'tool_indice');
    }
  }

  async handleDominioTool(args) {
    try {
      if (!args || typeof args !== 'object') {
        return this._errorResponse(400, 'INVALID_INPUT', 'args debe ser un object', { kind: 'shape' });
      }
      if (!args.dominio || typeof args.dominio !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'indica el dominio (prefijo de la tool)', { field: 'dominio' });
      }
      return this._dominio(args);
    } catch (err) {
      return this._handleHandlerError('cupula-tools.dominio.tool.failed', err, 'tool_dominio');
    }
  }

  async handleDetalleTool(args) {
    try {
      if (!args || typeof args !== 'object') {
        return this._errorResponse(400, 'INVALID_INPUT', 'args debe ser un object', { kind: 'shape' });
      }
      if (!args.name || typeof args.name !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'indica el nombre exacto de la tool', { field: 'name' });
      }
      return this._detalle(args);
    } catch (err) {
      return this._handleHandlerError('cupula-tools.detalle.tool.failed', err, 'tool_detalle');
    }
  }

  async handleBuscarTool(args) {
    try {
      if (!args || typeof args !== 'object') {
        return this._errorResponse(400, 'INVALID_INPUT', 'args debe ser un object', { kind: 'shape' });
      }
      if (!args.q || typeof args.q !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'indica la palabra a buscar', { field: 'q' });
      }
      return this._buscar(args);
    } catch (err) {
      return this._handleHandlerError('cupula-tools.buscar.tool.failed', err, 'tool_buscar');
    }
  }

  // =============================================================
  // Dominio (protegido) — proyecciones deterministas
  // =============================================================

  /** Índice BARATO: dominios + conteo. Sin schemas. */
  _indice() {
    const dominios = this._dominios();
    return {
      status: 200,
      data: { dominios, total: this._total(), por: 'dominio' }
    };
  }

  /** Las tools de un dominio (name + descripción). Sin schemas. */
  _dominio(d) {
    const dom = String(d.dominio).trim();
    const tools = this._registry()
      .filter(t => this._dominioDe(t.name) === dom)
      .map(t => ({ name: t.name, description: t.description || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (tools.length === 0) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `dominio '${dom}' sin tools`, { entity_type: 'dominio', entity_id: dom });
    }
    return {
      status: 200,
      data: { dominio: dom, tools, count: tools.length }
    };
  }

  /** Una tool completa con su schema. */
  _detalle(d) {
    const name = String(d.name).trim();
    const t = this._registry().find(x => x.name === name);
    if (!t) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `tool '${name}' no existe`, { entity_type: 'tool', entity_id: name });
    }
    return {
      status: 200,
      data: {
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || { type: 'object', properties: {} },
        dominio: this._dominioDe(t.name)
      }
    };
  }

  /** Búsqueda por palabra en nombre/descripción. */
  _buscar(d) {
    const q = String(d.q).toLowerCase();
    const topK = (typeof d.topK === 'number' && d.topK > 0) ? d.topK : 10;
    const hits = this._registry()
      .filter(t => (t.name || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
      .slice(0, topK)
      .map(t => ({
        name: t.name,
        dominio: this._dominioDe(t.name),
        descripcion_breve: (t.description || '').slice(0, 140)
      }));
    return {
      status: 200,
      data: { q, total: hits.length, tools: hits, por: 'palabra' }
    };
  }
}

module.exports = CupulaToolsModule;
