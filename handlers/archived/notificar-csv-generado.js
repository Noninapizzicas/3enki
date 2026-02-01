/**
 * Handler Notificación: CSV generado/error
 *
 * Unifica notificaciones de CSV en un solo handler con array.
 * Envía por Telegram cuando el CSV está listo o hubo error.
 *
 * ENTRADA (eventos):
 *   - csv.asesoria.generado
 *   - csv.asesoria.error
 *
 * SALIDA (eventos):
 *   - telegram.send_message.request
 *   - telegram.send_document.request (para enviar archivo)
 *
 * @version 2.0.0
 */

const { formatMoney, EVENTS } = require('../lib/handler-utils');

module.exports = [
  // CSV generado OK → enviar documento
  {
    name: 'notificar-csv-generado',
    description: 'Notifica por Telegram cuando el CSV está listo',
    trigger: EVENTS.CSV_GENERADO,

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const {
        archivo, fileName, facturas,
        periodo, totales, notificar
      } = data;

      if (!notificar?.chatId) {
        logger.info('notificar-csv-generado.sin-destino', { archivo });
        return { success: true, notified: false };
      }

      const { chatId, botName } = notificar;

      const mensaje = [
        `<b>CSV Asesoria Generado</b>`,
        ``,
        `Archivo: <code>${fileName}</code>`,
        `Facturas: ${facturas}`,
        `Periodo: ${periodo}`,
        ``,
        `<b>Totales:</b>`,
        `- Base Imponible: ${formatMoney(totales?.base_imponible)}`,
        `- IVA: ${formatMoney(totales?.iva)}`,
        `- Total: ${formatMoney(totales?.total)}`,
        ``,
        `Listo para enviar a la asesoria`
      ].join('\n');

      logger.info('notificar-csv-generado.enviando', {
        chatId, archivo, facturas
      });

      // Enviar documento CSV
      emit(EVENTS.TELEGRAM_SEND_DOCUMENT, {
        chatId, botName,
        filePath: archivo,
        caption: mensaje,
        parse_mode: 'HTML'
      });

      return { success: true, notified: true };
    }
  },

  // CSV error → notificar
  {
    name: 'notificar-csv-error',
    description: 'Notifica errores al generar CSV',
    trigger: EVENTS.CSV_ERROR,

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { error, periodo, notificar } = data;

      if (!notificar?.chatId) {
        return { success: true, notified: false };
      }

      const { chatId, botName } = notificar;

      logger.warn('notificar-csv-error.enviando', { chatId, error });

      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        chatId, botName,
        text: `Error al generar CSV${periodo ? ` (${periodo})` : ''}:\n${error}`
      });

      return { success: true, notified: true };
    }
  }
];
