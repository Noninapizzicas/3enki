const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

class CallingGeneratorModule {
  constructor(config, { logger, eventBus, metrics, moduleLoader }) {
    this.logger = logger.child({ module: 'calling-generator' });
    this.eventBus = eventBus;
    this.metrics = metrics;
    this.moduleLoader = moduleLoader;
    this.config = config;

    // Stores { fullFunctionName: { func: Callable, metadata: Object } }
    this.generatedFunctions = new Map();

    this.toolOrchestratorModule = null;
    this.unsubscribePluginLoaded = null;
  }

  async onLoad() {
    this.logger.info('Calling Generator module loaded');

    // Get Tool Orchestrator module
    const toolOrchestratorModule = this.moduleLoader.getModule('tool-orchestrator');
    this.toolOrchestratorModule = toolOrchestratorModule;

    if (!toolOrchestratorModule || !toolOrchestratorModule.instance) {
      this.logger.warn('Tool Orchestrator not found. Functions will not be registered automatically');
    }

    // Subscribe to plugin.loaded events
    this.unsubscribePluginLoaded = this.eventBus.subscribe(
      'plugin.loaded',
      this.handlePluginLoaded.bind(this)
    );

    this.logger.info('Subscribed to plugin.loaded events');
  }

  async onUnload() {
    this.logger.info('Calling Generator module unloading');

    if (this.unsubscribePluginLoaded) {
      this.unsubscribePluginLoaded();
    }

    // Unregister all tools from Tool Orchestrator
    if (this.toolOrchestratorModule && this.toolOrchestratorModule.instance) {
      for (const fullFunctionName of this.generatedFunctions.keys()) {
        if (typeof this.toolOrchestratorModule.instance.unregisterTool === 'function') {
          this.toolOrchestratorModule.instance.unregisterTool(fullFunctionName);
        }
      }
      this.logger.info(`Unregistered ${this.generatedFunctions.size} functions from Tool Orchestrator`);
    }

    this.generatedFunctions.clear();
  }

  /**
   * Handles plugin.loaded event
   * @param {object} event - The plugin.loaded event payload
   */
  async handlePluginLoaded(event) {
    const { name, definition } = event;

    this.logger.info({ pluginName: name }, 'Processing plugin.loaded event');

    if (!definition || !definition.functions) {
      this.logger.warn({ pluginName: name }, 'Plugin definition missing functions');
      return;
    }

    await this.generatePluginCallingFunctions(definition);
  }

  /**
   * Generates calling functions for a plugin
   * @param {object} pluginData - The plugin definition
   */
  async generatePluginCallingFunctions(pluginData) {
    try {
      if (!pluginData.metadata || !pluginData.metadata.name || !pluginData.functions) {
        this.logger.error('Invalid plugin definition: missing metadata, name, or functions');
        return;
      }

      const pluginName = pluginData.metadata.name;
      const baseUrl = pluginData.metadata.base_url;
      const authType = pluginData.metadata.auth_type || 'none';

      let generatedCount = 0;

      for (const funcName in pluginData.functions) {
        const funcDef = pluginData.functions[funcName];
        const fullFunctionName = `${pluginName}.${funcName}`;

        try {
          const { func, metadata } = this._createCallingFunction(
            pluginName,
            funcName,
            funcDef,
            baseUrl,
            authType,
            pluginData
          );

          this.generatedFunctions.set(fullFunctionName, { func, metadata });
          generatedCount++;

          // Register with Tool Orchestrator
          this.registerWithToolOrchestrator(fullFunctionName, func, metadata);

          this.logger.debug({ fullFunctionName, type: metadata.type }, 'Generated function');

        } catch (error) {
          this.logger.error({
            err: error,
            pluginName,
            funcName
          }, 'Failed to generate function');

          this.eventBus.publish('function.generation.error', {
            pluginName,
            funcName,
            error: error.message
          });
        }
      }

      this.logger.info({
        pluginName,
        generated: generatedCount,
        total: Object.keys(pluginData.functions).length
      }, 'Plugin functions generated');

      this.metrics.increment('functions.generated.total', generatedCount, { plugin: pluginName });

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to generate plugin functions');
    }
  }

  /**
   * Creates a calling function based on the function definition
   * @param {string} pluginName - Name of the plugin
   * @param {string} funcName - Name of the function
   * @param {object} funcDef - Function definition
   * @param {string} baseUrl - Base URL for HTTP calls
   * @param {string} authType - Authentication type
   * @param {object} pluginData - Full plugin data
   * @returns {object} - { func: Function, metadata: Object }
   */
  _createCallingFunction(pluginName, funcName, funcDef, baseUrl, authType, pluginData) {
    const method = funcDef.method;
    const description = funcDef.description || `${pluginName} ${funcName}`;
    const parameters = funcDef.parameters || {};

    const metadata = {
      pluginName,
      functionName: funcName,
      description,
      parameters,
      method,
      type: 'unknown'
    };

    // HTTP Function
    if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
      metadata.type = 'http';
      const endpoint = funcDef.endpoint;

      const func = async (args) => {
        return this._executeHttpFunction(
          pluginName,
          funcName,
          method,
          baseUrl,
          endpoint,
          parameters,
          authType,
          pluginData,
          args
        );
      };

      return { func, metadata };
    }

    // Local Function (Event-based)
    if (method === 'local_function') {
      metadata.type = 'local_event';
      const eventTopic = funcDef.event_topic || `${pluginName}.local.${funcName}.request`;

      const func = async (args) => {
        return this._executeLocalFunction(
          pluginName,
          funcName,
          eventTopic,
          args
        );
      };

      return { func, metadata };
    }

    // Unsupported method
    this.logger.warn({ pluginName, funcName, method }, 'Unsupported method type');
    metadata.type = 'unsupported';

    const func = async (args) => {
      this.metrics.increment('calling_generator.unsupported_call.total', 1, {
        plugin: pluginName,
        function: funcName,
        method
      });
      throw new Error(`Function ${pluginName}.${funcName} uses unsupported method: ${method}`);
    };

    return { func, metadata };
  }

  /**
   * Executes an HTTP function
   */
  async _executeHttpFunction(pluginName, funcName, method, baseUrl, endpoint, parameters, authType, pluginData, args) {
    const fullFunctionName = `${pluginName}.${funcName}`;

    this.logger.debug({ pluginName, funcName, args }, 'Executing HTTP calling function');
    this.metrics.increment('calling_generator.http_call.total', 1, {
      plugin: pluginName,
      function: funcName,
      method
    });

    let fullUrl = baseUrl + endpoint;
    const queryParams = new URLSearchParams();
    let requestBody = {};
    const headers = {
      'User-Agent': 'EventCore/1.0.0',
      'Content-Type': 'application/json'
    };

    // Handle URL path parameters and query parameters
    for (const paramName in (parameters.properties || {})) {
      const argValue = args[paramName];

      if (argValue === undefined) {
        if (parameters.required && parameters.required.includes(paramName)) {
          throw new Error(`Missing required argument: ${paramName}`);
        }
        continue;
      }

      // Check if parameter is part of the path
      if (fullUrl.includes(`{${paramName}}`)) {
        fullUrl = fullUrl.replace(`{${paramName}}`, encodeURIComponent(argValue));
      } else if (method.toUpperCase() === 'GET') {
        queryParams.append(paramName, argValue);
      } else {
        requestBody[paramName] = argValue;
      }
    }

    if (queryParams.toString()) {
      fullUrl += `?${queryParams.toString()}`;
    }

    // Handle authentication
    this._addAuthentication(headers, queryParams, authType, pluginName, pluginData);

    // Make HTTP request
    return this._makeHttpRequest(fullUrl, method, headers, requestBody, pluginName, funcName);
  }

  /**
   * Adds authentication to the request
   */
  _addAuthentication(headers, queryParams, authType, pluginName, pluginData) {
    const apiKey = process.env[`${pluginName.toUpperCase()}_API_KEY`];
    const authUser = process.env[`${pluginName.toUpperCase()}_AUTH_USER`];
    const authPass = process.env[`${pluginName.toUpperCase()}_AUTH_PASS`];

    switch (authType) {
      case 'bearer':
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        break;

      case 'api_key_header':
        if (apiKey) {
          const headerName = pluginData.metadata.auth_header_name || 'X-API-Key';
          headers[headerName] = apiKey;
        }
        break;

      case 'api_key_query':
        if (apiKey) {
          const queryParamName = pluginData.metadata.auth_query_param_name || 'apiKey';
          queryParams.append(queryParamName, apiKey);
        }
        break;

      case 'basic_auth':
        if (authUser && authPass) {
          const encoded = Buffer.from(`${authUser}:${authPass}`).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;

      case 'none':
      default:
        // No authentication
        break;
    }
  }

  /**
   * Makes an HTTP request
   */
  async _makeHttpRequest(url, method, headers, body, pluginName, funcName) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      const options = {
        method: method.toUpperCase(),
        headers: headers,
        timeout: this.config.httpTimeout || 30000
      };

      const req = client.request(url, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const responseData = data ? JSON.parse(data) : {};
              this.metrics.increment('calling_generator.http_call.success', 1, {
                plugin: pluginName,
                function: funcName
              });
              resolve({
                success: true,
                data: responseData,
                status_code: res.statusCode
              });
            } catch (jsonError) {
              // Return raw data if not JSON
              resolve({
                success: true,
                data: { raw: data },
                status_code: res.statusCode,
                message: 'Non-JSON response'
              });
            }
          } else {
            this.logger.error({
              statusCode: res.statusCode,
              response: data
            }, `HTTP call to ${pluginName}.${funcName} failed`);

            this.metrics.increment('calling_generator.http_call.error', 1, {
              plugin: pluginName,
              function: funcName,
              reason: 'http_error',
              status: res.statusCode
            });

            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        this.logger.error({ err: error }, `Network error during HTTP call to ${pluginName}.${funcName}`);
        this.metrics.increment('calling_generator.http_call.error', 1, {
          plugin: pluginName,
          function: funcName,
          reason: 'network_error'
        });
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        this.metrics.increment('calling_generator.http_call.error', 1, {
          plugin: pluginName,
          function: funcName,
          reason: 'timeout'
        });
        reject(new Error('HTTP request timeout'));
      });

      if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && Object.keys(body).length > 0) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Executes a local function via event bus
   */
  async _executeLocalFunction(pluginName, funcName, eventTopic, args) {
    const fullFunctionName = `${pluginName}.${funcName}`;

    this.logger.debug({ pluginName, funcName, args, eventTopic }, 'Executing local calling function');
    this.metrics.increment('calling_generator.local_call.total', 1, {
      plugin: pluginName,
      function: funcName
    });

    const requestId = crypto.randomUUID();
    const responseTopic = `${eventTopic}.response.${requestId}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.eventBus.unsubscribe(responseTopic);
        this.metrics.increment('calling_generator.local_call.error', 1, {
          plugin: pluginName,
          function: funcName,
          reason: 'timeout'
        });
        reject(new Error(`Local function call to ${fullFunctionName} timed out`));
      }, this.config.localFunctionTimeout || 5000);

      this.eventBus.subscribe(responseTopic, (responseEvent) => {
        clearTimeout(timeout);
        this.eventBus.unsubscribe(responseTopic);

        if (responseEvent.success) {
          this.metrics.increment('calling_generator.local_call.success', 1, {
            plugin: pluginName,
            function: funcName
          });
          resolve(responseEvent);
        } else {
          this.metrics.increment('calling_generator.local_call.error', 1, {
            plugin: pluginName,
            function: funcName,
            reason: 'module_error'
          });
          reject(new Error(responseEvent.error || `Local function ${fullFunctionName} failed`));
        }
      });

      this.eventBus.publish(eventTopic, {
        requestId,
        args,
        respondTo: responseTopic
      });
    });
  }

  /**
   * Registers a function with Tool Orchestrator
   */
  registerWithToolOrchestrator(fullFunctionName, func, metadata) {
    if (!this.toolOrchestratorModule || !this.toolOrchestratorModule.instance) {
      return;
    }

    if (typeof this.toolOrchestratorModule.instance.registerTool === 'function') {
      this.toolOrchestratorModule.instance.registerTool(
        metadata.pluginName,
        metadata.functionName,
        metadata.parameters,
        metadata.description,
        func
      );

      this.eventBus.publish('function.generated', {
        fullFunctionName,
        metadata
      });
    }
  }

  /**
   * Gets a function by name
   */
  getFunction(fullFunctionName) {
    return this.generatedFunctions.get(fullFunctionName)?.func;
  }

  /**
   * Gets function metadata
   */
  getFunctionMetadata(fullFunctionName) {
    return this.generatedFunctions.get(fullFunctionName)?.metadata;
  }

  /**
   * Lists all available functions
   */
  listAvailableFunctions() {
    return Array.from(this.generatedFunctions.keys());
  }

  // ========================================================================
  // HTTP API Handlers
  // ========================================================================

  /**
   * GET /functions - List all generated functions
   */
  async handleListFunctions(req, res) {
    const functions = [];

    for (const [fullFunctionName, { metadata }] of this.generatedFunctions.entries()) {
      functions.push({
        fullFunctionName,
        plugin: metadata.pluginName,
        function: metadata.functionName,
        type: metadata.type,
        description: metadata.description
      });
    }

    res.json({
      success: true,
      count: functions.length,
      functions
    });
  }

  /**
   * GET /function/:name - Get function metadata
   */
  async handleGetFunction(req, res) {
    const functionName = req.params.name;
    const metadata = this.getFunctionMetadata(functionName);

    if (!metadata) {
      return res.status(404).json({
        success: false,
        error: `Function '${functionName}' not found`
      });
    }

    res.json({
      success: true,
      metadata
    });
  }
}

module.exports = CallingGeneratorModule;
