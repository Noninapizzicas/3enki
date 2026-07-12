/**
 * ai-agent-framework v2.0.0 — POC2 canonico.
 *
 * Carga agentes desde agents/*.json + prompts/*.json (o *.md). Registra la
 * tool `invoke_agent` (LLM tool flow legacy) en moduleLoader.toolsRegistry y
 * escucha `agent.execute.request` (entry point canonico agent-flow v1.0.0+)
 * desde modulos del dominio / cron / channels.
 *
 * Publishes canonicos agent-flow:
 *   - agent.execute.response (success)
 *   - agent.execute.failed   (no_silent_failures)
 *   - agent.execute.progress (feedback intermedio chat_inline_rendering)
 *
 * Cuando se incluye conversation_id tambien publica chat.assistant.saved con
 * metadata.author del agente para chat multi-participante.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
const { descomponer } = require('../../_shared/prisma-del-caso');
const DEFAULT_CONVERSATION_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_AGENT_TIMEOUT_MS = 120000;
const DEFAULT_AGENT_TEMPERATURE = 0.7;
const DEFAULT_AGENT_MAX_TOKENS = 2000;
const DEFAULT_RESOLVE_TIMEOUT_MS = 5000;

class AiAgentFrameworkModule extends BaseModule {
  constructor() {
    super();
    this.name = 'ai-agent-framework';
    this.version = '2.0.0';
    this.moduleLoader = null;
    this.mqttRequest = null;
    this.config = null;

    this.agents = new Map();     // ACTIVOS (enabled ∨ overlay) — invocables ya vía invoke_agent
    this.library = new Map();    // BIBLIOTECA — TODA definición conocida (activa o no), buscable (cúpula de agentes)
    this.activados = new Set();  // overlay CRECIDO — agentes encendidos por el humano (sobre enabled:false semilla)
    this._activacionesFile = path.join(process.cwd(), 'data', 'ai-agent-framework', 'activaciones.json');
    this._crecidoDir = path.join(process.cwd(), 'data', 'ai-agent-framework', 'agents');  // agentes CRECIDOS (creados en caliente, patrón semilla+crecido)
    this.basePromptText = null;
    this.pendingLlm = new Map();
    this._conversationCache = new Map();
    this._conversationCacheTTL = DEFAULT_CONVERSATION_CACHE_TTL_MS;
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics || null;
    this.moduleLoader = context.moduleLoader || null;
    this.mqttRequest = context.mqttRequest || null;
    this.config = context.moduleConfig || context.config || {};
    this._conversationCacheTTL = this.config.conversation_cache_ttl_ms || DEFAULT_CONVERSATION_CACHE_TTL_MS;

    this._loadBasePrompt();
    this._loadActivaciones();   // overlay crecido: qué agentes encendió el humano
    this._loadAgents();

    if (this.moduleLoader?.toolsRegistry) {
      this._registerInvokeAgentTool();
      this._registerBuscarAgenteTool();     // cúpula de agentes: buscar en la biblioteca
      this._registerActivarAgenteTool();    // cúpula de agentes: encender/apagar de la biblioteca
      this._registerCrearAgenteTool();      // cúpula de agentes (tramo 3): crear uno nuevo en caliente
    }

    this.logger.info('ai-agent-framework.loaded', {
      agents: this.agents.size,
      base: !!this.basePromptText
    });
  }

  async onUnload() {
    for (const pending of this.pendingLlm.values()) {
      clearTimeout(pending.timeout);
    }
    this.pendingLlm.clear();
    this._conversationCache.clear();
    this.agents.clear();
    this.library.clear();
    this.activados.clear();
    this.basePromptText = null;
    this.logger?.info?.('ai-agent-framework.unloaded', {});
  }

  // ============================================================
  // Helpers POC2
  // ============================================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/timeout/i.test(msg)) return { status: 504, code: 'UPSTREAM_TIMEOUT' };
    if (/required|invalid|missing/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'subscribe') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('ai-agent-framework.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      crypto.randomUUID();
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    await this.eventBus.publish(name, enriched);
    return enriched;
  }

  // ============================================================
  // HTTP / UI API — sin endpoints HTTP (modulo solo bus + LLM)
  // ============================================================

  // ============================================================
  // Privados — Carga de base prompt + agentes desde FS
  // ============================================================

  _loadBasePrompt() {
    try {
      const p = path.join(__dirname, '../../_shared/base.prompt.json');
      this.basePromptText = JSON.stringify(JSON.parse(fs.readFileSync(p, 'utf8')), null, 2);
    } catch {
      this.basePromptText = null;
    }
  }

  _loadAgents() {
    // Idempotente: re-cargar (tras activar/desactivar/crear) parte de cero, así un agente
    // apagado por overlay SALE de this.agents (no solo entra el nuevo).
    this.agents.clear();
    this.library.clear();
    // SEMILLA (repo) + CRECIDO (data/, creado en caliente) — patrón semilla+crecido, como cosecha.
    // El crecido se carga después: un agente crecido con el mismo nombre pisa a su semilla.
    this._cargarDir(path.join(__dirname, 'agents'), false);
    this._cargarDir(this._crecidoDir, true);
  }

  _cargarDir(agentsDir, crecido) {
    const promptsDir = path.join(__dirname, 'prompts');
    let files;
    try { files = fs.readdirSync(agentsDir); } catch { return; }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const def = JSON.parse(fs.readFileSync(path.join(agentsDir, file), 'utf8'));
        if (!def.name) continue;

        // BIBLIOTECA (cúpula de agentes): toda definición conocida entra, activa o no, para
        // ser BUSCABLE. Solo las activas (enabled) pasan a this.agents → invocables. Así la
        // flota es una biblioteca (search) sobre la que se activa lo que haga falta.
        // activo = semilla enabled ∨ overlay del humano (activaciones.json). El overlay
        // enciende un agente aparcado sin editar su json semilla (patrón semilla+crecido).
        const activo = def.enabled !== false || this.activados.has(def.name);
        const scopeArr = Array.isArray(def.scope) ? def.scope : (def.scope ? [def.scope] : ['*']);
        this.library.set(def.name, {
          name: def.name,
          description: def.description || '',
          activo,
          dominio: (def.metadata && def.metadata.domain) || scopeArr[0] || null,
          scope: scopeArr,
          tools_count: Array.isArray(def.tools) ? def.tools.length : 0,
          tags: (def.metadata && def.metadata.tags) || [],
          crecido: !!crecido,
          obsoleto: /obsolet|deprecat|apagad|eliminad|fantasma/i.test((def.description || '') + (def._disabled_reason || ''))
        });

        if (!activo) continue;

        let promptText = null;
        // CRECIDO: el prompt (la política, p.ej. el loop prisma) viaja INLINE en def.prompt →
        // el agente es autocontenido, sin fichero aparte. SEMILLA: prompt_file / prompts/<name>.
        if (typeof def.prompt === 'string' && def.prompt.trim()) {
          promptText = def.prompt;
        } else {
        const promptFile = def.prompt_file
          ? path.join(__dirname, def.prompt_file)
          : null;

        if (promptFile && fs.existsSync(promptFile)) {
          const raw = fs.readFileSync(promptFile, 'utf8');
          promptText = promptFile.endsWith('.json')
            ? JSON.stringify(JSON.parse(raw), null, 2)
            : raw;
        } else {
          for (const ext of ['.json', '.md']) {
            const tryPath = path.join(promptsDir, def.name + ext);
            if (fs.existsSync(tryPath)) {
              const raw = fs.readFileSync(tryPath, 'utf8');
              promptText = ext === '.json' ? JSON.stringify(JSON.parse(raw), null, 2) : raw;
              break;
            }
          }
        }
        }

        this.agents.set(def.name, {
          name: def.name,
          description: def.description || '',
          scope: Array.isArray(def.scope) ? def.scope : (def.scope ? [def.scope] : ['*']),
          tools: Array.isArray(def.tools) ? def.tools : [],
          provider: def.provider || 'auto',
          model: def.model || null,
          temperature: def.temperature ?? DEFAULT_AGENT_TEMPERATURE,
          max_tokens: def.max_tokens || DEFAULT_AGENT_MAX_TOKENS,
          timeout_ms: def.timeout_ms || DEFAULT_AGENT_TIMEOUT_MS,
          prompt_text: promptText
        });
      } catch (err) {
        this.logger.warn('ai-agent-framework.agent.load.failed', {
          file, error_message: err.message
        });
        this.metrics?.increment?.('ai-agent-framework.errors', { code: 'UNKNOWN_ERROR', kind: 'load' });
      }
    }
  }

  _registerInvokeAgentTool() {
    const enabledAgents = Array.from(this.agents.values());
    const lines = enabledAgents.map(a => `  - ${a.name}: ${a.description}`).join('\n');

    const tool = {
      name: 'invoke_agent',
      description: `Invoca un agente especialista para una tarea concreta. Cada agente sabe su dominio.\n\nAgentes disponibles:\n${lines}\n\nDevuelve cuando el agente termina con el resultado.`,
      parameters: {
        type: 'object',
        properties: {
          agent_name: { type: 'string', description: 'Nombre exacto del agente', enum: enabledAgents.map(a => a.name) },
          task:       { type: 'string', description: 'Tarea concreta en lenguaje natural' },
          context:    { type: 'object', description: 'Datos especificos que el agente necesita (receta_id, etc.)' }
        },
        required: ['agent_name', 'task']
      },
      module: 'ai-agent-framework',
      event_based: true,
      _agents: enabledAgents.map(a => ({ name: a.name, scope: a.scope, description: a.description }))
    };

    this.moduleLoader.toolsRegistry.set('invoke_agent', tool);
    this.logger.info('ai-agent-framework.invoke_agent.registered', { agents: enabledAgents.length });
  }

  // Cúpula de agentes — la puerta de BÚSQUEDA de la biblioteca. Gemela de buscar_skill
  // (cosecha): el LLM/conserje encuentra el trabajador para una tarea, esté ACTIVO o no.
  // Lo que está activo se invoca ya con invoke_agent; lo que no, se activa (tramo 2).
  _registerBuscarAgenteTool() {
    const tool = {
      name: 'buscar_agente',
      description: 'Busca en la biblioteca de AGENTES (trabajadores especialistas que corren en contexto aislado) los que sirven para una tarea. Devuelve nombre, descripción, dominio y si está ACTIVO (invocable ya con invoke_agent) o solo en la biblioteca. ÚSALA cuando una tarea pediría un especialista y no sabes si existe uno.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', minLength: 1, description: 'La tarea/capacidad a buscar (p.ej. "analizar escandallo", "revisar carta digital", "estructurar factura").' },
          dominio: { type: 'string', description: 'Opcional: ceñir a un dominio (recetas, escandallo, carta-marketing, facturas…).' },
          limite: { type: 'number', description: 'Opcional: cuántos devolver (default 10).' }
        },
        required: ['query']
      },
      module: 'ai-agent-framework',
      event_based: true
    };
    this.moduleLoader.toolsRegistry.set('buscar_agente', tool);
    this.logger.info('ai-agent-framework.buscar_agente.registered', { library: this.library.size });
  }

  // ============================================================
  // Bus subscribers
  // ============================================================

  async onInvokeAgent(event) {
    try {
      return await this._runAgentLegacy(event);
    } catch (err) {
      this._handleHandlerError('ai-agent-framework.invoke_agent.error', err);
    }
  }

  // Cúpula de agentes — handler de buscar_agente (tool del chat). Busca en la biblioteca
  // y publica buscar_agente.response {request_id, result} (path canónico de tool por bus).
  async onBuscarAgente(event) {
    const d = event?.data || event || {};
    let result;
    try { result = this._buscarAgente(d); }
    catch (err) {
      this.metrics?.increment?.('ai-agent-framework.errors', { code: 'UNKNOWN_ERROR', kind: 'buscar_agente' });
      return this.eventBus.publish('buscar_agente.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
    return this.eventBus.publish('buscar_agente.response', { request_id: d.request_id, result });
  }

  // Proyección PURA: busca en la biblioteca por tokens del query, filtra dominio/obsoletos, rankea.
  _buscarAgente({ query, dominio, limite } = {}) {
    const q = String(query || '').toLowerCase().trim();
    const lim = Number(limite) || 10;
    const toks = q.split(/\s+/).filter(Boolean);
    const score = (a) => {
      const hay = `${a.name} ${a.description} ${(a.tags || []).join(' ')} ${a.dominio || ''}`.toLowerCase();
      return toks.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
    };
    let items = [...this.library.values()].filter(a => !a.obsoleto);
    if (dominio) items = items.filter(a => String(a.dominio || '').toLowerCase() === String(dominio).toLowerCase());
    const ranked = items
      .map(a => ({ a, s: toks.length ? score(a) : 1 }))
      .filter(x => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, lim)
      .map(({ a }) => ({ nombre: a.name, descripcion: a.description, dominio: a.dominio, activo: a.activo, tools: a.tools_count }));
    return { total: ranked.length, activos_en_biblioteca: [...this.library.values()].filter(a => a.activo).length, biblioteca: this.library.size, agentes: ranked };
  }

  // ─── Cúpula de agentes · TRAMO 2: encender/apagar de la biblioteca ──────────
  // El overlay crecido (data/ai-agent-framework/activaciones.json) enciende agentes
  // aparcados sin editar su json semilla. Conceder poder = decisión consciente →
  // activar_agente es confirmation:true. Reversible con desactivar_agente.

  _loadActivaciones() {
    try {
      const raw = fs.readFileSync(this._activacionesFile, 'utf8');
      const data = JSON.parse(raw);
      const arr = Array.isArray(data.activados) ? data.activados : [];
      this.activados = new Set(arr.filter(n => typeof n === 'string'));
    } catch { this.activados = new Set(); }
  }

  _saveActivaciones() {
    const dir = path.dirname(this._activacionesFile);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this._activacionesFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ _updated: new Date().toISOString(), activados: [...this.activados] }, null, 2));
    fs.renameSync(tmp, this._activacionesFile);
  }

  _registerActivarAgenteTool() {
    this.moduleLoader.toolsRegistry.set('activar_agente', {
      name: 'activar_agente',
      description: 'Enciende un agente de la biblioteca (uno que buscar_agente encontró con activo:false) para que quede INVOCABLE vía invoke_agent. ÚSALA cuando el usuario acepte activar un especialista aparcado. Es una acción que cambia el sistema (concede un trabajador nuevo) — requiere confirmación.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: { nombre: { type: 'string', minLength: 1, description: 'Nombre exacto del agente a encender (tal cual lo devolvió buscar_agente).' } },
        required: ['nombre']
      },
      module: 'ai-agent-framework', event_based: true, confirmation: true
    });
    this.moduleLoader.toolsRegistry.set('desactivar_agente', {
      name: 'desactivar_agente',
      description: 'Apaga un agente que se había encendido con activar_agente (reversibilidad). Solo apaga los encendidos por overlay; los agentes semilla activos no se apagan por aquí.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: { nombre: { type: 'string', minLength: 1, description: 'Nombre del agente a apagar.' } },
        required: ['nombre']
      },
      module: 'ai-agent-framework', event_based: true, confirmation: true
    });
    this.logger.info('ai-agent-framework.activar_agente.registered', { activados: this.activados.size });
  }

  _registerCrearAgenteTool() {
    this.moduleLoader.toolsRegistry.set('crear_agente', {
      name: 'crear_agente',
      description: 'CREA un agente nuevo en caliente (tramo 3 de la cúpula: buscar→activar→crear). ÚSALA cuando ninguna búsqueda (buscar_agente) encuentra el trabajador y hace falta uno nuevo — típicamente para EJECUTAR EN LOTE una senda repetitiva fuera del turno de chat. El `prompt` es la política del agente: apóyate en prisma (descompón el caso → el cuerpo es el loop "act(faltan[0]); re-evalúa hasta cerrado"). Nace INVOCABLE al instante vía invoke_agent. Cambia el sistema (nace un trabajador nuevo) — requiere confirmación.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, description: 'Slug único del agente [a-z0-9-]. No puede pisar un agente semilla existente.' },
          description: { type: 'string', minLength: 1, description: 'Qué resuelve el agente (lo que buscar_agente indexará).' },
          prompt: { type: 'string', minLength: 1, description: 'La POLÍTICA/instrucciones del agente. Apóyate en prisma: contrato → leer → pensar → validar → guardar → emitir, con el loop hasta cerrar el círculo.' },
          scope: { type: 'array', items: { type: 'string' }, description: 'Dominios donde aplica (["*"] = global).' },
          tools: { type: 'array', items: { type: 'string' }, description: 'Nombres de tools que el agente puede usar (p.ej. leer_web, descargar_web).' }
        },
        required: ['name', 'description', 'prompt']
      },
      module: 'ai-agent-framework', event_based: true, confirmation: true
    });
    this.moduleLoader.toolsRegistry.set('crear_agente_desde_caso', {
      name: 'crear_agente_desde_caso',
      description: 'CREA un agente ENCENDIENDO UNA LÁMPARA sobre un caso — la forma prisma-dirigida (preferida) de montar un trabajador. No escribes su política: describes el CASO (qué dato falta, sobre qué, con qué herramientas) y prisma lo descompone → el prompt del agente NACE del molde (contrato + senda + el loop "ataca lo que falta hasta cerrar el círculo"). ÚSALA para sendas repetitivas en lote (p.ej. vincular imágenes de una tienda). Nace INVOCABLE. Requiere confirmación.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          necesidad: { type: 'string', minLength: 1, description: 'Qué dato/resultado falta (p.ej. "imagen del producto").' },
          entidad: { type: 'string', description: 'Sobre qué (p.ej. "productos del catálogo").' },
          dominio: { type: 'string', description: 'El módulo/dominio dueño (p.ej. "contenido").' },
          rasgos: { type: 'object', description: 'Propiedades del dato: { afirma_sobre_el_mundo?: bool, derivable_de_internos?: bool }. Deciden la naturaleza (y si exige evidencia).' },
          herramientas: { type: 'array', items: { type: 'string' }, description: 'Herramientas candidatas (p.ej. leer_web, descargar_web, contenido.add_imagen).' }
        },
        required: ['necesidad']
      },
      module: 'ai-agent-framework', event_based: true, confirmation: true
    });
    this.logger.info('ai-agent-framework.crear_agente.registered', {});
  }

  async onActivarAgente(event) {
    const d = event?.data || event || {};
    let result;
    try { result = this._activar(d); }
    catch (err) {
      this.metrics?.increment?.('ai-agent-framework.errors', { code: 'UNKNOWN_ERROR', kind: 'activar_agente' });
      return this.eventBus.publish('activar_agente.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
    return this.eventBus.publish('activar_agente.response', { request_id: d.request_id, ...(result.status ? { error: result.error } : { result }) });
  }

  async onDesactivarAgente(event) {
    const d = event?.data || event || {};
    let result;
    try { result = this._desactivar(d); }
    catch (err) {
      this.metrics?.increment?.('ai-agent-framework.errors', { code: 'UNKNOWN_ERROR', kind: 'desactivar_agente' });
      return this.eventBus.publish('desactivar_agente.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
    return this.eventBus.publish('desactivar_agente.response', { request_id: d.request_id, ...(result.status ? { error: result.error } : { result }) });
  }

  // Enciende: añade al overlay, persiste, re-carga (el agente entra en this.agents) y
  // re-registra invoke_agent (queda invocable EN CALIENTE, sin reiniciar).
  _activar({ nombre } = {}) {
    const n = String(nombre || '').trim();
    if (!n) return this._errorResponse(400, 'INVALID_INPUT', 'nombre requerido');
    const lib = this.library.get(n);
    if (!lib) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `agente desconocido: ${n}`, { faltan: [n] });
    if (this.agents.has(n)) return { nombre: n, activado: true, ya_estaba: true, activos: this.agents.size };
    this.activados.add(n);
    this._saveActivaciones();
    this._loadAgents();
    this._registerInvokeAgentTool();
    this.metrics?.increment?.('ai-agent-framework.activados.total');
    this.logger.info('ai-agent-framework.agente.activado', { nombre: n, dominio: lib.dominio, activos: this.agents.size });
    return { nombre: n, activado: true, dominio: lib.dominio, activos: this.agents.size };
  }

  // Apaga (reversibilidad): solo lo encendido por overlay. Un agente semilla activo
  // no se apaga por aquí (409) — su enabled vive en el json, no en el overlay.
  _desactivar({ nombre } = {}) {
    const n = String(nombre || '').trim();
    if (!n) return this._errorResponse(400, 'INVALID_INPUT', 'nombre requerido');
    if (!this.activados.has(n)) {
      const lib = this.library.get(n);
      if (lib && lib.activo) return this._errorResponse(409, 'CONFLICT_STATE', `${n} es semilla activa: no se apaga por overlay`);
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `no estaba encendido por overlay: ${n}`);
    }
    this.activados.delete(n);
    this._saveActivaciones();
    this._loadAgents();
    this._registerInvokeAgentTool();
    this.logger.info('ai-agent-framework.agente.desactivado', { nombre: n, activos: this.agents.size });
    return { nombre: n, desactivado: true, activos: this.agents.size };
  }

  // CREA un agente CRECIDO en caliente (tramo 3 de la cúpula: buscar→activar→CREAR).
  // Gemela de cosecha._crear (skills). Valida la definición, la escribe en el dir crecido
  // (data/ai-agent-framework/agents/), y re-carga + re-registra invoke_agent EN CALIENTE →
  // el agente nace INVOCABLE, sin reiniciar. El `prompt` es la POLÍTICA (p.ej. el loop
  // prisma-dirigido); todo lo demás (invoke, loop, agent-flow) ya funciona sin tocar nada.
  _crear(input = {}) {
    const d = input.definicion || input.def || input;
    const nombre = String((d && d.name) || '').trim();
    if (!nombre) return this._errorResponse(400, 'INVALID_INPUT', 'name requerido');
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(nombre)) return this._errorResponse(400, 'INVALID_INPUT', 'name debe ser un slug [a-z0-9-]', { name: nombre });
    if (!d.description) return this._errorResponse(422, 'UPSTREAM_INVALID_RESPONSE', 'description requerida', { field: 'description' });
    if (!(typeof d.prompt === 'string' && d.prompt.trim())) return this._errorResponse(422, 'UPSTREAM_INVALID_RESPONSE', 'prompt (la política del agente) requerido', { field: 'prompt' });
    // Semilla activa con ese nombre: no se pisa por crecido a ciegas (evita secuestrar un nativo).
    const semilla = this.library.get(nombre);
    if (semilla && !semilla.crecido) return this._errorResponse(409, 'CONFLICT_STATE', `ya existe un agente semilla '${nombre}': elige otro nombre`, { nombre });

    const def = {
      name: nombre,
      description: String(d.description),
      scope: Array.isArray(d.scope) ? d.scope : (d.scope ? [String(d.scope)] : ['*']),
      tools: Array.isArray(d.tools) ? d.tools : [],
      provider: d.provider || 'auto',
      model: d.model || null,
      temperature: typeof d.temperature === 'number' ? d.temperature : DEFAULT_AGENT_TEMPERATURE,
      max_tokens: d.max_tokens || DEFAULT_AGENT_MAX_TOKENS,
      prompt: String(d.prompt),
      enabled: true,
      metadata: {
        domain: (d.metadata && d.metadata.domain) || (Array.isArray(d.scope) ? d.scope[0] : d.scope) || null,
        tags: (d.metadata && d.metadata.tags) || [],
        origen: 'crecido',
        creado_at: new Date().toISOString()
      }
    };

    fs.mkdirSync(this._crecidoDir, { recursive: true });
    const file = path.join(this._crecidoDir, nombre + '.json');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(def, null, 2));
    fs.renameSync(tmp, file);

    this._loadAgents();
    this._registerInvokeAgentTool();
    this.metrics?.increment?.('ai-agent-framework.creados.total');
    this.logger.info('ai-agent-framework.agente.creado', { nombre, dominio: def.metadata.domain, activos: this.agents.size });
    return { nombre, creado: true, invocable: this.agents.has(nombre), activos: this.agents.size };
  }

  async onCrearAgente(event) {
    const d = event?.data || event || {};
    let result;
    try { result = this._crear(d); }
    catch (err) {
      this.metrics?.increment?.('ai-agent-framework.errors', { code: 'UNKNOWN_ERROR', kind: 'crear_agente' });
      return this.eventBus.publish('crear_agente.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
    return this.eventBus.publish('crear_agente.response', { request_id: d.request_id, ...(result.status ? { error: result.error } : { result }) });
  }

  // EL MOLDE PRISMA — crear un agente = ENCENDER UNA LÁMPARA SOBRE UN CASO.
  // No se escribe política a mano: prisma.descomponer ilumina el caso (naturaleza · contrato ·
  // preguntas · no_objetivos) y esa luz SE VUELVE el prompt del agente, cuyo cuerpo es el loop
  // "act(faltan[0]) hasta circuloCerrado.cerrado". Instanciar el molde = crear el agente.
  //   caso = { necesidad, entidad?, dominio?, rasgos?, herramientas? }   (igual que prisma)
  _crearDesdeCaso(input = {}) {
    const caso = input.caso || input;
    if (!caso || !caso.necesidad) return this._errorResponse(400, 'INVALID_INPUT', 'caso.necesidad requerida', { field: 'necesidad' });
    const luz = descomponer(caso);
    const nombre = ('agente-' + (caso.dominio || 'caso') + '-' + caso.necesidad)
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 55) || 'agente-caso';
    const def = {
      name: nombre,
      description: `Resuelve el caso: ${caso.necesidad}${caso.entidad ? ' de ' + caso.entidad : ''} — naturaleza ${luz.identidad.naturaleza}`,
      prompt: this._plantillaPrisma(caso, luz),
      scope: caso.dominio ? [String(caso.dominio)] : ['*'],
      tools: Array.isArray(caso.herramientas) ? caso.herramientas : [],
      metadata: { tags: ['prisma', luz.identidad.naturaleza.toLowerCase()], caso }
    };
    const r = this._crear(def);
    if (r && r.creado) r.naturaleza = luz.identidad.naturaleza;
    return r;
  }

  // La luz de prisma → el prompt del agente. La política ES el círculo: mira qué falta,
  // atácalo, re-evalúa; cierra cuando no falta nada. Positivo, sin narrar.
  _plantillaPrisma(caso, luz) {
    const preguntas = (luz.preguntas_abiertas || []).map((p, i) => `  ${i + 1}. ${p}`).join('\n');
    const noObj = (luz.no_objetivos || []).map(x => `  - ${x}`).join('\n');
    const tools = (Array.isArray(caso.herramientas) && caso.herramientas.length) ? caso.herramientas.join(', ') : '(las de tu scope)';
    return [
      `Eres un agente que RESUELVE un caso de naturaleza ${luz.identidad.naturaleza}. No describes: cierras.`,
      ``,
      `CASO: ${caso.necesidad}${caso.entidad ? ' sobre "' + caso.entidad + '"' : ''}${caso.dominio ? ' (dominio ' + caso.dominio + ')' : ''}.`,
      ``,
      `LA LUZ (prisma te ilumina el camino):`,
      `- Ley/restricción: ${luz.restricciones.ley}`,
      `- Contrato a llenar: ${JSON.stringify(luz.contrato)}`,
      `- Tu senda (resuelve en orden):`,
      preguntas,
      `- Nunca hagas esto:`,
      noObj,
      ``,
      `TU LOOP (camina la luz, no la narres):`,
      `  repite:`,
      `    1. mira qué FALTA para cerrar el círculo (valor · evidencia con dirección de vuelta · freno verde · evento de cierre emitido).`,
      `    2. ataca lo PRIMERO que falta con tus herramientas: ${tools}.`,
      `    3. re-evalúa.`,
      `  hasta que no falte nada. Entonces EMITE el evento de cierre y para.`,
      ``,
      `Regla de oro: no afirmes "hecho" sin haber emitido el evento de cierre. Una afirmación externa sin`,
      `dirección de vuelta (una url/ref re-comprobable) NO cuenta — re-resuélvela por una fuente real.`
    ].join('\n');
  }

  async onCrearAgenteDesdeCaso(event) {
    const d = event?.data || event || {};
    let result;
    try { result = this._crearDesdeCaso(d); }
    catch (err) {
      this.metrics?.increment?.('ai-agent-framework.errors', { code: 'UNKNOWN_ERROR', kind: 'crear_agente_desde_caso' });
      return this.eventBus.publish('crear_agente_desde_caso.response', { request_id: d.request_id, error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
    return this.eventBus.publish('crear_agente_desde_caso.response', { request_id: d.request_id, ...(result.status ? { error: result.error } : { result }) });
  }

  async onAgentExecuteRequest(event) {
    try {
      const data = event?.data || event;

      const correlation_id = data.correlation_id || crypto.randomUUID();
      const request_id = data.request_id;
      const agent_name = data.agent_name;
      const user_id = data.user_id || 'default';
      const project_id = data.project_id ?? null;
      const conversation_id = data.conversation_id ?? data.context?.conversation_id ?? null;
      const channel = data.channel;
      const channel_context = data.channel_context;
      const task = data.task;
      const context = data.context || {};
      const settings = data.settings || {};
      const session_id = data.session_id ?? null;
      const prev_state = data.prev_state ?? null;

      const startedAt = Date.now();
      const baseEnvelope = {
        correlation_id, request_id, user_id, agent_name,
        conversation_id, project_id, channel, channel_context, startedAt
      };

      if (!request_id) {
        this.logger.warn('ai-agent-framework.agent_execute.invalid_payload', {
          reason: 'request_id obligatorio'
        });
        this.metrics?.increment?.('ai-agent-framework.errors', { code: 'INVALID_INPUT', kind: 'agent_execute' });
        return;
      }
      if (!agent_name) {
        return this._publishAgentExecuteFailed({
          ...baseEnvelope,
          error: { code: 'INVALID_INPUT', message: 'agent_name obligatorio' },
          iterations_completed: 0,
          provider_attempted: null
        });
      }

      const agent = this.agents.get(agent_name);
      if (!agent) {
        return this._publishAgentExecuteFailed({
          ...baseEnvelope,
          error: { code: 'RESOURCE_NOT_FOUND', message: `Agente '${agent_name}' no encontrado` },
          iterations_completed: 0,
          provider_attempted: null
        });
      }

      if (!task && (!context || Object.keys(context).length === 0)) {
        return this._publishAgentExecuteFailed({
          ...baseEnvelope,
          error: { code: 'INVALID_INPUT', message: 'Debe proporcionar task o context' },
          iterations_completed: 0,
          provider_attempted: null
        });
      }

      let resolved_conversation_id = conversation_id;
      if (!resolved_conversation_id && project_id) {
        resolved_conversation_id = await this._resolveDefaultConversationId(project_id);
      }

      this.metrics?.increment?.('ai-agent-framework.agent.executed', { agent_name });
      return this._dispatchToLlm({
        ...baseEnvelope,
        conversation_id: resolved_conversation_id,
        shape: 'canonical',
        agent, task, context, session_id, prev_state, settings
      });
    } catch (err) {
      this._handleHandlerError('ai-agent-framework.agent_execute.error', err);
    }
  }

  async _resolveDefaultConversationId(project_id) {
    if (!project_id) return null;
    const cached = this._conversationCache.get(project_id);
    if (cached && (Date.now() - cached.at) < this._conversationCacheTTL) {
      return cached.conversation_id;
    }
    if (!this.mqttRequest) {
      this.logger?.warn?.('ai-agent-framework.resolve_conversation.no_mqtt_request', {
        project_id, reason: 'mqttRequest no disponible'
      });
      return null;
    }
    try {
      const result = await this.mqttRequest('project', 'get-default-conversation',
        { project_id }, { timeout_ms: DEFAULT_RESOLVE_TIMEOUT_MS });
      const conversation_id = result?.conversation_id || null;
      if (conversation_id) {
        this._conversationCache.set(project_id, { conversation_id, at: Date.now() });
      }
      return conversation_id;
    } catch (err) {
      this.logger?.warn?.('ai-agent-framework.resolve_conversation.failed', {
        project_id, error_message: err.message
      });
      return null;
    }
  }

  async _dispatchToLlm(ctx) {
    const { agent, task, context, session_id, prev_state, settings } = ctx;

    const sections = [];
    if (this.basePromptText) sections.push(this.basePromptText);
    if (agent.prompt_text) sections.push(agent.prompt_text);
    const ctxToInject = { task, context };
    if (prev_state) ctxToInject.prev_state = prev_state;
    if (session_id) ctxToInject.session_id = session_id;
    sections.push('CONTEXTO ENTREGADO:\n' + JSON.stringify(ctxToInject, null, 2));
    const system = sections.join('\n\n---\n\n');

    const allTools = this.moduleLoader?.getToolsForAI?.() || [];
    const toolsForAgent = agent.tools.length > 0
      ? allTools.filter(t => agent.tools.includes(t.name))
      : [];

    const llm_request_id = crypto.randomUUID();
    const timeout_ms = settings?.timeout_ms || agent.timeout_ms;

    const timeout = setTimeout(() => {
      const pending = this.pendingLlm.get(llm_request_id);
      if (!pending) return;
      this.pendingLlm.delete(llm_request_id);
      if (pending.shape === 'canonical') {
        this._publishAgentExecuteFailed({
          ...pending,
          error: { code: 'UPSTREAM_TIMEOUT', message: `Timeout esperando agente ${pending.agent_name} (${timeout_ms}ms)` },
          iterations_completed: 0,
          provider_attempted: null
        });
      } else {
        this.eventBus.publish(pending.response_event, {
          request_id: pending.original_request_id, session_id: pending.session_id,
          error: { code: 'UPSTREAM_TIMEOUT', message: `Timeout esperando agente ${pending.agent_name} (${timeout_ms}ms)` }
        });
      }
    }, timeout_ms);

    this.pendingLlm.set(llm_request_id, {
      ...ctx,
      original_request_id: ctx.request_id,
      session_id,
      timeout
    });

    if (ctx.shape === 'canonical') {
      this._publishProgress({
        ...ctx,
        original_request_id: ctx.request_id,
        step: 'started',
        message: `Agente ${ctx.agent_name} iniciando`
      });
    }

    await this._publicarEvento('llm.complete.request', {
      request_id: llm_request_id,
      system,
      messages: [{ role: 'user', content: task || '' }],
      tools: toolsForAgent,
      settings: {
        temperature: settings?.temperature ?? agent.temperature,
        max_tokens: settings?.max_tokens ?? agent.max_tokens,
        ...(settings?.model || agent.model ? { model: settings?.model || agent.model } : {})
      },
      attachments: [],
      project_id: ctx.project_id ?? context?.project_id ?? null,
      conversation_id: ctx.conversation_id,
      page_id: null,
      provider: settings?.provider || agent.provider
    }, { correlation_id: ctx.correlation_id, project_id: ctx.project_id });
  }

  async _runAgentLegacy(event) {
    const data = event?.data || event;
    const request_id = data.request_id;
    const agent_name = data.agent_name || data.agentName;
    const task = data.task;
    const context = data.context || {};
    const session_id = data.session_id ?? null;
    const prev_state = data.prev_state ?? null;
    const conversation_id = data.conversation_id ?? context.conversation_id ?? null;

    const agent = this.agents.get(agent_name);
    if (!agent) {
      return this.eventBus.publish('invoke_agent.response', {
        request_id, session_id,
        error: { code: 'RESOURCE_NOT_FOUND', message: `Agente '${agent_name}' no encontrado` }
      });
    }

    return this._dispatchToLlm({
      shape: 'legacy',
      response_event: 'invoke_agent.response',
      original_request_id: request_id,
      request_id,
      agent_name,
      agent,
      task, context,
      session_id, prev_state,
      conversation_id,
      project_id: context.project_id || null,
      settings: {}
    });
  }

  async onLlmCompleteResponse(event) {
    try {
      const data = event?.data || event;
      const { request_id, content, tool_calls_executed, model, provider, usage } = data;
      // Por contrato llm-flow: llm.complete.response cierra exito (sin flag success).
      // Los fallos vienen por evento separado llm.complete.failed, handler distinto.

      const pending = this.pendingLlm.get(request_id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pendingLlm.delete(request_id);

      if (pending.shape === 'canonical') {
        const duration_ms = Date.now() - pending.startedAt;
        this._publishProgress({
          ...pending,
          step: 'finalizing',
          message: `Agente ${pending.agent_name} terminando`
        });
        return this._publishAgentExecuteResponse({
          ...pending,
          content,
          tool_calls_executed: tool_calls_executed || [],
          model, provider, usage,
          duration_ms
        });
      }

      // Legacy invoke_agent.response — exito
      return this.eventBus.publish('invoke_agent.response', {
        request_id: pending.original_request_id,
        session_id: pending.session_id,
        next_state: null, should_continue: false,
        result: { agent: pending.agent_name, content, tool_calls_executed: tool_calls_executed || [] }
      });
    } catch (err) {
      this._handleHandlerError('ai-agent-framework.llm_complete_response.error', err);
    }
  }

  async onLlmCompleteFailed(event) {
    try {
      const data = event?.data || event;
      const { request_id, error, provider, usage } = data;

      const pending = this.pendingLlm.get(request_id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pendingLlm.delete(request_id);

      if (pending.shape === 'canonical') {
        const duration_ms = Date.now() - pending.startedAt;
        this._publishProgress({
          ...pending,
          step: 'finalizing',
          message: `Agente ${pending.agent_name} fallando`
        });
        return this._publishAgentExecuteFailed({
          ...pending,
          error: this._classifyLlmError(error || 'agent execution failed'),
          duration_ms,
          iterations_completed: 0,
          provider_attempted: provider || null
        });
      }

      // Legacy invoke_agent.response — error
      const errObj = (typeof error === 'object' && error !== null)
        ? error
        : this._classifyLlmError(error || 'agent execution failed');
      return this.eventBus.publish('invoke_agent.response', {
        request_id: pending.original_request_id,
        session_id: pending.session_id,
        next_state: null, should_continue: false,
        error: errObj
      });
    } catch (err) {
      this._handleHandlerError('ai-agent-framework.llm_complete_failed.error', err);
    }
  }

  // ============================================================
  // Publishers canonicos agent-flow
  // ============================================================

  async _publishAgentExecuteResponse(ctx) {
    const tool_calls = ctx.tool_calls_executed || [];
    const payload = {
      request_id: ctx.original_request_id,
      user_id: ctx.user_id,
      agent_name: ctx.agent_name,
      result: {
        content: ctx.content || '',
        agent: ctx.agent_name,
        tool_calls_executed: tool_calls
      },
      duration_ms: ctx.duration_ms,
      tool_calls_executed: tool_calls,
      next_state: null,
      should_continue: false
    };
    if (ctx.conversation_id) payload.conversation_id = ctx.conversation_id;
    if (ctx.channel) payload.channel = ctx.channel;
    if (ctx.channel_context) payload.channel_context = ctx.channel_context;
    if (ctx.model) payload.model = ctx.model;
    if (ctx.provider) payload.provider = ctx.provider;
    if (ctx.usage) payload.tokens = {
      input: ctx.usage.input_tokens || 0,
      output: ctx.usage.output_tokens || 0,
      total: ctx.usage.total_tokens || ((ctx.usage.input_tokens || 0) + (ctx.usage.output_tokens || 0))
    };

    // chat.assistant.saved se delega a agent-observer (adaptador canonico
    // agent-flow → chat-flow). agent-observer escucha agent.execute.response/
    // failed/progress y traduce a chat.assistant.saved con metadata.author +
    // metadata.block. Si ai-agent-framework lo publicara aqui tambien,
    // chat-io persistiria la tarjeta dos veces (mismo contenido, dos rows).

    return this._publicarEvento('agent.execute.response', payload, {
      correlation_id: ctx.correlation_id, project_id: ctx.project_id
    });
  }

  async _publishAgentExecuteFailed(ctx) {
    this.logger.error('ai-agent-framework.agent.failed', {
      correlation_id: ctx.correlation_id,
      request_id: ctx.original_request_id || ctx.request_id,
      agent_name: ctx.agent_name,
      code: ctx.error.code,
      message: ctx.error.message
    });
    this.metrics?.increment?.('ai-agent-framework.errors', { code: ctx.error.code, kind: 'agent' });
    const payload = {
      request_id: ctx.original_request_id || ctx.request_id,
      user_id: ctx.user_id || 'default',
      agent_name: ctx.agent_name || 'unknown',
      error: ctx.error
    };
    if (ctx.conversation_id) payload.conversation_id = ctx.conversation_id;
    if (ctx.channel) payload.channel = ctx.channel;
    if (ctx.channel_context) payload.channel_context = ctx.channel_context;
    if (typeof ctx.duration_ms === 'number') payload.duration_ms = ctx.duration_ms;
    else if (ctx.startedAt) payload.duration_ms = Date.now() - ctx.startedAt;
    if (typeof ctx.iterations_completed === 'number') payload.iterations_completed = ctx.iterations_completed;
    if ('provider_attempted' in ctx) payload.provider_attempted = ctx.provider_attempted;

    return this._publicarEvento('agent.execute.failed', payload, {
      correlation_id: ctx.correlation_id, project_id: ctx.project_id
    });
  }

  _publishProgress(ctx) {
    if (!ctx.agent_name || !ctx.original_request_id) return;
    const payload = {
      request_id: ctx.original_request_id,
      user_id: ctx.user_id || 'default',
      agent_name: ctx.agent_name,
      step: ctx.step
    };
    if (ctx.conversation_id) payload.conversation_id = ctx.conversation_id;
    if (typeof ctx.iteration === 'number') payload.iteration = ctx.iteration;
    if (ctx.tool_invoked) payload.tool_invoked = ctx.tool_invoked;
    if (ctx.message) payload.message = ctx.message;
    if (ctx.metadata) payload.metadata = ctx.metadata;
    this._publicarEvento('agent.execute.progress', payload, {
      correlation_id: ctx.correlation_id, project_id: ctx.project_id
    }).catch(err => {
      this.logger?.debug?.('ai-agent-framework.progress.publish.failed', { error_message: err.message });
    });
  }

  _classifyLlmError(rawMessage) {
    const raw = (rawMessage && typeof rawMessage === 'string') ? rawMessage : 'unknown error';
    const lower = raw.toLowerCase();

    let code = 'UNKNOWN_ERROR';
    if (/credential .*timeout|sin credencial|no api key|api key not|credential not found/i.test(raw)) code = 'RESOURCE_NOT_FOUND';
    else if (/no hay providers? disponibles?|no providers available/i.test(raw)) code = 'RESOURCE_NOT_FOUND';
    else if (lower.includes('timeout') || lower.includes('etimedout')) code = 'UPSTREAM_TIMEOUT';
    else if (/429|rate.?limit/.test(lower)) code = 'UPSTREAM_INVALID_RESPONSE';
    else if (/401|403|unauthorized|forbidden|invalid api key/.test(lower)) code = 'UPSTREAM_INVALID_RESPONSE';
    else if (/5\d\d|internal server error|bad gateway|service unavailable/.test(lower)) code = 'UPSTREAM_INVALID_RESPONSE';
    else if (/econnrefused|enotfound|network|unreachable|fetch failed/.test(lower)) code = 'UPSTREAM_UNREACHABLE';
    else if (/invalid response|malformed|parse|unexpected token/.test(lower)) code = 'UPSTREAM_INVALID_RESPONSE';

    return { code, message: raw, details: {} };
  }
}

module.exports = AiAgentFrameworkModule;
