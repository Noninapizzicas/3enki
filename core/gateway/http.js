/**
 * HTTP API Gateway - Expone APIs de módulos via HTTP
 *
 * Características:
 * - Servidor HTTP con Node.js built-in http module
 * - Enrutamiento automático desde ModuleRegistry
 * - Formato: /modules/{moduleName}/{path}
 * - JSON request/response
 * - Hook integration (beforeRequest, afterResponse)
 * - CORS support
 * - Request logging y metrics
 *
 * @example
 * const gateway = new HTTPGateway({
 *   port: 3000,
 *   registry,
 *   logger,
 *   metrics,
 *   hooks
 * });
 *
 * await gateway.start();
 */

const http = require('http');
const url = require('url');

class HTTPGateway {
  /**
   * @param {Object} options - Opciones
   * @param {number} options.port - Puerto HTTP (default: 3000)
   * @param {string} options.host - Host (default: '0.0.0.0')
   * @param {Object} options.registry - ModuleRegistry instance
   * @param {Object} options.logger - Logger instance
   * @param {Object} options.metrics - Metrics instance
   * @param {Object} options.hooks - HookManager instance
   * @param {boolean} options.cors - Enable CORS (default: true)
   * @param {string} options.coreId - Core ID para logs
   * @param {Object} options.core - Core instance (for UI Gateway)
   */
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';
    this.registry = options.registry || null;
    this.logger = options.logger || null;
    this.metrics = options.metrics || null;
    this.hooks = options.hooks || null;
    this.cors = options.cors !== false;
    this.coreId = options.coreId || 'unknown';
    this.moduleLoader = options.moduleLoader || null;
    this.eventBus = options.eventBus || null;

    this.server = null;
    this.isRunning = false;

    // UI Gateway integration
    this.uiGateway = null;
    if (options.core) {
      const UIGateway = require('./ui');
      this.uiGateway = new UIGateway(options.core);
    }

    /**
     * Estadísticas del gateway
     */
    this.stats = {
      requests: 0,
      errors: 0,
      by_method: {},
      by_status: {},
      started_at: null
    };
  }

  /**
   * Inicia el servidor HTTP
   *
   * @returns {Promise<void>}
   *
   * @example
   * await gateway.start();
   * console.log('Gateway running on port 3000');
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Gateway already running');
    }

    this.server = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (err) => {
        if (err) {
          if (this.logger) {
            this.logger.error('gateway.start.failed', {
              port: this.port,
              host: this.host,
              error: err.message
            }, err);
          }
          reject(err);
        } else {
          this.isRunning = true;
          this.stats.started_at = Date.now();

          if (this.logger) {
            this.logger.info('gateway.started', {
              port: this.port,
              host: this.host,
              cors: this.cors
            });
          }

          if (this.metrics) {
            this.metrics.increment('gateway.started');
          }

          resolve();
        }
      });
    });
  }

  /**
   * Detiene el servidor HTTP
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.isRunning = false;

          if (this.logger) {
            this.logger.info('gateway.stopped', {
              uptime: Date.now() - this.stats.started_at,
              total_requests: this.stats.requests
            });
          }

          resolve();
        }
      });
    });
  }

  /**
   * Maneja un request HTTP
   *
   * @param {http.IncomingMessage} req - HTTP request
   * @param {http.ServerResponse} res - HTTP response
   * @returns {Promise<void>}
   */
  async handleRequest(req, res) {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      // Actualizar estadísticas
      this.stats.requests++;
      this.stats.by_method[req.method] = (this.stats.by_method[req.method] || 0) + 1;

      // Parse URL
      const parsedUrl = url.parse(req.url, true);
      const pathname = parsedUrl.pathname;
      const query = parsedUrl.query;

      // Log request
      if (this.logger) {
        this.logger.debug('gateway.request', {
          request_id: requestId,
          method: req.method,
          path: pathname,
          query
        });
      }

      // CORS preflight
      if (this.cors && req.method === 'OPTIONS') {
        this.handleCORS(req, res);
        this.sendResponse(res, 204, null);
        return;
      }

      // Health check endpoint
      if (pathname === '/health') {
        this.handleHealth(req, res);
        return;
      }

      // Stats endpoint
      if (pathname === '/stats') {
        this.handleStats(req, res);
        return;
      }

      // UI routes - delegate to UI Gateway
      if (this.uiGateway && pathname.startsWith('/ui')) {
        await this.handleUIRoute(req, res, pathname, query);
        return;
      }

      // Parse body si es POST/PUT/PATCH
      let body = null;
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        body = await this.parseBody(req);
      }

      // Ejecutar hook beforeRequest
      let context = {
        request_id: requestId,
        method: req.method,
        path: pathname,
        query,
        body,
        headers: req.headers
      };

      if (this.hooks) {
        context = await this.hooks.execute('beforeRequest', context);
        if (context === null) {
          // Request bloqueado por hook
          this.sendError(res, 403, 'Request blocked by hook');
          return;
        }
      }

      // Buscar handler en registry
      if (!this.registry) {
        this.sendError(res, 500, 'Module registry not configured');
        return;
      }

      const apiData = this.registry.findAPI(pathname, req.method);

      if (!apiData) {
        this.sendError(res, 404, 'API endpoint not found');
        return;
      }

      // Ejecutar handler del módulo
      let result;
      try {
        result = await apiData.handler({
          method: req.method,
          path: pathname,
          query,
          body: context.body,
          headers: req.headers,
          request_id: requestId
        });
      } catch (handlerError) {
        if (this.logger) {
          this.logger.error('gateway.handler.error', {
            request_id: requestId,
            module: apiData.moduleName,
            api: apiData.apiName,
            error: handlerError.message
          }, handlerError);
        }

        this.sendError(res, 500, 'Handler execution failed', {
          error: handlerError.message
        });
        return;
      }

      // Ejecutar hook afterResponse
      let responseContext = {
        request_id: requestId,
        status: 200,
        data: result
      };

      if (this.hooks) {
        responseContext = await this.hooks.execute('afterResponse', responseContext);
        if (responseContext === null) {
          // Response bloqueado por hook
          this.sendError(res, 500, 'Response blocked by hook');
          return;
        }
      }

      // Enviar respuesta
      this.sendResponse(res, responseContext.status, responseContext.data);

      // Metrics
      if (this.metrics) {
        this.metrics.observe('gateway.request.duration', Date.now() - startTime);
        this.metrics.increment('gateway.request.success');
      }

    } catch (error) {
      this.stats.errors++;

      if (this.logger) {
        this.logger.error('gateway.request.error', {
          request_id: requestId,
          error: error.message
        }, error);
      }

      if (this.metrics) {
        this.metrics.increment('gateway.request.errors');
      }

      this.sendError(res, 500, 'Internal server error', {
        error: error.message
      });
    }
  }

  /**
   * Maneja CORS headers
   *
   * @param {http.IncomingMessage} req - HTTP request
   * @param {http.ServerResponse} res - HTTP response
   */
  handleCORS(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  /**
   * Maneja /health endpoint
   *
   * @param {http.IncomingMessage} req - HTTP request
   * @param {http.ServerResponse} res - HTTP response
   */
  handleHealth(req, res) {
    const health = {
      status: 'healthy',
      core_id: this.coreId,
      uptime: Date.now() - this.stats.started_at,
      timestamp: new Date().toISOString()
    };

    this.sendResponse(res, 200, health);
  }

  /**
   * Maneja /stats endpoint
   *
   * @param {http.IncomingMessage} req - HTTP request
   * @param {http.ServerResponse} res - HTTP response
   */
  handleStats(req, res) {
    const stats = {
      ...this.stats,
      uptime: Date.now() - this.stats.started_at,
      timestamp: new Date().toISOString()
    };

    // Agregar APIs registradas
    if (this.registry) {
      stats.apis = this.registry.getAllAPIs();
      stats.total_apis = stats.apis.length;
    }

    this.sendResponse(res, 200, stats);
  }

  /**
   * Parse request body
   *
   * @param {http.IncomingMessage} req - HTTP request
   * @returns {Promise<Object|null>} Parsed body
   */
  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          if (body.length === 0) {
            resolve(null);
          } else {
            const parsed = JSON.parse(body);
            resolve(parsed);
          }
        } catch (error) {
          reject(new Error('Invalid JSON body'));
        }
      });

      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Envía respuesta JSON
   *
   * @param {http.ServerResponse} res - HTTP response
   * @param {number} statusCode - HTTP status code
   * @param {Object|null} data - Response data
   */
  sendResponse(res, statusCode, data) {
    // Actualizar estadísticas
    this.stats.by_status[statusCode] = (this.stats.by_status[statusCode] || 0) + 1;

    // CORS headers
    if (this.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    // Check for special response types (HTML, SSE, etc.)
    if (data && typeof data === 'object' && data._responseType) {
      const type = data._responseType;

      if (type === 'html') {
        res.setHeader('Content-Type', 'text/html');
        res.statusCode = statusCode;
        res.end(data.content || '');
        return;
      }

      if (type === 'css') {
        res.setHeader('Content-Type', 'text/css');
        res.statusCode = statusCode;
        res.end(data.content || '');
        return;
      }

      if (type === 'javascript') {
        res.setHeader('Content-Type', 'application/javascript');
        res.statusCode = statusCode;
        res.end(data.content || '');
        return;
      }

      if (type === 'sse') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.statusCode = 200;

        // Keep connection open and let handler manage it
        // Handler should store res and write to it
        if (data.onConnect && typeof data.onConnect === 'function') {
          data.onConnect(res);
        }
        return;
      }
    }

    // Default: JSON response
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = statusCode;

    if (data !== null) {
      res.end(JSON.stringify(data));
    } else {
      res.end();
    }
  }

  /**
   * Envía error JSON
   *
   * @param {http.ServerResponse} res - HTTP response
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   * @param {Object} details - Error details (opcional)
   */
  sendError(res, statusCode, message, details = {}) {
    this.sendResponse(res, statusCode, {
      error: {
        code: statusCode,
        message,
        ...details
      }
    });
  }

  /**
   * Genera un request ID único
   *
   * @returns {string} Request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Maneja rutas de UI - delega al UI Gateway
   *
   * @param {http.IncomingMessage} req - HTTP request
   * @param {http.ServerResponse} res - HTTP response
   * @param {string} pathname - Request pathname
   * @param {Object} query - Query parameters
   */
  async handleUIRoute(req, res, pathname, query) {
    try {
      // Create a simplified request/response object
      const request = {
        method: req.method,
        url: pathname,
        headers: req.headers,
        query,
        params: {}
      };

      const response = {
        writeHead: (statusCode, headers) => {
          res.writeHead(statusCode, headers);
        },
        end: (data) => {
          res.end(data);
        }
      };

      // Route to appropriate UI Gateway handler
      if (pathname === '/ui' || pathname === '/ui/') {
        await this.uiGateway.serveAdminPanel(request, response);
      } else if (pathname === '/ui/modules') {
        await this.uiGateway.listModulesWithUI(request, response);
      } else if (pathname.startsWith('/ui/modules/')) {
        // Extract module name from path: /ui/modules/:name
        const moduleName = pathname.replace('/ui/modules/', '');
        request.params.name = moduleName;
        await this.uiGateway.getModuleUI(request, response);
      } else {
        // Serve static file
        await this.uiGateway.serveStaticFile(request, response);
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error('gateway.ui.error', {
          path: pathname,
          error: error.message
        }, error);
      }

      this.sendError(res, 500, 'UI Gateway error', {
        error: error.message
      });
    }
  }

  /**
   * Obtiene estadísticas del gateway
   *
   * @returns {Object} Estadísticas
   */
  getStats() {
    return {
      ...this.stats,
      uptime: this.stats.started_at ? Date.now() - this.stats.started_at : 0,
      is_running: this.isRunning
    };
  }
}

module.exports = HTTPGateway;
