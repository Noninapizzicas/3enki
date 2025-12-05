
const { EVENTS, FIELDS, HELPERS, CONFIG, ERRORS } = require('../../core/constants');
/**
 * Chat API Module
 * Conversation management with AI integration using event-driven architecture
 *
 * Integrates with:
 * - database-manager (persistence via events)
 * - ai-connector (AI generation via events)
 *
 * Follows event-driven architecture - NO HTTP internal calls
 */

class ChatAPIModule {
  constructor() {
    this.name = 'chat-api';
    this.version = '2.0.0';

    // State
    this.pendingDBRequests = new Map(); // requestId -> { resolve, reject, timeout }
    this.pendingAIRequests = new Map(); // requestId -> { resolve, reject, timeout }
    this.schemaInitialized = false;
    this.pendingRequests = 0;

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('module.loading', {
      module: this.name,
      version: this.version
    });

    // Subscribe to events
    await this.subscribeToEvents();

    // Initialize database schema
    await this.initializeSchema();

    // Update metrics
    // REMOVED (migrate-to-event-metrics): this.metrics.gauge('chat.conversations.active', 0);
    // → Add `conversations_count` to chat events
    // REMOVED (migrate-to-event-metrics): this.metrics.gauge('chat.pending.requests', 0);
    // → Add `pending` to chat events

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      default_provider: this.config.defaultProvider || 'deepseek',
      default_project: this.config.defaultProjectId || 'default'
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Clean up pending requests
    for (const [, pending] of this.pendingDBRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Module unloading'));
    }
    this.pendingDBRequests.clear();

    for (const [, pending] of this.pendingAIRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Module unloading'));
    }
    this.pendingAIRequests.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Initialization
  // ==========================================

  async initializeSchema() {
    const projectId = this.config.defaultProjectId || 'default';

    const schema = `
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project_id TEXT,
        provider TEXT,
        model TEXT,
        system_prompt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tokens INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);
    `;

    try {
      await this.queryDatabase(projectId, schema, [], false);
      this.schemaInitialized = true;
      this.logger.info('schema.initialized', { project_id: projectId });
    } catch (error) {
      this.logger.error('schema.init.error', {
        error: error.message,
        project_id: projectId
      });
      // Continue anyway, schema might already exist
      this.schemaInitialized = true;
    }
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('chat.send.request', this.onSendRequest.bind(this));
    await this.eventBus.subscribe(EVENTS.DB.QUERY_RESPONSE, this.onDatabaseResponse.bind(this));
    await this.eventBus.subscribe('db.schema.init.response', this.onSchemaInitResponse.bind(this));
    await this.eventBus.subscribe(EVENTS.AI.GENERATE_RESPONSE, this.onAIResponse.bind(this));

    this.logger.info('events.subscribed', {
      events: ['chat.send.request', EVENTS.DB.QUERY_RESPONSE, 'db.schema.init.response', EVENTS.AI.GENERATE_RESPONSE]
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  onDatabaseResponse(event) {
    const { request_id } = event.payload || event;
    const pending = this.pendingDBRequests.get(request_id);

    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingDBRequests.delete(request_id);

    if (event.payload?.success !== false) {
      pending.resolve(event.payload?.data || event.payload?.results || []);
    } else {
      pending.reject(new Error(event.payload?.error || 'Database query failed'));
    }
  }

  onSchemaInitResponse(event) {
    const { request_id, success, error } = event.payload || event;
    const pending = this.pendingDBRequests.get(request_id);

    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingDBRequests.delete(request_id);

    if (success) {
      pending.resolve(true);
    } else {
      pending.reject(new Error(error || 'Schema init failed'));
    }
  }

  onAIResponse(event) {
    const { request_id } = event.payload || event;
    const pending = this.pendingAIRequests.get(request_id);

    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingAIRequests.delete(request_id);

    if (event.payload?.success) {
      pending.resolve(event.payload);
    } else {
      pending.reject(new Error(event.payload?.error || 'AI generation failed'));
    }
  }

  async onSendRequest(event) {
    const {
      conversation_id,
      content,
      provider,
      model,
      skip_ai,
      request_id,
      correlation_id
    } = event.payload || event;

    this.logger.info('chat.send.request.received', {
      conversation_id,
      request_id,
      correlation_id
    });

    const startTime = Date.now();

    try {
      const result = await this.sendMessageInternal(
        conversation_id,
        content,
        provider,
        model,
        skip_ai,
        correlation_id
      );

      await this.eventBus.publish('chat.send.response', {
        request_id,
        success: true,
        user_message_id: result.userMessage.id,
        ai_message_id: result.aiMessage?.id,
        ai_content: result.aiMessage?.content,
        provider: result.provider,
        duration: Date.now() - startTime
      }, { correlationId: correlation_id });
    } catch (error) {
      this.logger.error('chat.send.request.error', {
        error: error.message,
        correlation_id
      });

      await this.eventBus.publish('chat.send.response', {
        request_id,
        success: false,
        error: error.message
      }, { correlationId: correlation_id });
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleCreateConversation(req, context) {
    this.logger.info('conversation.create.start', {
      correlation_id: context.correlationId
    });

    try {
      const {
        title = 'New Conversation',
        project_id,
        provider,
        model,
        system_prompt
      } = context.body || {};

      const projectId = project_id || this.config.defaultProjectId || 'default';
      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const query = `
        INSERT INTO conversations (id, title, project_id, provider, model, system_prompt, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.queryDatabase(projectId, query, [
        conversationId,
        title,
        projectId,
        provider || this.config.defaultProvider || 'deepseek',
        model || null,
        system_prompt || null,
        now,
        now
      ]);

      const conversation = {
        id: conversationId,
        title,
        project_id: projectId,
        provider: provider || this.config.defaultProvider,
        model,
        created_at: now,
        updated_at: now,
        message_count: 0
      };

      // Metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('chat.conversation.created.total');
    // → Counter extracted from events

      // Publish event
      await this.eventBus.publish('chat.conversation.created', {
        conversation_id: conversationId,
        title,
        project_id: projectId,
        provider: conversation.provider,
        created_at: now
      }, { correlationId: context.correlationId });

      this.logger.info(EVENTS.CONVERSATION.CREATED, {
        conversation_id: conversationId,
        correlation_id: context.correlationId
      });

      return {
        status: 201,
        data: { success: true, conversation }
      };
    } catch (error) {
      this.logger.error('conversation.create.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('chat.errors.total');
    // → Counter extracted from events

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to create conversation',
          message: error.message
        }
      };
    }
  }

  async handleListConversations(req, context) {
    this.logger.info('conversations.list.start', {
      correlation_id: context.correlationId
    });

    try {
      const projectId = context.query?.project_id || this.config.defaultProjectId || 'default';

      const query = `
        SELECT c.*, COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON c.id = m.conversation_id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
      `;

      const results = await this.queryDatabase(projectId, query, [], true);

      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('chat.conversations.active', results.length);
    // → Add `conversations_count` to chat events

      this.logger.info('conversations.listed', {
        count: results.length,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          conversations: results,
          total: results.length
        }
      };
    } catch (error) {
      this.logger.error('conversations.list.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to list conversations',
          message: error.message
        }
      };
    }
  }

  async handleGetConversation(req, context) {
    const { id } = context.params;

    this.logger.info('conversation.get.start', {
      conversation_id: id,
      correlation_id: context.correlationId
    });

    try {
      const projectId = this.config.defaultProjectId || 'default';

      // Get conversation
      const convQuery = 'SELECT * FROM conversations WHERE id = ?';
      const conversations = await this.queryDatabase(projectId, convQuery, [id], true);

      if (conversations.length === 0) {
        return {
          status: 404,
          data: { success: false, error: 'Conversation not found' }
        };
      }

      // Get messages
      const msgQuery = 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC';
      const messages = await this.queryDatabase(projectId, msgQuery, [id], true);

      const conversation = {
        ...conversations[0],
        message_count: messages.length
      };

      this.logger.info('conversation.retrieved', {
        conversation_id: id,
        message_count: messages.length,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          conversation,
          messages
        }
      };
    } catch (error) {
      this.logger.error('conversation.get.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to get conversation',
          message: error.message
        }
      };
    }
  }

  async handleDeleteConversation(req, context) {
    const { id } = context.params;

    this.logger.info('conversation.delete.start', {
      conversation_id: id,
      correlation_id: context.correlationId
    });

    try {
      const projectId = this.config.defaultProjectId || 'default';

      // Delete messages first
      await this.queryDatabase(projectId, 'DELETE FROM messages WHERE conversation_id = ?', [id]);

      // Delete conversation
      await this.queryDatabase(projectId, 'DELETE FROM conversations WHERE id = ?', [id]);

      // Metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('chat.conversation.deleted.total');
    // → Counter extracted from events

      // Publish event
      await this.eventBus.publish('chat.conversation.deleted', {
        conversation_id: id,
        deleted_at: new Date().toISOString()
      }, { correlationId: context.correlationId });

      this.logger.info(EVENTS.CONVERSATION.DELETED, {
        conversation_id: id,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          deleted: true,
          conversation_id: id
        }
      };
    } catch (error) {
      this.logger.error('conversation.delete.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('chat.errors.total');
    // → Counter extracted from events

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to delete conversation',
          message: error.message
        }
      };
    }
  }

  async handleSendMessage(req, context) {
    const { id } = context.params;
    const startTime = Date.now();

    this.logger.info('message.send.start', {
      conversation_id: id,
      correlation_id: context.correlationId
    });

    this.pendingRequests++;
    // REMOVED (migrate-to-event-metrics): this.metrics.gauge('chat.pending.requests', this.pendingRequests);
    // → Add `pending` to chat events

    try {
      const {
        content,
        provider,
        model,
        skip_ai = false,
        temperature,
        max_tokens
      } = context.body;

      const result = await this.sendMessageInternal(
        id,
        content,
        provider,
        model,
        skip_ai,
        context.correlationId,
        temperature,
        max_tokens
      );

      const duration = Date.now() - startTime;

      this.logger.info(EVENTS.MESSAGE.SENT, {
        conversation_id: id,
        duration,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          user_message: result.userMessage,
          ai_message: result.aiMessage,
          provider: result.provider,
          model: result.model,
          duration
        }
      };
    } catch (error) {
      this.logger.error('message.send.error', {
        conversation_id: id,
        error: error.message,
        correlation_id: context.correlationId
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('chat.errors.total');
    // → Counter extracted from events

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to send message',
          message: error.message
        }
      };
    } finally {
      this.pendingRequests--;
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('chat.pending.requests', this.pendingRequests);
    // → Add `pending` to chat events
    }
  }

  async handleGetMessages(req, context) {
    const { id } = context.params;

    this.logger.info('messages.get.start', {
      conversation_id: id,
      correlation_id: context.correlationId
    });

    try {
      const projectId = this.config.defaultProjectId || 'default';
      const query = 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC';
      const messages = await this.queryDatabase(projectId, query, [id], true);

      this.logger.info('messages.retrieved', {
        conversation_id: id,
        count: messages.length,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          messages,
          total: messages.length,
          conversation_id: id
        }
      };
    } catch (error) {
      this.logger.error('messages.get.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to get messages',
          message: error.message
        }
      };
    }
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        schema_initialized: this.schemaInitialized,
        pending_requests: this.pendingRequests
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        counters: {
          'chat.conversation.created.total': this.metrics.getCounter('chat.conversation.created.total') || 0,
          'chat.conversation.deleted.total': this.metrics.getCounter('chat.conversation.deleted.total') || 0,
          'chat.message.sent.total': this.metrics.getCounter('chat.message.sent.total') || 0,
          'chat.message.ai.total': this.metrics.getCounter('chat.message.ai.total') || 0,
          'chat.errors.total': this.metrics.getCounter('chat.errors.total') || 0
        },
        gauges: {
          'chat.pending.requests': this.pendingRequests
        }
      }
    };
  }

  // ==========================================
  // Core Logic
  // ==========================================

  async sendMessageInternal(conversationId, content, provider, model, skipAI, correlationId, temperature, maxTokens) {
    const projectId = this.config.defaultProjectId || 'default';

    // Get conversation
    const convQuery = 'SELECT * FROM conversations WHERE id = ?';
    const conversations = await this.queryDatabase(projectId, convQuery, [conversationId], true);

    if (conversations.length === 0) {
      throw new Error('Conversation not found');
    }

    const conversation = conversations[0];
    const selectedProvider = provider || conversation.provider || this.config.defaultProvider;
    const selectedModel = model || conversation.model;

    // Save user message
    const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userNow = new Date().toISOString();

    await this.queryDatabase(projectId, `
      INSERT INTO messages (id, conversation_id, role, content, tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userMessageId, conversationId, 'user', content, 0, userNow]);

    const userMessage = {
      id: userMessageId,
      conversation_id: conversationId,
      role: 'user',
      content,
      tokens: 0,
      created_at: userNow
    };

    // Metrics
    // REMOVED (migrate-to-event-metrics): this.metrics.increment('chat.message.sent.total');
    // → Counter extracted from events

    // Publish user message event
    await this.eventBus.publish('chat.message.sent', {
      message_id: userMessageId,
      conversation_id: conversationId,
      content,
      content_length: content.length
    }, { correlationId });

    let aiMessage = null;

    if (!skipAI) {
      const aiStartTime = Date.now();

      // Get conversation history
      const historyQuery = 'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC';
      const history = await this.queryDatabase(projectId, historyQuery, [conversationId], true);

      // Build messages array
      const messages = [];

      // Add system prompt if exists
      if (conversation.system_prompt) {
        messages.push({ role: 'system', content: conversation.system_prompt });
      }

      // Add history
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }

      // Generate AI response
      const aiResponse = await this.generateAI(
        messages,
        selectedProvider,
        selectedModel,
        projectId,
        correlationId,
        temperature,
        maxTokens
      );

      const aiDuration = Date.now() - aiStartTime;

      // Save AI message
      const aiMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const aiNow = new Date().toISOString();

      await this.queryDatabase(projectId, `
        INSERT INTO messages (id, conversation_id, role, content, tokens, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        aiMessageId,
        conversationId,
        'assistant',
        aiResponse.response,
        aiResponse.usage?.total_tokens || 0,
        aiNow
      ]);

      aiMessage = {
        id: aiMessageId,
        conversation_id: conversationId,
        role: 'assistant',
        content: aiResponse.response,
        tokens: aiResponse.usage?.total_tokens || 0,
        created_at: aiNow
      };

      // Update conversation timestamp
      await this.queryDatabase(projectId, `
        UPDATE conversations SET updated_at = ? WHERE id = ?
      `, [aiNow, conversationId]);

      // Metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('chat.message.ai.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.timing('chat.message.ai.duration', aiDuration);

      // Publish AI message event
      await this.eventBus.publish('chat.message.ai.received', {
        message_id: aiMessageId,
        conversation_id: conversationId,
        provider: selectedProvider,
        model: selectedModel,
        tokens: aiMessage.tokens,
        duration: aiDuration
      }, { correlationId });
    }

    return {
      userMessage,
      aiMessage,
      provider: selectedProvider,
      model: selectedModel
    };
  }

  // ==========================================
  // Event-Driven Database Operations
  // ==========================================

  async queryDatabase(projectId, query, params = [], readOnly = false) {
    const requestId = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const dbPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDBRequests.delete(requestId);
        reject(new Error('Database query timeout'));
      }, 10000);

      this.pendingDBRequests.set(requestId, { resolve, reject, timeout });
    });

    const startTime = Date.now();

    await this.eventBus.publish(EVENTS.DB.QUERY_REQUEST, {
      project_id: projectId,
      query,
      params,
      read_only: readOnly,
      request_id: requestId
    });

    const result = await dbPromise;

    // REMOVED: this.metrics.timing('chat.db.query.duration', Date.now() - startTime);

    return result;
  }

  // ==========================================
  // Event-Driven AI Operations
  // ==========================================

  async generateAI(messages, provider, model, projectId, correlationId, temperature, maxTokens) {
    const requestId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const aiPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAIRequests.delete(requestId);
        reject(new Error('AI generation timeout'));
      }, this.config.messageTimeout || 60000);

      this.pendingAIRequests.set(requestId, { resolve, reject, timeout });
    });

    await this.eventBus.publish(EVENTS.AI.GENERATE_REQUEST, {
      messages,
      provider,
      model,
      project_id: projectId,
      temperature: temperature || 0.7,
      max_tokens: maxTokens || 2000,
      request_id: requestId,
      correlation_id: correlationId
    });

    return await aiPromise;
  }
}

module.exports = ChatAPIModule;
