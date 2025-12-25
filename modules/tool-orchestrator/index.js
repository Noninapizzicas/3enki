/**
 * Tool Orchestrator Module
 * Orchestrates tool calls between AI agents and tool providers
 *
 * Features:
 * - Dynamic tool registration
 * - JSON Schema validation
 * - Timeout handling
 * - Event-driven execution
 *
 * Follows event-driven architecture
 */

const Ajv = require('ajv');
const crypto = require('crypto');

const { EVENTS, FIELDS, HELPERS, CONFIG, ERRORS } = require('../../core/constants');

class ToolOrchestratorModule {
  constructor() {
    this.name = 'tool-orchestrator';
    this.version = '2.0.0';

    // State
    this.tools = new Map(); // fullName -> { moduleName, toolName, schema, description, handler }
    this.ajv = new Ajv({ allErrors: true });

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};
    this.activity = core.activity?.forModule('tool-orchestrator');

    this.activity?.action('module.loading', { version: this.version });
    this.logger.info('module.loading', {
      module: this.name,
      version: this.version
    });

    // Subscribe to events
    await this.subscribeToEvents();

    // Update metrics
    // REMOVED: this.metrics.gauge('tool.registered.count', 0);

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      validation_enabled: this.config.validationEnabled !== false
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Publish unregister events for all tools
    for (const [fullName] of this.tools.entries()) {
      await this.eventBus.publish(EVENTS.TOOL.UNREGISTERED, {
        full_name: fullName,
        unregistered_at: new Date().toISOString()
      });
    }

    this.tools.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe(EVENTS.TOOL.CALL_REQUEST, this.onToolCallRequest.bind(this));
    await this.eventBus.subscribe(EVENTS.TOOL.LIST_REQUEST, this.onListToolsRequest.bind(this));
    await this.eventBus.subscribe('tool.get.request', this.onGetToolRequest.bind(this));

    this.logger.info('events.subscribed', {
      events: [EVENTS.TOOL.CALL_REQUEST, EVENTS.TOOL.LIST_REQUEST, 'tool.get.request']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onToolCallRequest(event) {
    const {
      tool_name,
      args,
      request_id,
      respond_to,
      correlation_id
    } = event.payload || event;

    const reqId = request_id || crypto.randomUUID();
    const endTimer = this.activity?.timer('tool.call');

    this.activity?.action('tool.call.received', {
      tool_name,
      request_id: reqId,
      has_args: !!args
    });

    this.logger.info('tool.call.request.received', {
      tool_name,
      request_id: reqId,
      has_args: !!args,
      correlation_id
    });

    // REMOVED (migrate-to-event-metrics): this.metrics.increment('tool.call.total');
    // → Counter extracted from events

    const startTime = Date.now();

    try {
      const tool = this.tools.get(tool_name);

      if (!tool) {
        throw new Error(`Tool '${tool_name}' not found`);
      }

      // Validate arguments if enabled
      if (this.config.validationEnabled !== false && tool.schema) {
        const validStartTime = Date.now();
        const validation = this.validateArguments(args || {}, tool.schema);
        // REMOVED: this.metrics.timing('tool.validation.duration', Date.now() - validStartTime);

        if (!validation.valid) {
          this.logger.warn('tool.call.invalid_args', {
            tool_name,
            errors: validation.errors,
            correlation_id
          });

          // REMOVED (migrate-to-event-metrics): this.metrics.increment('tool.call.invalid_args');
    // → Counter extracted from events

          await this.publishCallFailed(
            tool_name,
            reqId,
            'Invalid arguments',
            'invalid_arguments',
            validation.errors,
            respond_to,
            correlation_id
          );

          return;
        }
      }

      // Execute tool with timeout
      const result = await this.executeWithTimeout(
        tool.handler,
        args || {},
        this.config.timeoutMs || 30000
      );

      const duration = Date.now() - startTime;

      // Metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment(EVENTS.TOOL.CALL_SUCCESS);
    // → Counter extracted from events
      // REMOVED: this.metrics.timing('tool.call.duration', duration);

      // Publish success events
      await this.eventBus.publish(EVENTS.TOOL.CALL_SUCCESS, {
        full_name: tool_name,
        request_id: reqId,
        duration,
        has_result: !!result
      }, { correlationId: correlation_id });

      await this.publishCallResponse(
        reqId,
        true,
        result,
        duration,
        null,
        null,
        respond_to,
        correlation_id
      );

      endTimer?.({ success: true, tool_name, duration });
      this.activity?.action('tool.call.success', {
        tool_name,
        request_id: reqId,
        duration,
        has_result: !!result
      });

      this.logger.info(EVENTS.TOOL.CALL_SUCCESS, {
        tool_name,
        duration,
        correlation_id
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      endTimer?.({ success: false, tool_name, error: error.message });
      this.activity?.error('tool.call', error, { tool_name, request_id: reqId, duration });

      this.logger.error('tool.call.error', {
        tool_name,
        error: error.message,
        correlation_id
      });

      const reason = error.message.includes('timeout')
        ? 'timeout'
        : error.message.includes('not found')
        ? 'not_found'
        : 'execution_error';

      // REMOVED (migrate-to-event-metrics): this.metrics.increment(EVENTS.TOOL.CALL_FAILED);
    // → Counter extracted from events

      if (reason === 'timeout') {
        // REMOVED (migrate-to-event-metrics): this.metrics.increment('tool.call.timeout');
    // → Counter extracted from events
      }

      await this.publishCallFailed(
        tool_name,
        reqId,
        error.message,
        reason,
        null,
        respond_to,
        correlation_id
      );
    }
  }

  async onListToolsRequest(event) {
    const { request_id, correlation_id } = event.payload || event;

    this.logger.info('tool.list.request.received', {
      request_id,
      correlation_id
    });

    const tools = this.listTools();

    await this.eventBus.publish(EVENTS.TOOL.LIST_RESPONSE, {
      request_id,
      success: true,
      tools,
      count: tools.length
    }, { correlationId: correlation_id });
  }

  async onGetToolRequest(event) {
    const { tool_name, request_id, correlation_id } = event.payload || event;

    this.logger.info('tool.get.request.received', {
      tool_name,
      request_id,
      correlation_id
    });

    const tool = this.getTool(tool_name);

    if (tool) {
      await this.eventBus.publish('tool.get.response', {
        request_id,
        success: true,
        tool
      }, { correlationId: correlation_id });
    } else {
      await this.eventBus.publish('tool.get.response', {
        request_id,
        success: false,
        error: `Tool '${tool_name}' not found`
      }, { correlationId: correlation_id });
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleListTools(req, context) {
    this.logger.info('tools.list.start', {
      correlation_id: context.correlationId
    });

    const tools = this.listTools();

    this.logger.info('tools.listed', {
      count: tools.length,
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: {
        success: true,
        tools,
        count: tools.length
      }
    };
  }

  async handleGetTool(req, context) {
    const { name } = context.params;

    this.logger.info('tool.get.start', {
      name,
      correlation_id: context.correlationId
    });

    const tool = this.getTool(name);

    if (!tool) {
      this.logger.warn('tool.get.not_found', {
        name,
        correlation_id: context.correlationId
      });

      return {
        status: 404,
        data: {
          success: false,
          error: `Tool '${name}' not found`
        }
      };
    }

    this.logger.info('tool.retrieved', {
      name,
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: {
        success: true,
        tool
      }
    };
  }

  async handleCallTool(req, context) {
    const { name } = context.params;
    const args = context.body || {};
    const startTime = Date.now();

    this.logger.info('tool.call.start', {
      name,
      correlation_id: context.correlationId
    });

    // REMOVED (migrate-to-event-metrics): this.metrics.increment('tool.call.total');
    // → Counter extracted from events

    try {
      const tool = this.tools.get(name);

      if (!tool) {
        // REMOVED (migrate-to-event-metrics): this.metrics.increment(EVENTS.TOOL.CALL_FAILED);
    // → Counter extracted from events
        return {
          status: 404,
          data: {
            success: false,
            error: `Tool '${name}' not found`
          }
        };
      }

      // Validate
      if (this.config.validationEnabled !== false && tool.schema) {
        const validation = this.validateArguments(args, tool.schema);

        if (!validation.valid) {
          // REMOVED (migrate-to-event-metrics): this.metrics.increment('tool.call.invalid_args');
    // → Counter extracted from events
          // REMOVED (migrate-to-event-metrics): this.metrics.increment(EVENTS.TOOL.CALL_FAILED);
    // → Counter extracted from events

          this.logger.warn('tool.call.invalid_args', {
            name,
            errors: validation.errors,
            correlation_id: context.correlationId
          });

          return {
            status: 400,
            data: {
              success: false,
              error: 'Invalid arguments',
              details: validation.errors
            }
          };
        }
      }

      // Execute
      const result = await this.executeWithTimeout(
        tool.handler,
        args,
        this.config.timeoutMs || 30000
      );

      const duration = Date.now() - startTime;

      // Metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment(EVENTS.TOOL.CALL_SUCCESS);
    // → Counter extracted from events
      // REMOVED: this.metrics.timing('tool.call.duration', duration);

      // Publish event
      await this.eventBus.publish(EVENTS.TOOL.CALL_SUCCESS, {
        full_name: name,
        request_id: context.correlationId,
        duration,
        has_result: !!result
      }, { correlationId: context.correlationId });

      this.logger.info('tool.called', {
        name,
        duration,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          result,
          duration
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('tool.call.error', {
        name,
        error: error.message,
        correlation_id: context.correlationId
      });

      const reason = error.message.includes('timeout') ? 'timeout' : 'execution_error';

      // REMOVED (migrate-to-event-metrics): this.metrics.increment(EVENTS.TOOL.CALL_FAILED);
    // → Counter extracted from events

      if (reason === 'timeout') {
        // REMOVED (migrate-to-event-metrics): this.metrics.increment('tool.call.timeout');
    // → Counter extracted from events
      }

      // Publish event
      await this.eventBus.publish(EVENTS.TOOL.CALL_FAILED, {
        full_name: name,
        request_id: context.correlationId,
        error: error.message,
        reason
      }, { correlationId: context.correlationId });

      return {
        status: 500,
        data: {
          success: false,
          error: error.message,
          duration
        }
      };
    }
  }

  async handleRegisterTool(req, context) {
    const { module_name, tool_name, description, schema } = context.body;

    this.logger.info('tool.register.start', {
      module_name,
      tool_name,
      correlation_id: context.correlationId
    });

    try {
      // Note: This registers a placeholder - actual handler must be set via registerTool()
      const fullName = `${module_name}.${tool_name}`;

      this.tools.set(fullName, {
        moduleName: module_name,
        toolName: tool_name,
        description,
        schema,
        handler: null // Placeholder
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('tool.registered.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.gauge('tool.registered.count', this.tools.size);

      // Publish event
      await this.eventBus.publish(EVENTS.TOOL.REGISTERED, {
        full_name: fullName,
        module_name,
        tool_name,
        description,
        has_schema: !!schema,
        registered_at: new Date().toISOString()
      }, { correlationId: context.correlationId });

      this.logger.info(EVENTS.TOOL.REGISTERED, {
        full_name: fullName,
        correlation_id: context.correlationId
      });

      return {
        status: 201,
        data: {
          success: true,
          full_name: fullName,
          message: 'Tool registered successfully'
        }
      };
    } catch (error) {
      this.logger.error('tool.register.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to register tool',
          message: error.message
        }
      };
    }
  }

  async handleUnregisterTool(req, context) {
    const { name } = context.params;

    this.logger.info('tool.unregister.start', {
      name,
      correlation_id: context.correlationId
    });

    if (!this.tools.has(name)) {
      return {
        status: 404,
        data: {
          success: false,
          error: `Tool '${name}' not found`
        }
      };
    }

    this.tools.delete(name);

    // REMOVED (migrate-to-event-metrics): this.metrics.increment('tool.unregistered.total');
    // → Counter extracted from events
    // REMOVED: this.metrics.gauge('tool.registered.count', this.tools.size);

    // Publish event
    await this.eventBus.publish(EVENTS.TOOL.UNREGISTERED, {
      full_name: name,
      unregistered_at: new Date().toISOString()
    }, { correlationId: context.correlationId });

    this.logger.info(EVENTS.TOOL.UNREGISTERED, {
      name,
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: {
        success: true,
        full_name: name,
        message: 'Tool unregistered successfully'
      }
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        registered_tools: this.tools.size,
        validation_enabled: this.config.validationEnabled !== false
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        counters: {
          'tool.registered.total': this.metrics.getCounter('tool.registered.total') || 0,
          'tool.unregistered.total': this.metrics.getCounter('tool.unregistered.total') || 0,
          'tool.call.total': this.metrics.getCounter('tool.call.total') || 0,
          [EVENTS.TOOL.CALL_SUCCESS]: this.metrics.getCounter(EVENTS.TOOL.CALL_SUCCESS) || 0,
          [EVENTS.TOOL.CALL_FAILED]: this.metrics.getCounter(EVENTS.TOOL.CALL_FAILED) || 0,
          'tool.call.timeout': this.metrics.getCounter('tool.call.timeout') || 0,
          'tool.call.invalid_args': this.metrics.getCounter('tool.call.invalid_args') || 0
        },
        gauges: {
          'tool.registered.count': this.tools.size
        }
      }
    };
  }

  // ==========================================
  // Public API for Tool Registration
  // ==========================================

  /**
   * Register a tool programmatically (called by other modules)
   */
  registerTool(moduleName, toolName, description, schema, handler) {
    const fullName = `${moduleName}.${toolName}`;

    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    this.tools.set(fullName, {
      moduleName,
      toolName,
      description,
      schema,
      handler
    });

    this.logger.info('tool.registered.programmatic', {
      full_name: fullName,
      has_schema: !!schema
    });

    // REMOVED (migrate-to-event-metrics): this.metrics.increment('tool.registered.total');
    // → Counter extracted from events
    // REMOVED: this.metrics.gauge('tool.registered.count', this.tools.size);

    // Publish event (async, don't wait)
    this.eventBus.publish(EVENTS.TOOL.REGISTERED, {
      full_name: fullName,
      module_name: moduleName,
      tool_name: toolName,
      description,
      has_schema: !!schema,
      registered_at: new Date().toISOString()
    }).catch(err => {
      this.logger.error('tool.registered.event.error', {
        error: err.message
      });
    });

    return fullName;
  }

  /**
   * Unregister a tool programmatically
   */
  unregisterTool(fullName) {
    if (this.tools.has(fullName)) {
      this.tools.delete(fullName);

      this.logger.info('tool.unregistered.programmatic', {
        full_name: fullName
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('tool.unregistered.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.gauge('tool.registered.count', this.tools.size);

      // Publish event (async, don't wait)
      this.eventBus.publish(EVENTS.TOOL.UNREGISTERED, {
        full_name: fullName,
        unregistered_at: new Date().toISOString()
      }).catch(err => {
        this.logger.error('tool.unregistered.event.error', {
          error: err.message
        });
      });
    }
  }

  // ==========================================
  // Core Logic
  // ==========================================

  validateArguments(args, schema) {
    const validate = this.ajv.compile(schema);
    const valid = validate(args);

    return {
      valid,
      errors: valid ? null : validate.errors
    };
  }

  async executeWithTimeout(handler, args, timeoutMs) {
    return Promise.race([
      handler(args),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs)
      )
    ]);
  }

  getTool(fullName) {
    const tool = this.tools.get(fullName);

    if (!tool) return null;

    // Don't expose handler function
    return {
      full_name: fullName,
      module_name: tool.moduleName,
      tool_name: tool.toolName,
      description: tool.description,
      schema: tool.schema
    };
  }

  listTools() {
    const tools = [];

    for (const [fullName, tool] of this.tools.entries()) {
      tools.push({
        full_name: fullName,
        module_name: tool.moduleName,
        tool_name: tool.toolName,
        description: tool.description,
        schema: tool.schema
      });
    }

    return tools;
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishCallResponse(requestId, success, result, duration, error, details, respondTo, correlationId) {
    const payload = {
      request_id: requestId,
      success,
      result,
      duration,
      error,
      details
    };

    if (respondTo) {
      await this.eventBus.publish(respondTo, payload, { correlationId });
    } else {
      await this.eventBus.publish(EVENTS.TOOL.CALL_RESPONSE, payload, { correlationId });
    }
  }

  async publishCallFailed(toolName, requestId, error, reason, details, respondTo, correlationId) {
    await this.eventBus.publish(EVENTS.TOOL.CALL_FAILED, {
      full_name: toolName,
      request_id: requestId,
      error,
      reason
    }, { correlationId });

    await this.publishCallResponse(
      requestId,
      false,
      null,
      0,
      error,
      details,
      respondTo,
      correlationId
    );
  }
}

module.exports = ToolOrchestratorModule;
