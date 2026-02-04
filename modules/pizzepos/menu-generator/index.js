/**
 * Módulo Menu Generator v3.0.0
 * Genera cartas estructuradas desde texto o imágenes usando IA.
 *
 * Responsabilidad ÚNICA: generar. No almacena, no gestiona, no resuelve.
 *
 * Flujo:
 *   input (texto/foto/PDF) → AI extracción → carta estructurada → evento carta.generada
 *
 * Inputs aceptados:
 *   - texto: texto de carta, salida OCR, JSON crudo, lista de productos
 *   - (futuro: imagen via AI vision)
 *
 * Output:
 *   Evento 'carta.generada' con formato carta-output.json
 *   {
 *     meta: { id, nombre, generado_desde, created_at },
 *     categorias: [{ id, nombre, orden }],
 *     productos: [{ id, nombre, categoria, precio, ingredientes: [{ nombre, emoji }] }]
 *   }
 */

const crypto = require('crypto');

// ==========================================
// Prompt de extracción
// ==========================================

const PROMPT_EXTRACCION = `Eres un experto en digitalización de cartas de restaurante.

Se te proporciona el contenido de una carta/menú de restaurante.
Puede ser texto OCR, una lista de productos, datos JSON crudos, o cualquier formato.

Tu trabajo es extraer y estructurar TODOS los productos en este formato JSON exacto:

{
  "nombre_carta": "Nombre del restaurante o carta detectado",
  "categorias": [
    { "id": "categoria_slug", "nombre": "Nombre Original", "orden": 1 }
  ],
  "productos": [
    {
      "id": "categoriaslug_productoslug",
      "nombre": "Nombre Original del Producto",
      "categoria": "categoria_slug",
      "precio": 11.50,
      "ingredientes": [
        { "nombre": "Tomate", "emoji": "🍅" },
        { "nombre": "Mozzarella", "emoji": "🧀" }
      ]
    }
  ]
}

REGLAS OBLIGATORIAS:
1. IDs en snake_case sin acentos ni caracteres especiales
2. ID de producto: {id_categoria}_{nombre_producto_slug} (ej: "pizzicas_country")
3. ID de categoría: nombre en snake_case (ej: "pizzicas", "entrantes")
4. Precios SIEMPRE como números (11.50, no "11.50"). Si no hay precio visible, pon 0
5. Ingredientes SIEMPRE como array de objetos {nombre, emoji}, NUNCA un string plano
6. Cada ingrediente con el emoji más representativo
7. Mantén los nombres originales de productos tal cual aparecen
8. Agrupa productos en categorías tal como aparecen en la carta
9. Si no hay categorías claras, crea una categoría "general"
10. Devuelve SOLO el JSON, sin explicaciones, sin markdown, sin bloques de código`;

// ==========================================
// Módulo
// ==========================================

class MenuGeneratorModule {
  constructor() {
    this.name = 'menu-generator';
    this.version = '3.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Estado temporal
    this.pending = new Map();  // correlationId -> { id, nombre, estado, created_at }
    this.cartas = new Map();   // carta_id -> carta generada
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    await this.eventBus.subscribe('ai.chat.response', this.onAIChatResponse.bind(this));

    this.registerUIHandlers();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    if (this.uiHandler) {
      ['generate', 'list', 'get', 'health'].forEach(action => {
        this.uiHandler.unregister('menu', action);
      });
    }

    this.pending.clear();
    this.cartas.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('menu-generator.no_uiHandler');
      return;
    }

    this.uiHandler.register('menu', 'generate', this.handleGenerate.bind(this));
    this.uiHandler.register('menu', 'list', this.handleList.bind(this));
    this.uiHandler.register('menu', 'get', this.handleGet.bind(this));
    this.uiHandler.register('menu', 'health', this.handleHealth.bind(this));

    this.logger.info('menu-generator.ui_handlers.registered', {
      handlers: ['generate', 'list', 'get', 'health']
    });
  }

  /**
   * Genera una carta estructurada desde texto.
   *
   * @param {object} data
   * @param {string} data.texto - Contenido de la carta (texto, OCR, JSON crudo)
   * @param {string} [data.nombre] - Nombre para la carta generada
   * @param {string} [data.provider] - Provider AI (auto|deepseek|anthropic|openai)
   */
  async handleGenerate(data) {
    const { texto, nombre, provider } = data;

    if (!texto || texto.trim().length < 10) {
      return {
        status: 400,
        error: 'Se requiere "texto" con el contenido de la carta (mínimo 10 caracteres)'
      };
    }

    const cartaId = `carta_${Date.now().toString(36)}`;
    const correlationId = crypto.randomUUID();

    this.pending.set(correlationId, {
      id: cartaId,
      nombre: nombre || 'Carta sin nombre',
      estado: 'generando',
      created_at: new Date().toISOString()
    });

    await this.eventBus.publish('ai.chat.request', {
      request_id: correlationId,
      messages: [
        { role: 'system', content: PROMPT_EXTRACCION },
        { role: 'user', content: texto }
      ],
      provider: provider || 'auto',
      temperature: 0.1,
      max_tokens: 8000
    }, {
      correlationId
    });

    this.metrics?.increment('menu.generate.requested');

    this.logger.info('menu.generate.requested', {
      carta_id: cartaId,
      correlation_id: correlationId,
      texto_length: texto.length
    });

    return {
      status: 202,
      data: {
        carta_id: cartaId,
        correlation_id: correlationId,
        estado: 'generando',
        message: 'Carta en proceso de generación'
      }
    };
  }

  async handleList() {
    const cartas = Array.from(this.cartas.values())
      .sort((a, b) => new Date(b.meta.created_at) - new Date(a.meta.created_at));

    const pendientes = Array.from(this.pending.values());

    return {
      status: 200,
      data: {
        cartas: [
          ...pendientes.map(p => ({
            id: p.id,
            nombre: p.nombre,
            estado: p.estado,
            productos: 0,
            categorias: 0,
            created_at: p.created_at
          })),
          ...cartas.map(c => ({
            id: c.meta.id,
            nombre: c.meta.nombre,
            estado: 'generado',
            productos: c.productos.length,
            categorias: c.categorias.length,
            created_at: c.meta.created_at
          }))
        ],
        total: cartas.length + pendientes.length
      }
    };
  }

  async handleGet(data) {
    const carta = this.cartas.get(data.id);
    if (!carta) {
      return { status: 404, error: 'Carta no encontrada' };
    }
    return { status: 200, data: carta };
  }

  async handleHealth() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        generando: this.pending.size,
        generadas: this.cartas.size
      }
    };
  }

  // ==========================================
  // AI Response Handler
  // ==========================================

  async onAIChatResponse(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId =
      event?.metadata?.correlationId ||
      eventData?.correlation_id ||
      eventData?.request_id;

    // Solo procesar si es una respuesta para nosotros
    const pendingData = this.pending.get(correlationId);
    if (!pendingData) return;

    this.pending.delete(correlationId);

    const { id: cartaId, nombre } = pendingData;

    // Error de AI
    if (!eventData.success && eventData.error) {
      this.logger.error('menu.generate.ai_error', {
        carta_id: cartaId,
        error: eventData.error
      });
      this.metrics?.increment('menu.generate.errors');

      await this.eventBus.publish('menu.error', {
        carta_id: cartaId,
        error_type: 'ai_processing_failed',
        message: eventData.error
      }, { correlationId });
      return;
    }

    // Parsear respuesta
    try {
      const content = eventData.content || eventData.text || '';
      const carta = this.parseAndStructure(cartaId, nombre, content);

      this.cartas.set(cartaId, carta);
      this.metrics?.increment('menu.generate.completed');

      await this.eventBus.publish('carta.generada', carta, { correlationId });

      this.logger.info('menu.generate.completed', {
        carta_id: cartaId,
        productos: carta.productos.length,
        categorias: carta.categorias.length
      });

    } catch (err) {
      this.logger.error('menu.generate.parse_error', {
        carta_id: cartaId,
        error: err.message
      });
      this.metrics?.increment('menu.generate.errors');

      await this.eventBus.publish('menu.error', {
        carta_id: cartaId,
        error_type: 'parse_failed',
        message: err.message
      }, { correlationId });
    }
  }

  // ==========================================
  // Parsing y estructuración
  // ==========================================

  /**
   * Parsea la respuesta de AI y estructura en formato carta estándar.
   */
  parseAndStructure(cartaId, nombre, aiContent) {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('La IA no devolvió un JSON válido');
    }

    const raw = JSON.parse(jsonMatch[0]);

    const categorias = (raw.categorias || []).map((cat, idx) => ({
      id: cat.id || this.slugify(cat.nombre),
      nombre: cat.nombre,
      orden: cat.orden !== undefined ? cat.orden : idx + 1
    }));

    const productos = (raw.productos || []).map(p => ({
      id: p.id || `${this.slugify(p.categoria || 'general')}_${this.slugify(p.nombre)}`,
      nombre: p.nombre,
      categoria: p.categoria || 'general',
      precio: typeof p.precio === 'number' ? p.precio : parseFloat(p.precio) || 0,
      ingredientes: this.normalizeIngredientes(p.ingredientes || [])
    }));

    if (productos.length === 0) {
      throw new Error('La IA no extrajo ningún producto');
    }

    return {
      meta: {
        id: cartaId,
        nombre: raw.nombre_carta || nombre,
        generado_desde: 'texto',
        created_at: new Date().toISOString()
      },
      categorias,
      productos
    };
  }

  /**
   * Normaliza ingredientes a formato estándar [{nombre, emoji}].
   * Maneja: array de objetos, array de strings, string CSV con emojis.
   */
  normalizeIngredientes(ingredientes) {
    if (typeof ingredientes === 'string') {
      return ingredientes
        .split(',')
        .map(s => this.parseIngredienteString(s.trim()))
        .filter(i => i.nombre.length > 0);
    }

    if (Array.isArray(ingredientes)) {
      return ingredientes.map(ing => {
        if (typeof ing === 'string') {
          return this.parseIngredienteString(ing);
        }
        return {
          nombre: ing.nombre || ing.name || '',
          emoji: ing.emoji || ''
        };
      }).filter(i => i.nombre.length > 0);
    }

    return [];
  }

  /**
   * Extrae nombre y emoji de un string como "Tomate 🍅"
   */
  parseIngredienteString(str) {
    const emojiRegex = /([\p{Emoji_Presentation}\p{Extended_Pictographic}])/u;
    const match = str.match(emojiRegex);
    const nombre = str.replace(emojiRegex, '').trim();
    return { nombre, emoji: match ? match[1] : '' };
  }

  // ==========================================
  // Utilidades
  // ==========================================

  slugify(text) {
    if (!text) return 'sin_nombre';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'sin_nombre';
  }
}

module.exports = MenuGeneratorModule;
