/**
 * Handler Debug: Ver último correo Gmail
 *
 * Escucha: gmail.debug
 * Solo para testing - muestra el último correo recibido
 *
 * Payload requerido:
 *   { account: 'nombre-cuenta' }
 */
module.exports = {
  name: 'debug-gmail',
  description: 'Muestra el último correo de Gmail (debug)',
  trigger: 'gmail.debug',

  async handle(event, { services, logger }) {
    const data = event.data || event;
    const account = data.account;

    if (!account) {
      logger.error('debug-gmail.error', { error: 'account es requerido' });
      return { success: false, error: 'account es requerido' };
    }

    // Buscar último correo (sin filtros)
    const busqueda = await services.call('local.gmail', 'search', {
      account,
      query: 'newer_than:3d',
      maxResults: 1
    });

    // Manejar respuesta con anidación: { success, data: { messages, ... } }
    if (!busqueda?.success) {
      logger.error('debug-gmail.error-busqueda', {
        error: busqueda?.error || 'Error en búsqueda Gmail'
      });
      return { success: false, error: busqueda?.error || 'Error buscando en Gmail' };
    }

    const searchData = busqueda.data || {};
    const messages = searchData.messages || [];

    if (!messages.length) {
      logger.info('debug-gmail.sin-correos', { account });
      return { success: true, mensaje: 'No hay correos en los últimos 3 días' };
    }

    const msg = messages[0];

    // Leer correo completo
    const correoResp = await services.call('local.gmail', 'read', {
      account,
      messageId: msg.id,
      format: 'full'
    });

    if (!correoResp?.success) {
      logger.error('debug-gmail.error-leer', { error: correoResp?.error });
      return { success: false, error: correoResp?.error || 'Error leyendo correo' };
    }

    const correo = correoResp.data || {};

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
