/**
 * Handler Proyecto: Procesar Factura con Document AI
 *
 * Escucha: factura.procesar.request
 * Emite: factura.procesada, factura.error
 *
 * Procesa una factura con Google Document AI:
 * 1. Extrae datos estructurados (proveedor, total, fecha, etc.)
 * 2. Guarda JSON con datos extraídos
 * 3. Mueve archivo original a storage.procesados
 * 4. Notifica por Telegram si está configurado
 *
 * Usa configuración del proyecto (config.json) - SIN HARDCODE.
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'procesar-factura',
  description: 'Procesa factura con Google Document AI',
  trigger: 'factura.procesar.request',

  async handle(event, { services, logger, emit, config, projectId }) {
    const data = event.data || event;
    const { filePath, fileName, source, notifyTelegram, botName, chatId } = data;

    // Leer config del proyecto
    const processing = config.processing || {};
    const storage = config.storage || {};
    const gmail = config.gmail || {};

    const procesadosPath = storage.procesados || `./data/projects/${projectId}/storage/procesados`;
    const pendientesPath = storage.pendientes || `./data/projects/${projectId}/storage/pendientes`;

    logger.info('procesar-factura.iniciando', {
      archivo: fileName,
      source,
      backend: processing.backend
    });

    // Crear directorios si no existen
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthDir = path.join(procesadosPath, yearMonth);

    ensureDir(monthDir);
    ensureDir(pendientesPath);

    try {
      // 1. Procesar con Document AI
      const result = await services.call(
        'local.document-processor',
        'extract-invoice',
        {
          document: filePath,
          backend: processing.backend || 'google-documentai',
          language: processing.language || 'es',
          account: gmail.account  // Para OAuth de Document AI
        },
        { timeout: 120000 }  // 2 minutos timeout
      );

      if (!result.success) {
        throw new Error(result.error || 'Error procesando documento');
      }

      const invoice = result.data?.invoice || {};
      const text = result.data?.text || '';
      const backend = result.data?.backend;
      const confidence = result.data?.confidence;

      logger.info('procesar-factura.ocr-completado', {
        backend,
        confidence,
        proveedor: invoice.vendor_name,
        total: invoice.total_amount
      });

      // 2. Generar nombre de archivo basado en datos extraídos
      const invoiceNum = sanitize(invoice.invoice_number || 'SIN-NUM');
      const vendor = sanitize(invoice.vendor_name || 'desconocido').substring(0, 20);
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const baseName = `${dateStr}_${invoiceNum}_${vendor}`;

      // 3. MOVER archivo original a procesados
      const ext = path.extname(fileName || filePath) || '.pdf';
      const destFile = path.join(monthDir, `${baseName}${ext}`);
      moveFile(filePath, destFile);

      // 4. Guardar JSON con datos estructurados
      const jsonData = {
        _meta: {
          procesado: now.toISOString(),
          source,
          backend,
          confidence,
          archivoOriginal: fileName,
          archivoDestino: path.basename(destFile),
          projectId
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
          lineas: invoice.line_items || []
        },
        textoOCR: text.substring(0, 5000)
      };

      const jsonPath = path.join(monthDir, `${baseName}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

      // 5. Actualizar CSV resumen
      updateResumenCSV(procesadosPath, {
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
        projectId,
        archivo: destFile,
        json: jsonPath,
        invoice: jsonData.factura,
        source,
        backend
      });

      // 7. Notificar por Telegram
      if (notifyTelegram && botName && chatId) {
        const total = invoice.total_amount ? `${invoice.total_amount} EUR` : 'N/A';
        emit('telegram.send_message.request', {
          botName,
          chatId,
          text: `✅ <b>Factura procesada</b>\n` +
                `📄 ${invoice.vendor_name || 'Desconocido'}\n` +
                `💰 Total: ${total}\n` +
                `📅 ${invoice.invoice_date || 'Sin fecha'}`,
          parseMode: 'HTML'
        });
      }

      return {
        success: true,
        archivo: destFile,
        invoice: jsonData.factura
      };

    } catch (error) {
      logger.error('procesar-factura.error', {
        archivo: fileName,
        error: error.message
      });

      // Mover a pendientes
      const pendingName = `${now.getTime()}_${fileName || path.basename(filePath)}`;
      const pendingPath = path.join(pendientesPath, pendingName);

      try {
        moveFile(filePath, pendingPath);

        // Guardar error
        fs.writeFileSync(
          pendingPath + '.error.json',
          JSON.stringify({
            error: error.message,
            fecha: now.toISOString(),
            source,
            archivoOriginal: fileName
          }, null, 2)
        );
      } catch (moveErr) {
        logger.error('procesar-factura.error-mover', { error: moveErr.message });
      }

      emit('factura.error', {
        projectId,
        archivo: pendingPath,
        error: error.message,
        source
      });

      // Notificar error por Telegram
      if (notifyTelegram && botName && chatId) {
        emit('telegram.send_message.request', {
          botName,
          chatId,
          text: `❌ Error procesando: ${fileName}\n${error.message}`
        });
      }

      return { success: false, error: error.message };
    }
  }
};

/**
 * Crea directorio si no existe
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Mueve archivo (rename si mismo filesystem, copy+delete si no)
 */
function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (e) {
    // Cross-filesystem: copy + delete
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

/**
 * Sanitiza string para nombre de archivo
 */
function sanitize(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Actualiza el CSV resumen para la asesoría
 */
function updateResumenCSV(basePath, row) {
  const csvPath = path.join(basePath, 'resumen.csv');
  const headers = ['fecha', 'numero', 'proveedor', 'nif', 'base', 'iva', 'total', 'archivo', 'source'];

  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, headers.join(';') + '\n');
  }

  const values = headers.map(h => {
    const val = row[h] || '';
    if (String(val).includes(';') || String(val).includes('"')) {
      return `"${String(val).replace(/"/g, '""')}"`;
    }
    return val;
  });

  fs.appendFileSync(csvPath, values.join(';') + '\n');
}
