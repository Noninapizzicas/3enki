/**
 * Handler: Comando /debugmail
 *
 * Escucha mensajes del chat y si es "/debugmail" muestra último correo
 */

module.exports = {
  name: 'comando-debug-gmail',
  description: 'Comando /debugmail para ver último correo',
  trigger: 'chat.send.request',

  filter(event) {
    const data = event.data || event;
    const texto = data.content || data.text || data.message || '';
    return texto.trim().toLowerCase() === '/debugmail';
  },

  async handle(event, { emit, logger }) {
    logger.info('comando-debug-gmail.ejecutando');

    emit('gmail.debug', {
      manual: true,
      source: 'chat-command'
    });

    return { success: true, triggered: 'gmail.debug' };
  }
};
