/**
 * Paso 4: /estructurar → dispara texto.estructurar.request
 *
 * Coge el último texto OCR guardado y lo manda al handler estructurar-deepseek.
 * El resultado llega via texto.estructurado (cmd-resultados.js notifica).
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
  name: 'cmd-estructurar',
  trigger: 'telegram.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'estructurar';
  },

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const { botName, chatId } = data;

    // Buscar último OCR guardado
    const projectId = findProjectByBot(botName);
    const ocrDir = projectId
      ? path.join(process.cwd(), 'data/projects', projectId, 'storage/ocr')
      : null;

    if (!ocrDir) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: '❌ No se encontró proyecto para este bot.'
      });
      return { success: false };
    }

    const ocrFile = findLatestFile(ocrDir, ['.txt']);
    if (!ocrFile) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: '❌ No hay texto OCR. Usa /ocr primero.'
      });
      return { success: false };
    }

    const texto = fs.readFileSync(ocrFile, 'utf-8');
    if (!texto.trim()) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: '❌ El texto OCR está vacío.'
      });
      return { success: false };
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `⏳ Estructurando texto (${texto.length} chars) con DeepSeek...`
    });

    // Emitir al handler estructurar-deepseek existente
    emit('texto.estructurar.request', {
      texto,
      tipo: 'factura',
      filePath: ocrFile,
      requestId: `est-${Date.now()}`,
      notificar: { telegram: true, botName, chatId }
    });

    return { success: true };
  }
};
