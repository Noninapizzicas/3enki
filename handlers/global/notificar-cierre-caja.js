/**
 * Handler: Notificar cierre de caja
 *
 * Cuando se cierra la caja, envía el informe detallado por
 * Telegram, WhatsApp y/o Email según la configuración del proyecto.
 *
 * ENTRADA: caja.cerrada
 * SALIDA:
 *   - telegram.send_message.request (si hay config telegram)
 *   - local.whatsapp.send.request (si hay config whatsapp)
 *   - local.gmail.send.request (si hay config email)
 *
 * Busca config en orden de prioridad (Telegram):
 *
 * 1. credential-manager (process.env): TELEGRAM_CHAT_ID_PROJECT_{projectId} + TELEGRAM_BOT_NAME_PROJECT_{projectId}
 * 2. Sección dedicada (en project.json o notificaciones.json del proyecto):
 *    notificaciones.cierre_caja.telegram = { chatId, botName }
 * 3. Config raíz del proyecto (project.json):
 *    telegram = { botName, chatId }
 * 4. credential-manager (process.env): TELEGRAM_CHAT_ID_GLOBAL + TELEGRAM_BOT_NAME_GLOBAL
 * 5. Config global: telegram = { botName, chatId }
 *
 * Para email/whatsapp:
 *    notificaciones.cierre_caja.email    = { to, account }
 *    notificaciones.cierre_caja.whatsapp = { to }
 *
 * IMPORTANTE: Este handler es global, así que NO recibe la config del
 * proyecto automáticamente. Lee la config del proyecto usando el
 * project_id que viene en el evento caja.cerrada.
 *
 * @version 3.0.0
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'notificar-cierre-caja',
  description: 'Envía informe de cierre de caja por Telegram/WhatsApp/Email',
  trigger: 'caja.cerrada',
  enabled: true,

  async handle(event, { logger, emit, config: globalConfig }) {
    const data = event.data || event;
    const { fecha, informe, cierre, project_id } = data;

    if (!informe) {
      logger.warn('notificar-cierre-caja.sin-informe', { fecha });
      return { success: false, reason: 'sin informe' };
    }

    // Cargar config del proyecto (si hay project_id)
    const projectConfig = project_id
      ? cargarConfigProyecto(project_id, logger)
      : {};

    // Merge: project config tiene prioridad sobre global config
    const config = { ...globalConfig, ...projectConfig };

    // Resolver destinos de notificación:
    //   1. Sección dedicada: notificaciones.cierre_caja
    //   2. Fallback: config raíz (telegram, gmail)
    const destinos = resolverDestinos(config, project_id);

    logger.info('notificar-cierre-caja.destinos', {
      fecha,
      project_id: project_id || 'global',
      telegram: !!destinos.telegram,
      whatsapp: !!destinos.whatsapp,
      email: !!destinos.email
    });

    let enviado = false;

    // --- Telegram ---
    if (destinos.telegram?.chatId && destinos.telegram?.botName) {
      const { chatId, botName } = destinos.telegram;
      logger.info('notificar-cierre-caja.telegram.enviando', { chatId, botName, fecha });

      // Telegram tiene límite de 4096 chars por mensaje
      const partes = dividirMensaje(informe, 4000);
      for (const parte of partes) {
        emit('telegram.send_message.request', {
          botName,
          chatId,
          text: parte
        });
      }
      enviado = true;
    }

    // --- WhatsApp ---
    if (destinos.whatsapp?.to) {
      logger.info('notificar-cierre-caja.whatsapp.enviando', { to: destinos.whatsapp.to, fecha });

      emit('local.whatsapp.send.request', {
        to: destinos.whatsapp.to,
        type: 'text',
        text: informe
      });
      enviado = true;
    }

    // --- Email (Gmail) ---
    if (destinos.email?.to) {
      const { to, account } = destinos.email;
      const projectName = config?.project?.name || config?.name || project_id || 'Sistema';
      const subject = `Cierre de caja - ${fecha} - ${projectName}`;

      const htmlBody = generarInformeHTML(informe, cierre);

      logger.info('notificar-cierre-caja.email.enviando', { to, account: account || 'default', fecha });

      emit('local.gmail.send.request', {
        account: account || undefined,
        to,
        subject,
        body: htmlBody,
        html: true
      });
      enviado = true;
    }

    if (!enviado) {
      logger.warn('notificar-cierre-caja.sin-destinos', {
        fecha,
        project_id: project_id || 'global',
        hint: 'Configura notificaciones en data/projects/{id}/config/project.json'
      });
    }

    return { success: enviado, enviado, fecha, project_id };
  }
};

/**
 * Carga la config del proyecto leyendo todos los .json de su directorio config/.
 * Devuelve un objeto con cada archivo como clave (ej: { project: {...}, notificaciones: {...} }).
 */
function cargarConfigProyecto(projectId, logger) {
  const configDir = path.join(process.cwd(), 'data', 'projects', projectId, 'config');
  const config = {};

  try {
    if (!fs.existsSync(configDir)) {
      logger.debug('notificar-cierre-caja.config.no-dir', { projectId, configDir });
      return config;
    }

    const files = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(configDir, file), 'utf-8');
        const name = file.replace('.json', '');
        config[name] = JSON.parse(content);
      } catch (error) {
        logger.warn('notificar-cierre-caja.config.file.error', {
          projectId,
          file,
          error: error.message
        });
      }
    }

    logger.debug('notificar-cierre-caja.config.loaded', {
      projectId,
      files: Object.keys(config)
    });
  } catch (error) {
    logger.warn('notificar-cierre-caja.config.error', {
      projectId,
      error: error.message
    });
  }

  return config;
}

/**
 * Resuelve los destinos de notificación buscando en orden de prioridad:
 *
 * Telegram:
 *   1. credential-manager: TELEGRAM_CHAT_ID_PROJECT_{projectId} (process.env)
 *   2. config.notificaciones.cierre_caja.telegram (sección dedicada JSON)
 *   3. config.project.telegram (raíz del project.json)
 *   4. credential-manager: TELEGRAM_CHAT_ID_GLOBAL (process.env)
 *   5. config.telegram (config global)
 *
 * WhatsApp / Email: igual que antes (solo desde sección dedicada o config raíz)
 */
function resolverDestinos(config, projectId) {
  // Intentar sección dedicada (archivo notificaciones.json o dentro de project.json)
  const dedicada =
    config?.notificaciones?.cierre_caja ||
    config?.project?.notificaciones?.cierre_caja ||
    {};

  const destinos = {};

  // Telegram: credential-manager PROJECT > dedicada JSON > config raíz > credential-manager GLOBAL > config global
  const envChatIdProject = projectId ? process.env[`TELEGRAM_CHAT_ID_PROJECT_${projectId}`] : null;
  const envBotNameProject = projectId ? process.env[`TELEGRAM_BOT_NAME_PROJECT_${projectId}`] : null;

  if (envChatIdProject && envBotNameProject) {
    // Prioridad 1: credential-manager a nivel PROJECT
    destinos.telegram = { chatId: envChatIdProject, botName: envBotNameProject };
  } else if (dedicada.telegram?.chatId) {
    // Prioridad 2: sección dedicada en JSON
    destinos.telegram = {
      chatId: dedicada.telegram.chatId,
      botName: dedicada.telegram.botName || config?.project?.telegram?.botName || config?.telegram?.botName
    };
  } else {
    // Prioridad 3: config raíz del proyecto JSON
    const tg = config?.project?.telegram || config?.telegram;
    if (tg?.chatId && tg?.botName) {
      destinos.telegram = { chatId: tg.chatId, botName: tg.botName };
    }
  }

  // Fallback final: credential-manager GLOBAL (si no se resolvió por ningún otro medio)
  if (!destinos.telegram) {
    const envChatIdGlobal = process.env.TELEGRAM_CHAT_ID_GLOBAL;
    const envBotNameGlobal = process.env.TELEGRAM_BOT_NAME_GLOBAL;
    if (envChatIdGlobal && envBotNameGlobal) {
      destinos.telegram = { chatId: envChatIdGlobal, botName: envBotNameGlobal };
    }
  }

  // WhatsApp: solo desde sección dedicada
  if (dedicada.whatsapp?.to) {
    destinos.whatsapp = { to: dedicada.whatsapp.to };
  }

  // Email: dedicada > fallback gmail account
  if (dedicada.email?.to) {
    destinos.email = {
      to: dedicada.email.to,
      account: dedicada.email.account || config?.project?.gmail?.account || config?.gmail?.account
    };
  }

  return destinos;
}

/**
 * Divide un mensaje largo en partes respetando saltos de línea.
 */
function dividirMensaje(texto, maxLen) {
  if (texto.length <= maxLen) return [texto];

  const partes = [];
  let restante = texto;

  while (restante.length > 0) {
    if (restante.length <= maxLen) {
      partes.push(restante);
      break;
    }

    // Buscar último salto de línea antes del límite
    let corte = restante.lastIndexOf('\n', maxLen);
    if (corte <= 0) corte = maxLen;

    partes.push(restante.slice(0, corte));
    restante = restante.slice(corte).replace(/^\n/, '');
  }

  return partes;
}

/**
 * Convierte el informe de texto plano a HTML para email.
 */
function generarInformeHTML(informe, cierre) {
  const estado = cierre?.estado || 'desconocido';
  const estadoColor = estado === 'cuadrado' ? '#27ae60' : estado === 'sobrante' ? '#f39c12' : '#e74c3c';

  // Escapar HTML y convertir formato
  const contenido = informe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/━/g, '&mdash;')
    .replace(/─/g, '&ndash;');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Courier New', monospace; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px; border-left: 4px solid ${estadoColor};">
    <pre style="white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 1.5; margin: 0;">${contenido}</pre>
  </div>
</body>
</html>`;
}
