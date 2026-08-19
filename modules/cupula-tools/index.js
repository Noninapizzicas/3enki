'use strict';

const BaseModule = require('../_shared/base-module');

/**
 * CÚPULA DE TOOLS — cara RUNTIME (la biblioteca buscable de las capacidades del sistema).
 *
 * Gemela de buscar_agente (cúpula de agentes) y buscar_skill (cantera): da al LLM
 * acceso a TODAS las capacidades del sistema (tools + RPCs del bus que puede conducir)
 * SIN saturar contexto. El principio de la cúpula: una PUERTA diminuta y universal, y
 * el catálogo entero detrás, servido top-K bajo demanda. Los ~400 contratos nunca entran
 * al prompt — solo lo que la búsqueda devuelve.
 *
 * Tres tools, todas universales (viven en GLOBAL_TOOLS del ai-gateway → toda página):
 *   - buscar_capacidad {query, tipo?, limite?} → catálogo BARATO (name+tipo+descripcion), rankeado.
 *   - detalle_capacidad {name}                 → el CONTRATO completo bajo demanda
 *                                                (request_shape + cómo conducir + response_topic).
 *   - capacidad_dominio {dominio}              → TODAS las tools de un dominio (name+descripcion 1 línea).
 *
 * Renombrado de cupula-eventos a cupula-tools (v0.2.0): el módulo SIRVE tools (las capacidades
 * del sistema), no el contrato del bus — ese vive en el vigilante estático
 * (scripts/cupula-eventos/vigilante.js). El nombre ahora dice lo que hace.
 *
 * Fuente: moduleLoader.toolsRegistry — el índice VIVO de todas las tools registradas (el
 * mismo que alimenta getToolsForAI). Siempre fresco, sin re-escanear ficheros.
 */
class CupulaToolsModule extends BaseModule {
  constructor() {
    super();
    this.name = 'cupula-tools';
    this.version = '0.2.0';
    this.moduleLoader = null;
  }

  async onLoad(context) {
    this.logger = context.logger || null;
    this.metrics = context.metrics || null;
    this.eventBus = context.eventBus;
    this.moduleLoader = context.moduleLoader || null;
    if (this.moduleLoader?.toolsRegistry) {
      this._registerBuscarCapacidadTool();
      this._registerDetalleCapacidadTool();
      this._registerCapacidadDominioTool();
    }
    this.logger?.info?.('cupula-tools.loaded', { capacidades: this._indice().length });
  }

  async onUnload() {
    this.moduleLoader?.toolsRegistry?.delete?.('buscar_capacidad');
    this.moduleLoader?.toolsRegistry?.delete?.('detalle_capacidad');
    this.moduleLoader?.toolsRegistry?.delete?.('capacidad_dominio');
  }

  // ── registro de tools (patrón _registerBuscarAgenteTool) ──
  _registerBuscarCapacidadTool() {
    this.moduleLoader.toolsRegistry.set('buscar_capacidad', {
      name: 'buscar_capacidad',
      description: 'Busca en el CATÁLOGO COMPLETO de capacidades del sistema (tools y RPCs del bus que puedes conducir) las que sirven para una tarea. Devuelve nombre + descripción, top-K, sin cargar todo el catálogo. ÚSALA cuando necesites una acción y no sabes si existe una capacidad para ella (p.ej. "costear receta", "precio mercadona", "enviar whatsapp", "generar imagen"). Después, detalle_capacidad(name) te da su contrato para conducirla con bus.publishAndWait.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          query: { type: 'string', minLength: 1, description: 'La acción/capacidad a buscar (p.ej. "costear receta", "crear factura", "notificar pedido").' },
          tipo: { type: 'string', enum: ['tool', 'rpc', '*'], description: 'Opcional: "tool" (nombre pelado, p.ej. invoke_agent) o "rpc" (<modulo>.<accion>, p.ej. escandallo.costear). Default "*".' },
          limite: { type: 'number', description: 'Opcional: cuántas devolver (default 10).' }
        },
        required: ['query']
      },
      module: 'cupula-tools',
      event_based: true
    });
  }

  _registerDetalleCapacidadTool() {
    this.moduleLoader.toolsRegistry.set('detalle_capacidad', {
      name: 'detalle_capacidad',
      description: 'Devuelve el CONTRATO completo de UNA capacidad hallada por buscar_capacidad: el request_shape (parámetros que acepta), cómo conducirla, el response_topic para esperar la respuesta, y si requiere confirmación. Es el "abrir cajón" del bus — el cuerpo bajo demanda, sin cargar los ~400 contratos. Con esto conduces la capacidad vía bus.publishAndWait.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: { name: { type: 'string', minLength: 1, description: 'Nombre exacto de la capacidad (tal cual lo devolvió buscar_capacidad).' } },
        required: ['name']
      },
      module: 'cupula-tools',
      event_based: true
    });
  }

  _registerCapacidadDominioTool() {
    this.moduleLoader.toolsRegistry.set('capacidad_dominio', {
      name: 'capacidad_dominio',
      description: 'Lista TODAS las tools de un DOMINIO (el prefijo del nombre, lo que va antes del primer "." — p.ej. "telegram", "fs", "productos", "cobro"). Devuelve cada tool con nombre + descripción en una línea. ÚSALA para explorar qué puede hacer un área completa (¿qué tools hay en "telegram"?) antes de pedir el detalle de una concreta. Es más barato que detalle_capacidad por cada una.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: { dominio: { type: 'string', minLength: 1, description: 'El prefijo del dominio (p.ej. "telegram", "fs", "productos").' } },
        required: ['dominio']
      },
      module: 'cupula-tools',
      event_based: true
    });
  }

  // ── handlers de bus (publican <tool>.response {request_id, result|error}) ──
  async onBuscarCapacidad(event) {
    const d = event?.data || event || {};
    try {
      const result = this._buscar(d);
      this.metrics?.increment?.('cupula-tools.served', { op: 'buscar' });
      return this.eventBus.publish('buscar_capacidad.response', { request_id: d.request_id, result });
    } catch (err) {
      this.metrics?.increment?.('cupula-tools.errors', { kind: 'buscar_capacidad' });
      return this.eventBus.publish('buscar_capacidad.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  async onDetalleCapacidad(event) {
    const d = event?.data || event || {};
    try {
      const r = this._detalle(d);
      if (r && r.status) return this.eventBus.publish('detalle_capacidad.response', { request_id: d.request_id, error: r.error });
      this.metrics?.increment?.('cupula-tools.served', { op: 'detalle' });
      return this.eventBus.publish('detalle_capacidad.response', { request_id: d.request_id, result: r });
    } catch (err) {
      this.metrics?.increment?.('cupula-tools.errors', { kind: 'detalle_capacidad' });
      return this.eventBus.publish('detalle_capacidad.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  async onCapacidadDominio(event) {
    const d = event?.data || event || {};
    try {
      const r = this._dominio(d);
      if (r && r.status) return this.eventBus.publish('capacidad_dominio.response', { request_id: d.request_id, error: r.error });
      this.metrics?.increment?.('cupula-tools.served', { op: 'dominio' });
      return this.eventBus.publish('capacidad_dominio.response', { request_id: d.request_id, result: r });
    } catch (err) {
      this.metrics?.increment?.('cupula-tools.errors', { kind: 'capacidad_dominio' });
      return this.eventBus.publish('capacidad_dominio.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  // ── el índice VIVO: todas las capacidades registradas (misma fuente que getToolsForAI) ──
  _indice() {
    const reg = this.moduleLoader?.toolsRegistry;
    if (!reg || typeof reg.values !== 'function') return [];
    const out = [];
    for (const t of reg.values()) {
      if (!t || !t.name) continue;
      out.push({
        name: t.name,
        description: t.description || '',
        tipo: this._tipo(t.name),
        confirmation: !!t.confirmation,
        module: t.module || null,
        parameters: t.parameters || null,
        event_based: !!t.event_based
      });
    }
    return out;
  }

  // rpc = <mod>.<accion> (se conduce por bus con .request/.response) · tool = nombre pelado.
  _tipo(name) {
    return String(name).includes('.') ? 'rpc' : 'tool';
  }

  // ── proyección PURA: rankea por tokens (gemela de _buscarAgente). No lee ni escribe estado. ──
  _buscar({ query, tipo = '*', limite } = {}) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return { total: 0, capacidades: [] };
    const lim = Math.max(1, Number(limite) || 10);
    const toks = q.split(/\s+/).filter(Boolean);
    const propias = new Set(['buscar_capacidad', 'detalle_capacidad', 'capacidad_dominio']);
    const scored = [];
    for (const c of this._indice()) {
      if (propias.has(c.name)) continue;                          // la puerta no se busca a sí misma
      if (tipo !== '*' && c.tipo !== tipo) continue;
      const nombre = c.name.toLowerCase();
      const heno = `${nombre} ${c.description.toLowerCase()}`;
      let s = 0;
      for (const t of toks) {
        if (nombre.includes(t)) s += 2;                           // match en el nombre pesa más
        else if (heno.includes(t)) s += 1;                        // match en la descripción
      }
      if (s > 0) scored.push({ s, c });
    }
    scored.sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name));
    return {
      total: scored.length,
      capacidades: scored.slice(0, lim).map(({ c }) => ({ name: c.name, tipo: c.tipo, descripcion: c.description }))
    };
  }

  // ── las tools de un DOMINIO (prefijo del nombre). La vista que antes no había. ──
  _dominio({ dominio } = {}) {
    const d0 = String(dominio || '').trim();
    if (!d0) return this._errorResponse(400, 'INVALID_INPUT', 'dominio requerido');
    const tools = this._indice()
      .filter(c => c.name === d0 || c.name.startsWith(d0 + '.'))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (tools.length === 0) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `dominio '${d0}' sin tools`, { dominio: d0 });
    }
    return {
      dominio: d0,
      count: tools.length,
      tools: tools.map(({ name, description, tipo }) => ({ name, tipo, descripcion: description }))
    };
  }

  // ── el cuerpo bajo demanda: contrato de UNA capacidad (gemela de cajon.abrir) ──
  _detalle({ name } = {}) {
    const n = String(name || '').trim();
    if (!n) return this._errorResponse(400, 'INVALID_INPUT', 'name requerido');
    const t = this.moduleLoader?.toolsRegistry?.get?.(n);
    if (!t) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `capacidad desconocida: ${n}`, { name: n });
    return {
      name: n,
      tipo: this._tipo(n),
      descripcion: t.description || '',
      module: t.module || null,
      request_shape: t.parameters || { type: 'object' },
      // El loader auto-suscribe el nombre de la tool: publicar '<name>' la conduce; la
      // respuesta llega a '<name>.response' correlada por request_id.
      como_conducir: `bus.publishAndWait('${n}', { …según request_shape, request_id }) → espera '${n}.response' { request_id, result | error }`,
      response_topic: `${n}.response`,
      confirmation: !!t.confirmation,
      event_based: !!t.event_based
    };
  }
}

module.exports = CupulaToolsModule;
