const crypto = require('crypto');

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
 * @version 2.1.0
 * @deprecated Use chat-session, prompt-composer, chat-ai-bridge directly
 */
class ConversationManagerModule {
  constructor() {
    this.name = 'conversation-manager';
    this.version = '2.1.0';

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

    // Startup time for health check
    this.startTime = Date.now();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.uiHandler = context.uiHandler;
    this.config = context.moduleConfig || {};

    this.logger.info('conversation-manager.loading', {
      module: this.name,
      version: this.version,
      mode: 'facade'
    });

    this.logger.info('conversation-manager.loaded', {
      module: this.name,
      note: 'Facade mode - delegating to chat-session, prompt-composer, chat-ai-bridge'
    });
  }

  async onUnload() {
    this.logger.info('conversation-manager.unloading', { module: this.name });

    // Clear pending requests
    for (const [, req] of this.pendingRequests) {
      if (req.timeout) clearTimeout(req.timeout);
      if (req.reject) req.reject(new Error('Module unloading'));
    }
    this.pendingRequests.clear();

    this.logger.info('conversation-manager.unloaded', { module: this.name });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

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
      const response = await this.sendRequest('project.active.request', {
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

}

module.exports = ConversationManagerModule;
