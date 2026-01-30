/**
 * Paso 2: /preprocesar → Sharp → preprocesadas
 *
 * Coge la última foto descargada del bot y la pasa por Sharp.
 * Resultado visible en data/projects/{proyecto}/storage/preprocesadas/
 */

const fs = require('fs');
const path = require('path');

/**
 * Busca el proyecto que tiene configurado un bot de Telegram.
 */
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

/**
 * Busca la última foto en data/bots/{botName}/received/
 */
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

  async handle(event, { logger, emit, services }) {
    const data = event.data || event;
    const { botName, chatId } = data;

    logger.info('cmd-preprocesar.inicio', { botName, chatId });

    // Buscar última foto
    const filePath = findLatestPhoto(botName);
    if (!filePath) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: '❌ No hay fotos descargadas. Manda una foto primero.'
      });
      return { success: false, error: 'no photos' };
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `⏳ Preprocesando: ${path.basename(filePath)}...`
    });

    try {
      // Determinar directorio de salida
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

      // Llamar Sharp
      const result = await services.call('local.sharp', 'prepare-ocr', {
        image: filePath,
        options: {
          grayscale: true,
          normalize: true,
          sharpen: true,
          threshold: 140,
          denoise: false
        },
        output: outputPath
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Sharp falló');
      }

      const stats = fs.statSync(outputPath);

      logger.info('cmd-preprocesar.ok', { outputPath, size: stats.size });

      emit('telegram.send_message.request', {
        botName, chatId,
        text: `✅ Imagen preprocesada!\n📂 ${outputPath}\n📐 ${result.data.width}x${result.data.height}\n💾 ${Math.round(stats.size / 1024)}KB\n\nUsa /ocr para el siguiente paso.`
      });

      return { success: true, outputPath };

    } catch (error) {
      logger.error('cmd-preprocesar.error', { error: error.message, filePath });

      emit('telegram.send_message.request', {
        botName, chatId,
        text: `❌ Error preprocesando: ${error.message}`
      });

      return { success: false, error: error.message };
    }
  }
};
