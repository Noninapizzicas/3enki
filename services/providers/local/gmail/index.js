/**
 * Gmail Service - Servicio local para Gmail API
 *
 * Maneja OAuth2 con refresh automático de tokens.
 *
 * Variables de entorno requeridas:
 * - GMAIL_CLIENT_ID: OAuth2 Client ID
 * - GMAIL_CLIENT_SECRET: OAuth2 Client Secret
 * - GMAIL_REFRESH_TOKEN: OAuth2 Refresh Token
 *
 * @example
 * // Enviar correo
 * eventBus.publish('gmail.send.request', {
 *   to: 'destinatario@email.com',
 *   subject: 'Asunto',
 *   body: 'Contenido del correo'
 * });
 *
 * // Buscar correos
 * eventBus.publish('gmail.search.request', {
 *   query: 'from:cliente@empresa.com has:attachment'
 * });
 */

const https = require('https');

// Cache de access token
let accessTokenCache = {
  token: null,
  expiresAt: 0
};

/**
 * Obtiene un access token válido (con refresh automático)
 *
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  const now = Date.now();

  // Si el token aún es válido (con 5 min de margen), reutilizar
  if (accessTokenCache.token && accessTokenCache.expiresAt > now + 300000) {
    return accessTokenCache.token;
  }

  // Obtener nuevo token
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail credentials not configured. Required: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN');
  }

  const response = await httpRequest({
    method: 'POST',
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });

  if (response.error) {
    throw new Error(`OAuth2 error: ${response.error_description || response.error}`);
  }

  // Guardar en cache
  accessTokenCache = {
    token: response.access_token,
    expiresAt: now + (response.expires_in * 1000)
  };

  return accessTokenCache.token;
}

/**
 * Hace una petición HTTP
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
function httpRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: options.hostname,
      port: 443,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error?.message || JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Hace una petición a Gmail API
 *
 * @param {string} method - HTTP method
 * @param {string} endpoint - Endpoint (sin base URL)
 * @param {Object} body - Body opcional
 * @param {Object} query - Query params opcionales
 * @returns {Promise<Object>}
 */
async function gmailRequest(method, endpoint, body = null, query = {}) {
  const token = await getAccessToken();

  let path = `/gmail/v1/users/me${endpoint}`;

  // Agregar query params
  const queryString = new URLSearchParams(query).toString();
  if (queryString) {
    path += `?${queryString}`;
  }

  const options = {
    method,
    hostname: 'gmail.googleapis.com',
    path,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return httpRequest(options);
}

/**
 * Codifica string a base64url (RFC 4648)
 *
 * @param {string} str
 * @returns {string}
 */
function base64urlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodifica base64url a string
 *
 * @param {string} str
 * @returns {string}
 */
function base64urlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Construye un mensaje MIME
 *
 * @param {Object} options
 * @returns {string}
 */
function buildMimeMessage({ to, subject, body, html = false, cc, bcc, attachments = [], from }) {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2)}`;
  const hasAttachments = attachments.length > 0;

  let message = '';

  // Headers
  if (from) message += `From: ${from}\r\n`;
  message += `To: ${Array.isArray(to) ? to.join(', ') : to}\r\n`;
  if (cc) message += `Cc: ${Array.isArray(cc) ? cc.join(', ') : cc}\r\n`;
  if (bcc) message += `Bcc: ${Array.isArray(bcc) ? bcc.join(', ') : bcc}\r\n`;
  message += `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\n`;
  message += 'MIME-Version: 1.0\r\n';

  if (hasAttachments) {
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

    // Body part
    message += `--${boundary}\r\n`;
    message += `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset="UTF-8"\r\n`;
    message += 'Content-Transfer-Encoding: base64\r\n\r\n';
    message += Buffer.from(body).toString('base64') + '\r\n';

    // Attachments
    for (const att of attachments) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: ${att.mimeType || 'application/octet-stream'}; name="${att.filename}"\r\n`;
      message += 'Content-Transfer-Encoding: base64\r\n';
      message += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`;
      message += att.content + '\r\n';
    }

    message += `--${boundary}--`;
  } else {
    message += `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset="UTF-8"\r\n`;
    message += 'Content-Transfer-Encoding: base64\r\n\r\n';
    message += Buffer.from(body).toString('base64');
  }

  return message;
}

/**
 * Extrae headers de un mensaje
 *
 * @param {Object} message
 * @returns {Object}
 */
function extractHeaders(message) {
  const headers = {};
  const payload = message.payload || {};

  for (const header of (payload.headers || [])) {
    headers[header.name.toLowerCase()] = header.value;
  }

  return headers;
}

/**
 * Extrae el body de un mensaje
 *
 * @param {Object} payload
 * @returns {string}
 */
function extractBody(payload) {
  if (!payload) return '';

  // Body directo
  if (payload.body?.data) {
    return base64urlDecode(payload.body.data);
  }

  // Multipart - buscar text/plain o text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return base64urlDecode(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return base64urlDecode(part.body.data);
      }
    }
    // Recursivo para nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const body = extractBody(part);
        if (body) return body;
      }
    }
  }

  return '';
}

/**
 * Extrae información de adjuntos
 *
 * @param {Object} payload
 * @returns {Array}
 */
function extractAttachments(payload) {
  const attachments = [];

  function scanParts(parts) {
    for (const part of (parts || [])) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size || 0
        });
      }
      if (part.parts) {
        scanParts(part.parts);
      }
    }
  }

  scanParts(payload?.parts);
  return attachments;
}

// ============================================================================
// FUNCIONES EXPORTADAS
// ============================================================================

module.exports = {
  name: 'local.gmail',
  description: 'Gmail API - Envío y lectura de correos con OAuth2',

  functions: {
    send: {
      event: 'gmail.send.request',
      description: 'Enviar correo electrónico',
      input: {
        to: { type: 'string|array', description: 'Destinatario(s)', required: true },
        subject: { type: 'string', description: 'Asunto', required: true },
        body: { type: 'string', description: 'Contenido (texto o HTML)', required: true },
        html: { type: 'boolean', description: 'Si body es HTML', default: false },
        cc: { type: 'array', description: 'Copia' },
        bcc: { type: 'array', description: 'Copia oculta' },
        attachments: {
          type: 'array',
          description: 'Adjuntos [{filename, content (base64), mimeType}]'
        }
      },
      output: {
        messageId: { type: 'string', description: 'ID del mensaje enviado' },
        threadId: { type: 'string', description: 'ID del hilo' }
      }
    },

    list: {
      event: 'gmail.list.request',
      description: 'Listar correos',
      input: {
        maxResults: { type: 'number', description: 'Máximo de resultados', default: 10 },
        labelIds: { type: 'array', description: 'Labels (INBOX, SENT, etc.)' },
        pageToken: { type: 'string', description: 'Token de paginación' }
      },
      output: {
        messages: { type: 'array', description: 'Lista de {id, threadId}' },
        nextPageToken: { type: 'string', description: 'Token siguiente página' },
        resultSizeEstimate: { type: 'number', description: 'Estimado de resultados' }
      }
    },

    read: {
      event: 'gmail.read.request',
      description: 'Leer un correo específico',
      input: {
        messageId: { type: 'string', description: 'ID del mensaje', required: true },
        format: { type: 'string', enum: ['full', 'metadata', 'minimal'], default: 'full' }
      },
      output: {
        id: { type: 'string' },
        threadId: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'array' },
        subject: { type: 'string' },
        date: { type: 'string' },
        body: { type: 'string' },
        attachments: { type: 'array' }
      }
    },

    search: {
      event: 'gmail.search.request',
      description: 'Buscar correos con query estilo Gmail',
      input: {
        query: { type: 'string', description: 'Query (from:x subject:y)', required: true },
        maxResults: { type: 'number', default: 10 },
        pageToken: { type: 'string' }
      },
      output: {
        messages: { type: 'array', description: 'Lista de {id, threadId, snippet}' },
        nextPageToken: { type: 'string' }
      }
    },

    'attachments.download': {
      event: 'gmail.attachments.download.request',
      description: 'Descargar adjunto de un correo',
      input: {
        messageId: { type: 'string', required: true },
        attachmentId: { type: 'string', required: true }
      },
      output: {
        content: { type: 'string', description: 'Contenido en base64' },
        size: { type: 'number' }
      }
    }
  },

  // ============================================================================
  // IMPLEMENTACIONES
  // ============================================================================

  /**
   * Enviar correo
   */
  async send({ to, subject, body, html = false, cc, bcc, attachments = [] }) {
    const mimeMessage = buildMimeMessage({ to, subject, body, html, cc, bcc, attachments });
    const encodedMessage = base64urlEncode(mimeMessage);

    const response = await gmailRequest('POST', '/messages/send', {
      raw: encodedMessage
    });

    return {
      messageId: response.id,
      threadId: response.threadId
    };
  },

  /**
   * Listar correos
   */
  async list({ maxResults = 10, labelIds, pageToken }) {
    const query = { maxResults };
    if (labelIds?.length) query.labelIds = labelIds.join(',');
    if (pageToken) query.pageToken = pageToken;

    const response = await gmailRequest('GET', '/messages', null, query);

    return {
      messages: response.messages || [],
      nextPageToken: response.nextPageToken || null,
      resultSizeEstimate: response.resultSizeEstimate || 0
    };
  },

  /**
   * Leer un correo
   */
  async read({ messageId, format = 'full' }) {
    const response = await gmailRequest('GET', `/messages/${messageId}`, null, { format });

    const headers = extractHeaders(response);

    return {
      id: response.id,
      threadId: response.threadId,
      from: headers.from || '',
      to: (headers.to || '').split(',').map(s => s.trim()).filter(Boolean),
      subject: headers.subject || '',
      date: headers.date || '',
      body: extractBody(response.payload),
      snippet: response.snippet || '',
      labelIds: response.labelIds || [],
      attachments: extractAttachments(response.payload)
    };
  },

  /**
   * Buscar correos
   */
  async search({ query, maxResults = 10, pageToken }) {
    const params = { q: query, maxResults };
    if (pageToken) params.pageToken = pageToken;

    const response = await gmailRequest('GET', '/messages', null, params);

    // Obtener snippets de cada mensaje
    const messages = [];
    for (const msg of (response.messages || [])) {
      try {
        const details = await gmailRequest('GET', `/messages/${msg.id}`, null, { format: 'metadata' });
        const headers = extractHeaders(details);
        messages.push({
          id: msg.id,
          threadId: msg.threadId,
          snippet: details.snippet || '',
          from: headers.from || '',
          subject: headers.subject || '',
          date: headers.date || ''
        });
      } catch (e) {
        messages.push({
          id: msg.id,
          threadId: msg.threadId,
          snippet: '',
          error: e.message
        });
      }
    }

    return {
      messages,
      nextPageToken: response.nextPageToken || null
    };
  },

  /**
   * Descargar adjunto
   */
  async 'attachments.download'({ messageId, attachmentId }) {
    const response = await gmailRequest('GET', `/messages/${messageId}/attachments/${attachmentId}`);

    return {
      content: response.data,
      size: response.size || 0
    };
  }
};
