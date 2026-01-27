/**
 * Handler: Procesar Documento/Factura
 *
 * Escucha: document.process.request
 * Emite: document.process.complete, telegram.send_message.request
 *
 * Este handler procesa documentos (facturas, recibos, etc.) usando el
 * document-processor con sus múltiples backends.
 *
 * Uso desde otros handlers:
 * emit('document.process.request', {
 *   document: '/path/to/file.pdf',  // o base64
 *   type: 'invoice',                 // 'invoice' o 'document'
 *   backend: 'auto',                 // o específico: 'google_document_ai', etc.
 *   language: 'es',
 *   notifyTelegram: true,
 *   botName: 'miBot',
 *   chatId: 123456
 * });
 *
 * @version 1.0.0
 */

module.exports = {
  name: 'procesar-documento',
  description: 'Procesa documentos y facturas con múltiples backends OCR/AI',
  trigger: 'document.process.request',

  async handle(event, { services, logger, emit }) {
    const data = event.data || event;
    const {
      document,
      type = 'invoice',
      backend = 'auto',
      language = 'es',
      account,
      notifyTelegram = false,
      botName,
      chatId,
      metadata = {}
    } = data;

    // Validar documento
    if (!document) {
      logger.error('procesar-documento.error', { error: 'document es requerido' });
      return { success: false, error: 'document es requerido en el evento' };
    }

    logger.info('procesar-documento.iniciando', {
      type,
      backend,
      language,
      hasDocument: !!document
    });

    try {
      // Primero, listar backends disponibles
      const backendsResult = await services.call(
        'local.document-processor',
        'list-backends',
        {}
      );

      if (!backendsResult.success) {
        throw new Error('No se pudieron listar los backends');
      }

      const { available, recommended } = backendsResult.data;

      if (available.length === 0) {
        throw new Error('No hay backends disponibles para procesar documentos');
      }

      logger.info('procesar-documento.backends', {
        available: available.map(b => b.id),
        recommended,
        requested: backend
      });

      // Procesar según tipo
      let result;
      if (type === 'invoice') {
        result = await services.call(
          'local.document-processor',
          'extract-invoice',
          { document, backend, language, account }
        );
      } else {
        result = await services.call(
          'local.document-processor',
          'process',
          { document, backend, language, account }
        );
      }

      if (!result.success) {
        throw new Error(result.error || 'Error procesando documento');
      }

      logger.info('procesar-documento.completado', {
        backend: result.data.backend,
        confidence: result.data.confidence,
        hasInvoice: !!result.data.invoice,
        textLength: result.data.text?.length || 0
      });

      // Preparar resultado
      const processResult = {
        success: true,
        backend: result.data.backend,
        confidence: result.data.confidence,
        pages: result.data.pages,
        text: result.data.text,
        invoice: result.data.invoice,
        tables: result.data.tables,
        metadata
      };

      // Emitir evento de completado
      emit('document.process.complete', processResult);

      // Notificar por Telegram si se solicita
      if (notifyTelegram && botName && chatId) {
        const message = formatTelegramMessage(result.data, type);
        emit('telegram.send_message.request', {
          botName,
          chatId,
          text: message,
          parse_mode: 'HTML'
        });
      }

      return processResult;

    } catch (error) {
      logger.error('procesar-documento.error', { error: error.message });

      const errorResult = {
        success: false,
        error: error.message,
        metadata
      };

      // Emitir evento de error
      emit('document.process.error', errorResult);

      // Notificar error por Telegram
      if (notifyTelegram && botName && chatId) {
        emit('telegram.send_message.request', {
          botName,
          chatId,
          text: `Error procesando documento:\n${error.message}`
        });
      }

      return errorResult;
    }
  }
};

/**
 * Formatea mensaje para Telegram
 */
function formatTelegramMessage(data, type) {
  const lines = [];

  lines.push(`<b>Documento procesado</b>`);
  lines.push(`Backend: ${data.backend}`);
  lines.push(`Confianza: ${data.confidence}%`);

  if (type === 'invoice' && data.invoice) {
    const inv = data.invoice;
    lines.push('');
    lines.push('<b>Datos de factura:</b>');

    if (inv.vendor_name) lines.push(`Proveedor: ${inv.vendor_name}`);
    if (inv.invoice_number) lines.push(`N Factura: ${inv.invoice_number}`);
    if (inv.invoice_date) lines.push(`Fecha: ${inv.invoice_date}`);
    if (inv.total_amount) {
      const currency = inv.currency || 'EUR';
      lines.push(`Total: ${inv.total_amount} ${currency}`);
    }
    if (inv.tax_amount) {
      lines.push(`IVA: ${inv.tax_amount}`);
    }

    if (inv.line_items && inv.line_items.length > 0) {
      lines.push('');
      lines.push(`<b>Lineas (${inv.line_items.length}):</b>`);
      for (const item of inv.line_items.slice(0, 5)) {
        if (item.description) {
          const desc = item.description.substring(0, 40);
          const amount = item.amount ? ` - ${item.amount}` : '';
          lines.push(`- ${desc}${amount}`);
        }
      }
      if (inv.line_items.length > 5) {
        lines.push(`... y ${inv.line_items.length - 5} mas`);
      }
    }
  } else if (data.text) {
    lines.push('');
    lines.push('<b>Texto extraido:</b>');
    const preview = data.text.substring(0, 500);
    lines.push(`<code>${escapeHtml(preview)}${data.text.length > 500 ? '...' : ''}</code>`);
  }

  return lines.join('\n');
}

/**
 * Escapa HTML para Telegram
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
