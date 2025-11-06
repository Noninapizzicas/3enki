/**
 * Dashboard Module - Observability Web UI
 *
 * Provides a web interface to monitor all cores in the network:
 * - Active cores with status
 * - Real-time logs streaming
 * - Metrics visualization
 * - Event flow monitoring
 */

const fs = require('fs');
const path = require('path');

class DashboardModule {
  constructor() {
    this.core = null;
    this.logger = null;
    this.discovery = null;

    // Buffers for real-time streaming
    this.logBuffer = [];
    this.eventBuffer = [];
    this.maxBufferSize = 1000;

    // SSE clients
    this.sseClients = {
      logs: new Set(),
      events: new Set()
    };
  }

  /**
   * Module lifecycle: onLoad
   */
  async onLoad(core) {
    this.core = core;
    this.logger = core.logger;

    // Discovery will be set later via setDiscovery()
    this.discovery = null;

    if (this.logger) {
      this.logger.info('dashboard.loaded', {
        module: 'dashboard',
        version: '1.0.0'
      });
    }

    // Subscribe to logs and events for buffering
    this.subscribeToStreams();

    // APIs are auto-registered from module.json via handle* methods
  }

  /**
   * Set discovery instance (called after discovery is created)
   */
  setDiscovery(discovery) {
    this.discovery = discovery;
    if (this.logger) {
      this.logger.debug('dashboard.discovery.set');
    }
  }

  /**
   * Module lifecycle: onUnload
   */
  async onUnload() {
    // Close all SSE connections
    for (const client of this.sseClients.logs) {
      try {
        client.end();
      } catch (e) {}
    }
    for (const client of this.sseClients.events) {
      try {
        client.end();
      } catch (e) {}
    }

    if (this.logger) {
      this.logger.info('dashboard.unloaded');
    }
  }

  /**
   * Subscribe to MQTT topics for buffering
   */
  subscribeToStreams() {
    if (!this.core.eventBus) return;

    // Buffer logs and events
    this.core.eventBus.on('message', (topic, message) => {
      if (topic.includes('/logs/')) {
        this.addToBuffer('logs', { topic, message, timestamp: Date.now() });
      }

      if (topic.includes('/events/')) {
        this.addToBuffer('events', { topic, message, timestamp: Date.now() });
      }
    });
  }

  /**
   * Add item to buffer with size limit
   */
  addToBuffer(bufferName, item) {
    const buffer = bufferName === 'logs' ? this.logBuffer : this.eventBuffer;

    buffer.push(item);

    // Keep only last N items
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }

    // Broadcast to SSE clients
    this.broadcastToSSEClients(bufferName, item);
  }

  /**
   * Broadcast to all SSE clients
   */
  broadcastToSSEClients(stream, data) {
    const clients = this.sseClients[stream];
    if (!clients) return;

    const payload = `data: ${JSON.stringify(data)}\n\n`;

    for (const client of clients) {
      try {
        client.write(payload);
      } catch (error) {
        // Client disconnected, remove from set
        clients.delete(client);
      }
    }
  }

  /**
   * Serve Dashboard UI or static files
   */
  async serveDashboardUI(req) {
    const requestPath = req.path || '/';

    // Handle CSS
    if (requestPath.includes('/css/')) {
      return this.serveStaticFile(req, 'css');
    }

    // Handle JS
    if (requestPath.includes('/js/')) {
      return this.serveStaticFile(req, 'javascript');
    }

    // Serve main HTML
    const htmlPath = path.join(__dirname, 'public', 'index.html');

    try {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      return {
        _responseType: 'html',
        content: html
      };
    } catch (error) {
      return {
        _responseType: 'html',
        content: '<html><body><h1>Dashboard UI not found</h1></body></html>'
      };
    }
  }

  /**
   * Serve static files (CSS, JS)
   */
  async serveStaticFile(req, type) {
    const requestPath = req.path || '/';
    const fileName = path.basename(requestPath);
    const filePath = path.join(__dirname, 'public', type === 'css' ? 'css' : 'js', fileName);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return {
        _responseType: type,
        content
      };
    } catch (error) {
      return {
        error: 'File not found',
        path: requestPath
      };
    }
  }

  /**
   * Get list of active cores
   */
  async getCoresList(req) {
    if (!this.discovery) {
      return {
        error: 'Discovery system not available',
        cores: [],
        total: 0
      };
    }

    try {
      const cores = this.discovery.getActiveCores();

      return {
        cores: Array.from(cores.values()).map(core => ({
          id: core.core_id,
          version: core.version,
          host: core.host,
          port: core.port,
          started_at: core.started_at,
          last_seen: core.last_seen,
          heartbeat_count: core.heartbeat_count,
          is_alive: core.is_alive,
          modules: core.modules || [],
          uptime_ms: Date.now() - core.started_at
        })),
        total: cores.size,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        error: error.message,
        cores: [],
        total: 0
      };
    }
  }

  /**
   * Get detailed info about specific core
   */
  async getCoreDetail(req) {
    const coreId = req.params?.id;

    if (!coreId) {
      return {
        error: 'Core ID required'
      };
    }

    if (!this.discovery) {
      return {
        error: 'Discovery system not available'
      };
    }

    try {
      const cores = this.discovery.getActiveCores();
      const core = cores.get(coreId);

      if (!core) {
        return {
          error: 'Core not found'
        };
      }

      return {
        id: core.core_id,
        version: core.version,
        host: core.host,
        port: core.port,
        started_at: core.started_at,
        last_seen: core.last_seen,
        heartbeat_count: core.heartbeat_count,
        is_alive: core.is_alive,
        modules: core.modules || [],
        capabilities: core.capabilities || {},
        uptime_ms: Date.now() - core.started_at,
        uptime_human: this.formatUptime(Date.now() - core.started_at)
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  /**
   * Stream logs via Server-Sent Events
   */
  async streamLogs(req) {
    return {
      _responseType: 'sse',
      onConnect: (res) => {
        // Add client to set
        this.sseClients.logs.add(res);

        // Send initial buffer
        for (const log of this.logBuffer.slice(-50)) { // Last 50 logs
          res.write(`data: ${JSON.stringify(log)}\n\n`);
        }

        // Handle client disconnect
        req.on('close', () => {
          this.sseClients.logs.delete(res);
        });
      }
    };
  }

  /**
   * Stream events via Server-Sent Events
   */
  async streamEvents(req) {
    return {
      _responseType: 'sse',
      onConnect: (res) => {
        // Add client to set
        this.sseClients.events.add(res);

        // Send initial buffer
        for (const event of this.eventBuffer.slice(-20)) { // Last 20 events
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        // Handle client disconnect
        req.on('close', () => {
          this.sseClients.events.delete(res);
        });
      }
    };
  }

  /**
   * Get aggregated metrics
   */
  async getMetrics(req) {
    const metrics = {
      timestamp: Date.now(),
      cores: {},
      aggregate: {
        total_cores: 0,
        total_events: 0,
        total_messages: 0
      }
    };

    if (this.discovery) {
      const cores = this.discovery.getActiveCores();
      metrics.aggregate.total_cores = cores.size;

      // Basic metrics from discovery
      for (const [coreId, core] of cores) {
        metrics.cores[coreId] = {
          uptime_ms: Date.now() - core.started_at,
          heartbeat_count: core.heartbeat_count,
          is_alive: core.is_alive
        };
      }
    }

    return metrics;
  }

  /**
   * Helper: Format uptime in human-readable format
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * API Handler: Dashboard UI (called by ModuleLoader)
   */
  async handleUi(req) {
    return this.serveDashboardUI(req);
  }

  /**
   * API Handler: Get cores list (called by ModuleLoader)
   */
  async handleCores(req) {
    return this.getCoresList(req);
  }

  /**
   * API Handler: Get core detail (called by ModuleLoader)
   */
  async handleCoreDetail(req) {
    return this.getCoreDetail(req);
  }

  /**
   * API Handler: Stream logs (called by ModuleLoader)
   */
  async handleLogs(req) {
    return this.streamLogs(req);
  }

  /**
   * API Handler: Get metrics (called by ModuleLoader)
   */
  async handleMetrics(req) {
    return this.getMetrics(req);
  }

  /**
   * API Handler: Stream events (called by ModuleLoader)
   */
  async handleEvents(req) {
    return this.streamEvents(req);
  }
}

module.exports = DashboardModule;
