'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
const { parsearPedido } = require('./services/pedido-parser');
const { MetaCloudClient, parseWebhookEvent } = require('./services/meta-cloud-client');
const { tasarPedido } = require('../_shared/pedido-tasador');

const ENV_TOKEN_PATTERN = /^META_WHATSAPP_API_KEY_PROJECT_(.+)$/;
const ENV_VERIFY_PATTERN = /^META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_(.+)$/;

class WhatsappBotModule extends BaseModule {
  constructor() {
    super();
    this.name = 'whatsapp-bot';
    this.version = require('./module.json').version;   // fuente única (antes 1.2.0 clavado divergía del manifest)

    this.config = null;
    this.metaClient = null;
    // project_slug -> { phone_number_id, waba_id, display_number, webhook_path, pwa_url, telegram_chat_id, telegram_bot_name }
    this.projectsByMeta = new Map();
    // phone_number_id -> project_slug (reverse mapping)
    this.projectByPhoneId = new Map();
    // request_id -> { project_slug, from, message_id, items, total_centimos, cliente_nombre, timeoutHandle, created_at }
    this.pendingPedidos = new Map();
    // pedido_id -> { project_slug, from, cliente_nombre } — para avisar al cliente cuando
    // cocina marque el pedido listo (cocina.pedido_listo NO arrastra el cliente_telefono).
    // Bounded (LRU simple) para no fugar memoria.
    this.pedidosListos = new Map();
    this.maxPedidosListos = 500;

    // ── Re-tasado server-side (seguridad). El bot mantiene un SNAPSHOT de precios por
    // proyecto, hidratado VÍA EVENTO (catalogo.actualizado / project.activated): cuando
    // cambia la carta o la tarifa, el bot re-pull la carta y refresca el snapshot. Así el
    // re-tasado al llegar el pedido es instantáneo y con los MISMOS precios que la PWA.
    this.cartaSnap = new Map();     // project_id(UUID) -> { productos, ingredientes_catalogo, at }
    this.pidPorSlug = new Map();    // slug -> project_id (puente, de project.activated: basename(base_path))
    this.slugPorPid = new Map();    // project_id -> slug
    this.moduleRegistry = null;     // acceso in-process a `productos` (patrón carta-digital→ingredientes)
  }

  // Registra el pedido bajo varias claves (pedido_id de tienda + cuenta_id): cocina
  // marca listo el ticket de la cuenta, cuyo cuenta_id viaja en cocina.pedido_listo
  // y cuyo pedido_id difiere del de tienda. Cualquiera de las dos localiza al cliente.
  _trackPedidoListo(keys, project_slug, from, cliente_nombre) {
    const ref = { project_slug, from, cliente_nombre };
    for (const k of (Array.isArray(keys) ? keys : [keys])) {
      if (!k) continue;
      if (this.pedidosListos.has(k)) this.pedidosListos.delete(k);
      this.pedidosListos.set(k, ref);
      while (this.pedidosListos.size > this.maxPedidosListos) {
        this.pedidosListos.delete(this.pedidosListos.keys().next().value);
      }
    }
  }

  // ── Snapshot de precios por proyecto (hidratado VÍA EVENTO) ──────────────────
  // project.activated: tiende el puente slug↔project_id (slug = basename(base_path),
  // como lo crea project-manager) y calienta el snapshot de la carta.
  async onProjectActivated(event) {
    const d = event?.data || event;
    const project_id = d?.project_id;
    if (!project_id) return;
    const slug = d.base_path ? path.basename(String(d.base_path)) : (d.slug || null);
    if (slug) {
      this.pidPorSlug.set(slug, project_id);
      this.slugPorPid.set(project_id, slug);
    }
    await this._refrescarCarta(project_id);
  }

  // catalogo.actualizado / tarifas.config.actualizada: la carta o la tarifa cambió →
  // refresca el snapshot de ESE proyecto (re-pull de la carta del canal digital).
  async onCatalogoActualizado(event) {
    const d = event?.data || event;
    const project_id = d?.project_id;
    if (!project_id) return;
    await this._refrescarCarta(project_id);
  }

  // Re-pull de la carta del canal 'digital' a `productos` EN PROCESO (mismo patrón que
  // carta-digital→ingredientes). Cachea { productos(precio), ingredientes_catalogo(precio_extra) }:
  // justo lo que tasarPedido necesita. Soft-fail: si productos no está, deja el snapshot como esté.
  async _refrescarCarta(project_id) {
    try {
      const inst = this.moduleRegistry?.get('productos')?.instance;
      if (!inst?.handleCartaCompleta) return;
      const r = await inst.handleCartaCompleta({ project_id, canal: 'digital' });
      if (r?.status !== 200 || !r.data) return;
      this.cartaSnap.set(project_id, {
        productos: Array.isArray(r.data.productos) ? r.data.productos : [],
        ingredientes_catalogo: Array.isArray(r.data.ingredientes) ? r.data.ingredientes : [],
        at: Date.now()
      });
      this.logger?.info?.('whatsapp-bot.carta.snapshot', {
        project_id, productos: r.data.productos?.length || 0, ingredientes: r.data.ingredientes?.length || 0
      });
    } catch (err) {
      this.logger?.warn?.('whatsapp-bot.carta.snapshot.failed', { project_id, error: err.message });
    }
  }

  // slug → project_id (UUID). Lo tiende project.activated; si falta, intenta resolver en
  // proceso por project-manager (cold-start). null si no se puede (→ el bot pedirá reintentar).
  _resolverProjectId(slug) {
    if (this.pidPorSlug.has(slug)) return this.pidPorSlug.get(slug);
    try {
      const pm = this.moduleRegistry?.get('project-manager')?.instance;
      const store = pm?.projectsStore;
      if (store && typeof store.values === 'function') {
        for (const p of store.values()) {
          const s = p?.slug || (p?.name ? pm._slugify?.(p.name) : null);
          if (s === slug && p?.project_id) {
            this.pidPorSlug.set(slug, p.project_id);
            this.slugPorPid.set(p.project_id, slug);
            return p.project_id;
          }
        }
      }
    } catch (_) {}
    return null;
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

  // Normaliza la config de plantilla del proyecto a { name, language, body_params } o null.
  // Admite forma corta (string = solo el nombre) o larga ({ name, language?, body_params? }).
  // body_params son placeholders con tokens {codigo}/{nombre}/{negocio} que se rellenan al enviar.
  _normalizarTemplate(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') return { name: raw, language: 'es', body_params: [] };
    if (typeof raw === 'object' && raw.name) {
      return {
        name: String(raw.name),
        language: raw.language || 'es',
        body_params: Array.isArray(raw.body_params) ? raw.body_params : []
      };
    }
    return null;
  }

  // Rellena los body_params de una plantilla con el contexto del aviso (codigo/nombre/negocio).
  _renderTemplateParams(params, ctx) {
    const dict = {
      codigo: ctx?.codigo != null ? String(ctx.codigo) : '',
      nombre: ctx?.nombre != null ? String(ctx.nombre) : '',
      negocio: ctx?.negocio != null ? String(ctx.negocio) : ''
    };
    return (params || []).map(p =>
      String(p).replace(/\{(codigo|nombre|negocio)\}/g, (_m, k) => dict[k] ?? ''));
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.moduleRegistry = core.moduleRegistry;   // para re-pull de la carta a `productos` en proceso

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
      cliente_nombre: pending.cliente_nombre || null
    });
    this.metrics?.increment('whatsapp-bot.pedido.confirmado', { project: pending.project_slug });

    await this._confirmarPedidoCliente(pending, data);
    await this._notificarStaff(pending, data);
    // Recordar quién es el cliente para avisarle cuando cocina lo marque listo.
    // Clave por pedido_id (tienda) y por cuenta_id (la cuenta operativa de comandero).
    this._trackPedidoListo([data.pedido_id, data.cuenta_id], pending.project_slug, pending.from, pending.cliente_nombre);
  }

  // Cocina marcó el pedido listo → avisa al CLIENTE por WhatsApp ("ven a recoger").
  // Solo reacciona a pedidos de tienda que nosotros registramos (lookup por pedido_id);
  // los del POS no están en el mapa → se ignoran.
  async onCocinaPedidoListo(event) {
    const data = event?.data || event;
    const cuenta_id = data?.cuenta_id;
    const pedido_id = data?.pedido_id;
    const ref = (cuenta_id && this.pedidosListos.get(cuenta_id))
             || (pedido_id && this.pedidosListos.get(pedido_id));
    if (!ref) return;                          // no es un pedido de tienda nuestro
    if (cuenta_id) this.pedidosListos.delete(cuenta_id);
    if (pedido_id) this.pedidosListos.delete(pedido_id);
    const meta = this.projectsByMeta.get(ref.project_slug);

    // Aviso "ven a recoger": puede llegar HORAS despues del pedido. Si han pasado >24h desde
    // el ultimo mensaje del cliente, Meta solo deja escribir con PLANTILLA. Si el proyecto tiene
    // una plantilla aprobada configurada (whatsapp.template_listo), la usamos (funciona dentro y
    // fuera de ventana). Si no, caemos a texto (solo llega si el cliente escribio en las ultimas 24h).
    if (meta?.template_listo) {
      const enviada = await this._enviarPlantillaSegura(ref.project_slug, ref.from, meta.template_listo, {
        nombre: ref.cliente_nombre || '', negocio: meta?.display_number || ''
      });
      if (enviada) {
        this.metrics?.increment('whatsapp-bot.pedido.listo_notificado', { project: ref.project_slug, via: 'template' });
        return;
      }
    }
    const display = meta?.display_number ? `\nNumero del negocio: ${meta.display_number}` : '';
    const msg = `¡Tu pedido ya está listo! 🎉 Puedes pasar a recogerlo y pagas al recoger.${display}`;
    await this._enviarMensajeSeguro(ref.project_slug, ref.from, msg);
    this.metrics?.increment('whatsapp-bot.pedido.listo_notificado', { project: ref.project_slug, via: 'text' });
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
  // UI handlers — config de conexión del proyecto (datos NO secretos)
  // ==========================================
  // El bloque `whatsapp` del config del proyecto (phone_number_id, waba_id, número,
  // webhook, pwa) NO son secretos → no van en el credential-manager. Antes había que
  // editar el JSON a mano; estos handlers lo dan de alta desde la app.

  async handleGetConfig(data) {
    try {
      const project_slug = (data && (data.project_slug || data.project)) || null;
      if (!project_slug) return this._errorResponse(400, 'INVALID_INPUT', 'project_slug requerido', { field: 'project_slug' });
      const cfg = (await this._readProjectConfig(project_slug)) || {};
      const w = cfg.whatsapp || {};
      return {
        status: 200,
        data: {
          project_slug,
          whatsapp: {
            waba_id: w.waba_id || '',
            phone_number_id: w.phone_number_id || '',
            display_number: w.display_number || '',
            webhook_path: w.webhook_path || `/whatsapp/webhook/${project_slug}`,
            pwa_url: w.pwa_url || ''
          },
          has_token: !!process.env[this._envTokenKey(project_slug)],
          has_verify: !!process.env[this._envVerifyKey(project_slug)],
          operativo: this._proyectoOperativo(project_slug),
          // Ruta del webhook para pegar en Meta (el frontend antepone el origin del dominio).
          webhook_path_publico: `/modules/whatsapp-bot/whatsapp/webhook/${project_slug}`
        }
      };
    } catch (err) {
      return this._handleHandlerError('whatsapp-bot.config.get.error', err, 'ui');
    }
  }

  async handleSetConfig(data) {
    const project_slug = (data && (data.project_slug || data.project)) || null;
    try {
      if (!project_slug) return this._errorResponse(400, 'INVALID_INPUT', 'project_slug requerido', { field: 'project_slug' });
      const phone_number_id = data?.phone_number_id != null ? String(data.phone_number_id).trim() : '';
      const waba_id = data?.waba_id != null ? String(data.waba_id).trim() : '';
      const display_number = data?.display_number != null ? String(data.display_number).trim() : '';
      if (!phone_number_id) return this._errorResponse(400, 'INVALID_INPUT', 'phone_number_id requerido', { field: 'phone_number_id' });
      if (!waba_id) return this._errorResponse(400, 'INVALID_INPUT', 'waba_id requerido', { field: 'waba_id' });
      if (!display_number) return this._errorResponse(400, 'INVALID_INPUT', 'display_number requerido', { field: 'display_number' });

      // Prefijo público global (el "botón único": config.json web.public_ns). La PWA
      // se sirve en /<ns>/shop/<slug>. Ver lib/public-ns.js.
      let nsPub = 'a';
      try { nsPub = require('../../lib/public-ns.js').publicNs(); } catch (_) { /* default 'a' */ }
      const whatsapp = {
        waba_id,
        phone_number_id,
        display_number,
        webhook_path: `/whatsapp/webhook/${project_slug}`,
        pwa_url: data?.pwa_url ? String(data.pwa_url).trim() : `https://enki-ai.online/${nsPub}/shop/${project_slug}`
      };
      // template_listo es opcional; si lo mandan, lo preservamos tal cual (string u objeto).
      if (data?.template_listo) whatsapp.template_listo = data.template_listo;

      await this._writeProjectConfig(project_slug, { whatsapp });
      await this._refrescarProyecto(project_slug);   // rehidrata el mapeo en caliente (sin reinicio)

      const operativo = this._proyectoOperativo(project_slug);
      this.logger.info('whatsapp-bot.config.set', { project_slug, operativo });
      this.metrics?.increment?.('whatsapp-bot.config.set', { project: project_slug });
      return {
        status: 200,
        data: {
          project_slug,
          whatsapp,
          operativo,
          has_token: !!process.env[this._envTokenKey(project_slug)],
          has_verify: !!process.env[this._envVerifyKey(project_slug)]
        }
      };
    } catch (err) {
      return this._handleHandlerError('whatsapp-bot.config.set.error', err, 'ui');
    }
  }

  // Escribe (merge) un bloque en el config del proyecto, en el MISMO fichero que lee
  // _readProjectConfig (config/config.json con precedencia, project.json como fallback),
  // preservando el resto de bloques (telegram, gmail, …). Atómico (tmp + rename).
  async _writeProjectConfig(slug, merge) {
    const dir = this.config?.projects_dir || 'data/projects';
    const configDir = path.join(dir, slug, 'config');
    const candidatos = [
      path.join(configDir, 'config.json'),
      path.join(configDir, 'project.json')
    ];
    let file = null;
    for (const f of candidatos) {
      try { await fs.access(f); file = f; break; } catch (_) { /* no existe */ }
    }
    if (!file) file = candidatos[0];   // ninguno existe → crea config.json

    let obj = {};
    try { obj = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) { obj = {}; }
    Object.assign(obj, merge);   // merge superficial: pone/reemplaza el bloque, conserva el resto

    await fs.mkdir(configDir, { recursive: true });
    const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(obj, null, 2));
    await fs.rename(tmp, file);
    this.logger.info('whatsapp-bot.project_config.written', { slug, file, blocks: Object.keys(merge) });
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

  // Enviar una PLANTILLA aprobada por Meta. Es la unica via para escribir al cliente fuera
  // de la ventana de 24h (notificaciones outbound v2, recordatorios, "ven a recoger" tardio).
  // El caller aporta el nombre de la plantilla aprobada + sus variables (body_params en orden).
  async handleToolEnviarPlantilla(data) {
    const project_slug = data?.project_slug;
    const to = data?.to;
    const template = data?.template;
    try {
      if (!project_slug) return this._errorResponse(400, 'INVALID_INPUT', 'project_slug requerido', { field: 'project_slug' });
      if (!to || typeof to !== 'string') return this._errorResponse(400, 'INVALID_INPUT', 'to requerido (E.164 sin +)', { field: 'to' });
      if (!template || typeof template !== 'string') return this._errorResponse(400, 'INVALID_INPUT', 'template (nombre aprobado) requerido', { field: 'template' });
      const bodyParams = Array.isArray(data?.body_params) ? data.body_params : [];
      const languageCode = data?.language || 'es';

      const meta = this.projectsByMeta.get(project_slug);
      if (!meta || !meta.phone_number_id || String(meta.phone_number_id).startsWith('<PENDIENTE')) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Proyecto '${project_slug}' no configurado o con datos pendientes`, { project_slug });
      }
      const token = process.env[this._envTokenKey(project_slug)];
      if (!token) {
        return this._errorResponse(401, 'AUTHENTICATION_REQUIRED', `Credencial META_WHATSAPP no disponible para '${project_slug}'`, { project_slug });
      }

      const { messageId } = await this.metaClient.sendTemplate({
        phoneNumberId: meta.phone_number_id,
        accessToken: token,
        to,
        template,
        languageCode,
        bodyParams
      });

      this.metrics?.increment('whatsapp-bot.message.sent', { project: project_slug, kind: 'template' });
      await this._publicarEvento('whatsapp.mensaje.enviado', {
        project_slug, to: this._maskPhoneNumber(to), message_id: messageId, kind: 'template'
      });

      return { status: 200, data: { message_id: messageId, project_slug, kind: 'template' } };
    } catch (err) {
      this.metrics?.increment('whatsapp-bot.message.failed', { project: project_slug, kind: 'template' });
      await this._publicarEvento('whatsapp.envio.fallido', {
        project_slug, to: this._maskPhoneNumber(to),
        error_code: err._code || 'UNKNOWN_ERROR', error_message: err.message
      });
      return this._handleHandlerError('whatsapp-bot.tool.enviar_plantilla.error', err, 'tool');
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
      telegram_bot_name: cfg.telegram?.botName || null,
      // Plantilla aprobada por Meta para el aviso "ven a recoger". Es lo UNICO que llega al
      // cliente FUERA de la ventana de 24h (re-engagement). Opcional: sin ella, el aviso se
      // envia como texto (solo funciona si el cliente escribio en las ultimas 24h).
      template_listo: this._normalizarTemplate(cfg.whatsapp.template_listo)
    };
    this.projectsByMeta.set(slug, meta);
    if (meta.phone_number_id && !String(meta.phone_number_id).startsWith('<PENDIENTE')) {
      this.projectByPhoneId.set(meta.phone_number_id, slug);
    }
  }

  async _readProjectConfig(slug) {
    const dir = this.config?.projects_dir || 'data/projects';
    // El fichero canonico de config por proyecto es config/config.json (bloques de
    // feature: pizzepos, tienda, whatsapp...). Se admite config/project.json como
    // fallback (layouts antiguos / integraciones que lo escriban aparte).
    const candidatos = [
      path.join(dir, slug, 'config', 'config.json'),
      path.join(dir, slug, 'config', 'project.json')
    ];
    for (const file of candidatos) {
      try {
        const raw = await fs.readFile(file, 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        if (err.code === 'ENOENT') continue;
        this.logger.warn('whatsapp-bot.project_config.read_error', { slug, file, error: err.message });
        return null;
      }
    }
    return null;
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
      // Camino SEGURO: si la PWA mandó el payload por ids (#P1), RE-TASAMOS contra la carta
      // (el precio del texto se ignora). Sin #P1 (texto legacy) → camino antiguo (confía en el texto).
      if (parsed.estructura) {
        await this._registrarPedidoSeguro(project_slug, msg, parsed);
      } else {
        this.logger.warn('whatsapp-bot.pedido.sin_estructura', { project_slug, motivo: 'sin #P1 → no re-tasable, se confía en el texto' });
        await this._registrarPedido(project_slug, msg, parsed);
      }
    } else {
      const meta = this.projectsByMeta.get(project_slug);
      const pwa = meta?.pwa_url || 'el catalogo del negocio';
      await this._enviarMensajeSeguro(project_slug, msg.from,
        `Hola! Aqui tienes el catalogo: ${pwa}. Compon tu pedido y envialo por WhatsApp cuando termines.`);
    }
  }

  async _registrarPedido(project_slug, msg, parsed) {
    const request_id = crypto.randomUUID();
    const items = parsed.items.map(it => ({
      cantidad: it.cantidad,
      descripcion: it.descripcion,
      precio_unitario_centimos: Number.isInteger(it.precio_unitario_centimos) ? it.precio_unitario_centimos : undefined,
      precio_total_centimos: Number.isInteger(it.precio_total_centimos) ? it.precio_total_centimos : undefined
    }));
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
      cliente_nombre: parsed.cliente_nombre,
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
      cliente_nombre: parsed.cliente_nombre,
      modo_consumo: parsed.modo_consumo || null,
      hora_recogida: parsed.hora_recogida || null,
      mayor_edad_confirmado: parsed.mayor_edad_confirmado
    });
    this.metrics?.increment('whatsapp-bot.pedido.solicitado', { project: project_slug });
  }

  // Camino SEGURO: el pedido trae el payload por ids (#P1). RE-TASAMOS contra el snapshot
  // de la carta (precio del cliente IGNORADO). El total y los precios que se cobran salen
  // SIEMPRE del servidor. La estructura (tipo, mitades, variaciones) viaja hacia cocina.
  async _registrarPedidoSeguro(project_slug, msg, parsed) {
    const project_id = this._resolverProjectId(project_slug);
    if (!project_id) {
      this.logger.warn('whatsapp-bot.pedido.sin_project_id', { project_slug });
      await this._enviarMensajeSeguro(project_slug, msg.from,
        'Estamos cargando el catalogo. Reintenta tu pedido en unos segundos, por favor.');
      return;
    }
    let snap = this.cartaSnap.get(project_id);
    if (!snap) { await this._refrescarCarta(project_id); snap = this.cartaSnap.get(project_id); }
    if (!snap) {
      this.metrics?.increment('whatsapp-bot.pedido.sin_carta', { project: project_slug });
      await this._enviarMensajeSeguro(project_slug, msg.from,
        'Estamos cargando el catalogo. Reintenta tu pedido en unos segundos, por favor.');
      return;
    }

    const tasado = tasarPedido(parsed.estructura.items, {
      productos: snap.productos, ingredientes_catalogo: snap.ingredientes_catalogo
    });
    if (!tasado.ok) {
      this.metrics?.increment('whatsapp-bot.pedido.retasado_fallo', { project: project_slug });
      this.logger.warn('whatsapp-bot.pedido.retasado_fallo', { project_slug, errores: tasado.errores });
      await this._enviarMensajeSeguro(project_slug, msg.from,
        'No pudimos confirmar algun producto de tu pedido (puede haber cambiado la carta). Vuelve a la PWA y reenvialo, por favor.');
      return;
    }

    // Items canónicos para pedidos, con PRECIOS DEL SERVIDOR + estructura para cocina.
    const items = tasado.items.map(it => ({
      cantidad: it.cantidad,
      descripcion: it.descripcion,
      producto_id: it.producto_id || null,
      precio_unitario_centimos: it.precio_unitario_centimos,
      precio_total_centimos: it.precio_total_centimos,
      tipo: it.tipo,
      ...(it.variaciones ? { variaciones: it.variaciones } : {}),
      ...(it.ingredientes_base ? { ingredientes_base: it.ingredientes_base } : {}),
      ...(it.pizza_izquierda ? { pizza_izquierda: it.pizza_izquierda } : {}),
      ...(it.pizza_derecha ? { pizza_derecha: it.pizza_derecha } : {})
    }));
    const total_centimos = tasado.total_centimos;
    const request_id = crypto.randomUUID();
    const timeoutMs = this.config?.pedido_wait_timeout_ms || 12000;

    const timeoutHandle = setTimeout(() => {
      const pending = this._consumePending(request_id);
      if (!pending) return;
      this.logger.warn('whatsapp-bot.pedido.timeout', { project_slug, from: this._maskPhoneNumber(msg.from), request_id });
      this.metrics?.increment('whatsapp-bot.pedido.timeout', { project: project_slug });
      this._enviarMensajeSeguro(project_slug, msg.from,
        'No pudimos procesar tu pedido a tiempo. Vuelve a la PWA e intentalo de nuevo.');
    }, timeoutMs);

    this.pendingPedidos.set(request_id, {
      project_slug, from: msg.from, message_id: msg.message_id,
      items, total_centimos, cliente_nombre: parsed.cliente_nombre,
      mayor_edad_confirmado: parsed.mayor_edad_confirmado, timeoutHandle, created_at: Date.now()
    });

    await this.eventBus.publish('pedido.crear-tienda', {
      request_id, correlation_id: request_id, project_slug,
      items, total_centimos, canal_origen: 'whatsapp',
      cliente_telefono: msg.from, cliente_nombre: parsed.cliente_nombre,
      modo_consumo: parsed.modo_consumo || null,
      hora_recogida: parsed.hora_recogida || null,
      mayor_edad_confirmado: parsed.mayor_edad_confirmado
    });
    this.metrics?.increment('whatsapp-bot.pedido.solicitado', { project: project_slug, retasado: 'si' });
    this.logger.info('whatsapp-bot.pedido.retasado', {
      project_slug, items: items.length, total_centimos,
      total_cliente: parsed.total_centimos, coincide: parsed.total_centimos === total_centimos
    });
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
    const aNombre = pending.cliente_nombre ? ` a nombre de ${pending.cliente_nombre}` : '';
    const msg = `Pedido recibido${aNombre}. Pasa a recoger y paga al recoger.${display}`;
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
    // El nombre SI viaja al staff: es la etiqueta humana del pedido (lo cantan al
    // recoger), no un secreto. El telefono va enmascarado (dato operativo). mayor_edad
    // viaja si el proyecto activo el gate en la PWA.
    const lines = [
      `Pedido nuevo - ${pending.project_slug.toUpperCase()}`,
      `A nombre de: ${pending.cliente_nombre || '(sin nombre)'}`,
      `Tel: ${this._maskPhoneNumber(pending.from)}`
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

  // Envia una plantilla aprobada por Meta (re-engagement fuera de la ventana de 24h).
  // Solo aplica al transporte 'meta' (openwa es una sesion WA real, sin restriccion de
  // ventana). Devuelve true si se envio, false si no se pudo (sin credencial/config o error).
  async _enviarPlantillaSegura(project_slug, to, tpl, ctx) {
    if (this.transport !== 'meta') return false;
    if (!tpl || !tpl.name) return false;
    try {
      const meta = this.projectsByMeta.get(project_slug);
      if (!meta?.phone_number_id || String(meta.phone_number_id).startsWith('<PENDIENTE')) {
        this.logger.warn('whatsapp-bot.plantilla.proyecto_no_operativo', { project_slug });
        return false;
      }
      const token = process.env[this._envTokenKey(project_slug)];
      if (!token) {
        this.logger.warn('whatsapp-bot.plantilla.sin_credencial', { project_slug });
        return false;
      }
      const bodyParams = this._renderTemplateParams(tpl.body_params, ctx);
      const { messageId } = await this.metaClient.sendTemplate({
        phoneNumberId: meta.phone_number_id,
        accessToken: token,
        to,
        template: tpl.name,
        languageCode: tpl.language || 'es',
        bodyParams
      });
      this.metrics?.increment('whatsapp-bot.message.sent', { project: project_slug, kind: 'template' });
      await this._publicarEvento('whatsapp.mensaje.enviado', {
        project_slug, to: this._maskPhoneNumber(to), message_id: messageId, kind: 'template'
      });
      return true;
    } catch (err) {
      this.logger.error('whatsapp-bot.plantilla.fallido', {
        project_slug, to: this._maskPhoneNumber(to),
        error: err.message, error_code: err._code || 'UNKNOWN_ERROR'
      });
      this.metrics?.increment('whatsapp-bot.message.failed', { project: project_slug, kind: 'template' });
      await this._publicarEvento('whatsapp.envio.fallido', {
        project_slug, to: this._maskPhoneNumber(to),
        error_code: err._code || 'UNKNOWN_ERROR', error_message: err.message
      });
      return false;
    }
  }
}

module.exports = WhatsappBotModule;
