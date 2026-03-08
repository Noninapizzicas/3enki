/**
 * Handler: Notificar cierre de caja
 *
 * Cuando se cierra la caja, envía el informe detallado por
 * Telegram, WhatsApp y/o Email según la configuración del proyecto.
 *
 * ENTRADA: caja.cerrada
 * SALIDA:
 *   - telegram.send_message.request (si config.notificaciones.telegram)
 *   - local.whatsapp.send.request (si config.notificaciones.whatsapp)
 *   - local.gmail.send.request (si config.notificaciones.email)
 *
 * Config esperada en config.json del proyecto:
 *   notificaciones: {
 *     cierre_caja: {
 *       telegram: { chatId: "...", botName: "..." },
 *       whatsapp: { to: "+34..." },
 *       email: { to: "user@example.com", account: "mi-cuenta-gmail" }
 *     }
 *   }
 *
 * @version 2.0.0
 */

module.exports = {
  name: 'notificar-cierre-caja',
  description: 'Envía informe de cierre de caja por Telegram/WhatsApp/Email',
  trigger: 'caja.cerrada',
  enabled: true,

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const { fecha, informe, cierre, project_id } = data;

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

    // --- Email (Gmail) ---
    const email = destinos.email;
    if (email?.to) {
      const to = email.to;
      const account = email.account || config?.gmail?.account;
      const projectName = project_id || config?.name || 'Sistema';
      const subject = `Cierre de caja - ${fecha} - ${projectName}`;

      // Generar versión HTML del informe para email
      const htmlBody = generarInformeHTML(informe, cierre);

      logger.info('notificar-cierre-caja.email', { to, fecha, account: account || 'default' });

      emit('local.gmail.send.request', {
        account: account || undefined,
        to,
        subject,
        body: htmlBody,
        html: true
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

/**
 * Convierte el informe de texto plano a HTML para email.
 */
function generarInformeHTML(informe, cierre) {
  const estado = cierre?.estado || 'desconocido';
  const estadoColor = estado === 'cuadrado' ? '#27ae60' : estado === 'sobrante' ? '#f39c12' : '#e74c3c';

  // Escapar HTML y convertir formato
  const contenido = informe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/━/g, '&mdash;')
    .replace(/─/g, '&ndash;');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Courier New', monospace; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px; border-left: 4px solid ${estadoColor};">
    <pre style="white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 1.5; margin: 0;">${contenido}</pre>
  </div>
</body>
</html>`;
}
