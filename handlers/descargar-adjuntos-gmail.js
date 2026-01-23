/**
 * Handler Global: Descargar Adjuntos Gmail
 *
 * Escucha: gmail.message.found (emitido por revisar-gmail)
 * Emite: gmail.file.stored (por cada adjunto guardado)
 *
 * Lee el correo, descarga adjuntos y guarda en /data/gmail/{cuenta}/
 */
const path = require('path');
const fs = require('fs');

module.exports = {
  name: 'descargar-adjuntos-gmail',
  description: 'Descarga adjuntos de correos Gmail',
  trigger: 'gmail.message.found',

  async handle(event, { services, logger, emit, store }) {
    const data = event.data || event;
    const { account, email, messageId } = data;

    // Leer correo completo
    const correo = await services.call('local.gmail', 'read', {
      account,
      messageId,
      format: 'full'
    });

    if (!correo.attachments?.length) {
      logger.debug('descargar-adjuntos.sin-adjuntos', { messageId });
      return { success: true, adjuntos: 0 };
    }

    const dirDestino = `./data/gmail/${account}`;
    if (!fs.existsSync(dirDestino)) {
      fs.mkdirSync(dirDestino, { recursive: true });
    }

    let descargados = 0;

    for (const adj of correo.attachments) {
      // Descargar adjunto
      const descarga = await services.call('local.gmail', 'attachments.download', {
        account,
        messageId,
        attachmentId: adj.id
      });

      // Nombre con fecha
      const ahora = new Date();
      const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
      const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');
      const ext = path.extname(adj.filename) || '';
      const base = path.basename(adj.filename, ext);
      const nuevoNombre = `${fecha}-${hora}_${base}${ext}`;
      const rutaDestino = path.join(dirDestino, nuevoNombre);

      // Guardar archivo
      fs.writeFileSync(rutaDestino, Buffer.from(descarga.content, 'base64'));
      descargados++;

      logger.info('descargar-adjuntos.guardado', {
        cuenta: account,
        archivo: nuevoNombre
      });

      // Emitir evento (mismo patrón que bot.file.stored)
      emit('gmail.file.stored', {
        account,
        email,
        messageId,
        from: correo.from,
        subject: correo.subject,
        date: correo.date,
        file: {
          path: rutaDestino,
          originalName: adj.filename,
          mimeType: adj.mimeType,
          size: adj.size
        },
        timestamp: ahora.toISOString()
      });
    }

    await store.increment('adjuntos_descargados', descargados);
    return { success: true, adjuntos: descargados };
  }
};
