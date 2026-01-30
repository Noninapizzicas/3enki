/**
 * Paso 3: /ocr → dispara documento.ocr.request
 *
 * Coge la última imagen preprocesada y la manda al handler ocr-tesseract existente.
 * El resultado llega via documento.ocr.completado (cmd-resultados.js notifica).
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

    // Buscar última preprocesada
    const projectId = findProjectByBot(botName);
    const prepDir = projectId
      ? path.join(process.cwd(), 'data/projects', projectId, 'storage/preprocesadas')
      : path.join(process.cwd(), 'data/bots', botName, 'preprocesadas');

    const filePath = findLatestFile(prepDir, ['.png', '.jpg', '.jpeg']);

    if (!filePath) {
      // Fallback: buscar en received (foto sin preprocesar)
      const receivedDir = path.join(process.cwd(), 'data/bots', botName, 'received');
      const rawPhoto = findLatestFile(receivedDir, ['.jpg', '.jpeg', '.png']);
      if (!rawPhoto) {
        emit('telegram.send_message.request', {
          botName, chatId,
          text: '❌ No hay imágenes. Manda una foto y usa /preprocesar primero.'
        });
        return { success: false };
      }
      // Usar foto sin preprocesar
      emit('telegram.send_message.request', {
        botName, chatId,
        text: `⏳ OCR sobre imagen original (sin preprocesar): ${path.basename(rawPhoto)}...`
      });
      emit('documento.ocr.request', {
        filePath: rawPhoto,
        language: 'spa',
        requestId: `ocr-${Date.now()}`,
        notificar: { telegram: true, botName, chatId }
      });
      return { success: true };
    }

    // Leer preprocesada como base64
    const imagenBase64 = fs.readFileSync(filePath).toString('base64');

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `⏳ OCR sobre: ${path.basename(filePath)}...`
    });

    // Emitir al handler ocr-tesseract existente
    emit('documento.ocr.request', {
      filePath,
      image: imagenBase64,
      language: 'spa',
      requestId: `ocr-${Date.now()}`,
      notificar: { telegram: true, botName, chatId }
    });

    return { success: true };
  }
};
