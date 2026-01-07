const crypto = require('crypto');

const { EVENTS } = require('../../core/constants');

/**
 * Conversation Manager Module (Facade)
 *
 * Facade/Coordinator que mantiene la API existente para el frontend
 * delegando toda la lógica a los módulos especializados:
 *
 * - chat-session: CRUD conversaciones/mensajes, contexto FIFO
 * - prompt-composer: Composición de prompts
 * - chat-ai-bridge: Flujo completo de chat con AI
 *
 * Este módulo existe para compatibilidad con frontend existente.
 * Nuevos desarrollos deberían usar los módulos especializados directamente.
 *
 * @module conversation-manager
 * @version 2.0.0
 * @deprecated Use chat-session, prompt-composer, chat-ai-bridge directly
 */
class ConversationManagerModule {
  constructor() {
    this.name = 'conversation-manager';
    this.version = '2.0.0';

    // Dependencies (injected)
    this.logger = null;
    this.eventBus = null;
    this.uiHandler = null;
    this.config = null;

    // Pending requests for event-based delegation
    this.pendingRequests = new Map();

    // Request timeout
    this.REQUEST_TIMEOUT = 30000;
    this.CHAT_TIMEOUT = 180000; // 3 min for chat with tools

    // Unsubscribe functions
    this.unsubscribes = [];

    // Startup time for health check
    this.startTime = Date.now();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.uiHandler = context.uiHandler;
    this.config = context.config || {};

    this.logger.info('conversation-manager.loading', {
      module: this.name,
      version: this.version,
      mode: 'facade'
    });

    // Register UI handlers (maintain compatibility with 'conversation' domain)
    await this.registerUIHandlers();

    // Subscribe to response events from delegated modules
    await this.subscribeToResponses();

    this.logger.info('conversation-manager.loaded', {
      module: this.name,
      note: 'Facade mode - delegating to chat-session, prompt-composer, chat-ai-bridge'
    });
  }

  async onUnload() {
    this.logger.info('conversation-manager.unloading', { module: this.name });

    // Unregister UI handlers
    if (this.uiHandler) {
      const actions = ['send', 'load', 'create', 'list', 'get', 'update', 'delete', 'toggleContext', 'contextStats'];
      for (const action of actions) {
        this.uiHandler.unregister('conversation', action);
      }
    }

    // Unsubscribe all
    for (const unsub of this.unsubscribes) {
      await unsub();
    }
    this.unsubscribes = [];

    // Clear pending requests
    for (const [, req] of this.pendingRequests) {
      if (req.timeout) clearTimeout(req.timeout);
      if (req.reject) req.reject(new Error('Module unloading'));
    }
    this.pendingRequests.clear();

    this.logger.info('conversation-manager.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  async registerUIHandlers() {
    if (!this.uiHandler) return;

    // Register handlers for 'conversation' domain (legacy compatibility)
    this.uiHandler.register('conversation', 'send', this.handleUISend.bind(this));
    this.uiHandler.register('conversation', 'load', this.handleUILoad.bind(this));
    this.uiHandler.register('conversation', 'create', this.handleUICreate.bind(this));
    this.uiHandler.register('conversation', 'list', this.handleUIList.bind(this));
    this.uiHandler.register('conversation', 'get', this.handleUIGet.bind(this));
    this.uiHandler.register('conversation', 'update', this.handleUIUpdate.bind(this));
    this.uiHandler.register('conversation', 'delete', this.handleUIDelete.bind(this));
    this.uiHandler.register('conversation', 'toggleContext', this.handleUIToggleContext.bind(this));
    this.uiHandler.register('conversation', 'contextStats', this.handleUIContextStats.bind(this));

    this.logger.info('conversation-manager.ui_handlers.registered', {
      domain: 'conversation',
      actions: ['send', 'load', 'create', 'list', 'get', 'update', 'delete', 'toggleContext', 'contextStats'],
      note: 'Facade handlers delegating to specialized modules'
    });
  }

  // ==========================================
  // Event Subscriptions (for responses)
  // ==========================================

  async subscribeToResponses() {
    // Subscribe to chat.send.response (from chat-ai-bridge)
    const unsubChat = await this.eventBus.subscribe('chat.send.response',
      this.onDelegatedResponse.bind(this));
    this.unsubscribes.push(unsubChat);

    // Subscribe to session responses (from chat-session)
    const sessionEvents = [
      'session.create.response',
      'session.list.response',
      'session.get.response',
      'session.update.response',
      'session.delete.response',
      'session.messages.response',
      'session.context.load.response',
      'session.context.toggle.response',
      'session.context.stats.response'
    ];

    for (const event of sessionEvents) {
      const unsub = await this.eventBus.subscribe(event, this.onDelegatedResponse.bind(this));
      this.unsubscribes.push(unsub);
    }

    // Subscribe to project.active.response for getting active project
    const unsubProject = await this.eventBus.subscribe(EVENTS.PROJECT.ACTIVE_RESPONSE,
      this.onDelegatedResponse.bind(this));
    this.unsubscribes.push(unsubProject);

    this.logger.info('conversation-manager.events.subscribed', {
      events: ['chat.send.response', ...sessionEvents, 'project.active.response']
    });
  }

  onDelegatedResponse(event) {
    const eventData = event.data || event;
    const { request_id } = eventData;

    const pending = this.pendingRequests.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(request_id);
    pending.resolve(eventData);
  }

  // ==========================================
  // Helper: Send request and wait for response
  // ==========================================

  async sendRequest(requestEvent, payload, timeoutMs = this.REQUEST_TIMEOUT) {
    const requestId = payload.request_id || crypto.randomUUID();
    payload.request_id = requestId;

    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${requestEvent}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
    });

    await this.eventBus.publish(requestEvent, payload);
    return await promise;
  }

  // ==========================================
  // Helper: Get Active Project
  // ==========================================

  async getActiveProjectId(correlationId) {
    try {
      const response = await this.sendRequest(EVENTS.PROJECT.ACTIVE_REQUEST, {
        correlation_id: correlationId
      }, 5000);

      return response?.active_project_id || null;
    } catch (error) {
      this.logger.warn('conversation-manager.getActiveProject.failed', { error: error.message });
      return null;
    }
  }

  // ==========================================
  // UI Handlers (Facade - delegate to modules)
  // ==========================================

  /**
   * UI Handler: Send message
   * Delegates to chat-ai-bridge via chat.send.request
   */
  async handleUISend(data, request) {
    const { conversationId, content, attachments } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info('conversation-manager.handleUISend', { correlationId, conversationId });

    if (!content || content.trim().length === 0) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Content is required' };
    }

    try {
      // Get active project
      const projectId = await this.getActiveProjectId(correlationId);
      if (!projectId) {
        throw { status: 400, code: 'NO_PROJECT', message: 'No active project' };
      }

      // If no conversationId, create one first via chat-session
      let convId = conversationId;
      if (!convId) {
        const createResponse = await this.sendRequest('session.create.request', {
          project_id: projectId,
          correlation_id: correlationId
        });

        if (!createResponse.success) {
          throw { status: 500, code: 'CREATE_ERROR', message: createResponse.error || 'Failed to create conversation' };
        }
        convId = createResponse.conversation?.id;
      }

      // Delegate to chat-ai-bridge
      const chatResponse = await this.sendRequest('chat.send.request', {
        conversation_id: convId,
        content,
        attachments: attachments || [],
        use_tools: true,
        correlation_id: correlationId
      }, this.CHAT_TIMEOUT);

      if (!chatResponse.success) {
        throw { status: 500, code: 'SEND_ERROR', message: chatResponse.error || 'Failed to send message' };
      }

      return {
        conversationId: convId,
        user_message: chatResponse.user_message,
        assistant_message: chatResponse.assistant_message,
        tokens_used: chatResponse.tokens_used,
        cost: chatResponse.cost,
        duration: chatResponse.duration
      };

    } catch (error) {
      if (error.status) throw error;
      this.logger.error('conversation-manager.handleUISend.error', {
        correlationId,
        error: error.message
      });
      throw { status: 500, code: 'SEND_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Load conversation messages
   * Delegates to chat-session via session.context.load.request
   */
  async handleUILoad(data, request) {
    const { conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info('conversation-manager.handleUILoad', { correlationId, conversationId });

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const response = await this.sendRequest('session.context.load.request', {
        conversation_id: conversationId,
        correlation_id: correlationId
      });

      if (!response.success) {
        throw { status: 500, code: 'LOAD_ERROR', message: response.error || 'Failed to load conversation' };
      }

      return {
        conversationId,
        messages: response.messages || [],
        conversation: response.conversation
      };

    } catch (error) {
      if (error.status) throw error;
      this.logger.error('conversation-manager.handleUILoad.error', { correlationId, error: error.message });
      throw { status: 500, code: 'LOAD_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Create conversation
   * Delegates to chat-session via session.create.request
   */
  async handleUICreate(data, request) {
    const { projectId, title, system_prompt, model, provider, temperature, max_tokens, context_window } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info('conversation-manager.handleUICreate', { correlationId, projectId });

    try {
      // Get project ID (use provided or active)
      let projId = projectId;
      if (!projId) {
        projId = await this.getActiveProjectId(correlationId);
        if (!projId) {
          throw { status: 400, code: 'NO_PROJECT', message: 'No active project' };
        }
      }

      const response = await this.sendRequest('session.create.request', {
        project_id: projId,
        options: { title, system_prompt, model, provider, temperature, max_tokens, context_window },
        correlation_id: correlationId
      });

      if (!response.success) {
        throw { status: 500, code: 'CREATE_ERROR', message: response.error || 'Failed to create conversation' };
      }

      return { conversation: response.conversation };

    } catch (error) {
      if (error.status) throw error;
      this.logger.error('conversation-manager.handleUICreate.error', { correlationId, error: error.message });
      throw { status: 500, code: 'CREATE_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: List conversations
   * Delegates to chat-session via session.list.request
   */
  async handleUIList(data, request) {
    const { projectId, limit } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info('conversation-manager.handleUIList', { correlationId, projectId });

    try {
      // Get project ID
      let projId = projectId;
      if (!projId) {
        projId = await this.getActiveProjectId(correlationId);
        if (!projId) {
          return { conversations: [], total: 0 };
        }
      }

      const response = await this.sendRequest('session.list.request', {
        project_id: projId,
        limit: limit || 20,
        correlation_id: correlationId
      });

      if (!response.success) {
        throw { status: 500, code: 'LIST_ERROR', message: response.error || 'Failed to list conversations' };
      }

      return {
        conversations: response.conversations || [],
        total: response.count || 0
      };

    } catch (error) {
      if (error.status) throw error;
      this.logger.error('conversation-manager.handleUIList.error', { correlationId, error: error.message });
      throw { status: 500, code: 'LIST_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Get conversation
   * Delegates to chat-session via session.get.request
   */
  async handleUIGet(data, request) {
    const { conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info('conversation-manager.handleUIGet', { correlationId, conversationId });

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      // Get conversation metadata
      const convResponse = await this.sendRequest('session.get.request', {
        conversation_id: conversationId,
        correlation_id: correlationId
      });

      // Get messages
      const msgResponse = await this.sendRequest('session.messages.request', {
        conversation_id: conversationId,
        correlation_id: correlationId
      });

      return {
        conversation: convResponse.conversation,
        messages: msgResponse.messages || []
      };

    } catch (error) {
      if (error.status) throw error;
      this.logger.error('conversation-manager.handleUIGet.error', { correlationId, error: error.message });
      throw { status: 500, code: 'GET_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Update conversation
   * Delegates to chat-session via session.update.request
   */
  async handleUIUpdate(data, request) {
    const { conversationId, ...updates } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info('conversation-manager.handleUIUpdate', { correlationId, conversationId });

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const response = await this.sendRequest('session.update.request', {
        conversation_id: conversationId,
        updates,
        correlation_id: correlationId
      });

      if (!response.success) {
        if (response.error?.includes('not found')) {
          throw { status: 404, code: 'NOT_FOUND', message: response.error };
        }
        throw { status: 500, code: 'UPDATE_ERROR', message: response.error || 'Failed to update conversation' };
      }

      return { conversation: response.conversation };

    } catch (error) {
      if (error.status) throw error;
      this.logger.error('conversation-manager.handleUIUpdate.error', { correlationId, error: error.message });
      throw { status: 500, code: 'UPDATE_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Delete conversation
   * Delegates to chat-session via session.delete.request
   */
  async handleUIDelete(data, request) {
    const { conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info('conversation-manager.handleUIDelete', { correlationId, conversationId });

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const response = await this.sendRequest('session.delete.request', {
        conversation_id: conversationId,
        correlation_id: correlationId
      });

      if (!response.success) {
        if (response.error?.includes('not found')) {
          throw { status: 404, code: 'NOT_FOUND', message: response.error };
        }
        throw { status: 500, code: 'DELETE_ERROR', message: response.error || 'Failed to delete conversation' };
      }

      return {
        success: true,
        id: conversationId,
        messagesDeleted: response.messages_deleted || 0
      };

    } catch (error) {
      if (error.status) throw error;
      this.logger.error('conversation-manager.handleUIDelete.error', { correlationId, error: error.message });
      throw { status: 500, code: 'DELETE_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Toggle message context
   * Delegates to chat-session via session.context.toggle.request
   */
  async handleUIToggleContext(data, request) {
    const { projectId, messageId, inContext } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info('conversation-manager.handleUIToggleContext', { correlationId, messageId, inContext });

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
      const response = await this.sendRequest('session.context.toggle.request', {
        project_id: projectId,
        message_id: messageId,
        in_context: inContext,
        correlation_id: correlationId
      });

      if (!response.success) {
        throw { status: 500, code: 'TOGGLE_ERROR', message: response.error || 'Failed to toggle context' };
      }

      return {
        success: true,
        messageId: response.messageId,
        inContext: response.inContext,
        manuallyToggled: response.manuallyToggled
      };

    } catch (error) {
      if (error.status) throw error;
      this.logger.error('conversation-manager.handleUIToggleContext.error', { correlationId, error: error.message });
      throw { status: 500, code: 'TOGGLE_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Get context stats
   * Delegates to chat-session via session.context.stats.request
   */
  async handleUIContextStats(data, request) {
    const { projectId, conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.debug('conversation-manager.handleUIContextStats', { correlationId, conversationId });

    if (!projectId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'projectId is required' };
    }
    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const response = await this.sendRequest('session.context.stats.request', {
        project_id: projectId,
        conversation_id: conversationId,
        correlation_id: correlationId
      });

      if (!response.success) {
        throw { status: 500, code: 'STATS_ERROR', message: response.error || 'Failed to get context stats' };
      }

      return {
        total: response.total,
        active: response.active,
        manuallyToggled: response.manuallyToggled,
        maxContext: response.maxContext,
        remaining: response.remaining
      };

    } catch (error) {
      if (error.status) throw error;
      this.logger.error('conversation-manager.handleUIContextStats.error', { correlationId, error: error.message });
      throw { status: 500, code: 'STATS_ERROR', message: error.message };
    }
  }

  // ==========================================
  // HTTP API Handlers (Facade)
  // ==========================================

  async handleCreateConversation(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { project_id, user_id, ...options } = req.body || {};

    if (!project_id) {
      return { status: 400, data: { success: false, error: 'project_id is required' } };
    }

    try {
      const response = await this.sendRequest('session.create.request', {
        project_id,
        user_id,
        options,
        correlation_id: correlationId
      });

      if (!response.success) {
        return { status: 500, data: { success: false, error: response.error } };
      }

      return { status: 201, data: { success: true, conversation: response.conversation } };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleListConversations(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { project_id, limit } = req.query || {};

    if (!project_id) {
      return { status: 400, data: { success: false, error: 'project_id is required' } };
    }

    try {
      const response = await this.sendRequest('session.list.request', {
        project_id,
        limit: parseInt(limit) || 20,
        correlation_id: correlationId
      });

      if (!response.success) {
        return { status: 500, data: { success: false, error: response.error } };
      }

      return {
        status: 200,
        data: {
          success: true,
          conversations: response.conversations,
          count: response.count
        }
      };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleGetConversation(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    try {
      const convResponse = await this.sendRequest('session.get.request', {
        conversation_id: id,
        correlation_id: correlationId
      });

      if (!convResponse.success || !convResponse.conversation) {
        return { status: 404, data: { success: false, error: 'Conversation not found' } };
      }

      const msgResponse = await this.sendRequest('session.messages.request', {
        conversation_id: id,
        correlation_id: correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          conversation: convResponse.conversation,
          messages: msgResponse.messages || []
        }
      };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleUpdateConversation(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const updates = req.body || {};

    try {
      const response = await this.sendRequest('session.update.request', {
        conversation_id: id,
        updates,
        correlation_id: correlationId
      });

      if (!response.success) {
        const status = response.error?.includes('not found') ? 404 : 500;
        return { status, data: { success: false, error: response.error } };
      }

      return { status: 200, data: { success: true, conversation: response.conversation } };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleDeleteConversation(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    try {
      const response = await this.sendRequest('session.delete.request', {
        conversation_id: id,
        correlation_id: correlationId
      });

      if (!response.success) {
        const status = response.error?.includes('not found') ? 404 : 500;
        return { status, data: { success: false, error: response.error } };
      }

      return {
        status: 200,
        data: {
          success: true,
          id,
          messages_deleted: response.messages_deleted,
          message: 'Conversation deleted successfully'
        }
      };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleSendMessage(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const { content, user_id, attachments } = req.body || {};

    if (!content || content.trim().length === 0) {
      return { status: 400, data: { success: false, error: 'content is required' } };
    }

    try {
      const response = await this.sendRequest('chat.send.request', {
        conversation_id: id,
        content,
        user_id,
        attachments: attachments || [],
        use_tools: true,
        correlation_id: correlationId
      }, this.CHAT_TIMEOUT);

      if (!response.success) {
        const status = response.error?.includes('not found') ? 404 : 500;
        return { status, data: { success: false, error: response.error } };
      }

      return {
        status: 200,
        data: {
          success: true,
          user_message: response.user_message,
          assistant_message: response.assistant_message,
          tokens_used: response.tokens_used,
          cost: response.cost,
          duration: response.duration
        }
      };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleGetMessages(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const { limit, offset, in_context_only } = req.query || {};

    try {
      const response = await this.sendRequest('session.messages.request', {
        conversation_id: id,
        in_context_only: in_context_only === 'true',
        correlation_id: correlationId
      });

      if (!response.success) {
        return { status: 500, data: { success: false, error: response.error } };
      }

      const messages = response.messages || [];
      const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
      const totalCost = messages.reduce((sum, m) => sum + (m.cost || 0), 0);

      return {
        status: 200,
        data: {
          success: true,
          messages,
          count: messages.length,
          total_tokens: totalTokens,
          total_cost: totalCost
        }
      };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleGetContext(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    try {
      const response = await this.sendRequest('session.context.load.request', {
        conversation_id: id,
        correlation_id: correlationId
      });

      if (!response.success) {
        const status = response.error?.includes('not found') ? 404 : 500;
        return { status, data: { success: false, error: response.error } };
      }

      return {
        status: 200,
        data: {
          success: true,
          conversation_context: {
            messages: response.messages,
            message_count: response.message_count,
            total_tokens: response.total_tokens,
            total_cost: response.total_cost
          }
        }
      };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleUIState(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { project_id } = req.query || {};

    if (!project_id) {
      return { status: 400, data: { success: false, error: 'project_id is required' } };
    }

    try {
      const response = await this.sendRequest('session.list.request', {
        project_id,
        limit: 100,
        correlation_id: correlationId
      });

      if (!response.success) {
        return { status: 500, data: { success: false, error: response.error } };
      }

      const conversations = response.conversations || [];

      // Group by date for UI sections
      const now = new Date();
      const todayStr = now.toDateString();
      const yesterdayStr = new Date(now - 86400000).toDateString();

      const grouped = {};
      const sectionLabels = {
        today: 'Hoy',
        yesterday: 'Ayer',
        this_week: 'Esta semana',
        this_month: 'Este mes',
        older: 'Anteriores'
      };

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
          isRecent: (now - new Date(conv.updated_at)) < 3600000
        });
      }

      const sections = ['today', 'yesterday', 'this_week', 'this_month', 'older'];
      const uiSections = sections
        .filter(key => grouped[key]?.length > 0)
        .map(key => ({
          id: key,
          label: sectionLabels[key],
          conversations: grouped[key]
        }));

      const totalMessages = conversations.reduce((sum, c) => sum + (c.message_count || 0), 0);
      const activeToday = conversations.filter(c => {
        const updated = new Date(c.updated_at);
        return updated.toDateString() === todayStr;
      }).length;

      return {
        status: 200,
        data: {
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
        }
      };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleToggleContext(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id: messageId } = req.params || {};
    const { project_id, in_context } = req.body || {};

    if (!project_id) {
      return { status: 400, data: { success: false, error: 'project_id is required' } };
    }
    if (in_context === undefined) {
      return { status: 400, data: { success: false, error: 'in_context is required' } };
    }

    try {
      const response = await this.sendRequest('session.context.toggle.request', {
        project_id,
        message_id: messageId,
        in_context,
        correlation_id: correlationId
      });

      if (!response.success) {
        return { status: 500, data: { success: false, error: response.error } };
      }

      return { status: 200, data: { success: true, ...response } };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleContextStats(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id: conversationId } = req.params || {};
    const { project_id } = req.query || {};

    if (!project_id) {
      return { status: 400, data: { success: false, error: 'project_id is required' } };
    }

    try {
      const response = await this.sendRequest('session.context.stats.request', {
        project_id,
        conversation_id: conversationId,
        correlation_id: correlationId
      });

      if (!response.success) {
        return { status: 500, data: { success: false, error: response.error } };
      }

      return { status: 200, data: { success: true, ...response } };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
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
        mode: 'facade',
        delegates_to: ['chat-session', 'chat-ai-bridge', 'prompt-composer'],
        pending_requests: this.pendingRequests.size,
        uptime
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        module: this.name,
        version: this.version,
        mode: 'facade',
        metrics: {
          pending_requests: this.pendingRequests.size,
          uptime: (Date.now() - this.startTime) / 1000
        }
      }
    };
  }
}

module.exports = ConversationManagerModule;
