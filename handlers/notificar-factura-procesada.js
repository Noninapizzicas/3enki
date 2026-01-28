/**
 * Handler: Notificar factura procesada
 *
 * Escucha cuando una factura termina de procesarse
 * y envía notificación por Telegram con el resumen.
 *
 * ENTRADA (evento): factura.procesada
 * SALIDA (evento): telegram.send_message.request
 *
 * @version 1.0.0
 */

const path = require('path');

module.exports = {
  name: 'notificar-factura-procesada',
  description: 'Notifica por Telegram cuando una factura se procesa',
  trigger: 'factura.procesada',

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const { datos, filePath, requestId, _meta, notificar } = data;

    // Solo notificar si se pidió
    if (!notificar?.telegram) {
      return { success: true, notificado: false };
    }

    const { botName, chatId } = notificar;

    if (!botName || !chatId) {
      logger.warn('notificar-factura.sin-destino', { requestId });
      return { success: false, error: 'Sin datos de notificación' };
    }

    // Formatear mensaje
    const fileName = path.basename(filePath || 'desconocido');
    const mensaje = formatearMensaje(fileName, datos, _meta);

    logger.info('notificar-factura.enviando', {
      fileName,
      chatId,
      requestId
    });

    // Enviar notificación
    emit('telegram.send_message.request', {
      botName,
      chatId,
      text: mensaje,
      parse_mode: 'HTML'
    });

    return { success: true, notificado: true };
  }
};

/**
 * Formatea el mensaje de notificación
 */
function formatearMensaje(fileName, datos, meta) {
  if (!datos) {
    return `❌ <b>Error procesando:</b> ${fileName}\nNo se pudieron extraer datos.`;
  }

  const lineas = [
    `✅ <b>Factura procesada:</b> ${fileName}`,
    ''
  ];

  // Proveedor
  if (datos.nombre_proveedor) {
    lineas.push(`🏢 <b>Proveedor:</b> ${datos.nombre_proveedor}`);
  }
  if (datos.nif_proveedor) {
    lineas.push(`   NIF: ${datos.nif_proveedor}`);
  }

  // Número y fecha
  if (datos.numero_factura) {
    lineas.push(`📝 <b>Nº Factura:</b> ${datos.numero_factura}`);
  }
  if (datos.fecha_factura) {
    lineas.push(`📅 <b>Fecha:</b> ${datos.fecha_factura}`);
  }

  // Totales
  lineas.push('');
  if (datos.base_imponible !== null && datos.base_imponible !== undefined) {
    lineas.push(`💰 Base: ${formatearNumero(datos.base_imponible)} €`);
  }
  if (datos.porcentaje_iva !== null && datos.cuota_iva !== null) {
    lineas.push(`   IVA ${datos.porcentaje_iva}%: ${formatearNumero(datos.cuota_iva)} €`);
  }
  if (datos.total !== null && datos.total !== undefined) {
    lineas.push(`💵 <b>Total: ${formatearNumero(datos.total)} €</b>`);
  }

  // Meta info
  if (meta) {
    lineas.push('');
    lineas.push(`⏱️ Tiempo: ${(meta.tiempoMs / 1000).toFixed(1)}s`);
    if (meta.costo !== undefined) {
      lineas.push(`💸 Costo API: $${meta.costo.toFixed(6)}`);
    }
  }

  return lineas.join('\n');
}

/**
 * Formatea número con 2 decimales
 */
function formatearNumero(num) {
  if (num === null || num === undefined) return '—';
  return parseFloat(num).toFixed(2);
}
