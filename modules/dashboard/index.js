/**
 * Dashboard Module v3.0.0 — POC2 canonico.
 *
 * Observability Dashboard - UI bus-driven para monitorear todos los cores en
 * tiempo real (active cores, logs streaming, events streaming, metrics
 * agregadas).
 *
 * Buffers in-memory (logBuffer, eventBuffer) populados por suscripcion al bus.
 * SSE clients (logs, events) tracked en Sets para broadcast push-based.
 */

'use strict';

const BaseModule = require('../_shared/base-module');

const DEFAULT_BUFFER_SIZE = 1000;
const DEFAULT_LOGS_INITIAL = 50;
const DEFAULT_EVENTS_INITIAL = 20;

class DashboardModule extends BaseModule {
  constructor() {
    super();
    this.name = 'dashboard';
    this.version = '3.0.0';

    this.core = null;
    this.discovery = null;

    this.logBuffer = [];
    this.eventBuffer = [];
    this.maxBufferSize = DEFAULT_BUFFER_SIZE;

    this.sseClients = {
      logs: new Set(),
      events: new Set()
    };

    this._busMessageHandler = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.core = core;
    this.eventBus = core.eventBus || null;
    this.logger = core.logger;
    this.metrics = core.metrics || null;

    const config = core.moduleConfig || core.config || {};
    this.maxBufferSize = config.max_buffer_size || DEFAULT_BUFFER_SIZE;

    this.discovery = null; // se inyecta via setDiscovery()

    this._subscribeToStreams();

    this.logger?.info?.('module.loaded', {
      module: this.name,
      version: this.version,
      max_buffer_size: this.maxBufferSize
    });
  }

  setDiscovery(discovery) {
    this.discovery = discovery;
    this.logger?.debug?.('dashboard.discovery.set', {});
  }

  async onUnload() {
    if (this._busMessageHandler && this.eventBus?.off) {
      try { this.eventBus.off('message', this._busMessageHandler); } catch (_) { /* ignore */ }
    } else if (this._busMessageHandler && this.eventBus?.removeListener) {
      try { this.eventBus.removeListener('message', this._busMessageHandler); } catch (_) { /* ignore */ }
    }
    this._busMessageHandler = null;

    for (const client of this.sseClients.logs) {
      try { client.end(); }
      catch (e) {
        this.logger?.debug?.('dashboard.sse.close_error', {
          stream: 'logs', error_message: e.message
        });
      }
    }
    for (const client of this.sseClients.events) {
      try { client.end(); }
      catch (e) {
        this.logger?.debug?.('dashboard.sse.close_error', {
          stream: 'events', error_message: e.message
        });
      }
    }
    this.sseClients.logs.clear();
    this.sseClients.events.clear();
    this.logBuffer = [];
    this.eventBuffer = [];
    this.discovery = null;

    this.logger?.info?.('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/unavailable|no disponible|not available/i.test(msg)) return { status: 503, code: 'UPSTREAM_UNREACHABLE' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('dashboard.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    if (!this.eventBus?.publish) return payload;
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.warn?.('dashboard.publish.failed', {
        event: name, error_message: err.message
      });
    }
    return enriched;
  }

  // ==========================================
  // Bus subscription + buffering
  // ==========================================

  _subscribeToStreams() {
    if (!this.eventBus?.on) return;

    this._busMessageHandler = (topic, message) => {
      try {
        if (topic.includes('/logs/')) {
          this._addToBuffer('logs', { topic, message, timestamp: Date.now() });
        }
        if (topic.includes('/events/')) {
          this._addToBuffer('events', { topic, message, timestamp: Date.now() });
        }
      } catch (err) {
        this.logger?.warn?.('dashboard.buffer.error', {
          topic, error_message: err.message
        });
        this.metrics?.increment?.('dashboard.errors', { code: 'UNKNOWN_ERROR', kind: 'subscribe' });
      }
    };
    this.eventBus.on('message', this._busMessageHandler);
  }

  _addToBuffer(bufferName, item) {
    const buffer = bufferName === 'logs' ? this.logBuffer : this.eventBuffer;
    buffer.push(item);
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }
    this._broadcastToSSEClients(bufferName, item);
  }

  _broadcastToSSEClients(stream, data) {
    const clients = this.sseClients[stream];
    if (!clients) return;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      try {
        client.write(payload);
      } catch (err) {
        clients.delete(client);
        this.logger?.debug?.('dashboard.sse.client_disconnected', {
          stream, error_message: err.message
        });
      }
    }
  }

  // ==========================================
  // UI Handlers (canonical shape)
  // ==========================================

  async handleCores() {
    try {
      if (!this.discovery) {
        this.metrics?.increment?.('dashboard.errors', { code: 'UPSTREAM_UNREACHABLE', kind: 'cores' });
        this.logger?.warn?.('dashboard.cores.no_discovery', {});
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE',
          'Discovery system not available', { dependency: 'discovery' });
      }

      const cores = this.discovery.getActiveCores();
      return {
        status: 200,
        data: {
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
        }
      };
    } catch (err) {
      return this._handleHandlerError('dashboard.cores.error', err);
    }
  }

  async handleCoreDetail(input) {
    try {
      const coreId = input?.params?.id || input?.id;

      if (!coreId) {
        this.metrics?.increment?.('dashboard.errors', { code: 'INVALID_INPUT', kind: 'core-detail' });
        this.logger?.warn?.('dashboard.core_detail.missing', { field: 'id' });
        return this._errorResponse(400, 'INVALID_INPUT', 'Core ID required', { field: 'id' });
      }

      if (!this.discovery) {
        this.metrics?.increment?.('dashboard.errors', { code: 'UPSTREAM_UNREACHABLE', kind: 'core-detail' });
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE',
          'Discovery system not available', { dependency: 'discovery' });
      }

      const cores = this.discovery.getActiveCores();
      const core = cores.get(coreId);

      if (!core) {
        this.metrics?.increment?.('dashboard.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'core-detail' });
        this.logger?.warn?.('dashboard.core_detail.not_found', { core_id: coreId });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          'Core not found', { core_id: coreId });
      }

      return {
        status: 200,
        data: {
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
          uptime_human: this._formatUptime(Date.now() - core.started_at)
        }
      };
    } catch (err) {
      return this._handleHandlerError('dashboard.core_detail.error', err);
    }
  }

  async handleLogs(req) {
    return {
      _responseType: 'sse',
      onConnect: (res) => {
        this.sseClients.logs.add(res);
        for (const log of this.logBuffer.slice(-DEFAULT_LOGS_INITIAL)) {
          try { res.write(`data: ${JSON.stringify(log)}\n\n`); }
          catch (_) { /* client disconnected */ }
        }
        if (req?.on) {
          req.on('close', () => { this.sseClients.logs.delete(res); });
        }
      }
    };
  }

  async handleEvents(req) {
    return {
      _responseType: 'sse',
      onConnect: (res) => {
        this.sseClients.events.add(res);
        for (const event of this.eventBuffer.slice(-DEFAULT_EVENTS_INITIAL)) {
          try { res.write(`data: ${JSON.stringify(event)}\n\n`); }
          catch (_) { /* client disconnected */ }
        }
        if (req?.on) {
          req.on('close', () => { this.sseClients.events.delete(res); });
        }
      }
    };
  }

  async handleMetrics() {
    try {
      const result = {
        timestamp: Date.now(),
        cores: {},
        aggregate: {
          total_cores: 0,
          total_events: 0,
          total_messages: 0,
          buffer_logs: this.logBuffer.length,
          buffer_events: this.eventBuffer.length,
          sse_clients_logs: this.sseClients.logs.size,
          sse_clients_events: this.sseClients.events.size
        }
      };

      if (this.discovery) {
        const cores = this.discovery.getActiveCores();
        result.aggregate.total_cores = cores.size;

        for (const [coreId, core] of cores) {
          result.cores[coreId] = {
            uptime_ms: Date.now() - core.started_at,
            heartbeat_count: core.heartbeat_count,
            is_alive: core.is_alive
          };
        }
      }

      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('dashboard.metrics.error', err);
    }
  }

  async handleHealth() {
    return {
      status: 200,
      data: {
        module: this.name,
        version: this.version,
        status: this.discovery ? 'healthy' : 'degraded',
        discovery_available: !!this.discovery,
        buffer_logs: this.logBuffer.length,
        buffer_events: this.eventBuffer.length,
        sse_clients: {
          logs: this.sseClients.logs.size,
          events: this.sseClients.events.size
        }
      }
    };
  }

  // ==========================================
  // Helpers internos
  // ==========================================

  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

module.exports = DashboardModule;
