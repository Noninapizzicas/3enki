/**
 * carta-scan.js
 * Handler que procesa fotos/PDFs de cartas físicas y genera carta.json
 *
 * Pipeline: Foto/PDF → Sharp prepare → Google Vision OCR → AI estructura → carta.json
 *
 * Reutiliza el pipeline de facturas (probado y funcional) pero con un prompt
 * diferente: en vez de extraer datos fiscales, extrae productos, precios,
 * categorías e ingredientes.
 *
 * Triggers:
 *   - carta.scan.request (desde otro handler o UI)
 *   - chat.send.request con /scanmenu (desde Telegram)
 *
 * Emite:
 *   - carta.scan.ocr_completado
 *   - carta.scan.completado (con carta.json generada)
 *   - carta.scan.error
 */

const path = require('path');
const fs = require('fs');

const CARTA_MANAGER_PATH = '../../../../modules/pizzepos/menu-generator/lib/carta-manager';
const STORAGE_PATH = path.resolve(__dirname, '../storage');

let _manager = null;

function getManager(logger) {
  if (!_manager) {
    const CartaManager = require(CARTA_MANAGER_PATH);
    _manager = new CartaManager(STORAGE_PATH, logger);
    _manager.load();
  }
  return _manager;
}

// Prompt para que la IA extraiga productos de un texto OCR de carta
const PROMPT_EXTRACCION = `Eres un asistente especializado en restauración. Se te proporciona el texto OCR de una carta/menú de restaurante.

Extrae TODOS los productos y devuelve un JSON con esta estructura exacta:

{
  "categorias": [
    { "id": "cat_<nombre_slug>", "nombre": "Nombre", "emoji": "<emoji>", "orden": <n> }
  ],
  "productos": [
    {
      "id": "prod_<nombre_slug>",
      "nombre": "Nombre del Producto",
      "emoji": "<emoji representativo>",
      "categoria": "cat_<categoria_slug>",
      "precio": <numero>,
      "descripcion": "<ingredientes o descripción corta>",
      "ingredientes_detectados": ["ingrediente1", "ingrediente2"],
      "metadata": {
        "vegano": <bool>,
        "vegetariano": <bool>,
        "tiempo_preparacion": <minutos estimado>
      }
    }
  ],
  "ingredientes_detectados": [
    {
      "id": "ing_<nombre_slug>",
      "nombre": "Nombre",
      "emoji": "<emoji>",
      "tipo": "<base|proteina|vegetal|condimento|salsa|topping|lacteo|fruto_seco>",
      "alergenos": ["<gluten|crustaceos|huevo|pescado|cacahuete|soja|lactosa|frutos_secos|apio|mostaza|sesamo|sulfitos|altramuces|moluscos>"]
    }
  ]
}

REGLAS:
- Los IDs usan snake_case sin acentos: "Jamón Serrano" → "ing_jamon_serrano"
- Detecta alérgenos a partir de los ingredientes (harina→gluten, queso→lactosa, etc.)
- Si un precio no se ve claro, pon 0 y marca "precio_pendiente": true
- Asigna emojis apropiados a cada producto y categoría
- Agrupa en categorías lógicas (pizzas, pastas, entrantes, postres, bebidas, etc.)
- Estima si es vegano/vegetariano por los ingredientes
- Devuelve SOLO el JSON, sin explicaciones`;

module.exports = {
  name: 'carta-scan',
  description: 'Escanea foto/PDF de carta y genera carta.json',
  trigger: 'chat.send.request',

  filter(event) {
    const data = event.data || event;
    const texto = (data.content || '').trim().toLowerCase();
    // Comando /scanmenu
    if (texto.startsWith('/scanmenu')) return true;
    // También escuchar evento directo
    return false;
  },

  async handle(event, { services, logger, emit, config }) {
    const data = event.data || event;
    const texto = (data.content || '').trim();
    const chatId = data.chatId || data.chat_id;
    const botName = config?.telegram?.botName || data.botName;

    // Extraer argumentos: /scanmenu [carta_id] [nombre]
    const args = texto.replace(/^\/scanmenu\s*/i, '').trim();
    const cartaId = args.split(/\s+/)[0] || 'carta_nueva_' + Date.now().toString(36);
    const cartaNombre = args.slice(cartaId.length).trim() || 'Carta escaneada';

    logger.info('carta-scan.start', { cartaId, chatId });

    // Verificar si hay archivo adjunto (foto/PDF)
    const filePath = data.filePath || data.file_path || data.attachment?.path;
    if (!filePath) {
      enviar(emit, chatId, botName,
        '📸 Envía una foto o PDF de la carta junto con el comando /scanmenu\n\n' +
        'Uso: /scanmenu [carta_id] [nombre]\n' +
        'Ejemplo: /scanmenu carta_verano "Carta Verano 2026"');
      return;
    }

    enviar(emit, chatId, botName, '🔍 Procesando carta... Paso 1/3: Preparando imagen');

    try {
      let imagePath = filePath;

      // Si es PDF, convertir a PNG
      if (filePath.toLowerCase().endsWith('.pdf')) {
        logger.info('carta-scan.pdf_to_png', { filePath });
        const pngResult = await services.call('local.pdf-to-png', 'convert', {
          pdf: filePath,
          dpi: 300
        }, { timeout: 60000 });
        const pngData = pngResult.data || pngResult;
        if (pngData.images && pngData.images.length > 0) {
          imagePath = pngData.images[0].path || pngData.images[0].content;
        }
      }

      // Preparar imagen con Sharp
      const preparedPath = path.join(STORAGE_PATH, `preprocesadas/scan_${Date.now()}.png`);
      const prepDir = path.dirname(preparedPath);
      if (!fs.existsSync(prepDir)) fs.mkdirSync(prepDir, { recursive: true });

      try {
        await services.call('local.sharp', 'prepare-ocr', {
          image: imagePath,
          output: preparedPath,
          options: { grayscale: true, normalize: true, sharpen: true, maxWidth: 2400, maxHeight: 3200 }
        }, { timeout: 30000 });
        imagePath = preparedPath;
      } catch (sharpErr) {
        logger.warn('carta-scan.sharp_skip', { error: sharpErr.message });
        // Continuar sin preparar — OCR funciona igual
      }

      // OCR con Google Vision
      enviar(emit, chatId, botName, '🔍 Paso 2/3: Extrayendo texto (OCR)...');

      const ocrResult = await services.call('local.google-vision', 'extract', {
        image: imagePath,
        hint: 'DOCUMENT_TEXT_DETECTION',
        languageHints: ['es']
      }, { timeout: 60000 });

      const ocrData = ocrResult.data || ocrResult;
      const textoOCR = ocrData.text || '';
      const confianza = ocrData.confidence || 0;

      if (!textoOCR || textoOCR.length < 20) {
        enviar(emit, chatId, botName, '❌ No se pudo extraer texto de la imagen. Intenta con mejor iluminación o resolución.');
        emit('carta.scan.error', { cartaId, error: 'OCR sin texto', confianza });
        return;
      }

      // Guardar texto OCR para referencia
      const ocrDir = path.join(STORAGE_PATH, 'ocr');
      if (!fs.existsSync(ocrDir)) fs.mkdirSync(ocrDir, { recursive: true });
      fs.writeFileSync(path.join(ocrDir, `${cartaId}.txt`), textoOCR, 'utf-8');

      logger.info('carta-scan.ocr_done', {
        cartaId,
        chars: textoOCR.length,
        confianza
      });

      emit('carta.scan.ocr_completado', { cartaId, textoOCR, confianza });

      // Estructurar con IA
      enviar(emit, chatId, botName, `🔍 Paso 3/3: Estructurando productos con IA (${textoOCR.length} chars, ${Math.round(confianza * 100)}% confianza)...`);

      const aiResult = await services.call('ai', 'chat', {
        messages: [
          { role: 'system', content: PROMPT_EXTRACCION },
          { role: 'user', content: `Texto OCR de la carta:\n\n${textoOCR}` }
        ],
        provider: 'deepseek',
        temperature: 0.1,
        max_tokens: 4000
      }, { timeout: 60000 });

      const aiData = aiResult.data || aiResult;
      const aiContent = aiData.content || aiData.text || '';

      // Parsear JSON de la respuesta
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        enviar(emit, chatId, botName, '❌ La IA no devolvió un JSON válido. Intenta de nuevo.');
        emit('carta.scan.error', { cartaId, error: 'AI parse failed' });
        return;
      }

      const extracted = JSON.parse(jsonMatch[0]);

      // Construir carta.json
      const manager = getManager(logger);

      // Registrar ingredientes nuevos
      const ingredientesNuevos = extracted.ingredientes_detectados || [];
      for (const ing of ingredientesNuevos) {
        if (!manager.obtenerIngrediente(ing.id)) {
          manager.agregarIngrediente({
            id: ing.id,
            nombre: ing.nombre,
            emoji: ing.emoji || '',
            tipo: ing.tipo || 'otro',
            alergenos: ing.alergenos || [],
            precio_extra: 0
          });
        }
      }

      // Construir productos con referencias a ingredientes
      const productos = (extracted.productos || []).map(p => ({
        id: p.id,
        nombre: p.nombre,
        emoji: p.emoji || '',
        categoria: p.categoria,
        precio: p.precio || 0,
        descripcion: p.descripcion || '',
        ingredientes: (p.ingredientes_detectados || []).map(nombre => {
          // Buscar ingrediente por nombre
          const ing = ingredientesNuevos.find(i =>
            i.nombre.toLowerCase() === nombre.toLowerCase()
          );
          return ing ? ing.id : 'ing_' + slugify(nombre);
        }),
        iva: 10,
        cocina: 'cocina',
        variaciones: { permite_quitar: [], permite_anadir: true, extras: [] },
        traducciones: {},
        metadata: p.metadata || {}
      }));

      const carta = {
        meta: {
          id: cartaId,
          nombre: cartaNombre,
          version: 0,
          idioma: 'es',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: {
            tipo: filePath.endsWith('.pdf') ? 'pdf' : 'imagen',
            archivo: path.basename(filePath),
            ocr_confianza: confianza
          }
        },
        categorias: extracted.categorias || [],
        productos,
        reglas: []
      };

      manager.guardarCarta(carta);

      logger.info('carta-scan.completed', {
        cartaId,
        productos: productos.length,
        categorias: (extracted.categorias || []).length,
        ingredientes: ingredientesNuevos.length
      });

      emit('carta.scan.completado', {
        cartaId,
        productos: productos.length,
        categorias: (extracted.categorias || []).length,
        ingredientes: ingredientesNuevos.length
      });

      // Resumen
      let msg = `✅ *Carta generada: ${cartaNombre}*\n\n`;
      msg += `📊 ${productos.length} productos en ${(extracted.categorias || []).length} categorías\n`;
      msg += `🧂 ${ingredientesNuevos.length} ingredientes detectados\n`;
      msg += `📋 OCR: ${Math.round(confianza * 100)}% confianza\n\n`;

      for (const cat of (extracted.categorias || []).sort((a, b) => a.orden - b.orden)) {
        const prods = productos.filter(p => p.categoria === cat.id);
        if (prods.length === 0) continue;
        msg += `${cat.emoji} *${cat.nombre}* (${prods.length})\n`;
        for (const p of prods) {
          msg += `  ${p.emoji} ${p.nombre} — ${p.precio > 0 ? p.precio.toFixed(2) + '€' : '⚠️ precio pendiente'}\n`;
        }
        msg += '\n';
      }

      msg += `\nUsa /carta ver ${cartaId} para detalles.\n`;
      msg += `Usa /carta precios para ajustar precios.`;

      enviar(emit, chatId, botName, msg);

    } catch (err) {
      logger.error('carta-scan.error', { cartaId, error: err.message, stack: err.stack });
      enviar(emit, chatId, botName, `❌ Error procesando carta: ${err.message}`);
      emit('carta.scan.error', { cartaId, error: err.message });
    }
  }
};

// También escuchar el evento directo
module.exports._extraTriggers = ['carta.scan.request'];

function enviar(emit, chatId, botName, texto) {
  if (chatId && botName) {
    emit('telegram.send_message.request', { botName, chatId, text: texto, parse_mode: 'Markdown' });
  }
  emit('carta.respuesta', { texto });
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
