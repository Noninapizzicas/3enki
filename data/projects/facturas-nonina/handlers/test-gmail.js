/**
 * Handler Proyecto: /gogmail
 *
 * Test descarga de adjuntos de Gmail.
 * Lee config del proyecto (cuenta, query) y descarga adjuntos.
 *
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

module.exports = {
  name: 'test-gmail',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'gogmail';
  },

  async handle(event, { logger, emit, services, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;
    const gmail = cfg.gmail || {};

    if (!gmail.account) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: 'No hay cuenta Gmail configurada en el proyecto.'
      });
      return;
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `Revisando Gmail: ${gmail.account}...`
    });

    try {
      // 1. Buscar correos con adjuntos
      const busqueda = await services.call('local.gmail', 'search', {
        account: gmail.account,
        query: gmail.query || 'has:attachment is:unread',
        maxResults: gmail.maxResults || 20
      }, { timeout: 30000 });

      const searchData = busqueda.data || busqueda;
      const messages = searchData.messages || [];

      if (messages.length === 0) {
        emit('telegram.send_message.request', {
          botName, chatId,
          text: `Gmail ${gmail.account}: 0 correos con adjuntos.`
        });
        return;
      }

      emit('telegram.send_message.request', {
        botName, chatId,
        text: `Encontrados ${messages.length} correos. Descargando adjuntos...`
      });

      // 2. Descargar adjuntos de cada correo
      const dirDestino = path.join(process.cwd(), `data/gmail/${gmail.account}`);
      if (!fs.existsSync(dirDestino)) fs.mkdirSync(dirDestino, { recursive: true });

      let totalAdjuntos = 0;
      let errores = 0;

      for (const msg of messages) {
        try {
          // Leer correo completo
          const correoResp = await services.call('local.gmail', 'read', {
            account: gmail.account,
            messageId: msg.id,
            format: 'full'
          }, { timeout: 30000 });

          const correo = correoResp.data || correoResp;
          const attachments = correo.attachments || [];

          for (const adj of attachments) {
            try {
              const descargaResp = await services.call('local.gmail', 'attachments.download', {
                account: gmail.account,
                messageId: msg.id,
                attachmentId: adj.id
              }, { timeout: 30000 });

              const descarga = descargaResp.data || descargaResp;
              if (!descarga.content) continue;

              // Nombre con fecha
              const ahora = new Date();
              const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
              const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');
              const ext = path.extname(adj.filename) || '';
              const base = path.basename(adj.filename, ext);
              const nuevoNombre = `${fecha}-${hora}_${base}${ext}`;
              const rutaDestino = path.join(dirDestino, nuevoNombre);

              fs.writeFileSync(rutaDestino, Buffer.from(descarga.content, 'base64'));
              totalAdjuntos++;

              logger.info('test-gmail.adjunto', { archivo: nuevoNombre, from: correo.from });

            } catch (e) {
              errores++;
              logger.error('test-gmail.adjunto-error', { error: e.message, filename: adj.filename });
            }
          }
        } catch (e) {
          errores++;
          logger.error('test-gmail.correo-error', { error: e.message, messageId: msg.id });
        }
      }

      const mensaje = [
        `Gmail ${gmail.account}:`,
        `Correos: ${messages.length}`,
        `Adjuntos descargados: ${totalAdjuntos}`,
        errores > 0 ? `Errores: ${errores}` : '',
        `Guardados en: data/gmail/${gmail.account}/`
      ].filter(Boolean).join('\n');

      emit('telegram.send_message.request', { botName, chatId, text: mensaje });

      logger.info('test-gmail.ok', {
        account: gmail.account, correos: messages.length,
        adjuntos: totalAdjuntos, errores
      });

    } catch (error) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: `Error Gmail: ${error.message}`
      });
      logger.error('test-gmail.error', { error: error.message });
    }
  }
};
