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

const { EVENTS } = require('../../core/constants');

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

    // Unsubscribe functions for cleanup
    this.unsubscribes = [];

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
    this.config = context.config || {};

    this.logger.info('chat-session.loading', {
      module: this.name,
      version: this.version
    });

    // Register UI handlers
    await this.registerUIHandlers();

    // Subscribe to events
    await this.subscribeToEvents();

    this.logger.info('chat-session.loaded', {
      module: this.name
    });
  }

  async onUnload() {
    this.logger.info('chat-session.unloading', { module: this.name });

    // Unregister UI handlers
    if (this.uiHandler) {
      const convActions = ['load', 'create', 'list', 'get', 'update', 'delete', 'toggleContext', 'contextStats'];
      for (const action of convActions) this.uiHandler.unregister('conversation', action);

      const sessionActions = ['create', 'list', 'get', 'update', 'delete', 'messages', 'save', 'toggleContext', 'contextStats'];
      for (const action of sessionActions) this.uiHandler.unregister('session', action);
    }

    // Unsubscribe all event handlers
    for (const unsub of this.unsubscribes) {
      await unsub();
    }
    this.unsubscribes = [];

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
  // UI Handler Registration
  // ==========================================

  async registerUIHandlers() {
    if (!this.uiHandler) return;

    // Primary domain: conversation.* (replaces conversation-manager facade)
    this.uiHandler.register('conversation', 'load', this.handleConversationLoad.bind(this));
    this.uiHandler.register('conversation', 'create', this.handleConversationCreate.bind(this));
    this.uiHandler.register('conversation', 'list', this.handleConversationList.bind(this));
    this.uiHandler.register('conversation', 'get', this.handleConversationGet.bind(this));
    this.uiHandler.register('conversation', 'update', this.handleConversationUpdate.bind(this));
    this.uiHandler.register('conversation', 'delete', this.handleConversationDelete.bind(this));
    this.uiHandler.register('conversation', 'toggleContext', this.handleConversationToggleContext.bind(this));
    this.uiHandler.register('conversation', 'contextStats', this.handleConversationContextStats.bind(this));

    // Internal domain: session.* (for inter-module communication)
    this.uiHandler.register('session', 'create', this.handleUICreate.bind(this));
    this.uiHandler.register('session', 'list', this.handleUIList.bind(this));
    this.uiHandler.register('session', 'get', this.handleUIGet.bind(this));
    this.uiHandler.register('session', 'update', this.handleUIUpdate.bind(this));
    this.uiHandler.register('session', 'delete', this.handleUIDelete.bind(this));
    this.uiHandler.register('session', 'messages', this.handleUIMessages.bind(this));
    this.uiHandler.register('session', 'save', this.handleUISave.bind(this));
    this.uiHandler.register('session', 'toggleContext', this.handleUIToggleContext.bind(this));
    this.uiHandler.register('session', 'contextStats', this.handleUIContextStats.bind(this));

    this.logger.info('chat-session.ui_handlers.registered', {
      domains: {
        conversation: ['load', 'create', 'list', 'get', 'update', 'delete', 'toggleContext', 'contextStats'],
        session: ['create', 'list', 'get', 'update', 'delete', 'messages', 'save', 'toggleContext', 'contextStats']
      }
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    // Subscribe to database responses
    const unsubDb = await this.eventBus.subscribe(
      'db.query.response',
      this.onDbQueryResponse.bind(this)
    );
    this.unsubscribes.push(unsubDb);

    // Subscribe to session requests (from other modules like chat-ai-bridge)
    const unsubCreate = await this.eventBus.subscribe(
      'session.create.request',
      this.onCreateRequest.bind(this)
    );
    this.unsubscribes.push(unsubCreate);

    const unsubList = await this.eventBus.subscribe(
      'session.list.request',
      this.onListRequest.bind(this)
    );
    this.unsubscribes.push(unsubList);

    const unsubGet = await this.eventBus.subscribe(
      'session.get.request',
      this.onGetRequest.bind(this)
    );
    this.unsubscribes.push(unsubGet);

    const unsubUpdate = await this.eventBus.subscribe(
      'session.update.request',
      this.onUpdateRequest.bind(this)
    );
    this.unsubscribes.push(unsubUpdate);

    const unsubDelete = await this.eventBus.subscribe(
      'session.delete.request',
      this.onDeleteRequest.bind(this)
    );
    this.unsubscribes.push(unsubDelete);

    const unsubMessages = await this.eventBus.subscribe(
      'session.messages.request',
      this.onMessagesRequest.bind(this)
    );
    this.unsubscribes.push(unsubMessages);

    const unsubSave = await this.eventBus.subscribe(
      'session.save.request',
      this.onSaveRequest.bind(this)
    );
    this.unsubscribes.push(unsubSave);

    const unsubContext = await this.eventBus.subscribe(
      'session.context.load.request',
      this.onContextLoadRequest.bind(this)
    );
    this.unsubscribes.push(unsubContext);

    const unsubToggle = await this.eventBus.subscribe(
      'session.context.toggle.request',
      this.onToggleContextRequest.bind(this)
    );
    this.unsubscribes.push(unsubToggle);

    const unsubStats = await this.eventBus.subscribe(
      'session.context.stats.request',
      this.onContextStatsRequest.bind(this)
    );
    this.unsubscribes.push(unsubStats);

    this.logger.info('chat-session.events.subscribed', {
      events: [
        'db.query.response',
        'session.create.request',
        'session.list.request',
        'session.get.request',
        'session.update.request',
        'session.delete.request',
        'session.messages.request',
        'session.save.request',
        'session.context.load.request',
        'session.context.toggle.request',
        'session.context.stats.request'
      ]
    });
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
      metadata: options.metadata || {}
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

    await this.eventBus.publish('session.created', {
      conversation_id: conversationId,
      project_id: projectId,
      user_id: userId,
      title: conversation.title,
      created_at: now
    });

    this.logger.info({ correlationId, conversationId }, 'Conversation created');
    return conversation;
  }

  async getConversation(conversationId, correlationId) {
    // Check cache first
    if (this.conversations.has(conversationId)) {
      return this.conversations.get(conversationId);
    }

    // Not in cache - need project_id to query
    // This is a limitation - we'd need to store project mapping or require project_id
    this.logger.warn({ correlationId, conversationId }, 'Conversation not in cache');
    return null;
  }

  async listConversations(projectId, limit = 20, correlationId) {
    await this.ensureProjectSchema(projectId, correlationId);

    const rows = await this.queryDatabase(projectId,
      'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?',
      [limit],
      true,
      correlationId
    );

    const conversations = rows.map(row => ({
      id: row.id,
      project_id: row.project_id,
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
    }));

    // Update cache
    for (const conv of conversations) {
      this.conversations.set(conv.id, conv);
    }

    return conversations;
  }

  async updateConversation(conversationId, updates, correlationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const now = new Date().toISOString();
    const queryParts = [];
    const params = [];
    const updatedFields = [];

    const fields = ['title', 'system_prompt', 'model', 'provider', 'temperature', 'max_tokens', 'context_window', 'metadata'];

    for (const field of fields) {
      if (updates[field] !== undefined) {
        queryParts.push(`${field} = ?`);
        params.push(field === 'metadata' ? JSON.stringify(updates[field]) : updates[field]);
        conversation[field] = updates[field];
        updatedFields.push(field);
      }
    }

    if (queryParts.length === 0) {
      return conversation;
    }

    queryParts.push('updated_at = ?');
    params.push(now);
    params.push(conversationId);

    await this.queryDatabase(conversation.project_id,
      `UPDATE conversations SET ${queryParts.join(', ')} WHERE id = ?`,
      params,
      false,
      correlationId
    );

    conversation.updated_at = now;
    this.conversations.set(conversationId, conversation);

    await this.eventBus.publish('session.updated', {
      conversation_id: conversationId,
      updated_fields: updatedFields,
      updated_at: now
    });

    this.logger.info({ correlationId, conversationId }, 'Conversation updated');
    return conversation;
  }

  async deleteConversation(conversationId, correlationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    await this.queryDatabase(conversation.project_id,
      'DELETE FROM messages WHERE conversation_id = ?',
      [conversationId],
      false,
      correlationId
    );

    await this.queryDatabase(conversation.project_id,
      'DELETE FROM conversations WHERE id = ?',
      [conversationId],
      false,
      correlationId
    );

    const messageCount = conversation.message_count;
    this.conversations.delete(conversationId);

    await this.eventBus.publish('session.deleted', {
      conversation_id: conversationId,
      project_id: conversation.project_id,
      messages_deleted: messageCount,
      deleted_at: new Date().toISOString()
    });

    this.logger.info({ correlationId, conversationId }, 'Conversation deleted');
    return { success: true, id: conversationId, messages_deleted: messageCount };
  }

  // ==========================================
  // Message Operations
  // ==========================================

  async saveMessage(conversationId, message, correlationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
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

    await this.eventBus.publish('session.message.saved', {
      message_id: messageId,
      conversation_id: conversationId,
      project_id: conversation.project_id,
      role: message.role,
      saved_at: now
    });

    this.logger.debug({ correlationId, conversationId, messageId }, 'Message saved');
    return savedMessage;
  }

  async getMessages(conversationId, inContextOnly = false, correlationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
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
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
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

  async onListRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, project_id, limit, correlation_id } = data;

    try {
      const conversations = await this.listConversations(project_id, limit || 20, correlation_id);
      await this.eventBus.publish('session.list.response', {
        request_id,
        success: true,
        conversations,
        count: conversations.length
      });
    } catch (error) {
      await this.eventBus.publish('session.list.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  async onGetRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, conversation_id, correlation_id } = data;

    try {
      const conversation = await this.getConversation(conversation_id, correlation_id);
      await this.eventBus.publish('session.get.response', {
        request_id,
        success: true,
        conversation
      });
    } catch (error) {
      await this.eventBus.publish('session.get.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  async onUpdateRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, conversation_id, updates, correlation_id } = data;

    try {
      const conversation = await this.updateConversation(conversation_id, updates, correlation_id);
      await this.eventBus.publish('session.update.response', {
        request_id,
        success: true,
        conversation
      });
    } catch (error) {
      await this.eventBus.publish('session.update.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  async onDeleteRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, conversation_id, correlation_id } = data;

    try {
      const result = await this.deleteConversation(conversation_id, correlation_id);
      await this.eventBus.publish('session.delete.response', {
        request_id,
        success: true,
        ...result
      });
    } catch (error) {
      await this.eventBus.publish('session.delete.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  async onMessagesRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, conversation_id, in_context_only, correlation_id } = data;

    try {
      const messages = await this.getMessages(conversation_id, in_context_only, correlation_id);
      await this.eventBus.publish('session.messages.response', {
        request_id,
        success: true,
        messages,
        count: messages.length
      });
    } catch (error) {
      await this.eventBus.publish('session.messages.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  async onSaveRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, conversation_id, correlation_id } = data;

    // Build message object from either nested 'message' field or flat fields
    // chat-ai-bridge sends flat fields: { role, content, tokens, cost, metadata, ... }
    const message = data.message || {
      role: data.role,
      content: data.content,
      user_id: data.user_id,
      attachments: data.attachments,
      tokens: data.tokens,
      cost: data.cost,
      metadata: data.metadata
    };

    try {
      const savedMessage = await this.saveMessage(conversation_id, message, correlation_id);
      await this.eventBus.publish('session.save.response', {
        request_id,
        success: true,
        message: savedMessage
      });
    } catch (error) {
      await this.eventBus.publish('session.save.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  async onContextLoadRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, conversation_id, correlation_id } = data;

    try {
      const context = await this.loadConversationContext(conversation_id, correlation_id);
      await this.eventBus.publish('session.context.load.response', {
        request_id,
        success: true,
        ...context
      });
    } catch (error) {
      await this.eventBus.publish('session.context.load.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  async onToggleContextRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, project_id, message_id, in_context, correlation_id } = data;

    try {
      const result = await this.toggleMessageContext(project_id, message_id, in_context, correlation_id);
      await this.eventBus.publish('session.context.toggle.response', {
        request_id,
        success: true,
        ...result
      });
    } catch (error) {
      await this.eventBus.publish('session.context.toggle.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  async onContextStatsRequest(event) {
    const data = event.data || event.payload || event;
    const { request_id, project_id, conversation_id, correlation_id } = data;

    try {
      const stats = await this.getContextStats(project_id, conversation_id, correlation_id);
      await this.eventBus.publish('session.context.stats.response', {
        request_id,
        success: true,
        ...stats
      });
    } catch (error) {
      await this.eventBus.publish('session.context.stats.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleUICreate(data, context) {
    try {
      const { project_id, user_id, ...options } = data;
      const conversation = await this.createConversation(project_id, user_id, options, context.correlationId);
      return { status: 200, data: conversation };
    } catch (error) {
      return { status: 500, error: error.message };
    }
  }

  async handleUIList(data, context) {
    try {
      const { project_id, limit } = data;
      const conversations = await this.listConversations(project_id, limit || 20, context.correlationId);
      return { status: 200, data: { conversations, count: conversations.length } };
    } catch (error) {
      return { status: 500, error: error.message };
    }
  }

  async handleUIGet(data, context) {
    try {
      const { conversation_id } = data;
      const conversation = await this.getConversation(conversation_id, context.correlationId);
      if (!conversation) {
        return { status: 404, error: 'Conversation not found' };
      }
      return { status: 200, data: conversation };
    } catch (error) {
      return { status: 500, error: error.message };
    }
  }

  async handleUIUpdate(data, context) {
    try {
      const { conversation_id, ...updates } = data;
      const conversation = await this.updateConversation(conversation_id, updates, context.correlationId);
      return { status: 200, data: conversation };
    } catch (error) {
      return { status: 500, error: error.message };
    }
  }

  async handleUIDelete(data, context) {
    try {
      const { conversation_id } = data;
      const result = await this.deleteConversation(conversation_id, context.correlationId);
      return { status: 200, data: result };
    } catch (error) {
      return { status: 500, error: error.message };
    }
  }

  async handleUIMessages(data, context) {
    try {
      const { conversation_id, in_context_only } = data;
      const messages = await this.getMessages(conversation_id, in_context_only, context.correlationId);
      return { status: 200, data: { messages, count: messages.length } };
    } catch (error) {
      return { status: 500, error: error.message };
    }
  }

  async handleUISave(data, context) {
    try {
      const { conversation_id, message } = data;
      const savedMessage = await this.saveMessage(conversation_id, message, context.correlationId);
      return { status: 200, data: savedMessage };
    } catch (error) {
      return { status: 500, error: error.message };
    }
  }

  async handleUIToggleContext(data, context) {
    try {
      const { project_id, message_id, in_context } = data;
      const result = await this.toggleMessageContext(project_id, message_id, in_context, context.correlationId);
      return { status: 200, data: result };
    } catch (error) {
      return { status: 500, error: error.message };
    }
  }

  async handleUIContextStats(data, context) {
    try {
      const { project_id, conversation_id } = data;
      const stats = await this.getContextStats(project_id, conversation_id, context.correlationId);
      return { status: 200, data: stats };
    } catch (error) {
      return { status: 500, error: error.message };
    }
  }

  // ==========================================
  // Helper: Get Active Project
  // ==========================================

  async getActiveProjectId(correlationId) {
    const requestId = crypto.randomUUID();

    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        unsub();
        resolve(null);
      }, 5000);

      const unsub = await this.eventBus.subscribe(EVENTS.PROJECT.ACTIVE_RESPONSE, (event) => {
        const data = event.data || event;
        if (data.request_id === requestId) {
          clearTimeout(timeout);
          unsub();
          resolve(data.active_project_id || null);
        }
      });

      await this.eventBus.publish(EVENTS.PROJECT.ACTIVE_REQUEST, {
        request_id: requestId,
        correlation_id: correlationId
      });
    });
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

  async handleConversationCreate(data, request) {
    const { projectId, title, system_prompt, model, provider, temperature, max_tokens, context_window } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    try {
      let projId = projectId;
      if (!projId) {
        projId = await this.getActiveProjectId(correlationId);
        if (!projId) {
          throw { status: 400, code: 'NO_PROJECT', message: 'No active project' };
        }
      }

      const options = { title, system_prompt, model, provider, temperature, max_tokens, context_window };
      const conversation = await this.createConversation(projId, null, options, correlationId);
      return { conversation };
    } catch (error) {
      if (error.status) throw error;
      throw { status: 500, code: 'CREATE_ERROR', message: error.message };
    }
  }

  async handleConversationList(data, request) {
    const { projectId, limit } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    try {
      let projId = projectId;
      if (!projId) {
        projId = await this.getActiveProjectId(correlationId);
        if (!projId) {
          return { conversations: [], total: 0 };
        }
      }

      const conversations = await this.listConversations(projId, limit || 20, correlationId);
      return {
        conversations,
        total: conversations.length
      };
    } catch (error) {
      if (error.status) throw error;
      throw { status: 500, code: 'LIST_ERROR', message: error.message };
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

  async handleConversationUpdate(data, request) {
    const { conversationId, ...updates } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const conversation = await this.updateConversation(conversationId, updates, correlationId);
      return { conversation };
    } catch (error) {
      if (error.status) throw error;
      if (error.message?.includes('not found')) {
        throw { status: 404, code: 'NOT_FOUND', message: error.message };
      }
      throw { status: 500, code: 'UPDATE_ERROR', message: error.message };
    }
  }

  async handleConversationDelete(data, request) {
    const { conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const result = await this.deleteConversation(conversationId, correlationId);
      return {
        success: true,
        id: conversationId,
        messagesDeleted: result.messages_deleted || 0
      };
    } catch (error) {
      if (error.status) throw error;
      throw { status: 500, code: 'DELETE_ERROR', message: error.message };
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

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleCreateConversation(req, context) {
    try {
      const { project_id, user_id, ...options } = req.body || {};
      if (!project_id) {
        return { status: 400, data: { error: 'project_id is required' } };
      }
      const conversation = await this.createConversation(project_id, user_id, options, context.correlationId);
      return { status: 201, data: conversation };
    } catch (error) {
      return { status: 500, data: { error: error.message } };
    }
  }

  async handleListConversations(req, context) {
    try {
      const { project_id, limit } = req.query || {};
      if (!project_id) {
        return { status: 400, data: { error: 'project_id is required' } };
      }
      const conversations = await this.listConversations(project_id, parseInt(limit) || 20, context.correlationId);
      return { status: 200, data: { conversations, count: conversations.length } };
    } catch (error) {
      return { status: 500, data: { error: error.message } };
    }
  }

  async handleGetConversation(req, context) {
    try {
      const { id } = context.params;
      const conversation = await this.getConversation(id, context.correlationId);
      if (!conversation) {
        return { status: 404, data: { error: 'Conversation not found' } };
      }
      return { status: 200, data: conversation };
    } catch (error) {
      return { status: 500, data: { error: error.message } };
    }
  }

  async handleUpdateConversation(req, context) {
    try {
      const { id } = context.params;
      const updates = req.body || {};
      const conversation = await this.updateConversation(id, updates, context.correlationId);
      return { status: 200, data: conversation };
    } catch (error) {
      return { status: 500, data: { error: error.message } };
    }
  }

  async handleDeleteConversation(req, context) {
    try {
      const { id } = context.params;
      const result = await this.deleteConversation(id, context.correlationId);
      return { status: 200, data: result };
    } catch (error) {
      return { status: 500, data: { error: error.message } };
    }
  }

  async handleGetMessages(req, context) {
    try {
      const { id } = context.params;
      const { in_context_only } = req.query || {};
      const messages = await this.getMessages(id, in_context_only === 'true', context.correlationId);
      return { status: 200, data: { messages, count: messages.length } };
    } catch (error) {
      return { status: 500, data: { error: error.message } };
    }
  }

  async handleSaveMessage(req, context) {
    try {
      const { id } = context.params;
      const message = req.body || {};
      if (!message.role || !message.content) {
        return { status: 400, data: { error: 'role and content are required' } };
      }
      const savedMessage = await this.saveMessage(id, message, context.correlationId);
      return { status: 201, data: savedMessage };
    } catch (error) {
      return { status: 500, data: { error: error.message } };
    }
  }

  async handleGetContextStats(req, context) {
    try {
      const { id } = context.params;
      const conversation = this.conversations.get(id);
      if (!conversation) {
        return { status: 404, data: { error: 'Conversation not found' } };
      }
      const stats = await this.getContextStats(conversation.project_id, id, context.correlationId);
      return { status: 200, data: stats };
    } catch (error) {
      return { status: 500, data: { error: error.message } };
    }
  }

  async handleToggleContext(req, context) {
    try {
      const { id } = context.params; // message id
      const { in_context, project_id } = req.body || {};
      if (in_context === undefined || !project_id) {
        return { status: 400, data: { error: 'in_context and project_id are required' } };
      }
      const result = await this.toggleMessageContext(project_id, id, in_context, context.correlationId);
      return { status: 200, data: result };
    } catch (error) {
      return { status: 500, data: { error: error.message } };
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

  // ==========================================
  // Tool Handlers (for AI)
  // ==========================================

  async toolListConversations(params, context) {
    const { project_id, limit } = params;
    const conversations = await this.listConversations(project_id, limit || 20, context.correlationId);
    return {
      success: true,
      conversations: conversations.map(c => ({
        id: c.id,
        title: c.title,
        message_count: c.message_count,
        updated_at: c.updated_at
      })),
      count: conversations.length
    };
  }

  async toolGetConversation(params, context) {
    const { conversation_id } = params;
    const conversation = await this.getConversation(conversation_id, context.correlationId);
    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }
    return { success: true, conversation };
  }

  async toolGetMessages(params, context) {
    const { conversation_id, in_context_only } = params;
    const messages = await this.getMessages(conversation_id, in_context_only, context.correlationId);
    return {
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content.substring(0, 500) + (m.content.length > 500 ? '...' : ''),
        in_context: m.in_context
      })),
      count: messages.length
    };
  }
}

module.exports = ChatSessionModule;
