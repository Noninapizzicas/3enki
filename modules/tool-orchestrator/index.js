const crypto = require('crypto');
const Ajv = require('ajv');

class ToolOrchestratorModule {
  constructor(config, { logger, eventBus, metrics }) {
    this.logger = logger.child({ module: 'tool-orchestrator' });
    this.eventBus = eventBus;
    this.metrics = metrics;
    this.config = config;

    // Stores { toolName: { moduleName, toolName, schema, description, executableFunction } }
    this.registeredTools = new Map();

    // Initialize AJV for JSON Schema validation
    this.ajv = new Ajv({ allErrors: true });

    this.unsubscribeToolCallRequest = null;
  }

  async onLoad() {
    this.logger.info('Tool Orchestrator module loaded');

    // Subscribe to tool call requests from AI agents or other modules
    this.unsubscribeToolCallRequest = this.eventBus.subscribe(
      'tool.call.request',
      this.handleToolCallRequest.bind(this)
    );

    this.logger.info('Subscribed to tool.call.request events');
  }

  async onUnload() {
    this.logger.info('Tool Orchestrator module unloading');

    if (this.unsubscribeToolCallRequest) {
      this.unsubscribeToolCallRequest();
    }

    this.registeredTools.clear();
  }

  /**
   * Registers a tool with the orchestrator
   * @param {string} moduleName - The name of the module providing the tool
   * @param {string} toolName - The unique name of the tool
   * @param {object} schema - JSON Schema for the tool's arguments
   * @param {string} description - A description of the tool
   * @param {Function} executableFunction - The actual function to execute
   */
  registerTool(moduleName, toolName, schema, description, executableFunction) {
    const fullToolName = `${moduleName}.${toolName}`;

    if (this.registeredTools.has(fullToolName)) {
      this.logger.warn({ fullToolName }, 'Tool already registered. Overwriting');
    }

    this.registeredTools.set(fullToolName, {
      moduleName,
      toolName,
      schema,
      description,
      executableFunction
    });

    this.logger.info({
      fullToolName,
      hasSchema: !!schema,
      hasFunction: typeof executableFunction === 'function'
    }, 'Tool registered successfully');

    // Publish tool.registered event
    this.eventBus.publish('tool.registered', {
      fullToolName,
      moduleName,
      toolName,
      schema,
      description
    });

    this.metrics.increment('tools.registered.total', 1, { tool: fullToolName });
  }

  /**
   * Unregisters a tool from the orchestrator
   * @param {string} fullToolName - The full name of the tool (e.g., 'github.create_issue')
   */
  unregisterTool(fullToolName) {
    if (this.registeredTools.has(fullToolName)) {
      this.registeredTools.delete(fullToolName);
      this.logger.info({ fullToolName }, 'Tool unregistered successfully');

      this.eventBus.publish('tool.unregistered', { fullToolName });
      this.metrics.decrement('tools.registered.total', 1, { tool: fullToolName });
    } else {
      this.logger.warn({ fullToolName }, 'Attempted to unregister a tool that was not registered');
    }
  }

  /**
   * Handles incoming tool call requests
   * @param {object} event - The event payload
   * @param {string} topic - The event topic
   */
  async handleToolCallRequest(event, topic) {
    const { toolName, args, requesterRespondToTopic, requestId } = event;
    const reqId = requestId || crypto.randomUUID();

    this.metrics.increment('tool.call.requests.total', 1, { tool: toolName });

    this.logger.info({
      toolName,
      args,
      requestId: reqId,
      hasRespondTopic: !!requesterRespondToTopic
    }, 'Received tool call request');

    const registeredTool = this.registeredTools.get(toolName);

    // Tool not found
    if (!registeredTool) {
      const errorMessage = `Tool '${toolName}' not found or not registered`;
      this.logger.warn({ toolName }, errorMessage);

      this.publishResponse(requesterRespondToTopic, {
        success: false,
        error: errorMessage,
        requestId: reqId
      });

      this.metrics.increment('tool.call.failed.total', 1, {
        tool: toolName,
        reason: 'not_found'
      });
      return;
    }

    // Validate arguments if validation is enabled
    if (this.config.validation_enabled !== false && registeredTool.schema) {
      const validationResult = this.validateArguments(toolName, args, registeredTool.schema);

      if (!validationResult.valid) {
        this.logger.warn({
          toolName,
          errors: validationResult.errors
        }, 'Invalid arguments for tool');

        this.publishResponse(requesterRespondToTopic, {
          success: false,
          error: 'Invalid arguments for tool',
          details: validationResult.errors,
          requestId: reqId
        });

        this.metrics.increment('tool.call.failed.total', 1, {
          tool: toolName,
          reason: 'invalid_arguments'
        });
        return;
      }
    }

    // Execute the tool
    try {
      const startTime = Date.now();

      this.logger.debug({ toolName, args }, 'Executing tool');

      const result = await this.executeWithTimeout(
        registeredTool.executableFunction,
        args,
        this.config.timeout_ms || 30000
      );

      const duration = Date.now() - startTime;

      this.logger.info({
        toolName,
        duration,
        hasResult: !!result
      }, 'Tool execution successful');

      this.publishResponse(requesterRespondToTopic, {
        success: true,
        result,
        requestId: reqId,
        duration
      });

      this.metrics.increment('tool.call.success.total', 1, { tool: toolName });
      this.metrics.histogram('tool.call.duration.ms', duration, { tool: toolName });

    } catch (error) {
      this.logger.error({
        toolName,
        error: error.message,
        stack: error.stack
      }, 'Tool execution failed');

      this.publishResponse(requesterRespondToTopic, {
        success: false,
        error: error.message,
        requestId: reqId
      });

      this.metrics.increment('tool.call.failed.total', 1, {
        tool: toolName,
        reason: 'execution_error'
      });
    }
  }

  /**
   * Validates arguments against JSON Schema
   * @param {string} toolName - Name of the tool
   * @param {object} args - Arguments to validate
   * @param {object} schema - JSON Schema
   * @returns {object} - { valid: boolean, errors: array }
   */
  validateArguments(toolName, args, schema) {
    const validate = this.ajv.compile(schema);
    const valid = validate(args || {});

    return {
      valid,
      errors: valid ? null : validate.errors
    };
  }

  /**
   * Executes a function with timeout
   * @param {Function} fn - Function to execute
   * @param {object} args - Arguments to pass
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise} - Result of the function
   */
  async executeWithTimeout(fn, args, timeoutMs) {
    return Promise.race([
      fn(args),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs)
      )
    ]);
  }

  /**
   * Publishes a response to the requester
   * @param {string} respondToTopic - Topic to respond to
   * @param {object} payload - Response payload
   */
  publishResponse(respondToTopic, payload) {
    if (respondToTopic) {
      this.eventBus.publish(respondToTopic, payload);
    } else {
      // Fallback to generic response topic
      this.eventBus.publish('tool.call.response', payload);
    }
  }

  /**
   * Gets a registered tool
   * @param {string} fullToolName - Full name of the tool
   * @returns {object | undefined} - Tool definition
   */
  getTool(fullToolName) {
    const tool = this.registeredTools.get(fullToolName);
    if (!tool) return undefined;

    // Return tool without exposing the executable function
    return {
      moduleName: tool.moduleName,
      toolName: tool.toolName,
      schema: tool.schema,
      description: tool.description
    };
  }

  /**
   * Lists all registered tools
   * @returns {array} - Array of tool definitions
   */
  listTools() {
    const tools = [];
    for (const [fullToolName, tool] of this.registeredTools.entries()) {
      tools.push({
        fullToolName,
        moduleName: tool.moduleName,
        toolName: tool.toolName,
        schema: tool.schema,
        description: tool.description
      });
    }
    return tools;
  }

  // ========================================================================
  // HTTP API Handlers
  // ========================================================================

  /**
   * GET /tools - List all registered tools
   */
  async handleListTools(req, res) {
    const tools = this.listTools();

    res.json({
      success: true,
      count: tools.length,
      tools
    });
  }

  /**
   * GET /tool/:name - Get details about a specific tool
   */
  async handleGetTool(req, res) {
    const toolName = req.params.name;
    const tool = this.getTool(toolName);

    if (!tool) {
      return res.status(404).json({
        success: false,
        error: `Tool '${toolName}' not found`
      });
    }

    res.json({
      success: true,
      tool
    });
  }

  /**
   * POST /tool/:name/call - Directly call a tool via HTTP
   */
  async handleCallTool(req, res) {
    const toolName = req.params.name;
    const args = req.body || {};
    const requestId = crypto.randomUUID();

    this.logger.info({ toolName, args, requestId }, 'HTTP tool call request');

    // Create a promise to wait for the response
    const responsePromise = new Promise((resolve) => {
      const responseTopic = `tool.call.response.${requestId}`;

      const unsubscribe = this.eventBus.subscribe(responseTopic, (responseEvent) => {
        unsubscribe();
        resolve(responseEvent);
      });

      // Set timeout
      setTimeout(() => {
        unsubscribe();
        resolve({
          success: false,
          error: 'Request timeout'
        });
      }, this.config.timeout_ms || 30000);
    });

    // Trigger tool call via event
    this.eventBus.publish('tool.call.request', {
      toolName,
      args,
      requesterRespondToTopic: `tool.call.response.${requestId}`,
      requestId
    });

    // Wait for response
    const response = await responsePromise;

    if (response.success) {
      res.json(response);
    } else {
      res.status(400).json(response);
    }
  }
}

module.exports = ToolOrchestratorModule;
