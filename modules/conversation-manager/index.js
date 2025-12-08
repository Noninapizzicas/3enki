const crypto = require('crypto');

const { EVENTS, FIELDS, HELPERS, CONFIG, ERRORS } = require('../../core/constants');

/**
 * Conversation Manager Module
 *
 * Event-driven conversation management with full context:
 * - Project context (metadata, storage, available tools)
 * - Conversation context (message history with configurable window)
 * - Integration with ai-gateway for AI responses
 * - Support for attachments via storage-manager
 * - Per-conversation AI settings (model, temperature, etc.)
 */
class ConversationManagerModule {
  constructor() {
    this.name = 'conversation-manager';
    this.version = '1.0.0';

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;

    // In-memory state
    this.conversations = new Map(); // conversationId -> conversation
    this.messages = new Map(); // conversationId -> [messages]
    this.initializedProjects = new Set(); // Track projects with initialized schema

    // Pending requests
    this.pendingDbRequests = new Map();
    this.pendingAIRequests = new Map();
    this.pendingProjectRequests = new Map();
    this.pendingStorageRequests = new Map();

    // Unsubscribe functions
    this.unsubscribes = [];
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('conversation-manager.loading', { module: this.name });

    // Subscribe to responses
    const unsubDb = await this.eventBus.subscribe(EVENTS.DB.QUERY_RESPONSE,
      this.onDbQueryResponse.bind(this));
    this.unsubscribes.push(unsubDb);

    const unsubAI = await this.eventBus.subscribe(EVENTS.AI.CHAT_RESPONSE,
      this.onAIChatResponse.bind(this));
    this.unsubscribes.push(unsubAI);

    const unsubProject = await this.eventBus.subscribe(EVENTS.PROJECT.GET_RESPONSE,
      this.onProjectGetResponse.bind(this));
    this.unsubscribes.push(unsubProject);

    const unsubStorage = await this.eventBus.subscribe(EVENTS.STORAGE.INFO_RESPONSE,
      this.onStorageInfoResponse.bind(this));
    this.unsubscribes.push(unsubStorage);

    // Subscribe to query events
    const unsubGet = await this.eventBus.subscribe(EVENTS.CONVERSATION.GET_REQUEST,
      this.onGetConversationRequest.bind(this));
    this.unsubscribes.push(unsubGet);

    const unsubList = await this.eventBus.subscribe(EVENTS.CONVERSATION.LIST_REQUEST,
      this.onListConversationsRequest.bind(this));
    this.unsubscribes.push(unsubList);

    const unsubMsgList = await this.eventBus.subscribe(EVENTS.MESSAGE.LIST_REQUEST,
      this.onListMessagesRequest.bind(this));
    this.unsubscribes.push(unsubMsgList);

    const unsubSend = await this.eventBus.subscribe('conversation.send.request',
      this.onSendMessageRequest.bind(this));
    this.unsubscribes.push(unsubSend);

    // Note: Schema is initialized per-project on first access (ensureProjectSchema)
    // Conversations are loaded on-demand via loadProjectConversations

    this.logger.info({ correlationId: 'system' }, 'Conversation Manager module loaded');
  }

  async onUnload() {
    this.logger.info({ correlationId: 'system' }, 'Conversation Manager module unloading');

    // Unsubscribe all
    for (const unsub of this.unsubscribes) {
      await unsub();
    }
    this.unsubscribes = [];

    // Clear pending requests
    for (const pending of [
      this.pendingDbRequests,
      this.pendingAIRequests,
      this.pendingProjectRequests,
      this.pendingStorageRequests
    ]) {
      for (const [, req] of pending.entries()) {
        clearTimeout(req.timeout);
        req.reject(new Error('Module unloading'));
      }
      pending.clear();
    }

    this.logger.info({ correlationId: 'system' }, 'Conversation Manager module unloaded');
  }

  // ==================== DATABASE HELPERS ====================

  async queryDatabase(projectId, query, params = [], readOnly = false, correlationId) {
    const requestId = crypto.randomUUID();

    const dbPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDbRequests.delete(requestId);
        reject(new Error('Database query timeout'));
      }, this.config.dbTimeout || 10000);

      this.pendingDbRequests.set(requestId, { resolve, reject, timeout });
    });

    await this.eventBus.publish(EVENTS.DB.QUERY_REQUEST, {
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
    // Handle both wrapped (event.data) and unwrapped event formats
    const eventData = event.data || event;
    const { request_id, success, data, rows, error } = eventData;

    const pending = this.pendingDbRequests.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingDbRequests.delete(request_id);

    if (success) {
      // database-manager sends 'data', fallback to 'rows' for compatibility
      pending.resolve(data || rows || []);
    } else {
      pending.reject(new Error(error || 'Database query failed'));
    }
  }

  // ==================== INITIALIZATION ====================

  /**
   * Ensure schema exists for a specific project
   * Each project has its own database with conversations and messages tables
   */
  async ensureProjectSchema(projectId, correlationId) {
    // Skip if already initialized
    if (this.initializedProjects.has(projectId)) {
      return;
    }

    this.logger.debug({ correlationId, projectId }, 'Initializing conversation schema for project');

    try {
      // Conversations table (project_id column kept for potential cross-project queries)
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

      // Messages table
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
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
      `, [], false, correlationId);

      // Index for messages by conversation
      await this.queryDatabase(projectId, `
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)
      `, [], false, correlationId);

      this.initializedProjects.add(projectId);
      this.logger.info({ correlationId, projectId }, 'Conversation schema initialized for project');
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to initialize schema for project');
      throw error;
    }
  }

  /**
   * Load conversations for a specific project (lazy loading)
   * Called when accessing project conversations for the first time
   */
  async loadProjectConversations(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Loading conversations for project');

    try {
      // Ensure schema exists for this project
      await this.ensureProjectSchema(projectId, correlationId);

      const rows = await this.queryDatabase(projectId,
        'SELECT * FROM conversations ORDER BY updated_at DESC',
        [],
        true,
        correlationId
      );

      let loadedCount = 0;
      for (const row of rows) {
        // Skip if already in memory (from another load)
        if (this.conversations.has(row.id)) {
          continue;
        }

        const conversation = {
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
        };

        this.conversations.set(conversation.id, conversation);
        loadedCount++;
      }

      this.logger.info({ correlationId, projectId, loadedCount, totalRows: rows.length }, 'Loaded project conversations');
      return rows.length;
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to load project conversations');
      throw error;
    }
  }

  // ==================== CONTEXT LOADING ====================

  async loadProjectContext(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Loading project context');

    const requestId = crypto.randomUUID();

    // Request project details
    const projectPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingProjectRequests.delete(requestId);
        reject(new Error('Project request timeout'));
      }, this.config.dbTimeout || 10000);

      this.pendingProjectRequests.set(requestId, { resolve, reject, timeout });
    });

    await this.eventBus.publish(EVENTS.PROJECT.GET_REQUEST, {
      request_id: requestId,
      project_id: projectId,
      correlation_id: correlationId
    });

    const projectData = await projectPromise;

    // Optionally load storage info
    let storageInfo = null;
    if (this.config.includeStorageInfo) {
      const storageRequestId = crypto.randomUUID();

      const storagePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingStorageRequests.delete(storageRequestId);
          resolve(null); // Optional, don't fail
        }, this.config.dbTimeout || 10000);

        this.pendingStorageRequests.set(storageRequestId, { resolve, reject, timeout });
      });

      await this.eventBus.publish(EVENTS.STORAGE.INFO_REQUEST, {
        request_id: storageRequestId,
        project_id: projectId,
        correlation_id: correlationId
      });

      storageInfo = await storagePromise;
    }

    return {
      project_id: projectId,
      project_name: projectData?.name,
      project_description: projectData?.description,
      storage_info: storageInfo,
      available_tools: [], // TODO: load from tool-orchestrator
      metadata: projectData?.metadata || {}
    };
  }

  async onProjectGetResponse(event) {
    const { request_id, success, project } = event;

    const pending = this.pendingProjectRequests.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingProjectRequests.delete(request_id);

    if (success) {
      pending.resolve(project);
    } else {
      pending.reject(new Error('Failed to get project'));
    }
  }

  async onStorageInfoResponse(event) {
    const { request_id, success, storage } = event;

    const pending = this.pendingStorageRequests.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingStorageRequests.delete(request_id);

    if (success) {
      pending.resolve(storage);
    } else {
      pending.resolve(null); // Optional
    }
  }

  async loadConversationContext(conversationId, correlationId) {
    this.logger.debug({ correlationId, conversationId }, 'Loading conversation context');

    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Load messages (limited by context window)
    const contextWindow = conversation.context_window || this.config.contextWindow || 20;

    const messages = await this.queryDatabase(conversation.project_id,
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`,
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
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    }));

    const totalTokens = parsedMessages.reduce((sum, m) => sum + (m.tokens || 0), 0);
    const totalCost = parsedMessages.reduce((sum, m) => sum + (m.cost || 0), 0);

    return {
      conversation_id: conversationId,
      messages: parsedMessages,
      message_count: parsedMessages.length,
      total_tokens: totalTokens,
      total_cost: totalCost
    };
  }

  // ==================== CONVERSATION CRUD ====================

  async createConversation(projectId, userId, options = {}, correlationId) {
    const conversationId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.logger.info({ correlationId, conversationId, projectId, userId }, 'Creating conversation');

    const conversation = {
      id: conversationId,
      project_id: projectId,
      user_id: userId || null,
      title: options.title || 'New Conversation',
      system_prompt: options.system_prompt || this.config.defaultSystemPrompt,
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

    try {
      // Ensure schema exists for this project
      await this.ensureProjectSchema(projectId, correlationId);

      await this.queryDatabase(projectId,
        `INSERT INTO conversations (id, project_id, user_id, title, system_prompt, model, provider,
          temperature, max_tokens, context_window, created_at, updated_at, message_count, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          conversationId,
          projectId,
          conversation.user_id,
          conversation.title,
          conversation.system_prompt,
          conversation.model,
          conversation.provider,
          conversation.temperature,
          conversation.max_tokens,
          conversation.context_window,
          now,
          now,
          0,
          JSON.stringify(conversation.metadata)
        ],
        false,
        correlationId
      );

      this.conversations.set(conversationId, conversation);

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('conversation.created.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.gauge('conversation.active.count', this.conversations.size);

      await this.eventBus.publish(EVENTS.CONVERSATION.CREATED, {
        conversation_id: conversationId,
        project_id: projectId,
        user_id: userId,
        title: conversation.title,
        created_at: now
      });

      this.logger.info({ correlationId, conversationId }, 'Conversation created');

      return conversation;
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('conversation.error.total', 1, { operation: 'create' });
    // → Counter extracted from events
      this.logger.error({ correlationId, conversationId, error: error.message },
        'Failed to create conversation');
      throw error;
    }
  }

  async updateConversation(conversationId, updates, correlationId) {
    this.logger.info({ correlationId, conversationId, updates }, 'Updating conversation');

    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const now = new Date().toISOString();
    const updatedFields = [];
    const queryParts = [];
    const params = [];

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

    try {
      await this.queryDatabase(conversation.project_id,
        `UPDATE conversations SET ${queryParts.join(', ')} WHERE id = ?`,
        params,
        false,
        correlationId
      );

      conversation.updated_at = now;
      this.conversations.set(conversationId, conversation);

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('conversation.updated.total');
    // → Counter extracted from events

      await this.eventBus.publish(EVENTS.CONVERSATION.UPDATED, {
        conversation_id: conversationId,
        updated_fields: updatedFields,
        updated_at: now
      });

      this.logger.info({ correlationId, conversationId }, 'Conversation updated');

      return conversation;
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('conversation.error.total', 1, { operation: 'update' });
    // → Counter extracted from events
      this.logger.error({ correlationId, conversationId, error: error.message },
        'Failed to update conversation');
      throw error;
    }
  }

  async deleteConversation(conversationId, correlationId) {
    this.logger.info({ correlationId, conversationId }, 'Deleting conversation');

    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    try {
      // Delete messages (CASCADE should handle this, but explicit for clarity)
      const messagesDeleted = await this.queryDatabase(conversation.project_id,
        'DELETE FROM messages WHERE conversation_id = ?',
        [conversationId],
        false,
        correlationId
      );

      // Delete conversation
      await this.queryDatabase(conversation.project_id,
        'DELETE FROM conversations WHERE id = ?',
        [conversationId],
        false,
        correlationId
      );

      this.conversations.delete(conversationId);
      this.messages.delete(conversationId);

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('conversation.deleted.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.gauge('conversation.active.count', this.conversations.size);

      await this.eventBus.publish(EVENTS.CONVERSATION.DELETED, {
        conversation_id: conversationId,
        project_id: conversation.project_id,
        messages_deleted: conversation.message_count,
        deleted_at: new Date().toISOString()
      });

      this.logger.info({ correlationId, conversationId }, 'Conversation deleted');

      return { success: true, id: conversationId, messages_deleted: conversation.message_count };
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('conversation.error.total', 1, { operation: 'delete' });
    // → Counter extracted from events
      this.logger.error({ correlationId, conversationId, error: error.message },
        'Failed to delete conversation');
      throw error;
    }
  }

  // ==================== MESSAGING ====================

  async sendMessage(conversationId, content, userId, attachments = [], metadata = {}, correlationId) {
    const startTime = Date.now();
    this.logger.info({ correlationId, conversationId, userId }, 'Sending message');

    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    try {
      // Create user message
      const userMessageId = crypto.randomUUID();
      const now = new Date().toISOString();

      const userMessage = {
        id: userMessageId,
        conversation_id: conversationId,
        role: 'user',
        content,
        attachments,
        tokens: null,
        cost: null,
        created_at: now,
        metadata
      };

      // Save user message
      await this.queryDatabase(conversation.project_id,
        `INSERT INTO messages (id, conversation_id, role, content, attachments, tokens, cost, created_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userMessageId,
          conversationId,
          'user',
          content,
          JSON.stringify(attachments),
          null,
          null,
          now,
          JSON.stringify(metadata)
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

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('message.sent.total');
    // → Counter extracted from events

      await this.eventBus.publish(EVENTS.MESSAGE.SENT, {
        message_id: userMessageId,
        conversation_id: conversationId,
        project_id: conversation.project_id,
        user_id: userId,
        content,
        attachments,
        sent_at: now
      });

      // Load full context for AI
      const conversationContext = await this.loadConversationContext(conversationId, correlationId);
      const projectContext = await this.loadProjectContext(conversation.project_id, correlationId);

      // Build messages for AI
      const aiMessages = [];

      // System prompt with project context
      if (conversation.system_prompt) {
        let systemContent = conversation.system_prompt;

        if (this.config.includeProjectContext && projectContext) {
          systemContent += `\n\nProject Context:\n- Project: ${projectContext.project_name}\n- Description: ${projectContext.project_description}`;

          if (projectContext.storage_info) {
            systemContent += `\n- Files: ${projectContext.storage_info.file_count} files, ${projectContext.storage_info.total_size} bytes`;
          }
        }

        aiMessages.push({ role: 'system', content: systemContent });
      }

      // Add conversation history
      for (const msg of conversationContext.messages) {
        aiMessages.push({ role: msg.role, content: msg.content });
      }

      // Call AI
      const aiResponse = await this.callAI(aiMessages, conversation, correlationId);

      // Create assistant message
      const assistantMessageId = crypto.randomUUID();
      const assistantNow = new Date().toISOString();

      const assistantMessage = {
        id: assistantMessageId,
        conversation_id: conversationId,
        role: 'assistant',
        content: aiResponse.content,
        attachments: [],
        tokens: aiResponse.tokens || null,
        cost: aiResponse.cost || null,
        created_at: assistantNow,
        metadata: {
          model: aiResponse.model,
          provider: aiResponse.provider
        }
      };

      // Save assistant message
      await this.queryDatabase(conversation.project_id,
        `INSERT INTO messages (id, conversation_id, role, content, attachments, tokens, cost, created_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assistantMessageId,
          conversationId,
          'assistant',
          aiResponse.content,
          '[]',
          aiResponse.tokens,
          aiResponse.cost,
          assistantNow,
          JSON.stringify(assistantMessage.metadata)
        ],
        false,
        correlationId
      );

      // Update conversation
      conversation.message_count += 1;
      await this.queryDatabase(conversation.project_id,
        'UPDATE conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?',
        [assistantNow, conversationId],
        false,
        correlationId
      );

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('message.received.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.timing('conversation.message.duration', Date.now() - startTime);

      await this.eventBus.publish(EVENTS.MESSAGE.RECEIVED, {
        message_id: assistantMessageId,
        conversation_id: conversationId,
        project_id: conversation.project_id,
        content: aiResponse.content,
        tokens: aiResponse.tokens,
        cost: aiResponse.cost,
        model: aiResponse.model,
        provider: aiResponse.provider,
        received_at: assistantNow
      });

      this.logger.info({ correlationId, conversationId, tokens: aiResponse.tokens },
        'Message sent and AI response received');

      return {
        user_message: userMessage,
        assistant_message: assistantMessage,
        tokens_used: aiResponse.tokens,
        cost: aiResponse.cost,
        duration: Date.now() - startTime
      };
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('conversation.error.total', 1, { operation: 'send_message' });
    // → Counter extracted from events
      this.logger.error({ correlationId, conversationId, error: error.message },
        'Failed to send message');
      throw error;
    }
  }

  async callAI(messages, conversation, correlationId) {
    const requestId = crypto.randomUUID();

    const aiPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAIRequests.delete(requestId);
        reject(new Error('AI request timeout'));
      }, this.config.aiTimeout || 60000);

      this.pendingAIRequests.set(requestId, { resolve, reject, timeout });
    });

    await this.eventBus.publish(EVENTS.AI.CHAT_REQUEST, {
      request_id: requestId,
      messages,
      provider: conversation.provider || 'auto',
      model: conversation.model || null,
      temperature: conversation.temperature,
      max_tokens: conversation.max_tokens,
      project_id: conversation.project_id,
      correlation_id: correlationId
    });

    return await aiPromise;
  }

  async onAIChatResponse(event) {
    const { request_id, success, message, tokens, cost, model, provider, error } = event;

    const pending = this.pendingAIRequests.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingAIRequests.delete(request_id);

    if (success) {
      pending.resolve({
        content: message?.content || message,
        tokens,
        cost,
        model,
        provider
      });
    } else {
      pending.reject(new Error(error || 'AI request failed'));
    }
  }

  async getMessages(conversationId, limit = 100, offset = 0, correlationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const messages = await this.queryDatabase(conversation.project_id,
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`,
      [conversationId, limit, offset],
      true,
      correlationId
    );

    return messages.map(row => ({
      id: row.id,
      conversation_id: row.conversation_id,
      role: row.role,
      content: row.content,
      attachments: row.attachments ? JSON.parse(row.attachments) : [],
      tokens: row.tokens,
      cost: row.cost,
      created_at: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    }));
  }

  // ==================== EVENT HANDLERS ====================

  async onGetConversationRequest(event) {
    const { request_id, conversation_id, correlation_id } = event;

    try {
      const conversation = this.conversations.get(conversation_id);

      await this.eventBus.publish(EVENTS.CONVERSATION.GET_RESPONSE, {
        request_id,
        success: !!conversation,
        conversation: conversation || null,
        error: conversation ? null : 'Conversation not found'
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.CONVERSATION.GET_RESPONSE, {
        request_id,
        success: false,
        conversation: null,
        error: error.message
      });
    }
  }

  async onListConversationsRequest(event) {
    const { request_id, project_id, correlation_id } = event;

    try {
      let conversations = Array.from(this.conversations.values());

      if (project_id) {
        conversations = conversations.filter(c => c.project_id === project_id);
      }

      await this.eventBus.publish(EVENTS.CONVERSATION.LIST_RESPONSE, {
        request_id,
        success: true,
        conversations,
        count: conversations.length
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.CONVERSATION.LIST_RESPONSE, {
        request_id,
        success: false,
        conversations: [],
        count: 0,
        error: error.message
      });
    }
  }

  async onListMessagesRequest(event) {
    const { request_id, conversation_id, limit, offset, correlation_id } = event;

    try {
      const messages = await this.getMessages(conversation_id, limit, offset, correlation_id);

      await this.eventBus.publish(EVENTS.MESSAGE.LIST_RESPONSE, {
        request_id,
        success: true,
        messages,
        count: messages.length
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.MESSAGE.LIST_RESPONSE, {
        request_id,
        success: false,
        messages: [],
        count: 0,
        error: error.message
      });
    }
  }

  async onSendMessageRequest(event) {
    const { request_id, conversation_id, content, user_id, attachments, metadata, correlation_id } = event;

    try {
      const result = await this.sendMessage(
        conversation_id,
        content,
        user_id,
        attachments || [],
        metadata || {},
        correlation_id
      );

      await this.eventBus.publish('conversation.send.response', {
        request_id,
        success: true,
        ...result
      });
    } catch (error) {
      await this.eventBus.publish('conversation.send.response', {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  // ==================== HTTP API HANDLERS ====================

  async handleCreateConversation(req, res) {
    const correlationId = crypto.randomUUID();
    const { project_id, user_id, ...options } = req.body;

    this.logger.info({ correlationId, projectId: project_id }, 'HTTP: Create conversation');

    if (!project_id) {
      return res.status(400).json({ success: false, error: 'project_id is required' });
    }

    try {
      const conversation = await this.createConversation(project_id, user_id, options, correlationId);
      res.status(201).json({ success: true, conversation });
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'HTTP: Failed to create conversation');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleListConversations(req, res) {
    const correlationId = crypto.randomUUID();
    const { project_id } = req.query;

    this.logger.debug({ correlationId, projectId: project_id }, 'HTTP: List conversations');

    try {
      // If project_id provided, load conversations from that project's DB
      if (project_id) {
        await this.loadProjectConversations(project_id, correlationId);
      }

      let conversations = Array.from(this.conversations.values());

      if (project_id) {
        conversations = conversations.filter(c => c.project_id === project_id);
      }

      // Sort by updated_at descending
      conversations.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

      res.json({ success: true, conversations, count: conversations.length });
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'HTTP: Failed to list conversations');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGetConversation(req, res) {
    const correlationId = crypto.randomUUID();
    const { id } = req.params;

    this.logger.debug({ correlationId, conversationId: id }, 'HTTP: Get conversation');

    try {
      const conversation = this.conversations.get(id);
      if (!conversation) {
        return res.status(404).json({ success: false, error: 'Conversation not found' });
      }

      const messages = await this.getMessages(id, 100, 0, correlationId);
      const projectContext = await this.loadProjectContext(conversation.project_id, correlationId);

      res.json({
        success: true,
        conversation,
        messages,
        project_context: projectContext
      });
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to get conversation');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleUpdateConversation(req, res) {
    const correlationId = crypto.randomUUID();
    const { id } = req.params;
    const updates = req.body;

    this.logger.info({ correlationId, conversationId: id }, 'HTTP: Update conversation');

    try {
      const conversation = await this.updateConversation(id, updates, correlationId);
      res.json({ success: true, conversation });
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to update conversation');

      if (error.message.includes('not found')) {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleDeleteConversation(req, res) {
    const correlationId = crypto.randomUUID();
    const { id } = req.params;

    this.logger.info({ correlationId, conversationId: id }, 'HTTP: Delete conversation');

    try {
      const result = await this.deleteConversation(id, correlationId);
      res.json({ success: true, ...result, message: 'Conversation deleted successfully' });
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to delete conversation');

      if (error.message.includes('not found')) {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleSendMessage(req, res) {
    const correlationId = crypto.randomUUID();
    const { id } = req.params;
    const { content, user_id, attachments, metadata } = req.body;

    this.logger.info({ correlationId, conversationId: id }, 'HTTP: Send message');

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    try {
      const result = await this.sendMessage(id, content, user_id, attachments || [], metadata || {}, correlationId);
      res.json({ success: true, ...result });
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to send message');

      if (error.message.includes('not found')) {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGetMessages(req, res) {
    const correlationId = crypto.randomUUID();
    const { id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    this.logger.debug({ correlationId, conversationId: id }, 'HTTP: Get messages');

    try {
      const messages = await this.getMessages(id, parseInt(limit), parseInt(offset), correlationId);

      const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
      const totalCost = messages.reduce((sum, m) => sum + (m.cost || 0), 0);

      res.json({
        success: true,
        messages,
        count: messages.length,
        total_tokens: totalTokens,
        total_cost: totalCost
      });
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to get messages');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGetContext(req, res) {
    const correlationId = crypto.randomUUID();
    const { id } = req.params;

    this.logger.debug({ correlationId, conversationId: id }, 'HTTP: Get context');

    try {
      const conversation = this.conversations.get(id);
      if (!conversation) {
        return res.status(404).json({ success: false, error: 'Conversation not found' });
      }

      const projectContext = await this.loadProjectContext(conversation.project_id, correlationId);
      const conversationContext = await this.loadConversationContext(id, correlationId);

      res.json({
        success: true,
        project_context: projectContext,
        conversation_context: conversationContext
      });
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to get context');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /ui/state - UI-ready endpoint for conversation management
   * Returns data structured for direct UI consumption
   */
  async handleUIState(req, res) {
    const correlationId = crypto.randomUUID();
    const { project_id } = req.query;

    this.logger.debug({ correlationId, projectId: project_id }, 'HTTP: Get UI state');

    if (!project_id) {
      return res.status(400).json({ success: false, error: 'project_id is required' });
    }

    try {
      // Load conversations for this project
      await this.loadProjectConversations(project_id, correlationId);

      // Get conversations for this project
      const conversations = Array.from(this.conversations.values())
        .filter(c => c.project_id === project_id)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

      // Calculate stats
      const totalMessages = conversations.reduce((sum, c) => sum + (c.message_count || 0), 0);
      const activeToday = conversations.filter(c => {
        const updated = new Date(c.updated_at);
        const today = new Date();
        return updated.toDateString() === today.toDateString();
      }).length;

      // Group by date for UI sections
      const grouped = {};
      const now = new Date();
      const todayStr = now.toDateString();
      const yesterdayStr = new Date(now - 86400000).toDateString();

      for (const conv of conversations) {
        const updatedDate = new Date(conv.updated_at);
        const dateStr = updatedDate.toDateString();

        let groupKey;
        if (dateStr === todayStr) {
          groupKey = 'today';
        } else if (dateStr === yesterdayStr) {
          groupKey = 'yesterday';
        } else if (now - updatedDate < 7 * 86400000) {
          groupKey = 'this_week';
        } else if (now - updatedDate < 30 * 86400000) {
          groupKey = 'this_month';
        } else {
          groupKey = 'older';
        }

        if (!grouped[groupKey]) {
          grouped[groupKey] = [];
        }

        // UI-ready conversation item
        grouped[groupKey].push({
          id: conv.id,
          title: conv.title || 'New Conversation',
          displayTitle: conv.title || 'New Conversation',
          subtitle: `${conv.message_count || 0} messages`,
          icon: '💬',
          message_count: conv.message_count || 0,
          model: conv.model,
          provider: conv.provider,
          updated_at: conv.updated_at,
          created_at: conv.created_at,
          isRecent: (now - new Date(conv.updated_at)) < 3600000 // within 1 hour
        });
      }

      // UI sections in display order
      const sections = ['today', 'yesterday', 'this_week', 'this_month', 'older'];
      const sectionLabels = {
        today: 'Hoy',
        yesterday: 'Ayer',
        this_week: 'Esta semana',
        this_month: 'Este mes',
        older: 'Anteriores'
      };

      const uiSections = sections
        .filter(key => grouped[key]?.length > 0)
        .map(key => ({
          id: key,
          label: sectionLabels[key],
          conversations: grouped[key]
        }));

      res.json({
        success: true,
        project_id,
        sections: uiSections,
        conversations: conversations.map(c => ({
          id: c.id,
          title: c.title,
          displayTitle: c.title || 'New Conversation',
          message_count: c.message_count,
          model: c.model,
          provider: c.provider,
          updated_at: c.updated_at,
          created_at: c.created_at
        })),
        stats: {
          total_conversations: conversations.length,
          total_messages: totalMessages,
          active_today: activeToday
        }
      });
    } catch (error) {
      this.logger.error({ correlationId, error: error.message, stack: error.stack }, 'HTTP: Failed to get UI state');
      res.status(500).json({
        success: false,
        error: error.message,
        details: 'Check server logs for more info'
      });
    }
  }

  async handleHealthCheck(req, res) {
    res.json({
      status: 'healthy',
      module: 'conversation-manager',
      conversations_count: this.conversations.size,
      pending_requests: this.pendingDbRequests.size + this.pendingAIRequests.size,
      uptime: process.uptime()
    });
  }

  async handleGetMetrics(req, res) {
    res.json({
      module: 'conversation-manager',
      metrics: {
        conversations_count: this.conversations.size,
        pending_db_requests: this.pendingDbRequests.size,
        pending_ai_requests: this.pendingAIRequests.size
      }
    });
  }
}

module.exports = ConversationManagerModule;
