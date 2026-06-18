'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
const { parsearPedido } = require('./services/pedido-parser');
const { MetaCloudClient, parseWebhookEvent } = require('./services/meta-cloud-client');

const ENV_TOKEN_PATTERN = /^META_WHATSAPP_API_KEY_PROJECT_(.+)$/;
const ENV_VERIFY_PATTERN = /^META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_(.+)$/;

class WhatsappBotModule extends BaseModule {
  constructor() {
    super();
    this.name = 'whatsapp-bot';
    this.version = '1.0.0';

    this.config = null;
    this.metaClient = null;
    // project_slug -> { phone_number_id, waba_id, display_number, webhook_path, pwa_url, telegram_chat_id, telegram_bot_name }
    this.projectsByMeta = new Map();
    // phone_number_id -> project_slug (reverse mapping)
    this.projectByPhoneId = new Map();
    // request_id -> { project_slug, from, message_id, items, total_centimos, palabra_clave, timeoutHandle, created_at }
    this.pendingPedidos = new Map();
    // pedido_id -> { project_slug, from, codigo_recogida } — para avisar al cliente cuando
    // cocina marque el pedido listo (cocina.pedido_listo NO arrastra el cliente_telefono).
    // Bounded (LRU simple) para no fugar memoria.
    this.pedidosListos = new Map();
    this.maxPedidosListos = 500;
  }

  _trackPedidoListo(pedido_id, project_slug, from, codigo_recogida) {
    if (!pedido_id) return;
    if (this.pedidosListos.has(pedido_id)) this.pedidosListos.delete(pedido_id);
    this.pedidosListos.set(pedido_id, { project_slug, from, codigo_recogida });
    while (this.pedidosListos.size > this.maxPedidosListos) {
      this.pedidosListos.delete(this.pedidosListos.keys().next().value);
    }
  }

  // ==========================================
  // Helpers de dominio (5to POC2 auxiliar)
  // ==========================================

  _maskPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string' || phone.length < 6) return '***';
    return phone.slice(0, 3) + '***' + phone.slice(-2);
  }

  _envTokenKey(slug)  { return `META_WHATSAPP_API_KEY_PROJECT_${slug}`; }
  _envVerifyKey(slug) { return `META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_${slug}`; }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    const moduleJson = JSON.parse(await fs.readFile(path.join(__dirname, 'module.json'), 'utf8'));
    this.config = moduleJson.config || {};

    // Transporte: 'openwa' (self-hosted, vía openwa-service por el bus) | 'meta' (Cloud API directa).
    // Default openwa: whatsapp-bot queda AGNÓSTICO al transporte (envía/recibe por eventos del bus).
    this.transport = this.config.transport || 'openwa';

    this.logger.info('module.loading', { module: this.name, version: this.version, transport: this.transport });

    this.metaClient = new MetaCloudClient({
      apiBase: this.config.meta_api_base,
      apiVersion: this.config.meta_api_version,
      timeoutMs: this.config.http_timeout_ms
    });

    await this._hidratarMappingProyectos();

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      projects_mapped: this.projectsByMeta.size,
      projects_operativos: this._contarProyectosOperativos()
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    for (const [, pending] of this.pendingPedidos) {
      if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
    }
    this.pendingPedidos.clear();
    this.projectsByMeta.clear();
    this.projectByPhoneId.clear();
    this.metaClient = null;
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus API (handlers de eventos)
  // ==========================================

  async onCredentialSaved(event) {
    const data = event?.data || event;
    const { provider, level, identifier } = data || {};
    if (level !== 'PROJECT') return;
    if (provider !== 'META_WHATSAPP' && provider !== 'META_WHATSAPP_VERIFY_TOKEN') return;
    this.logger.info('whatsapp-bot.credential.saved', { provider, identifier });
    if (identifier) await this._refrescarProyecto(identifier);
  }

  async onCredentialDeleted(event) {
    const data = event?.data || event;
    const key = data?.key;
    if (!key) return;
    const match = key.match(ENV_TOKEN_PATTERN) || key.match(ENV_VERIFY_PATTERN);
    if (!match) return;
    const slug = match[1];
    this.logger.warn('whatsapp-bot.credential.deleted', { project_slug: slug });
    await this._refrescarProyecto(slug);
  }

  async onPedidoCreado(event) {
    const data = event?.data || event;
    if (data?.tipo !== 'tienda') return;
    const cid = data?.correlation_id;
    if (!cid) return;
    const pending = this._consumePending(cid);
    if (!pending) return;

    this.logger.info('whatsapp-bot.pedido.creado_received', {
      pedido_id: data.pedido_id,
      project_slug: pending.project_slug,
      from: this._maskPhoneNumber(pending.from),
      codigo_recogida: data.codigo_recogida
    });
    this.metrics?.increment('whatsapp-bot.pedido.confirmado', { project: pending.project_slug });

    await this._confirmarPedidoCliente(pending, data);
    await this._notificarStaff(pending, data);
    // Recordar quién es el cliente para avisarle cuando cocina lo marque listo.
    this._trackPedidoListo(data.pedido_id, pending.project_slug, pending.from, data.codigo_recogida);
  }

  // Cocina marcó el pedido listo → avisa al CLIENTE por WhatsApp ("ven a recoger").
  // Solo reacciona a pedidos de tienda que nosotros registramos (lookup por pedido_id);
  // los del POS no están en el mapa → se ignoran.
  async onCocinaPedidoListo(event) {
    const data = event?.data || event;
    const pedido_id = data?.pedido_id;
    if (!pedido_id) return;
    const ref = this.pedidosListos.get(pedido_id);
    if (!ref) return;                          // no es un pedido de tienda nuestro
    this.pedidosListos.delete(pedido_id);
    const meta = this.projectsByMeta.get(ref.project_slug);
    const display = meta?.display_number ? `\nNumero del negocio: ${meta.display_number}` : '';
    const cod = ref.codigo_recogida ? ` Codigo: ${ref.codigo_recogida}.` : '';
    const msg = `¡Tu pedido ya está listo! 🎉 Puedes pasar a recogerlo.${cod} Al recoger te preguntaremos tu palabra clave y pagas en efectivo.${display}`;
    await this._enviarMensajeSeguro(ref.project_slug, ref.from, msg);
    this.metrics?.increment('whatsapp-bot.pedido.listo_notificado', { project: ref.project_slug });
  }

  // Mensaje entrante por el transporte del bus (openwa-service). Equivalente al webhook de Meta,
  // pero agnóstico: reusa el mismo despacho de pedidos. { project_slug, from, body, message_id }.
  async onWhatsappEntrante(event) {
    const d = event?.data || event;
    const from = d?.from;
    if (!from) return;
    const project_slug = d.project_slug || d.project || null;
    const msg = {
      phone_number_id: null,
      from,
      message_type: 'text',
      message_id: d.message_id || null,
      text: (d.body != null ? d.body : (d.text || ''))
    };
    this.metrics?.increment?.('whatsapp-bot.message.received', { transport: 'openwa' });
    await this._despacharEntrante(project_slug, msg);
  }

  async onPedidoCrearTiendaResponse(event) {
    const data = event?.data || event;
    // Success path lo lleva onPedidoCreado con shape mas rico. Aqui solo
    // procesamos el error path de la auto-wire del loader (request_id + error).
    if (!data?.error) return;
    const request_id = data?.request_id;
    if (!request_id) return;
    const pending = this._consumePending(request_id);
    if (!pending) return;
    this.logger.error('whatsapp-bot.pedido.crear_failed', {
      project_slug: pending.project_slug,
      from: this._maskPhoneNumber(pending.from),
      error: data.error
    });
    this.metrics?.increment('whatsapp-bot.pedido.fallido', { project: pending.project_slug });
    await this._enviarMensajeSeguro(pending.project_slug, pending.from,
      'Lo sentimos, no hemos podido procesar tu pedido. Vuelve a la PWA e intentalo de nuevo.');
  }

  // ==========================================
  // HTTP API
  // ==========================================

  // HTTP del gateway: el handler recibe un CONTEXTO ({params, query, body, headers}) y
  // DEVUELVE { status, body, headers } (NO hay `res` estilo Express). El gateway serializa.
  async handleWebhookVerify(req) {
    const json = (status, obj) => ({ status, body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json' } });
    try {
      const project_slug = req.params?.project;
      const mode = req.query?.['hub.mode'];
      const provided = req.query?.['hub.verify_token'];
      const challenge = req.query?.['hub.challenge'];

      if (!project_slug) return json(400, { error: { code: 'INVALID_INPUT', message: 'project param required' } });
      if (mode !== 'subscribe') return json(400, { error: { code: 'INVALID_INPUT', message: 'hub.mode must be subscribe' } });
      const expected = process.env[this._envVerifyKey(project_slug)];
      if (!expected) {
        this.logger.warn('whatsapp-bot.webhook.verify.no_credential', { project_slug });
        return json(404, { error: { code: 'RESOURCE_NOT_FOUND', message: 'verify_token not configured for project' } });
      }
      if (provided !== expected) {
        this.logger.warn('whatsapp-bot.webhook.verify.token_mismatch', { project_slug });
        return json(403, { error: { code: 'PERMISSION_DENIED', message: 'verify_token mismatch' } });
      }
      this.logger.info('whatsapp-bot.webhook.verified', { project_slug });
      this.metrics?.increment('whatsapp-bot.webhook.verified', { project: project_slug });
      // Meta espera el hub.challenge en texto plano.
      return { status: 200, body: String(challenge || ''), headers: { 'Content-Type': 'text/plain' } };
    } catch (err) {
      this.logger.error('whatsapp-bot.webhook.verify.error', { error: err.message });
      return json(500, { error: { code: 'UNKNOWN_ERROR', message: 'verify failed' } });
    }
  }

  async handleWebhookEvent(req) {
    const project_slug = req.params?.project;
    // Procesa cada mensaje SIN bloquear el 200 (Meta exige respuesta rápida; el gateway
    // espera el retorno, así que disparamos el procesado fire-and-forget y devolvemos ya).
    try {
      const messages = parseWebhookEvent(req.body);
      for (const msg of messages) {
        this._procesarMensajeMeta(project_slug, msg).catch(innerErr =>
          this.logger.error('whatsapp-bot.webhook.message.error', { error: innerErr.message, project_slug, message_id: msg.message_id }));
      }
    } catch (err) {
      this.logger.error('whatsapp-bot.webhook.event.error', { error: err.message, project_slug });
    }
    return { status: 200, body: 'EVENT_RECEIVED', headers: { 'Content-Type': 'text/plain' } };
  }

  async _procesarMensajeMeta(project_slug, msg) {
    if (msg.phone_number_id) {
      const expectedSlug = this.projectByPhoneId.get(msg.phone_number_id);
      if (expectedSlug && expectedSlug !== project_slug) {
        this.logger.warn('whatsapp-bot.webhook.project_mismatch', {
          path_project: project_slug, phone_id_project: expectedSlug, phone_number_id: msg.phone_number_id
        });
        return;
      }
    }
    await this._publicarEvento('whatsapp.mensaje.recibido', {
      project_slug, phone_number_id: msg.phone_number_id, from: msg.from,
      message_type: msg.message_type, message_id: msg.message_id, has_text: !!msg.text
    });
    await this._despacharEntrante(project_slug, msg);
  }

  async handleHealthCheck(req, res) {
    const operativos = [];
    for (const [slug, meta] of this.projectsByMeta) {
      if (this._proyectoOperativo(slug)) {
        operativos.push({
          project_slug: slug,
          phone_number_id: meta.phone_number_id,
          display_number: meta.display_number
        });
      }
    }
    const body = {
      module: this.name,
      version: this.version,
      projects_mapped: this.projectsByMeta.size,
      projects_operativos: operativos,
      pending_pedidos: this.pendingPedidos.size
    };
    if (res && typeof res.status === 'function') {
      return res.status(200).json({ status: 'ok', ...body });
    }
    return { status: 200, data: body };
  }

  // ==========================================
  // Tool handlers (canonical {status, data|error})
  // ==========================================

  async handleToolEnviar(data) {
    const project_slug = data?.project_slug;
    const to = data?.to;
    const text = data?.text;
    try {
      if (!project_slug) return this._errorResponse(400, 'INVALID_INPUT', 'project_slug requerido', { field: 'project_slug' });
      if (!to || typeof to !== 'string') return this._errorResponse(400, 'INVALID_INPUT', 'to requerido (E.164 sin +)', { field: 'to' });
      if (!text || typeof text !== 'string') return this._errorResponse(400, 'INVALID_INPUT', 'text requerido', { field: 'text' });
      const maxLen = this.config?.max_text_length || 4096;
      if (text.length > maxLen) {
        return this._errorResponse(400, 'INVALID_INPUT', `text excede ${maxLen} chars`, { field: 'text', length: text.length });
      }

      const meta = this.projectsByMeta.get(project_slug);
      if (!meta || !meta.phone_number_id || String(meta.phone_number_id).startsWith('<PENDIENTE')) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Proyecto '${project_slug}' no configurado o con datos pendientes`, { project_slug });
      }
      const token = process.env[this._envTokenKey(project_slug)];
      if (!token) {
        return this._errorResponse(401, 'AUTHENTICATION_REQUIRED', `Credencial META_WHATSAPP no disponible para '${project_slug}'`, { project_slug });
      }

      const { messageId } = await this.metaClient.sendText({
        phoneNumberId: meta.phone_number_id,
        accessToken: token,
        to,
        text
      });

      this.metrics?.increment('whatsapp-bot.message.sent', { project: project_slug });
      await this._publicarEvento('whatsapp.mensaje.enviado', {
        project_slug,
        to: this._maskPhoneNumber(to),
        message_id: messageId,
        kind: 'text'
      });

      return { status: 200, data: { message_id: messageId, project_slug } };
    } catch (err) {
      this.metrics?.increment('whatsapp-bot.message.failed', { project: project_slug });
      await this._publicarEvento('whatsapp.envio.fallido', {
        project_slug,
        to: this._maskPhoneNumber(to),
        error_code: err._code || 'UNKNOWN_ERROR',
        error_message: err.message
      });
      return this._handleHandlerError('whatsapp-bot.tool.enviar.error', err, 'tool');
    }
  }

  // ==========================================
  // Dominio protegido (mapping, despacho, helpers)
  // ==========================================

  async _hidratarMappingProyectos() {
    const projectsDir = this.config?.projects_dir || 'data/projects';
    try {
      const entries = await fs.readdir(projectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
        await this._refrescarProyecto(entry.name);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.logger.warn('whatsapp-bot.projects_dir.missing', { projects_dir: projectsDir });
        return;
      }
      throw err;
    }
  }

  async _refrescarProyecto(slug) {
    const cfg = await this._readProjectConfig(slug);
    // Limpiar reverse mapping previo (por si phone_number_id cambio)
    for (const [pid, s] of this.projectByPhoneId) {
      if (s === slug) this.projectByPhoneId.delete(pid);
    }
    if (!cfg || !cfg.whatsapp) {
      this.projectsByMeta.delete(slug);
      return;
    }
    const meta = {
      phone_number_id: cfg.whatsapp.phone_number_id || null,
      waba_id: cfg.whatsapp.waba_id || null,
      display_number: cfg.whatsapp.display_number || null,
      webhook_path: cfg.whatsapp.webhook_path || `/whatsapp/webhook/${slug}`,
      pwa_url: cfg.whatsapp.pwa_url || null,
      telegram_chat_id: cfg.telegram?.chatId || null,
      telegram_bot_name: cfg.telegram?.botName || null
    };
    this.projectsByMeta.set(slug, meta);
    if (meta.phone_number_id && !String(meta.phone_number_id).startsWith('<PENDIENTE')) {
      this.projectByPhoneId.set(meta.phone_number_id, slug);
    }
  }

  async _readProjectConfig(slug) {
    const dir = this.config?.projects_dir || 'data/projects';
    const file = path.join(dir, slug, 'config', 'project.json');
    try {
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      this.logger.warn('whatsapp-bot.project_config.read_error', { slug, error: err.message });
      return null;
    }
  }

  _proyectoOperativo(slug) {
    const meta = this.projectsByMeta.get(slug);
    if (!meta || !meta.phone_number_id) return false;
    if (String(meta.phone_number_id).startsWith('<PENDIENTE')) return false;
    return Boolean(process.env[this._envTokenKey(slug)]);
  }

  _contarProyectosOperativos() {
    let n = 0;
    for (const slug of this.projectsByMeta.keys()) {
      if (this._proyectoOperativo(slug)) n++;
    }
    return n;
  }

  async _despacharEntrante(project_slug, msg) {
    if (!msg.text) {
      this.logger.info('whatsapp-bot.entrante.sin_texto', { project_slug, message_type: msg.message_type });
      return;
    }
    const parsed = parsearPedido(msg.text);
    if (parsed.ok) {
      if (parsed.project_slug !== project_slug) {
        this.logger.warn('whatsapp-bot.entrante.project_mismatch', {
          path_project: project_slug,
          parsed_project: parsed.project_slug
        });
        await this._enviarMensajeSeguro(project_slug, msg.from,
          'Tu pedido parece de otro negocio. Vuelve a la PWA correcta para hacer un pedido aqui.');
        return;
      }
      await this._publicarEvento('whatsapp.pedido.detectado', {
        project_slug,
        from: msg.from,
        items: parsed.items,
        total_centimos: parsed.total_centimos,
        message_id: msg.message_id
      });
      await this._registrarPedido(project_slug, msg, parsed);
    } else {
      const meta = this.projectsByMeta.get(project_slug);
      const pwa = meta?.pwa_url || 'el catalogo del negocio';
      await this._enviarMensajeSeguro(project_slug, msg.from,
        `Hola! Aqui tienes el catalogo: ${pwa}. Compon tu pedido y envialo por WhatsApp cuando termines.`);
    }
  }

  async _registrarPedido(project_slug, msg, parsed) {
    const request_id = crypto.randomUUID();
    const items = parsed.items.map(it => ({ cantidad: it.cantidad, descripcion: it.descripcion }));
    const timeoutMs = this.config?.pedido_wait_timeout_ms || 12000;

    const timeoutHandle = setTimeout(() => {
      const pending = this._consumePending(request_id);
      if (!pending) return;
      this.logger.warn('whatsapp-bot.pedido.timeout', {
        project_slug,
        from: this._maskPhoneNumber(msg.from),
        request_id
      });
      this.metrics?.increment('whatsapp-bot.pedido.timeout', { project: project_slug });
      this._enviarMensajeSeguro(project_slug, msg.from,
        'No pudimos procesar tu pedido a tiempo. Vuelve a la PWA e intentalo de nuevo.');
    }, timeoutMs);

    this.pendingPedidos.set(request_id, {
      project_slug,
      from: msg.from,
      message_id: msg.message_id,
      items,
      total_centimos: parsed.total_centimos,
      palabra_clave: parsed.palabra_clave,
      mayor_edad_confirmado: parsed.mayor_edad_confirmado,
      timeoutHandle,
      created_at: Date.now()
    });

    // Auto-wire de tools: publish `pedido.crear-tienda` con request_id → loader llama
    // handleCreatePedidoTienda en pedidos y publica response. pedidos tambien publica
    // pedido.creado (informativo) que es lo que nosotros escuchamos por correlation_id.
    await this.eventBus.publish('pedido.crear-tienda', {
      request_id,
      correlation_id: request_id,
      project_slug,
      items,
      total_centimos: parsed.total_centimos,
      canal_origen: 'whatsapp',
      cliente_telefono: msg.from,
      palabra_clave: parsed.palabra_clave,
      mayor_edad_confirmado: parsed.mayor_edad_confirmado
    });
    this.metrics?.increment('whatsapp-bot.pedido.solicitado', { project: project_slug });
  }

  _consumePending(request_id) {
    const pending = this.pendingPedidos.get(request_id);
    if (!pending) return null;
    if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
    this.pendingPedidos.delete(request_id);
    return pending;
  }

  async _confirmarPedidoCliente(pending, pedido) {
    const meta = this.projectsByMeta.get(pending.project_slug);
    const display = meta?.display_number ? `\nNumero del negocio: ${meta.display_number}` : '';
    const msg = `Pedido recibido. Codigo: ${pedido.codigo_recogida}. Pasa a recoger y paga en efectivo. Al recoger te preguntaremos tu palabra clave.${display}`;
    await this._enviarMensajeSeguro(pending.project_slug, pending.from, msg);
  }

  async _notificarStaff(pending, pedido) {
    const meta = this.projectsByMeta.get(pending.project_slug);
    if (!meta?.telegram_chat_id || !meta?.telegram_bot_name) {
      this.logger.warn('whatsapp-bot.staff.no_telegram_config', { project_slug: pending.project_slug });
      return;
    }
    const itemsTxt = pending.items.map(it => `- ${it.cantidad} x ${it.descripcion}`).join('\n');
    const totalEur = (pending.total_centimos / 100).toFixed(2).replace('.', ',');
    // ANTI-FRAUDE: NO incluir palabra_clave aqui. El dependiente la pregunta al
    // cliente al recoger, sin haberla leido antes. mayor_edad SI viaja (es
    // metadata operativa, no anti-fraude; util para que el staff sepa que el
    // cliente paso el gate en la PWA — pero el dependiente sigue exigiendo DNI
    // en presencial si la regulacion lo manda).
    const lines = [
      `Pedido nuevo - ${pending.project_slug.toUpperCase()}`,
      `Codigo: ${pedido.codigo_recogida}`,
      `Cliente: ${this._maskPhoneNumber(pending.from)}`
    ];
    if (pending.mayor_edad_confirmado === true) {
      lines.push('Mayor 18: confirmado en PWA');
    }
    lines.push('', itemsTxt, '', `Total: ${totalEur} EUR`, '', `Expira: ${pedido.expira_at}`);
    const text = lines.join('\n');
    await this.eventBus.publish('telegram.send_message.request', {
      request_id: crypto.randomUUID(),
      botName: meta.telegram_bot_name,
      chatId: Number(meta.telegram_chat_id),
      text
    });
  }

  async _enviarMensajeSeguro(project_slug, to, text) {
    try {
      // Transporte open-wa (self-hosted): delega al bus → openwa-service hace el sendText.
      if (this.transport === 'openwa') {
        await this.eventBus.publish('whatsapp.enviar.request', {
          request_id: crypto.randomUUID(), project_slug, to, text
        });
        this.metrics?.increment('whatsapp-bot.message.sent', { project: project_slug, transport: 'openwa' });
        await this._publicarEvento('whatsapp.mensaje.enviado', {
          project_slug, to: this._maskPhoneNumber(to), kind: 'auto', transport: 'openwa'
        });
        return;
      }
      // Transporte meta (Cloud API directa) — parcado por defecto.
      const meta = this.projectsByMeta.get(project_slug);
      if (!meta?.phone_number_id || String(meta.phone_number_id).startsWith('<PENDIENTE')) {
        this.logger.warn('whatsapp-bot.envio.proyecto_no_operativo', { project_slug });
        return;
      }
      const token = process.env[this._envTokenKey(project_slug)];
      if (!token) {
        this.logger.warn('whatsapp-bot.envio.sin_credencial', { project_slug });
        return;
      }
      const { messageId } = await this.metaClient.sendText({
        phoneNumberId: meta.phone_number_id,
        accessToken: token,
        to,
        text
      });
      this.metrics?.increment('whatsapp-bot.message.sent', { project: project_slug });
      await this._publicarEvento('whatsapp.mensaje.enviado', {
        project_slug,
        to: this._maskPhoneNumber(to),
        message_id: messageId,
        kind: 'auto'
      });
    } catch (err) {
      this.logger.error('whatsapp-bot.envio.fallido', {
        project_slug,
        to: this._maskPhoneNumber(to),
        error: err.message,
        error_code: err._code || 'UNKNOWN_ERROR'
      });
      this.metrics?.increment('whatsapp-bot.message.failed', { project: project_slug });
      await this._publicarEvento('whatsapp.envio.fallido', {
        project_slug,
        to: this._maskPhoneNumber(to),
        error_code: err._code || 'UNKNOWN_ERROR',
        error_message: err.message
      });
    }
  }
}

module.exports = WhatsappBotModule;
