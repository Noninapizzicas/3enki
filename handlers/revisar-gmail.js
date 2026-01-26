/**
 * Handler Global: Revisar Gmail
 *
 * Escucha: gmail.check (activado por scheduler)
 * Emite: gmail.message.found (por cada correo con adjuntos)
 *
 * Solo busca correos. El siguiente handler se encarga de descargar.
 */
module.exports = {
  name: 'revisar-gmail',
  description: 'Busca correos con adjuntos en Gmail',
  trigger: 'gmail.check',

  async handle(event, { services, logger, emit, config }) {
    const data = event.data || event;

    // Permite filtrar cuenta específica si se pasa en el evento
    const cuentaFiltro = data.account || null;

    const gmailConfig = config.gmail?.cuentas || {};
    const cuentas = Object.entries(gmailConfig).filter(([nombre, c]) =>
      c.enabled !== false && (!cuentaFiltro || nombre === cuentaFiltro)
    );

    if (cuentas.length === 0) {
      logger.debug('revisar-gmail.sin-cuentas');
      return { success: true, correos: 0 };
    }

    let totalCorreos = 0;

    for (const [nombreCuenta, configCuenta] of cuentas) {
      const { account, email, query = 'has:attachment is:unread' } = configCuenta;

      // Buscar correos
      const busqueda = await services.call('local.gmail', 'search', {
        account,
        query,
        maxResults: 10
      });

      // Los mensajes están en busqueda.data.messages
      const messages = busqueda.data?.messages || busqueda.messages || [];

      logger.info('revisar-gmail.busqueda', {
        cuenta: nombreCuenta,
        query,
        mensajes: messages.length
      });

      if (!messages.length) continue;

      // Emitir evento por cada correo encontrado
      for (const msg of messages) {
        totalCorreos++;
        emit('gmail.message.found', {
          account: nombreCuenta,
          email: email || `${account}@gmail.com`,
          messageId: msg.id,
          threadId: msg.threadId
        });
      }

      logger.info('revisar-gmail.encontrados', {
        cuenta: nombreCuenta,
        correos: messages.length
      });
    }

    // Notificar por Telegram si se solicitó
    if (data.notifyTelegram && data.botName && data.chatId) {
      emit('telegram.send_message.request', {
        botName: data.botName,
        chatId: data.chatId,
        text: `📧 Gmail revisado:\n- Correos encontrados: ${totalCorreos}`
      });
    }

    return { success: true, correos: totalCorreos };
  }
};
