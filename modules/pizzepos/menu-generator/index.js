/**
 * Módulo Menu Generator v2.0
 * Genera menús desde cartas físicas usando IA - Enfoque generativo
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 *
 * Flujo: upload imagen/pdf → ai.request → ai.response → enrichMenuFromAI → menu.generado → validar → menu.validado
 */

const crypto = require('crypto');

class MenuGeneratorModule {
  constructor() {
    this.name = 'menu-generator';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Estado en memoria
    this.menus = new Map(); // menu_id -> menu_data
    this.pendingRequests = new Map(); // request_id -> menu_id
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    await this.subscribeToEvents();
    this.registerUIHandlers();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this.uiHandler) {
      const actions = ['upload', 'list', 'get', 'validate', 'health', 'metrics'];
      for (const action of actions) {
        this.uiHandler.unregister('menu', action);
      }
    }

    this.menus.clear();
    this.pendingRequests.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('menu-generator.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('menu', 'upload', this.handleUploadMenu.bind(this));
    this.uiHandler.register('menu', 'list', this.handleListMenus.bind(this));
    this.uiHandler.register('menu', 'get', this.handleGetMenu.bind(this));
    this.uiHandler.register('menu', 'validate', this.handleValidateMenu.bind(this));
    this.uiHandler.register('menu', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('menu', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('menu-generator.ui_handlers.registered', {
      handlers: ['upload', 'list', 'get', 'validate', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('ai.response', this.onAIResponse.bind(this));

    this.logger.info('menu-generator.events.subscribed', {
      events: ['ai.response']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onAIResponse(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { request_id, status, data, error } = eventData;

    const start_time = Date.now();

    this.logger.info('ai.response.received', {
      request_id,
      status,
      correlation_id: correlationId
    });

    const menu_id = this.pendingRequests.get(request_id);
    if (!menu_id) {
      this.logger.warn('ai.response.orphan', {
        request_id,
        correlation_id: correlationId
      });
      return;
    }

    const menu = this.menus.get(menu_id);
    if (!menu) {
      this.logger.error('ai.response.menu_not_found', {
        menu_id,
        request_id,
        correlation_id: correlationId
      });
      return;
    }

    if (status === 'success') {
      try {
        const enrichedMenu = this.enrichMenuFromAI(menu, data);
        enrichedMenu.estado = 'generado';
        enrichedMenu.generation_time = Date.now() - start_time;

        this.menus.set(menu_id, enrichedMenu);
        this.pendingRequests.delete(request_id);

        this.metrics.increment('menu.generado.total');
        this.metrics.timing('menu.generation.duration', enrichedMenu.generation_time);
        this.metrics.gauge('menu.pendientes_validacion.count',
          Array.from(this.menus.values()).filter(m => m.estado === 'generado').length
        );

        await this.publishMenuGenerado(enrichedMenu, correlationId);

        this.logger.info('menu.generado', {
          menu_id,
          productos_count: enrichedMenu.productos.length,
          categorias_count: enrichedMenu.categorias.length,
          correlation_id: correlationId,
          duration: enrichedMenu.generation_time
        });

      } catch (parseError) {
        this.logger.error('ai.response.parse_error', {
          menu_id,
          error: parseError.message,
          correlation_id: correlationId
        });

        menu.estado = 'error';
        menu.error = parseError.message;
        this.menus.set(menu_id, menu);

        await this.publishMenuError(menu_id, 'ai_processing_failed', parseError.message, correlationId);
      }

    } else {
      menu.estado = 'error';
      menu.error = error || 'AI processing failed';
      this.menus.set(menu_id, menu);
      this.pendingRequests.delete(request_id);

      this.metrics.increment('menu.errors.total', 1, { type: 'ai_processing' });

      await this.publishMenuError(menu_id, 'ai_processing_failed', error, correlationId);

      this.logger.error('ai.processing.failed', {
        menu_id,
        request_id,
        error,
        correlation_id: correlationId
      });
    }
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleUploadMenu(data) {
    const start_time = Date.now();

    try {
      const { file_base64, file_name, file_type, metadata } = data;

      if (!file_base64 || !file_name) {
        return { status: 400, error: 'file_base64 y file_name son requeridos' };
      }

      const menu_id = crypto.randomUUID();
      const request_id = crypto.randomUUID();

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

      this.metrics.increment('menu.upload.total');
      this.metrics.timing('menu.upload.duration', Date.now() - start_time);

      await this.publishAIRequest(request_id, file_base64, file_name, file_type);

      this.logger.info('menu.upload.success', {
        menu_id,
        request_id,
        file_name,
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
        stack: error.stack
      });

      return { status: 500, error: error.message };
    }
  }

  async handleListMenus() {
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

  async handleGetMenu(data) {
    const { id } = data;
    const menu = this.menus.get(id);

    if (!menu) {
      return { status: 404, error: 'Menú no encontrado' };
    }

    return { status: 200, data: menu };
  }

  async handleValidateMenu(data) {
    const { id, correcciones } = data;

    const menu = this.menus.get(id);
    if (!menu) {
      return { status: 404, error: 'Menú no encontrado' };
    }

    if (menu.estado !== 'generado') {
      return { status: 400, error: `Menú en estado '${menu.estado}', debe estar 'generado'` };
    }

    if (correcciones && correcciones.length > 0) {
      this.applyCorrections(menu, correcciones);
    }

    menu.estado = 'validado';
    menu.validated_at = new Date().toISOString();
    this.menus.set(id, menu);

    this.metrics.increment('menu.validado.total');
    this.metrics.gauge('menu.pendientes_validacion.count',
      Array.from(this.menus.values()).filter(m => m.estado === 'generado').length
    );

    await this.publishMenuValidado(id, correcciones || []);

    this.logger.info('menu.validado', {
      menu_id: id,
      correcciones_count: correcciones ? correcciones.length : 0
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

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        menus: {
          total: this.menus.size,
          generando: Array.from(this.menus.values()).filter(m => m.estado === 'generando').length,
          generado: Array.from(this.menus.values()).filter(m => m.estado === 'generado').length,
          validado: Array.from(this.menus.values()).filter(m => m.estado === 'validado').length
        },
        pending_requests: this.pendingRequests.size
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        counters: {
          'menu.upload.total': this.metrics.getCounter('menu.upload.total') || 0,
          'menu.generado.total': this.metrics.getCounter('menu.generado.total') || 0,
          'menu.validado.total': this.metrics.getCounter('menu.validado.total') || 0,
          'menu.errors.total': this.metrics.getCounter('menu.errors.total') || 0
        },
        gauges: {
          'menu.pendientes_validacion.count': Array.from(this.menus.values()).filter(m => m.estado === 'generado').length,
          'menu.total.count': this.menus.size
        }
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishAIRequest(request_id, file_base64, file_name, file_type) {
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

  async publishMenuValidado(menu_id, correcciones) {
    await this.eventBus.publish('menu.validado', {
      menu_id,
      validado_por: 'operator',
      correcciones,
      validated_at: new Date().toISOString()
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
    const productos = aiData.productos || [];
    const categorias = aiData.categorias || [];

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
