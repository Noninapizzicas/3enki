/**
 * Handler Proyecto: Comprimir y Enviar Facturas
 *
 * Escucha: facturas.comprimir.request
 * Emite: facturas.comprimido, gmail.send.request
 *
 * Comprime facturas procesadas por período (semana/mes)
 * y opcionalmente las envía por email a la asesoría.
 *
 * Uso:
 *   emit('facturas.comprimir.request', {
 *     periodo: '2026-01',           // Mes específico
 *     // o
 *     periodo: 'semana-actual',     // Última semana
 *     periodo: 'mes-actual',        // Mes en curso
 *     periodo: 'mes-anterior',      // Mes pasado
 *
 *     enviarEmail: true,
 *     destinatario: 'asesoria@example.com'
 *   });
 *
 * Comando Telegram: /enviarfacturas [periodo]
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const PROJECT_ID = 'facturas-nonina';
const BOT_NAME = 'facturas_asesoria_bot';
const GMAIL_ACCOUNT = 'noninapizzicas';
const PROCESADAS_PATH = `./data/projects/${PROJECT_ID}/procesadas`;
const ENVIOS_PATH = `./data/projects/${PROJECT_ID}/envios`;

// Email de la asesoría (configurar)
const EMAIL_ASESORIA = process.env.EMAIL_ASESORIA || null;

module.exports = {
  name: 'comprimir-facturas',
  description: 'Comprime facturas por período para enviar a asesoría',
  trigger: 'facturas.comprimir.request',

  async handle(event, { services, logger, emit }) {
    const data = event.data || event;
    const {
      periodo = 'mes-actual',
      enviarEmail = false,
      destinatario = EMAIL_ASESORIA,
      chatId  // Para notificar por Telegram
    } = data;

    logger.info('comprimir-facturas.iniciando', { periodo, enviarEmail });

    // Crear directorio de envíos
    if (!fs.existsSync(ENVIOS_PATH)) {
      fs.mkdirSync(ENVIOS_PATH, { recursive: true });
    }

    try {
      // Determinar carpeta(s) a comprimir
      const folders = resolvePeriodo(periodo);

      if (folders.length === 0) {
        throw new Error(`No hay facturas para el período: ${periodo}`);
      }

      // Verificar que existen
      const existingFolders = folders.filter(f =>
        fs.existsSync(path.join(PROCESADAS_PATH, f))
      );

      if (existingFolders.length === 0) {
        throw new Error(`No se encontraron carpetas para: ${periodo}`);
      }

      // Nombre del ZIP
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const zipName = `facturas_${periodo.replace(/[^a-zA-Z0-9-]/g, '_')}_${timestamp}.zip`;
      const zipPath = path.join(ENVIOS_PATH, zipName);

      // Crear ZIP
      await createZip(PROCESADAS_PATH, existingFolders, zipPath);

      const stats = fs.statSync(zipPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      logger.info('comprimir-facturas.zip-creado', {
        archivo: zipName,
        sizeMB,
        carpetas: existingFolders
      });

      // Contar archivos
      let totalFiles = 0;
      for (const folder of existingFolders) {
        const folderPath = path.join(PROCESADAS_PATH, folder);
        const files = fs.readdirSync(folderPath);
        totalFiles += files.filter(f => f.endsWith('.pdf') || f.endsWith('.png') || f.endsWith('.jpg')).length;
      }

      // Enviar por email si se solicita
      if (enviarEmail && destinatario) {
        // Leer ZIP como base64
        const zipContent = fs.readFileSync(zipPath).toString('base64');

        emit('gmail.send.request', {
          account: GMAIL_ACCOUNT,
          to: destinatario,
          subject: `Facturas ${periodo} - Nonina Pizzicas`,
          body: `Adjunto las facturas del período ${periodo}.\n\nTotal: ${totalFiles} facturas\nTamaño: ${sizeMB} MB\n\nSaludos`,
          attachments: [{
            filename: zipName,
            content: zipContent,
            encoding: 'base64',
            contentType: 'application/zip'
          }]
        });

        logger.info('comprimir-facturas.email-enviado', {
          destinatario,
          archivo: zipName
        });
      }

      // Notificar por Telegram
      if (chatId) {
        emit('telegram.send_message.request', {
          botName: BOT_NAME,
          chatId,
          text: `📦 ZIP creado: ${zipName}\n📄 ${totalFiles} facturas\n💾 ${sizeMB} MB${enviarEmail ? `\n📧 Enviado a: ${destinatario}` : ''}`
        });
      }

      // Emitir evento de completado
      emit('facturas.comprimido', {
        projectId: PROJECT_ID,
        archivo: zipPath,
        periodo,
        carpetas: existingFolders,
        totalFiles,
        sizeMB,
        enviado: enviarEmail && !!destinatario
      });

      return {
        success: true,
        archivo: zipPath,
        totalFiles,
        sizeMB
      };

    } catch (error) {
      logger.error('comprimir-facturas.error', { error: error.message });

      if (chatId) {
        emit('telegram.send_message.request', {
          botName: BOT_NAME,
          chatId,
          text: `❌ Error comprimiendo: ${error.message}`
        });
      }

      return { success: false, error: error.message };
    }
  }
};

/**
 * Resuelve período a carpetas
 */
function resolvePeriodo(periodo) {
  const now = new Date();

  if (periodo === 'mes-actual') {
    return [formatYearMonth(now)];
  }

  if (periodo === 'mes-anterior') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return [formatYearMonth(prev)];
  }

  if (periodo === 'semana-actual') {
    // Últimos 7 días pueden cruzar meses
    const folders = new Set();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      folders.add(formatYearMonth(d));
    }
    return Array.from(folders);
  }

  if (periodo === 'todo') {
    // Todas las carpetas existentes
    if (fs.existsSync(PROCESADAS_PATH)) {
      return fs.readdirSync(PROCESADAS_PATH)
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
