/**
 * Handler Proyecto: Comprimir y Enviar Facturas
 *
 * Escucha: facturas.comprimir.request
 * Emite: facturas.comprimido, gmail.send.request
 *
 * Comprime facturas procesadas por período (semana/mes)
 * y opcionalmente las envía por email a la asesoría.
 *
 * Todo leído desde config del proyecto, sin hardcodes.
 *
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { EVENTS, resolveStoragePath } = require('../../../../lib/handler-utils');

module.exports = {
  name: 'comprimir-facturas',
  description: 'Comprime facturas por período para enviar a asesoría',
  trigger: 'facturas.comprimir.request',

  async handle(event, { services, logger, emit, config, projectId }) {
    const data = event.data || event;
    const {
      periodo = 'mes-actual',
      enviarEmail = false,
      destinatario = null,
      chatId, botName: eventBotName
    } = data;

    const cfg = config.config || {};
    const telegram = cfg.telegram || {};
    const gmail = cfg.gmail || {};
    const botName = eventBotName || telegram.botName;
    const gmailAccount = gmail.account;

    const procesadasPath = resolveStoragePath({ config: cfg, projectId, subdir: 'procesadas' });
    const enviosPath = resolveStoragePath({ config: cfg, projectId, subdir: 'envios' });

    logger.info('comprimir-facturas.iniciando', { periodo, enviarEmail, projectId });

    try {
      // Determinar carpeta(s) a comprimir
      const folders = resolvePeriodo(periodo, procesadasPath);

      if (folders.length === 0) {
        throw new Error(`No hay facturas para el período: ${periodo}`);
      }

      // Verificar que existen
      const existingFolders = folders.filter(f =>
        fs.existsSync(path.join(procesadasPath, f))
      );

      if (existingFolders.length === 0) {
        throw new Error(`No se encontraron carpetas para: ${periodo}`);
      }

      // Nombre del ZIP
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const zipName = `facturas_${periodo.replace(/[^a-zA-Z0-9-]/g, '_')}_${timestamp}.zip`;
      const zipPath = path.join(enviosPath, zipName);

      // Crear ZIP
      await createZip(procesadasPath, existingFolders, zipPath);

      const stats = fs.statSync(zipPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      logger.info('comprimir-facturas.zip-creado', {
        archivo: zipName, sizeMB, carpetas: existingFolders
      });

      // Contar archivos
      let totalFiles = 0;
      for (const folder of existingFolders) {
        const folderPath = path.join(procesadasPath, folder);
        const files = fs.readdirSync(folderPath);
        totalFiles += files.filter(f =>
          f.endsWith('.pdf') || f.endsWith('.png') || f.endsWith('.jpg')
        ).length;
      }

      // Enviar por email si se solicita
      if (enviarEmail && destinatario && gmailAccount) {
        const zipContent = fs.readFileSync(zipPath).toString('base64');

        emit('gmail.send.request', {
          account: gmailAccount,
          to: destinatario,
          subject: `Facturas ${periodo} - ${cfg.name || projectId}`,
          body: `Adjunto las facturas del período ${periodo}.\n\nTotal: ${totalFiles} facturas\nTamaño: ${sizeMB} MB`,
          attachments: [{
            filename: zipName,
            content: zipContent,
            encoding: 'base64',
            contentType: 'application/zip'
          }]
        });

        logger.info('comprimir-facturas.email-enviado', { destinatario, archivo: zipName });
      }

      // Notificar por Telegram
      if (chatId && botName) {
        emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
          botName, chatId,
          text: `ZIP creado: ${zipName}\n${totalFiles} facturas\n${sizeMB} MB${enviarEmail && destinatario ? `\nEnviado a: ${destinatario}` : ''}`
        });
      }

      // Emitir evento de completado
      emit('facturas.comprimido', {
        projectId,
        archivo: zipPath,
        periodo,
        carpetas: existingFolders,
        totalFiles,
        sizeMB,
        enviado: enviarEmail && !!destinatario
      });

      return { success: true, archivo: zipPath, totalFiles, sizeMB };

    } catch (error) {
      logger.error('comprimir-facturas.error', { error: error.message });

      if (chatId && botName) {
        emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
          botName, chatId,
          text: `Error comprimiendo: ${error.message}`
        });
      }

      return { success: false, error: error.message };
    }
  }
};

/**
 * Resuelve período a carpetas
 */
function resolvePeriodo(periodo, procesadasPath) {
  const now = new Date();

  if (periodo === 'mes-actual') {
    return [formatYearMonth(now)];
  }

  if (periodo === 'mes-anterior') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return [formatYearMonth(prev)];
  }

  if (periodo === 'semana-actual') {
    const folders = new Set();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      folders.add(formatYearMonth(d));
    }
    return Array.from(folders);
  }

  if (periodo === 'todo') {
    if (fs.existsSync(procesadasPath)) {
      return fs.readdirSync(procesadasPath)
        .filter(f => /^\d{4}-\d{2}$/.test(f));
    }
    return [];
  }

  // Período específico (2026-01)
  if (/^\d{4}-\d{2}$/.test(periodo)) {
    return [periodo];
  }

  // Rango (2026-01:2026-03)
  if (periodo.includes(':')) {
    const [start, end] = periodo.split(':');
    return generateMonthRange(start, end);
  }

  return [periodo];
}

function formatYearMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function generateMonthRange(start, end) {
  const months = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);

  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

/**
 * Crea ZIP con las carpetas especificadas
 */
function createZip(basePath, folders, destPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    for (const folder of folders) {
      const folderPath = path.join(basePath, folder);
      archive.directory(folderPath, folder);
    }

    // Incluir resumen.csv si existe
    const csvPath = path.join(basePath, 'resumen.csv');
    if (fs.existsSync(csvPath)) {
      archive.file(csvPath, { name: 'resumen.csv' });
    }

    archive.finalize();
  });
}
