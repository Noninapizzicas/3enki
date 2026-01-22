/**
 * Handler de prueba - Escucha mensajes del chat
 *
 * Escucha: chat.send.request (cuando usuario envía mensaje)
 * Emite: test.chat.received
 *
 * Los logs aparecen en la consola donde corre el servidor
 */
module.exports = {
  name: 'ping',
  description: 'Handler de prueba - detecta mensajes del chat',
  trigger: 'chat.send.request',

  async handle(event, { services, logger, projectId, emit, config, store }) {
    // Extraer contenido del mensaje
    const content = event.content || '(vacío)';
    const conversationId = event.conversation_id;

    logger.info('===========================================');
    logger.info('PING HANDLER ACTIVADO!', {
      projectId,
      conversationId,
      contenido: content.substring(0, 100) // Primeros 100 chars
    });
    logger.info('===========================================');

    // Guardar contador en store
    const count = await store.increment('mensajes_recibidos');

    logger.info('ping.contador', {
      total_mensajes: count,
      timestamp: new Date().toISOString()
    });

    // Emitir evento de prueba
    emit('test.chat.received', {
      mensaje_numero: count,
      preview: content.substring(0, 50),
      conversationId
    });

    return { success: true, count };
  }
};
