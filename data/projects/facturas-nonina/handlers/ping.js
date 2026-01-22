/**
 * Handler de prueba - Ping
 *
 * Escucha: test.ping
 * Emite: test.pong
 *
 * Para probar desde el sistema:
 *   eventBus.publish('test.ping', { mensaje: 'hola' })
 */
module.exports = {
  name: 'ping',
  description: 'Handler de prueba - responde a ping con pong',
  trigger: 'test.ping',

  async handle(event, { services, logger, projectId, emit, config, store }) {
    logger.info('ping.received', {
      projectId,
      mensaje: event.mensaje || '(sin mensaje)'
    });

    // Guardar contador en store
    const count = await store.increment('ping_count');

    logger.info('ping.count', { total: count });

    // Emitir respuesta
    emit('test.pong', {
      respuesta: `Pong! Mensaje recibido: "${event.mensaje || ''}"`,
      ping_numero: count,
      timestamp: new Date().toISOString()
    });

    return { success: true, count };
  }
};
