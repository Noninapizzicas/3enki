'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class HermesBridge {
  constructor() {
    this.eventBus = null;
    this.moduleLoader = null;
    this.logger = null;
    this.config = {};
    this.token = null;
  }

  async onLoad(core) {
    this.eventBus = core.eventBus;
    this.moduleLoader = core.moduleLoader;
    this.logger = core.logger;
    this.config = core.config?.modules_config?.['hermes-bridge'] || {};
    this._initToken();
  }

  // ──────────────────────────────────────────────────────────────
  // Auth: shared secret — token generado al primer arranque,
  // persistido en data/.hermes-bridge-token. El caller (Hermes
  // Python) lee el mismo fichero e incluye Bearer <token>.
  // ──────────────────────────────────────────────────────────────

  _initToken() {
    const tokenPath = path.resolve(
      this.config.token_path || 'data/.hermes-bridge-token'
    );
    try {
      this.token = fs.readFileSync(tokenPath, 'utf8').trim();
      if (this.token.length < 32) throw new Error('token too short');
    } catch (_) {
      this.token = crypto.randomBytes(32).toString('hex');
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
      fs.writeFileSync(tokenPath, this.token + '\n', { mode: 0o600 });
      if (this.logger) {
        this.logger.info('hermes-bridge.token.created', { path: tokenPath });
      }
    }
  }

  _authenticate(req) {
    const auth = req.headers?.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return false;
    const presented = auth.slice(7).trim();
    return crypto.timingSafeEqual(
      Buffer.from(presented),
      Buffer.from(this.token)
    );
  }

  // ──────────────────────────────────────────────────────────────
  // API: POST /modules/hermes-bridge/execute
  // Body: { tool_name: string, args: object, context?: object }
  // ──────────────────────────────────────────────────────────────

  async handleExecute(req) {
    if (!this._authenticate(req)) {
      return { status: 401, data: { error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } } };
    }

    const { tool_name, args, context } = req.body || {};

    if (typeof tool_name !== 'string' || tool_name.length === 0) {
      return { status: 400, data: { error: { code: 'INVALID_INPUT', message: 'tool_name (string) required' } } };
    }

    try {
      const result = await this._dispatch(tool_name, args || {}, context || {});
      return { status: 200, data: { result } };
    } catch (err) {
      const code = err.code || 'UNKNOWN_ERROR';
      const status = code === 'TOOL_NOT_FOUND' ? 404
        : code === 'INVALID_INPUT' ? 400
        : code === 'UPSTREAM_TIMEOUT' ? 504
        : 500;
      return {
        status,
        data: {
          error: {
            code,
            message: err.message,
            details: err.details || undefined
          }
        }
      };
    }
  }

  // ──────────────────────────────────────────────────────────────
  // API: GET /modules/hermes-bridge/catalog
  // Retorna tools en formato OpenAI function-calling.
  // ──────────────────────────────────────────────────────────────

  async handleCatalog(req) {
    if (!this._authenticate(req)) {
      return { status: 401, data: { error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } } };
    }

    const tools = this._buildCatalog();
    return { status: 200, data: { tools, count: tools.length } };
  }

  // ──────────────────────────────────────────────────────────────
  // API: GET /modules/hermes-bridge/health
  // Sin auth — health check puro.
  // ──────────────────────────────────────────────────────────────

  async handleHealth() {
    const toolCount = this.moduleLoader?.toolsRegistry?.size || 0;
    return {
      status: 200,
      data: {
        ok: true,
        tools: toolCount,
        timestamp: new Date().toISOString()
      }
    };
  }

  // ──────────────────────────────────────────────────────────────
  // Dispatcher — extraído de ai-gateway._executeToolCall
  //
  // 3 rutas, en orden:
  //   1. bus.publish / bus.publishAndWait (tools universales)
  //   2. RUTA DIRECTA: handler en módulo (toolsRegistry + loadedModules)
  //   3. BUS FALLBACK: publish + wait response (correlación por request_id)
  // ──────────────────────────────────────────────────────────────

  async _dispatch(toolName, args, ctx) {
    if (toolName === 'bus.publish' || toolName === 'bus.publishAndWait') {
      return this._universalBusTool(toolName, args, ctx);
    }

    const enrichedArgs = this._enrichArgs(args, ctx);

    // RUTA DIRECTA: si la tool tiene handler en su módulo, ejecutar sin bus.
    const toolDef = this.moduleLoader?.toolsRegistry?.get?.(toolName);
    if (toolDef?.handler && toolDef?.module) {
      const mod = this.moduleLoader?.loadedModules?.get?.(toolDef.module);
      if (mod && typeof mod[toolDef.handler] === 'function') {
        return await mod[toolDef.handler](enrichedArgs);
      }
    }

    // BUS FALLBACK: publish toolName + wait ${toolName}.response
    if (!toolDef) {
      const err = new Error(`Tool not found: ${toolName}`);
      err.code = 'TOOL_NOT_FOUND';
      throw err;
    }

    return this._busFallback(toolName, enrichedArgs);
  }

  _enrichArgs(args, ctx) {
    return {
      ...args,
      project_id:      args.project_id      ?? ctx.project_id      ?? null,
      page_id:         args.page_id         ?? ctx.page_id         ?? null,
      conversation_id: args.conversation_id ?? ctx.conversation_id ?? null,
      settings:        args.settings        ?? ctx.settings        ?? null,
      attachments:     args.attachments     ?? ctx.attachments     ?? null,
      prompt:          args.prompt          ?? ctx.prompt          ?? null,
      intencion:       args.intencion       ?? ctx.intencion       ?? null,
      _chat_context:   ctx.context          ?? null
    };
  }

  // ── bus.publish / bus.publishAndWait ──────────────────────────

  async _universalBusTool(toolName, rawArgs, ctx) {
    const args = (rawArgs && typeof rawArgs === 'object') ? rawArgs : {};
    const ev = args.event;
    const payloadProvided = args.payload && typeof args.payload === 'object' && !Array.isArray(args.payload);
    const payload = payloadProvided ? args.payload : {};

    if (typeof ev !== 'string' || ev.length === 0) {
      const err = new Error("missing 'event' (string) in bus tool args");
      err.code = 'INVALID_INPUT';
      throw err;
    }

    if (ev === 'bus.publish' || ev === 'bus.publishAndWait') {
      const err = new Error(`'${ev}' es el nombre de una tool, no de un evento del bus`);
      err.code = 'INVALID_INPUT';
      throw err;
    }

    if (!payloadProvided) {
      const err = new Error(
        `args.payload ausente o no es objeto en ${toolName} (event='${ev}', args_keys=[${Object.keys(args).join(',')}])`
      );
      err.code = 'INVALID_INPUT';
      err.details = { kind: 'domain', event: ev, args_keys: Object.keys(args), field: 'payload' };
      throw err;
    }

    const enrichedPayload = {
      project_id:     payload.project_id     ?? ctx.project_id     ?? null,
      user_id:        payload.user_id        ?? ctx.user_id        ?? 'system',
      correlation_id: payload.correlation_id ?? ctx.correlation_id ?? ctx.conversation_id ?? null,
      attachments:    payload.attachments    ?? ctx.attachments    ?? null,
      timestamp:      payload.timestamp      ?? new Date().toISOString(),
      ...payload
    };

    if (toolName === 'bus.publish') {
      this.eventBus.publish(ev, enrichedPayload);
      return { published: true, event: ev };
    }

    // bus.publishAndWait
    const responseEvent = typeof args.response_event === 'string' && args.response_event.length > 0
      ? args.response_event
      : (ev.endsWith('.request') ? ev.slice(0, -('.request'.length)) + '.response' : `${ev}.response`);
    const timeoutMs = Math.min(60000, Math.max(100, Number(args.timeout_ms) || 10000));

    if (!enrichedPayload.request_id) enrichedPayload.request_id = crypto.randomUUID();
    const reqId = enrichedPayload.request_id;

    return new Promise((resolve, reject) => {
      let unsub = null;
      const timeout = setTimeout(() => {
        if (unsub) unsub();
        const err = new Error(`bus.publishAndWait timeout: ${ev} (${timeoutMs}ms)`);
        err.code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, timeoutMs);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const data = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
          if (!data || data.request_id !== reqId) return;
          clearTimeout(timeout);
          if (unsub) unsub();
          resolve(data);
        });
        this.eventBus.publish(ev, enrichedPayload);
      } catch (err) {
        clearTimeout(timeout);
        if (unsub) unsub();
        const e = new Error(`bus.publishAndWait failed: ${err.message}`);
        e.code = 'UNKNOWN_ERROR';
        reject(e);
      }
    });
  }

  // ── Bus fallback: publish + wait correlado ────────────────────

  _busFallback(toolName, enrichedArgs) {
    const request_id = crypto.randomUUID();
    const cfg = this.config;
    let timeoutMs = toolName === 'code.orquestar'
      ? (cfg.tool_timeout_code_ms || 65000)
      : toolName === 'invoke_agent'
        ? (cfg.tool_timeout_agent_ms || 300000)
        : (cfg.tool_timeout_ms || 15000);

    return new Promise((resolve, reject) => {
      let unsub = null;
      const timeout = setTimeout(() => {
        if (unsub) unsub();
        const err = new Error(`tool timeout: ${toolName}`);
        err.code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, timeoutMs);

      unsub = this.eventBus.subscribe(`${toolName}.response`, (event) => {
        const data = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
        if (!data || data.request_id !== request_id) return;
        clearTimeout(timeout);
        if (unsub) unsub();

        if (data.error) {
          const raw = data.error;
          const errObj = (typeof raw === 'object' && raw !== null)
            ? { code: raw.code || 'UNKNOWN_ERROR', message: raw.message || String(raw), details: raw.details }
            : { code: 'UNKNOWN_ERROR', message: String(raw) };
          const err = new Error(errObj.message);
          err.code = errObj.code;
          if (errObj.details !== undefined) err.details = errObj.details;
          reject(err);
        } else {
          resolve(data.result !== undefined ? data.result : data);
        }
      });

      this.eventBus.publish(toolName, { request_id, ...enrichedArgs });
    });
  }

  // ── Catálogo de tools en formato OpenAI function-calling ──────

  _buildCatalog() {
    if (!this.moduleLoader?.toolsRegistry) return [];
    return Array.from(this.moduleLoader.toolsRegistry.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || { type: 'object', properties: {} }
      }
    }));
  }
}

module.exports = HermesBridge;
