/**
 * Paso 3: /ocr → OCR en dos etapas: Tesseract + DeepSeek cleanup
 *
 * 1) Tesseract extrae texto raw de la imagen (local, gratis)
 * 2) DeepSeek limpia y mejora el texto usando inteligencia lingüística
 *
 * La API de DeepSeek NO soporta imágenes (solo deepseek-chat texto).
 * Esta estrategia combina OCR local + LLM para mejor resultado.
 *
 * Respuesta llega en ai.chat.response → resultado-ocr-cleanup (cmd-resultados.js)
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

const PROMPT_CLEANUP = `Eres un corrector de texto OCR. Te paso el texto raw extraido por OCR de una factura/documento.

El texto puede tener errores tipicos de OCR:
- Letras confundidas (l/1, O/0, rn/m, etc.)
- Palabras cortadas o mal separadas
- Caracteres basura o simbolos incorrectos
- Numeros mal leidos

Tu tarea:
1. Corrige errores evidentes de OCR manteniendo el contenido original
2. Manten el formato y orden del texto
3. Si hay tablas, usa | para separar columnas
4. Manten todos los numeros, fechas, NIFs, importes tal como esten (solo corrige errores obvios)
5. NO inventes ni agregues informacion que no este en el texto original
6. Si el texto esta muy corrupto, devuelve lo que puedas recuperar

Responde SOLO con el texto corregido, sin explicaciones.`;

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
        text: 'No hay imagenes. Manda una foto primero.'
      });
      return { success: false };
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `OCR en 2 etapas...\n${path.basename(filePath)} (${source})\n1. Tesseract extrayendo texto...\n2. DeepSeek corrigiendo...`
    });

    // -- Etapa 1: Tesseract OCR --
    let Tesseract;
    try {
      Tesseract = require('tesseract.js');
    } catch (e) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: 'Error: tesseract.js no instalado'
      });
      return { success: false };
    }

    let rawText = '';
    let confidence = 0;
    const startTime = Date.now();

    try {
      const worker = await Tesseract.createWorker('spa', 1, {
        logger: () => {}
      });
      const { data: result } = await worker.recognize(filePath);
      rawText = result.text.trim();
      confidence = result.confidence;
      await worker.terminate();

      logger.info('cmd-ocr.tesseract-ok', {
        chars: rawText.length,
        confidence: confidence.toFixed(1),
        elapsed: Date.now() - startTime,
        filePath
      });
    } catch (error) {
      logger.error('cmd-ocr.tesseract-error', { error: error.message });
      emit('telegram.send_message.request', {
        botName, chatId,
        text: `Tesseract fallo: ${error.message}`
      });
      return { success: false };
    }

    if (!rawText || rawText.length < 10) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: `Tesseract extrajo muy poco texto (${rawText.length} chars, ${confidence.toFixed(1)}% confianza).\nPrueba con /preprocesar primero.`
      });
      return { success: false, rawText, confidence };
    }

    // Notificar progreso etapa 1
    emit('telegram.send_message.request', {
      botName, chatId,
      text: `Etapa 1 OK: Tesseract ${rawText.length} chars (${confidence.toFixed(1)}% confianza) en ${Date.now() - startTime}ms\nEtapa 2: DeepSeek corrigiendo texto...`
    });

    // -- Etapa 2: DeepSeek text cleanup (solo texto, no imagen) --
    const requestId = `ocr-cleanup|${botName}|${chatId}|${confidence.toFixed(1)}|${Date.now()}`;

    logger.info('cmd-ocr.enviando-deepseek-cleanup', {
      rawChars: rawText.length,
      confidence,
      requestId
    });

    emit('ai.chat.request', {
      request_id: requestId,
      provider: 'deepseek',
      messages: [
        {
          role: 'system',
          content: PROMPT_CLEANUP
        },
        {
          role: 'user',
          content: `Texto OCR raw (confianza: ${confidence.toFixed(1)}%):\n\n${rawText}`
        }
      ],
      temperature: 0.1,
      max_tokens: 4000
    });

    return { success: true, filePath, source, rawText, confidence };
  }
};
