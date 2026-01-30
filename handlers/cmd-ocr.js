/**
 * Paso 3: /ocr → DeepSeek visión extrae el texto de la imagen
 *
 * Coge la última imagen (preprocesada o recibida) y la envía
 * a DeepSeek visión via ai.chat.request para que lea el texto.
 *
 * Respuesta llega en ai.chat.response → resultado-ocr-vision (cmd-resultados.js)
 */

const fs = require('fs');
const path = require('path');

function findLatestFile(dir, extensions) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => extensions.some(ext => f.toLowerCase().endsWith(ext)))
    .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  return files.length > 0 ? path.join(dir, files[0].name) : null;
}

function findProjectByBot(botName) {
  const projectsDir = path.join(process.cwd(), 'data/projects');
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      const cfgPath = path.join(projectsDir, entry.name, 'config/config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        if (cfg.telegram?.botName === botName) return cfg.id || entry.name;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

const PROMPT_OCR = `Lee y transcribe TODO el texto visible en esta imagen de factura/documento.

Reglas:
- Transcribe el texto TAL CUAL aparece, sin interpretar ni reestructurar
- Mantén el orden de lectura natural (arriba a abajo, izquierda a derecha)
- Incluye números, fechas, importes, NIFs, direcciones, todo
- Si hay tablas, separa columnas con | y filas con saltos de línea
- NO añadas explicaciones ni comentarios, solo el texto extraído

Responde SOLO con el texto extraído.`;

module.exports = {
  name: 'cmd-ocr',
  trigger: 'telegram.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'ocr';
  },

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const { botName, chatId } = data;

    // Buscar imagen: preprocesada > received
    const projectId = findProjectByBot(botName);
    const prepDir = projectId
      ? path.join(process.cwd(), 'data/projects', projectId, 'storage/preprocesadas')
      : path.join(process.cwd(), 'data/bots', botName, 'preprocesadas');

    let filePath = findLatestFile(prepDir, ['.png', '.jpg', '.jpeg']);
    let source = 'preprocesada';

    if (!filePath) {
      const receivedDir = path.join(process.cwd(), 'data/bots', botName, 'received');
      filePath = findLatestFile(receivedDir, ['.jpg', '.jpeg', '.png']);
      source = 'original';
    }

    if (!filePath) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: '❌ No hay imágenes. Manda una foto primero.'
      });
      return { success: false };
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `⏳ OCR con DeepSeek visión...\n📄 ${path.basename(filePath)} (${source})`
    });

    // Leer imagen como base64
    const imageBase64 = fs.readFileSync(filePath).toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const imageType = ext === '.png' ? 'image/png' : 'image/jpeg';

    // request_id codifica contexto para el handler de respuesta
    const requestId = `ocr-vision|${botName}|${chatId}|${Date.now()}`;

    logger.info('cmd-ocr.enviando-deepseek', {
      filePath, source, requestId,
      imageSize: Math.round(imageBase64.length / 1024) + 'KB'
    });

    // Enviar a DeepSeek via ai-gateway
    emit('ai.chat.request', {
      request_id: requestId,
      provider: 'deepseek',
      messages: [
        {
          role: 'user',
          content: PROMPT_OCR,
          image_base64: imageBase64,
          image_type: imageType
        }
      ],
      temperature: 0.1,
      max_tokens: 4000
    });

    return { success: true, filePath, source };
  }
};
