/**
 * Handler Proyecto: /gopdf
 *
 * Test conversion PDF a imagen.
 * Busca PDFs en los inbox (bot + gmail) y los convierte a PNG.
 *
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

module.exports = {
  name: 'test-pdf',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'gopdf';
  },

  async handle(event, { logger, emit, services, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;

    // 1. Buscar PDFs en ambos inbox
    const inboxBot = cfg.storage?.inbox?.telegram || `data/bots/${botName}/received`;
    const inboxGmail = cfg.storage?.inbox?.gmail || `data/gmail/${cfg.gmail?.account || 'default'}`;
    const absBot = path.isAbsolute(inboxBot) ? inboxBot : path.join(process.cwd(), inboxBot);
    const absGmail = path.isAbsolute(inboxGmail) ? inboxGmail : path.join(process.cwd(), inboxGmail);

    const pdfs = [];

    for (const dir of [absBot, absGmail]) {
      if (fs.existsSync(dir)) {
        const archivos = fs.readdirSync(dir)
          .filter(f => path.extname(f).toLowerCase() === '.pdf')
          .map(f => ({ name: f, path: path.join(dir, f), origen: dir === absBot ? 'bot' : 'gmail' }));
        pdfs.push(...archivos);
      }
    }

    if (pdfs.length === 0) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: 'No hay PDFs en inbox (bot ni gmail).'
      });
      return;
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `Encontrados ${pdfs.length} PDF(s). Convirtiendo a imagen...`
    });

    // 2. Convertir cada PDF
    const preproDir = path.join(process.cwd(), 'data/projects', projectId, 'storage', 'preprocesadas');
    if (!fs.existsSync(preproDir)) fs.mkdirSync(preproDir, { recursive: true });

    let convertidos = 0;
    let totalPaginas = 0;
    let errores = 0;

    for (const pdf of pdfs) {
      try {
        const result = await services.call('local.pdf-to-png', 'convert', {
          pdf: pdf.path,
          dpi: 300,
          outputFolder: preproDir
        }, { timeout: 60000 });

        const d = result.data || result;
        const paginas = d.images?.length || d.totalPages || 0;
        convertidos++;
        totalPaginas += paginas;

        logger.info('test-pdf.convertido', {
          archivo: pdf.name, origen: pdf.origen, paginas
        });

      } catch (error) {
        errores++;
        logger.error('test-pdf.error', { archivo: pdf.name, error: error.message });
      }
    }

    const mensaje = [
      `PDF a imagen:`,
      `PDFs procesados: ${convertidos}/${pdfs.length}`,
      `Paginas generadas: ${totalPaginas}`,
      errores > 0 ? `Errores: ${errores}` : '',
      `Guardadas en: storage/preprocesadas/`
    ].filter(Boolean).join('\n');

    emit('telegram.send_message.request', { botName, chatId, text: mensaje });

    logger.info('test-pdf.ok', { convertidos, totalPaginas, errores });
  }
};
