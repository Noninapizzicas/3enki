const http = require('http');

/**
 * Tool Manager
 *
 * Gestiona tools (APIs) que los agentes pueden llamar
 */
class ToolManager {
  constructor(config, logger, coreConfig) {
    this.config = config;
    this.logger = logger;
    this.coreConfig = coreConfig;

    // Available tools: Map<toolName, toolSpec>
    this.tools = new Map();
  }

  /**
   * Initialize tool manager
   */
  async initialize() {
    // Register built-in tools
    this.registerBuiltinTools();

    this.logger.info('tool-manager.initialized', {
      tools_count: this.tools.size
    });
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
   */
  async executeTool(toolName, args, allowedTools = []) {
    // Check if tool exists
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    // Check if agent is allowed to use this tool
    if (allowedTools.length > 0 && !allowedTools.includes(toolName)) {
      throw new Error(`Tool '${toolName}' not allowed for this agent`);
    }

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
      args
    });

    return result;
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
   * Tool: Read File
   */
  async readFileTool(args) {
    const fs = require('fs').promises;
    const { path } = args;

    const content = await fs.readFile(path, 'utf8');

    return { path, content, size: content.length };
  }

  /**
   * Tool: Write File
   */
  async writeFileTool(args) {
    const fs = require('fs').promises;
    const { path, content } = args;

    await fs.writeFile(path, content, 'utf8');

    return { path, size: content.length, success: true };
  }

  /**
   * Inject eventBus for publish_event tool
   */
  setEventBus(eventBus) {
    this.eventBus = eventBus;
  }
}

module.exports = ToolManager;
