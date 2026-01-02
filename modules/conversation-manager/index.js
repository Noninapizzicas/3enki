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
    this.uiHandler = null;  // UI Request/Response handler
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
    this.pendingToolRequests = new Map();
    this.pendingToolCallRequests = new Map();

    // Tools cache (reloaded periodically)
    this.toolsCache = null;
    this.toolsCacheTime = 0;
    this.toolsCacheTTL = 60000; // 1 minute

    // Tool call loop config
    this.maxToolCallIterations = 10; // Prevent infinite loops

    // Unsubscribe functions
    this.unsubscribes = [];
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.moduleLoader = core.moduleLoader; // Para acceder a tools registry
    this.config = core.config || {};
    this.activity = core.activity?.forModule(this.name);

    this.activity?.action('module.loading', { version: this.version });
    this.logger.info('conversation-manager.loading', { module: this.name });

    // Register UI Request/Response handlers
    if (this.uiHandler) {
      this.uiHandler.register('conversation', 'send', this.handleUISend.bind(this));
      this.uiHandler.register('conversation', 'load', this.handleUILoad.bind(this));
      this.uiHandler.register('conversation', 'create', this.handleUICreate.bind(this));
      this.uiHandler.register('conversation', 'list', this.handleUIList.bind(this));
      this.uiHandler.register('conversation', 'get', this.handleUIGet.bind(this));
      this.uiHandler.register('conversation', 'update', this.handleUIUpdate.bind(this));
      this.uiHandler.register('conversation', 'delete', this.handleUIDelete.bind(this));
      // Context management handlers
      this.uiHandler.register('conversation', 'toggleContext', this.handleUIToggleContext.bind(this));
      this.uiHandler.register('conversation', 'contextStats', this.handleUIContextStats.bind(this));

      this.logger.info('conversation-manager.ui_handlers.registered', {
        handlers: ['send', 'load', 'create', 'list', 'get', 'update', 'delete', 'toggleContext', 'contextStats']
      });
    }

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

    const unsubTools = await this.eventBus.subscribe(EVENTS.TOOL.LIST_RESPONSE,
      this.onToolListResponse.bind(this));
    this.unsubscribes.push(unsubTools);

    const unsubToolCall = await this.eventBus.subscribe(EVENTS.TOOL.CALL_RESPONSE,
      this.onToolCallResponse.bind(this));
    this.unsubscribes.push(unsubToolCall);

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

    const unsubSend = await this.eventBus.subscribe(EVENTS.CONVERSATION.SEND_REQUEST,
      this.onSendMessageRequest.bind(this));
    this.unsubscribes.push(unsubSend);

    // Note: Schema is initialized per-project on first access (ensureProjectSchema)
    // Conversations are loaded on-demand via loadProjectConversations

    this.logger.info({ correlationId: 'system' }, 'Conversation Manager module loaded');
  }

  async onUnload() {
    this.logger.info({ correlationId: 'system' }, 'Conversation Manager module unloading');

    // Unregister UI handlers
    if (this.uiHandler) {
      this.uiHandler.unregister('conversation', 'send');
      this.uiHandler.unregister('conversation', 'load');
      this.uiHandler.unregister('conversation', 'create');
      this.uiHandler.unregister('conversation', 'list');
      this.uiHandler.unregister('conversation', 'get');
      this.uiHandler.unregister('conversation', 'update');
      this.uiHandler.unregister('conversation', 'delete');
      this.uiHandler.unregister('conversation', 'toggleContext');
      this.uiHandler.unregister('conversation', 'contextStats');
    }

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
      // Ensure error message is a string
      const errorMsg = typeof error === 'string' ? error
        : (error?.message || JSON.stringify(error) || 'Database query failed');
      pending.reject(new Error(errorMsg));
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

      // Migration: Add new columns if they don't exist (for existing databases)
      const columnsToAdd = [
        { name: 'in_context', definition: 'INTEGER DEFAULT 1' },
        { name: 'manually_toggled', definition: 'INTEGER DEFAULT 0' }
      ];

      for (const col of columnsToAdd) {
        // Check if column exists before adding
        const exists = await this.queryDatabase(
          projectId,
          `SELECT COUNT(*) as count FROM pragma_table_info('messages') WHERE name = ?`,
          [col.name],
          true,
          correlationId
        );

        if (!exists[0]?.count) {
          await this.queryDatabase(
            projectId,
            `ALTER TABLE messages ADD COLUMN ${col.name} ${col.definition}`,
            [],
            false,
            correlationId
          );
          this.logger.debug({ correlationId, projectId, column: col.name }, 'Migration: added column');
        }
      }

      // Index for messages by conversation
      await this.queryDatabase(projectId, `
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)
      `, [], false, correlationId);

      // Index for context filtering
      await this.queryDatabase(projectId, `
        CREATE INDEX IF NOT EXISTS idx_messages_context ON messages(conversation_id, in_context)
      `, [], false, correlationId);

      this.initializedProjects.add(projectId);
      this.logger.info({ correlationId, projectId }, 'Conversation schema initialized for project');
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to initialize schema for project');
      throw error;
    }
  }

  // ==================== CONTEXT MANAGEMENT (FIFO) ====================

  /**
   * Apply FIFO context management before adding a new message
   * If context is full, deactivate the oldest non-manually-toggled message
   * @param {string} projectId - Project ID
   * @param {string} conversationId - Conversation ID
   * @param {string} correlationId - Correlation ID for tracing
   */
  async applyContextFIFO(projectId, conversationId, correlationId) {
    const contextWindow = this.config.contextWindow || 20;

    // Count active messages in context
    const countResult = await this.queryDatabase(projectId,
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ? AND in_context = 1',
      [conversationId],
      true,
      correlationId
    );

    const activeCount = countResult[0]?.count || 0;

    // If we're at or above the limit, deactivate oldest non-manually-toggled message
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
          'FIFO: Deactivated oldest message from context');
      }
    }
  }

  /**
   * Toggle a message's context inclusion
   * @param {string} projectId - Project ID
   * @param {string} messageId - Message ID
   * @param {boolean} inContext - Whether to include in context
   * @param {string} correlationId - Correlation ID for tracing
   */
  async toggleMessageContext(projectId, messageId, inContext, correlationId) {
    this.logger.debug({ correlationId, messageId, inContext }, 'Toggling message context');

    await this.queryDatabase(projectId,
      'UPDATE messages SET in_context = ?, manually_toggled = 1 WHERE id = ?',
      [inContext ? 1 : 0, messageId],
      false,
      correlationId
    );

    this.logger.info({ correlationId, messageId, inContext }, 'Message context toggled');

    return { messageId, inContext, manuallyToggled: true };
  }

  /**
   * Get context statistics for a conversation
   * @param {string} projectId - Project ID
   * @param {string} conversationId - Conversation ID
   * @param {string} correlationId - Correlation ID for tracing
   */
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
    // Handle both wrapped (event.data) and unwrapped event formats
    const eventData = event.data || event;
    const { request_id, success, project } = eventData;

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
    // Handle both wrapped (event.data) and unwrapped event formats
    const eventData = event.data || event;
    const { request_id, success, storage } = eventData;

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

  async onToolListResponse(event) {
    // Handle both wrapped (event.data) and unwrapped event formats
    const eventData = event.data || event;
    const { request_id, success, tools, count } = eventData;

    const pending = this.pendingToolRequests.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingToolRequests.delete(request_id);

    if (success) {
      pending.resolve(tools || []);
    } else {
      pending.resolve([]); // Return empty array on failure
    }
  }

  // ==================== TOOL LOADING ====================

  /**
   * Load available tools from moduleLoader
   * Uses cache to avoid repeated requests
   */
  async loadAvailableTools(correlationId) {
    // Check cache
    if (this.toolsCache && (Date.now() - this.toolsCacheTime) < this.toolsCacheTTL) {
      return this.toolsCache;
    }

    this.logger.debug({ correlationId }, 'Loading available tools from moduleLoader');

    if (!this.moduleLoader) {
      this.logger.warn({ correlationId }, 'ModuleLoader not available, continuing without tools');
      return [];
    }

    try {
      const tools = this.moduleLoader.getToolsForAI();

      // Update cache
      this.toolsCache = tools;
      this.toolsCacheTime = Date.now();

      this.logger.info({ correlationId, toolsCount: tools.length }, 'Tools loaded from moduleLoader');

      return tools;
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'Failed to load tools');
      return [];
    }
  }

  /**
   * Format tools for LLM (OpenAI function calling format)
   * Input format from moduleLoader.getToolsForAI():
   * { name, description, parameters, confirmation }
   */
  formatToolsForLLM(tools) {
    if (!tools || tools.length === 0) {
      return null;
    }

    return tools.map(tool => ({
      type: 'function',
      function: {
        // DeepSeek only accepts [a-zA-Z0-9_-], so replace dots with underscores
        name: tool.name.replace(/\./g, '_'),
        description: tool.description || `Tool: ${tool.name}`,
        parameters: tool.parameters || {
          type: 'object',
          properties: {},
          required: []
        }
      }
    }));
  }

  /**
   * Convert tool name from LLM format back to internal format
   * fs_write -> fs.write
   */
  convertToolNameFromLLM(llmName) {
    // Find matching tool by comparing normalized names
    const tools = this.moduleLoader?.getToolsForAI() || [];
    for (const tool of tools) {
      if (tool.name.replace(/\./g, '_') === llmName) {
        return tool.name;
      }
    }
    // Fallback: just replace underscores with dots for known patterns
    return llmName.replace(/_/g, '.');
  }

  // ==================== PROMPT COMPOSER ====================

  /**
   * Compose a rich system prompt with all available context
   * Supports template variables: {{project_name}}, {{tools_count}}, {{date}}, etc.
   */
  composeSystemPrompt(conversation, projectContext, tools) {
    // Start with conversation's system prompt or default
    let basePrompt = conversation.system_prompt || this.config.defaultSystemPrompt || '';

    // Template variables available for substitution
    const variables = {
      project_name: projectContext?.project_name || 'Unknown Project',
      project_description: projectContext?.project_description || '',
      tools_count: tools?.length || 0,
      file_count: projectContext?.storage_info?.file_count || 0,
      date: new Date().toLocaleDateString(),
      datetime: new Date().toISOString(),
      conversation_title: conversation.title || 'Conversation'
    };

    // Substitute template variables {{variable_name}}
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      basePrompt = basePrompt.replace(regex, String(value));
    }

    // Build context sections
    const sections = [];

    // Add base prompt
    if (basePrompt.trim()) {
      sections.push(basePrompt.trim());
    }

    // Add project context if enabled
    if (this.config.includeProjectContext && projectContext) {
      const projectSection = [];
      projectSection.push('## Project Context');
      projectSection.push(`- **Project**: ${projectContext.project_name}`);

      if (projectContext.project_description) {
        projectSection.push(`- **Description**: ${projectContext.project_description}`);
      }

      if (this.config.includeStorageInfo && projectContext.storage_info) {
        projectSection.push(`- **Files**: ${projectContext.storage_info.file_count} files (${this.formatBytes(projectContext.storage_info.total_size)})`);
      }

      sections.push(projectSection.join('\n'));
    }

    // Add tools info if enabled and tools are available
    if (this.config.includeTools && tools && tools.length > 0) {
      const toolsSection = [];
      toolsSection.push('## Available Tools');
      toolsSection.push(`You have access to ${tools.length} tool(s) that you can call to help the user:`);

      for (const tool of tools) {
        const name = tool.function?.name || tool.name;
        const desc = tool.function?.description || tool.description || '';
        toolsSection.push(`- **${name}**: ${desc}`);
      }

      toolsSection.push('\nUse these tools when appropriate to provide accurate and helpful responses.');
      sections.push(toolsSection.join('\n'));
    }

    // Add filesystem guidelines
    const fsSection = [];
    fsSection.push('## Filesystem Guidelines');
    fsSection.push('When saving files, organize them according to the context of what we are working on.');
    fsSection.push('Create directories that reflect the current task or theme.');
    fsSection.push('Avoid generic names like `temp/`, `output/`, `files/`.');
    sections.push(fsSection.join('\n'));

    // Combine all sections
    return sections.join('\n\n');
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ==================== TOOL CALL EXECUTION ====================

  async onToolCallResponse(event) {
    // Handle both wrapped (event.data) and unwrapped event formats
    const eventData = event.data || event;
    const { request_id, success, result, error } = eventData;

    const pending = this.pendingToolCallRequests.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingToolCallRequests.delete(request_id);

    if (success) {
      pending.resolve({ success: true, result });
    } else {
      pending.resolve({ success: false, error: error || 'Tool call failed' });
    }
  }

  /**
   * Execute a single tool call via moduleLoader
   */
  async executeToolCall(toolCall, correlationId) {
    // Convert from LLM format (fs_write) to internal format (fs.write)
    const llmToolName = toolCall.function?.name || toolCall.name;
    const toolName = this.convertToolNameFromLLM(llmToolName);
    let args = {};

    try {
      args = typeof toolCall.function?.arguments === 'string'
        ? JSON.parse(toolCall.function.arguments)
        : (toolCall.function?.arguments || toolCall.arguments || {});
    } catch (e) {
      this.logger.warn({ correlationId, toolName, error: e.message }, 'Failed to parse tool arguments');
      return {
        tool_call_id: toolCall.id,
        success: false,
        error: `Invalid arguments: ${e.message}`
      };
    }

    this.logger.debug({ correlationId, toolName, args }, 'Executing tool call via moduleLoader');

    if (!this.moduleLoader) {
      this.logger.error({ correlationId, toolName }, 'ModuleLoader not available');
      return {
        tool_call_id: toolCall.id,
        success: false,
        error: 'ModuleLoader not available'
      };
    }

    try {
      // Check if tool requires confirmation
      if (this.moduleLoader.toolRequiresConfirmation && this.moduleLoader.toolRequiresConfirmation(toolName)) {
        this.logger.info({ correlationId, toolName }, 'Tool requires confirmation (skipping for now)');
        // TODO: Implement confirmation flow via UI
      }

      // Execute tool via moduleLoader
      const result = await this.moduleLoader.executeTool(toolName, args);

      this.logger.info({ correlationId, toolName, success: true }, 'Tool call completed');

      return {
        tool_call_id: toolCall.id,
        success: true,
        result: result?.data || result
      };
    } catch (error) {
      this.logger.error({ correlationId, toolName, error: error.message }, 'Tool call failed');

      return {
        tool_call_id: toolCall.id,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeToolCalls(toolCalls, correlationId) {
    this.logger.info({ correlationId, count: toolCalls.length }, 'Executing tool calls');

    const results = await Promise.all(
      toolCalls.map(tc => this.executeToolCall(tc, correlationId))
    );

    return results;
  }

  /**
   * Format tool results as messages for the LLM
   */
  formatToolResultsAsMessages(toolCalls, toolResults) {
    const messages = [];

    // First add the assistant message with tool_calls
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: toolCalls
    });

    // Then add tool results
    for (const result of toolResults) {
      messages.push({
        role: 'tool',
        tool_call_id: result.tool_call_id,
        content: result.success
          ? (typeof result.result === 'string' ? result.result : JSON.stringify(result.result))
          : `Error: ${result.error}`
      });
    }

    return messages;
  }

  async loadConversationContext(conversationId, correlationId) {
    this.logger.debug({ correlationId, conversationId }, 'Loading conversation context');

    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Load messages that are in context (limited by context window)
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

    this.activity?.action('conversation.creating', { conversationId, projectId, userId });
    this.logger.info({ correlationId, conversationId, projectId, userId }, 'Creating conversation');

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
    const endTimer = this.activity?.timer('message.send');

    this.activity?.action('message.sending', { conversationId, userId, contentLength: content?.length });
    this.logger.info({ correlationId, conversationId, userId }, 'Sending message');

    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      this.activity?.error('message.send', new Error('Conversation not found'), { conversationId });
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
        metadata,
        in_context: true,
        manually_toggled: false
      };

      // Apply FIFO before inserting new message
      await this.applyContextFIFO(conversation.project_id, conversationId, correlationId);

      // Save user message with context fields
      await this.queryDatabase(conversation.project_id,
        `INSERT INTO messages (id, conversation_id, role, content, attachments, tokens, cost, created_at, metadata, in_context, manually_toggled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
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

      // Load available tools
      const rawTools = await this.loadAvailableTools(correlationId);
      const tools = this.formatToolsForLLM(rawTools);

      // Build messages for AI
      const aiMessages = [];

      // Compose rich system prompt with all context
      const systemPrompt = this.composeSystemPrompt(conversation, projectContext, tools);
      if (systemPrompt) {
        aiMessages.push({ role: 'system', content: systemPrompt });
      }

      // Add conversation history
      for (const msg of conversationContext.messages) {
        aiMessages.push({ role: msg.role, content: msg.content });
      }

      // ==================== TOOL CALL LOOP ====================
      let currentMessages = [...aiMessages];
      let aiResponse = null;
      let totalTokens = 0;
      let totalCost = 0;
      let iterations = 0;
      const toolCallHistory = []; // Track all tool calls for metadata

      while (iterations < this.maxToolCallIterations) {
        iterations++;

        // Call AI
        aiResponse = await this.callAI(currentMessages, conversation, tools, correlationId);
        totalTokens += aiResponse.tokens || 0;
        totalCost += aiResponse.cost || 0;

        // Check if AI wants to call tools
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
          this.logger.info({
            correlationId,
            iteration: iterations,
            toolCallsCount: aiResponse.tool_calls.length,
            tools: aiResponse.tool_calls.map(tc => tc.function?.name || tc.name)
          }, 'AI requested tool calls');

          // Execute all tool calls
          const toolResults = await this.executeToolCalls(aiResponse.tool_calls, correlationId);

          // Track tool calls for metadata
          toolCallHistory.push({
            iteration: iterations,
            calls: aiResponse.tool_calls.map((tc, i) => ({
              name: tc.function?.name || tc.name,
              success: toolResults[i].success,
              error: toolResults[i].error || null
            }))
          });

          // Add tool call messages to conversation
          const toolMessages = this.formatToolResultsAsMessages(aiResponse.tool_calls, toolResults);
          currentMessages = [...currentMessages, ...toolMessages];

          // Continue loop to get AI's response after tool execution
          continue;
        }

        // AI provided final content, exit loop
        break;
      }

      if (iterations >= this.maxToolCallIterations) {
        this.logger.warn({ correlationId, conversationId }, 'Max tool call iterations reached');
      }

      // ==================== SAVE ASSISTANT MESSAGE ====================
      const assistantMessageId = crypto.randomUUID();
      const assistantNow = new Date().toISOString();

      const assistantMessage = {
        id: assistantMessageId,
        conversation_id: conversationId,
        role: 'assistant',
        content: aiResponse.content || '[No response content]',
        attachments: [],
        tokens: totalTokens,
        cost: totalCost,
        created_at: assistantNow,
        metadata: {
          model: aiResponse.model,
          provider: aiResponse.provider,
          tool_calls: toolCallHistory.length > 0 ? toolCallHistory : undefined,
          iterations: iterations > 1 ? iterations : undefined
        },
        in_context: true,
        manually_toggled: false
      };

      // Apply FIFO before inserting assistant message
      await this.applyContextFIFO(conversation.project_id, conversationId, correlationId);

      // Save assistant message with context fields
      await this.queryDatabase(conversation.project_id,
        `INSERT INTO messages (id, conversation_id, role, content, attachments, tokens, cost, created_at, metadata, in_context, manually_toggled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          assistantMessageId,
          conversationId,
          'assistant',
          assistantMessage.content,
          '[]',
          totalTokens,
          totalCost,
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

      await this.eventBus.publish(EVENTS.MESSAGE.RECEIVED, {
        message_id: assistantMessageId,
        conversation_id: conversationId,
        project_id: conversation.project_id,
        content: assistantMessage.content,
        tokens: totalTokens,
        cost: totalCost,
        model: aiResponse.model,
        provider: aiResponse.provider,
        tool_calls: toolCallHistory.length > 0 ? toolCallHistory : undefined,
        received_at: assistantNow
      });

      this.logger.info({ correlationId, conversationId, tokens: aiResponse.tokens },
        'Message sent and AI response received');

      // Log completion with timer
      endTimer?.({ tokens: totalTokens, model: aiResponse.model, toolCalls: toolCallHistory.length });
      this.activity?.action('message.sent', {
        conversationId,
        tokens: totalTokens,
        cost: totalCost,
        model: aiResponse.model,
        duration: Date.now() - startTime
      });

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

  async callAI(messages, conversation, tools, correlationId) {
    const requestId = crypto.randomUUID();

    this.activity?.action('ai.calling', {
      requestId,
      model: conversation.model,
      provider: conversation.provider,
      messagesCount: messages.length,
      toolsCount: tools?.length || 0
    });

    const aiPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAIRequests.delete(requestId);
        this.activity?.error('ai.call', new Error('AI request timeout'), { requestId });
        reject(new Error('AI request timeout'));
      }, this.config.aiTimeout || 60000);

      this.pendingAIRequests.set(requestId, { resolve, reject, timeout });
    });

    this.logger.debug({ correlationId, requestId, toolsCount: tools?.length || 0 }, 'Calling AI with tools');

    await this.eventBus.publish(EVENTS.AI.CHAT_REQUEST, {
      request_id: requestId,
      messages,
      tools: tools || null,
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
    // Handle both wrapped (event.data) and unwrapped event formats
    const eventData = event.data || event;
    const { request_id, success, message, content, tool_calls, tokens, cost, model, provider, error } = eventData;

    const pending = this.pendingAIRequests.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingAIRequests.delete(request_id);

    if (success) {
      pending.resolve({
        content: content || message?.content || message,
        tool_calls: tool_calls || null,
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
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      in_context: row.in_context === 1,
      manually_toggled: row.manually_toggled === 1
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

      await this.eventBus.publish(EVENTS.CONVERSATION.SEND_RESPONSE, {
        request_id,
        success: true,
        ...result
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.CONVERSATION.SEND_RESPONSE, {
        request_id,
        success: false,
        error: error.message
      });
    }
  }

  // ==================== HTTP API HANDLERS ====================
  // Handlers use new gateway API style: return { status, data } instead of res.json()

  async handleCreateConversation(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { project_id, user_id, ...options } = req.body || {};

    this.logger.info({ correlationId, projectId: project_id }, 'HTTP: Create conversation');

    if (!project_id) {
      return { status: 400, data: { success: false, error: 'project_id is required' } };
    }

    try {
      const conversation = await this.createConversation(project_id, user_id, options, correlationId);
      return { status: 201, data: { success: true, conversation } };
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'HTTP: Failed to create conversation');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleListConversations(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { project_id } = req.query || {};

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

      return { status: 200, data: { success: true, conversations, count: conversations.length } };
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'HTTP: Failed to list conversations');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleGetConversation(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    this.logger.debug({ correlationId, conversationId: id }, 'HTTP: Get conversation');

    try {
      const conversation = this.conversations.get(id);
      if (!conversation) {
        return { status: 404, data: { success: false, error: 'Conversation not found' } };
      }

      const messages = await this.getMessages(id, 100, 0, correlationId);
      const projectContext = await this.loadProjectContext(conversation.project_id, correlationId);

      return {
        status: 200,
        data: {
          success: true,
          conversation,
          messages,
          project_context: projectContext
        }
      };
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to get conversation');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleUpdateConversation(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const updates = req.body || {};

    this.logger.info({ correlationId, conversationId: id }, 'HTTP: Update conversation');

    try {
      const conversation = await this.updateConversation(id, updates, correlationId);
      return { status: 200, data: { success: true, conversation } };
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to update conversation');

      if (error.message.includes('not found')) {
        return { status: 404, data: { success: false, error: error.message } };
      }
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleDeleteConversation(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    this.logger.info({ correlationId, conversationId: id }, 'HTTP: Delete conversation');

    try {
      const result = await this.deleteConversation(id, correlationId);
      return { status: 200, data: { success: true, ...result, message: 'Conversation deleted successfully' } };
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to delete conversation');

      if (error.message.includes('not found')) {
        return { status: 404, data: { success: false, error: error.message } };
      }
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleSendMessage(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const { content, user_id, attachments, metadata } = req.body || {};

    this.logger.info({ correlationId, conversationId: id }, 'HTTP: Send message');

    if (!content || content.trim().length === 0) {
      return { status: 400, data: { success: false, error: 'content is required' } };
    }

    try {
      const result = await this.sendMessage(id, content, user_id, attachments || [], metadata || {}, correlationId);
      return { status: 200, data: { success: true, ...result } };
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to send message');

      if (error.message.includes('not found')) {
        return { status: 404, data: { success: false, error: error.message } };
      }
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleGetMessages(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const { limit = 100, offset = 0 } = req.query || {};

    this.logger.debug({ correlationId, conversationId: id }, 'HTTP: Get messages');

    try {
      const messages = await this.getMessages(id, parseInt(limit), parseInt(offset), correlationId);

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
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to get messages');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleGetContext(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    this.logger.debug({ correlationId, conversationId: id }, 'HTTP: Get context');

    try {
      const conversation = this.conversations.get(id);
      if (!conversation) {
        return { status: 404, data: { success: false, error: 'Conversation not found' } };
      }

      const projectContext = await this.loadProjectContext(conversation.project_id, correlationId);
      const conversationContext = await this.loadConversationContext(id, correlationId);

      return {
        status: 200,
        data: {
          success: true,
          project_context: projectContext,
          conversation_context: conversationContext
        }
      };
    } catch (error) {
      this.logger.error({ correlationId, conversationId: id, error: error.message },
        'HTTP: Failed to get context');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  /**
   * GET /ui/state - UI-ready endpoint for conversation management
   * Returns data structured for direct UI consumption
   */
  async handleUIState(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { project_id } = req.query || {};

    this.logger.debug({ correlationId, projectId: project_id }, 'HTTP: Get UI state');

    if (!project_id) {
      return { status: 400, data: { success: false, error: 'project_id is required' } };
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
      this.logger.error({ correlationId, error: error.message, stack: error.stack }, 'HTTP: Failed to get UI state');
      return {
        status: 500,
        data: {
          success: false,
          error: error.message,
          details: 'Check server logs for more info'
        }
      };
    }
  }

  // ==================== CONTEXT MANAGEMENT HTTP HANDLERS ====================

  async handleToggleContext(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id: messageId } = req.params || {};
    const { project_id: projectId, in_context: inContext } = req.body || {};

    this.logger.info({ correlationId, messageId, inContext }, 'HTTP: Toggle message context');

    if (!projectId) {
      return { status: 400, data: { success: false, error: 'project_id is required' } };
    }

    if (!messageId) {
      return { status: 400, data: { success: false, error: 'message id is required' } };
    }

    if (inContext === undefined) {
      return { status: 400, data: { success: false, error: 'in_context is required' } };
    }

    try {
      const result = await this.toggleMessageContext(projectId, messageId, inContext, correlationId);
      return { status: 200, data: { success: true, ...result } };
    } catch (error) {
      this.logger.error({ correlationId, messageId, error: error.message }, 'HTTP: Failed to toggle context');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleContextStats(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id: conversationId } = req.params || {};
    const projectId = req.query?.project_id;

    this.logger.debug({ correlationId, conversationId }, 'HTTP: Get context stats');

    if (!conversationId) {
      return { status: 400, data: { success: false, error: 'conversation id is required' } };
    }

    // Get project_id from conversation if not provided
    const conversation = this.conversations.get(conversationId);
    const resolvedProjectId = projectId || conversation?.project_id;

    if (!resolvedProjectId) {
      return { status: 400, data: { success: false, error: 'project_id is required or conversation not found' } };
    }

    try {
      const stats = await this.getContextStats(resolvedProjectId, conversationId, correlationId);
      return { status: 200, data: { success: true, ...stats } };
    } catch (error) {
      this.logger.error({ correlationId, conversationId, error: error.message }, 'HTTP: Failed to get context stats');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  // ==================== HEALTH & METRICS ====================

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: 'conversation-manager',
        conversations_count: this.conversations.size,
        pending_requests: this.pendingDbRequests.size + this.pendingAIRequests.size,
        uptime: process.uptime()
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        module: 'conversation-manager',
        metrics: {
          conversations_count: this.conversations.size,
          pending_db_requests: this.pendingDbRequests.size,
          pending_ai_requests: this.pendingAIRequests.size
        }
      }
    };
  }

  // ==================== UI REQUEST HANDLERS ====================
  // These handle mqttRequest from frontend via ui/request/conversation/{action}

  /**
   * UI Handler: Send message
   * Request: mqttRequest('conversation', 'send', { conversationId, content, attachments })
   */
  async handleUISend(data, request) {
    const { conversationId, content, attachments } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info({ correlationId, conversationId }, 'UI: Send message');

    if (!content || content.trim().length === 0) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Content is required' };
    }

    // Get active project first
    const projectId = await this.getActiveProjectId(correlationId);
    if (!projectId) {
      throw { status: 400, code: 'NO_PROJECT', message: 'No active project' };
    }

    // If no conversationId, create a new conversation first
    let convId = conversationId;
    if (!convId) {
      const conversation = await this.createConversation(projectId, null, {}, correlationId);
      convId = conversation.id;
    } else {
      // If conversationId provided, ensure it's loaded in memory
      if (!this.conversations.has(convId)) {
        this.logger.debug({ correlationId, conversationId: convId }, 'Conversation not in memory, trying to load from project');
        await this.loadProjectConversations(projectId, correlationId);

        // If still not found, the frontend created a new ID that doesn't exist yet
        // Create a new conversation with this ID
        if (!this.conversations.has(convId)) {
          this.logger.debug({ correlationId, conversationId: convId }, 'Conversation not in DB, creating new one');
          const conversation = await this.createConversation(projectId, null, {}, correlationId);
          convId = conversation.id;
        }
      }
    }

    try {
      const result = await this.sendMessage(
        convId,
        content,
        null, // user_id
        attachments || [],
        {}, // metadata
        correlationId
      );

      return {
        conversationId: convId,
        ...result
      };
    } catch (error) {
      this.logger.error({ correlationId, conversationId: convId, error: error.message },
        'UI: Failed to send message');
      throw { status: 500, code: 'SEND_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Load conversation (get messages)
   * Request: mqttRequest('conversation', 'load', { conversationId })
   */
  async handleUILoad(data, request) {
    const { conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info({ correlationId, conversationId }, 'UI: Load conversation');

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const messages = await this.getMessages(conversationId, 100, 0, correlationId);
      const conversation = this.conversations.get(conversationId);

      return {
        conversationId,
        messages,
        conversation: conversation || null
      };
    } catch (error) {
      this.logger.error({ correlationId, conversationId, error: error.message },
        'UI: Failed to load conversation');
      throw { status: 500, code: 'LOAD_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Create conversation
   * Request: mqttRequest('conversation', 'create', { projectId?, title?, system_prompt?, model?, provider?, temperature?, max_tokens?, context_window? })
   */
  async handleUICreate(data, request) {
    const {
      projectId,
      title,
      system_prompt,
      model,
      provider,
      temperature,
      max_tokens,
      context_window
    } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info({ correlationId, projectId }, 'UI: Create conversation');

    // Get project ID (use provided or active)
    let projId = projectId;
    if (!projId) {
      projId = await this.getActiveProjectId(correlationId);
      if (!projId) {
        throw { status: 400, code: 'NO_PROJECT', message: 'No active project' };
      }
    }

    try {
      const conversation = await this.createConversation(
        projId,
        null, // user_id
        {
          title: title || 'Nueva conversación',
          system_prompt,
          model,
          provider,
          temperature,
          max_tokens,
          context_window
        },
        correlationId
      );

      return { conversation };
    } catch (error) {
      this.logger.error({ correlationId, projectId: projId, error: error.message },
        'UI: Failed to create conversation');
      throw { status: 500, code: 'CREATE_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: List conversations
   * Request: mqttRequest('conversation', 'list', { projectId? })
   */
  async handleUIList(data, request) {
    const { projectId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info({ correlationId, projectId }, 'UI: List conversations');

    // Get project ID (use provided or active)
    let projId = projectId;
    if (!projId) {
      projId = await this.getActiveProjectId(correlationId);
      if (!projId) {
        return { conversations: [], total: 0 };
      }
    }

    try {
      const conversations = await this.listConversations(projId, correlationId);

      return {
        conversations,
        total: conversations.length
      };
    } catch (error) {
      this.logger.error({ correlationId, projectId: projId, error: error.message },
        'UI: Failed to list conversations');
      throw { status: 500, code: 'LIST_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Get conversation with messages
   * Request: mqttRequest('conversation', 'get', { conversationId })
   */
  async handleUIGet(data, request) {
    const { conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info({ correlationId, conversationId }, 'UI: Get conversation');

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      // Ensure conversation is loaded
      const conversation = this.conversations.get(conversationId);
      if (!conversation) {
        // Try to load from project
        const projectId = await this.getActiveProjectId(correlationId);
        if (projectId) {
          await this.loadProjectConversations(projectId, correlationId);
        }

        const conv = this.conversations.get(conversationId);
        if (!conv) {
          throw { status: 404, code: 'NOT_FOUND', message: 'Conversation not found' };
        }
      }

      const conv = this.conversations.get(conversationId);
      const messages = await this.getMessages(conversationId, 100, 0, correlationId);

      return {
        conversation: conv,
        messages
      };
    } catch (error) {
      if (error.status) throw error;
      this.logger.error({ correlationId, conversationId, error: error.message },
        'UI: Failed to get conversation');
      throw { status: 500, code: 'GET_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Update conversation
   * Request: mqttRequest('conversation', 'update', { conversationId, title?, system_prompt?, model?, temperature?, ... })
   */
  async handleUIUpdate(data, request) {
    const { conversationId, ...updates } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info({ correlationId, conversationId, updates: Object.keys(updates) }, 'UI: Update conversation');

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const conversation = await this.updateConversation(conversationId, updates, correlationId);
      return { conversation };
    } catch (error) {
      if (error.message?.includes('not found')) {
        throw { status: 404, code: 'NOT_FOUND', message: error.message };
      }
      this.logger.error({ correlationId, conversationId, error: error.message },
        'UI: Failed to update conversation');
      throw { status: 500, code: 'UPDATE_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Delete conversation
   * Request: mqttRequest('conversation', 'delete', { conversationId })
   */
  async handleUIDelete(data, request) {
    const { conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info({ correlationId, conversationId }, 'UI: Delete conversation');

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const result = await this.deleteConversation(conversationId, correlationId);
      return {
        success: true,
        id: conversationId,
        messagesDeleted: result.messages_deleted
      };
    } catch (error) {
      if (error.message?.includes('not found')) {
        throw { status: 404, code: 'NOT_FOUND', message: error.message };
      }
      this.logger.error({ correlationId, conversationId, error: error.message },
        'UI: Failed to delete conversation');
      throw { status: 500, code: 'DELETE_ERROR', message: error.message };
    }
  }

  // ==================== UI CONTEXT MANAGEMENT HANDLERS ====================

  /**
   * UI Handler: Toggle message context inclusion
   * Request: mqttRequest('conversation', 'toggleContext', { projectId, messageId, inContext })
   */
  async handleUIToggleContext(data, request) {
    const { projectId, messageId, inContext } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.info({ correlationId, projectId, messageId, inContext }, 'UI: Toggle message context');

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
        ...result
      };
    } catch (error) {
      this.logger.error({ correlationId, messageId, error: error.message },
        'UI: Failed to toggle message context');
      throw { status: 500, code: 'TOGGLE_ERROR', message: error.message };
    }
  }

  /**
   * UI Handler: Get context statistics for a conversation
   * Request: mqttRequest('conversation', 'contextStats', { projectId, conversationId })
   */
  async handleUIContextStats(data, request) {
    const { projectId, conversationId } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    this.logger.debug({ correlationId, projectId, conversationId }, 'UI: Get context stats');

    if (!projectId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'projectId is required' };
    }

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'conversationId is required' };
    }

    try {
      const stats = await this.getContextStats(projectId, conversationId, correlationId);
      return stats;
    } catch (error) {
      this.logger.error({ correlationId, conversationId, error: error.message },
        'UI: Failed to get context stats');
      throw { status: 500, code: 'STATS_ERROR', message: error.message };
    }
  }

  /**
   * Helper: List conversations for a project
   */
  async listConversations(projectId, correlationId) {
    await this.loadProjectConversations(projectId, correlationId);

    const conversations = Array.from(this.conversations.values())
      .filter(c => c.project_id === projectId)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    return conversations;
  }

  /**
   * Helper: Get active project ID from project-manager
   */
  async getActiveProjectId(correlationId) {
    const requestId = crypto.randomUUID();

    // Subscribe to response first
    let resolvePromise;
    let timeoutId;

    const projectPromise = new Promise((resolve) => {
      resolvePromise = resolve;
      timeoutId = setTimeout(() => {
        resolve(null);
      }, 5000);
    });

    // Listen for active project response
    const unsubActive = await this.eventBus.subscribe(EVENTS.PROJECT.ACTIVE_RESPONSE, (event) => {
      // Handle wrapped event format: event.data contains the actual payload
      if (event.data?.request_id === requestId) {
        clearTimeout(timeoutId);
        resolvePromise(event.data);
      }
    });

    await this.eventBus.publish(EVENTS.PROJECT.ACTIVE_REQUEST, {
      request_id: requestId,
      correlation_id: correlationId
    });

    const response = await projectPromise;

    // Cleanup subscription
    if (unsubActive) unsubActive();

    // project-manager returns active_project_id (not project.id)
    return response?.active_project_id || null;
  }
}

module.exports = ConversationManagerModule;
