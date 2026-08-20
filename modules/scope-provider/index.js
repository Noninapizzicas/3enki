'use strict';

const BaseModule = require('../_shared/base-module');

/**
 * scope-provider — pieza 1 de la fusión LLM.
 *
 * REFLEJO puro (sin estado mutable, sin egress): resuelve QUÉ provider usa un
 * flujo LLM según su ámbito. Cascada de precedencia:
 *
 *   context (provider explícito) > agent > skill > project > default (GLOBAL)
 *
 * No llama al LLM. Solo ELIGE el provider del ámbito. El que llama es Hermes
 * (la mente); este módulo es el cuerpo que dice "con qué provider". La tabla
 * scope→provider vive en la config (default = Ollama Cloud).
 *
 * Molde: cupula-tools / cupula-eventos — BaseModule + on<Op>Request correlado
 * + proyecciones puras + handle<Op>Tool. Sin inventar.
 */

class ScopeProviderModule extends BaseModule {
  constructor() {
    super();
    this.name = 'scope-provider';
    this.version = '0.1.0';
    this.moduleLoader = null;
    this.cfg = null;          // config del módulo (default + scope_rules)
    this._ambitosCache = null;
  }

  async onLoad(context) {
    this.logger = context.logger || null;
    this.metrics = context.metrics || null;
    this.eventBus = context.eventBus;
    this.moduleLoader = context.moduleLoader || null;
    this.cfg = context.moduleConfig || {};
    if (this.moduleLoader?.toolsRegistry) this._registerScopeProviderTool();
    this.logger?.info?.('scope-provider.loaded', {
      default: this._defaultProvider(), ambits: this._ambitos().length
    });
  }

  async onUnload() {
    this.moduleLoader?.toolsRegistry?.delete?.('scope_provider');
    await super.onUnload();
  }

  // ── registro de tool (patrón cupula-tools) ──
  _registerScopeProviderTool() {
    this.moduleLoader.toolsRegistry.set('scope_provider', {
      name: 'scope_provider',
      description: 'Resuelve QUÉ provider usa un ámbito (agente/skill/proyecto o default global). Devuelve { scope, provider, model, resolvedFrom }. CASCADA: contexto > agente > skill > proyecto > GLOBAL (Ollama Cloud). Úsala para saber con qué provider se ejecutará un flujo LLM, o para declarar que un agente debe ir por un provider concreto. Es el puerto de la fusión: Hermes decide, aquí se sabe QUÉ provider toca por ámbito.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          scope: {
            type: 'object', description: 'El ámbito a resolver.',
            properties: {
              project_id: { type: 'string', description: 'Proyecto.' },
              agent: { type: 'string', description: 'Agente/pipeline.' },
              skill: { type: 'string', description: 'Skill.' },
              context: { type: 'string', description: 'Provider explícito de contexto (prioridad máxima).' }
            }
          }
        },
        required: ['scope']
      },
      module: 'scope-provider',
      event_based: true
    });
  }

  // ── handlers de bus (patrón cupula-tools: correlado por request_id) ──
  async onGetRequest(event) {
    const d = event?.data || event || {};
    try {
      const r = this._resolver(d);
      if (r && r.status) return this.eventBus.publish('scope-provider.get.response', { request_id: d.request_id, error: r.error });
      this.metrics?.increment?.('scope-provider.get.served');
      return this.eventBus.publish('scope-provider.get.response', { request_id: d.request_id, result: r });
    } catch (err) {
      this.metrics?.increment?.('scope-provider.errors', { kind: 'get' });
      return this.eventBus.publish('scope-provider.get.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  async onListaScopeRequest(event) {
    const d = event?.data || event || {};
    try {
      const result = this._listaScope();
      return this.eventBus.publish('scope-provider.lista_scope.response', { request_id: d.request_id, result });
    } catch (err) {
      this.metrics?.increment?.('scope-provider.errors', { kind: 'lista' });
      return this.eventBus.publish('scope-provider.lista_scope.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  async onEstadoRequest(event) {
    const d = event?.data || event || {};
    try {
      const result = this._estado();
      return this.eventBus.publish('scope-provider.estado.response', { request_id: d.request_id, result });
    } catch (err) {
      this.metrics?.increment?.('scope-provider.errors', { kind: 'estado' });
      return this.eventBus.publish('scope-provider.estado.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  // ── Tool del LLM ──
  async handleGetTool(args) {
    try {
      if (!args || typeof args !== 'object' || !args.scope || typeof args.scope !== 'object') {
        return this._errorResponse(400, 'INVALID_INPUT', 'scope requerido (object)', { field: 'scope' });
      }
      this.metrics?.increment?.('scope-provider.get.served');
      return this._get(args);
    } catch (err) {
      return this._handleHandlerError('scope-provider.get.tool.failed', err, 'tool_get');
    }
  }

  // ── config helpers ──
  _defaultProvider() { return this.cfg?.default_provider || 'ollama'; }
  _defaultModel() { return this.cfg?.default_model || 'deepseek-v4-flash:preview'; }
  _rules() { return this.cfg?.scope_rules || {}; }

  // Los ámbitos registrados: agents+skills+projects con regla.
  _ambitos() {
    if (this._ambitosCache) return this._ambitosCache;
    const r = this._rules();
    const out = [];
    for (const [ag, cfg] of Object.entries(r.agents || {})) out.push({ tipo: 'agent', nombre: ag, ...cfg });
    for (const [sk, cfg] of Object.entries(r.skills || {})) out.push({ tipo: 'skill', nombre: sk, ...cfg });
    for (const [pr, cfg] of Object.entries(r.projects || {})) out.push({ tipo: 'project', nombre: pr, ...cfg });
    this._ambitosCache = out;
    return out;
  }

  // ── proyección PURA: resuelve el provider por ámbito (cascada) ──
  _get(d) {
    const scope = d?.scope || {};
    // 1. context explícito (máxima prioridad)
    if (scope.context) return { status: 200, data: this._resuelto({ scope, provider: scope.context, model: null, resolvedFrom: 'context' }) };
    // 2. agent
    if (scope.agent) {
      const regla = this._rules().agents?.[scope.agent];
      if (regla) return { status: 200, data: this._resuelto({ scope, provider: regla.provider, model: regla.model, resolvedFrom: 'agent' }) };
    }
    // 3. skill
    if (scope.skill) {
      const regla = this._rules().skills?.[scope.skill];
      if (regla) return { status: 200, data: this._resuelto({ scope, provider: regla.provider, model: regla.model, resolvedFrom: 'skill' }) };
    }
    // 4. project
    if (scope.project_id) {
      const regla = this._rules().projects?.[scope.project_id];
      if (regla) return { status: 200, data: this._resuelto({ scope, provider: regla.provider, model: regla.model, resolvedFrom: 'project' }) };
    }
    // 5. default (GLOBAL = Ollama Cloud)
    return { status: 200, data: { scope, provider: this._defaultProvider(), model: this._defaultModel(), resolvedFrom: 'default' } };
  }

  _resuelto({ scope, provider, model, resolvedFrom }) {
    return { scope, provider, model: model || this._defaultModel(), resolvedFrom };
  }

  _listaScope() {
    const ambits = this._ambitos();
    return { status: 200, data: { ambits, count: ambits.length } };
  }

  _estado() {
    const ambits = this._ambitos();
    return { status: 200, data: { default_provider: this._defaultProvider(), default_model: this._defaultModel(), ambits: ambits.length } };
  }
}

module.exports = ScopeProviderModule;
