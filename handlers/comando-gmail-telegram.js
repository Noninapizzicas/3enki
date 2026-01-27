/**
 * Handler: Comando /gmail de Telegram
 *
 * Escucha: telegram.command.received
 * Emite: gmail.check
 *
 * Formatos soportados:
 *   /gmail cuenta        - Revisa cuenta específica
 *   /gmailcuenta         - Atajo: extrae cuenta del comando
 *   /gmail               - Error: requiere cuenta
 */

module.exports = {
  name: 'comando-gmail-telegram',
  description: 'Comando /gmail para revisar correos manualmente',
  trigger: 'telegram.command.received',

  filter: (event) => {
    const data = event.data || event;
    const cmd = data.command || '';
    // Acepta: gmail, gmailnonina, gmailcualquiercuenta
    return cmd === 'gmail' || cmd.startsWith('gmail');
  },

  async handle(event, { emit, logger }) {
    const data = event.data || event;
    const { botName, chatId, from, args = [], command } = data;

    logger.info('comando-gmail.ejecutando', {
      botName,
      chatId,
      command,
      from: from?.username || from?.firstName,
      args
    });

    // Determinar cuenta:
    // 1. Si comando es "gmailnonina" → cuenta = "nonina" (quitar prefijo "gmail")
    // 2. Si comando es "gmail" y hay args → cuenta = args[0]
    // 3. Si no hay cuenta → error
    let account = null;

    if (command && command !== 'gmail' && command.startsWith('gmail')) {
      // Formato: /gmailcuenta → extraer cuenta
      account = command.substring(5); // quitar "gmail" del inicio
    } else if (args.length > 0) {
      // Formato: /gmail cuenta
      account = args[0].toLowerCase().trim();
    }

    if (!account) {
      emit('telegram.send_message.request', {
        botName,
        chatId,
        text: '❌ Uso: /gmail <cuenta> o /gmail<cuenta>\nEjemplo: /gmail noninapizzicas o /gmailnoninapizzicas'
      });
      return { error: 'Cuenta requerida' };
    }

    // Notificar inicio
    emit('telegram.send_message.request', {
      botName,
      chatId,
      text: `📧 Revisando Gmail...\n📁 Cuenta: ${account}`
    });

    // Disparar revisión de Gmail
    emit('gmail.check', {
      account,
      notifyTelegram: true,
      botName,
      chatId
    });

    return { triggered: true, account };
  }
};
