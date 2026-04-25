/**
 * Chat Session Module
 *
 * Persistencia de conversaciones y mensajes con gestión de contexto FIFO.
 * Extraído de conversation-manager como parte de la refactorización.
 *
 * Responsabilidades:
 * - CRUD de conversaciones (SQLite via database-manager)
 * - CRUD de mensajes
 * - Context FIFO management
 * - Schema management por proyecto
 *
 * Comunicación: 100% vía eventos MQTT
 *
 * @module chat-session
 * @version 1.0.0
 */

const crypto = require('crypto');

const { EVENTS } = require('../../../core/constants');

class ChatSessionModule {
  constructor() {
    this.name = 'chat-session';
    this.version = '1.0.0';

    // Dependencies (injected in onLoad)
    this.logger = null;
    this.eventBus = null;
    this.uiHandler = null;
    this.config = null;

    // In-memory cache
    this.conversations = new Map(); // conversationId -> conversation
    this.initializedProjects = new Set(); // Track projects with initialized schema

    // Pending requests (for request/response pattern)
    this.pendingDbRequests = new Map();

    // Startup time for health check
    this.startTime = Date.now();
  }

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.uiHandler = context.uiHandler;
    this.config = context.moduleConfig || {};

    this.logger.info('chat-session.loaded', {
      module: this.name,
      version: this.version
    });
  }

  async onUnload() {
    this.logger.info('chat-session.unloading', { module: this.name });

    // Clear pending requests
    for (const [, req] of this.pendingDbRequests.entries()) {
      clearTimeout(req.timeout);
      req.reject(new Error('Module unloading'));
    }
    this.pendingDbRequests.clear();

    // Clear cache
    this.conversations.clear();
    this.initializedProjects.clear();

    this.logger.info('chat-session.unloaded', { module: this.name });
  }

  // ==========================================
  // Database Helper (via events)
  // ==========================================

  async queryDatabase(projectId, query, params = [], readOnly = false, correlationId) {
    const requestId = crypto.randomUUID();

    const dbPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDbRequests.delete(requestId);
        reject(new Error('Database query timeout'));
      }, this.config.dbTimeout || 10000);

      this.pendingDbRequests.set(requestId, { resolve, reject, timeout });
    });

    await this.eventBus.publish('db.query.request', {
      project_id: projectId,
      query,
      params,
      read_only: readOnly,
      request_id: requestId,
      correlation_id: correlationId
    });

    return await dbPromise;
  }

  async onDbQueryResponse(event) {
    const eventData = event.data || event;
    const { request_id, success, data, rows, error } = eventData;

    const pending = this.pendingDbRequests.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingDbRequests.delete(request_id);

    if (success) {
      pending.resolve(data || rows || []);
    } else {
      const errorMsg = typeof error === 'string' ? error
        : (error?.message || JSON.stringify(error) || 'Database query failed');
      pending.reject(new Error(errorMsg));
    }
  }

  // ==========================================
  // Schema Management
  // ==========================================

  async ensureProjectSchema(projectId, correlationId) {
    if (this.initializedProjects.has(projectId)) {
      return;
    }

    this.logger.debug({ correlationId, projectId }, 'Initializing conversation schema');

    try {
      // Conversations table
      await this.queryDatabase(projectId, `
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          user_id TEXT,
          title TEXT,
          system_prompt TEXT,
          model TEXT,
          provider TEXT,
          temperature REAL,
          max_tokens INTEGER,
          context_window INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          message_count INTEGER DEFAULT 0,
          metadata TEXT
        )
      `, [], false, correlationId);

      // Messages table with context management fields
      await this.queryDatabase(projectId, `
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          attachments TEXT,
          tokens INTEGER,
          cost REAL,
          created_at TEXT NOT NULL,
          metadata TEXT,
          in_context INTEGER DEFAULT 1,
          manually_toggled INTEGER DEFAULT 0,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
      `, [], false, correlationId);

      // Indexes
      await this.queryDatabase(projectId, `
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)
      `, [], false, correlationId);

      await this.queryDatabase(projectId, `
        CREATE INDEX IF NOT EXISTS idx_messages_context ON messages(conversation_id, in_context)
      `, [], false, correlationId);

      this.initializedProjects.add(projectId);
      this.logger.info({ correlationId, projectId }, 'Schema initialized');
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to initialize schema');
      throw error;
    }
  }

  // ==========================================
  // Context FIFO Management
  // ==========================================

  async applyContextFIFO(projectId, conversationId, correlationId) {
    const contextWindow = this.config.contextWindow || 20;

    const countResult = await this.queryDatabase(projectId,
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ? AND in_context = 1',
      [conversationId],
      true,
      correlationId
    );

    const activeCount = countResult[0]?.count || 0;

    if (activeCount >= contextWindow) {
      const toDeactivate = await this.queryDatabase(projectId,
        `SELECT id FROM messages
         WHERE conversation_id = ? AND in_context = 1 AND manually_toggled = 0
         ORDER BY created_at ASC LIMIT 1`,
        [conversationId],
        true,
        correlationId
      );

      if (toDeactivate.length > 0) {
        await this.queryDatabase(projectId,
          'UPDATE messages SET in_context = 0 WHERE id = ?',
          [toDeactivate[0].id],
          false,
          correlationId
        );

        this.logger.debug({ correlationId, conversationId, messageId: toDeactivate[0].id },
          'FIFO: Deactivated oldest message');
      }
    }
  }

  async toggleMessageContext(projectId, messageId, inContext, correlationId) {
    await this.queryDatabase(projectId,
      'UPDATE messages SET in_context = ?, manually_toggled = 1 WHERE id = ?',
      [inContext ? 1 : 0, messageId],
      false,
      correlationId
    );

    this.logger.info({ correlationId, messageId, inContext }, 'Message context toggled');
    return { messageId, inContext, manuallyToggled: true };
  }

  async getContextStats(projectId, conversationId, correlationId) {
    const stats = await this.queryDatabase(projectId,
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN in_context = 1 THEN 1 ELSE 0 END) as active,
         SUM(CASE WHEN manually_toggled = 1 THEN 1 ELSE 0 END) as manually_toggled
       FROM messages WHERE conversation_id = ?`,
      [conversationId],
      true,
      correlationId
    );

    const contextWindow = this.config.contextWindow || 20;

    return {
      total: stats[0]?.total || 0,
      active: stats[0]?.active || 0,
      manuallyToggled: stats[0]?.manually_toggled || 0,
      maxContext: contextWindow,
      remaining: Math.max(0, contextWindow - (stats[0]?.active || 0))
    };
  }

  // ==========================================
  // CRUD Operations
  // ==========================================

  async createConversation(projectId, userId, options = {}, correlationId) {
    const conversationId = crypto.randomUUID();
    const now = new Date().toISOString();

    const conversation = {
      id: conversationId,
      project_id: projectId,
      user_id: userId || null,
      title: options.title || 'New Conversation',
      system_prompt: options.system_prompt || this.config.defaultSystemPrompt || 'You are a helpful AI assistant.',
      model: options.model || null,
      provider: options.provider || null,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      max_tokens: options.max_tokens || 2000,
      context_window: options.context_window || this.config.contextWindow || 20,
      created_at: now,
      updated_at: now,
      message_count: 0,
      metadata: { ...options.metadata }
    };

    await this.ensureProjectSchema(projectId, correlationId);

    await this.queryDatabase(projectId,
      `INSERT INTO conversations (id, project_id, user_id, title, system_prompt, model, provider,
        temperature, max_tokens, context_window, created_at, updated_at, message_count, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversationId, projectId, conversation.user_id, conversation.title,
        conversation.system_prompt, conversation.model, conversation.provider,
        conversation.temperature, conversation.max_tokens, conversation.context_window,
        now, now, 0, JSON.stringify(conversation.metadata)
      ],
      false,
      correlationId
    );

    this.conversations.set(conversationId, conversation);

    this.logger.info({ correlationId, conversationId }, 'Conversation created');
    return conversation;
  }

  async getConversation(conversationId, correlationId, projectId) {
    // Check cache first
    if (this.conversations.has(conversationId)) {
      return this.conversations.get(conversationId);
    }

    // Not in cache — projectId is required to know which DB to query.
    // El frontend envía project_id en cada mensaje; si no llegó es bug aguas arriba.
    if (!projectId) {
      this.logger.warn({ correlationId, conversationId }, 'chat-session.getConversation.missing_project_id');
      return null;
    }

    this.logger.info({ correlationId, conversationId, projectId }, 'Conversation cache miss - querying DB');

    try {
      await this.ensureProjectSchema(projectId, correlationId);
      const rows = await this.queryDatabase(projectId,
        'SELECT * FROM conversations WHERE id = ? LIMIT 1',
        [conversationId],
        true,
        correlationId
      );

      if (rows.length === 0) {
        this.logger.warn({ correlationId, conversationId }, 'Conversation not found in DB');
        return null;
      }

      const row = rows[0];
      const conversation = {
        id: row.id,
        project_id: row.project_id || projectId,
        user_id: row.user_id,
        title: row.title,
        system_prompt: row.system_prompt,
        model: row.model,
        provider: row.provider,
        temperature: row.temperature,
        max_tokens: row.max_tokens,
        context_window: row.context_window,
        created_at: row.created_at,
        updated_at: row.updated_at,
        message_count: row.message_count,
        metadata: row.metadata ? JSON.parse(row.metadata) : {}
      };

      // Populate cache for future lookups
      this.conversations.set(conversationId, conversation);
      this.logger.info({ correlationId, conversationId }, 'Conversation loaded from DB into cache');

      return conversation;
    } catch (error) {
      this.logger.error({ correlationId, conversationId, error: error.message }, 'Failed to load conversation from DB');
      return null;
    }
  }

  // ==========================================
  // Message Operations
  // ==========================================

  async saveMessage(conversationId, message, correlationId, projectId) {
    let conversation = this.conversations.get(conversationId);
    if (!conversation) {
      conversation = await this.getConversation(conversationId, correlationId, projectId);
      if (!conversation) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }
    }

    const messageId = message.id || crypto.randomUUID();
    const now = message.created_at || new Date().toISOString();

    // Apply FIFO before inserting
    await this.applyContextFIFO(conversation.project_id, conversationId, correlationId);

    await this.queryDatabase(conversation.project_id,
      `INSERT INTO messages (id, conversation_id, role, content, attachments, tokens, cost, created_at, metadata, in_context, manually_toggled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        messageId,
        conversationId,
        message.role,
        message.content,
        JSON.stringify(message.attachments || []),
        message.tokens || null,
        message.cost || null,
        now,
        JSON.stringify(message.metadata || {})
      ],
      false,
      correlationId
    );

    // Update conversation message count
    conversation.message_count += 1;
    await this.queryDatabase(conversation.project_id,
      'UPDATE conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?',
      [now, conversationId],
      false,
      correlationId
    );

    const savedMessage = {
      id: messageId,
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      attachments: message.attachments || [],
      tokens: message.tokens,
      cost: message.cost,
      created_at: now,
      metadata: message.metadata || {},
      in_context: true,
      manually_toggled: false
    };

    this.logger.debug({ correlationId, conversationId, messageId }, 'Message saved');
    return savedMessage;
  }

  async getMessages(conversationId, inContextOnly = false, correlationId, projectId) {
    let conversation = this.conversations.get(conversationId);
    if (!conversation) {
      // Try to load from DB before giving up
      conversation = await this.getConversation(conversationId, correlationId, projectId);
      if (!conversation) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }
    }

    const query = inContextOnly
      ? 'SELECT * FROM messages WHERE conversation_id = ? AND in_context = 1 ORDER BY created_at ASC'
      : 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC';

    const rows = await this.queryDatabase(conversation.project_id,
      query,
      [conversationId],
      true,
      correlationId
    );

    return rows.map(row => ({
      id: row.id,
      conversation_id: row.conversation_id,
      role: row.role,
      content: row.content,
      attachments: row.attachments ? JSON.parse(row.attachments) : [],
      tokens: row.tokens,
      cost: row.cost,
      created_at: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      in_context: row.in_context === 1,
      manually_toggled: row.manually_toggled === 1
    }));
  }

  async loadConversationContext(conversationId, correlationId) {
    let conversation = this.conversations.get(conversationId);
    if (!conversation) {
      // Try to load from DB before giving up
      conversation = await this.getConversation(conversationId, correlationId);
      if (!conversation) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }
    }

    const contextWindow = conversation.context_window || this.config.contextWindow || 20;

    const messages = await this.queryDatabase(conversation.project_id,
      `SELECT * FROM messages WHERE conversation_id = ? AND in_context = 1 ORDER BY created_at DESC LIMIT ?`,
      [conversationId, contextWindow],
      true,
      correlationId
    );

    // Reverse to get chronological order
    const parsedMessages = messages.reverse().map(row => ({
      id: row.id,
      conversation_id: row.conversation_id,
      role: row.role,
      content: row.content,
      attachments: row.attachments ? JSON.parse(row.attachments) : [],
      tokens: row.tokens,
      cost: row.cost,
      created_at: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      in_context: row.in_context === 1,
      manually_toggled: row.manually_toggled === 1
    }));

    const totalTokens = parsedMessages.reduce((sum, m) => sum + (m.tokens || 0), 0);
    const totalCost = parsedMessages.reduce((sum, m) => sum + (m.cost || 0), 0);

    return {
      conversation_id: conversationId,
      conversation,
      messages: parsedMessages,
      message_count: parsedMessages.length,
      total_tokens: totalTokens,
      total_cost: totalCost
    };
  }

  // ==========================================
  // Event Handlers (from other modules)
  // ==========================================

  async onCreateRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, project_id, user_id, options, correlation_id } = data;

    try {
      const conversation = await this.createConversation(project_id, user_id, options || {}, correlation_id);
      await this.eventBus.publish('session.create.response', {
        request_id,
        success: true,
        conversation
      });
    } catch (error) {
      await this.eventBus.publish('session.create.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  async onChatSendRequest(event) {
    const data = event.data || event;
    const { conversation_id, content, project_id, user_id, page, prompt, correlation_id } = data;
    if (!conversation_id || !content) return;

    try {
      const savedMessage = await this.saveMessage(
        conversation_id,
        { role: 'user', content, user_id },
        correlation_id,
        project_id
      );

      // Cargar historial reciente para que el AI tenga contexto
      const history = await this.getMessages(conversation_id, true, correlation_id, project_id).catch(() => []);
      const messages = (history || []).map(m => ({ role: m.role, content: m.content }));

      await this.eventBus.publish('chat.message.saved', {
        conversation_id, project_id,
        message_id: savedMessage?.id,
        content,
        messages,
        page: page || null,
        prompt: prompt || null
      });
    } catch (err) {
      this.logger?.error('chat-session.send.failed', { conversation_id, error: err.message });
    }
  }

  async onChatAiResponse(event) {
    const data = event.data || event;
    const { conversation_id, content, tokens, cost, model, provider, tool_calls_executed, agent_name, project_id, correlation_id } = data;
    if (!conversation_id || !content) return;

    const source = agent_name
      ? { type: 'agent', name: agent_name }
      : { type: 'llm', provider: provider || 'unknown', model: model || 'unknown' };

    try {
      const saved = await this.saveMessage(
        conversation_id,
        {
          role: 'assistant', content, tokens, cost,
          metadata: { model, provider, tool_calls_executed, source }
        },
        correlation_id,
        project_id
      );
      await this.eventBus.publish('chat.assistant.saved', {
        conversation_id,
        message_id: saved?.id || null,
        role: 'assistant',
        content,
        source
      });
    } catch (err) {
      this.logger?.error('chat-session.ai-response.failed', { conversation_id, error: err.message });
    }
  }

  async onAgentCompleted(event) {
    const data = event.data || event;
    const { conversation_id, result, agent_name, project_id, correlation_id } = data;
    if (!conversation_id) return;

    const rawContent = typeof result === 'string' ? result
      : result?.content || result?.response || result?.text || JSON.stringify(result);

    try {
      const saved = await this.saveMessage(
        conversation_id,
        {
          role: 'assistant',
          content: rawContent,
          metadata: { type: 'agent_result', agent: agent_name, source: { type: 'agent', name: agent_name } }
        },
        correlation_id,
        project_id
      );
      await this.eventBus.publish('chat.assistant.saved', {
        conversation_id,
        message_id: saved?.id || null,
        role: 'assistant',
        content: rawContent,
        source: { type: 'agent', name: agent_name }
      });
    } catch (err) {
      this.logger?.error('chat-session.agent-completed.failed', { conversation_id, error: err.message });
    }
  }

  async onAgentFailed(event) {
    const data = event.data || event;
    const { conversation_id, error, agent_name, project_id, correlation_id } = data;
    if (!conversation_id) return;

    const content = 'Lo siento, hubo un problema procesando tu solicitud. Por favor, intenta de nuevo.';

    try {
      const saved = await this.saveMessage(
        conversation_id,
        {
          role: 'assistant',
          content,
          metadata: { type: 'agent_error', agent: agent_name, error }
        },
        correlation_id,
        project_id
      );
      await this.eventBus.publish('chat.assistant.saved', {
        conversation_id,
        message_id: saved?.id || null,
        role: 'assistant',
        content,
        source: { type: 'agent', name: agent_name }
      });
    } catch (err) {
      this.logger?.error('chat-session.agent-failed.failed', { conversation_id, error: err.message });
    }
  }

  // ==========================================
  // UI Handlers: conversation.* (frontend facing, camelCase)
  // ==========================================

  async handleConversationLoad(data, request) {
    const { conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const context = await this.loadConversationContext(conversationId, correlationId);
      return {
        conversationId,
        messages: context.messages || [],
        conversation: context.conversation
      };
    } catch (error) {
      if (error.status) throw error;
      throw { status: 500, code: 'LOAD_ERROR', message: error.message };
    }
  }

  async handleConversationGet(data, request) {
    const { conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const conversation = await this.getConversation(conversationId, correlationId);
      const messages = await this.getMessages(conversationId, false, correlationId);
      return { conversation, messages };
    } catch (error) {
      if (error.status) throw error;
      throw { status: 500, code: 'GET_ERROR', message: error.message };
    }
  }

  async handleConversationToggleContext(data, request) {
    const { projectId, messageId, inContext } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    if (!projectId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'projectId is required' };
    }
    if (!messageId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'messageId is required' };
    }
    if (inContext === undefined) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'inContext is required' };
    }

    try {
      const result = await this.toggleMessageContext(projectId, messageId, inContext, correlationId);
      return {
        success: true,
        messageId: result.messageId,
        inContext: result.inContext,
        manuallyToggled: result.manuallyToggled
      };
    } catch (error) {
      if (error.status) throw error;
      throw { status: 500, code: 'TOGGLE_ERROR', message: error.message };
    }
  }

  async handleConversationContextStats(data, request) {
    const { projectId, conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    if (!projectId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'projectId is required' };
    }
    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const stats = await this.getContextStats(projectId, conversationId, correlationId);
      return {
        total: stats.total,
        active: stats.active,
        manuallyToggled: stats.manuallyToggled,
        maxContext: stats.maxContext,
        remaining: stats.remaining
      };
    } catch (error) {
      if (error.status) throw error;
      throw { status: 500, code: 'STATS_ERROR', message: error.message };
    }
  }


  async handleHealthCheck(req, context) {
    const uptime = (Date.now() - this.startTime) / 1000;
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime,
        conversations_cached: this.conversations.size,
        projects_initialized: this.initializedProjects.size,
        timestamp: new Date().toISOString()
      }
    };
  }

}

module.exports = ChatSessionModule;
