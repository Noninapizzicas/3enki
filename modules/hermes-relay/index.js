'use strict';

const crypto = require('crypto');
const http = require('http');
const https = require('https');

const BaseModule = require('../_shared/base-module');

const DB_TIMEOUT_MS = 10000;

class HermesRelayModule extends BaseModule {
  constructor() {
    super();
    this.name = 'hermes-relay';
    this.version = '1.0.0';

    this.config = {};
    this.pendingDb = new Map();
  }

  async onLoad(core) {
    this.eventBus = core.eventBus;
    this.logger = core.logger;
    this.metrics = core.metrics || null;
    this.config = this._loadConfig(core);

    this.logger?.info('hermes-relay.loaded', {
      hermes_url: this.config.hermes_url,
      hermes_model: this.config.hermes_model,
      context_window: this.config.context_window
    });
  }

  _loadConfig(core) {
    const mc = core.config?.modules_config?.['hermes-relay'] || {};
    return {
      hermes_url: mc.hermes_url || process.env.HERMES_URL || 'http://localhost:8642/v1/chat/completions',
      hermes_model: mc.hermes_model || process.env.HERMES_MODEL || 'hermes',
      hermes_api_key: mc.hermes_api_key || process.env.HERMES_API_KEY || '',
      context_window: mc.context_window || 40,
      request_timeout_ms: mc.request_timeout_ms || 300000
    };
  }

  // ── DB helper (mismo patrón que chat-io) ──────────────────────

  async _db(project_id, query, params = [], read_only = false) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDb.delete(request_id);
        reject(new Error(`db timeout: ${query.slice(0, 40)}`));
      }, DB_TIMEOUT_MS);
      this.pendingDb.set(request_id, { resolve, reject, timeout });
      Promise.resolve(this.eventBus.publish('db.query.request', {
        project_id, query, params, read_only, request_id
      })).catch(err => {
        clearTimeout(timeout);
        this.pendingDb.delete(request_id);
        reject(err);
      });
    });
  }

  onDbQueryResponse(event) {
    const data = event?.data || event;
    const pending = this.pendingDb.get(data?.request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingDb.delete(data.request_id);
    if (data.error) {
      pending.reject(new Error(typeof data.error === 'string' ? data.error : data.error.message || 'db error'));
    } else {
      pending.resolve(data.data ?? data.rows ?? []);
    }
  }

  // ── chat.message.saved → Hermes → ai.chat.response ───────────

  async onMessageSaved(event) {
    const data = event?.data || event;
    const {
      correlation_id, conversation_id, project_id,
      user_id, channel, channel_context,
      message_id, user_message,
      settings, page_id, attachments, intencion
    } = data;

    if (!project_id || !conversation_id || !user_message) {
      this.logger?.warn('hermes-relay.invalid_payload', {
        has_project: !!project_id, has_conv: !!conversation_id, has_msg: !!user_message
      });
      return;
    }

    const startTime = Date.now();

    try {
      const history = await this._loadHistory(project_id, conversation_id, settings?.context_window);
      const messages = this._formatMessages(history, user_message);

      const result = await this._callHermes(messages);

      const assistantMessage = result.content || '';
      const messageIdAssistant = crypto.randomUUID();

      await this._publicarEvento('ai.chat.response', {
        correlation_id,
        conversation_id,
        project_id,
        user_id: user_id || 'default',
        channel: channel || 'web',
        channel_context: channel_context || {},
        message_id,
        message_id_assistant: messageIdAssistant,
        assistant_message: assistantMessage,
        model: result.model || this.config.hermes_model,
        provider: 'hermes',
        tokens: result.usage || { input: 0, output: 0, total: 0 },
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        tool_calls_executed: result.tool_calls_executed || [],
        iterations: result.iterations || 1,
        finish_reason: result.finish_reason || 'stop',
        settings
      });

      this.metrics?.increment('hermes-relay.success');
      this.logger?.info('hermes-relay.response', {
        correlation_id, conversation_id,
        duration_ms: Date.now() - startTime,
        model: result.model
      });

    } catch (err) {
      this.logger?.error('hermes-relay.failed', {
        error: err.message, correlation_id, conversation_id
      });
      this.metrics?.increment('hermes-relay.errors');

      await this._publicarEvento('ai.chat.failed', {
        correlation_id,
        conversation_id,
        project_id,
        user_id: user_id || 'default',
        channel: channel || 'web',
        channel_context: channel_context || {},
        message_id,
        error: {
          code: err.code || 'HERMES_ERROR',
          message: err.message
        },
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      });
    }
  }

  // ── Historial desde SQLite ────────────────────────────────────

  async _loadHistory(project_id, conversation_id, contextWindow) {
    const cw = contextWindow || this.config.context_window;
    const rows = await this._db(project_id,
      `SELECT role, content FROM messages
       WHERE conversation_id = ? AND in_context = 1
       ORDER BY created_at ASC`,
      [conversation_id], true
    );
    return rows.slice(-(cw));
  }

  _formatMessages(history, currentUserMessage) {
    const messages = history.map(row => ({
      role: row.role,
      content: row.content
    }));
    messages.push({ role: 'user', content: currentUserMessage });
    return messages;
  }

  // ── HTTP a Hermes ─────────────────────────────────────────────

  _callHermes(messages) {
    const url = new URL(this.config.hermes_url);
    const payload = JSON.stringify({
      model: this.config.hermes_model,
      messages,
      stream: false
    });

    const headers = { 'Content-Type': 'application/json' };
    if (this.config.hermes_api_key) {
      headers['Authorization'] = `Bearer ${this.config.hermes_api_key}`;
    }

    const transport = url.protocol === 'https:' ? https : http;
    const timeoutMs = this.config.request_timeout_ms;

    return new Promise((resolve, reject) => {
      const req = transport.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
        timeout: timeoutMs
      }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);

            if (res.statusCode >= 400) {
              const err = new Error(json.error?.message || `Hermes HTTP ${res.statusCode}`);
              err.code = 'HERMES_HTTP_ERROR';
              return reject(err);
            }

            const choice = json.choices?.[0];
            if (!choice) {
              const err = new Error('Hermes response: no choices');
              err.code = 'HERMES_EMPTY_RESPONSE';
              return reject(err);
            }

            resolve({
              content: choice.message?.content || '',
              model: json.model || null,
              finish_reason: choice.finish_reason || 'stop',
              usage: json.usage ? {
                input: json.usage.prompt_tokens || 0,
                output: json.usage.completion_tokens || 0,
                total: json.usage.total_tokens || 0
              } : null,
              tool_calls_executed: [],
              iterations: 1
            });
          } catch (parseErr) {
            const err = new Error(`Hermes response parse error: ${parseErr.message}`);
            err.code = 'HERMES_PARSE_ERROR';
            reject(err);
          }
        });
      });

      req.on('error', (err) => {
        const e = new Error(`Hermes connection failed: ${err.message}`);
        e.code = 'HERMES_CONNECTION_ERROR';
        reject(e);
      });

      req.on('timeout', () => {
        req.destroy();
        const err = new Error(`Hermes timeout after ${timeoutMs}ms`);
        err.code = 'HERMES_TIMEOUT';
        reject(err);
      });

      req.write(payload);
      req.end();
    });
  }
}

module.exports = HermesRelayModule;
