/**
 * Handler: Comando /correo
 *
 * Escucha mensajes del chat y si es "/correo" dispara gmail.check
 */

module.exports = {
  name: 'comando-correo',
  description: 'Comando /correo para revisar Gmail manualmente',
  trigger: 'chat.send.request',

  filter(event) {
    const data = event.data || event;
    const texto = data.text || data.message || '';
    return texto.trim().toLowerCase() === '/correo';
  },

  async handle(event, { emit, logger }) {
    logger.info('comando-correo.ejecutando');

    emit('gmail.check', {
      manual: true,
      source: 'chat-command'
    });

    return { success: true, triggered: 'gmail.check' };
  }
};
