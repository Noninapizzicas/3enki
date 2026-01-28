/**
 * Handler Proyecto: Procesar Factura con Document AI
 *
 * Escucha: factura.procesar.request
 * Emite: factura.procesada, factura.necesita_revision, factura.error
 *
 * Procesa una factura con Google Document AI:
 * 1. Extrae datos estructurados (proveedor, total, fecha, etc.)
 * 2. Valida importes (base + IVA = total)
 * 3. Clasifica documento (invoice/receipt)
 * 4. Determina estado (validada/revision)
 * 5. Guarda JSON con datos extraídos
 * 6. Mueve archivo original a storage.procesados
 * 7. Notifica por Telegram si está configurado
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

    // Leer config del proyecto (config.config porque el archivo es config/config.json)
    const cfg = config.config || {};
    const processing = cfg.processing || {};
    const storage = cfg.storage || {};
    const gmail = cfg.gmail || {};

    const procesadosPath = storage.procesados || `./data/projects/${projectId}/storage/procesados`;
    const pendientesPath = storage.pendientes || `./data/projects/${projectId}/storage/pendientes`;
    const confidenceThreshold = processing.confidenceThreshold || 0.85;

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
          backend: processing.backend || 'google_document_ai',
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
      const confidence = result.data?.confidence || 0;

      logger.info('procesar-factura.ocr-completado', {
        backend,
        confidence,
        proveedor: invoice.vendor_name,
        total: invoice.total_amount
      });

      // 2. Validación contable: base + IVA = total
      const importes = {
        base: parseFloat(invoice.subtotal) || null,
        iva: parseFloat(invoice.tax_amount) || 0,
        total: parseFloat(invoice.total_amount) || null
      };
      const validacionImportes = validarImportes(importes);

      // 3. Clasificación de documento (invoice vs receipt)
      const docType = clasificarDocumento(invoice);

      // 4. Determinar estado según confidence y validación
      const necesitaRevision = confidence < confidenceThreshold || !validacionImportes.ok;
      const estado = {
        status: necesitaRevision ? 'revision' : 'validada',
        confidence,
        confidenceThreshold,
        reglas: {
          importesCuadran: validacionImportes.ok,
          diferenciaImportes: validacionImportes.diferencia,
          tieneNumeroFactura: !!invoice.invoice_number,
          tieneProveedor: !!invoice.vendor_name,
          tieneFecha: !!invoice.invoice_date
        }
      };

      logger.info('procesar-factura.validacion', {
        docType,
        estado: estado.status,
        confidence,
        importesCuadran: validacionImportes.ok
      });

      // 5. Generar nombre de archivo basado en datos extraídos
      const invoiceNum = sanitize(invoice.invoice_number || 'SIN-NUM');
      const vendor = sanitize(invoice.vendor_name || 'desconocido').substring(0, 20);
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const statusSuffix = necesitaRevision ? '_REV' : '';
      const baseName = `${dateStr}_${invoiceNum}_${vendor}${statusSuffix}`;

      // 6. MOVER archivo original a procesados
      const ext = path.extname(fileName || filePath) || '.pdf';
      const destFile = path.join(monthDir, `${baseName}${ext}`);
      moveFile(filePath, destFile);

      // 7. Guardar JSON con datos estructurados
      const jsonData = {
        _meta: {
          procesado: now.toISOString(),
          source,
          backend,
          docType,
          archivoOriginal: fileName,
          archivoDestino: path.basename(destFile),
          projectId
        },
        estado,
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
            base: importes.base,
            iva: importes.iva,
            tipoIva: invoice.tax_rate || null,
            total: importes.total,
            moneda: invoice.currency || 'EUR'
          },
          lineas: invoice.line_items || []
        },
        textoOCR: text.substring(0, 5000)
      };

      const jsonPath = path.join(monthDir, `${baseName}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

      // 8. Actualizar CSV resumen
      updateResumenCSV(procesadosPath, {
        fecha: now.toISOString().slice(0, 10),
        numero: invoice.invoice_number || '',
        proveedor: invoice.vendor_name || '',
        nif: invoice.vendor_tax_id || '',
        base: importes.base || '',
        iva: importes.iva || '',
        total: importes.total || '',
        archivo: `${yearMonth}/${baseName}${ext}`,
        source,
        estado: estado.status,
        docType
      });

      logger.info('procesar-factura.completado', {
        archivo: baseName,
        proveedor: invoice.vendor_name,
        total: importes.total,
        estado: estado.status
      });

      // 9. Emitir evento según estado
      if (necesitaRevision) {
        emit('factura.necesita_revision', {
          projectId,
          archivo: destFile,
          json: jsonPath,
          invoice: jsonData.factura,
          estado,
          source,
          backend,
          razones: construirRazonesRevision(estado, confidence, confidenceThreshold)
        });
      } else {
        emit('factura.procesada', {
          projectId,
          archivo: destFile,
          json: jsonPath,
          invoice: jsonData.factura,
          estado,
          source,
          backend
        });
      }

      // 10. Notificar por Telegram
      if (notifyTelegram && botName && chatId) {
        const total = importes.total ? `${importes.total} EUR` : 'N/A';
        const statusIcon = necesitaRevision ? '⚠️' : '✅';
        const statusText = necesitaRevision ? 'REQUIERE REVISIÓN' : 'Validada';

        let mensaje = `${statusIcon} <b>Factura ${statusText}</b>\n` +
              `📄 ${invoice.vendor_name || 'Desconocido'}\n` +
              `💰 Total: ${total}\n` +
              `📅 ${invoice.invoice_date || 'Sin fecha'}\n` +
              `🎯 Confianza: ${Math.round(confidence * 100)}%`;

        if (necesitaRevision) {
          const razones = construirRazonesRevision(estado, confidence, confidenceThreshold);
          mensaje += `\n\n⚠️ <b>Motivos:</b>\n${razones.map(r => `• ${r}`).join('\n')}`;
        }

        emit('telegram.send_message.request', {
          botName,
          chatId,
          text: mensaje,
          parseMode: 'HTML'
        });
      }

      return {
        success: true,
        archivo: destFile,
        invoice: jsonData.factura,
        estado
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

// ============================================
// Funciones de Validación y Clasificación
// ============================================

/**
 * Valida que base + IVA = total (con tolerancia de 0.02€)
 */
function validarImportes({ base, iva, total }) {
  if (base == null || total == null) {
    return { ok: false, diferencia: null, razon: 'Faltan importes' };
  }

  const calculado = Number(base) + Number(iva || 0);
  const diferencia = Math.abs(calculado - Number(total));

  return {
    ok: diferencia < 0.02,
    diferencia: Math.round(diferencia * 100) / 100,
    calculado,
    razon: diferencia >= 0.02 ? `Base(${base}) + IVA(${iva}) = ${calculado} ≠ Total(${total})` : null
  };
}

/**
 * Clasifica documento: invoice (factura A4) vs receipt (ticket)
 */
function clasificarDocumento(invoice) {
  const lineItems = invoice.line_items || [];
  const tieneNumeroFactura = !!invoice.invoice_number;
  const tieneNIF = !!invoice.vendor_tax_id;

  // Heurística: tickets tienen muchas líneas y a menudo no tienen número de factura formal
  const esTicket = lineItems.length > 5 && !tieneNumeroFactura;

  // Factura A4: tiene número de factura y NIF del proveedor
  const esFactura = tieneNumeroFactura && tieneNIF;

  if (esTicket) return 'receipt';
  if (esFactura) return 'invoice';
  return 'unknown';
}

/**
 * Construye lista de razones por las que necesita revisión
 */
function construirRazonesRevision(estado, confidence, threshold) {
  const razones = [];

  if (confidence < threshold) {
    razones.push(`Confianza baja: ${Math.round(confidence * 100)}% (mínimo: ${Math.round(threshold * 100)}%)`);
  }

  if (!estado.reglas.importesCuadran) {
    razones.push(`Importes no cuadran (diferencia: ${estado.reglas.diferenciaImportes}€)`);
  }

  if (!estado.reglas.tieneNumeroFactura) {
    razones.push('Sin número de factura');
  }

  if (!estado.reglas.tieneProveedor) {
    razones.push('Proveedor no identificado');
  }

  if (!estado.reglas.tieneFecha) {
    razones.push('Sin fecha de factura');
  }

  return razones;
}

// ============================================
// Funciones de Utilidad
// ============================================

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
  const headers = ['fecha', 'numero', 'proveedor', 'nif', 'base', 'iva', 'total', 'archivo', 'source', 'estado', 'docType'];

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
