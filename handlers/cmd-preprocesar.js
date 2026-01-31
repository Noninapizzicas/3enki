/**
 * Paso 2: /preprocesar → Sharp pipeline optimizado para OCR
 *
 * Pipeline: trim (recortar bordes) → ampliar (min 2500px) → grayscale → contraste → sharpen
 * Tesseract funciona mejor con imagenes grandes y limpias.
 *
 * Resultado visible en data/projects/{proyecto}/storage/preprocesadas/
 */

const fs = require('fs');
const path = require('path');

const MIN_LONG_SIDE = 2500; // Tesseract rinde mejor con imagenes grandes

function findProjectByBot(botName) {
  const projectsDir = path.join(process.cwd(), 'data/projects');
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      const configPath = path.join(projectsDir, entry.name, 'config/config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.telegram?.botName === botName) {
          return config.id || entry.name;
        }
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function findLatestPhoto(botName) {
  const dir = path.join(process.cwd(), 'data/bots', botName, 'received');
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  return files.length > 0 ? path.join(dir, files[0].name) : null;
}

module.exports = {
  name: 'cmd-preprocesar',
  trigger: 'telegram.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'preprocesar';
  },

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const { botName, chatId } = data;

    logger.info('cmd-preprocesar.inicio', { botName, chatId });

    const filePath = findLatestPhoto(botName);
    if (!filePath) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: 'No hay fotos descargadas. Manda una foto primero.'
      });
      return { success: false, error: 'no photos' };
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `Preprocesando: ${path.basename(filePath)}...`
    });

    try {
      const sharp = require('sharp');

      const projectId = findProjectByBot(botName);
      const outputDir = projectId
        ? path.join(process.cwd(), 'data/projects', projectId, 'storage/preprocesadas')
        : path.join(process.cwd(), 'data/bots', botName, 'preprocesadas');

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
      const nombreBase = path.basename(filePath, path.extname(filePath));
      const outputPath = path.join(outputDir, `${timestamp}_${nombreBase}_prep.png`);

      // -- Paso 1: Obtener dimensiones originales --
      const originalMeta = await sharp(filePath).metadata();
      const origW = originalMeta.width;
      const origH = originalMeta.height;

      // -- Paso 2: Trim (recortar bordes uniformes/fondo) --
      let trimmedBuffer;
      let trimmedW, trimmedH;
      try {
        const trimResult = await sharp(filePath)
          .trim({ threshold: 15 })
          .toBuffer({ resolveWithObject: true });
        trimmedBuffer = trimResult.data;
        trimmedW = trimResult.info.width;
        trimmedH = trimResult.info.height;
      } catch (trimErr) {
        // trim puede fallar si no hay bordes uniformes - usar original
        logger.debug('cmd-preprocesar.trim-skip', { reason: trimErr.message });
        trimmedBuffer = fs.readFileSync(filePath);
        trimmedW = origW;
        trimmedH = origH;
      }

      // -- Paso 3: Ampliar si es pequena (Tesseract necesita resolucion alta) --
      const longSide = Math.max(trimmedW, trimmedH);
      let resizeW = null;
      let resizeH = null;
      let scaled = false;

      if (longSide < MIN_LONG_SIDE) {
        const scale = MIN_LONG_SIDE / longSide;
        resizeW = Math.round(trimmedW * scale);
        resizeH = Math.round(trimmedH * scale);
        scaled = true;
      }

      // -- Paso 4: Pipeline final: [resize] → grayscale → normalize → sharpen → png --
      let pipeline = sharp(trimmedBuffer);

      if (scaled) {
        pipeline = pipeline.resize(resizeW, resizeH, {
          fit: 'fill',
          kernel: 'lanczos3'  // Mejor kernel para ampliar texto
        });
      }

      const result = await pipeline
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.5, m1: 1.5, m2: 2.5 })
        .png()
        .toFile(outputPath);

      const stats = fs.statSync(outputPath);

      logger.info('cmd-preprocesar.ok', {
        outputPath,
        original: `${origW}x${origH}`,
        trimmed: `${trimmedW}x${trimmedH}`,
        final: `${result.width}x${result.height}`,
        scaled,
        size: stats.size
      });

      const lines = [
        `Imagen preprocesada para OCR`,
        `Original: ${origW}x${origH}`,
        `Recortada: ${trimmedW}x${trimmedH} (trim bordes)`,
      ];
      if (scaled) {
        lines.push(`Ampliada: ${result.width}x${result.height} (x${(MIN_LONG_SIDE / longSide).toFixed(1)})`);
      }
      lines.push(`Tamano: ${Math.round(stats.size / 1024)}KB`);
      lines.push(`\nUsa /ocr para el siguiente paso.`);

      emit('telegram.send_message.request', {
        botName, chatId,
        text: lines.join('\n')
      });

      return { success: true, outputPath };

    } catch (error) {
      logger.error('cmd-preprocesar.error', { error: error.message, filePath });

      emit('telegram.send_message.request', {
        botName, chatId,
        text: `Error preprocesando: ${error.message}`
      });

      return { success: false, error: error.message };
    }
  }
};
