/**
 * Handler Global: Revisar Gmail
 *
 * Escucha: gmail.check (activado por scheduler)
 * Emite: gmail.file.stored (mismo patrón que bot.file.stored)
 *
 * Descarga adjuntos a: /data/gmail/{cuenta}/
 *
 * Configuración esperada en config.json:
 * {
 *   "gmail": {
 *     "cuentas": {
 *       "facturas": {
 *         "account": "facturas@asesoria.com",
 *         "query": "has:attachment is:unread",
 *         "enabled": true
 *       }
 *     }
 *   }
 * }
 */
const path = require('path');
const fs = require('fs');

module.exports = {
  name: 'revisar-gmail',
  description: 'Revisa correos de Gmail y descarga adjuntos',
  trigger: 'gmail.check',

  async handle(event, { services, logger, emit, config, store }) {
    const data = event.data || event;

    // Configuración de cuentas Gmail
    const gmailConfig = config.gmail?.cuentas || {};
    const cuentas = Object.entries(gmailConfig).filter(([_, c]) => c.enabled !== false);

    if (cuentas.length === 0) {
      logger.debug('revisar-gmail.sin-cuentas', { mensaje: 'No hay cuentas Gmail configuradas' });
      return { success: true, mensaje: 'Sin cuentas configuradas' };
    }

    logger.info('revisar-gmail.iniciando', { cuentas: cuentas.length });

    let totalAdjuntos = 0;

    for (const [nombreCuenta, configCuenta] of cuentas) {
      try {
        const { account, query = 'has:attachment is:unread' } = configCuenta;

        logger.info('revisar-gmail.cuenta', { cuenta: nombreCuenta, account, query });

        // 1. Buscar correos con adjuntos
        const busqueda = await services.call('local.gmail', 'search', {
          account,
          query,
          maxResults: 10
        });

        if (!busqueda.messages || busqueda.messages.length === 0) {
          logger.debug('revisar-gmail.sin-correos', { cuenta: nombreCuenta });
          continue;
        }

        logger.info('revisar-gmail.correos-encontrados', {
          cuenta: nombreCuenta,
          cantidad: busqueda.messages.length
        });

        // 2. Procesar cada correo
        for (const msg of busqueda.messages) {
          try {
            // Leer correo completo
            const correo = await services.call('local.gmail', 'read', {
              account,
              messageId: msg.id,
              format: 'full'
            });

            if (!correo.attachments || correo.attachments.length === 0) {
              continue;
            }

            // 3. Descargar cada adjunto
            for (const adj of correo.attachments) {
              try {
                // Descargar contenido
                const descarga = await services.call('local.gmail', 'attachments.download', {
                  account,
                  messageId: msg.id,
                  attachmentId: adj.attachmentId
                });

                // Generar nombre con fecha
                const ahora = new Date();
                const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
                const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');
                const extension = path.extname(adj.filename) || '';
                const nombreBase = path.basename(adj.filename, extension);
                const nuevoNombre = `${fecha}-${hora}_${nombreBase}${extension}`;

                // Ruta destino
                const dirDestino = `./data/gmail/${nombreCuenta}`;
                const rutaDestino = path.join(dirDestino, nuevoNombre);

                // Crear directorio si no existe
                if (!fs.existsSync(dirDestino)) {
                  fs.mkdirSync(dirDestino, { recursive: true });
                }

                // Guardar archivo
                fs.writeFileSync(rutaDestino, Buffer.from(descarga.content, 'base64'));

                totalAdjuntos++;

                logger.info('revisar-gmail.adjunto-guardado', {
                  cuenta: nombreCuenta,
                  archivo: nuevoNombre,
                  size: adj.size,
                  from: correo.from
                });

                // Emitir evento (mismo patrón que bot.file.stored)
                emit('gmail.file.stored', {
                  account: nombreCuenta,
                  email: account,
                  messageId: msg.id,
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

              } catch (adjError) {
                logger.error('revisar-gmail.adjunto-error', {
                  cuenta: nombreCuenta,
                  archivo: adj.filename,
                  error: adjError.message
                });
              }
            }

          } catch (correoError) {
            logger.error('revisar-gmail.correo-error', {
              cuenta: nombreCuenta,
              messageId: msg.id,
              error: correoError.message
            });
          }
        }

      } catch (cuentaError) {
        logger.error('revisar-gmail.cuenta-error', {
          cuenta: nombreCuenta,
          error: cuentaError.message
        });
      }
    }

    // Actualizar contador global
    if (totalAdjuntos > 0) {
      const total = await store.increment('adjuntos_descargados', totalAdjuntos);
      logger.info('revisar-gmail.completado', {
        adjuntosNuevos: totalAdjuntos,
        totalHistorico: total
      });
    }

    return { success: true, adjuntos: totalAdjuntos };
  }
};
