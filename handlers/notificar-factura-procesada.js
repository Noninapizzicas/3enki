/**
 * Handler Notificación: Factura procesada/revisión
 *
 * Envía notificación por Telegram cuando una factura se procesa
 * o necesita revisión. Funciona con ambos eventos.
 *
 * ENTRADA (eventos):
 *   - factura.procesada
 *   - factura.necesita_revision
 *
 * SALIDA (evento): telegram.send_message.request
 *
 * @version 2.0.0
 */

const path = require('path');
const { formatMoney, escapeHtml, EVENTS } = require('../lib/handler-utils');

module.exports = [
  // Factura procesada OK
  {
    name: 'notificar-factura-procesada',
    description: 'Notifica por Telegram cuando una factura se procesa',
    trigger: EVENTS.FACTURA_PROCESADA,

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { datos, filePath, requestId, _meta, notificar } = data;

      if (!notificar?.telegram && !notificar?.chatId) {
        return { success: true, notificado: false };
      }

      const chatId = notificar.chatId;
      const botName = notificar.botName;
      if (!botName || !chatId) return { success: true, notificado: false };

      const fileName = path.basename(filePath || 'desconocido');
      const mensaje = formatearMensajeFactura(fileName, datos, _meta, false);

      logger.info('notificar-factura.enviando', {
        fileName, chatId, requestId
      });

      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: mensaje,
        parse_mode: 'HTML'
      });

      return { success: true, notificado: true };
    }
  },

  // Factura necesita revisión
  {
    name: 'notificar-factura-revision',
    description: 'Notifica por Telegram cuando una factura necesita revisión',
    trigger: EVENTS.FACTURA_REVISION,

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { datos, filePath, requestId, _meta, notificar, razones } = data;

      if (!notificar?.telegram && !notificar?.chatId) {
        return { success: true, notificado: false };
      }

      const chatId = notificar.chatId;
      const botName = notificar.botName;
      if (!botName || !chatId) return { success: true, notificado: false };

      const fileName = path.basename(filePath || 'desconocido');
      const mensaje = formatearMensajeFactura(fileName, datos, _meta, true, razones);

      logger.info('notificar-factura-revision.enviando', {
        fileName, chatId, requestId, razones
      });

      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: mensaje,
        parse_mode: 'HTML'
      });

      return { success: true, notificado: true };
    }
  }
];

/**
 * Formatea mensaje de notificación de factura
 */
function formatearMensajeFactura(fileName, datos, meta, necesitaRevision, razones) {
  if (!datos) {
    return `<b>Error procesando:</b> ${escapeHtml(fileName)}\nNo se pudieron extraer datos.`;
  }

  const icon = necesitaRevision ? '!!' : 'OK';
  const status = necesitaRevision ? 'REQUIERE REVISION' : 'Factura procesada';
  const lineas = [`<b>${icon} ${status}:</b> ${escapeHtml(fileName)}`, ''];

  if (datos.nombre_proveedor) {
    lineas.push(`<b>Proveedor:</b> ${escapeHtml(datos.nombre_proveedor)}`);
  }
  if (datos.nif_proveedor) {
    lineas.push(`   NIF: ${datos.nif_proveedor}`);
  }
  if (datos.numero_factura) {
    lineas.push(`<b>N Factura:</b> ${datos.numero_factura}`);
  }
  if (datos.fecha_factura) {
    lineas.push(`<b>Fecha:</b> ${datos.fecha_factura}`);
  }

  lineas.push('');
  if (datos.base_imponible != null) {
    lineas.push(`Base: ${formatMoney(datos.base_imponible)}`);
  }
  if (datos.porcentaje_iva != null && datos.cuota_iva != null) {
    lineas.push(`IVA ${datos.porcentaje_iva}%: ${formatMoney(datos.cuota_iva)}`);
  }
  if (datos.total != null) {
    lineas.push(`<b>Total: ${formatMoney(datos.total)}</b>`);
  }

  if (necesitaRevision && razones?.length > 0) {
    lineas.push('');
    lineas.push('<b>Motivos revision:</b>');
    razones.forEach(r => lineas.push(`- ${escapeHtml(r)}`));
  }

  if (meta?.tiempoMs) {
    lineas.push('');
    lineas.push(`Tiempo: ${(meta.tiempoMs / 1000).toFixed(1)}s`);
    if (meta.costo !== undefined) {
      lineas.push(`Costo API: $${meta.costo.toFixed(6)}`);
    }
  }

  return lineas.join('\n');
}
