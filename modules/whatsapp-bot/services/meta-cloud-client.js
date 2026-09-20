'use strict';

class MetaCloudClient {
  constructor(opts = {}) {
    this.apiBase = opts.apiBase || 'https://graph.facebook.com';
    this.apiVersion = opts.apiVersion || 'v21.0';
    this.timeoutMs = opts.timeoutMs || 8000;
    this.fetchImpl = opts.fetchImpl || globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('MetaCloudClient: no fetch implementation available (node 18+ required or pass opts.fetchImpl)');
    }
  }

  async sendText({ phoneNumberId, accessToken, to, text }) {
    if (!phoneNumberId) throw _err('INVALID_INPUT', 'phoneNumberId is required');
    if (!accessToken) throw _err('AUTHENTICATION_REQUIRED', 'accessToken is required');
    if (!to) throw _err('INVALID_INPUT', 'to is required');
    if (!text) throw _err('INVALID_INPUT', 'text is required');

    return this._postMessage(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: false }
    });
  }

  // Mensaje de PLANTILLA (template). Es la UNICA forma de escribir al cliente FUERA de la
  // ventana de 24h (re-engagement). La plantilla debe estar aprobada por Meta. `bodyParams`
  // rellena las variables {{1}},{{2}}... del cuerpo en orden; `components` permite pasar la
  // estructura completa de Meta (header/body/button) cuando se necesita algo mas que el cuerpo.
  async sendTemplate({ phoneNumberId, accessToken, to, template, languageCode = 'es', bodyParams, components }) {
    if (!phoneNumberId) throw _err('INVALID_INPUT', 'phoneNumberId is required');
    if (!accessToken) throw _err('AUTHENTICATION_REQUIRED', 'accessToken is required');
    if (!to) throw _err('INVALID_INPUT', 'to is required');
    if (!template) throw _err('INVALID_INPUT', 'template (name) is required');

    const tpl = { name: template, language: { code: languageCode } };
    let comps = components;
    if (!comps && Array.isArray(bodyParams) && bodyParams.length > 0) {
      comps = [{
        type: 'body',
        parameters: bodyParams.map(p => ({ type: 'text', text: String(p) }))
      }];
    }
    if (Array.isArray(comps) && comps.length > 0) tpl.components = comps;

    return this._postMessage(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: tpl
    });
  }

  // Media outbound por link (URL pública del media). Tipos: image | video | audio | document.
  // Meta descarga la URL en su red al enviar; el link debe ser públicamente accesible.
  // Para document, filename es obligatorio (es lo que ve el receptor como nombre del archivo).
  async sendMedia({ phoneNumberId, accessToken, to, type, link, filename, caption, mime_type }) {
    if (!phoneNumberId) throw _err('INVALID_INPUT', 'phoneNumberId is required');
    if (!accessToken) throw _err('AUTHENTICATION_REQUIRED', 'accessToken is required');
    if (!to) throw _err('INVALID_INPUT', 'to is required');
    const tipos = ['image', 'video', 'audio', 'document'];
    if (!tipos.includes(type)) throw _err('INVALID_INPUT', `type debe ser uno de: ${tipos.join(', ')}`);
    if (!link) throw _err('INVALID_INPUT', 'link (URL pública del media) is required');

    const mediaObj = { link };
    if (type === 'document') {
      if (!filename) throw _err('INVALID_INPUT', 'filename es requerido para document');
      mediaObj.filename = filename;
      if (caption) mediaObj.caption = caption;
      if (mime_type) mediaObj.mime_type = mime_type;
    } else if (type === 'image' || type === 'video') {
      if (caption) mediaObj.caption = caption;
    }

    return this._postMessage(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type,
      [type]: mediaObj
    });
  }

  // Ubicación outbound. Envía un punto del mapa: longitude+latitude obligatorios,
  // name/address opcionales (se muestran sobre el pin en el chat del cliente).
  async sendLocation({ phoneNumberId, accessToken, to, longitude, latitude, name, address }) {
    if (!phoneNumberId) throw _err('INVALID_INPUT', 'phoneNumberId is required');
    if (!accessToken) throw _err('AUTHENTICATION_REQUIRED', 'accessToken is required');
    if (!to) throw _err('INVALID_INPUT', 'to is required');
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      throw _err('INVALID_INPUT', 'longitude y latitude deben ser números');
    }

    const location = { longitude, latitude };
    if (name) location.name = name;
    if (address) location.address = address;

    return this._postMessage(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'location',
      location
    });
  }

  // POST /{phone_number_id}/messages compartido por sendText/sendTemplate: fetch con timeout,
  // mapeo de status HTTP a codigos canonicos, y extraccion de messages[0].id.
  async _postMessage(phoneNumberId, accessToken, body) {
    const url = `${this.apiBase}/${this.apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw _err('UPSTREAM_TIMEOUT', `Meta API timeout after ${this.timeoutMs}ms`);
      throw _err('UPSTREAM_UNREACHABLE', `Meta API fetch failed: ${e.message}`);
    } finally {
      clearTimeout(timer);
    }

    let json = null;
    try { json = await res.json(); } catch { json = null; }

    if (res.status === 401 || res.status === 403) {
      throw _err('AUTHENTICATION_REQUIRED', _metaErrorMessage(json) || 'Meta API auth failed', { httpStatus: res.status, raw: json });
    }
    if (res.status === 429) {
      throw _err('RATE_LIMITED', _metaErrorMessage(json) || 'Meta API rate limited', { httpStatus: res.status, raw: json });
    }
    if (res.status >= 500) {
      throw _err('UPSTREAM_UNREACHABLE', _metaErrorMessage(json) || `Meta API ${res.status}`, { httpStatus: res.status, raw: json });
    }
    if (res.status >= 400) {
      throw _err('UPSTREAM_INVALID_RESPONSE', _metaErrorMessage(json) || `Meta API ${res.status}`, { httpStatus: res.status, raw: json });
    }

    const messageId = json?.messages?.[0]?.id;
    if (!messageId) {
      throw _err('UPSTREAM_INVALID_RESPONSE', 'Meta API response missing messages[0].id', { raw: json });
    }
    return { messageId };
  }
}

function parseWebhookEvent(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const out = [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change.value || {};
      const metadata = value.metadata || {};
      const phone_number_id = metadata.phone_number_id || null;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        if (!msg || !msg.from || !msg.id) continue;
        const message_type = msg.type || 'unknown';
        let text = null;
        if (message_type === 'text' && msg.text && typeof msg.text.body === 'string') {
          text = msg.text.body;
        } else if (message_type === 'button' && msg.button && typeof msg.button.text === 'string') {
          text = msg.button.text;
        } else if (message_type === 'interactive') {
          const inter = msg.interactive || {};
          text = inter.button_reply?.title || inter.list_reply?.title || null;
        }
        // Media entrante. Meta manda el media en un subcampo con el nombre del tipo
        // (image/video/audio/document). Traen id + mime_type + sha256. El `id` sirve
        // para rescatar el media con una llamada a la Graph API (GET /{id}); NO se
        // descarga aquí — eso es decisión del módulo de negocio consumidor. audio y video
        // pueden traer además `link` si el webhook del WABA pidió la URL de descarga.
        // Solo los 4 tipos multimedia generan media: para text/button/interactive queda null.
        const MEDIA_TYPES = ['image', 'video', 'audio', 'document'];
        let media = null;
        if (MEDIA_TYPES.includes(message_type)) {
          const mediaCont = msg[message_type];
          if (mediaCont && typeof mediaCont === 'object') {
            media = {
              type: message_type,
              id: mediaCont.id || null,
              mime_type: mediaCont.mime_type || null,
              sha256: mediaCont.sha256 || null,
              link: mediaCont.link || null,
              filename: mediaCont.filename || null,
              caption: mediaCont.caption || null,
              duration: mediaCont.duration || null
            };
          }
        }
        // Ubicación entrante. El cliente comparte un punto del mapa (type:'location').
        // latitude/longitude son números; name/address opcionales. Se expone en el
        // evento whatsapp.mensaje.recibido para que el módulo de negocio decida qué usar.
        let location = null;
        if (message_type === 'location' && msg.location && typeof msg.location === 'object') {
          const lc = msg.location;
          location = {
            type: 'location',
            longitude: typeof lc.longitude === 'number' ? lc.longitude : null,
            latitude: typeof lc.latitude === 'number' ? lc.latitude : null,
            name: lc.name || null,
            address: lc.address || null
          };
        }
        const contact = contacts.find(c => c && c.wa_id === msg.from) || contacts[0] || null;
        out.push({
          phone_number_id,
          from: msg.from,
          message_id: msg.id,
          message_type,
          text,
          media,
          location,
          timestamp: msg.timestamp || null,
          contact_name: contact?.profile?.name || null
        });
      }
    }
  }
  return out;
}

function _metaErrorMessage(json) {
  if (!json || !json.error) return null;
  const e = json.error;
  return [e.code && `[${e.code}]`, e.type, e.message].filter(Boolean).join(' ').trim() || null;
}

function _err(code, message, details) {
  const err = new Error(message);
  err._code = code;
  if (details !== undefined) err._details = details;
  return err;
}

module.exports = {
  MetaCloudClient,
  parseWebhookEvent
};
