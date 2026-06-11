/**
 * ai-gateway — Ejecutor del LLM
 *
 * Dos entry points (mismo `_executeLLM` por dentro):
 *   chat.prompt.ready       → publica ai.chat.response       (flujo del chat)
 *   llm.complete.request    → publica llm.complete.response  (flujo genérico, usado por agentes)
 *
 * Responsabilidades:
 *   - Cargar tools del moduleLoader y filtrar por page_id (+ globales)
 *   - Leer attachments con fs.read.request en paralelo
 *   - Resolver credenciales del provider via credential-manager
 *   - Llamar provider con fallback automático (priority order)
 *   - Agentic loop: ejecutar tool calls vía eventos {tool_name} → {tool_name}.response
 *   - Reintento con backoff (configurado en module.json)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DeepSeekProvider  = require('./providers/deepseek-provider');
const AnthropicProvider = require('./providers/anthropic-provider');
const OpenAIProvider    = require('./providers/openai-provider');
const GroqProvider      = require('./providers/groq-provider');
const GeminiProvider    = require('./providers/gemini-provider');
const OllamaProvider    = require('./providers/ollama-provider');
const ClaudeCliProvider = require('./providers/claude-cli-provider');
const KimiProvider      = require('./providers/kimi-provider');

const BaseModule = require('../../_shared/base-module');
class AiGatewayModule extends BaseModule {
  constructor() {
    super();
    this.name = 'ai-gateway';
    this.version = '2.0.0';
    this.config = null;
    this.moduleLoader = null;

    this.providers = new Map();
    this.credentialCache = new Map();    // provider → { apiKey, resolvedAt, projectId }
    this.pendingCredentials = new Map(); // request_id → { resolve, reject, timeout }
    this.pendingFsReads = new Map();     // request_id → { resolve, reject, timeout }
    // Cache de prefijos por page_id, poblado lazy por _buildPagePrefixes()
    this.pagePrefixes = null;            // Map<page_id, Set<prefix>>
    // Mapa target_page_id → { manifest, parentBlueprint, childBlueprint, systemPrompt }
    // poblado por _loadBlueprints() al arrancar. Cuando el chat tiene page_id
    // que esta en este mapa, ai-gateway:
    //   1. Inyecta el systemPrompt al sistema (concatena padre + hijo)
    //   2. Expone bus.publish y bus.publishAndWait al LLM (2 tools universales)
    //   3. El LLM lee el pseudocodigo del blueprint y publica eventos al bus
    //      directamente via las 2 tools — sin runtime intermedio.
    this.blueprintModules = new Map();

    // cajones-context-partitioning v1.0.0
    // target_page_id → [{nombre, descripcion}] del catalogo de cajones extraido del blueprint hijo.
    // Solo se puebla para blueprints con cajones_enabled: true en su manifest.
    this.cajonesCatalog = new Map();
    // conversation_id → [{nombre, turn}] historial de cajones abiertos para ranking por recencia.
    // Limitado a CAJONES_HISTORY_MAX entries por conversacion (FIFO).
    this.conversationCajones = new Map();

    // cajones Fase 5 bis (foco dinamico + grafo de paginas relacionadas)
    // Grafo dirigido { page_id: { consumes: Set<page_id>, consumed_by: Set<page_id> } }
    // construido al arrancar parseando publishAndWait('<mod>.<accion>.request', ...)
    // en el pseudocodigo de los blueprints + paginas_relacionadas declarado en module.json.
    this.pageGraph = new Map();
    // conversation_id → page_id "foco" actualizado por chat.cambiar_foco. Si no hay
    // entry, se respeta el page_id que viene en cada request del chat.
    this.conversationPageFoco = new Map();

    // Nervio propioceptivo: conversation_id → ts del ultimo evento de
    // propiocepcion ya inyectado en el contexto. Asi cada turno solo ve lo
    // NUEVO que paso en su mundo desde la ultima vez (no se re-inyecta ruido).
    this.conversationPropioTs = new Map();

    // Blueprint subscribers asincronos (frente 2.4 cierre 2026-05-24):
    // event_name → [{ page_id, handler_name, unsub }]. Poblado en _wireBlueprintAsyncSubscribers
    // al arrancar leyendo eventos_que_escucho de cada blueprint hijo. Cuando llega
    // un evento, ai-gateway arranca una conversacion sintetica e invoca al LLM
    // para que ejecute el handler como cualquier otra operacion del blueprint.
    // Patron documentado en arquitectura/decisiones/propuestas/blueprint-subscribers-asincronos.md.
    this.asyncSubscriptions = new Map();
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};
    this.moduleLoader = context.moduleLoader || null;

    await this._initializeProviders();
    this._loadBlueprints();
    // Wire intent al arranque: si los blueprint modules ya estan cargados
    // (eg. ai-gateway carga ultimo) el wiring se completa aqui. Si no,
    // este bucle no hace nada y nos apoyamos en core.modules.loaded.all
    // (abajo) + el lazy rewire en _getTools como defensa en profundidad.
    this._wireBlueprintAsyncSubscribers();

    // Suscripcion canonica: cuando el loader termina loadAll(), publica
    // core.modules.loaded.all. Garantiza que el wiring de blueprint async
    // subscribers se ejecuta despues de que TODOS los modulos esten
    // cargados, sustituyendo el lazy-rewire del PR #206 por un disparo
    // deterministico. El lazy-rewire se conserva 1-2 semanas como red
    // defensiva por si la suscripcion se registra despues de la emision.
    //
    // Tambien reconstruimos blueprintModules + pageGraph aqui: si ai-gateway
    // se cargo antes que los blueprint modules (caso comun cuando los blueprints
    // van al final del loadAll por no estar en config.modules.enabled), el
    // _loadBlueprints() de onLoad encontro loadedModules sin blueprints y
    // dejo el grafo a 0 nodos. Sin esta reconstruccion, page.related devuelve
    // related:[] tras cualquier restart hasta que un chat dispare el lazy-load
    // en _getTools — caso testigo 2026-05-26: deploy con grafo a 0/0 al
    // arranque, panel "Sin paginas relacionadas" persistente sin chat previo.
    if (this.eventBus?.subscribe) {
      this._modulesLoadedAllUnsub = this.eventBus.subscribe(
        'core.modules.loaded.all',
        () => {
          try {
            this._loadBlueprints();
            this._wireBlueprintAsyncSubscribers();
          } catch (err) {
            this.logger?.warn('ai-gateway.modules-loaded-all.handler_failed', {
              error_message: err && err.message ? err.message : String(err)
            });
          }
        }
      );
    }

    this.logger.info('ai-gateway.loaded', {
      providers: this.providers.size,
      blueprints: this.blueprintModules.size,
      async_subscribers: this.asyncSubscriptions.size
    });
  }

  async onUnload() {
    this.providers.clear();
    this.credentialCache.clear();
    for (const { timeout } of this.pendingCredentials.values()) clearTimeout(timeout);
    this.pendingCredentials.clear();
    for (const { timeout } of this.pendingFsReads.values()) clearTimeout(timeout);
    this.pendingFsReads.clear();
    this.cajonesCatalog.clear();
    this.conversationCajones.clear();
    this.conversationPropioTs.clear();
    this.pageGraph.clear();
    this.conversationPageFoco.clear();
    // Liberar suscripcion al evento canonico core.modules.loaded.all.
    if (typeof this._modulesLoadedAllUnsub === 'function') {
      try {
        this._modulesLoadedAllUnsub();
      } catch (err) {
        this.logger?.warn('ai-gateway.modules-loaded-all.unsub_failed', {
          error_message: err && err.message ? err.message : String(err)
        });
      }
      this._modulesLoadedAllUnsub = null;
    }
    // Liberar subscripciones asincronas de blueprint subscribers.
    // Acumulamos errores y reportamos UNA vez para evitar log spam en bucle.
    const unsubFailures = [];
    for (const subs of this.asyncSubscriptions.values()) {
      for (const sub of subs) {
        try {
          if (typeof sub.unsub === 'function') sub.unsub();
        } catch (err) {
          unsubFailures.push(err && err.message ? err.message : String(err));
        }
      }
    }
    if (unsubFailures.length > 0) {
      this.logger.warn('ai-gateway.blueprint_subscriber.unsub_failed', {
        count: unsubFailures.length,
        sample: unsubFailures.slice(0, 5)
      });
    }
    this.asyncSubscriptions.clear();
  }

  // ============================================================
  // Providers
  // ============================================================

  async _initializeProviders() {
    const classes = {
      deepseek: DeepSeekProvider,
      anthropic: AnthropicProvider,
      openai: OpenAIProvider,
      groq: GroqProvider,
      gemini: GeminiProvider,
      ollama: OllamaProvider,
      'claude-cli': ClaudeCliProvider,
      kimi: KimiProvider
    };
    const credentialResolver = (provider, projectId) => this._resolveCredential(provider, projectId);

    for (const [name, Cls] of Object.entries(classes)) {
      const cfg = this.config.providers?.[name];
      if (!cfg?.enabled) continue;
      try {
        const p = new Cls(cfg, this.logger, credentialResolver);
        await p.configure();
        this.providers.set(name, p);
      } catch (err) {
        this.logger.warn('ai-gateway.provider.init.failed', { provider: name, error: err.message });
      }
    }
  }

  async _selectProvider(requestedName, projectId) {
    if (requestedName && requestedName !== 'auto') {
      const p = this.providers.get(requestedName);
      if (!p) throw new Error(`Provider '${requestedName}' no disponible`);
      if (!await p.isAvailable({ projectId })) throw new Error(`Provider '${requestedName}' sin credencial`);
      return { name: requestedName, provider: p };
    }
    // Fallback por priority
    const enabled = Array.from(this.providers.entries())
      .map(([name, p]) => ({ name, provider: p, priority: this.config.providers?.[name]?.priority || 99 }))
      .sort((a, b) => a.priority - b.priority);
    for (const e of enabled) {
      if (await e.provider.isAvailable({ projectId })) return { name: e.name, provider: e.provider };
    }
    throw new Error('No hay providers disponibles. Verifica las API keys en credentials.');
  }

  // ============================================================
  // Credential resolver (event-driven a credential-manager)
  // ============================================================

  async _resolveCredential(provider, projectId) {
    const cached = this.credentialCache.get(provider);
    if (cached && cached.projectId === projectId && Date.now() - cached.resolvedAt < 300000) {
      return cached.apiKey;
    }
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCredentials.delete(request_id);
        reject(new Error(`credential resolve timeout: ${provider}`));
      }, 5000);
      this.pendingCredentials.set(request_id, { resolve, reject, timeout, provider, projectId });
      this.eventBus.publish('credential.resolve.request', { request_id, provider, project_id: projectId });
    });
  }

  onCredentialResponse(event) {
    const { request_id, api_key, error } = event.data || event;
    const pending = this.pendingCredentials.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingCredentials.delete(request_id);
    if (error || !api_key) return pending.reject(new Error(error || 'no api key'));
    this.credentialCache.set(pending.provider, { apiKey: api_key, resolvedAt: Date.now(), projectId: pending.projectId });
    pending.resolve(api_key);
  }

  onCredentialSaved(event) {
    const { provider } = event.data || event;
    if (provider) this.credentialCache.delete(provider);
  }
  onCredentialDeleted(event) {
    const { provider } = event.data || event;
    if (provider) this.credentialCache.delete(provider);
  }

  // ============================================================
  // Tools desde moduleLoader (filtradas por page_id)
  // ============================================================

  _getTools(page_id) {
    if (!this.moduleLoader) return [];
    const all = this.moduleLoader.getToolsForAI?.() || [];
    // Lazy-scan de blueprintModules. ai-gateway puede haberse cargado ANTES
    // que los modulos blueprint-driven en el orden del loader: si el modulo
    // blueprint no aparece en config.modules.enabled, va al final del loadAll
    // (despues de ai-gateway). El _loadBlueprints() de onLoad no los encuentra
    // entonces. La primera llamada a _getTools sucede cuando llega un chat,
    // momento en que ya estan todos los modulos cargados.
    // Solo re-scaneamos si no hay nada en el mapa Y hay candidatos en
    // loadedModules — evita coste de I/O cuando no hay blueprints.
    if (this.blueprintModules.size === 0 && this.moduleLoader.loadedModules) {
      let hasBp = false;
      for (const [, mod] of this.moduleLoader.loadedModules) {
        if (mod?.manifest?.blueprint_driven === true) { hasBp = true; break; }
      }
      if (hasBp) {
        this._loadBlueprints();
        // Re-wire los blueprint async subscribers ahora que blueprintModules
        // tiene contenido. Sin esto, los handlers declarados en
        // eventos_que_escucho NUNCA se registran en el bus — bug observado en
        // produccion 2026-05-25: onLoad llama _wireBlueprintAsyncSubscribers
        // con blueprintModules vacio porque los blueprint modules cargan
        // DESPUES que ai-gateway en el loadAll del loader. carta-manager
        // declaraba listener para carta.creada pero nunca se suscribia, las
        // cartas generadas por menu-generator se perdian silenciosamente.
        this._wireBlueprintAsyncSubscribers();
      }
    }
    // Blueprint-driven pages: catalogo = solo las 2 tools universales (+ 2 de
    // cajones si el blueprint tiene cajones_enabled). No mezclamos con
    // polyfunctional para mantener el modelo declarativo puro (el LLM solo
    // debe usar publish/publishAndWait segun el pseudocodigo).
    if (page_id && this.blueprintModules.has(page_id)) {
      const bp = this.blueprintModules.get(page_id);
      const universal = this._getBlueprintUniversalTools();
      if (!bp.cajonesEnabled) return universal;
      // Cajones-enabled: catalogo + nav tools (page.related, chat.cambiar_foco)
      // + universales. Las nav vienen desde toolsRegistry (declaradas en
      // module.json.tools[] de ai-gateway, single source v1.2) — no duplicamos
      // shape inline. Si no estan registradas (loader aun no las wireó), seguimos
      // sin ellas — el catalogo y las universales bastan.
      const navTools = [];
      const registry = this.moduleLoader?.toolsRegistry;
      for (const navName of ['page.related', 'chat.cambiar_foco']) {
        const entry = registry?.get?.(navName);
        if (entry) navTools.push({ name: entry.name, description: entry.description, parameters: entry.parameters });
      }
      return [...this._getCajonesTools(), ...navTools, ...universal];
    }
    if (!page_id) return all;
    // Construcción lazy del mapa page_id → prefijos válidos. La primera vez que
    // se invoca, se escanean todos los módulos cargados y se cachea.
    if (this.pagePrefixes === null) this._buildPagePrefixes();
    // Tools globales que SIEMPRE se exponen al LLM principal aunque haya page_id activo.
    // Necesarias para que el LLM pueda delegar a agentes (invoke_agent), leer ficheros
    // del proyecto (fs.read), etc., independientemente de en qué módulo esté.
    const GLOBAL_TOOLS = new Set(['invoke_agent', 'fs.read', 'fs.write', 'fs.list', 'fs.search']);
    // Prefijos de tools válidos para este page_id. Permite que módulos como
    // menu-generator (tools 'menu.*') matcheen aunque el name del módulo y el
    // prefijo de la tool no coincidan literalmente — sin renombrar nada.
    const allowedPrefixes = this.pagePrefixes?.get(page_id);
    const filtered = all.filter(t => {
      const name = t.name || '';
      if (GLOBAL_TOOLS.has(name)) return true;
      if (allowedPrefixes && name.includes('.') && allowedPrefixes.has(name.split('.')[0])) return true;
      // Fallback: tool name empieza por page_id (caso recetas — name del módulo coincide con prefijo)
      if (name.startsWith(page_id + '.')) return true;
      return false;
    });
    // Filtrado adicional: la tool invoke_agent enumera todos los agentes en su
    // description. Reducimos esa enumeracion a los agentes cuyo scope incluye
    // el page actual (o '*' = global). Reduce ~1000 tokens de ruido cuando el
    // catalogo de agentes crece, y mejora el routing del LLM al no presentarle
    // opciones irrelevantes para el dominio en el que esta.
    const mapped = filtered.map(t => {
      if (t.name !== 'invoke_agent' || !Array.isArray(t._agents)) return t;
      const relevant = t._agents.filter(a => {
        const scope = Array.isArray(a.scope) ? a.scope : [];
        return scope.includes('*') || scope.includes(page_id);
      });
      if (relevant.length === 0 || relevant.length === t._agents.length) return t;
      const lines = relevant.map(a => `  - ${a.name}: ${a.description || ''}`).join('\n');
      return {
        ...t,
        description: `PREFERENTE: invoca a un agente especialista para CUALQUIER tarea que entre en su dominio. Es la norma del sistema — los agentes saben hacer su trabajo mejor que tu encadenando tools basicos. Solo cae a tools directas si NINGUN agente cubre el caso.\n\nAgentes disponibles para esta pagina (${page_id}):\n${lines}\n\nDevuelve cuando el agente termina con el resultado.`,
        parameters: {
          ...t.parameters,
          properties: {
            ...(t.parameters?.properties || {}),
            agent_name: {
              ...(t.parameters?.properties?.agent_name || {}),
              enum: relevant.map(a => a.name)
            }
          }
        }
      };
    });

    // Reordenar para que invoke_agent aparezca PRIMERO en el catalogo que el
    // LLM ve. Los LLMs ponderan posicion al elegir tool — exponer agentes
    // antes que tools basicas refuerza la norma "prefer agente cuando exista"
    // sin depender solo de descripciones textuales.
    return mapped.sort((a, b) => {
      if (a.name === 'invoke_agent') return -1;
      if (b.name === 'invoke_agent') return 1;
      return 0;
    });
  }

  // ============================================================
  // Blueprint-driven modules (piloto)
  // ============================================================
  //
  // Modelo declarativo: el modulo es un JSON (blueprint) leido por el LLM
  // como contrato + pseudocodigo. NO hay codigo JS del modulo. El LLM publica
  // eventos al bus via 2 tools universales (bus.publish, bus.publishAndWait).
  //
  // Convivencia: la coexistencia con tools polyfunctional es por page_id.
  //   page_id = 'recetas'           → tools legacy de recetas v4.0.0
  //   page_id = 'recetas-blueprint' → blueprint + 2 tools universales
  //
  // Activacion: cada modulo blueprint declara en su module.json:
  //   { "blueprint_driven": true,
  //     "blueprint_path": "<file>.json",
  //     "blueprint_parent_path": "<base>.json"?,
  //     "target_page_id": "<page>" }
  // El loader NO instancia index.js (no existe). ai-gateway escanea
  // loadedModules al arrancar buscando blueprint_driven: true.

  _loadBlueprints() {
    this.blueprintModules.clear();
    this.cajonesCatalog.clear();
    this.pageGraph.clear();
    if (!this.moduleLoader?.loadedModules) {
      this.logger.warn('ai-gateway.blueprints.unavailable', {
        reason: 'moduleLoader.loadedModules no disponible'
      });
      return;
    }
    // Heuristica de path: si empieza con 'arquitectura/' o 'modules/', es
    // relativo al repo root (padre unico compartido). Si no, relativo al
    // directorio del modulo (legacy: padre copiado dentro del modulo).
    const REPO_ROOT = path.resolve(__dirname, '../../..');
    const resolveBlueprintPath = (modPath, bpPath) => {
      if (bpPath && (bpPath.startsWith('arquitectura/') || bpPath.startsWith('modules/'))) {
        return path.resolve(REPO_ROOT, bpPath);
      }
      return path.resolve(modPath, bpPath);
    };
    for (const [name, mod] of this.moduleLoader.loadedModules) {
      const m = mod?.manifest;
      if (!m || m.blueprint_driven !== true) continue;
      const target = m.target_page_id || name;
      try {
        const childPath = resolveBlueprintPath(mod.path, m.blueprint_path);
        const child = JSON.parse(fs.readFileSync(childPath, 'utf8'));
        let parent = null;
        if (m.blueprint_parent_path) {
          const parentPath = resolveBlueprintPath(mod.path, m.blueprint_parent_path);
          parent = JSON.parse(fs.readFileSync(parentPath, 'utf8'));
        }
        // cajones-context-partitioning: si cajones_enabled, el systemPrompt
        // precalculado solo lleva padre + reglas + placeholder; el catalogo
        // rankeado se inyecta por turno en _executeLLM via _buildCajonesSystemPrompt.
        const cajonesEnabled = m.cajones_enabled === true || child.cajones_enabled === true;
        let catalogo = null;
        if (cajonesEnabled) {
          catalogo = this._extractCajones(child);
          this.cajonesCatalog.set(target, catalogo);
        }
        const systemPrompt = cajonesEnabled
          ? this._composeBlueprintSystemPrompt(parent, child, { cajones_only_base: true })
          : this._composeBlueprintSystemPrompt(parent, child);
        this.blueprintModules.set(target, { manifest: m, parent, child, systemPrompt, cajonesEnabled });
        this.logger.info('ai-gateway.blueprint.loaded', {
          module: name,
          target_page_id: target,
          version: child.version,
          parent_id: parent?.id || null,
          cajones_enabled: cajonesEnabled,
          cajones_count: catalogo ? catalogo.length : 0
        });
      } catch (err) {
        this.logger.error('ai-gateway.blueprint.load.failed', {
          module: name,
          error: err.message
        });
      }
    }
    // Construir grafo de paginas relacionadas tras cargar todos los blueprints.
    try {
      this._buildPageGraph();
      this.logger.info('ai-gateway.page-graph.built', {
        nodes: this.pageGraph.size,
        edges: Array.from(this.pageGraph.values()).reduce((s, v) => s + v.consumes.size, 0)
      });
    } catch (err) {
      this.logger.warn('ai-gateway.page-graph.failed', { error: err.message });
    }
  }

  _composeBlueprintSystemPrompt(parent, child, opts = {}) {
    const sections = [];
    sections.push(
      'Eres el RUNTIME de un modulo del subsistema-recetario declarado como blueprint JSON. ' +
      'Tu trabajo es leer el blueprint (padre + hijo) como contrato + pseudocodigo y ejecutarlo ' +
      'publicando eventos al bus mediante las 2 tools universales que tienes (bus.publish, bus.publishAndWait). ' +
      'NO inventes operaciones que no esten en operaciones[]. NO inventes eventos que no esten en el blueprint. ' +
      'Lee TU MISMO los pseudocodigos antes de actuar — siguelos literalmente paso a paso.'
    );
    if (parent) {
      sections.push('# BLUEPRINT PADRE (abstracto, heredado)');
      sections.push('```json\n' + JSON.stringify(parent, null, 2) + '\n```');
    }
    // cajones_only_base: prompt base sin inyectar el child entero ni reglas
    // operativas — el catalogo rankeado + reglas de cajones se inyectan
    // por turno en _buildCajonesSystemPrompt.
    if (opts.cajones_only_base) return sections.join('\n\n');
    sections.push('# BLUEPRINT HIJO (concreto, lo que ejecutas)');
    sections.push('```json\n' + JSON.stringify(child, null, 2) + '\n```');
    sections.push(
      '# REGLAS OPERATIVAS\n' +
      '- Para CADA paso del pseudocodigo que diga `publishAndWait(...)` → llama bus.publishAndWait.\n' +
      '- Para CADA paso que diga `publish(...)` → llama bus.publish.\n' +
      '- Los pasos de normalizar / razonar / comparar los HACES TU mentalmente (no son tools).\n' +
      '- Cuando termines, redacta UN mensaje al usuario describiendo lo que hiciste — no listes pasos internos.\n' +
      '- Si una primitiva del bus devuelve error con `error.code` canonico, propagalo en tu response al caller.'
    );
    return sections.join('\n\n');
  }

  // ============================================================
  // cajones-context-partitioning (v1.0.0)
  // ============================================================
  //
  // Patron Google search-style aplicado al system prompt de blueprints:
  //   - El LLM ve un CATALOGO rankeado (snippet de 1 linea por operacion).
  //   - Para ejecutar una operacion, invoca cajon.abrir({nombre}) -> recibe
  //     pseudocodigo + reglas + errores como contexto del turno actual.
  //   - Al siguiente turno solo persiste el catalogo (cierre automatico).
  //
  // Activacion por blueprint: manifest.cajones_enabled === true.
  // Contrato: arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json

  // Limite de historial por conversacion para ranking de recencia (decision 5.2
  // del contrato: ranking simple). 20 = holgura sobre los 3-5 turnos efectivos.
  static get CAJONES_HISTORY_MAX() { return 20; }
  static get CAJONES_RANK_LOOKBACK_TURNS() { return 5; }

  _extractCajones(child) {
    const ops = (child && typeof child.operaciones === 'object' && child.operaciones) || {};
    const cajones = [];
    for (const [nombre, op] of Object.entries(ops)) {
      if (!op || typeof op !== 'object') continue;
      // Frontera de modulo: una operacion puede ser llamable por bus
      // (RPC <mod>.<op>.request) pero NO exponerse como cajon al LLM de su
      // pagina. Marca "cajon": false en el blueprint para ops que son trabajo
      // de OTRO modulo (ej. recetas.actualizar_precio/analizar = pricing/costing
      // de escandallo): solo escandallo las invoca por el bus, el LLM de recetas
      // no las ve. Evita que una pagina haga lo que no es su trabajo.
      if (op.cajon === false) continue;
      // El prefijo _ marca operaciones internas (handlers de eventos asincronos,
      // ej. _aplicar_coste_calculado): tampoco son cajones del LLM.
      if (nombre.startsWith('_')) continue;
      let descripcion;
      const override = typeof op.cajon_descripcion === 'string' ? op.cajon_descripcion.trim() : '';
      if (override) {
        descripcion = override;
      } else {
        // Auto-derivacion: usar op.descripcion si existe; si no, derivar del
        // input. Maximo 200 chars para que el catalogo no infle el prompt.
        const auto = (typeof op.descripcion === 'string' && op.descripcion.trim())
          || (typeof op.input === 'string' && `input ${op.input}`)
          || '';
        descripcion = String(auto).split('\n')[0].slice(0, 200) || '(sin descripcion)';
      }
      cajones.push({ nombre, descripcion });
    }
    return cajones.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  _rankCajones(catalogo, page_id_activo, conversation_id) {
    if (!Array.isArray(catalogo) || catalogo.length === 0) return [];
    const historial = this.conversationCajones.get(conversation_id) || [];
    const lookback = AiGatewayModule.CAJONES_RANK_LOOKBACK_TURNS;
    const recientes = historial.slice(-lookback).map(h => h.nombre);
    const scorePage = (c) => (page_id_activo && c.nombre.startsWith(page_id_activo + '.')) ? 1 : 0;
    const scoreRecencia = (c) => {
      const idx = recientes.lastIndexOf(c.nombre);
      return idx >= 0 ? (idx + 1) : 0;
    };
    return catalogo.slice().sort((a, b) => {
      const pa = scorePage(a), pb = scorePage(b);
      if (pa !== pb) return pb - pa;
      const ra = scoreRecencia(a), rb = scoreRecencia(b);
      if (ra !== rb) return rb - ra;
      return a.nombre.localeCompare(b.nombre);
    });
  }

  // Devuelve el system prompt completo para un turno cuando el blueprint
  // tiene cajones_enabled. Combina prompt-base precalculado (padre + prologo)
  // con catalogo rankeado del turno + reglas operativas del patron cajones.
  _buildCajonesSystemPrompt(blueprintCtx, conversation_id, page_id_activo) {
    const catalogo = this.cajonesCatalog.get(page_id_activo) || [];
    const rankeado = this._rankCajones(catalogo, page_id_activo, conversation_id);
    const sections = [];
    sections.push(blueprintCtx.systemPrompt); // padre + prologo
    sections.push(`# CATALOGO DE CAJONES — ${page_id_activo}`);
    sections.push(
      'Cada cajon corresponde a una operacion del blueprint. Para ejecutar una operacion, ' +
      'primero abre su cajon con la tool cajon.abrir({nombre}). El cajon devuelve ' +
      'pseudocodigo + reglas + errores y se mantiene en contexto SOLO durante este turno. ' +
      'Si necesitas releer el catalogo o consultar zonas, usa cajon.listar({zona?}). ' +
      'No tienes el pseudocodigo de ninguna operacion hasta que abras su cajon.'
    );
    if (rankeado.length === 0) {
      sections.push('(catalogo vacio — el blueprint no declara operaciones)');
    } else {
      sections.push(rankeado.map(c => `- ${c.nombre} -> ${c.descripcion}`).join('\n'));
    }
    sections.push(
      '# REGLAS OPERATIVAS\n' +
      '- Una sola operacion por turno: cajon.abrir + ejecutar pseudocodigo (publish/publishAndWait) + responder. NO encadenar varias.\n' +
      '- El CATALOGO YA ESTA VISIBLE ARRIBA. NO invoques cajon.listar para listarlo de nuevo — usalo SOLO si necesitas refrescarlo con filtro de zona (cajon.listar({zona:"X"})). Si el usuario pregunta "que puedes hacer aqui", respondele desde el catalogo que ya ves, sin tool calls.\n' +
      '- Para CADA paso del pseudocodigo que diga `publishAndWait(...)` → llama bus.publishAndWait.\n' +
      '- Para CADA paso que diga `publish(...)` → llama bus.publish.\n' +
      '- Los pasos de normalizar / razonar / comparar los HACES TU mentalmente (no son tools).\n' +
      '- Si el cajon que abriste trae `internas` (helpers privados de esa operacion), su pseudocodigo VIENE INCLUIDO en la respuesta de cajon.abrir. Ejecutalos INLINE como parte del flujo — NO intentes abrirlos como cajon aparte (no estan en el catalogo). Cuando el cuerpo diga `_helper(...)`, sigue el pseudocodigo de esa interna tal cual.\n' +
      '- Cuando termines, redacta UN mensaje al usuario describiendo lo que hiciste — no listes pasos internos.\n' +
      '- Si una primitiva del bus devuelve error con `error.code` canonico, propagalo en tu response al caller.\n' +
      '- Si dudas que cajon abrir, pregunta al usuario en lenguaje natural (no abras varios por probar).'
    );
    return sections.join('\n\n');
  }

  // Tools del subsistema cajones expuestas al LLM cuando el blueprint activo
  // tiene cajones_enabled. Se SUMAN a las 2 universales (bus.publish, bus.publishAndWait).
  _getCajonesTools() {
    return [
      {
        name: 'cajon.listar',
        description: 'Devuelve el catalogo de cajones disponibles para el modulo activo, rankeado por relevancia (cajones del page activo primero, luego abiertos recientemente, luego alfabetico). Lectura pura — no publica eventos de dominio.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            zona: {
              type: 'string',
              description: 'Opcional. Filtra el catalogo por prefijo de nombre (ej. "recetas" devuelve solo cajones recetas.*).'
            }
          }
        }
      },
      {
        name: 'cajon.abrir',
        description: 'Abre un cajon (operacion del blueprint). Devuelve { pseudocodigo, reglas_clave, errores_posibles, input, internas } para inyectar en este turno. Si la operacion usa helpers privados, llegan en `internas` (cada uno con su pseudocodigo): ejecutalos INLINE, no los abras aparte. El cajon SOLO permanece en tu contexto durante este turno — al siguiente tienes que abrirlo de nuevo si lo necesitas. Solo abre UN cajon por turno (regla una_operacion_por_turno del contrato).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            nombre: {
              type: 'string',
              description: 'Nombre canonico del cajon tal como aparece en el catalogo (ej. "recetas.crear", "escandallo.calcular").'
            }
          },
          required: ['nombre']
        }
      }
    ];
  }

  // Resuelve un cajon por su nombre en el page_id activo. Soporta nombre con o
  // sin prefijo de page (acepta "crear" y "recetas.crear" si page_id="recetas").
  _resolveCajon(page_id_activo, nombre) {
    const blueprintCtx = this.blueprintModules.get(page_id_activo);
    if (!blueprintCtx || !blueprintCtx.cajonesEnabled) return null;
    const ops = blueprintCtx.child?.operaciones || {};
    if (ops[nombre]) return { nombre, op: ops[nombre] };
    const prefix = page_id_activo + '.';
    if (nombre.startsWith(prefix)) {
      const bare = nombre.slice(prefix.length);
      if (ops[bare]) return { nombre: `${page_id_activo}.${bare}`, op: ops[bare] };
    } else if (ops[nombre.replace(/^[^.]+\./, '')]) {
      // nombre traido con prefijo de OTRO modulo — no resolver.
      return null;
    }
    return null;
  }

  // Bundle de helpers privados de una operacion publica (modelo "blueprint =
  // clase"): cuando el LLM abre un cajon publico, recibe ademas el pseudocodigo
  // de las internas que ese cajon invoca, para ejecutarlas inline. Las internas
  // NO estan en el catalogo (son cajon:false / prefijo _) y no son abribles
  // sueltas — solo viajan adosadas a su operacion publica.
  // Declaracion explicita via op.usa_internas: [nombre, ...] (sin deteccion por
  // regex: el blueprint dice que privados entran). Resuelve transitivamente
  // (una interna puede usar otra) con guarda de ciclos.
  _bundleInternas(page_id_activo, op) {
    const declaradas = Array.isArray(op && op.usa_internas) ? op.usa_internas : [];
    if (declaradas.length === 0) return null;
    const blueprintCtx = this.blueprintModules.get(page_id_activo);
    const ops = blueprintCtx?.child?.operaciones || {};
    const out = [];
    const vistos = new Set();
    const visitar = (nombre) => {
      if (vistos.has(nombre)) return;
      vistos.add(nombre);
      const inner = ops[nombre];
      if (!inner || typeof inner !== 'object') return;
      out.push({
        nombre,
        input: inner.input || null,
        pseudocodigo: inner.pseudocodigo || null,
        reglas_clave: inner.reglas_clave || null
      });
      if (Array.isArray(inner.usa_internas)) inner.usa_internas.forEach(visitar);
    };
    declaradas.forEach(visitar);
    return out.length > 0 ? out : null;
  }

  // Registra un cajon abierto en el historial de la conversacion (para ranking
  // por recencia en turnos futuros). FIFO con limite CAJONES_HISTORY_MAX.
  _trackCajonOpened(conversation_id, nombre) {
    if (!conversation_id) return;
    const arr = this.conversationCajones.get(conversation_id) || [];
    arr.push({ nombre, turn: Date.now() });
    const max = AiGatewayModule.CAJONES_HISTORY_MAX;
    const trimmed = arr.length > max ? arr.slice(-max) : arr;
    this.conversationCajones.set(conversation_id, trimmed);
  }

  // Handler de cajon.listar / cajon.abrir invocados como tool calls por el LLM.
  // Se ejecuta dentro de _executeToolCall (interceptado antes del path bus).
  _executeCajonTool(toolName, rawArgs, ctx) {
    const args = (rawArgs && typeof rawArgs === 'object') ? rawArgs : {};
    const page_id = ctx.page_id;
    if (!page_id || !this.blueprintModules.has(page_id)) {
      const err = new Error(`cajones no disponibles: page_id activo (${page_id || 'null'}) no es un blueprint`);
      err.code = 'INVALID_INPUT';
      throw err;
    }
    if (!this.blueprintModules.get(page_id).cajonesEnabled) {
      const err = new Error(`cajones no habilitados para page_id ${page_id} (manifest.cajones_enabled !== true)`);
      err.code = 'INVALID_INPUT';
      throw err;
    }
    if (toolName === 'cajon.listar') {
      const catalogo = this.cajonesCatalog.get(page_id) || [];
      const rankeado = this._rankCajones(catalogo, page_id, ctx.conversation_id);
      const zona = typeof args.zona === 'string' && args.zona.trim() ? args.zona.trim() : null;
      const filtrado = zona ? rankeado.filter(c => c.nombre.startsWith(zona + '.') || c.nombre === zona) : rankeado;
      return { page_id, count: filtrado.length, cajones: filtrado };
    }
    if (toolName === 'cajon.abrir') {
      const nombre = typeof args.nombre === 'string' ? args.nombre.trim() : '';
      if (!nombre) {
        const err = new Error("cajon.abrir requiere 'nombre' (string no vacio)");
        err.code = 'INVALID_INPUT';
        throw err;
      }
      const resolved = this._resolveCajon(page_id, nombre);
      if (!resolved) {
        const err = new Error(`cajon '${nombre}' no encontrado en el blueprint ${page_id}`);
        err.code = 'RESOURCE_NOT_FOUND';
        err.details = { kind: 'domain', page_id, requested: nombre };
        throw err;
      }
      this._trackCajonOpened(ctx.conversation_id, resolved.nombre);
      const op = resolved.op;
      return {
        nombre: resolved.nombre,
        input: op.input || null,
        pseudocodigo: op.pseudocodigo || null,
        reglas_clave: op.reglas_clave || null,
        errores_posibles: op.errores_posibles || null,
        // Helpers privados de la operacion (metodos privados de la clase).
        // Al abrir el cajon publico se entregan sus internas para que el LLM
        // las ejecute inline — no estan en el catalogo y no son abribles aparte.
        // Declaradas por el blueprint en op.usa_internas: [nombre, ...].
        internas: this._bundleInternas(page_id, op)
      };
    }
    // No deberia alcanzarse — _executeToolCall solo enruta cajon.listar/cajon.abrir.
    const err = new Error(`cajon tool desconocida: ${toolName}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }

  // ============================================================
  // cajones Fase 5 bis — grafo de paginas relacionadas + foco dinamico
  // ============================================================

  // Parsea pseudocodigo de todos los blueprints cargados, extrae referencias a
  // publishAndWait('<mod>.<accion>.request', ...) — eso dice que el modulo
  // CONSUME el mod referenciado. Override opcional via module.json.paginas_relacionadas.
  // El grafo se sirve a la tool page.related y al frontend para la barra lateral.
  _buildPageGraph() {
    this.pageGraph.clear();
    const ensure = (page) => {
      if (!this.pageGraph.has(page)) this.pageGraph.set(page, { consumes: new Set(), consumed_by: new Set() });
      return this.pageGraph.get(page);
    };
    // Asegurar nodo para cada blueprint, incluso si no tiene aristas detectadas.
    for (const page_id of this.blueprintModules.keys()) ensure(page_id);

    // --- 1. Aristas desde el catalogo curado eventos-publish-subscribe.json ---
    // El catalogo lo regenera blueprint-eventos-conscientes.validate.js cada
    // vez que corre validate:ci. Captura publishers (bus.publish Y
    // bus.publishAndWait) y subscribers (eventos_que_escucho declarados),
    // resolviendo los 3 bugs del regex antiguo:
    //   (1) bus.publish fire-and-forget no se capturaba.
    //   (2) el primer segmento del evento (e.g. 'carta.creada' -> 'carta') no
    //       coincide con el page_id real (carta-manager) -> resuelve usando el
    //       source path del publisher/subscriber, no el name del evento.
    //   (3) las aristas inversas (carta-digital escucha carta.actualizada que
    //       carta-manager publica) no se creaban -> ahora si.
    const catalogo = this._loadEventCatalog();
    const pathToPageId = this._buildPathToPageIdMap();
    let catalogUsed = false;

    if (catalogo && catalogo.eventos) {
      catalogUsed = true;
      for (const [event_name, entry] of Object.entries(catalogo.eventos)) {
        // Skip eventos primitivos transversales (fs.*, llm.*, etc.).
        const firstSegment = String(event_name).split('.')[0];
        if (this._isPrimitivePrefix(firstSegment)) continue;
        const publishers = Array.isArray(entry.publishers) ? entry.publishers : [];
        const subscribers = Array.isArray(entry.subscribers) ? entry.subscribers : [];
        if (publishers.length === 0 || subscribers.length === 0) continue;
        for (const pub of publishers) {
          const pubPage = pathToPageId.get(pub.source);
          if (!pubPage) continue;
          for (const sub of subscribers) {
            const subPage = pathToPageId.get(sub.source);
            if (!subPage || subPage === pubPage) continue;
            ensure(pubPage).consumes.add(subPage);
            ensure(subPage).consumed_by.add(pubPage);
          }
        }
      }
    }

    // --- 2. Fallback: parseo regex del pseudocodigo (compat si catalogo no
    //       existe, o complemento para blueprints no indexados en el catalogo) ---
    const PA_RE = /(?:publishAndWait|publish)\s*\(\s*['"]([a-z][a-z0-9-]*)\.[\w.]+['"]/gi;
    for (const [page_id, ctx] of this.blueprintModules.entries()) {
      const ops = ctx.child?.operaciones || {};
      for (const op of Object.values(ops)) {
        const pseudo = op?.pseudocodigo;
        if (!Array.isArray(pseudo)) continue;
        for (const step of pseudo) {
          if (typeof step !== 'string') continue;
          PA_RE.lastIndex = 0;
          let m;
          while ((m = PA_RE.exec(step)) !== null) {
            const target = m[1];
            if (this._isPrimitivePrefix(target)) continue;
            if (target === page_id) continue;
            // Solo crear arista si el target es un page_id real (blueprint
            // cargado). Esto evita falsos positivos cuando el primer segmento
            // del evento es una entidad y no un modulo (caso 'carta' vs
            // 'carta-manager'). Si el catalogo ya lo capturo, esta arista es
            // redundante (add a Set es idempotente).
            if (!this.blueprintModules.has(target)) continue;
            ensure(page_id).consumes.add(target);
            ensure(target).consumed_by.add(page_id);
          }
        }
      }

      // --- 3. Override declarativo: module.json.paginas_relacionadas[] ---
      const declaradas = Array.isArray(ctx.manifest?.paginas_relacionadas) ? ctx.manifest.paginas_relacionadas : [];
      for (const target of declaradas) {
        if (typeof target !== 'string' || target === page_id) continue;
        ensure(page_id).consumes.add(target);
        ensure(target).consumed_by.add(page_id);
      }
    }

    // --- 4. Pages JS legacy navegables (target_page_id sin blueprint) ---
    const loaded = this.moduleLoader?.loadedModules;
    if (loaded && typeof loaded[Symbol.iterator] === 'function') {
      for (const [, mod] of loaded) {
        const m = mod?.manifest;
        const tpid = m?.target_page_id;
        if (typeof tpid !== 'string') continue;
        if (this.blueprintModules.has(tpid)) continue;
        ensure(tpid);
      }
    }

    this.logger?.debug?.('ai-gateway.page-graph.source', {
      catalog_used: catalogUsed,
      nodes: this.pageGraph.size
    });
  }

  // Cargar catalogo curado de eventos generado por
  // blueprint-eventos-conscientes.validate.js. Devuelve null si no existe (el
  // grafo cae al fallback regex).
  _loadEventCatalog() {
    try {
      const path = require('path');
      const fs = require('fs');
      const candidate = path.resolve(__dirname, '../../../arquitectura/decisiones/_outputs/eventos-publish-subscribe.json');
      if (!fs.existsSync(candidate)) return null;
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch (err) {
      if (this.logger) {
        this.logger.warn('ai-gateway.page-graph.catalog_load_failed', {
          error_message: err && err.message ? err.message : String(err)
        });
      }
      return null;
    }
  }

  // Construir mapa inverso source_path -> page_id para resolver entries del
  // catalogo. El source del catalogo es un path relativo al repo root (e.g.
  // 'modules/pizzepos/menu-generator/menu-generator.blueprint.json'). El
  // page_id es el campo target_page_id del module.json del modulo.
  _buildPathToPageIdMap() {
    const map = new Map();
    // 1. Blueprints cargados: para cada page_id en blueprintModules, inferir
    //    su path canonico desde el manifest (target_page_id + nombre).
    for (const [page_id, ctx] of this.blueprintModules.entries()) {
      const moduleName = ctx.manifest?.name || page_id;
      // Path canonico estimado: el blueprint hijo vive junto al module.json
      // del modulo, con nombre <module>.blueprint.json. Caminos relativos al
      // repo root tipo 'modules/pizzepos/menu-generator/menu-generator.blueprint.json'.
      // Como no tenemos el path absoluto del modulo aqui directamente, hacemos
      // un mejor esfuerzo recorriendo loadedModules.
      const loaded = this.moduleLoader?.loadedModules;
      if (loaded && typeof loaded.get === 'function') {
        const mod = loaded.get(moduleName);
        if (mod?.path) {
          const path = require('path');
          const REPO_ROOT = path.resolve(__dirname, '../../..');
          const blueprintPath = path.relative(REPO_ROOT, path.join(mod.path, `${moduleName}.blueprint.json`));
          map.set(blueprintPath, page_id);
          // Tambien indexar el module.json (algunos modulos pueden aparecer
          // ahi en el catalogo si declaran subscribes via events.subscribes).
          const moduleJsonPath = path.relative(REPO_ROOT, path.join(mod.path, 'module.json'));
          map.set(moduleJsonPath, page_id);
        }
      }
    }
    // 2. Modulos JS legacy navegables: si tienen target_page_id, indexar su
    //    module.json al page_id correspondiente para que aristas que apunten
    //    a ellos se construyan correctamente.
    const loaded = this.moduleLoader?.loadedModules;
    if (loaded && typeof loaded[Symbol.iterator] === 'function') {
      const path = require('path');
      const REPO_ROOT = path.resolve(__dirname, '../../..');
      for (const [moduleName, mod] of loaded) {
        const tpid = mod?.manifest?.target_page_id;
        if (typeof tpid !== 'string') continue;
        if (this.blueprintModules.has(tpid)) continue; // ya indexado arriba
        if (!mod?.path) continue;
        const moduleJsonPath = path.relative(REPO_ROOT, path.join(mod.path, 'module.json'));
        map.set(moduleJsonPath, tpid);
      }
    }
    return map;
  }

  // Prefijos del bus que NO cuentan como "paginas" para el grafo (son primitivas
  // o utilidades transversales que muchos modulos consumen, no destinos de
  // navegacion del usuario).
  // ============================================================
  // Blueprint subscribers asincronos (frente 2.4)
  //
  // El LLM es el unico interprete del pseudocodigo. Hoy se invoca por chat
  // del usuario. Este mecanismo amplia: cuando llega un evento del bus que
  // algun blueprint declara escuchar en eventos_que_escucho, ai-gateway
  // arranca una conversacion sintetica y le pide al LLM que ejecute el
  // handler con el payload del evento. Cero parser nuevo, cero codigo de
  // dominio en JS — la logica vive 100% en el pseudocodigo del blueprint.
  //
  // Diseño completo en propuestas/blueprint-subscribers-asincronos.md
  // ============================================================

  _wireBlueprintAsyncSubscribers() {
    this.asyncSubscriptions.clear();
    if (!this.eventBus?.subscribe) {
      this.logger?.warn('ai-gateway.async-subs.unavailable', { reason: 'eventBus sin subscribe' });
      return;
    }
    for (const [page_id, ctx] of this.blueprintModules.entries()) {
      const escucha = ctx.child?.eventos_que_escucho;
      if (!Array.isArray(escucha) || escucha.length === 0) continue;
      for (const entry of escucha) {
        // Acepta dos formas: {evento, handler} o string simple.
        // String simple: el handler se infiere como `_on_<event_name>` con dots
        // sustituidos por underscores. Recomendado el objeto explicito.
        const evento = typeof entry === 'string' ? entry : entry?.evento;
        const handler_name = typeof entry === 'string'
          ? '_on_' + entry.replace(/\./g, '_')
          : entry?.handler;
        // RPC request/response: si la entrada lleva responde:true, el evento es
        // un <mod>.<op>.request y el turno sintetico, ademas de ejecutar el
        // handler, publica <mod>.<op>.response correlado por request_id — asi
        // un publishAndWait de otro blueprint recibe su respuesta. Sin esto el
        // mecanismo es fire-and-forget (notificacion de un solo sentido).
        const responde = (typeof entry === 'object' && entry?.responde === true);
        const response_event = responde
          ? (typeof entry?.response_event === 'string' && entry.response_event)
            || (evento.endsWith('.request') ? evento.slice(0, -('.request'.length)) + '.response' : `${evento}.response`)
          : null;
        if (typeof evento !== 'string' || !evento || typeof handler_name !== 'string' || !handler_name) {
          this.logger?.warn('ai-gateway.async-subs.entry-invalida', { page_id, entry });
          continue;
        }
        // Validar que la operacion handler existe en el blueprint
        const ops = ctx.child?.operaciones || {};
        if (!ops[handler_name]) {
          this.logger?.warn('ai-gateway.async-subs.handler-ausente', {
            page_id, evento, handler_name,
            operaciones_disponibles: Object.keys(ops)
          });
          continue;
        }
        // Suscribir al bus
        try {
          const unsub = this.eventBus.subscribe(evento, (eventEnvelope) => {
            // Loop-guard: si el propio modulo subscriber es el publisher, skip
            // (evita recursion infinita si un handler publica el evento que escucha).
            const sourceModule = eventEnvelope?.source?.module_id || eventEnvelope?.source?.core_id || null;
            if (sourceModule && sourceModule === page_id) {
              this.logger?.debug('ai-gateway.async-subs.loop-skip', { page_id, evento });
              return;
            }
            this._handleBlueprintAsyncEvent({
              page_id, handler_name, evento, responde, response_event,
              event_payload: (eventEnvelope && typeof eventEnvelope === 'object' && 'data' in eventEnvelope)
                ? eventEnvelope.data : eventEnvelope
            });
          });
          // Registrar para liberar en onUnload
          const list = this.asyncSubscriptions.get(evento) || [];
          list.push({ page_id, handler_name, unsub });
          this.asyncSubscriptions.set(evento, list);
          this.logger?.info('ai-gateway.async-subs.wired', { page_id, evento, handler_name });
        } catch (err) {
          this.logger?.error('ai-gateway.async-subs.wire-failed', {
            page_id, evento, error: err.message
          });
        }
      }
    }
  }

  async _handleBlueprintAsyncEvent({ page_id, handler_name, evento, event_payload, responde = false, response_event = null }) {
    // Construir conversacion sintetica que inyecta el blueprint del subscriber
    // como system prompt y le pide al LLM ejecutar el handler con el payload.
    // El LLM ejecuta el pseudocodigo del handler igual que cualquier operacion
    // — usando bus.publish/bus.publishAndWait/cajon.* segun el modelo del blueprint.
    const conv_id = crypto.randomUUID();
    const correlation_id = event_payload?.correlation_id || crypto.randomUUID();
    const project_id = event_payload?.project_id || null;
    const user_id = 'async-subscriber';

    // Prompt sintetico — el LLM lo procesa como mensaje del usuario.
    // El system prompt (que se inyecta automaticamente por _executeLLM al ver
    // page_id) contiene el blueprint del subscriber. El LLM lee el handler X
    // y lo ejecuta.
    const req_id = event_payload?.request_id || null;
    const synthetic_message = responde
      ? (
        `[sistema interno — invocacion RPC por bus]\n` +
        `Has recibido la peticion \`${evento}\`. ` +
        `Ejecuta el handler \`${handler_name}\` de tu blueprint siguiendo SU pseudocodigo paso a paso, ` +
        `con el payload como INPUT. El handler DEVUELVE un objeto \`{ status, data }\`.\n\n` +
        `payload:\n\`\`\`json\n${JSON.stringify(event_payload || {}, null, 2)}\n\`\`\`\n\n` +
        `CUANDO TERMINES, publica ese resultado como respuesta para quien espera: ` +
        `llama bus.publish('${response_event}', { request_id: ${JSON.stringify(req_id)}, status: <ret.status>, data: <ret.data> }) ` +
        `donde <ret> es lo que devolvio el handler. Ese publish es OBLIGATORIO — sin el, el que hizo publishAndWait se queda colgado hasta timeout. ` +
        `NO respondas al usuario en lenguaje natural: esta es una invocacion automatica del bus.`
      )
      : (
        `[sistema interno — invocacion async]\n` +
        `Has recibido el evento canonico \`${evento}\`. ` +
        `Ejecuta el handler \`${handler_name}\` de tu blueprint siguiendo SU pseudocodigo paso a paso. ` +
        `El payload del evento es el INPUT del handler.\n\n` +
        `payload:\n\`\`\`json\n${JSON.stringify(event_payload || {}, null, 2)}\n\`\`\`\n\n` +
        `IMPORTANTE: NO respondas al usuario en lenguaje natural — esta es una invocacion automatica del bus. ` +
        `Solo ejecuta el pseudocodigo del handler y termina (los publish/publishAndWait que haga el handler son tu output efectivo).`
      );

    try {
      await this._executeLLM({
        system: null,
        messages: [{ role: 'user', content: synthetic_message }],
        tools: this._getTools(page_id),
        settings: {},
        attachments: null,
        project_id,
        user_id,
        conversation_id: conv_id,
        correlation_id,
        page_id,
        context: { async_invocation: true, evento, handler_name },
        prompt: null,
        intencion: 'async-handler',
        providerName: null
      });
      this.logger?.info('ai-gateway.async-handler.completed', {
        page_id, handler_name, evento, correlation_id
      });
    } catch (err) {
      // Fire-and-forget desde la perspectiva del publisher: si el handler falla,
      // se registra pero no se propaga al publisher (no hay request_id que
      // correlacionar). Es parte del paradigma event-core puro.
      this.logger?.error('ai-gateway.async-handler.failed', {
        page_id, handler_name, evento, correlation_id, error: err.message
      });
    }
  }

  // Nervio propioceptivo — lado lectura.
  // Pide a propiocepcion (reflejo JS, responde en ms) la rebanada de lo que
  // paso en el mundo del proyecto desde desde_ts. RPC de bus con timeout corto:
  // la consciencia no debe penalizar la latencia del turno, asi que si tarda
  // devolvemos vacio y el turno sigue.
  async _leerPropiocepcion(project_id, desde_ts) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return [];
    const request_id = crypto.randomUUID();
    const timeoutMs = this.config.propiocepcion_timeout_ms || 3000;
    return new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => { if (unsub) unsub(); resolve([]); }, timeoutMs);
      try {
        unsub = this.eventBus.subscribe('propiocepcion.leer.response', (event) => {
          const data = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
          if (!data || data.request_id !== request_id) return;
          clearTimeout(timeout);
          if (unsub) unsub();
          const payload = data.result || data;
          const eventos = payload?.data?.eventos || payload?.eventos || [];
          resolve(Array.isArray(eventos) ? eventos : []);
        });
        this.eventBus.publish('propiocepcion.leer', {
          request_id, project_id, limite: 10, ...(desde_ts ? { desde_ts } : {})
        });
      } catch (_) {
        clearTimeout(timeout);
        if (unsub) unsub();
        resolve([]);
      }
    });
  }

  _composePropiocepcionSection(eventos) {
    const lineas = eventos.map(e => {
      const tipo = e.tipo === 'reflejo' ? 'reflejo' : 'consciente';
      return `- [${tipo}] ${e.modulo}: ${e.resumen}`;
    }).join('\n');
    return (
      '# LO QUE PASO EN TU MUNDO — propiocepcion (contexto SILENCIOSO)\n' +
      'Desde tu ultimo turno ocurrio esto en el proyecto (reflejos y ops ya ' +
      'ejecutadas que no controlaste, pero de los que eres consciente):\n' +
      lineas + '\n' +
      'USALO EN SILENCIO. Es solo para que NO supongas: si algo ya se hizo o se ' +
      'guardo, esta aqui. NO lo recites, NO lo enumeres ni lo repitas al usuario ' +
      'salvo que pregunte explicitamente que ha pasado. Responde corto y al grano ' +
      'a lo que el usuario pide; esta lista es memoria de fondo, no parte de tu respuesta.'
    );
  }

  _isPrimitivePrefix(prefix) {
    const PRIMITIVE = new Set([
      'fs', 'project', 'llm', 'ai', 'agent', 'credential', 'security',
      'bus', 'cajon', 'chat', 'page', 'observability', 'metrics', 'log',
      'plugin', 'device', 'channel', 'firmware', 'gateway', 'composition',
      'database', 'scheduler', 'http', 'embedding'
    ]);
    return PRIMITIVE.has(prefix);
  }

  // Handlers PUBLICOS (declarados en module.json.tools[]) — el loader los
  // auto-registra en moduleLoader.toolsRegistry, uiHandler (mqttRequest), y
  // bus (auto-suscripcion al evento <toolName>.request). Single source of
  // truth: el shape canonico de la tool vive en module.json, no inline.
  //
  // Reciben `data` plano del caller (LLM tool call, frontend mqttRequest,
  // o evento del bus). _executeNavTool centraliza la logica + validacion.

  async handlePageRelated(data) {
    const args = (data && typeof data === 'object') ? data : {};
    const ctx = {
      conversation_id: args.conversation_id || null,
      project_id: args.project_id || null,
      user_id: args.user_id || 'system',
      page_id: args.page_id || null,
      correlation_id: args.correlation_id || null
    };
    return this._executeNavTool('page.related', args, ctx);
  }

  async handleChatCambiarFoco(data) {
    const args = (data && typeof data === 'object') ? data : {};
    const ctx = {
      conversation_id: args.conversation_id || null,
      project_id: args.project_id || null,
      user_id: args.user_id || 'system',
      page_id: args.page_id || null,
      correlation_id: args.correlation_id || null
    };
    return this._executeNavTool('chat.cambiar_foco', args, ctx);
  }

  // Page navegable = blueprint registrado en blueprintModules O modulo JS
  // legacy con target_page_id declarado en su module.json. Mecanismo unico
  // de "page" para chat.cambiar_foco y page.related, sin flag adicional —
  // reusa el campo target_page_id que ya existia en blueprints.
  // Caso testigo 2026-05-24: menu-generator (JS legacy con target_page_id).
  _isNavegablePage(page_id) {
    if (!page_id) return false;
    if (this.blueprintModules.has(page_id)) return true;
    const loaded = this.moduleLoader?.loadedModules;
    if (!loaded || typeof loaded[Symbol.iterator] !== 'function') return false;
    for (const [, mod] of loaded) {
      if (mod?.manifest?.target_page_id === page_id) return true;
    }
    return false;
  }

  _listNavegablePages() {
    const out = new Set(this.blueprintModules.keys());
    const loaded = this.moduleLoader?.loadedModules;
    if (loaded && typeof loaded[Symbol.iterator] === 'function') {
      for (const [, mod] of loaded) {
        const tpid = mod?.manifest?.target_page_id;
        if (typeof tpid === 'string') out.add(tpid);
      }
    }
    return Array.from(out).sort();
  }

  _executeNavTool(toolName, rawArgs, ctx) {
    const args = (rawArgs && typeof rawArgs === 'object') ? rawArgs : {};
    if (toolName === 'page.related') {
      const target = (typeof args.page_id === 'string' && args.page_id.trim()) || ctx.page_id || null;
      if (!target) {
        const err = new Error("page.related requiere 'page_id' (o un page_id activo en la conversacion)");
        err.code = 'INVALID_INPUT';
        throw err;
      }
      const node = this.pageGraph.get(target);
      if (!node) {
        // No es un error duro — el page existe en el sistema pero sin aristas
        // detectadas. Devolver lista vacia coherente con el shape esperado.
        return { page_id: target, consumes: [], consumed_by: [], related: [] };
      }
      // Filtrar a solo paginas NAVEGABLES (blueprints registrados). El grafo
      // tambien recoge nodos que aparecen en pseudocodigos pero no son
      // blueprints (ej. eventos como 'mercadona.*' o 'carta.*' apuntan a un
      // prefijo que no es un page_id navegable). Devolverlos al LLM lo lleva
      // a intentar chat.cambiar_foco invalido. Mejor solo lo invocable.
      // "Navegable" = blueprint con cajones_enabled O modulo JS legacy con
      // target_page_id declarado en su module.json (page registrada en frontend).
      const isNav = (p) => this._isNavegablePage(p);
      const consumes = Array.from(node.consumes).filter(isNav).sort();
      const consumed_by = Array.from(node.consumed_by).filter(isNav).sort();
      const related = Array.from(new Set([...consumes, ...consumed_by])).sort();
      return { page_id: target, consumes, consumed_by, related };
    }
    if (toolName === 'chat.cambiar_foco') {
      const nuevo = typeof args.nuevo_page_id === 'string' ? args.nuevo_page_id.trim() : '';
      if (!nuevo) {
        const err = new Error("chat.cambiar_foco requiere 'nuevo_page_id' (string no vacio)");
        err.code = 'INVALID_INPUT';
        throw err;
      }
      // Validar que el destino es page navegable (blueprint registrado O
      // modulo JS legacy con target_page_id en su manifest). Si no, devolver
      // RESOURCE_NOT_FOUND para que el LLM se rectifique o pida confirmacion al
      // usuario en lugar de mandarlo a un page fantasma.
      if (!this._isNavegablePage(nuevo)) {
        const err = new Error(`page '${nuevo}' no esta registrado como destino navegable en este sistema`);
        err.code = 'RESOURCE_NOT_FOUND';
        err.details = { kind: 'domain', page_id: nuevo, available: this._listNavegablePages() };
        throw err;
      }
      const anterior = this.conversationPageFoco.get(ctx.conversation_id) || ctx.page_id || null;
      if (anterior === nuevo) {
        // No-op observable: ya estamos en ese page. Devolver ok pero no
        // publicar evento (el frontend no necesita rehacer goto).
        return { status: 'noop', nuevo_page_id: nuevo, anterior, reason: 'foco ya estaba en ese page_id' };
      }
      this.conversationPageFoco.set(ctx.conversation_id, nuevo);
      // Publish chat.foco.cambiado para que frontend reaccione (goto + UI banner).
      // Sigue el shape canonico de events.contract: event_id+event_type+timestamp+
      // source+data+metadata. data: campos del cambio + correlacion del chat.
      const eventPayload = {
        conversation_id: ctx.conversation_id || null,
        project_id: ctx.project_id || null,
        user_id: ctx.user_id || 'system',
        anterior,
        nuevo,
        motivo: typeof args.motivo === 'string' && args.motivo.trim() ? args.motivo.trim() : null,
        correlation_id: ctx.correlation_id || ctx.conversation_id || null,
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      };
      try {
        this.eventBus.publish('chat.foco.cambiado', eventPayload);
      } catch (err) {
        // No revertir el cambio interno — el LLM ya tomo la decision y el frontend
        // se sincronizara al siguiente turno. Logueamos y seguimos.
        this.logger?.warn('ai-gateway.foco.publish.failed', { error: err.message });
      }
      return {
        status: 'ok',
        nuevo_page_id: nuevo,
        anterior,
        motivo: eventPayload.motivo,
        // El catalogo de cajones del turno se construyo al ARRANCAR el turno con
        // la pagina anterior. Cambiar el foco NO recarga el catalogo en caliente:
        // los cajones de 'nuevo' recien estaran activos en el PROXIMO turno. Si el
        // LLM intenta abrirlos ahora, _resolveCajon los busca en la pagina vieja y
        // da 'no encontrado'. Por eso el cambio de foco CIERRA el turno (como cerrar
        // y volver a cargar): se acaba aqui, y el siguiente turno ya trae el catalogo
        // nuevo. Se lo decimos explicito para que no barrene hacia el error.
        cajones_activos_en: 'proximo_turno',
        instruccion: `Foco cambiado a '${nuevo}'. Sus cajones NO estan activos en ESTE turno — se cargan en el PROXIMO. NO intentes abrir cajones de '${nuevo}' ahora: no existen en este turno y daran 'no encontrado'. CIERRA el turno ya: dile al usuario en una frase que ya estas en '${nuevo}' y, si te pidio una accion ahi, que la repita o confirme para ejecutarla. En tu siguiente turno tendras el catalogo de '${nuevo}' disponible y podras abrir su cajon.`
      };
    }
    const err = new Error(`nav tool desconocida: ${toolName}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }

  // Catalogo fijo de las 2 tools universales. Solo aparecen en el catalogo
  // expuesto al LLM cuando el page_id activo es un modulo blueprint-driven.
  // No estan disponibles cuando se opera con tools polyfunctional clasicas.
  _getBlueprintUniversalTools() {
    return [
      {
        name: 'bus.publish',
        description: 'Publica un evento al bus sin esperar respuesta. Util para eventos de dominio (ej. receta.creada) y para el evento de respuesta canonica al caller (<modulo>.<operacion>.response). El payload debe incluir los campos canonicos del subsistema (project_id, user_id, correlation_id, timestamp, request_id cuando aplique).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            event: {
              type: 'string',
              description: 'Nombre canonico del evento (ej. receta.creada, recetas.crear.response, fs.write.request).'
            },
            payload: {
              type: 'object',
              description: 'Payload del evento. Incluye campos canonicos + datos del dominio.'
            }
          },
          required: ['event', 'payload']
        }
      },
      {
        name: 'bus.publishAndWait',
        description: 'Publica un evento al bus (un request) y espera la response correlacionada por request_id. Usar para invocar primitivas del bus (fs.read.request, fs.write.request, project.get.request, llm.complete.request, etc.). Devuelve el payload del evento de respuesta. Si no llega en timeout_ms (default 10000), devuelve error UPSTREAM_TIMEOUT.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            event: {
              type: 'string',
              description: 'Nombre canonico del evento request (ej. fs.read.request).'
            },
            payload: {
              type: 'object',
              description: 'Payload del request. DEBE incluir request_id (uuid generado por ti) para correlacionar la response.'
            },
            response_event: {
              type: 'string',
              description: 'Opcional. Nombre del evento response. Si se omite, se infiere reemplazando .request por .response al final.'
            },
            timeout_ms: {
              type: 'integer',
              minimum: 100,
              maximum: 60000,
              description: 'Timeout en milisegundos. Default 10000.'
            }
          },
          required: ['event', 'payload']
        }
      }
    ];
  }

  /**
   * Auto-deriva el mapa page_id → prefijos válidos de tools al arrancar.
   * Para cada módulo cargado, lee los prefijos únicos de sus tools[].name
   * y los asocia al name del módulo.
   *
   * Se llama en onLoad después de _initializeProviders.
   */
  _buildPagePrefixes() {
    this.pagePrefixes = new Map();
    const loaded = this.moduleLoader?.loadedModules;
    if (!loaded || typeof loaded[Symbol.iterator] !== 'function') {
      this.logger.warn('ai-gateway.page-prefixes.unavailable', {
        reason: 'moduleLoader.loadedModules no disponible'
      });
      return;
    }
    for (const [name, mod] of loaded) {
      const tools = mod?.manifest?.tools || [];
      const prefixes = new Set();
      for (const t of tools) {
        const tn = t?.name || '';
        if (tn.includes('.')) prefixes.add(tn.split('.')[0]);
      }
      if (prefixes.size > 0) this.pagePrefixes.set(name, prefixes);
    }
    this.logger.info('ai-gateway.page-prefixes.built', {
      modules: this.pagePrefixes.size,
      mapping: Object.fromEntries([...this.pagePrefixes].map(([k, v]) => [k, [...v]]))
    });
  }

  // ============================================================
  // Attachments — fs.read.request
  // ============================================================

  async _readAttachment(project_id, attachmentPath, encoding = 'utf8') {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingFsReads.delete(request_id);
        reject(new Error(`fs.read timeout: ${attachmentPath}`));
      }, 10000);
      this.pendingFsReads.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('fs.read.request', { request_id, path: attachmentPath, project_id, encoding });
    });
  }

  onFsReadResponse(event) {
    const { request_id, content, mime_type, error } = event.data || event;
    const pending = this.pendingFsReads.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingFsReads.delete(request_id);
    if (error) pending.reject(new Error(error));
    else pending.resolve({ content, mime_type });
  }

  async _resolveAttachments(project_id, attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) return [];
    const results = await Promise.allSettled(
      attachments.map(a => {
        const path = typeof a === 'string' ? a : a.path;
        const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(path);
        return this._readAttachment(project_id, path, isImage ? 'base64' : 'utf8')
          .then(r => ({ path, ...r, isImage }));
      })
    );
    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
  }

  _injectAttachmentsInMessages(messages, resolved) {
    if (resolved.length === 0) return messages;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') return messages;

    const images = resolved.filter(r => r.isImage);
    const texts = resolved.filter(r => !r.isImage);

    let userContent;
    if (images.length > 0) {
      // Formato multimodal genérico (ai-gateway lo deja "rich" y cada provider lo traduce)
      userContent = [{ type: 'text', text: last.content }];
      for (const img of images) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mime_type || 'image/jpeg', data: img.content }
        });
      }
    } else {
      userContent = last.content;
    }

    if (texts.length > 0) {
      const block = texts.map(t => `[Adjunto: ${path.basename(t.path)}]\n${t.content}`).join('\n\n');
      if (typeof userContent === 'string') userContent = `${userContent}\n\n${block}`;
      else userContent[0].text = `${userContent[0].text}\n\n${block}`;
    }

    return [...messages.slice(0, -1), { role: 'user', content: userContent }];
  }

  // ============================================================
  // Ejecución de tool calls (event-driven)
  // ============================================================

  // Tools universales del modelo blueprint-driven. El LLM las invoca para
  // empujar/leer del bus desde el pseudocodigo del blueprint. NO publican
  // 'bus.publish' como evento — actuan directamente sobre el eventBus.
  //
  // bus.publish:
  //   args: { event, payload }
  //   side-effect: publish(event, payload). Devuelve { ok: true } inmediato.
  //
  // bus.publishAndWait:
  //   args: { event, payload, response_event?, timeout_ms? }
  //   side-effect: publish(event, payload) + subscribe(response_event) hasta
  //   recibir payload con request_id === payload.request_id. Devuelve el
  //   payload de la response. Timeout default 10000ms → UPSTREAM_TIMEOUT.
  async _executeUniversalBusTool(toolName, rawArgs, ctx) {
    const args = (rawArgs && typeof rawArgs === 'object') ? rawArgs : {};
    const ev = args.event;
    const payloadProvided = args.payload && typeof args.payload === 'object' && !Array.isArray(args.payload);
    const payload = payloadProvided ? args.payload : {};
    if (typeof ev !== 'string' || ev.length === 0) {
      const err = new Error("missing 'event' (string) in bus tool args");
      err.code = 'INVALID_INPUT';
      throw err;
    }
    // Defensa contra recursion: el LLM no debe publicar los nombres de las tools
    // universales como eventos (el bus no tiene oyentes para esos nombres porque
    // son tools del ai-gateway, no eventos del subsistema).
    if (ev === 'bus.publish' || ev === 'bus.publishAndWait') {
      const err = new Error(`'${ev}' es el nombre de una tool, no de un evento del bus`);
      err.code = 'INVALID_INPUT';
      throw err;
    }
    // Validacion de payload: el schema de la tool universal declara
    // payload como required (ver tool definitions arriba: required:['event','payload']),
    // pero hay LLMs (anthropic claude-sonnet-4-6 observado, deepseek en bucle silencioso)
    // que omiten el campo payload entero al emitir tool calls cuando el contenido
    // a serializar es grande — devuelven solo {event:'fs.write.request'}.
    // Sin esta validacion, llegaba un payload solo con auto-injectados
    // (project_id/user_id/correlation_id/timestamp) al receptor del bus, que respondia
    // INVALID_INPUT '<campo> is required' y el LLM reintentaba con el mismo defecto.
    // Detectarlo aqui y devolver un error EXPLICITO al LLM lo obliga a reconstruir
    // el tool call con payload completo en la siguiente iteracion en vez de
    // bucle de retry infinito.
    if (!payloadProvided) {
      const err = new Error(
        `args.payload ausente o no es objeto en ${toolName} (event='${ev}', args_keys=[${Object.keys(args).join(',')}])`
      );
      err.code = 'INVALID_INPUT';
      err.details = { kind: 'domain', event: ev, args_keys: Object.keys(args), field: 'payload' };
      throw err;
    }

    // Inyeccion de contexto del chat al payload. El LLM no siempre rellena
    // project_id/user_id/correlation_id aunque el blueprint padre se lo diga
    // (es probabilistico). Aqui los rellenamos si faltan — manteniendo lo
    // que el LLM puso si vino con valor explicito. timestamp si falta lo
    // generamos como ISO 8601 actual.
    const enrichedPayload = {
      project_id:     payload.project_id     ?? ctx.project_id     ?? null,
      user_id:        payload.user_id        ?? ctx.user_id        ?? 'system',
      correlation_id: payload.correlation_id ?? ctx.correlation_id ?? ctx.conversation_id ?? null,
      timestamp:      payload.timestamp      ?? new Date().toISOString(),
      ...payload
    };

    if (toolName === 'bus.publish') {
      try {
        this.eventBus.publish(ev, enrichedPayload);
        // Ack canonico al LLM: shape simple, intencion "publicacion completada".
        // No es un handler de dominio — es un side-effect ack para que el LLM
        // sepa que el publish salio sin error y siga con su pseudocodigo.
        const ack = { published: true, event: ev };
        return ack;
      } catch (err) {
        const e = new Error(`bus.publish failed: ${err.message}`);
        e.code = 'UNKNOWN_ERROR';
        throw e;
      }
    }

    // bus.publishAndWait
    const responseEvent = typeof args.response_event === 'string' && args.response_event.length > 0
      ? args.response_event
      : (ev.endsWith('.request') ? ev.slice(0, -('.request'.length)) + '.response' : `${ev}.response`);
    const timeoutMs = Math.min(60000, Math.max(100, Number(args.timeout_ms) || 10000));

    // request_id: el LLM puede mandarlo o no. Si no lo manda, generamos uno.
    // El subscribe filtra por este request_id para correlacionar.
    if (!enrichedPayload.request_id) enrichedPayload.request_id = crypto.randomUUID();
    const reqId = enrichedPayload.request_id;

    return new Promise((resolve, reject) => {
      let unsub = null;
      const timeout = setTimeout(() => {
        if (unsub) unsub();
        const err = new Error(`bus.publishAndWait timeout: ${ev} (${timeoutMs}ms)`);
        err.code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, timeoutMs);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const data = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
          if (!data || data.request_id !== reqId) return;
          clearTimeout(timeout);
          if (unsub) unsub();
          resolve(data);
        });
        this.eventBus.publish(ev, enrichedPayload);
      } catch (err) {
        clearTimeout(timeout);
        if (unsub) unsub();
        const e = new Error(`bus.publishAndWait failed: ${err.message}`);
        e.code = 'UNKNOWN_ERROR';
        reject(e);
      }
    });
  }

  async _executeToolCall(toolName, args, chatContext) {
    const ctx = chatContext || {};
    // bus.publish / bus.publishAndWait — las 2 tools universales del modelo
    // blueprint-driven. Se interceptan ANTES del path canonico por bus porque
    // su semantica es "actuar SOBRE el bus", no "invocar via bus". El nombre
    // de la tool nunca se publica como evento del bus — los publish/subscribe
    // los hace este metodo directamente.
    if (toolName === 'bus.publish' || toolName === 'bus.publishAndWait') {
      return this._executeUniversalBusTool(toolName, args, ctx);
    }
    // cajones-context-partitioning: cajon.listar / cajon.abrir actuan sobre
    // catalogo + blueprints cargados en memoria. No publican al bus.
    if (toolName === 'cajon.listar' || toolName === 'cajon.abrir') {
      return this._executeCajonTool(toolName, args, ctx);
    }
    // cajones Fase 5 bis: chat.cambiar_foco publica evento al bus; page.related
    // sirve del grafo en memoria. Interceptadas antes del path canonico.
    if (toolName === 'chat.cambiar_foco' || toolName === 'page.related') {
      return this._executeNavTool(toolName, args, ctx);
    }
    // Enriquecemos args con los 9 campos del contrato chat-io. Los args que
    // venían del LLM (tool_call.arguments) tienen prioridad — solo rellenamos
    // los que no estén ya en args. Esto garantiza que cualquier handler de
    // tool de un módulo reciba el contexto completo y pueda propagarlo al
    // evento agent.execute.request si invoca a un agente.
    const enrichedArgs = {
      ...args,
      project_id:      args.project_id      ?? ctx.project_id      ?? null,
      page_id:         args.page_id         ?? ctx.page_id         ?? null,
      conversation_id: args.conversation_id ?? ctx.conversation_id ?? null,
      settings:        args.settings        ?? ctx.settings        ?? null,
      attachments:     args.attachments     ?? ctx.attachments     ?? null,
      prompt:          args.prompt          ?? ctx.prompt          ?? null,
      intencion:       args.intencion       ?? ctx.intencion       ?? null,
      // El campo "context" del payload chat-io se preserva como _chat_context
      // para no colisionar con args.context que pueda venir del LLM.
      _chat_context:   ctx.context          ?? null
    };

    // Invocacion canonica por bus (unico path permitido).
    //
    // El loader auto-suscribe `<toolName>` cuando registra una tool con handler
    // (ver core/modules/loader.js::_wireToolBusSubscription). Para tools que
    // viven puramente en el bus (sin handler en su modulo, ej. invoke_agent
    // registrada por ai-agent-framework via su propio subscribe), el flujo es
    // el mismo: alguien escucha `<toolName>`, publica `<toolName>.response`
    // con `{request_id, result|error}`.
    //
    // Ver tools.contract.json:
    //   - decisiones_arquitectonicas.tool_invocacion_canonica_por_bus
    //   - prohibido.tool_invocacion_directa_via_toolsRegistry_handler
    const request_id = crypto.randomUUID();
    const timeoutMs = toolName === 'invoke_agent' ? 150000 : (this.config.tool_timeout_ms || 15000);
    return new Promise((resolve, reject) => {
      let unsub = null;
      const timeout = setTimeout(() => {
        if (unsub) unsub();
        reject(new Error(`tool timeout: ${toolName}`));
      }, timeoutMs);
      unsub = this.eventBus.subscribe(`${toolName}.response`, (event) => {
        const data = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
        if (!data || data.request_id !== request_id) return;
        clearTimeout(timeout);
        if (unsub) unsub();
        if (data.error) {
          // Preservar el shape canonico errors.contract { code, message, details? }.
          // Si solo viene message string, envolver con UNKNOWN_ERROR.
          const raw = data.error;
          const errObj = (typeof raw === 'object' && raw !== null)
            ? { code: raw.code || 'UNKNOWN_ERROR', message: raw.message || String(raw), details: raw.details }
            : { code: 'UNKNOWN_ERROR', message: String(raw) };
          const err = new Error(errObj.message);
          err.code = errObj.code;
          if (errObj.details !== undefined) err.details = errObj.details;
          reject(err);
        } else resolve(data.result);
      });
      this.eventBus.publish(toolName, { request_id, ...enrichedArgs });
    });
  }

  // ============================================================
  // Privados — Nucleo: _executeLLM (agentic loop compartido)
  // ============================================================

  async _executeLLM({ system, messages, tools, settings, attachments, project_id, user_id, conversation_id, correlation_id, page_id, context, prompt, intencion, providerName }) {
    const desiredProvider = providerName ?? settings?.provider ?? null;
    const { name: providerNameUsed, provider } = await this._selectProvider(desiredProvider, project_id);

    // Blueprint-driven page: inyectamos el blueprint (padre + hijo) como system
    // prompt. Si el caller ya envio un system propio, va detras como nota — el
    // blueprint manda primero por contrato del modelo de ejecucion.
    // cajones-context-partitioning: si cajones_enabled, el system prompt se
    // construye por turno con catalogo rankeado en lugar del child entero.
    // Fase 5 bis: si en un turno previo el LLM cambio el foco via chat.cambiar_foco,
    // ese page_id "pegajoso" tiene prioridad sobre el que viene en el request,
    // hasta que el frontend lo sincronice (manda el page_id correcto) o el
    // LLM lo vuelva a cambiar.
    const focoPersistido = this.conversationPageFoco.get(conversation_id);
    const effectivePageId = focoPersistido || page_id;
    // El foco pegajoso de chat.cambiar_foco vale para ESTE turno (el inmediato
    // tras el cambio, mientras el frontend sincroniza el goto) y SE CONSUME. A
    // partir de aqui manda el page_id del frontend — asi un foco viejo no
    // secuestra la pagina cuando el usuario navega por la UI (desajuste
    // cajones↔pagina). Si el LLM vuelve a cambiar_foco, se re-fija.
    if (focoPersistido && !context?.async_invocation) {
      this.conversationPageFoco.delete(conversation_id);
    }
    const blueprintCtx = effectivePageId ? this.blueprintModules.get(effectivePageId) : null;
    const blueprintPrompt = blueprintCtx
      ? (blueprintCtx.cajonesEnabled
          ? this._buildCajonesSystemPrompt(blueprintCtx, conversation_id, effectivePageId)
          : blueprintCtx.systemPrompt)
      : null;
    let effectiveSystem = blueprintPrompt
      ? (system ? `${blueprintPrompt}\n\n# CONTEXTO ADICIONAL DEL CALLER\n${system}` : blueprintPrompt)
      : system;

    // Nervio propioceptivo: en un turno REAL del chat sobre una pagina de
    // proyecto, inyectamos lo que paso en el mundo de ese proyecto desde el
    // ultimo turno — reflejos JS y ops conscientes que el LLM no controlo pero
    // de los que debe ser consciente. Best-effort: si propiocepcion no responde
    // rapido, el turno sigue sin bloquearse. No se inyecta en turnos sinteticos
    // (async-subscriber / RPC responders) ni sin proyecto.
    if (blueprintCtx && project_id && !context?.async_invocation) {
      try {
        const desdeTs = this.conversationPropioTs.get(conversation_id) || null;
        const eventos = await this._leerPropiocepcion(project_id, desdeTs);
        if (Array.isArray(eventos) && eventos.length > 0) {
          const seccion = this._composePropiocepcionSection(eventos);
          effectiveSystem = effectiveSystem ? `${effectiveSystem}\n\n${seccion}` : seccion;
          const ultimaTs = eventos[eventos.length - 1]?.ts;
          if (ultimaTs) this.conversationPropioTs.set(conversation_id, ultimaTs);
        }
      } catch (_) { /* la consciencia es best-effort; nunca bloquea el turno */ }
    }

    // Resolver attachments y mezclarlos con el último mensaje user
    const resolvedAtt = await this._resolveAttachments(project_id, attachments);
    let workingMessages = [{ role: 'system', content: effectiveSystem }, ...messages];
    workingMessages = this._injectAttachmentsInMessages(workingMessages, resolvedAtt);

    const translatedTools = tools && tools.length > 0
      ? provider.translateTools?.(tools) || tools
      : null;

    const chatOptions = {
      temperature: settings?.temperature ?? 0.7,
      // Suelo de 4096: las paginas blueprint (recetario) generan respuestas
      // largas (crear receta + estructura + preguntas) que se cortaban con el
      // viejo tope de 2000. Floor en vez de default para subir tambien las
      // conversaciones existentes (que tienen 2000 guardado en su settings).
      max_tokens: Math.max(Number(settings?.max_tokens) || 0, 4096),
      tools: translatedTools,
      projectId: project_id,
      conversationId: conversation_id,
      retryConfig: this.config.retry
    };
    if (settings?.model) chatOptions.model = settings.model;
    if (settings?.thinking) chatOptions.thinking = settings.thinking;

    // Contexto completo del chat (9 campos del contrato chat-io) que se propaga
    // a cada tool call. Cualquier handler de tool de un módulo lo recibe en sus
    // args y puede propagarlo al evento agent.execute.request si invoca un agente.
    // page_id efectivo (con foco persistido) tambien se propaga al chatContext
    // para que cajon.*, page.related y chat.cambiar_foco operen sobre el page
    // que el LLM realmente ve en su system prompt.
    const chatContext = {
      project_id, user_id, page_id: effectivePageId, conversation_id, correlation_id,
      settings, attachments, prompt, intencion, context
    };

    const maxIterations = this.config.max_tool_iterations || 10;
    let result, iteration = 0;
    let totalInput = 0, totalOutput = 0, totalCost = 0;
    const allToolResults = [];

    while (iteration < maxIterations) {
      iteration++;
      result = await provider.withRetry(
        () => provider.chatCompletion(workingMessages, chatOptions),
        chatOptions.retryConfig
      );
      totalInput  += result.usage?.input_tokens  || 0;
      totalOutput += result.usage?.output_tokens || 0;
      totalCost   += result.cost || 0;

      if (!result.tool_calls || result.tool_calls.length === 0) break;

      // Parsear tool calls al formato genérico
      const toolCalls = (provider.parseToolCalls?.(result) || result.tool_calls).map(tc => ({
        id: tc.id || crypto.randomUUID(),
        name: tc.function?.name || tc.name,
        arguments: tc.function?.arguments || tc.arguments || {}
      }));

      // Ejecutar todas las tool calls
      const toolResults = [];
      for (const tc of toolCalls) {
        // args parseado se preserva en el resultado para que ai.chat.response
        // y la persistencia de chat-io reciban el shape canonico completo
        // (chat-flow.contract: tool_calls_executed[].args). Sin esto el LLM
        // que audita post-hoc no sabe con que parametros se llamo al tool.
        // Parseo de tc.arguments con preservacion del raw cuando falla.
        // Bug observado en audit recetas 2026-05-20 y demo Mordisco 2026-05-21:
        // tanto deepseek como anthropic emiten ocasionalmente tool calls con
        // JSON corrupto/incompleto cuando un campo (content/payload) iba a ser
        // grande (varios KB). El catch silencioso anterior convertia args en {}
        // perdiendo el diagnostico. Ahora preservamos el raw_arguments_failed
        // y devolvemos error explicito al LLM para que reintente con args
        // bien formados en vez de bucle silencioso.
        let args = {};
        let argsParseError = null;
        let rawArgsForError = null;
        try {
          if (typeof tc.arguments === 'string') {
            args = JSON.parse(tc.arguments);
          } else {
            args = tc.arguments || {};
          }
        } catch (parseErr) {
          argsParseError = parseErr;
          rawArgsForError = typeof tc.arguments === 'string'
            ? tc.arguments
            : JSON.stringify(tc.arguments);
          this.logger.warn('ai-gateway.tool_call.args_parse_failed', {
            tool_name: tc.name,
            tool_call_id: tc.id,
            parse_error: parseErr.message,
            raw_args_length: rawArgsForError.length,
            raw_args_preview: rawArgsForError.slice(0, 300),
            iteration
          });
        }
        if (argsParseError) {
          // No invocar el tool con args={}. Devolver error explicito al LLM
          // (sustituye el catch silencioso previo que convertia args en {} y
          // resultaba en invocaciones del tool con campos requeridos ausentes).
          toolResults.push({
            tool_call_id: tc.id, name: tc.name, args: {},
            status: 'error',
            error: {
              code: 'INVALID_INPUT',
              message: `arguments JSON invalido en tool_call '${tc.name}': ${argsParseError.message} (raw_length=${rawArgsForError.length})`,
              details: {
                kind: 'domain',
                tool_name: tc.name,
                field: 'arguments',
                parse_error: argsParseError.message,
                raw_args_length: rawArgsForError.length,
                raw_args_preview: rawArgsForError.slice(0, 200)
              }
            }
          });
          continue;
        }
        try {
          const result = await this._executeToolCall(tc.name, args, chatContext);
          toolResults.push({ tool_call_id: tc.id, name: tc.name, args, status: 'success', result });
        } catch (err) {
          // Preservar el shape canonico errors.contract { code, message, details? }
          // — antes solo se preservaba message, lo que falseaba TODO el diagnostico
          // (errores semanticos como RESOURCE_NOT_FOUND quedaban indistinguibles
          // de bugs UNKNOWN_ERROR genericos).
          toolResults.push({
            tool_call_id: tc.id, name: tc.name, args,
            status: 'error',
            error: {
              code: err.code || 'UNKNOWN_ERROR',
              message: err.message || String(err),
              ...(err.details !== undefined ? { details: err.details } : {})
            }
          });
        }
      }
      allToolResults.push(...toolResults);

      // Añadir el assistant turn con tool_calls + los tool results.
      // content: '' (no null) — DeepSeek/OpenAI requieren el campo presente
      // como string aunque sea vacío cuando el assistant solo hace tool_calls.
      // reasoning_content: si el provider lo expone (Kimi en thinking mode),
      // preservarlo — Moonshot rechaza con HTTP 400 el siguiente turno si
      // el assistant con tool_calls anterior no lo lleva.
      const assistantTurn = { role: 'assistant', content: result.content || '', tool_calls: result._raw_tool_calls || result.tool_calls };
      if (result.reasoning_content) assistantTurn.reasoning_content = result.reasoning_content;
      workingMessages.push(assistantTurn);
      // Formato del tool_result visible al LLM. Incluir el error.code es
      // critico para que el LLM distinga errores semanticos (RESOURCE_NOT_FOUND,
      // INVALID_INPUT) de bugs internos (UNKNOWN_ERROR) y decida si reintentar
      // con args distintos, mencionarlo al usuario o cambiar de via.
      const formatErr = (e) => {
        if (e == null) return 'Error: (sin detalle)';
        if (typeof e === 'string') return `Error: ${e}`;
        const code = e.code || 'UNKNOWN_ERROR';
        const msg  = e.message || '(sin mensaje)';
        const det  = e.details ? ` — ${JSON.stringify(e.details)}` : '';
        return `Error [${code}]: ${msg}${det}`;
      };
      const toolMessages = provider.formatToolResults?.(toolResults) || toolResults.map(tr => ({
        role: 'tool',
        tool_call_id: tr.tool_call_id,
        content: tr.status === 'error' ? formatErr(tr.error) : JSON.stringify(tr.result)
      }));
      workingMessages.push(...toolMessages);
    }

    return {
      content: result?.content || '',
      tool_calls_executed: allToolResults,
      iterations: iteration,
      tokens: { input: totalInput, output: totalOutput, total: totalInput + totalOutput },
      cost: totalCost,
      model: result?.model,
      provider: providerNameUsed,
      finish_reason: result?.finish_reason
    };
  }

  // ============================================================
  // Bus API — entry points wireados por module.json.events.subscribes.
  // Entry 1: chat.prompt.ready → ai.chat.response
  // ============================================================

  async onChatPromptReady(event) {
    const data = event.data || event;

    const correlation_id  = data.correlation_id;
    const conversation_id = data.conversation_id;
    const project_id      = data.project_id ?? null;
    const user_id         = data.user_id || 'default';
    const channel         = data.channel || 'web';
    const channel_context = data.channel_context || {};
    const message_id      = data.message_id;
    const page_id         = data.page_id;
    const settings        = data.settings;
    const attachments     = data.attachments;
    const intencion       = data.intencion ?? null;
    const tools_disponibles = data.tools_disponibles;
    const systemPrompt    = data.system_prompt ?? '';
    const history = Array.isArray(data.messages) ? data.messages : [];

    if (!conversation_id || !message_id) {
      this.logger.warn('ai-gateway.onChatPromptReady.invalid_payload', { conversation_id, message_id });
      return;
    }

    const tools = tools_disponibles && tools_disponibles.length > 0
      ? tools_disponibles
      : this._getTools(page_id);

    const startedAt = Date.now();
    let providerAttempted = null;

    try {
      const llmResult = await this._executeLLM({
        system: systemPrompt,
        messages: history,
        tools,
        settings,
        attachments,
        project_id,
        user_id,
        conversation_id,
        correlation_id,
        page_id,
        prompt: systemPrompt,
        intencion
      });
      providerAttempted = llmResult.provider || null;

      const payload = {
        correlation_id:       correlation_id || crypto.randomUUID(),
        conversation_id,
        project_id,
        user_id,
        channel,
        channel_context,
        message_id,
        message_id_assistant: crypto.randomUUID(),
        assistant_message:    llmResult.content || '',
        model:                llmResult.model || 'unknown',
        provider:             llmResult.provider || 'unknown',
        tokens:               llmResult.tokens,
        duration_ms:          Date.now() - startedAt,
        timestamp:            new Date().toISOString()
      };
      if (Array.isArray(llmResult.tool_calls_executed) && llmResult.tool_calls_executed.length > 0) {
        // Propagar el shape canonico de error errors.contract en lugar de
        // hardcodear UNKNOWN_ERROR (drift anterior que invisibilizaba
        // RESOURCE_NOT_FOUND, INVALID_INPUT, RESOURCE_NOT_FOUND, etc).
        payload.tool_calls_executed = llmResult.tool_calls_executed
          .map(t => {
            const entry = {
              name:          t.name,
              args:          (typeof t.args === 'object' && t.args !== null) ? t.args : {},
              result_status: t.status === 'success' ? 'ok' : (t.status === 'timeout' ? 'timeout' : 'error')
            };
            if (t.duration_ms !== undefined) entry.duration_ms = t.duration_ms;
            if (t.error) {
              if (typeof t.error === 'object') {
                entry.error_code = t.error.code || 'UNKNOWN_ERROR';
                if (t.error.message) entry.error_message = t.error.message;
                if (t.error.details !== undefined) entry.error_details = t.error.details;
              } else {
                entry.error_code = 'UNKNOWN_ERROR';
                entry.error_message = String(t.error);
              }
            }
            return entry;
          });
      }
      if (typeof llmResult.iterations === 'number' && llmResult.iterations >= 1) {
        payload.iterations = llmResult.iterations;
      }
      if (typeof llmResult.cost === 'number' && llmResult.cost > 0) {
        payload.cost = { amount: llmResult.cost, currency: 'USD' };
      }
      if (llmResult.finish_reason) payload.finish_reason = llmResult.finish_reason;

      await this.eventBus.publish('ai.chat.response', payload);
    } catch (err) {
      const error = this._classifyError(err);
      this.logger.error('ai-gateway.chat.failed', { code: error.code, error: error.message, conversation_id, message_id });

      await this.eventBus.publish('ai.chat.failed', {
        correlation_id: correlation_id || crypto.randomUUID(),
        conversation_id,
        project_id,
        user_id,
        channel,
        channel_context,
        message_id,
        error,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        provider_attempted: providerAttempted
      });
    }
  }

  // ============================================================
  // Clasificacion canonica de errores LLM/credenciales/red
  // ============================================================

  _classifyError(err) {
    const raw = (err && err.message) ? String(err.message) : 'unknown error';
    const lower = raw.toLowerCase();

    let code = 'UNKNOWN_ERROR';
    if (/credential .*timeout|sin credencial|no api key|api key not|credential not found/i.test(raw)) {
      code = 'RESOURCE_NOT_FOUND';
    } else if (/no hay providers?.*disponibles?|no providers? available/i.test(raw)) {
      code = 'RESOURCE_NOT_FOUND';
    } else if (lower.includes('timeout') || lower.includes('etimedout')) {
      code = 'UPSTREAM_TIMEOUT';
    } else if (/429|rate.?limit/.test(lower)) {
      code = 'UPSTREAM_INVALID_RESPONSE';
    } else if (/401|403|unauthorized|forbidden|invalid api key/.test(lower)) {
      code = 'UPSTREAM_INVALID_RESPONSE';
    } else if (/5\d\d|internal server error|bad gateway|service unavailable/.test(lower)) {
      code = 'UPSTREAM_INVALID_RESPONSE';
    } else if (/econnrefused|enotfound|network|unreachable|fetch failed/.test(lower)) {
      code = 'UPSTREAM_UNREACHABLE';
    } else if (/invalid response|malformed|parse|unexpected token/.test(lower)) {
      code = 'UPSTREAM_INVALID_RESPONSE';
    } else if (/context.{0,10}(length|window|too long|too large|exceed)|prompt.{0,5}(too long|too large)|maximum.{0,10}context|too many tokens|context_length_exceeded|413/i.test(lower)) {
      code = 'UPSTREAM_INVALID_RESPONSE';
    }

    return { code, message: raw, details: {} };
  }

  // ============================================================
  // Entry 2: llm.complete.request → llm.complete.response
  // ============================================================

  async onLlmCompleteRequest(event) {
    const data = event.data || event;
    const {
      request_id, correlation_id, system, messages, tools, settings,
      attachments, project_id, user_id, conversation_id, page_id, provider: providerName
    } = data;

    if (!request_id) {
      this.logger.warn('ai-gateway.llm.invalid_payload', { has_request_id: false });
      return;
    }

    const cid = correlation_id || crypto.randomUUID();
    const started = Date.now();

    try {
      const result = await this._executeLLM({
        system, messages, tools, settings, attachments,
        project_id, user_id, conversation_id, correlation_id: cid, page_id, providerName
      });

      await this._publicarEvento('llm.complete.response', {
        request_id,
        project_id,
        ...result,
        duration_ms: Date.now() - started
      }, { correlation_id: cid });
    } catch (err) {
      const error = this._classifyExecutionError(err);
      this.logger.error('ai-gateway.llm.failed', {
        error: error.message, code: error.code, request_id, correlation_id: cid
      });

      await this._publicarEvento('llm.complete.failed', {
        request_id,
        error,
        duration_ms: Date.now() - started
      }, { correlation_id: cid });
    }
  }

  // ============================================================
  // Entry 3: embedding.generate.request → embedding.generate.response | failed
  // ============================================================

  async onEmbeddingGenerateRequest(event) {
    const data = event.data || event;
    const {
      correlation_id, request_id, project_id, user_id, content,
      settings, source
    } = data;

    if (!correlation_id || !request_id || !project_id || !content) {
      this.logger.warn('ai-gateway.embedding.invalid_payload', {
        has_correlation: !!correlation_id, has_request: !!request_id,
        has_project: !!project_id, has_content: !!content
      });
      return;
    }

    const start = Date.now();
    const desiredProvider = settings?.provider;
    let providerInstance = null;
    let providerName = null;

    try {
      const selected = await this._selectEmbeddingProvider(desiredProvider, project_id);
      providerInstance = selected.provider;
      providerName = selected.name;
      providerInstance.setContext({ projectId: project_id });

      const opts = {
        model: settings?.model,
        dimensions: settings?.dimensions
      };
      const result = await providerInstance.generateEmbedding(content, opts);

      const duration_ms = Date.now() - start;
      this.logger.info('ai-gateway.embedding.completed', {
        provider: providerName, model: result.model,
        dimensions: result.dimensions, duration_ms,
        source: source || 'unknown'
      });

      await this.eventBus.publish('embedding.generate.response', {
        correlation_id,
        request_id,
        vector: result.vector,
        dimensions: result.dimensions,
        model: result.model,
        provider: providerName,
        tokens: result.tokens || { input: 0 },
        duration_ms,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      const duration_ms = Date.now() - start;
      const classified = this._classifyError(err);
      this.logger.error('ai-gateway.embedding.failed', {
        error: err.message, code: classified.code, request_id,
        provider_attempted: providerName, duration_ms
      });

      await this.eventBus.publish('embedding.generate.failed', {
        correlation_id,
        request_id,
        error: { code: classified.code, message: classified.message },
        ...(providerName ? { provider_attempted: providerName } : {}),
        ...(settings?.model ? { model_attempted: settings.model } : {}),
        duration_ms,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Selecciona provider para embeddings. A diferencia de _selectProvider (LLM),
   * filtra por providers que SOPORTAN embeddings (gemini, openai). Si el caller
   * pide explicitamente uno que no soporta o no esta disponible, lanza con
   * mensaje claro. Si no pide ninguno, prefiere por priority entre los que
   * soportan embeddings.
   */
  async _selectEmbeddingProvider(requestedName, projectId) {
    if (requestedName && requestedName !== 'auto') {
      const p = this.providers.get(requestedName);
      if (!p) throw new Error(`Provider '${requestedName}' no disponible`);
      if (!p.supportsEmbeddings()) throw new Error(`Provider '${requestedName}' no soporta embeddings`);
      if (!await p.isAvailable({ projectId })) throw new Error(`Provider '${requestedName}' sin credencial`);
      return { name: requestedName, provider: p };
    }
    const candidates = Array.from(this.providers.entries())
      .filter(([, p]) => p.supportsEmbeddings())
      .map(([name, p]) => ({ name, provider: p, priority: this.config.providers?.[name]?.priority || 99 }))
      .sort((a, b) => a.priority - b.priority);
    for (const e of candidates) {
      if (await e.provider.isAvailable({ projectId })) return { name: e.name, provider: e.provider };
    }
    throw new Error('No hay providers de embeddings disponibles. Verifica las API keys (gemini, openai).');
  }

  // ============================================================
  // Helpers POC2 (transferibles) + auxiliares del dominio
  // ============================================================

  // Helper auxiliar especifico del dominio LLM:
  // mapea errores de providers/HTTP/CLI a codigos canonicos del agentic loop.
  // Renombrado de _classifyError para alinear con el contrato POC2
  // (HELPERS_AUXILIARES). Preserva los codes existentes consumidos por chat
  // y embedding paths.
  _classifyExecutionError(err) {
    return this._classifyError(err);
  }
}

module.exports = AiGatewayModule;
