/**
 * Flow Engine Module
 *
 * Motor de flujos genérico que conecta:
 * - Servicios locales (OCR, filesystem, etc.)
 * - APIs externas
 * - Agentes AI
 * - Transformaciones de datos
 * - Lógica condicional
 *
 * @module flow-engine
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs').promises;

const FlowRegistry = require('./services/flow-registry');
const FlowExecutor = require('./services/flow-executor');
const StepHandlers = require('./services/step-handlers');
const VariableResolver = require('./services/variable-resolver');
const FlowScheduler = require('./services/scheduler');
const ExecutionStore = require('./services/execution-store');
const manifestLoader = require('../../services/manifest-loader');

class FlowEngineModule {
  constructor() {
    this.name = 'flow-engine';
    this.version = '1.0.0';

    // Dependencies
    this.logger = null;
    this.eventBus = null;
    this.uiHandler = null;
    this.config = null;

    // Services
    this.registry = null;
    this.executor = null;
    this.stepHandlers = null;
    this.variableResolver = null;
    this.scheduler = null;
    this.executionStore = null;

    // Subscriptions
    this.unsubscribes = [];

    // Stats
    this.startTime = Date.now();
    this.stats = {
      flowsTriggered: 0,
      flowsCompleted: 0,
      flowsFailed: 0
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    // Cargar configuración
    const moduleJsonPath = path.join(__dirname, 'module.json');
    const moduleJson = JSON.parse(await fs.readFile(moduleJsonPath, 'utf-8'));
    this.config = moduleJson.config || {};

    this.logger.info('flow-engine.loading', {
      version: this.version
    });

    // Inicializar servicios
    this.variableResolver = new VariableResolver(this.logger);
    this.stepHandlers = new StepHandlers(this.logger, this.eventBus, this.variableResolver);

    this.registry = new FlowRegistry(this.config, this.logger);
    await this.registry.initialize();

    // Inicializar store de ejecuciones (persistencia)
    this.executionStore = new ExecutionStore({
      basePath: './data/flow-engine/executions',
      maxExecutions: 1000,
      retentionDays: 30
    });
    this.executionStore.setLogger(this.logger);
    await this.executionStore.initialize();

    this.executor = new FlowExecutor(
      this.config,
      this.logger,
      this.eventBus,
      this.stepHandlers,
      this.variableResolver,
      this.executionStore
    );

    // Inicializar scheduler para flujos programados (delega al módulo scheduler)
    this.scheduler = new FlowScheduler(this.logger, this.eventBus);
    await this.scheduler.initialize(this.registry.getAll());

    // Suscribirse a eventos
    await this.subscribeToEvents();

    // Registrar handlers UI
    await this.registerUIHandlers();

    this.logger.info('flow-engine.loaded', {
      version: this.version,
      flows_count: this.registry.getAll().length
    });
  }

  async onUnload() {
    this.logger.info('flow-engine.unloading');

    // Detener scheduler
    if (this.scheduler) {
      this.scheduler.stop();
    }

    // Cerrar execution store (guarda pendientes)
    if (this.executionStore) {
      await this.executionStore.close();
    }

    // Unsubscribe
    for (const unsub of this.unsubscribes) {
      if (typeof unsub === 'function') {
        await unsub();
      }
    }
    this.unsubscribes = [];

    this.logger.info('flow-engine.unloaded');
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    // === 1. TRIGGER EVENTS ===
    // Eventos que pueden disparar flujos (base + dinámicos de flujos registrados)
    const baseTriggerEvents = [
      'bot.file.stored',
      'bot.message.received',
      'bot.command.received',
      'flow.trigger' // Trigger manual
    ];

    // Extraer triggers adicionales de los flujos registrados
    const flowTriggers = this.registry.getAll()
      .map(f => f.trigger?.event)
      .filter(e => e && !baseTriggerEvents.includes(e));

    const triggerEvents = [...new Set([...baseTriggerEvents, ...flowTriggers])];

    for (const event of triggerEvents) {
      const unsub = await this.eventBus.subscribe(event, (e) => this.onTriggerEvent(event, e));
      this.unsubscribes.push(unsub);
    }

    // === 2. SERVICE RESPONSE EVENTS (desde manifests) ===
    // Cargar manifests de providers para autodescubrir eventos
    manifestLoader.setLogger(this.logger);
    await manifestLoader.load();

    // Obtener eventos de respuesta dinámicamente desde los manifests
    const manifestEvents = manifestLoader.getServiceEventNames();

    // Eventos adicionales que no están en manifests (módulos internos)
    const additionalEvents = [
      // Filesystem module (modules/filesystem/) - no tiene manifest
      'fs.read.response', 'fs.read.failed',
      'fs.write.response', 'fs.write.failed',
      'fs.copy.response', 'fs.copy.failed',
      'fs.delete.response', 'fs.delete.failed',
      'fs.list.response', 'fs.list.failed',
      'fs.mkdir.response', 'fs.mkdir.failed',
      'fs.move.response', 'fs.move.failed',
      'fs.rename.response', 'fs.rename.failed',
      'fs.exists.response', 'fs.exists.failed',
      'fs.info.response', 'fs.info.failed',
      'fs.append.response', 'fs.append.failed',
      'fs.search.response', 'fs.search.failed',
      'fs.stats.response', 'fs.stats.failed',
      // Telegram module
      'telegram.send_message.response', 'telegram.send_message.error'
    ];

    const serviceResponsePatterns = [...new Set([...manifestEvents, ...additionalEvents])];

    for (const event of serviceResponsePatterns) {
      const handler = event.includes('failed') || event.includes('error')
        ? this.onServiceFailed.bind(this)
        : this.onServiceCompleted.bind(this);
      const unsub = await this.eventBus.subscribe(event, handler);
      this.unsubscribes.push(unsub);
    }

    // === 3. AGENT EVENTS ===
    // Eventos de agentes (para steps de tipo agent con nombre)
    const unsubAgentCompleted = await this.eventBus.subscribe(
      'agent.*.completed',
      this.onAgentCompleted.bind(this)
    );
    this.unsubscribes.push(unsubAgentCompleted);

    const unsubAgentFailed = await this.eventBus.subscribe(
      'agent.*.failed',
      this.onAgentFailed.bind(this)
    );
    this.unsubscribes.push(unsubAgentFailed);

    // === 4. AI CHAT EVENTS ===
    // Eventos de ai-gateway (para steps de tipo agent inline con model/prompt)
    const unsubAIChatResponse = await this.eventBus.subscribe(
      'ai.chat.response',
      this.onAIChatResponse.bind(this)
    );
    this.unsubscribes.push(unsubAIChatResponse);

    this.logger.info('flow-engine.subscribed', {
      triggerEvents: triggerEvents.length,
      serviceEvents: serviceResponsePatterns.length,
      fromManifests: manifestEvents.length,
      providers: manifestLoader.getAllManifests().map(m => m.name)
    });
  }

  async registerUIHandlers() {
    if (!this.uiHandler) return;

    this.uiHandler.register('flow', 'list', this.handleUIListFlows.bind(this));
    this.uiHandler.register('flow', 'get', this.handleUIGetFlow.bind(this));
    this.uiHandler.register('flow', 'create', this.handleUICreateFlow.bind(this));
    this.uiHandler.register('flow', 'trigger', this.handleUITriggerFlow.bind(this));
    this.uiHandler.register('flow', 'executions', this.handleUIListExecutions.bind(this));
    this.uiHandler.register('flow', 'execution', this.handleUIGetExecution.bind(this));
    this.uiHandler.register('flow', 'stats', this.handleUIExecutionStats.bind(this));

    this.logger.info('flow-engine.ui_handlers.registered');
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  /**
   * Maneja eventos que pueden disparar flujos
   */
  async onTriggerEvent(eventName, event) {
    const data = event?.data || event?.payload || event;

    // Buscar flujos que coincidan
    const matchingFlows = this.registry.findMatching(eventName, data);

    if (matchingFlows.length === 0) {
      this.logger.debug('flow-engine.no-matching-flows', {
        event: eventName
      });
      return;
    }

    this.logger.info('flow-engine.flows.matched', {
      event: eventName,
      count: matchingFlows.length
    });

    // Ejecutar cada flujo que coincide
    for (const flow of matchingFlows) {
      // Verificar si está habilitado
      if (flow.enabled === false) {
        this.logger.debug('flow-engine.flow.disabled', { flowId: flow.id });
        continue;
      }

      this.stats.flowsTriggered++;

      try {
        await this.executor.start(flow, data);
      } catch (error) {
        this.logger.error('flow-engine.flow.start_error', {
          flowId: flow.id,
          error: error.message
        });
        this.stats.flowsFailed++;
      }
    }
  }

  /**
   * Maneja respuestas de servicios
   */
  async onServiceCompleted(event) {
    const data = event?.data || event?.payload || event;
    const { request_id } = data;

    if (request_id) {
      this.stepHandlers.handleServiceResponse(request_id, data, false);
    }
  }

  async onServiceFailed(event) {
    const data = event?.data || event?.payload || event;
    const { request_id } = data;

    if (request_id) {
      this.stepHandlers.handleServiceResponse(request_id, data, true);
    }
  }

  /**
   * Maneja respuestas de agentes
   */
  async onAgentCompleted(event) {
    const data = event?.data || event?.payload || event;
    const { request_id } = data;

    if (request_id) {
      this.stepHandlers.handleAgentResponse(request_id, data, false);
    }
  }

  async onAgentFailed(event) {
    const data = event?.data || event?.payload || event;
    const { request_id } = data;

    if (request_id) {
      this.stepHandlers.handleAgentResponse(request_id, data, true);
    }
  }

  /**
   * Maneja respuestas de ai-gateway (para inline AI steps)
   */
  async onAIChatResponse(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, success, error } = data;

    if (request_id) {
      this.stepHandlers.handleAIChatResponse(request_id, data, !success);
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleHealthCheck(req, context) {
    const uptime = (Date.now() - this.startTime) / 1000;

    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime,
        stats: this.stats,
        flows: this.registry.getAll().length,
        executions: this.executor.getStats(),
        timestamp: new Date().toISOString()
      }
    };
  }

  async handleListFlows(req, context) {
    const flows = this.registry.getAll().map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      enabled: f.enabled !== false,
      trigger: f.trigger,
      stepsCount: f.steps?.length || 0,
      registeredAt: f.registeredAt
    }));

    return { status: 200, data: { flows, count: flows.length } };
  }

  async handleGetFlow(req, context) {
    const { flowId } = req.params;
    const flow = this.registry.get(flowId);

    if (!flow) {
      return { status: 404, data: { error: 'FLOW_NOT_FOUND' } };
    }

    return { status: 200, data: flow };
  }

  async handleCreateFlow(req, context) {
    try {
      const flow = req.body;
      const created = await this.registry.register(flow);

      // Guardar a archivo si está configurado
      if (this.config.autoLoadFlows) {
        await this.registry.saveToFile(created.id);
      }

      return { status: 201, data: created };
    } catch (error) {
      return { status: 400, data: { error: error.message } };
    }
  }

  async handleUpdateFlow(req, context) {
    try {
      const { flowId } = req.params;
      const updates = req.body;
      const updated = await this.registry.update(flowId, updates);

      // Guardar a archivo
      if (this.config.autoLoadFlows) {
        await this.registry.saveToFile(flowId);
      }

      return { status: 200, data: updated };
    } catch (error) {
      return { status: 400, data: { error: error.message } };
    }
  }

  async handleDeleteFlow(req, context) {
    const { flowId } = req.params;
    const deleted = await this.registry.delete(flowId);

    if (!deleted) {
      return { status: 404, data: { error: 'FLOW_NOT_FOUND' } };
    }

    return { status: 200, data: { deleted: true } };
  }

  async handleTriggerFlow(req, context) {
    const { flowId } = req.params;
    const flow = this.registry.get(flowId);

    if (!flow) {
      return { status: 404, data: { error: 'FLOW_NOT_FOUND' } };
    }

    const triggerData = req.body || {};

    try {
      const executionId = await this.executor.start(flow, triggerData);
      this.stats.flowsTriggered++;

      return {
        status: 202,
        data: {
          executionId,
          flowId,
          message: 'Flow started'
        }
      };
    } catch (error) {
      return { status: 500, data: { error: error.message } };
    }
  }

  async handleListExecutions(req, context) {
    const query = req.query || {};

    // Obtener ejecuciones activas (en memoria)
    const active = this.executor.listAll().map(e => ({
      id: e.id,
      flowId: e.flowId,
      flowName: e.flowName,
      status: e.status,
      currentStep: e.currentStepId,
      progress: `${e.currentStepIndex}/${e.totalSteps}`,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      error: e.error,
      source: 'active'
    }));

    // Obtener historial desde store
    let history = [];
    if (this.executionStore) {
      const result = this.executionStore.list({
        flowId: query.flowId,
        status: query.status,
        from: query.from,
        to: query.to,
        limit: parseInt(query.limit) || 50,
        offset: parseInt(query.offset) || 0
      });
      history = result.executions.map(e => ({ ...e, source: 'history' }));
    }

    // Combinar (activas primero, luego historial sin duplicados)
    const activeIds = new Set(active.map(e => e.id));
    const combined = [
      ...active,
      ...history.filter(e => !activeIds.has(e.id))
    ];

    return {
      status: 200,
      data: {
        executions: combined,
        active: active.length,
        total: combined.length,
        stats: this.executionStore ? this.executionStore.getStats() : this.executor.getStats()
      }
    };
  }

  async handleGetExecution(req, context) {
    const { executionId } = req.params;

    // Primero buscar en ejecuciones activas
    let execution = this.executor.getExecution(executionId);

    // Si no está activa, buscar en historial
    if (!execution && this.executionStore) {
      execution = this.executionStore.get(executionId);
    }

    if (!execution) {
      return { status: 404, data: { error: 'EXECUTION_NOT_FOUND' } };
    }

    return { status: 200, data: execution };
  }

  async handleCancelExecution(req, context) {
    const { executionId } = req.params;
    const cancelled = await this.executor.cancel(executionId);

    if (!cancelled) {
      return { status: 404, data: { error: 'EXECUTION_NOT_FOUND_OR_NOT_RUNNING' } };
    }

    return { status: 200, data: { cancelled: true } };
  }

  /**
   * Obtiene estadísticas de ejecuciones
   */
  async handleExecutionStats(req, context) {
    const query = req.query || {};

    if (!this.executionStore) {
      return { status: 200, data: this.executor.getStats() };
    }

    const stats = this.executionStore.getStats({
      from: query.from
    });

    return { status: 200, data: stats };
  }

  // ==========================================
  // UI Handlers (MQTT)
  // ==========================================

  async handleUIListFlows(data, context) {
    const result = await this.handleListFlows({}, context);
    return { status: result.status, data: result.data };
  }

  async handleUIGetFlow(data, context) {
    const { flowId } = data;
    if (!flowId) {
      return { status: 400, error: 'flowId is required' };
    }
    const result = await this.handleGetFlow({}, { params: { flowId } });
    return { status: result.status, data: result.data };
  }

  async handleUICreateFlow(data, context) {
    const result = await this.handleCreateFlow({ body: data }, context);
    return { status: result.status, data: result.data };
  }

  async handleUITriggerFlow(data, context) {
    const { flowId, ...triggerData } = data;
    if (!flowId) {
      return { status: 400, error: 'flowId is required' };
    }
    const result = await this.handleTriggerFlow(
      { body: triggerData },
      { params: { flowId } }
    );
    return { status: result.status, data: result.data };
  }

  async handleUIListExecutions(data, context) {
    const result = await this.handleListExecutions({ query: data }, context);
    return { status: result.status, data: result.data };
  }

  async handleUIGetExecution(data, context) {
    const { executionId } = data;
    if (!executionId) {
      return { status: 400, error: 'executionId is required' };
    }
    const result = await this.handleGetExecution(
      { params: { executionId } },
      context
    );
    return { status: result.status, data: result.data };
  }

  async handleUIExecutionStats(data, context) {
    const result = await this.handleExecutionStats({ query: data }, context);
    return { status: result.status, data: result.data };
  }

  // ==========================================
  // Public API
  // ==========================================

  /**
   * Registra un flujo programáticamente
   */
  async registerFlow(flow) {
    return await this.registry.register(flow);
  }

  /**
   * Dispara un flujo manualmente
   */
  async triggerFlow(flowId, triggerData = {}) {
    const flow = this.registry.get(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }
    return await this.executor.start(flow, triggerData);
  }

  /**
   * Lista flujos
   */
  listFlows() {
    return this.registry.getAll();
  }

  /**
   * Obtiene un flujo
   */
  getFlow(flowId) {
    return this.registry.get(flowId);
  }
}

module.exports = FlowEngineModule;
