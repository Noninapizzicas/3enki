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

    // Track cores manually from MQTT messages
    this.activeCores = new Map();

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
      client.end();
    }
    for (const client of this.sseClients.events) {
      client.end();
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

    // Buffer logs
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
   * API: Serve Dashboard UI (HTML)
   */
  async serveDashboardUI(req, res) {
    // Check if request is for static assets
    const url = req.url || '/';

    if (url.startsWith('/css/') || url.startsWith('/js/')) {
      return this.serveStaticFile(req, res);
    }

    // Serve main HTML
    const htmlPath = path.join(__dirname, 'public', 'index.html');

    try {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Dashboard UI not found');
    }
  }

  /**
   * Serve static files (CSS, JS)
   */
  async serveStaticFile(req, res) {
    const url = req.url || '/';
    const filePath = path.join(__dirname, 'public', url);

    try {
      const content = fs.readFileSync(filePath);

      // Determine content type
      let contentType = 'text/plain';
      if (url.endsWith('.css')) contentType = 'text/css';
      if (url.endsWith('.js')) contentType = 'application/javascript';
      if (url.endsWith('.html')) contentType = 'text/html';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
    }
  }

  /**
   * API: Get list of active cores
   */
  async getCoresList(req, res) {
    if (!this.discovery) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        error: 'Discovery system not available'
      }));
    }

    try {
      const cores = this.discovery.getActiveCores();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
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
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * API: Get detailed info about specific core
   */
  async getCoreDetail(req, res) {
    const coreId = req.params?.id;

    if (!coreId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Core ID required' }));
    }

    if (!this.discovery) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        error: 'Discovery system not available'
      }));
    }

    try {
      const cores = this.discovery.getActiveCores();
      const core = cores.get(coreId);

      if (!core) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Core not found' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
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
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * API: Stream logs via Server-Sent Events
   */
  async streamLogs(req, res) {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Add client to set
    this.sseClients.logs.add(res);

    // Send initial buffer
    for (const log of this.logBuffer) {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    }

    // Handle client disconnect
    req.on('close', () => {
      this.sseClients.logs.delete(res);
    });
  }

  /**
   * API: Stream events via Server-Sent Events
   */
  async streamEvents(req, res) {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Add client to set
    this.sseClients.events.add(res);

    // Send initial buffer
    for (const event of this.eventBuffer) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Handle client disconnect
    req.on('close', () => {
      this.sseClients.events.delete(res);
    });
  }

  /**
   * API: Get aggregated metrics
   */
  async getMetrics(req, res) {
    // Collect metrics from all cores
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

      // In a real implementation, you'd query each core's /api/metrics endpoint
      // For now, we'll return basic discovery data
      for (const [coreId, core] of cores) {
        metrics.cores[coreId] = {
          uptime_ms: Date.now() - core.started_at,
          heartbeat_count: core.heartbeat_count,
          is_alive: core.is_alive
        };
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics));
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
  async handleUi(req, res) {
    return this.serveDashboardUI(req, res);
  }

  /**
   * API Handler: Get cores list (called by ModuleLoader)
   */
  async handleCores(req, res) {
    return this.getCoresList(req, res);
  }

  /**
   * API Handler: Get core detail (called by ModuleLoader)
   */
  async handleCoreDetail(req, res) {
    return this.getCoreDetail(req, res);
  }

  /**
   * API Handler: Stream logs (called by ModuleLoader)
   */
  async handleLogs(req, res) {
    return this.streamLogs(req, res);
  }

  /**
   * API Handler: Get metrics (called by ModuleLoader)
   */
  async handleMetrics(req, res) {
    return this.getMetrics(req, res);
  }

  /**
   * API Handler: Stream events (called by ModuleLoader)
   */
  async handleEvents(req, res) {
    return this.streamEvents(req, res);
  }
}

module.exports = DashboardModule;
