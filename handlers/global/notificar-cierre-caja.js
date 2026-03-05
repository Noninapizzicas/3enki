/**
 * Handler: Notificar cierre de caja
 *
 * Cuando se cierra la caja, envía el informe detallado por
 * Telegram y/o WhatsApp según la configuración del proyecto.
 *
 * ENTRADA: caja.cerrada
 * SALIDA:
 *   - telegram.send_message.request (si config.notificaciones.telegram)
 *   - local.whatsapp.send.request (si config.notificaciones.whatsapp)
 *
 * Config esperada en config.json del proyecto:
 *   notificaciones: {
 *     cierre_caja: {
 *       telegram: { chatId: "...", botName: "..." },
 *       whatsapp: { to: "+34..." },
 *       email: { to: "..." }   // futuro
 *     }
 *   }
 *
 * @version 1.0.0
 */

module.exports = {
  name: 'notificar-cierre-caja',
  description: 'Envía informe de cierre de caja por Telegram/WhatsApp',
  trigger: 'caja.cerrada',
  enabled: true,

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const { fecha, informe, cierre } = data;

    if (!informe) {
      logger.warn('notificar-cierre-caja.sin-informe', { fecha });
      return { success: false, reason: 'sin informe' };
    }

    const destinos = config?.notificaciones?.cierre_caja || {};
    let enviado = false;

    // --- Telegram ---
    const tg = destinos.telegram;
    if (tg?.chatId) {
      const botName = tg.botName || config?.telegram?.botName;
      if (botName) {
        logger.info('notificar-cierre-caja.telegram', { chatId: tg.chatId, fecha });

        // Telegram tiene límite de 4096 chars por mensaje
        const partes = dividirMensaje(informe, 4000);
        for (const parte of partes) {
          emit('telegram.send_message.request', {
            botName,
            chatId: tg.chatId,
            text: parte,
            parse_mode: 'HTML'
          });
        }
        enviado = true;
      }
    }

    // --- WhatsApp ---
    const wa = destinos.whatsapp;
    if (wa?.to) {
      logger.info('notificar-cierre-caja.whatsapp', { to: wa.to, fecha });

      emit('local.whatsapp.send.request', {
        to: wa.to,
        type: 'text',
        text: informe
      });
      enviado = true;
    }

    if (!enviado) {
      logger.info('notificar-cierre-caja.sin-destinos', { fecha });
    }

    return { success: true, enviado, fecha };
  }
};

/**
 * Divide un mensaje largo en partes respetando saltos de línea.
 */
function dividirMensaje(texto, maxLen) {
  if (texto.length <= maxLen) return [texto];

  const partes = [];
  let restante = texto;

  while (restante.length > 0) {
    if (restante.length <= maxLen) {
      partes.push(restante);
      break;
    }

    // Buscar último salto de línea antes del límite
    let corte = restante.lastIndexOf('\n', maxLen);
    if (corte <= 0) corte = maxLen;

    partes.push(restante.slice(0, corte));
    restante = restante.slice(corte).replace(/^\n/, '');
  }

  return partes;
}
