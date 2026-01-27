const http = require('http');

/**
 * Tool Manager
 *
 * Gestiona tools (APIs) que los agentes pueden llamar
 * Soporta:
 * - Built-in tools (http_request, publish_event, read_file, write_file)
 * - Plugin tools via Tool Orchestrator (github.*, slack.*, weather.*, etc.)
 */
class ToolManager {
  constructor(config, logger, coreConfig, eventBus = null) {
    this.config = config;
    this.logger = logger;
    this.coreConfig = coreConfig;
    this.eventBus = eventBus;

    // Available tools: Map<toolName, toolSpec>
    this.tools = new Map();

    // Provider registry reference (injected)
    this.providerRegistry = null;
  }

  /**
   * Initialize tool manager
   */
  async initialize() {
    // Register built-in tools
    this.registerBuiltinTools();

    // Auto-register provider tools if registry available
    if (this.providerRegistry) {
      this.registerProviderTools();
    }

    this.logger.info('tool-manager.initialized', {
      tools_count: this.tools.size,
      plugin_tools_enabled: !!this.eventBus
    });
  }

  /**
   * Set provider registry for auto-discovery
   */
  setProviderRegistry(registry) {
    this.providerRegistry = registry;
  }

  /**
   * Auto-register providers as AI tools
   * Converts provider functions to tool definitions
   */
  registerProviderTools() {
    if (!this.providerRegistry) {
      this.logger.warn('tool-manager.provider-registry.not-available');
      return;
    }

    const stats = this.providerRegistry.getStats();
    this.logger.info('tool-manager.registering-provider-tools', {
      providers: stats.total_providers,
      functions: stats.total_functions
    });

    // Get all providers info from registry (returns an Array)
    const providersInfo = this.providerRegistry.getAll();

    for (const providerInfo of providersInfo) {
      // Skip if provider not available (missing credentials)
      if (!providerInfo.available) {
        this.logger.debug('tool-manager.provider.skipped', {
          provider: providerInfo.name,
          reason: 'not available'
        });
        continue;
      }

      // Get full provider data with function definitions
      const provider = this.providerRegistry.get(providerInfo.name);
      if (!provider || !provider.functions) {
        this.logger.debug('tool-manager.provider.skipped', {
          provider: providerInfo.name,
          reason: 'no functions defined'
        });
        continue;
      }

      // Register each function as a tool
      for (const [fnName, fnDef] of Object.entries(provider.functions)) {
        const toolName = this.buildToolName(providerInfo.name, fnName);
        const eventName = fnDef.event || `${providerInfo.name}.${fnName}.request`;

        // Build parameters schema from function input definition
        const parameters = this.buildParametersSchema(fnDef.input);

        this.registerTool({
          name: toolName,
          description: fnDef.description || `${providerInfo.name} ${fnName}`,
          parameters,
          // Event-driven handler
          handler: this.createProviderToolHandler(eventName, providerInfo.name, fnName)
        });

        this.logger.debug('tool-manager.provider-tool.registered', {
          tool: toolName,
          event: eventName
        });
      }
    }

    this.logger.info('tool-manager.provider-tools.registered', {
      count: this.tools.size
    });
  }

  /**
   * Build tool name from provider and function
   */
  buildToolName(providerName, fnName) {
    // local.google-vision + extract -> google_vision_extract
    // gmail + send -> gmail_send
    const cleanProvider = providerName
      .replace('local.', '')
      .replace(/-/g, '_');
    return `${cleanProvider}_${fnName}`;
  }

  /**
   * Build OpenAI-compatible parameters schema
   */
  buildParametersSchema(input) {
    if (!input) {
      return {
        type: 'object',
        properties: {},
        required: []
      };
    }

    const properties = {};
    const required = [];

    for (const [paramName, paramDef] of Object.entries(input)) {
      if (typeof paramDef === 'object') {
        properties[paramName] = {
          type: paramDef.type || 'string',
          description: paramDef.description || paramName
        };
        if (paramDef.required) {
          required.push(paramName);
        }
      } else {
        // Simple string definition like "base64 | path - Documento"
        properties[paramName] = {
          type: 'string',
          description: String(paramDef)
        };
      }
    }

    return {
      type: 'object',
      properties,
      required
    };
  }

  /**
   * Create event-driven handler for provider tool
   */
  createProviderToolHandler(eventName, providerName, fnName) {
    return async (args) => {
      if (!this.eventBus) {
        return { success: false, error: 'EventBus not available' };
      }

      const crypto = require('crypto');
      const request_id = crypto.randomUUID();
      const responseEvent = eventName.replace('.request', '.response');

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.eventBus.off(responseEvent, handler);
          resolve({
            success: false,
            error: `${providerName}.${fnName} timeout`
          });
        }, this.config.timeout_ms || 30000);

        const handler = (event) => {
          const data = event?.data || event;
          if (data.request_id === request_id) {
            clearTimeout(timeout);
            this.eventBus.off(responseEvent, handler);

            this.logger.info('tool-manager.provider-tool.executed', {
              tool: `${providerName}.${fnName}`,
              success: data.success
            });

            resolve(data);
          }
        };

        this.eventBus.on(responseEvent, handler);

        // Publish request with args
        this.eventBus.publish(eventName, {
          request_id,
          ...args
        });
      });
    };
  }

  /**
   * Register built-in tools
   */
  registerBuiltinTools() {
    // HTTP Request tool
    this.registerTool({
      name: 'http_request',
      description: 'Make HTTP request to any API',
      parameters: {
        method: { type: 'string', required: true },
        url: { type: 'string', required: true },
        body: { type: 'object', required: false },
        headers: { type: 'object', required: false }
      },
      handler: this.httpRequestTool.bind(this)
    });

    // Publish Event tool
    this.registerTool({
      name: 'publish_event',
      description: 'Publish event to MQTT bus',
      parameters: {
        event_type: { type: 'string', required: true },
        payload: { type: 'object', required: true }
      },
      handler: this.publishEventTool.bind(this)
    });

    // Read File tool
    this.registerTool({
      name: 'read_file',
      description: 'Read file contents',
      parameters: {
        path: { type: 'string', required: true }
      },
      handler: this.readFileTool.bind(this)
    });

    // Write File tool
    this.registerTool({
      name: 'write_file',
      description: 'Write file contents',
      parameters: {
        path: { type: 'string', required: true },
        content: { type: 'string', required: true }
      },
      handler: this.writeFileTool.bind(this)
    });

    // ============ AGENT ARCHITECT TOOLS ============

    // Create Prompt tool
    this.registerTool({
      name: 'create_prompt',
      description: 'Create a new prompt in prompt-manager for agent configuration',
      parameters: {
        name: { type: 'string', required: true },
        content: { type: 'string', required: true },
        slot_type: { type: 'string', required: false },
        description: { type: 'string', required: false },
        tags: { type: 'array', required: false }
      },
      handler: this.createPromptTool.bind(this)
    });

    // Create Agent tool
    this.registerTool({
      name: 'create_agent',
      description: 'Create a new AI agent in the agent framework',
      parameters: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: false },
        prompt_id: { type: 'string', required: true },
        subscribes: { type: 'array', required: true },
        tools: { type: 'array', required: false },
        provider: { type: 'string', required: false },
        model: { type: 'string', required: false },
        temperature: { type: 'number', required: false },
        enabled: { type: 'boolean', required: false }
      },
      handler: this.createAgentTool.bind(this)
    });

    // List Agents tool
    this.registerTool({
      name: 'list_agents',
      description: 'List all registered agents in the framework',
      parameters: {
        enabled_only: { type: 'boolean', required: false }
      },
      handler: this.listAgentsTool.bind(this)
    });

    // ============ TELEGRAM TOOLS ============
    // Wrappers that call telegram-service via HTTP API

    this.registerTool({
      name: 'telegram_send_message',
      description: 'Send text message to Telegram chat',
      parameters: {
        type: 'object',
        properties: {
          botName: { type: 'string', description: 'Bot name (e.g., facturas_asesoria_bot)' },
          chatId: { type: 'number', description: 'Telegram chat ID' },
          text: { type: 'string', description: 'Message text' },
          parseMode: { type: 'string', description: 'Parse mode: HTML or Markdown' }
        },
        required: ['botName', 'chatId', 'text']
      },
      handler: this.telegramSendMessageTool.bind(this)
    });

    this.registerTool({
      name: 'telegram_get_file',
      description: 'Get file info and optionally download from Telegram',
      parameters: {
        type: 'object',
        properties: {
          botName: { type: 'string', description: 'Bot name' },
          fileId: { type: 'string', description: 'Telegram file ID' },
          download: { type: 'boolean', description: 'Download file to storage' }
        },
        required: ['botName', 'fileId']
      },
      handler: this.telegramGetFileTool.bind(this)
    });

    // ============ FILESYSTEM TOOLS ============

    this.registerTool({
      name: 'fs_copy',
      description: 'Copy file from source to destination',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source file path' },
          destination: { type: 'string', description: 'Destination file path' }
        },
        required: ['source', 'destination']
      },
      handler: this.fsCopyTool.bind(this)
    });

    this.registerTool({
      name: 'fs_write',
      description: 'Write content to file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'File content' }
        },
        required: ['path', 'content']
      },
      handler: this.writeFileTool.bind(this)  // Reuse existing write_file
    });

    // ============ DATABASE TOOLS ============

    this.registerTool({
      name: 'db_execute',
      description: 'Execute SQL query on project database',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID (or "system")' },
          query: { type: 'string', description: 'SQL query to execute' },
          params: { type: 'array', description: 'Query parameters' }
        },
        required: ['project_id', 'query']
      },
      handler: this.dbExecuteTool.bind(this)
    });

    // ============ FLOW ENGINE TOOLS ============

    this.registerTool({
      name: 'flow_list',
      description: 'List all available flows, optionally filtered by project',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Filter by project ID (optional)' }
        },
        required: []
      },
      handler: this.flowListTool.bind(this)
    });

    this.registerTool({
      name: 'flow_trigger',
      description: 'Trigger/execute a flow manually with optional input data',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string', description: 'Flow ID to trigger (e.g., "mi-proyecto:procesar-factura")' },
          data: { type: 'object', description: 'Input data for the flow trigger' }
        },
        required: ['flow_id']
      },
      handler: this.flowTriggerTool.bind(this)
    });

    this.registerTool({
      name: 'flow_status',
      description: 'Get status of flow executions',
      parameters: {
        type: 'object',
        properties: {
          execution_id: { type: 'string', description: 'Specific execution ID (optional)' },
          flow_id: { type: 'string', description: 'Filter by flow ID (optional)' }
        },
        required: []
      },
      handler: this.flowStatusTool.bind(this)
    });

    // ============ PROJECT CONFIG TOOLS ============

    this.registerTool({
      name: 'project_config_get',
      description: 'Get project configuration',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          config_file: { type: 'string', description: 'Config file name (default: main config)' }
        },
        required: ['project_id']
      },
      handler: this.projectConfigGetTool.bind(this)
    });

    this.registerTool({
      name: 'project_config_update',
      description: 'Update project configuration (e.g., change schedule, enable/disable features)',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          config_file: { type: 'string', description: 'Config file name' },
          updates: { type: 'object', description: 'Key-value pairs to update (supports dot notation like "schedule.gmail")' }
        },
        required: ['project_id', 'updates']
      },
      handler: this.projectConfigUpdateTool.bind(this)
    });

    // ============ FACTURAS TOOLS ============

    this.registerTool({
      name: 'facturas_list',
      description: 'List invoices/facturas from a project database',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID (e.g., "mi-proyecto")' },
          status: { type: 'string', description: 'Filter by status: pendiente, procesada, exportada, error' },
          limit: { type: 'number', description: 'Max results (default: 50)' }
        },
        required: ['project_id']
      },
      handler: this.facturasListTool.bind(this)
    });

    this.registerTool({
      name: 'facturas_process',
      description: 'Process pending invoices with OCR',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          factura_id: { type: 'number', description: 'Specific invoice ID (optional, processes all pending if omitted)' }
        },
        required: ['project_id']
      },
      handler: this.facturasProcessTool.bind(this)
    });

    this.registerTool({
      name: 'facturas_export',
      description: 'Export processed invoices to Excel',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          format: { type: 'string', description: 'Export format: libro-registro, resumen (default: libro-registro)' }
        },
        required: ['project_id']
      },
      handler: this.facturasExportTool.bind(this)
    });
  }

  /**
   * Register a new tool
   */
  registerTool(toolSpec) {
    if (!toolSpec.name || !toolSpec.handler) {
      throw new Error('Tool must have name and handler');
    }

    this.tools.set(toolSpec.name, toolSpec);

    this.logger.debug('tool-manager.tool.registered', {
      tool: toolSpec.name
    });
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName) {
    this.tools.delete(toolName);
  }

  /**
   * Get tool spec
   */
  getTool(toolName) {
    return this.tools.get(toolName);
  }

  /**
   * List all tools
   */
  listTools() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }

  /**
   * Execute tool
   * Supports both built-in tools and plugin tools via Tool Orchestrator
   */
  async executeTool(toolName, args, allowedTools = []) {
    // Check if agent is allowed to use this tool
    if (allowedTools.length > 0 && !allowedTools.includes(toolName)) {
      throw new Error(`Tool '${toolName}' not allowed for this agent`);
    }

    // Check if tool exists locally (built-in)
    const tool = this.tools.get(toolName);

    if (tool) {
      // Execute built-in tool
      this.logger.debug('tool-manager.executing.builtin', { tool: toolName });

      // Validate parameters
      this.validateParameters(tool, args);

      // Execute with timeout
      const timeout = this.config.timeout_ms || 10000;

      const result = await Promise.race([
        tool.handler(args),
        this.timeoutPromise(timeout)
      ]);

      this.logger.info('tool-manager.tool.executed', {
        tool: toolName,
        type: 'builtin',
        args
      });

      return result;
    }

    // If not built-in, try calling via Tool Orchestrator (plugin tool)
    if (this.eventBus) {
      this.logger.debug('tool-manager.executing.plugin', { tool: toolName });
      return this.executePluginTool(toolName, args);
    }

    // Tool not found
    throw new Error(`Tool '${toolName}' not found (neither built-in nor plugin)`);
  }

  /**
   * Execute a plugin tool via Tool Orchestrator
   */
  async executePluginTool(toolName, args) {
    const crypto = require('crypto');
    const requestId = crypto.randomUUID();
    const responseTopic = `tool.call.response.${requestId}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.eventBus.unsubscribe(responseTopic);
        reject(new Error(`Plugin tool '${toolName}' execution timeout`));
      }, this.config.timeout_ms || 30000);

      // Subscribe to response
      this.eventBus.subscribe(responseTopic, (response) => {
        clearTimeout(timeout);
        this.eventBus.unsubscribe(responseTopic);

        if (response.success) {
          this.logger.info('tool-manager.tool.executed', {
            tool: toolName,
            type: 'plugin',
            duration: response.duration
          });
          resolve(response.result);
        } else {
          this.logger.error('tool-manager.tool.failed', {
            tool: toolName,
            error: response.error
          });
          reject(new Error(response.error || `Plugin tool '${toolName}' failed`));
        }
      });

      // Publish request to Tool Orchestrator
      this.eventBus.publish('tool.call.request', {
        toolName,
        args,
        requesterRespondToTopic: responseTopic,
        requestId
      });
    });
  }

  /**
   * Validate tool parameters
   */
  validateParameters(tool, args) {
    for (const [paramName, paramSpec] of Object.entries(tool.parameters || {})) {
      if (paramSpec.required && !(paramName in args)) {
        throw new Error(`Missing required parameter '${paramName}' for tool '${tool.name}'`);
      }

      if (paramName in args) {
        const value = args[paramName];
        const expectedType = paramSpec.type;

        if (expectedType === 'string' && typeof value !== 'string') {
          throw new Error(`Parameter '${paramName}' must be string`);
        }

        if (expectedType === 'number' && typeof value !== 'number') {
          throw new Error(`Parameter '${paramName}' must be number`);
        }

        if (expectedType === 'boolean' && typeof value !== 'boolean') {
          throw new Error(`Parameter '${paramName}' must be boolean`);
        }

        if (expectedType === 'object' && typeof value !== 'object') {
          throw new Error(`Parameter '${paramName}' must be object`);
        }

        if (expectedType === 'array' && !Array.isArray(value)) {
          throw new Error(`Parameter '${paramName}' must be array`);
        }
      }
    }
  }

  /**
   * Timeout promise
   */
  timeoutPromise(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Tool execution timeout')), ms);
    });
  }

  // ============ BUILT-IN TOOLS ============

  /**
   * Tool: HTTP Request
   */
  async httpRequestTool(args) {
    const { method, url, body, headers } = args;

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const options = {
        method,
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname + urlObj.search,
        headers: headers || {}
      };

      const req = http.request(options, (res) => {
        let responseBody = '';

        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            resolve(parsed);
          } catch {
            resolve(responseBody);
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Tool: Publish Event
   */
  async publishEventTool(args) {
    const { event_type, payload } = args;

    // Access eventBus (must be injected)
    if (!this.eventBus) {
      throw new Error('EventBus not available');
    }

    await this.eventBus.publish(event_type, payload);

    return { success: true, event_type };
  }

  /**
   * Tool: Read File (event-driven)
   * Uses filesystem module for validation and project context
   */
  async readFileTool(args) {
    const { path } = args;

    if (!this.eventBus) {
      return { success: false, error: 'EventBus not available' };
    }

    const crypto = require('crypto');
    const request_id = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Filesystem read timeout' });
      }, 10000);

      const handler = (event) => {
        const data = event?.data || event;
        if (data.request_id === request_id) {
          clearTimeout(timeout);
          this.eventBus.off('fs.read.response', handler);
          resolve(data);
        }
      };

      this.eventBus.on('fs.read.response', handler);

      this.eventBus.publish('fs.read.request', {
        request_id,
        path
      });
    });
  }

  /**
   * Tool: Write File (event-driven)
   * Uses filesystem module for validation and project context
   */
  async writeFileTool(args) {
    const { path, content, encoding } = args;

    if (!this.eventBus) {
      return { success: false, error: 'EventBus not available' };
    }

    const crypto = require('crypto');
    const request_id = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Filesystem write timeout' });
      }, 10000);

      const handler = (event) => {
        const data = event?.data || event;
        if (data.request_id === request_id) {
          clearTimeout(timeout);
          this.eventBus.off('fs.write.response', handler);
          resolve(data);
        }
      };

      this.eventBus.on('fs.write.response', handler);

      this.eventBus.publish('fs.write.request', {
        request_id,
        path,
        content,
        encoding
      });
    });
  }

  // ============ AGENT ARCHITECT TOOLS ============

  /**
   * Tool: Create Prompt
   * Creates a new prompt in prompt-manager
   */
  async createPromptTool(args) {
    const { name, content, slot_type = 'system', description = '', tags = [] } = args;

    const port = this.coreConfig?.http?.port || 3000;
    const url = `http://localhost:${port}/modules/prompt-manager/prompts`;

    const body = {
      name,
      content,
      slot_type,
      description: description || `Prompt for agent: ${name}`,
      tags: Array.isArray(tags) ? tags : []
    };

    try {
      const response = await this.httpRequestTool({
        method: 'POST',
        url,
        body,
        headers: { 'Content-Type': 'application/json' }
      });

      this.logger.info('tool-manager.create_prompt.success', {
        prompt_name: name,
        prompt_id: response?.prompt?.id || response?.id
      });

      return {
        success: true,
        prompt_id: response?.prompt?.id || response?.id,
        prompt_name: name,
        message: `Prompt '${name}' created successfully`
      };
    } catch (error) {
      this.logger.error('tool-manager.create_prompt.failed', {
        prompt_name: name,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: `Failed to create prompt '${name}': ${error.message}`
      };
    }
  }

  /**
   * Tool: Create Agent
   * Creates a new agent in ai-agent-framework
   */
  async createAgentTool(args) {
    const {
      name,
      description = '',
      prompt_id,
      subscribes,
      tools = ['http_request'],
      provider = 'deepseek',
      model = 'deepseek-chat',
      temperature = 0.3,
      enabled = true
    } = args;

    const port = this.coreConfig?.http?.port || 3000;
    const url = `http://localhost:${port}/modules/ai-agent-framework/agents`;

    const body = {
      name,
      description: description || `Agent: ${name}`,
      prompt_id,
      subscribes: Array.isArray(subscribes) ? subscribes : [subscribes],
      tools: Array.isArray(tools) ? tools : [tools],
      provider,
      model,
      temperature,
      max_tokens: 2000,
      context_enabled: true,
      context_window: 10,
      enabled
    };

    try {
      const response = await this.httpRequestTool({
        method: 'POST',
        url,
        body,
        headers: { 'Content-Type': 'application/json' }
      });

      this.logger.info('tool-manager.create_agent.success', {
        agent_name: name,
        agent_id: response?.agent?.id || response?.id,
        subscribes
      });

      return {
        success: true,
        agent_id: response?.agent?.id || response?.id,
        agent_name: name,
        subscribes,
        message: `Agent '${name}' created successfully, listening to: ${subscribes.join(', ')}`
      };
    } catch (error) {
      this.logger.error('tool-manager.create_agent.failed', {
        agent_name: name,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        message: `Failed to create agent '${name}': ${error.message}`
      };
    }
  }

  /**
   * Tool: List Agents
   * Lists all registered agents
   */
  async listAgentsTool(args) {
    const { enabled_only = false } = args || {};

    const port = this.coreConfig?.http?.port || 3000;
    const url = `http://localhost:${port}/modules/ai-agent-framework/agents`;

    try {
      const response = await this.httpRequestTool({
        method: 'GET',
        url,
        headers: { 'Content-Type': 'application/json' }
      });

      let agents = response?.agents || [];

      if (enabled_only) {
        agents = agents.filter(a => a.enabled);
      }

      return {
        success: true,
        count: agents.length,
        agents: agents.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          enabled: a.enabled,
          subscribes: a.subscribes,
          provider: a.provider
        }))
      };
    } catch (error) {
      this.logger.error('tool-manager.list_agents.failed', {
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        agents: []
      };
    }
  }

  // ============ TELEGRAM TOOL HANDLERS ============
  // These tools publish events - telegram-service listens and responds

  /**
   * Tool: Telegram Send Message (event-driven)
   */
  async telegramSendMessageTool(args) {
    const { botName, chatId, text, parseMode } = args;

    if (!this.eventBus) {
      return { success: false, error: 'EventBus not available' };
    }

    const crypto = require('crypto');
    const request_id = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Telegram send message timeout' });
      }, 10000);

      // Listen for response
      const handler = (event) => {
        const data = event?.data || event;
        if (data.request_id === request_id) {
          clearTimeout(timeout);
          this.eventBus.off('telegram.send_message.response', handler);

          this.logger.info('tool-manager.telegram.send_message.success', {
            botName, chatId, messageId: data.messageId
          });

          resolve({
            success: data.success,
            message_id: data.messageId,
            chat_id: chatId,
            error: data.error
          });
        }
      };

      this.eventBus.on('telegram.send_message.response', handler);

      // Publish request
      this.eventBus.publish('telegram.send_message.request', {
        request_id,
        botName,
        chatId,
        text,
        parseMode
      });
    });
  }

  /**
   * Tool: Telegram Get File (event-driven)
   */
  async telegramGetFileTool(args) {
    const { botName, fileId, download = true } = args;

    if (!this.eventBus) {
      return { success: false, error: 'EventBus not available' };
    }

    const crypto = require('crypto');
    const request_id = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Telegram get file timeout' });
      }, 30000); // More time for file downloads

      // Listen for response
      const handler = (event) => {
        const data = event?.data || event;
        if (data.request_id === request_id) {
          clearTimeout(timeout);
          this.eventBus.off('telegram.get_file.response', handler);

          this.logger.info('tool-manager.telegram.get_file.success', {
            botName, fileId, localPath: data.localPath
          });

          resolve({
            success: data.success,
            file_path: data.localPath || data.filePath,
            file_size: data.fileSize,
            file_id: fileId,
            download_url: data.downloadUrl,
            error: data.error
          });
        }
      };

      this.eventBus.on('telegram.get_file.response', handler);

      // Publish request
      this.eventBus.publish('telegram.get_file.request', {
        request_id,
        botName,
        fileId,
        download
      });
    });
  }

  // ============ FILESYSTEM TOOL HANDLERS ============
  // These tools publish events - filesystem module listens and responds

  /**
   * Tool: Copy File (event-driven)
   */
  async fsCopyTool(args) {
    const { source, destination } = args;

    if (!this.eventBus) {
      return { success: false, error: 'EventBus not available' };
    }

    const crypto = require('crypto');
    const request_id = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Filesystem copy timeout' });
      }, 10000);

      const handler = (event) => {
        const data = event?.data || event;
        if (data.request_id === request_id) {
          clearTimeout(timeout);
          this.eventBus.off('fs.copy.response', handler);
          resolve(data);
        }
      };

      this.eventBus.on('fs.copy.response', handler);

      this.eventBus.publish('fs.copy.request', {
        request_id,
        source,
        destination
      });
    });
  }

  // ============ DATABASE TOOL HANDLERS ============

  /**
   * Tool: Execute SQL
   */
  async dbExecuteTool(args) {
    const { project_id, query, params = [] } = args;

    if (!this.eventBus) {
      return { success: false, error: 'EventBus not available' };
    }

    const crypto = require('crypto');
    const requestId = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Database query timeout' });
      }, 10000);

      // One-time listener for response
      const handler = (event) => {
        const data = event.data || event;
        if (data.request_id === requestId) {
          clearTimeout(timeout);
          this.eventBus.off('db.query.response', handler);

          if (data.success) {
            this.logger.info('tool-manager.db.execute.success', {
              project_id, rows: data.data?.length || 0
            });
            resolve({
              success: true,
              data: data.data,
              changes: data.changes
            });
          } else {
            this.logger.error('tool-manager.db.execute.failed', {
              error: data.error
            });
            resolve({
              success: false,
              error: data.error
            });
          }
        }
      };

      this.eventBus.on('db.query.response', handler);

      // Publish query request
      this.eventBus.publish('db.query.request', {
        project_id,
        query,
        params,
        request_id: requestId
      });
    });
  }

  // ============ FLOW ENGINE TOOL HANDLERS ============

  /**
   * Tool: List Flows
   */
  async flowListTool(args) {
    const { project_id } = args || {};

    const port = this.coreConfig?.http?.port || 3000;
    let url = `http://localhost:${port}/api/flow-engine/flows`;
    if (project_id) {
      url += `?project=${project_id}`;
    }

    try {
      const response = await this.httpRequestTool({
        method: 'GET',
        url,
        headers: { 'Content-Type': 'application/json' }
      });

      const flows = response?.flows || [];

      return {
        success: true,
        count: flows.length,
        flows: flows.map(f => ({
          id: f.id,
          name: f.name,
          project: f.projectId,
          enabled: f.enabled,
          trigger: f.trigger?.event || f.trigger?.type
        }))
      };
    } catch (error) {
      return { success: false, error: error.message, flows: [] };
    }
  }

  /**
   * Tool: Trigger Flow
   */
  async flowTriggerTool(args) {
    const { flow_id, data = {} } = args;

    if (!this.eventBus) {
      return { success: false, error: 'EventBus not available' };
    }

    const crypto = require('crypto');
    const requestId = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          success: true,
          message: `Flow ${flow_id} triggered (async)`,
          execution_id: requestId
        });
      }, 5000);

      const handler = (event) => {
        const eventData = event?.data || event;
        if (eventData.triggerId === requestId || eventData.flowId === flow_id) {
          clearTimeout(timeout);
          this.eventBus.off('flow.started', handler);

          this.logger.info('tool-manager.flow.triggered', {
            flow_id,
            execution_id: eventData.executionId
          });

          resolve({
            success: true,
            flow_id,
            execution_id: eventData.executionId,
            message: `Flow ${flow_id} started`
          });
        }
      };

      this.eventBus.on('flow.started', handler);

      this.eventBus.publish('flow.trigger', {
        flowId: flow_id,
        triggerId: requestId,
        data
      });
    });
  }

  /**
   * Tool: Flow Status
   */
  async flowStatusTool(args) {
    const { execution_id, flow_id } = args || {};

    const port = this.coreConfig?.http?.port || 3000;
    let url = `http://localhost:${port}/api/flow-engine/executions`;
    if (execution_id) {
      url = `http://localhost:${port}/api/flow-engine/executions/${execution_id}`;
    }

    try {
      const response = await this.httpRequestTool({
        method: 'GET',
        url,
        headers: { 'Content-Type': 'application/json' }
      });

      let executions = response?.executions || (response?.execution ? [response.execution] : []);

      if (flow_id && !execution_id) {
        executions = executions.filter(e => e.flowId === flow_id);
      }

      return {
        success: true,
        count: executions.length,
        executions: executions.map(e => ({
          id: e.id,
          flow_id: e.flowId,
          status: e.status,
          started: e.startedAt,
          completed: e.completedAt,
          current_step: e.currentStep
        }))
      };
    } catch (error) {
      return { success: false, error: error.message, executions: [] };
    }
  }

  // ============ PROJECT CONFIG TOOL HANDLERS ============

  /**
   * Tool: Get Project Config
   */
  async projectConfigGetTool(args) {
    const { project_id, config_file } = args;

    const fs = require('fs').promises;
    const path = require('path');

    const configDir = path.join(process.cwd(), 'data', 'projects', project_id, 'config');
    const configFileName = config_file || `${project_id.split('-').pop()}.json`;
    const configPath = path.join(configDir, configFileName);

    try {
      // Try specific config file first
      let content;
      try {
        content = await fs.readFile(configPath, 'utf-8');
      } catch {
        // Fallback: find any .json in config dir
        const files = await fs.readdir(configDir);
        const jsonFile = files.find(f => f.endsWith('.json'));
        if (jsonFile) {
          content = await fs.readFile(path.join(configDir, jsonFile), 'utf-8');
        } else {
          return { success: false, error: 'No config file found' };
        }
      }

      const config = JSON.parse(content);

      return {
        success: true,
        project_id,
        config
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Tool: Update Project Config
   */
  async projectConfigUpdateTool(args) {
    const { project_id, config_file, updates } = args;

    const fs = require('fs').promises;
    const path = require('path');

    const configDir = path.join(process.cwd(), 'data', 'projects', project_id, 'config');

    try {
      // Find config file
      const files = await fs.readdir(configDir);
      const jsonFile = config_file || files.find(f => f.endsWith('.json'));
      if (!jsonFile) {
        return { success: false, error: 'No config file found' };
      }

      const configPath = path.join(configDir, jsonFile);
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      // Apply updates (supports dot notation)
      for (const [key, value] of Object.entries(updates)) {
        const parts = key.split('.');
        let target = config;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;
      }

      // Write back
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      this.logger.info('tool-manager.project_config.updated', {
        project_id,
        updates: Object.keys(updates)
      });

      return {
        success: true,
        project_id,
        updated_keys: Object.keys(updates),
        message: `Config updated: ${Object.keys(updates).join(', ')}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============ FACTURAS TOOL HANDLERS ============

  /**
   * Tool: List Facturas
   */
  async facturasListTool(args) {
    const { project_id, status, limit = 50 } = args;

    let query = 'SELECT * FROM facturas';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const result = await this.dbExecuteTool({
      project_id,
      query,
      params
    });

    if (result.success) {
      return {
        success: true,
        project_id,
        count: result.data?.length || 0,
        facturas: result.data || []
      };
    }

    return result;
  }

  /**
   * Tool: Process Facturas (trigger OCR flow)
   */
  async facturasProcessTool(args) {
    const { project_id, factura_id } = args;

    // Trigger the procesar-factura or procesar-lote flow
    const flowId = factura_id
      ? `${project_id}:procesar-factura`
      : `${project_id}:procesar-lote`;

    const data = factura_id ? { factura_id } : {};

    return this.flowTriggerTool({
      flow_id: flowId,
      data
    });
  }

  /**
   * Tool: Export Facturas
   */
  async facturasExportTool(args) {
    const { project_id, format = 'libro-registro' } = args;

    // Trigger the consolidar-excel flow
    return this.flowTriggerTool({
      flow_id: `${project_id}:consolidar-excel`,
      data: { format }
    });
  }

  /**
   * Inject eventBus for publish_event tool
   */
  setEventBus(eventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Inject core config for API calls
   */
  setCoreConfig(coreConfig) {
    this.coreConfig = coreConfig;
  }
}

module.exports = ToolManager;
