/**
 * Menu Generator v4.0.0
 *
 * Asistente de cartas de restaurante — expone tools para el agentic loop del chat.
 * El usuario habla por el chat, el LLM usa estas herramientas para operar sobre cartas.
 *
 * Tools:
 *   menu.generate        — Genera carta estructurada desde texto (OCR, lista, JSON)
 *   menu.list_cartas     — Lista cartas generadas
 *   menu.get_carta       — Obtiene carta completa por ID
 *   menu.update_prices   — Ajusta precios (%, por categoría, individuales)
 *   menu.add_product     — Añade producto a carta
 *   menu.remove_product  — Elimina producto de carta
 *   menu.add_category    — Añade categoría a carta
 *   menu.update_product  — Actualiza datos de producto
 *   menu.search_products — Busca productos por nombre/ingrediente
 *   menu.stats           — Estadísticas de carta
 *
 * Flujo de generación:
 *   texto → ai.chat.request → AI estructura → parseAndStructure → carta.generada
 *
 * Output: schemas/carta-output.json
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

// Lazy-loaded service providers (local, no external deps)
let sharpProvider = null;
let pdfjsProvider = null;
let googleVisionProvider = null;
let tesseractProvider = null;
let scribeOcrProvider = null;
let documentProcessorProvider = null;

function getSharpProvider() {
  if (!sharpProvider) {
    sharpProvider = require(path.resolve(__dirname, '../../../services/providers/local/sharp'));
  }
  return sharpProvider;
}

function getPdfjsProvider() {
  if (!pdfjsProvider) {
    pdfjsProvider = require(path.resolve(__dirname, '../../../services/providers/local/pdfjs'));
  }
  return pdfjsProvider;
}

function getGoogleVisionProvider() {
  if (!googleVisionProvider) {
    googleVisionProvider = require(path.resolve(__dirname, '../../../services/providers/local/google-vision'));
  }
  return googleVisionProvider;
}

function getTesseractProvider() {
  if (!tesseractProvider) {
    tesseractProvider = require(path.resolve(__dirname, '../../../services/providers/local/tesseract'));
  }
  return tesseractProvider;
}

function getScribeOcrProvider() {
  if (!scribeOcrProvider) {
    scribeOcrProvider = require(path.resolve(__dirname, '../../../services/providers/local/scribe-ocr'));
  }
  return scribeOcrProvider;
}

function getDocumentProcessorProvider() {
  if (!documentProcessorProvider) {
    documentProcessorProvider = require(path.resolve(__dirname, '../../../services/providers/local/document-processor'));
  }
  return documentProcessorProvider;
}

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

class MenuGeneratorModule {
  constructor() {
    this.name = 'menu-generator';
    this.version = '4.0.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    this.pendingAI = new Map();
    this.cartas = new Map();

    // Project context for resolving relative file paths
    this.activeProjectPath = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;

    await this.eventBus.subscribe('ai.chat.response', this.onAIChatResponse.bind(this));

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.pendingAI.clear();
    this.cartas.clear();
    this.activeProjectPath = null;
    this.logger.info('module.unloaded', { module: this.name });
  }

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;

    if (metadata?.is_system === true) {
      this.activeProjectPath = process.cwd();
    } else if (base_path) {
      this.activeProjectPath = path.join(base_path, 'storage');
    }

    this.logger.info('menu-generator.project.activated', {
      project_id,
      activeProjectPath: this.activeProjectPath
    });

    // Load persisted cartas from disk
    await this.loadCartasFromDisk();
  }

  async onProjectDeactivated() {
    this.activeProjectPath = null;
    this.cartas.clear();
  }

  // ==========================================
  // Carta Persistence
  // ==========================================

  get cartasDir() {
    return this.activeProjectPath ? path.join(this.activeProjectPath, 'cartas') : null;
  }

  async saveCartaToDisk(carta) {
    if (!this.cartasDir) return;
    try {
      await fs.mkdir(this.cartasDir, { recursive: true });
      const filePath = path.join(this.cartasDir, `${carta.meta.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(carta, null, 2), 'utf-8');
    } catch (err) {
      this.logger.warn('menu-generator.carta.save_failed', { carta_id: carta.meta?.id, error: err.message });
    }
  }

  async loadCartasFromDisk() {
    if (!this.cartasDir) return;
    try {
      await fs.mkdir(this.cartasDir, { recursive: true });
      const files = await fs.readdir(this.cartasDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(this.cartasDir, file), 'utf-8');
          const carta = JSON.parse(content);
          if (carta.meta?.id) {
            this.cartas.set(carta.meta.id, carta);
          }
        } catch (err) {
          this.logger.warn('menu-generator.carta.load_failed', { file, error: err.message });
        }
      }

      this.logger.info('menu-generator.cartas.loaded', { count: this.cartas.size });
    } catch (err) {
      this.logger.warn('menu-generator.cartas.dir_error', { error: err.message });
    }
  }

  /**
   * Save base64 image to the project's preprocesadas/ directory.
   * Follows facturas pipeline convention (contexto/facturas.json → estructura_storage).
   * Returns { absolutePath, relativePath } where relativePath is for the frontend FilePicker.
   */
  async savePipelineFile(base64Data, prefix, ext = '.png') {
    if (!this.activeProjectPath) {
      throw new Error('No active project — cannot save pipeline file');
    }

    const dir = path.join(this.activeProjectPath, 'preprocesadas');
    await fs.mkdir(dir, { recursive: true });

    const filename = `${prefix}_${Date.now().toString(36)}${ext}`;
    const absolutePath = path.join(dir, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(absolutePath, buffer);

    // Return project-relative path for the frontend (e.g. "/preprocesadas/rendered_abc.png")
    const relativePath = '/preprocesadas/' + filename;
    return { absolutePath, relativePath };
  }

  /**
   * Resolve a project-relative path (e.g. "/0.png") to an absolute filesystem path.
   * Paths that are already absolute and exist, or base64/data URIs, are returned as-is.
   */
  resolveFilePath(userPath) {
    if (!userPath || typeof userPath !== 'string') return userPath;

    // Data URIs and base64 pass through
    if (userPath.startsWith('data:')) return userPath;
    const base64Prefixes = ['/9j/', 'iVBORw', 'R0lGOD', 'UklGR', 'Qk', 'SUkq', 'TU0A'];
    if (base64Prefixes.some(p => userPath.startsWith(p))) return userPath;

    // If we have a project path, resolve relative to it
    if (this.activeProjectPath) {
      const normalized = path.normalize(userPath).replace(/^\/+/, '');
      return path.resolve(this.activeProjectPath, normalized);
    }

    // Fallback: return as-is
    return userPath;
  }

  // ==========================================
  // UI Handlers (frontend micro-módulos)
  // ==========================================

  async handleGenerate(data) {
    const result = await this.toolGenerate(data);
    if (result.error) {
      throw { status: result.status || 400, code: 'GENERATE_ERROR', message: result.error };
    }
    return result.data;
  }

  async handleListCartas() {
    const result = await this.toolListCartas({});
    return result.data;
  }

  async handleGetCarta(data) {
    const result = await this.toolGetCarta({ carta_id: data.id });
    if (result.error) {
      throw { status: result.status || 404, code: 'NOT_FOUND', message: result.error };
    }
    return result.data;
  }

  async handleHealth() {
    return {
      status: 'healthy',
      module: this.name,
      version: this.version,
      generando: this.pendingAI.size,
      generadas: this.cartas.size
    };
  }

  // ==========================================
  // Pipeline Handlers — bridge frontend panels to local service providers
  // ==========================================

  async handleSharpPrepareOcr(data) {
    const provider = getSharpProvider();
    // Call without output to get base64
    const result = await provider['prepare-ocr']({
      image: this.resolveFilePath(data.image),
      options: data.options || {}
    });

    // Save to disk so the next panel (OCR) can reference the file
    if (result.success && result.image && this.activeProjectPath) {
      try {
        const { relativePath } = await this.savePipelineFile(result.image, 'prepared');
        result.path = relativePath;
      } catch (err) {
        this.logger.warn('menu-generator.pipeline.save_failed', { step: 'prepare', error: err.message });
      }
    }

    return result;
  }

  async handlePdfjsInfo(data) {
    const provider = getPdfjsProvider();
    const result = await provider.info({ pdf: this.resolveFilePath(data.pdf) });
    return result.data || result;
  }

  async handlePdfjsRender(data) {
    const provider = getPdfjsProvider();
    const result = await provider.render({
      pdf: this.resolveFilePath(data.pdf),
      page: data.page || 1,
      scale: data.scale || 2.0
    });

    const renderData = result.data || result;

    // Save rendered image to disk so PreparePanel can reference it
    if (renderData.image && this.activeProjectPath) {
      try {
        const page = data.page || 1;
        const { relativePath } = await this.savePipelineFile(renderData.image, `page${page}`);
        renderData.path = relativePath;
      } catch (err) {
        this.logger.warn('menu-generator.pipeline.save_failed', { step: 'render', error: err.message });
      }
    }

    return renderData;
  }

  async handleGoogleVisionExtract(data) {
    const provider = getGoogleVisionProvider();
    const result = await provider.extract({
      image: this.resolveFilePath(data.image),
      hint: data.hint || 'DOCUMENT_TEXT_DETECTION',
      languageHints: data.languageHints || []
    });
    return result;
  }

  async handleTesseractExtract(data) {
    const provider = getTesseractProvider();
    const result = await provider.extract({
      image: this.resolveFilePath(data.image),
      language: data.language || 'eng'
    });
    return result.data || result;
  }

  async handleScribeOcrExtract(data) {
    const provider = getScribeOcrProvider();
    const result = await provider.extract({
      input: this.resolveFilePath(data.input || data.image),
      lang: data.lang || data.language || 'eng'
    });
    return result.data || result;
  }

  async handleDocumentProcessorProcess(data) {
    const provider = getDocumentProcessorProvider();
    const result = await provider.process({
      document: this.resolveFilePath(data.document || data.image),
      language: data.language || 'es'
    });
    return result.data || result;
  }

  // ==========================================
  // Tools — expuestos al LLM via agentic loop
  // ==========================================

  async toolGenerate({ texto, nombre }) {
    if (!texto || texto.trim().length < 10) {
      return { status: 400, error: 'Se requiere "texto" con el contenido de la carta (mínimo 10 caracteres)' };
    }

    const cartaId = `carta_${Date.now().toString(36)}`;
    const requestId = crypto.randomUUID();

    this.pendingAI.set(requestId, {
      id: cartaId,
      nombre: nombre || 'Carta sin nombre',
      created_at: new Date().toISOString()
    });

    await this.eventBus.publish('ai.chat.request', {
      request_id: requestId,
      messages: [
        { role: 'system', content: PROMPT_EXTRACCION },
        { role: 'user', content: texto }
      ],
      provider: 'auto',
      temperature: 0.1,
      max_tokens: 8000,
      stream: false,
      tools: false
    }, { correlationId: requestId });

    this.metrics?.increment('menu.generate.requested');
    this.logger.info('menu.generate.requested', { carta_id: cartaId, texto_length: texto.length });

    return {
      status: 202,
      data: {
        carta_id: cartaId,
        estado: 'generando',
        message: 'Carta en proceso de generación. Usa menu.get_carta con este ID para ver el resultado.'
      }
    };
  }

  async toolListCartas() {
    const cartas = Array.from(this.cartas.values())
      .sort((a, b) => new Date(b.meta.created_at) - new Date(a.meta.created_at));

    const pendientes = Array.from(this.pendingAI.values());

    const lista = [
      ...pendientes.map(p => ({
        id: p.id, nombre: p.nombre, estado: 'generando',
        productos: 0, categorias: 0, created_at: p.created_at
      })),
      ...cartas.map(c => ({
        id: c.meta.id, nombre: c.meta.nombre, estado: 'generado',
        productos: c.productos.length, categorias: c.categorias.length,
        created_at: c.meta.created_at
      }))
    ];

    return { status: 200, data: { cartas: lista, total: lista.length } };
  }

  async toolGetCarta({ carta_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };

    const carta = this.cartas.get(carta_id);
    if (!carta) {
      const pending = Array.from(this.pendingAI.values()).find(p => p.id === carta_id);
      if (pending) {
        return { status: 200, data: { id: carta_id, estado: 'generando', message: 'La carta aún se está generando' } };
      }
      return { status: 404, error: `Carta "${carta_id}" no encontrada` };
    }

    return { status: 200, data: carta };
  }

  async toolUpdatePrices({ carta_id, porcentaje, categoria, precios }) {
    const carta = this.cartas.get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    if (!porcentaje && !precios) {
      return { status: 400, error: 'Se requiere "porcentaje" o "precios" (objeto {producto_id: nuevo_precio})' };
    }

    const cambios = [];

    if (precios && typeof precios === 'object') {
      for (const [prodId, nuevoPrecio] of Object.entries(precios)) {
        const prod = carta.productos.find(p => p.id === prodId);
        if (prod) {
          const anterior = prod.precio;
          prod.precio = Number(nuevoPrecio);
          cambios.push({ id: prodId, nombre: prod.nombre, anterior, nuevo: prod.precio });
        }
      }
    }

    if (typeof porcentaje === 'number') {
      const factor = 1 + porcentaje / 100;
      for (const prod of carta.productos) {
        if (categoria && prod.categoria !== categoria) continue;
        if (precios && precios[prod.id] !== undefined) continue;

        const anterior = prod.precio;
        prod.precio = Math.round(prod.precio * factor * 100) / 100;
        cambios.push({ id: prod.id, nombre: prod.nombre, anterior, nuevo: prod.precio });
      }
    }

    this.metrics?.increment('menu.prices.updated');
    await this.saveCartaToDisk(carta);

    await this.eventBus.publish('carta.generada', carta);

    return {
      status: 200,
      data: {
        carta_id,
        productos_actualizados: cambios.length,
        cambios
      }
    };
  }

  async toolAddProduct({ carta_id, nombre, categoria, precio, ingredientes }) {
    const carta = this.cartas.get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const cat = carta.categorias.find(c => c.id === categoria);
    if (!cat) {
      return { status: 400, error: `Categoría "${categoria}" no existe en la carta. Categorías: ${carta.categorias.map(c => c.id).join(', ')}` };
    }

    const prodId = `${this.slugify(categoria)}_${this.slugify(nombre)}`;

    if (carta.productos.find(p => p.id === prodId)) {
      return { status: 409, error: `Ya existe un producto con ID "${prodId}"` };
    }

    const producto = {
      id: prodId,
      nombre,
      categoria,
      precio: Number(precio),
      ingredientes: this.normalizeIngredientes(ingredientes || [])
    };

    carta.productos.push(producto);
    this.metrics?.increment('menu.product.added');
    await this.saveCartaToDisk(carta);

    await this.eventBus.publish('carta.generada', carta);

    return { status: 201, data: producto };
  }

  async toolRemoveProduct({ carta_id, producto_id }) {
    const carta = this.cartas.get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const idx = carta.productos.findIndex(p => p.id === producto_id);
    if (idx === -1) return { status: 404, error: `Producto "${producto_id}" no encontrado en la carta` };

    const removed = carta.productos.splice(idx, 1)[0];
    this.metrics?.increment('menu.product.removed');
    await this.saveCartaToDisk(carta);

    await this.eventBus.publish('carta.generada', carta);

    return { status: 200, data: { removed: removed.nombre, productos_restantes: carta.productos.length } };
  }

  async toolAddCategory({ carta_id, nombre }) {
    const carta = this.cartas.get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const catId = this.slugify(nombre);
    if (carta.categorias.find(c => c.id === catId)) {
      return { status: 409, error: `Ya existe categoría "${catId}"` };
    }

    const maxOrden = carta.categorias.reduce((max, c) => Math.max(max, c.orden), 0);
    const categoria = { id: catId, nombre, orden: maxOrden + 1 };
    carta.categorias.push(categoria);

    return { status: 201, data: categoria };
  }

  async toolUpdateProduct({ carta_id, producto_id, nombre, precio, categoria, ingredientes }) {
    const carta = this.cartas.get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const prod = carta.productos.find(p => p.id === producto_id);
    if (!prod) return { status: 404, error: `Producto "${producto_id}" no encontrado` };

    if (nombre !== undefined) prod.nombre = nombre;
    if (precio !== undefined) prod.precio = Number(precio);
    if (categoria !== undefined) {
      if (!carta.categorias.find(c => c.id === categoria)) {
        return { status: 400, error: `Categoría "${categoria}" no existe` };
      }
      prod.categoria = categoria;
    }
    if (ingredientes !== undefined) {
      prod.ingredientes = this.normalizeIngredientes(ingredientes);
    }

    await this.saveCartaToDisk(carta);
    await this.eventBus.publish('carta.generada', carta);

    return { status: 200, data: prod };
  }

  async toolSearchProducts({ carta_id, query }) {
    const carta = this.cartas.get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    if (!query) return { status: 400, error: 'Se requiere "query"' };

    const q = query.toLowerCase();
    const results = carta.productos.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.ingredientes.some(i => i.nombre.toLowerCase().includes(q))
    );

    return {
      status: 200,
      data: {
        query,
        resultados: results.length,
        productos: results
      }
    };
  }

  async toolStats({ carta_id }) {
    const carta = this.cartas.get(carta_id);
    if (!carta) return { status: 404, error: `Carta "${carta_id}" no encontrada` };

    const precios = carta.productos.map(p => p.precio).filter(p => p > 0);
    const porCategoria = {};
    for (const p of carta.productos) {
      porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1;
    }

    return {
      status: 200,
      data: {
        carta_id,
        nombre: carta.meta.nombre,
        total_productos: carta.productos.length,
        total_categorias: carta.categorias.length,
        total_ingredientes: carta.productos.reduce((sum, p) => sum + p.ingredientes.length, 0),
        precio_min: precios.length > 0 ? Math.min(...precios) : 0,
        precio_max: precios.length > 0 ? Math.max(...precios) : 0,
        precio_medio: precios.length > 0 ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length * 100) / 100 : 0,
        por_categoria: porCategoria
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

    const pendingData = this.pendingAI.get(correlationId);
    if (!pendingData) return;

    this.pendingAI.delete(correlationId);
    const { id: cartaId, nombre } = pendingData;

    if (!eventData.success && eventData.error) {
      this.logger.error('menu.generate.ai_error', { carta_id: cartaId, error: eventData.error });
      this.metrics?.increment('menu.generate.errors');
      await this.eventBus.publish('menu.error', {
        carta_id: cartaId,
        error_type: 'ai_processing_failed',
        message: eventData.error
      }, { correlationId });
      return;
    }

    try {
      const content = eventData.content || eventData.text || '';
      const carta = this.parseAndStructure(cartaId, nombre, content);

      this.cartas.set(cartaId, carta);
      await this.saveCartaToDisk(carta);
      this.metrics?.increment('menu.generate.completed');

      await this.eventBus.publish('carta.generada', carta, { correlationId });

      this.logger.info('menu.generate.completed', {
        carta_id: cartaId,
        productos: carta.productos.length,
        categorias: carta.categorias.length
      });
    } catch (err) {
      this.logger.error('menu.generate.parse_error', { carta_id: cartaId, error: err.message });
      this.metrics?.increment('menu.generate.errors');
      await this.eventBus.publish('menu.error', {
        carta_id: cartaId,
        error_type: 'parse_failed',
        message: err.message
      }, { correlationId });
    }
  }

  // ==========================================
  // Parsing
  // ==========================================

  parseAndStructure(cartaId, nombre, aiContent) {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('La IA no devolvió un JSON válido');

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

    if (productos.length === 0) throw new Error('La IA no extrajo ningún producto');

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

  normalizeIngredientes(ingredientes) {
    if (typeof ingredientes === 'string') {
      return ingredientes.split(',')
        .map(s => this.parseIngredienteString(s.trim()))
        .filter(i => i.nombre.length > 0);
    }

    if (Array.isArray(ingredientes)) {
      return ingredientes.map(ing => {
        if (typeof ing === 'string') return this.parseIngredienteString(ing);
        return { nombre: ing.nombre || ing.name || '', emoji: ing.emoji || '' };
      }).filter(i => i.nombre.length > 0);
    }

    return [];
  }

  parseIngredienteString(str) {
    const emojiRegex = /([\p{Emoji_Presentation}\p{Extended_Pictographic}])/u;
    const match = str.match(emojiRegex);
    const nombre = str.replace(emojiRegex, '').trim();
    return { nombre, emoji: match ? match[1] : '' };
  }

  // ==========================================
  // Utils
  // ==========================================

  slugify(text) {
    if (!text) return 'sin_nombre';
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'sin_nombre';
  }
}

module.exports = MenuGeneratorModule;
