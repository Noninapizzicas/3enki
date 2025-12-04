/**
 * Módulo Menu Generator
 * Genera menús desde cartas físicas usando IA - Enfoque generativo
 * Salida compatible con sistema POS: productos, categorias, ingredientes, variaciones
 */

const { v4: uuidv4 } = require('uuid');
const {
  MENU_EXTRACTION_SYSTEM_PROMPT,
  MENU_CHAT_SYSTEM_PROMPT,
  buildExtractionMessages,
  buildChatSystemPrompt,
  extractJSONFromResponse,
  validateMenuStructure,
  enrichMenu
} = require('./prompts/menu-extraction');

class MenuGeneratorModule {
  constructor() {
    this.name = 'menu-generator';
    this.version = '2.0.0';

    // ==========================================
    // Estado Principal
    // ==========================================
    this.menus = new Map();           // menu_id -> menu_data
    this.pendingRequests = new Map(); // request_id -> menu_id

    // ==========================================
    // Estado para Chat/Conversaciones (AI Workspace)
    // ==========================================
    this.conversations = new Map();   // conversation_id -> conversation_data
    this.messages = new Map();        // conversation_id -> [messages]
    this.streamingClients = new Map(); // client_id -> response object (SSE)

    // ==========================================
    // Plantillas y Configuración
    // ==========================================
    this.templates = this._initializeTemplates();

    // ==========================================
    // Dependencias (inyectadas por core)
    // ==========================================
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.aiGateway = null;
  }

  /**
   * Inicializa plantillas predefinidas para generación de menús
   * @private
   */
  _initializeTemplates() {
    return [
      {
        id: 'tpl_restaurante_italiano',
        name: 'Restaurante Italiano',
        emoji: '🍝',
        description: 'Plantilla para restaurantes de comida italiana',
        categories: ['Antipasti', 'Primi Piatti', 'Secondi', 'Pizze', 'Dolci', 'Bevande'],
        promptHint: 'Incluye pasta, pizza, entrantes italianos y postres tradicionales',
        style: { language: 'es', includeAllergens: true, includePrices: true }
      },
      {
        id: 'tpl_restaurante_japones',
        name: 'Restaurante Japonés',
        emoji: '🍣',
        description: 'Plantilla para restaurantes de comida japonesa',
        categories: ['Entrantes', 'Sushi', 'Sashimi', 'Ramen', 'Tempura', 'Postres', 'Bebidas'],
        promptHint: 'Incluye sushi, ramen, tempura y platos tradicionales japoneses',
        style: { language: 'es', includeAllergens: true, includePrices: true }
      },
      {
        id: 'tpl_cafeteria',
        name: 'Cafetería',
        emoji: '☕',
        description: 'Plantilla para cafeterías y brunch',
        categories: ['Desayunos', 'Brunch', 'Sándwiches', 'Ensaladas', 'Tartas', 'Cafés', 'Bebidas'],
        promptHint: 'Incluye opciones de desayuno, brunch, sándwiches y bebidas calientes',
        style: { language: 'es', includeAllergens: true, includePrices: true }
      },
      {
        id: 'tpl_bar_tapas',
        name: 'Bar de Tapas',
        emoji: '🍻',
        description: 'Plantilla para bares de tapas españoles',
        categories: ['Tapas Frías', 'Tapas Calientes', 'Raciones', 'Montaditos', 'Postres', 'Vinos', 'Cervezas'],
        promptHint: 'Incluye tapas tradicionales españolas, raciones y bebidas',
        style: { language: 'es', includeAllergens: true, includePrices: true }
      },
      {
        id: 'tpl_comida_rapida',
        name: 'Comida Rápida',
        emoji: '🍔',
        description: 'Plantilla para restaurantes de comida rápida',
        categories: ['Hamburguesas', 'Perritos', 'Patatas', 'Combos', 'Bebidas', 'Postres'],
        promptHint: 'Incluye hamburguesas, combos y opciones de fast food',
        style: { language: 'es', includeAllergens: true, includePrices: true }
      }
    ];
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    // Inyectar referencia al módulo ai-gateway si está disponible
    if (core.modules && core.modules['ai-gateway']) {
      this.aiGateway = core.modules['ai-gateway'];
      this.logger.info('menu-generator.ai_gateway_injected');
    }

    this.logger.info('modulo.loading', { module: this.name });

    // Suscribirse a eventos
    await this.subscribeToEvents();

    this.logger.info('modulo.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    // Suscribirse al evento correcto de ai-gateway
    await this.eventBus.subscribe('ai.completion.completed', this.onAICompletionCompleted.bind(this));
  }

  /**
   * Handler para evento ai.completion.completed de ai-gateway
   * @param {Object} event - Evento con payload { provider, model, prompt_id, tokens_used, latency_ms, cost, metadata }
   */
  async onAICompletionCompleted(event) {
    const start_time = Date.now();
    const { prompt_id, provider, model, tokens_used, latency_ms, cost, metadata } = event.payload || {};

    // Extraer request_id del metadata o prompt_id
    const request_id = metadata?.request_id || prompt_id;
    const data = metadata?.response_data;
    const error = metadata?.error;
    const status = error ? 'error' : 'success';

    this.logger.info('ai.response.received', {
      request_id,
      status,
      correlation_id: event.correlation_id
    });

    const menu_id = this.pendingRequests.get(request_id);
    if (!menu_id) {
      this.logger.warn('ai.response.orphan', {
        request_id,
        correlation_id: event.correlation_id
      });
      return;
    }

    const menu = this.menus.get(menu_id);
    if (!menu) {
      this.logger.error('ai.response.menu_not_found', {
        menu_id,
        request_id,
        correlation_id: event.correlation_id
      });
      return;
    }

    if (status === 'success') {
      // Parsear respuesta de IA y enriquecer menú
      try {
        const enrichedMenu = this.enrichMenuFromAI(menu, data);
        enrichedMenu.estado = 'generado';
        enrichedMenu.generation_time = Date.now() - start_time;

        this.menus.set(menu_id, enrichedMenu);
        this.pendingRequests.delete(request_id);

        // Métricas
        this.metrics.increment('menu.generado.total');
        this.metrics.timing('menu.generation.duration', enrichedMenu.generation_time);
        this.metrics.gauge('menu.pendientes_validacion.count',
          Array.from(this.menus.values()).filter(m => m.estado === 'generado').length
        );

        // Publicar evento menu.generado
        await this.publishMenuGenerado(enrichedMenu, event.correlation_id);

        this.logger.info('menu.generado', {
          menu_id,
          productos_count: enrichedMenu.productos.length,
          categorias_count: enrichedMenu.categorias.length,
          correlation_id: event.correlation_id,
          duration: enrichedMenu.generation_time
        });

      } catch (parseError) {
        this.logger.error('ai.response.parse_error', {
          menu_id,
          error: parseError.message,
          correlation_id: event.correlation_id
        });

        menu.estado = 'error';
        menu.error = parseError.message;
        this.menus.set(menu_id, menu);

        await this.publishMenuError(menu_id, 'ai_processing_failed', parseError.message, event.correlation_id);
      }

    } else {
      // Error en procesamiento IA
      menu.estado = 'error';
      menu.error = error || 'AI processing failed';
      this.menus.set(menu_id, menu);
      this.pendingRequests.delete(request_id);

      this.metrics.increment('menu.errors.total', 1, { type: 'ai_processing' });

      await this.publishMenuError(menu_id, 'ai_processing_failed', error, event.correlation_id);

      this.logger.error('ai.processing.failed', {
        menu_id,
        request_id,
        error,
        correlation_id: event.correlation_id
      });
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleUploadMenu(req) {
    const start_time = Date.now();

    this.logger.info('menu.upload.start', {
      correlation_id: req.correlationId || req.request_id
    });

    try {
      const { file_base64, file_name, file_type, metadata } = req.body;

      // Validar entrada
      if (!file_base64 || !file_name) {
        return {
          status: 400,
          data: { error: 'file_base64 y file_name son requeridos' }
        };
      }

      const menu_id = `menu_${Date.now()}`;
      const request_id = uuidv4();

      // Guardar menú inicial
      const menu = {
        id: menu_id,
        source: {
          tipo: this.detectFileType(file_name, file_type),
          nombre_archivo: file_name,
          uploaded_at: new Date().toISOString()
        },
        estado: 'generando',
        productos: [],
        categorias: [],
        ingredientes_catalogo: [],
        metadata: metadata || {},
        created_at: new Date().toISOString()
      };

      this.menus.set(menu_id, menu);
      this.pendingRequests.set(request_id, menu_id);

      // Métricas
      this.metrics.increment('menu.upload.total');
      this.metrics.timing('menu.upload.duration', Date.now() - start_time);

      // Publicar evento ai.request para procesamiento
      await this.publishAIRequest(request_id, file_base64, file_name, file_type, req.correlationId || req.request_id);

      this.logger.info('menu.upload.success', {
        menu_id,
        request_id,
        file_name,
        correlation_id: req.correlationId || req.request_id,
        duration: Date.now() - start_time
      });

      return {
        status: 202,
        data: {
          menu_id,
          estado: 'generando',
          message: 'Menú en proceso de generación',
          estimated_time: 30
        }
      };

    } catch (error) {
      this.metrics.increment('menu.errors.total', 1, { operation: 'upload' });

      this.logger.error('menu.upload.error', {
        error: error.message,
        stack: error.stack,
        correlation_id: req.correlationId || req.request_id
      });

      return {
        status: 500,
        data: { error: error.message }
      };
    }
  }

  async handleListMenus(req) {
    const menus = Array.from(this.menus.values())
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return {
      status: 200,
      data: {
        menus: menus.map(m => ({
          id: m.id,
          estado: m.estado,
          productos_count: m.productos.length,
          categorias_count: m.categorias.length,
          created_at: m.created_at,
          validated_at: m.validated_at
        })),
        total: menus.length
      }
    };
  }

  async handleGetMenu(req) {
    const { id } = req.params;
    const menu = this.menus.get(id);

    if (!menu) {
      return {
        status: 404,
        data: { error: 'Menú no encontrado' }
      };
    }

    return {
      status: 200,
      data: menu
    };
  }

  async handleValidateMenu(req) {
    const { id } = req.params;
    const { correcciones } = req.body || {};

    const menu = this.menus.get(id);
    if (!menu) {
      return {
        status: 404,
        data: { error: 'Menú no encontrado' }
      };
    }

    if (menu.estado !== 'generado') {
      return {
        status: 400,
        data: { error: `Menú en estado '${menu.estado}', debe estar 'generado'` }
      };
    }

    // Aplicar correcciones si existen
    if (correcciones && correcciones.length > 0) {
      this.applyCorrections(menu, correcciones);
    }

    menu.estado = 'validado';
    menu.validated_at = new Date().toISOString();
    this.menus.set(id, menu);

    // Métricas
    this.metrics.increment('menu.validado.total');
    this.metrics.gauge('menu.pendientes_validacion.count',
      Array.from(this.menus.values()).filter(m => m.estado === 'generado').length
    );

    // Publicar evento menu.validado
    await this.publishMenuValidado(id, correcciones || [], req.correlationId || req.request_id);

    this.logger.info('menu.validado', {
      menu_id: id,
      correcciones_count: correcciones ? correcciones.length : 0,
      correlation_id: req.correlationId || req.request_id
    });

    return {
      status: 200,
      data: {
        menu_id: id,
        estado: 'validado',
        message: 'Menú validado correctamente'
      }
    };
  }

  async handleHealthCheck(req) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: this.version,
        menus: {
          total: this.menus.size,
          generando: Array.from(this.menus.values()).filter(m => m.estado === 'generando').length,
          generado: Array.from(this.menus.values()).filter(m => m.estado === 'generado').length,
          validado: Array.from(this.menus.values()).filter(m => m.estado === 'validado').length
        }
      }
    };
  }

  async handleGetMetrics(req) {
    return {
      status: 200,
      data: {
        counters: {
          'menu.upload.total': this.metrics.getCounter('menu.upload.total') || 0,
          'menu.generado.total': this.metrics.getCounter('menu.generado.total') || 0,
          'menu.validado.total': this.metrics.getCounter('menu.validado.total') || 0,
          'menu.errors.total': this.metrics.getCounter('menu.errors.total') || 0,
          'conversation.created.total': this.metrics.getCounter('conversation.created.total') || 0,
          'message.sent.total': this.metrics.getCounter('message.sent.total') || 0
        },
        gauges: {
          'menu.pendientes_validacion.count': Array.from(this.menus.values()).filter(m => m.estado === 'generado').length,
          'menu.total.count': this.menus.size,
          'conversation.active.count': this.conversations.size,
          'streaming.clients.count': this.streamingClients.size
        }
      }
    };
  }

  // ==========================================
  // CONVERSATION APIs (AI Workspace)
  // ==========================================

  /**
   * GET /conversations - Lista todas las conversaciones
   * @param {Object} req - Request object
   * @returns {Object} Lista de conversaciones
   */
  async handleListConversations(req) {
    const { limit = 20, offset = 0, status } = req.query || {};

    let conversations = Array.from(this.conversations.values())
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Filtrar por estado si se especifica
    if (status) {
      conversations = conversations.filter(c => c.status === status);
    }

    // Paginación
    const total = conversations.length;
    const paginated = conversations.slice(Number(offset), Number(offset) + Number(limit));

    this.logger.info('conversations.list', {
      total,
      returned: paginated.length,
      correlation_id: req.correlationId
    });

    return {
      status: 200,
      data: {
        conversations: paginated.map(c => ({
          id: c.id,
          title: c.title,
          status: c.status,
          messagesCount: (this.messages.get(c.id) || []).length,
          menuId: c.menuId,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt
        })),
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + Number(limit) < total
        }
      }
    };
  }

  /**
   * POST /conversations - Crea una nueva conversación
   * @param {Object} req - Request con body { title?, templateId?, aiConfig? }
   * @returns {Object} Conversación creada
   */
  async handleCreateConversation(req) {
    const { title, templateId, aiConfig, styleConfig } = req.body || {};

    const conversationId = `conv_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();

    // Obtener plantilla si se especifica
    const template = templateId ? this.templates.find(t => t.id === templateId) : null;

    const conversation = {
      id: conversationId,
      title: title || `Conversación ${this.conversations.size + 1}`,
      status: 'active',
      templateId: templateId || null,
      templateName: template?.name || null,
      menuId: null,
      aiConfig: {
        provider: aiConfig?.provider || 'deepseek',
        model: aiConfig?.model || '',
        temperature: aiConfig?.temperature ?? 0.7,
        maxTokens: aiConfig?.maxTokens || 2000
      },
      styleConfig: styleConfig || {
        menuType: 'restaurant',
        language: 'es',
        includeDescriptions: true,
        includeAllergens: true,
        includePrices: true
      },
      metadata: {
        userAgent: req.headers?.['user-agent'] || 'unknown',
        createdBy: req.userId || 'anonymous'
      },
      createdAt: now,
      updatedAt: now
    };

    this.conversations.set(conversationId, conversation);
    this.messages.set(conversationId, []);

    // Métricas
    this.metrics.increment('conversation.created.total');

    // Publicar evento
    await this.eventBus.publish('menu-generator.conversation.created', {
      conversationId,
      title: conversation.title,
      templateId
    }, { correlationId: req.correlationId });

    this.logger.info('conversation.created', {
      conversationId,
      templateId,
      correlation_id: req.correlationId
    });

    return {
      status: 201,
      data: conversation
    };
  }

  /**
   * GET /conversations/:id - Obtiene una conversación específica
   * @param {Object} req - Request con params.id
   * @returns {Object} Conversación con mensajes
   */
  async handleGetConversation(req) {
    const { id } = req.params;

    const conversation = this.conversations.get(id);
    if (!conversation) {
      return {
        status: 404,
        data: { error: 'Conversación no encontrada', code: 'CONVERSATION_NOT_FOUND' }
      };
    }

    const messages = this.messages.get(id) || [];

    return {
      status: 200,
      data: {
        ...conversation,
        messages,
        menu: conversation.menuId ? this.menus.get(conversation.menuId) : null
      }
    };
  }

  /**
   * DELETE /conversations/:id - Elimina una conversación
   * @param {Object} req - Request con params.id
   * @returns {Object} Confirmación
   */
  async handleDeleteConversation(req) {
    const { id } = req.params;

    if (!this.conversations.has(id)) {
      return {
        status: 404,
        data: { error: 'Conversación no encontrada', code: 'CONVERSATION_NOT_FOUND' }
      };
    }

    this.conversations.delete(id);
    this.messages.delete(id);

    this.logger.info('conversation.deleted', {
      conversationId: id,
      correlation_id: req.correlationId
    });

    return {
      status: 200,
      data: { message: 'Conversación eliminada correctamente', conversationId: id }
    };
  }

  // ==========================================
  // MESSAGES APIs
  // ==========================================

  /**
   * GET /conversations/:id/messages - Obtiene mensajes de una conversación
   * @param {Object} req - Request con params.id y query { limit, before }
   * @returns {Object} Lista de mensajes
   */
  async handleGetMessages(req) {
    const { id } = req.params;
    const { limit = 50, before } = req.query || {};

    if (!this.conversations.has(id)) {
      return {
        status: 404,
        data: { error: 'Conversación no encontrada', code: 'CONVERSATION_NOT_FOUND' }
      };
    }

    let messages = this.messages.get(id) || [];

    // Filtrar mensajes antes de cierta fecha si se especifica
    if (before) {
      messages = messages.filter(m => new Date(m.timestamp) < new Date(before));
    }

    // Limitar resultados
    const limited = messages.slice(-Number(limit));

    return {
      status: 200,
      data: {
        conversationId: id,
        messages: limited,
        total: messages.length,
        hasMore: messages.length > Number(limit)
      }
    };
  }

  /**
   * POST /conversations/:id/messages - Envía un mensaje y obtiene respuesta de IA
   * @param {Object} req - Request con body { content, role?, attachments? }
   * @returns {Object} Mensaje del usuario y respuesta de IA
   */
  async handleSendMessage(req) {
    const { id } = req.params;
    const { content, role = 'user', attachments = [] } = req.body || {};

    // Validaciones
    if (!this.conversations.has(id)) {
      return {
        status: 404,
        data: { error: 'Conversación no encontrada', code: 'CONVERSATION_NOT_FOUND' }
      };
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return {
        status: 400,
        data: { error: 'El contenido del mensaje es requerido', code: 'INVALID_CONTENT' }
      };
    }

    if (content.length > 4000) {
      return {
        status: 400,
        data: { error: 'El mensaje excede el límite de 4000 caracteres', code: 'CONTENT_TOO_LONG' }
      };
    }

    const conversation = this.conversations.get(id);
    const conversationMessages = this.messages.get(id) || [];
    const now = new Date().toISOString();

    // Crear mensaje del usuario
    const userMessage = {
      id: `msg_${Date.now()}_${uuidv4().slice(0, 8)}`,
      role: 'user',
      content: content.trim(),
      attachments,
      timestamp: now,
      status: 'sent'
    };

    conversationMessages.push(userMessage);
    this.messages.set(id, conversationMessages);

    // Métricas
    this.metrics.increment('message.sent.total');

    // Publicar evento de mensaje enviado
    await this.eventBus.publish('menu-generator.message.sent', {
      conversationId: id,
      messageId: userMessage.id,
      role: 'user'
    }, { correlationId: req.correlationId });

    this.logger.info('message.sent', {
      conversationId: id,
      messageId: userMessage.id,
      contentLength: content.length,
      attachmentsCount: attachments.length,
      correlation_id: req.correlationId
    });

    // Generar respuesta de IA
    try {
      const aiResponse = await this._generateAIResponse(conversation, conversationMessages, req.correlationId);

      // Crear mensaje de respuesta
      const assistantMessage = {
        id: `msg_${Date.now()}_${uuidv4().slice(0, 8)}`,
        role: 'assistant',
        content: aiResponse.content,
        timestamp: new Date().toISOString(),
        status: 'received',
        metadata: {
          provider: conversation.aiConfig.provider,
          model: aiResponse.model,
          tokensUsed: aiResponse.tokensUsed,
          processingTime: aiResponse.processingTime
        }
      };

      conversationMessages.push(assistantMessage);
      this.messages.set(id, conversationMessages);

      // Actualizar conversación
      conversation.updatedAt = new Date().toISOString();
      this.conversations.set(id, conversation);

      // Verificar si la respuesta contiene un menú generado
      if (aiResponse.menuGenerated && aiResponse.menuData) {
        const menuId = await this._saveGeneratedMenu(aiResponse.menuData, id);
        conversation.menuId = menuId;
        this.conversations.set(id, conversation);
      }

      // Publicar evento de mensaje recibido
      await this.eventBus.publish('menu-generator.message.received', {
        conversationId: id,
        messageId: assistantMessage.id,
        role: 'assistant'
      }, { correlationId: req.correlationId });

      return {
        status: 200,
        data: {
          userMessage,
          assistantMessage,
          menuGenerated: aiResponse.menuGenerated || false,
          menuId: conversation.menuId
        }
      };

    } catch (error) {
      this.logger.error('message.ai_response_error', {
        conversationId: id,
        error: error.message,
        correlation_id: req.correlationId
      });

      // Crear mensaje de error
      const errorMessage = {
        id: `msg_${Date.now()}_${uuidv4().slice(0, 8)}`,
        role: 'system',
        content: `Error al procesar: ${error.message}`,
        timestamp: new Date().toISOString(),
        status: 'error',
        metadata: { errorType: error.code || 'AI_ERROR' }
      };

      conversationMessages.push(errorMessage);
      this.messages.set(id, conversationMessages);

      return {
        status: 200,
        data: {
          userMessage,
          assistantMessage: errorMessage,
          error: true
        }
      };
    }
  }

  // ==========================================
  // STREAMING API (SSE)
  // ==========================================

  /**
   * GET /stream - Endpoint SSE para streaming de respuestas
   * @param {Object} req - Request con query { conversationId }
   * @param {Object} res - Response object para SSE
   */
  async handleStream(req, res) {
    const { conversationId } = req.query || {};

    if (!conversationId || !this.conversations.has(conversationId)) {
      return {
        status: 400,
        data: { error: 'conversationId válido es requerido', code: 'INVALID_CONVERSATION' }
      };
    }

    // Configurar SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const clientId = `client_${Date.now()}_${uuidv4().slice(0, 8)}`;
    this.streamingClients.set(clientId, { res, conversationId });

    this.logger.info('stream.client_connected', {
      clientId,
      conversationId,
      correlation_id: req.correlationId
    });

    // Enviar evento de conexión
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, conversationId })}\n\n`);

    // Heartbeat para mantener conexión
    const heartbeat = setInterval(() => {
      if (this.streamingClients.has(clientId)) {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
      }
    }, 30000);

    // Cleanup al desconectar
    req.on('close', () => {
      clearInterval(heartbeat);
      this.streamingClients.delete(clientId);
      this.logger.info('stream.client_disconnected', { clientId, conversationId });
    });

    // No retornar respuesta estándar (SSE maneja su propio ciclo de vida)
    return null;
  }

  /**
   * Envía un evento SSE a clientes conectados de una conversación
   * @private
   */
  _broadcastToConversation(conversationId, event, data) {
    for (const [clientId, client] of this.streamingClients.entries()) {
      if (client.conversationId === conversationId) {
        try {
          client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
          this.logger.warn('stream.broadcast_error', { clientId, error: error.message });
          this.streamingClients.delete(clientId);
        }
      }
    }
  }

  // ==========================================
  // TEMPLATES API
  // ==========================================

  /**
   * GET /templates - Lista plantillas disponibles
   * @param {Object} req - Request object
   * @returns {Object} Lista de plantillas
   */
  async handleGetTemplates(req) {
    return {
      status: 200,
      data: {
        templates: this.templates,
        total: this.templates.length
      }
    };
  }

  /**
   * GET /templates/:id - Obtiene una plantilla específica
   * @param {Object} req - Request con params.id
   * @returns {Object} Plantilla
   */
  async handleGetTemplate(req) {
    const { id } = req.params;
    const template = this.templates.find(t => t.id === id);

    if (!template) {
      return {
        status: 404,
        data: { error: 'Plantilla no encontrada', code: 'TEMPLATE_NOT_FOUND' }
      };
    }

    return {
      status: 200,
      data: template
    };
  }

  // ==========================================
  // HISTORY API
  // ==========================================

  /**
   * GET /history - Historial de menús generados con conversaciones
   * @param {Object} req - Request con query { limit, offset, status }
   * @returns {Object} Historial paginado
   */
  async handleGetHistory(req) {
    const { limit = 10, offset = 0, status } = req.query || {};

    // Combinar menús con info de conversaciones
    let history = Array.from(this.menus.values())
      .map(menu => {
        // Buscar conversación asociada
        const conversation = Array.from(this.conversations.values())
          .find(c => c.menuId === menu.id);

        return {
          id: menu.id,
          type: 'menu',
          estado: menu.estado,
          title: conversation?.title || `Menú ${menu.id.slice(-8)}`,
          productosCount: menu.productos?.length || 0,
          categoriasCount: menu.categorias?.length || 0,
          conversationId: conversation?.id || null,
          source: menu.source,
          createdAt: menu.created_at,
          validatedAt: menu.validated_at,
          metadata: {
            templateUsed: conversation?.templateName || null,
            aiProvider: conversation?.aiConfig?.provider || 'unknown'
          }
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Filtrar por estado
    if (status) {
      history = history.filter(h => h.estado === status);
    }

    // Paginación
    const total = history.length;
    const paginated = history.slice(Number(offset), Number(offset) + Number(limit));

    return {
      status: 200,
      data: {
        history: paginated,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + Number(limit) < total
        }
      }
    };
  }

  // ==========================================
  // EXPORT API
  // ==========================================

  /**
   * POST /menus/:id/export - Exporta un menú en formato específico
   * @param {Object} req - Request con params.id y body { format }
   * @returns {Object} Datos exportados
   */
  async handleExportMenu(req) {
    const { id } = req.params;
    const { format = 'json' } = req.body || {};

    const menu = this.menus.get(id);
    if (!menu) {
      return {
        status: 404,
        data: { error: 'Menú no encontrado', code: 'MENU_NOT_FOUND' }
      };
    }

    let exportData;
    let contentType;
    let filename;

    switch (format.toLowerCase()) {
      case 'json':
        exportData = JSON.stringify(menu, null, 2);
        contentType = 'application/json';
        filename = `menu_${id}.json`;
        break;

      case 'csv':
        exportData = this._menuToCSV(menu);
        contentType = 'text/csv';
        filename = `menu_${id}.csv`;
        break;

      case 'markdown':
      case 'md':
        exportData = this._menuToMarkdown(menu);
        contentType = 'text/markdown';
        filename = `menu_${id}.md`;
        break;

      default:
        return {
          status: 400,
          data: { error: `Formato '${format}' no soportado. Use: json, csv, markdown`, code: 'INVALID_FORMAT' }
        };
    }

    // Publicar evento
    await this.eventBus.publish('menu-generator.menu.exported', {
      menuId: id,
      format,
      timestamp: new Date().toISOString()
    }, { correlationId: req.correlationId });

    this.logger.info('menu.exported', {
      menuId: id,
      format,
      correlation_id: req.correlationId
    });

    return {
      status: 200,
      data: {
        menuId: id,
        format,
        filename,
        contentType,
        content: exportData,
        exportedAt: new Date().toISOString()
      }
    };
  }

  /**
   * POST /menus/:id/export-pos - Exporta menú en formato POS listo para importar
   * Genera estructura separada para: productos, categorias, ingredientes, variaciones
   * @param {Object} req - Request con params.id
   * @returns {Object} Datos estructurados para módulos POS
   */
  async handleExportPOS(req) {
    const { id } = req.params;
    const { target_modules = ['productos', 'categorias', 'ingredientes', 'variaciones'] } = req.body || {};

    const menu = this.menus.get(id);
    if (!menu) {
      return {
        status: 404,
        data: { error: 'Menú no encontrado', code: 'MENU_NOT_FOUND' }
      };
    }

    if (menu.estado !== 'validado' && menu.estado !== 'generado') {
      return {
        status: 400,
        data: {
          error: `Menú en estado '${menu.estado}'. Debe estar 'generado' o 'validado' para exportar`,
          code: 'INVALID_STATE'
        }
      };
    }

    const posExport = {
      menu_id: id,
      exported_at: new Date().toISOString(),
      modules: {}
    };

    // Exportar categorías
    if (target_modules.includes('categorias')) {
      posExport.modules.categorias = (menu.categorias || []).map(cat => ({
        id: cat.id,
        nombre: cat.nombre,
        emoji: cat.emoji || '📋',
        descripcion: cat.descripcion || '',
        orden: cat.orden ?? 0,
        activa: cat.activa !== false,
        horario_disponible: cat.horario_disponible || null,
        // Metadata para importación
        _source: 'menu-generator',
        _menu_id: id
      }));
    }

    // Exportar ingredientes (catálogo unificado)
    if (target_modules.includes('ingredientes')) {
      posExport.modules.ingredientes = (menu.ingredientes_catalogo || []).map(ing => ({
        id: ing.id,
        nombre: ing.nombre,
        emoji: ing.emoji || '🥄',
        tipo: ing.tipo || 'otro',
        unidad_medida: ing.unidad_medida || 'porcion',
        es_extra: ing.es_extra || false,
        precio_extra: ing.precio_extra || 0,
        alergenos: ing.alergenos || [],
        activo: true,
        // Metadata para importación
        _source: 'menu-generator',
        _menu_id: id
      }));
    }

    // Exportar productos
    if (target_modules.includes('productos')) {
      posExport.modules.productos = (menu.productos || []).map(prod => ({
        id: prod.id,
        nombre: prod.nombre,
        nombre_corto: prod.nombre_corto || prod.nombre.substring(0, 20),
        emoji: prod.emoji || '🍽️',
        categoria_id: prod.categoria_id,
        descripcion: prod.descripcion || '',
        precio: prod.precio || 0,
        precio_original: prod.precio_original || null,
        ingredientes: (prod.ingredientes || []).map(ing => ({
          ingrediente_id: ing.ingrediente_id,
          cantidad: ing.cantidad || 1,
          es_principal: ing.es_principal || false,
          removible: ing.removible !== false,
          visible_en_carta: ing.visible_en_carta !== false
        })),
        alergenos: prod.alergenos || [],
        tags: prod.tags || [],
        calorias: prod.calorias || null,
        tiempo_preparacion: prod.tiempo_preparacion || null,
        disponible: prod.disponible !== false,
        orden: prod.orden ?? 0,
        // Metadata para importación
        _source: 'menu-generator',
        _menu_id: id
      }));
    }

    // Exportar variaciones
    if (target_modules.includes('variaciones')) {
      posExport.modules.variaciones = {
        // Variaciones por producto
        por_producto: (menu.productos || [])
          .filter(p => p.variaciones)
          .map(prod => ({
            producto_id: prod.id,
            permite_quitar_ingredientes: prod.variaciones.permite_quitar_ingredientes !== false,
            permite_extras: prod.variaciones.permite_extras !== false,
            extras_sugeridos: prod.variaciones.extras_sugeridos || [],
            tamanos: prod.variaciones.tamanos || [],
            opciones: prod.variaciones.opciones || []
          })),
        // Variaciones globales
        globales: (menu.variaciones_globales || []).map(v => ({
          id: v.id,
          nombre: v.nombre,
          tipo: v.tipo,
          aplica_a_categorias: v.aplica_a_categorias || [],
          valores: v.valores || []
        }))
      };
    }

    // Estadísticas de la exportación
    posExport.estadisticas = {
      categorias: posExport.modules.categorias?.length || 0,
      ingredientes: posExport.modules.ingredientes?.length || 0,
      productos: posExport.modules.productos?.length || 0,
      variaciones_producto: posExport.modules.variaciones?.por_producto?.length || 0,
      variaciones_globales: posExport.modules.variaciones?.globales?.length || 0
    };

    // Publicar evento
    await this.eventBus.publish('menu-generator.menu.exported_pos', {
      menuId: id,
      target_modules,
      estadisticas: posExport.estadisticas,
      timestamp: posExport.exported_at
    }, { correlationId: req.correlationId });

    this.logger.info('menu.exported_pos', {
      menuId: id,
      target_modules,
      estadisticas: posExport.estadisticas,
      correlation_id: req.correlationId
    });

    return {
      status: 200,
      data: posExport
    };
  }

  /**
   * POST /menus/:id/apply-pos - Aplica menú directamente a módulos POS
   * Publica eventos para que cada módulo importe sus datos
   * @param {Object} req - Request con params.id
   * @returns {Object} Resultado de la aplicación
   */
  async handleApplyToPOS(req) {
    const { id } = req.params;
    const { replace_existing = false, dry_run = false } = req.body || {};

    const menu = this.menus.get(id);
    if (!menu) {
      return {
        status: 404,
        data: { error: 'Menú no encontrado', code: 'MENU_NOT_FOUND' }
      };
    }

    if (menu.estado !== 'validado') {
      return {
        status: 400,
        data: {
          error: `Menú debe estar 'validado' para aplicar al POS. Estado actual: '${menu.estado}'`,
          code: 'MENU_NOT_VALIDATED'
        }
      };
    }

    const correlationId = req.correlationId || `apply_${Date.now()}`;
    const results = {
      menu_id: id,
      dry_run,
      replace_existing,
      applied_at: new Date().toISOString(),
      events_published: []
    };

    if (dry_run) {
      // Solo simular sin publicar eventos
      results.simulation = {
        categorias: menu.categorias?.length || 0,
        ingredientes: menu.ingredientes_catalogo?.length || 0,
        productos: menu.productos?.length || 0,
        message: 'Simulación completada. Usa dry_run: false para aplicar cambios.'
      };
    } else {
      // Publicar evento para importar categorías
      if (menu.categorias?.length > 0) {
        await this.eventBus.publish('pos.categorias.import', {
          source: 'menu-generator',
          menu_id: id,
          replace_existing,
          categorias: menu.categorias
        }, { correlationId });
        results.events_published.push('pos.categorias.import');
      }

      // Publicar evento para importar ingredientes
      if (menu.ingredientes_catalogo?.length > 0) {
        await this.eventBus.publish('pos.ingredientes.import', {
          source: 'menu-generator',
          menu_id: id,
          replace_existing,
          ingredientes: menu.ingredientes_catalogo
        }, { correlationId });
        results.events_published.push('pos.ingredientes.import');
      }

      // Publicar evento para importar productos
      if (menu.productos?.length > 0) {
        await this.eventBus.publish('pos.productos.import', {
          source: 'menu-generator',
          menu_id: id,
          replace_existing,
          productos: menu.productos
        }, { correlationId });
        results.events_published.push('pos.productos.import');
      }

      // Publicar evento para importar variaciones
      if (menu.variaciones_globales?.length > 0) {
        await this.eventBus.publish('pos.variaciones.import', {
          source: 'menu-generator',
          menu_id: id,
          replace_existing,
          variaciones: menu.variaciones_globales
        }, { correlationId });
        results.events_published.push('pos.variaciones.import');
      }

      // Marcar menú como aplicado
      menu.estado = 'aplicado';
      menu.applied_at = results.applied_at;
      this.menus.set(id, menu);

      // Métricas
      this.metrics.increment('menu.applied_pos.total');
    }

    this.logger.info('menu.apply_pos', {
      menuId: id,
      dry_run,
      replace_existing,
      events: results.events_published,
      correlation_id: correlationId
    });

    return {
      status: 200,
      data: results
    };
  }

  // ==========================================
  // AI RESPONSE GENERATION (Private)
  // ==========================================

  /**
   * Genera respuesta de IA para una conversación usando ai-gateway
   * @private
   */
  async _generateAIResponse(conversation, messages, correlationId) {
    const startTime = Date.now();

    // Construir contexto del chat
    const systemPrompt = this._buildSystemPrompt(conversation);
    const chatHistory = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Preparar mensajes para ai-gateway
    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory
    ];

    try {
      // Llamar a ai-gateway via HTTP (módulo interno)
      const aiResponse = await this._callAIGateway(
        aiMessages,
        conversation.aiConfig,
        correlationId
      );

      // Detectar si la respuesta contiene menú generado
      const { menuGenerated, menuData } = this._parseAIResponseForMenu(aiResponse.content);

      return {
        content: aiResponse.content,
        model: aiResponse.model || conversation.aiConfig.model || 'deepseek-chat',
        tokensUsed: aiResponse.usage?.total_tokens || 150,
        processingTime: Date.now() - startTime,
        menuGenerated,
        menuData
      };
    } catch (error) {
      this.logger.error('ai.gateway.call_failed', {
        error: error.message,
        provider: conversation.aiConfig.provider,
        correlation_id: correlationId
      });

      // Fallback a respuesta de error amigable
      return {
        content: `Lo siento, hubo un problema al procesar tu solicitud. Por favor, intenta de nuevo. (Error: ${error.message})`,
        model: conversation.aiConfig.model || 'unknown',
        tokensUsed: 0,
        processingTime: Date.now() - startTime,
        menuGenerated: false,
        menuData: null,
        error: true
      };
    }
  }

  /**
   * Llama al módulo ai-gateway para obtener respuesta de IA
   * @private
   */
  async _callAIGateway(messages, aiConfig, correlationId) {
    // Publicar evento para solicitar al ai-gateway (patrón request-response via eventos)
    // O llamar directamente al core.modules['ai-gateway'] si está disponible

    // Opción 1: Llamada directa al módulo (si está inyectado)
    if (this.aiGateway) {
      const result = await this.aiGateway.handleChatCompletion({
        body: {
          messages,
          provider: aiConfig.provider || 'auto',
          model: aiConfig.model,
          temperature: aiConfig.temperature,
          max_tokens: aiConfig.maxTokens,
          metadata: { source: 'menu-generator', correlationId }
        }
      }, { correlationId });

      if (result.status !== 200) {
        throw new Error(result.data?.message || result.data?.error || 'AI Gateway error');
      }

      return result.data;
    }

    // Opción 2: Publicar evento y esperar respuesta (event-driven)
    const requestId = `ai_req_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('AI Gateway timeout'));
      }, 30000);

      // Crear handler temporal para la respuesta
      const responseHandler = async (event) => {
        if (event.payload?.metadata?.request_id === requestId) {
          clearTimeout(timeout);
          await this.eventBus.unsubscribe('ai.completion.completed', responseHandler);

          if (event.payload?.metadata?.error) {
            reject(new Error(event.payload.metadata.error));
          } else {
            resolve({
              content: event.payload.metadata?.response_content || '',
              model: event.payload.model,
              usage: { total_tokens: event.payload.tokens_used }
            });
          }
        }
      };

      // Suscribirse temporalmente
      this.eventBus.subscribe('ai.completion.completed', responseHandler);

      // Publicar solicitud
      this.eventBus.publish('ai.request.created', {
        request_id: requestId,
        messages,
        provider: aiConfig.provider || 'auto',
        model: aiConfig.model,
        temperature: aiConfig.temperature,
        max_tokens: aiConfig.maxTokens,
        metadata: { source: 'menu-generator', correlationId }
      }, { correlationId });
    });
  }

  /**
   * Parsea la respuesta de IA para detectar si contiene un menú generado
   * Usa extractJSONFromResponse y validateMenuStructure para validación POS
   * @private
   */
  _parseAIResponseForMenu(content) {
    // Usar la función especializada para extraer JSON
    const menuData = extractJSONFromResponse(content);

    if (menuData) {
      // Verificar que sea un menú válido (tiene productos o categorias)
      if (menuData.productos || menuData.categorias) {
        // Validar estructura
        const validation = validateMenuStructure(menuData);

        if (validation.valid) {
          // Enriquecer con estadísticas y ordenamiento
          const enrichedMenu = enrichMenu(menuData);

          this.logger?.info('menu.parsed_from_ai', {
            productos: enrichedMenu.productos?.length || 0,
            categorias: enrichedMenu.categorias?.length || 0,
            ingredientes: enrichedMenu.ingredientes_catalogo?.length || 0
          });

          return { menuGenerated: true, menuData: enrichedMenu };
        } else {
          // Log de errores de validación pero intentar continuar
          this.logger?.warn('menu.validation_warnings', {
            errors: validation.errors
          });

          // Intentar enriquecer de todas formas
          try {
            const enrichedMenu = enrichMenu(menuData);
            return { menuGenerated: true, menuData: enrichedMenu };
          } catch (e) {
            this.logger?.error('menu.enrichment_failed', { error: e.message });
          }
        }
      }
    }

    // Detectar por palabras clave si parece que se generó un menú (fallback)
    const menuKeywords = ['productos:', 'categorías:', 'precio:', '€', '"nombre":', '"categoria_id":'];
    const hasMenuContent = menuKeywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()));

    if (hasMenuContent) {
      this.logger?.info('menu.detected_keywords_but_no_json', {
        keywords_found: menuKeywords.filter(kw => content.toLowerCase().includes(kw.toLowerCase()))
      });
    }

    return { menuGenerated: false, menuData: null };
  }

  /**
   * Construye el prompt del sistema según configuración
   * Usa el prompt especializado para extracción POS
   * @private
   */
  _buildSystemPrompt(conversation) {
    // Usar el prompt especializado para chat con capacidad POS
    let prompt = buildChatSystemPrompt(conversation);

    // Añadir configuración específica de la conversación
    const configLines = [];

    if (conversation.styleConfig) {
      const style = conversation.styleConfig;
      configLines.push(`\n## Configuración de esta sesión:`);
      configLines.push(`- Tipo de establecimiento: ${style.menuType || 'restaurante'}`);
      configLines.push(`- Idioma: ${style.language || 'español'}`);
      configLines.push(`- Moneda: ${style.currency || 'EUR'}`);
      if (style.includeDescriptions === false) configLines.push(`- No incluir descripciones largas`);
      if (style.includeAllergens === false) configLines.push(`- No incluir alérgenos`);
      if (style.includePrices === false) configLines.push(`- No incluir precios`);
    }

    // Añadir template si existe
    const template = conversation.templateId
      ? this.templates.find(t => t.id === conversation.templateId)
      : null;

    if (template) {
      configLines.push(`\n## Plantilla activa: ${template.name} ${template.emoji}`);
      configLines.push(`Categorías sugeridas: ${template.categories.join(', ')}`);
      configLines.push(`Estilo: ${template.promptHint}`);
    }

    if (configLines.length > 0) {
      prompt += configLines.join('\n');
    }

    return prompt;
  }

  /**
   * Mock de respuesta de IA para desarrollo
   * @private
   */
  async _mockAIResponse(conversation, chatHistory) {
    // Simular delay de procesamiento
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    const lastUserMessage = chatHistory.filter(m => m.role === 'user').pop();
    const userContent = lastUserMessage?.content?.toLowerCase() || '';

    // Detectar intención de generar menú
    const wantsMenu = userContent.includes('genera') ||
                      userContent.includes('crea') ||
                      userContent.includes('menú') ||
                      userContent.includes('carta');

    if (wantsMenu && chatHistory.length >= 2) {
      // Generar menú de ejemplo
      const menuData = this._generateSampleMenu(conversation);
      return {
        content: `¡Perfecto! He generado un menú basado en tus indicaciones. Incluye ${menuData.productos.length} productos en ${menuData.categorias.length} categorías.\n\nPuedes ver el resultado en el panel de preview. ¿Te gustaría hacer algún ajuste?`,
        tokensUsed: 250,
        menuGenerated: true,
        menuData
      };
    }

    // Respuesta conversacional normal
    const responses = [
      '¡Entendido! ¿Qué tipo de cocina te gustaría para tu menú? Puedo ayudarte con italiana, japonesa, mexicana, española o cualquier otra.',
      'Perfecto. Para crear el mejor menú posible, cuéntame: ¿cuántas categorías aproximadamente necesitas y qué rango de precios manejas?',
      '¡Genial! Con esa información puedo ayudarte. ¿Prefieres descripciones detalladas de cada plato o algo más conciso?',
      'Muy bien. ¿Hay algún plato estrella o especialidad de la casa que quieras destacar en el menú?'
    ];

    return {
      content: responses[Math.floor(Math.random() * responses.length)],
      tokensUsed: 50
    };
  }

  /**
   * Genera un menú de ejemplo en formato POS completo
   * @private
   */
  _generateSampleMenu(conversation) {
    const template = conversation.templateId
      ? this.templates.find(t => t.id === conversation.templateId)
      : this.templates[0];

    const now = new Date().toISOString();

    return {
      menu_id: `menu_${Date.now()}`,
      nombre: 'Carta Principal',
      descripcion: 'Menú generado de ejemplo',
      categorias: [
        { id: 'cat_entrantes', nombre: 'Entrantes', emoji: '🥗', orden: 0, descripcion: 'Para empezar' },
        { id: 'cat_principales', nombre: 'Principales', emoji: '🍽️', orden: 1, descripcion: 'Platos principales' },
        { id: 'cat_postres', nombre: 'Postres', emoji: '🍰', orden: 2, descripcion: 'Para terminar' }
      ],
      productos: [
        {
          id: 'prod_ensalada_cesar',
          nombre: 'Ensalada César',
          nombre_corto: 'César',
          emoji: '🥗',
          categoria_id: 'cat_entrantes',
          descripcion: 'Lechuga romana, parmesano, croutons y aderezo César',
          precio: 8.50,
          ingredientes: [
            { ingrediente_id: 'ing_lechuga', es_principal: true, removible: false },
            { ingrediente_id: 'ing_parmesano', removible: true },
            { ingrediente_id: 'ing_croutons', removible: true },
            { ingrediente_id: 'ing_aderezo_cesar', removible: true }
          ],
          alergenos: ['gluten', 'lactosa', 'huevo'],
          variaciones: {
            permite_quitar_ingredientes: true,
            permite_extras: true,
            extras_sugeridos: [
              { ingrediente_id: 'ing_pollo', precio_extra: 2.50 },
              { ingrediente_id: 'ing_anchoas', precio_extra: 1.50 }
            ]
          },
          tags: ['popular'],
          orden: 0
        },
        {
          id: 'prod_sopa_dia',
          nombre: 'Sopa del Día',
          nombre_corto: 'Sopa',
          emoji: '🍲',
          categoria_id: 'cat_entrantes',
          descripcion: 'Consultar con el personal',
          precio: 6.00,
          ingredientes: [],
          alergenos: [],
          variaciones: { permite_quitar_ingredientes: false, permite_extras: false },
          tags: [],
          orden: 1
        },
        {
          id: 'prod_spaghetti_carbonara',
          nombre: 'Spaghetti Carbonara',
          nombre_corto: 'Carbonara',
          emoji: '🍝',
          categoria_id: 'cat_principales',
          descripcion: 'Pasta fresca con huevo, panceta y pecorino',
          precio: 12.00,
          ingredientes: [
            { ingrediente_id: 'ing_spaghetti', es_principal: true, removible: false },
            { ingrediente_id: 'ing_huevo', removible: false },
            { ingrediente_id: 'ing_panceta', removible: true },
            { ingrediente_id: 'ing_pecorino', removible: true }
          ],
          alergenos: ['gluten', 'huevo', 'lactosa'],
          variaciones: {
            permite_quitar_ingredientes: true,
            permite_extras: true,
            extras_sugeridos: [
              { ingrediente_id: 'ing_trufa', precio_extra: 4.00 }
            ]
          },
          tags: ['popular'],
          orden: 0
        },
        {
          id: 'prod_pizza_margherita',
          nombre: 'Pizza Margherita',
          nombre_corto: 'Margherita',
          emoji: '🍕',
          categoria_id: 'cat_principales',
          descripcion: 'Tomate, mozzarella fresca y albahaca',
          precio: 10.00,
          ingredientes: [
            { ingrediente_id: 'ing_masa_pizza', es_principal: true, removible: false },
            { ingrediente_id: 'ing_tomate', removible: false },
            { ingrediente_id: 'ing_mozzarella', removible: true },
            { ingrediente_id: 'ing_albahaca', removible: true }
          ],
          alergenos: ['gluten', 'lactosa'],
          variaciones: {
            permite_quitar_ingredientes: true,
            permite_extras: true,
            tamanos: [
              { id: 'tam_mediana', nombre: 'Mediana', precio: 10.00, es_default: true },
              { id: 'tam_familiar', nombre: 'Familiar', precio: 14.00, es_default: false }
            ],
            extras_sugeridos: [
              { ingrediente_id: 'ing_jamon', precio_extra: 2.00 },
              { ingrediente_id: 'ing_champinones', precio_extra: 1.50 }
            ]
          },
          tags: ['vegetariano'],
          orden: 1
        },
        {
          id: 'prod_tiramisu',
          nombre: 'Tiramisú',
          nombre_corto: 'Tiramisú',
          emoji: '🍰',
          categoria_id: 'cat_postres',
          descripcion: 'Postre italiano con mascarpone y café',
          precio: 5.50,
          ingredientes: [
            { ingrediente_id: 'ing_mascarpone', es_principal: true, removible: false },
            { ingrediente_id: 'ing_cafe', removible: false },
            { ingrediente_id: 'ing_bizcocho', removible: false },
            { ingrediente_id: 'ing_cacao', removible: true }
          ],
          alergenos: ['gluten', 'lactosa', 'huevo'],
          variaciones: { permite_quitar_ingredientes: false, permite_extras: false },
          tags: ['popular'],
          orden: 0
        }
      ],
      ingredientes_catalogo: [
        { id: 'ing_lechuga', nombre: 'Lechuga Romana', emoji: '🥬', tipo: 'vegetal', es_extra: false, alergenos: [] },
        { id: 'ing_parmesano', nombre: 'Parmesano', emoji: '🧀', tipo: 'lacteo', es_extra: true, precio_extra: 1.00, alergenos: ['lactosa'] },
        { id: 'ing_croutons', nombre: 'Croutons', emoji: '🍞', tipo: 'carbohidrato', es_extra: true, precio_extra: 0.50, alergenos: ['gluten'] },
        { id: 'ing_aderezo_cesar', nombre: 'Aderezo César', emoji: '🥣', tipo: 'salsa', es_extra: false, alergenos: ['huevo', 'lactosa'] },
        { id: 'ing_pollo', nombre: 'Pollo a la Plancha', emoji: '🍗', tipo: 'proteina', es_extra: true, precio_extra: 2.50, alergenos: [] },
        { id: 'ing_anchoas', nombre: 'Anchoas', emoji: '🐟', tipo: 'proteina', es_extra: true, precio_extra: 1.50, alergenos: ['pescado'] },
        { id: 'ing_spaghetti', nombre: 'Spaghetti', emoji: '🍝', tipo: 'base', es_extra: false, alergenos: ['gluten'] },
        { id: 'ing_huevo', nombre: 'Huevo', emoji: '🥚', tipo: 'proteina', es_extra: false, alergenos: ['huevo'] },
        { id: 'ing_panceta', nombre: 'Panceta', emoji: '🥓', tipo: 'proteina', es_extra: true, precio_extra: 2.00, alergenos: [] },
        { id: 'ing_pecorino', nombre: 'Pecorino', emoji: '🧀', tipo: 'lacteo', es_extra: true, precio_extra: 1.00, alergenos: ['lactosa'] },
        { id: 'ing_trufa', nombre: 'Trufa', emoji: '🍄', tipo: 'topping', es_extra: true, precio_extra: 4.00, alergenos: [] },
        { id: 'ing_masa_pizza', nombre: 'Masa de Pizza', emoji: '🫓', tipo: 'base', es_extra: false, alergenos: ['gluten'] },
        { id: 'ing_tomate', nombre: 'Salsa de Tomate', emoji: '🍅', tipo: 'salsa', es_extra: false, alergenos: [] },
        { id: 'ing_mozzarella', nombre: 'Mozzarella', emoji: '🧀', tipo: 'lacteo', es_extra: true, precio_extra: 1.50, alergenos: ['lactosa'] },
        { id: 'ing_albahaca', nombre: 'Albahaca Fresca', emoji: '🌿', tipo: 'condimento', es_extra: false, alergenos: [] },
        { id: 'ing_jamon', nombre: 'Jamón', emoji: '🍖', tipo: 'proteina', es_extra: true, precio_extra: 2.00, alergenos: [] },
        { id: 'ing_champinones', nombre: 'Champiñones', emoji: '🍄', tipo: 'vegetal', es_extra: true, precio_extra: 1.50, alergenos: [] },
        { id: 'ing_mascarpone', nombre: 'Mascarpone', emoji: '🧀', tipo: 'lacteo', es_extra: false, alergenos: ['lactosa'] },
        { id: 'ing_cafe', nombre: 'Café', emoji: '☕', tipo: 'otro', es_extra: false, alergenos: [] },
        { id: 'ing_bizcocho', nombre: 'Bizcochos de Soletilla', emoji: '🍪', tipo: 'base', es_extra: false, alergenos: ['gluten', 'huevo'] },
        { id: 'ing_cacao', nombre: 'Cacao en Polvo', emoji: '🍫', tipo: 'topping', es_extra: false, alergenos: [] }
      ],
      variaciones_globales: [
        {
          id: 'var_tamano_pizza',
          nombre: 'Tamaño Pizza',
          tipo: 'tamano',
          aplica_a_categorias: ['cat_principales'],
          valores: [
            { nombre: 'Mediana', multiplicador_precio: 1 },
            { nombre: 'Familiar', multiplicador_precio: 1.4 }
          ]
        }
      ],
      metadata: {
        generado_at: now,
        fuente: 'conversacion',
        idioma: conversation.styleConfig?.language || 'es',
        moneda: conversation.styleConfig?.currency || 'EUR',
        restaurante_tipo: template?.name?.toLowerCase() || 'italiano',
        estadisticas: {
          total_productos: 5,
          total_categorias: 3,
          total_ingredientes: 21,
          precio_medio: 8.40,
          precio_minimo: 5.50,
          precio_maximo: 12.00
        },
        confianza: 0.95
      }
    };
  }

  /**
   * Guarda un menú generado en formato POS
   * @private
   */
  async _saveGeneratedMenu(menuData, conversationId) {
    // Usar menu_id del menuData si existe, o generar uno nuevo
    const menuId = menuData.menu_id || `menu_${Date.now()}`;

    const menu = {
      // Estructura POS completa
      id: menuId,
      menu_id: menuId,
      nombre: menuData.nombre || 'Menú sin nombre',
      descripcion: menuData.descripcion || '',

      // Datos del menú
      categorias: menuData.categorias || [],
      productos: menuData.productos || [],
      ingredientes_catalogo: menuData.ingredientes_catalogo || [],
      variaciones_globales: menuData.variaciones_globales || [],

      // Metadatos
      source: {
        tipo: menuData.metadata?.fuente || 'ai_generated',
        conversationId,
        uploaded_at: new Date().toISOString()
      },
      estado: 'generado',
      metadata: {
        ...menuData.metadata,
        generado_at: new Date().toISOString(),
        fuente: menuData.metadata?.fuente || 'conversacion'
      },
      created_at: new Date().toISOString()
    };

    this.menus.set(menuId, menu);

    // Métricas y eventos
    this.metrics.increment('menu.generado.total');
    await this.eventBus.publish('menu-generator.menu.created', {
      menuId,
      conversationId,
      productosCount: menu.productos.length,
      categoriasCount: menu.categorias.length,
      ingredientesCount: menu.ingredientes_catalogo.length,
      formato: 'pos'
    });

    this.logger.info('menu.saved_pos_format', {
      menuId,
      conversationId,
      productos: menu.productos.length,
      categorias: menu.categorias.length,
      ingredientes: menu.ingredientes_catalogo.length
    });

    return menuId;
  }

  // ==========================================
  // EXPORT HELPERS (Private)
  // ==========================================

  /**
   * Convierte menú a formato CSV
   * @private
   */
  _menuToCSV(menu) {
    const headers = ['ID', 'Nombre', 'Categoría', 'Precio', 'Descripción', 'Alérgenos'];
    const rows = [headers.join(',')];

    for (const producto of menu.productos || []) {
      const row = [
        producto.id,
        `"${producto.nombre}"`,
        `"${producto.categoria}"`,
        producto.precio || '',
        `"${(producto.descripcion || '').replace(/"/g, '""')}"`,
        `"${(producto.alergenos || []).join(', ')}"`
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Convierte menú a formato Markdown
   * @private
   */
  _menuToMarkdown(menu) {
    let md = `# Menú\n\n`;
    md += `> Generado el ${new Date().toLocaleDateString('es-ES')}\n\n`;

    // Agrupar por categoría
    const categorias = menu.categorias || [];
    const productos = menu.productos || [];

    for (const cat of categorias.sort((a, b) => (a.orden || 0) - (b.orden || 0))) {
      md += `## ${cat.emoji || ''} ${cat.nombre}\n\n`;

      const productosCategoria = productos.filter(p => p.categoria === cat.nombre);
      for (const prod of productosCategoria) {
        md += `### ${prod.emoji || '🍽️'} ${prod.nombre}`;
        if (prod.precio) md += ` - €${prod.precio.toFixed(2)}`;
        md += '\n';
        if (prod.descripcion) md += `${prod.descripcion}\n`;
        if (prod.alergenos?.length) md += `*Alérgenos: ${prod.alergenos.join(', ')}*\n`;
        md += '\n';
      }
    }

    return md;
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishAIRequest(request_id, file_base64, file_name, file_type, correlation_id) {
    await this.eventBus.publish('ai.request', {
      request_id,
      type: 'menu_parse',
      prompt_id: 'menu_parser_v1',
      data: {
        file_base64,
        file_name,
        file_type,
        context: {
          extraction_requirements: [
            'productos con nombre y precio',
            'categorías de productos',
            'ingredientes por producto',
            'alérgenos detectados',
            'variaciones posibles'
          ]
        }
      },
      options: {
        temperature: 0.3,
        max_tokens: 4000
      }
    }, {
      correlationId: correlation_id
    });
  }

  async publishMenuGenerado(menu, correlation_id) {
    await this.eventBus.publish('menu.generado', {
      menu_id: menu.id,
      source: menu.source,
      productos: menu.productos,
      categorias: menu.categorias,
      ingredientes_catalogo: menu.ingredientes_catalogo,
      estadisticas: {
        total_productos: menu.productos.length,
        total_categorias: menu.categorias.length,
        total_ingredientes: menu.ingredientes_catalogo.length,
        tiempo_procesamiento: menu.generation_time
      }
    }, {
      correlationId: correlation_id
    });
  }

  async publishMenuValidado(menu_id, correcciones, correlation_id) {
    await this.eventBus.publish('menu.validado', {
      menu_id,
      validado_por: 'operator',
      correcciones,
      validated_at: new Date().toISOString()
    }, {
      correlationId: correlation_id
    });
  }

  async publishMenuError(menu_id, error_type, message, correlation_id) {
    await this.eventBus.publish('menu.error', {
      menu_id,
      error_type,
      message,
      details: {}
    }, {
      correlationId: correlation_id
    });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  detectFileType(file_name, file_type) {
    if (file_type) {
      if (file_type.includes('pdf')) return 'pdf';
      if (file_type.includes('image')) return 'imagen';
    }

    const ext = file_name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'imagen';
    return 'texto';
  }

  enrichMenuFromAI(menu, aiData) {
    // Parsear respuesta de IA y crear estructura enriquecida
    const productos = aiData.productos || [];
    const categorias = aiData.categorias || [];

    // Crear catálogo unificado de ingredientes
    const ingredientesMap = new Map();
    productos.forEach(prod => {
      if (prod.ingredientes_base) {
        prod.ingredientes_base.forEach(ing => {
          if (!ingredientesMap.has(ing.id)) {
            ingredientesMap.set(ing.id, ing);
          }
        });
      }
    });

    return {
      ...menu,
      productos: productos.map(p => ({
        id: p.id || `prod_${this.slugify(p.nombre)}`,
        nombre: p.nombre,
        emoji: p.emoji || this.getDefaultEmoji(p.categoria),
        categoria: p.categoria,
        categoria_emoji: p.categoria_emoji,
        descripcion: p.descripcion,
        precio: p.precio,
        ingredientes_base: p.ingredientes_base || [],
        alergenos: p.alergenos || [],
        variaciones: p.variaciones || {
          permite_quitar: [],
          permite_anadir: true
        },
        metadata: p.metadata || {}
      })),
      categorias: categorias.map((cat, idx) => ({
        id: cat.id || `cat_${this.slugify(cat.nombre)}`,
        nombre: cat.nombre,
        emoji: cat.emoji || '📋',
        orden: cat.orden !== undefined ? cat.orden : idx
      })),
      ingredientes_catalogo: Array.from(ingredientesMap.values())
    };
  }

  applyCorrections(menu, correcciones) {
    correcciones.forEach(corr => {
      const producto = menu.productos.find(p => p.id === corr.producto_id);
      if (producto && corr.campo) {
        producto[corr.campo] = corr.valor_nuevo;
      }
    });
  }

  slugify(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  getDefaultEmoji(categoria) {
    const emojiMap = {
      'pizza': '🍕',
      'pasta': '🍝',
      'ensalada': '🥗',
      'bebida': '🥤',
      'postre': '🍰',
      'entrada': '🥙'
    };
    return emojiMap[categoria.toLowerCase()] || '🍽️';
  }
}

module.exports = MenuGeneratorModule;
