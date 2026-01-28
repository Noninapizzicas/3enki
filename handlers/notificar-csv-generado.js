/**
 * Handler: Notificar CSV Generado
 *
 * Envía notificación por Telegram cuando el CSV está listo,
 * incluyendo el archivo para descarga.
 *
 * ENTRADA (evento): csv.asesoria.generado
 * {
 *   archivo: string,
 *   fileName: string,
 *   facturas: number,
 *   periodo: string,
 *   totales: object,
 *   notificar: { chatId, botName }
 * }
 *
 * SALIDA (evento): bot.document.send
 *
 * @version 1.0.0
 */

module.exports = {
  name: 'notificar-csv-generado',
  description: 'Notifica por Telegram cuando el CSV está listo',
  trigger: 'csv.asesoria.generado',

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const {
      archivo,
      fileName,
      facturas,
      periodo,
      totales,
      notificar
    } = data;

    if (!notificar || !notificar.chatId) {
      logger.info('notificar-csv-generado.sin-destino', { archivo });
      return { success: true, notified: false };
    }

    const { chatId, botName } = notificar;

    logger.info('notificar-csv-generado.enviando', {
      chatId,
      archivo,
      facturas
    });

    // Formatear totales para mostrar
    const formatMoney = (val) => {
      const num = parseFloat(val) || 0;
      return num.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }) + ' €';
    };

    // Mensaje con resumen
    const mensaje = `📊 *CSV Asesoría Generado*

📁 Archivo: \`${fileName}\`
📋 Facturas: ${facturas}
📅 Periodo: ${periodo}

💰 *Totales:*
• Base Imponible: ${formatMoney(totales?.base_imponible)}
• IVA: ${formatMoney(totales?.iva)}
• Total: ${formatMoney(totales?.total)}

✅ Listo para enviar a la asesoría`;

    // Enviar documento
    emit('bot.document.send', {
      chatId,
      botName,
      filePath: archivo,
      caption: mensaje,
      parseMode: 'Markdown'
    });

    return { success: true, notified: true };
  }
};
