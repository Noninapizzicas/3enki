/**
 * Handler Proyecto: Procesar Facturas Nonina
 *
 * Escucha: bot.file.stored, gmail.file.stored
 * Emite: factura.procesada, factura.error
 *
 * Procesa facturas recibidas por Telegram o Gmail,
 * extrae datos estructurados y guarda en /procesadas.
 *
 * FLUJO:
 * 1. Recibe archivo (bot o gmail)
 * 2. Procesa con document-processor (mejor backend disponible)
 * 3. Guarda JSON con datos + PDF original en /procesadas/{año-mes}/
 * 4. Actualiza resumen.csv para la asesoría
 * 5. Notifica por Telegram
 */

const fs = require('fs');
const path = require('path');

// Configuración del proyecto
const PROJECT_ID = 'facturas-nonina';
const BOT_NAME = 'facturas_asesoria_bot';  // Bot de Telegram asociado
const GMAIL_ACCOUNT = 'noninapizzicas';  // Cuenta Gmail asociada
const TELEGRAM_CHAT_ID = null;  // Se puede configurar para notificaciones

// Rutas
const PROJECT_PATH = `./data/projects/${PROJECT_ID}`;
const PROCESADAS_PATH = `${PROJECT_PATH}/procesadas`;
const PENDIENTES_PATH = `${PROJECT_PATH}/pendientes`;

module.exports = {
  name: 'procesar-factura-nonina',
  description: 'Procesa facturas de Nonina Pizzicas',

  // Escuchar ambos eventos
  triggers: ['bot.file.stored', 'gmail.file.stored'],

  // Filtrar solo archivos de este proyecto
  filter: (event) => {
    const data = event.data || event;

    // De Telegram bot
    if (event.topic === 'bot.file.stored' || data.botName) {
      if (data.botName !== BOT_NAME) return false;
    }

    // De Gmail
    if (event.topic === 'gmail.file.stored' || data.account) {
      if (data.account !== GMAIL_ACCOUNT) return false;
    }

    // Solo PDFs e imágenes
    const mimeType = data.file?.mimeType || data.mimeType || '';
    const fileName = data.file?.originalName || data.file?.path || '';

    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
    const validExts = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif'];

    const mimeOk = validTypes.some(t => mimeType.includes(t));
    const extOk = validExts.some(e => fileName.toLowerCase().endsWith(e));

    return mimeOk || extOk;
  },

  async handle(event, { services, logger, emit }) {
    const data = event.data || event;
    const source = data.botName ? 'telegram' : 'gmail';

    // Extraer info del archivo
    const filePath = data.file?.path || data.path;
    const originalName = data.file?.originalName || path.basename(filePath);
    const mimeType = data.file?.mimeType || 'application/pdf';

    logger.info('procesar-factura.iniciando', {
      source,
      archivo: originalName,
      path: filePath
    });

    // Crear directorios si no existen
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthDir = path.join(PROCESADAS_PATH, yearMonth);

    if (!fs.existsSync(monthDir)) {
      fs.mkdirSync(monthDir, { recursive: true });
    }
    if (!fs.existsSync(PENDIENTES_PATH)) {
      fs.mkdirSync(PENDIENTES_PATH, { recursive: true });
    }

    try {
      // 1. Procesar con document-processor
      const result = await services.call(
        'local.document-processor',
        'extract-invoice',
        {
          document: filePath,
          backend: 'auto',
          language: 'es',
          account: GMAIL_ACCOUNT  // Para OAuth de Document AI
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Error procesando documento');
      }

      const invoice = result.data.invoice || {};
      const text = result.data.text || '';
      const backend = result.data.backend;
      const confidence = result.data.confidence;

      logger.info('procesar-factura.ocr-completado', {
        backend,
        confidence,
        hasInvoiceData: Object.keys(invoice).length > 0
      });

      // 2. Generar nombre de archivo basado en datos
      const invoiceNum = sanitize(invoice.invoice_number || 'SIN-NUM');
      const vendor = sanitize(invoice.vendor_name || 'desconocido').substring(0, 20);
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const baseName = `${dateStr}_${invoiceNum}_${vendor}`;

      // 3. Copiar archivo original
      const ext = path.extname(originalName) || '.pdf';
      const destFile = path.join(monthDir, `${baseName}${ext}`);
      fs.copyFileSync(filePath, destFile);

      // 4. Guardar JSON con datos estructurados
      const jsonData = {
        _meta: {
          procesado: now.toISOString(),
          source,
          backend,
          confidence,
          archivoOriginal: originalName,
          archivoDestino: path.basename(destFile)
        },
        factura: {
          numero: invoice.invoice_number || null,
          fecha: invoice.invoice_date || null,
          fechaVencimiento: invoice.due_date || null,
          proveedor: {
            nombre: invoice.vendor_name || null,
            direccion: invoice.vendor_address || null,
            nif: invoice.vendor_tax_id || null
          },
          importes: {
            base: invoice.subtotal || null,
            iva: invoice.tax_amount || null,
            tipoIva: invoice.tax_rate || null,
            total: invoice.total_amount || null,
            moneda: invoice.currency || 'EUR'
          },
          condicionesPago: invoice.payment_terms || null,
          lineas: invoice.line_items || []
        },
        textoOCR: text.substring(0, 5000)  // Primeros 5000 chars
      };

      const jsonPath = path.join(monthDir, `${baseName}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

      // 5. Actualizar CSV resumen
      await updateResumenCSV(PROCESADAS_PATH, {
        fecha: now.toISOString().slice(0, 10),
        numero: invoice.invoice_number || '',
        proveedor: invoice.vendor_name || '',
        nif: invoice.vendor_tax_id || '',
        base: invoice.subtotal || '',
        iva: invoice.tax_amount || '',
        total: invoice.total_amount || '',
        archivo: `${yearMonth}/${baseName}${ext}`,
        source
      });

      logger.info('procesar-factura.completado', {
        archivo: baseName,
        proveedor: invoice.vendor_name,
        total: invoice.total_amount
      });

      // 6. Emitir evento de éxito
      emit('factura.procesada', {
        projectId: PROJECT_ID,
        archivo: destFile,
        json: jsonPath,
        invoice: jsonData.factura,
        source,
        backend
      });

      // 7. Notificar por Telegram si está configurado
      if (TELEGRAM_CHAT_ID) {
        emit('telegram.send_message.request', {
          botName: BOT_NAME,
          chatId: TELEGRAM_CHAT_ID,
          text: formatTelegramMessage(jsonData),
          parse_mode: 'HTML'
        });
      }

      return {
        success: true,
        archivo: destFile,
        invoice: jsonData.factura
      };

    } catch (error) {
      logger.error('procesar-factura.error', { error: error.message });

      // Mover a pendientes
      const pendingName = `${now.getTime()}_${originalName}`;
      const pendingPath = path.join(PENDIENTES_PATH, pendingName);
      fs.copyFileSync(filePath, pendingPath);

      // Guardar error
      fs.writeFileSync(
        pendingPath + '.error.json',
        JSON.stringify({
          error: error.message,
          fecha: now.toISOString(),
          source,
          archivoOriginal: originalName
        }, null, 2)
      );

      emit('factura.error', {
        projectId: PROJECT_ID,
        archivo: pendingPath,
        error: error.message,
        source
      });

      return { success: false, error: error.message };
    }
  }
};

/**
 * Sanitiza string para nombre de archivo
 */
function sanitize(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Quitar acentos
    .replace(/[^a-zA-Z0-9]/g, '_')    // Solo alfanuméricos
    .replace(/_+/g, '_')              // Colapsar guiones
    .replace(/^_|_$/g, '');           // Quitar guiones extremos
}

/**
 * Actualiza el CSV resumen para la asesoría
 */
async function updateResumenCSV(basePath, row) {
  const csvPath = path.join(basePath, 'resumen.csv');
  const headers = ['fecha', 'numero', 'proveedor', 'nif', 'base', 'iva', 'total', 'archivo', 'source'];

  // Crear header si no existe
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, headers.join(';') + '\n');
  }

  // Añadir fila
  const values = headers.map(h => {
    const val = row[h] || '';
    // Escapar punto y coma y comillas
    if (String(val).includes(';') || String(val).includes('"')) {
      return `"${String(val).replace(/"/g, '""')}"`;
    }
    return val;
  });

  fs.appendFileSync(csvPath, values.join(';') + '\n');
}

/**
 * Formatea mensaje para Telegram
 */
function formatTelegramMessage(data) {
  const f = data.factura;
  const lines = ['<b>Factura procesada</b>'];

  if (f.proveedor?.nombre) lines.push(`Proveedor: ${f.proveedor.nombre}`);
  if (f.numero) lines.push(`N Factura: ${f.numero}`);
  if (f.fecha) lines.push(`Fecha: ${f.fecha}`);
  if (f.importes?.total) {
    lines.push(`Total: ${f.importes.total} ${f.importes.moneda || 'EUR'}`);
  }

  return lines.join('\n');
}
