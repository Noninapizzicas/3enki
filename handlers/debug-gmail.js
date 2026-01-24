/**
 * Handler Debug: Ver último correo Gmail
 *
 * Escucha: gmail.debug
 * Solo para testing - muestra el último correo recibido
 */
module.exports = {
  name: 'debug-gmail',
  description: 'Muestra el último correo de Gmail (debug)',
  trigger: 'gmail.debug',

  async handle(event, { services, logger }) {
    const data = event.data || event;
    const account = data.account || 'noninapizzicas';

    // Buscar último correo (sin filtros)
    const busqueda = await services.call('local.gmail', 'search', {
      account,
      query: 'newer_than:3d',
      maxResults: 1
    });

    if (!busqueda.messages?.length) {
      logger.info('debug-gmail.sin-correos', { account });
      return { success: true, mensaje: 'No hay correos en los últimos 3 días' };
    }

    const msg = busqueda.messages[0];

    // Leer correo completo
    const correo = await services.call('local.gmail', 'read', {
      account,
      messageId: msg.id,
      format: 'full'
    });

    logger.info('debug-gmail.ultimo-correo', {
      id: correo.id,
      from: correo.from,
      subject: correo.subject,
      date: correo.date,
      adjuntos: correo.attachments?.length || 0,
      adjuntos_detalle: correo.attachments?.map(a => ({
        nombre: a.filename,
        tipo: a.mimeType,
        size: a.size
      }))
    });

    return {
      success: true,
      correo: {
        id: correo.id,
        from: correo.from,
        subject: correo.subject,
        date: correo.date,
        snippet: correo.snippet,
        adjuntos: correo.attachments
      }
    };
  }
};
