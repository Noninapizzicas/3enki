/**
 * Handler Global: Revisar Gmail
 *
 * Escucha: gmail.check
 * Emite: gmail.message.found (por cada correo con adjuntos)
 *
 * Payload requerido:
 * {
 *   account: 'mi-cuenta',                      // Nombre de cuenta OAuth configurada
 *   query: 'has:attachment is:unread',         // Query de Gmail (opcional)
 *   maxResults: 10                             // Máximo de resultados (opcional)
 * }
 *
 * Solo busca correos. El siguiente handler se encarga de descargar.
 */
module.exports = {
  name: 'revisar-gmail',
  description: 'Busca correos con adjuntos en Gmail',
  trigger: 'gmail.check',

  async handle(event, { services, logger, emit }) {
    const data = event.data || event;

    // Parámetros del evento (event-driven, sin config hardcodeado)
    const {
      account,
      query = 'has:attachment is:unread',
      maxResults = 10
    } = data;

    if (!account) {
      logger.error('revisar-gmail.error', { error: 'account es requerido' });
      return { success: false, error: 'account es requerido en el evento' };
    }

    logger.info('revisar-gmail.iniciando', { account, query, maxResults });

    // Buscar correos
    const busqueda = await services.call('local.gmail', 'search', {
      account,
      query,
      maxResults
    });

    // Los mensajes están en busqueda.data.messages
    const messages = busqueda.data?.messages || busqueda.messages || [];

    logger.info('revisar-gmail.busqueda', {
      account,
      query,
      mensajes: messages.length
    });

    if (!messages.length) {
      return { success: true, account, correos: 0 };
    }

    // Emitir evento por cada correo encontrado
    for (const msg of messages) {
      emit('gmail.message.found', {
        account,
        messageId: msg.id,
        threadId: msg.threadId
      });
    }

    logger.info('revisar-gmail.encontrados', {
      account,
      correos: messages.length
    });

    return { success: true, account, correos: messages.length };
  }
};
