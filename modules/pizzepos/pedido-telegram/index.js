'use strict';

/**
 * pedido-telegram — el CANAL Telegram de pedidos.
 *
 * Hermano de `tienda-api` (canal web) y `whatsapp-bot` (canal WhatsApp): misma
 * responsabilidad (meter un pedido del cliente en el bus) y misma garantía
 * (los precios los pone el SERVIDOR, nunca el cliente).
 *
 * ── El problema de transporte que resuelve ────────────────────────────────────
 * En WhatsApp la carta compone un texto y abre wa.me con ese texto precargado.
 * Telegram NO permite eso: `t.me/<bot>?start=<payload>` admite 64 caracteres y
 * nada más. Así que el pedido no viaja como texto: viaja como CÓDIGO CORTO.
 *
 *   1. La carta POSTea el pedido POR IDS a /tienda/telegram/borrador/<slug>
 *      → este módulo guarda el borrador y devuelve { codigo, url }.
 *   2. La carta abre `https://t.me/<bot>?start=p_<codigo>`.
 *   3. Telegram manda `/start p_<codigo>` al bot del negocio.
 *   4. Aquí se RE-TASA el borrador contra la carta real (precios del cliente
 *      ignorados) y se emite `pedido.crear-tienda` con canal_origen='telegram'.
 *   5. `pedidos` crea la cuenta igual que un pedido de mesa y el cliente recibe
 *      la confirmación en SU chat.
 *
 * Efecto de segundo orden (el que importa): el chatId es una identidad de hecho
 * — el cliente queda atado a su pedido sin pedirle el teléfono, y el mismo hilo
 * sirve para avisarle del estado. El teléfono era el ancla de WhatsApp; aquí el
 * ancla es el chat.
 *
 * Dinero en CÉNTIMOS de punta a punta. El borrador NO guarda total: guarda ids.
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
const { tasarPedido } = require('../../_shared/pedido-tasador');
// Mismo parser que el canal WhatsApp: el mensaje que comparte el cliente desde la
// carta es el MISMO texto canónico (líneas humanas + `#P1` con los ids). Una sola
// definición del formato para los dos canales.
const { parsearPedido } = require('../../whatsapp-bot/services/pedido-parser');

// Sin 0/O/1/I: el código se teclea y se lee en un móvil.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIJO = 'p_';

class PedidoTelegramModule extends BaseModule {
  constructor() {
    super();
    this.name = 'pedido-telegram';
    this.version = require('./module.json').version;

    this.config = {};
    this.moduleRegistry = null;

    this.borradores = new Map();   // codigo -> borrador
    this.pendientes = new Map();   // request_id -> { botName, chatId, codigo, project_slug }
    this.pidPorSlug = new Map();   // slug -> project_id (lo tiende project.activated)
    this.basePathPorPid = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.moduleRegistry = core.moduleRegistry;

    try {
      this.config = JSON.parse(await fs.readFile(path.join(__dirname, 'module.json'), 'utf8')).config || {};
    } catch (_) {
      this.config = {};
    }
    this.ttlMs = this.config.ttl_ms || 1800000;
    this.codigoLen = this.config.codigo_len || 6;

    await this._cargarBorradores();

    this.logger?.info?.('module.loaded', {
      module: this.name,
      version: this.version,
      borradores: this.borradores.size
    });
  }

  async onUnload() {
    await this._guardarBorradores();
    for (const [, p] of this.pendientes) if (p.timeoutHandle) clearTimeout(p.timeoutHandle);
    this.pendientes.clear();
    this.borradores.clear();
    this.logger?.info?.('module.unloaded', { module: this.name });
  }

  // ==========================================
  // HTTP — la carta pide el borrador
  // ==========================================

  /**
   * POST /tienda/telegram/borrador/:project
   * Body: { items:[{producto_id, cantidad, descripcion?, variaciones?, ...}], nombre_cliente,
   *         modo_consumo?, hora_recogida?, metodo_pago?, mayor_edad_confirmado? }
   *
   * El gateway del core llama al handler con (req, ctx) y espera de vuelta
   * { status, data }: aquí no hay `res` de Express.
   */
  async handleBorradorPost(req) {
    const slug = String(req?.params?.project || '').trim();
    if (!slug) {
      return { status: 400, data: { error: { code: 'INVALID_INPUT', message: 'project param required in path' } } };
    }

    const body = req?.body || {};
    const validacion = this._validarBorrador(body);
    if (!validacion.ok) {
      return { status: 400, data: { error: validacion.error } };
    }

    const proyecto = this._resolverProyecto(slug);
    if (!proyecto?.id) {
      this.logger?.warn?.('pedido-telegram.borrador.sin_proyecto', { slug });
      return { status: 404, data: { error: { code: 'RESOURCE_NOT_FOUND', message: `proyecto '${slug}' no encontrado` } } };
    }

    const vinculo = await this._vinculoDelProyecto(proyecto.id);
    if (!vinculo?.botName) {
      this.logger?.warn?.('pedido-telegram.borrador.sin_bot', { slug, project_id: proyecto.id });
      return {
        status: 409,
        data: { error: { code: 'CHANNEL_NOT_CONFIGURED', message: 'este proyecto no tiene bot de Telegram vinculado' } }
      };
    }

    const codigo = this._nuevoCodigo();
    const ahora = Date.now();
    const borrador = {
      codigo,
      project_slug: slug,
      project_id: proyecto.id,
      base_path: proyecto.base_path || null,
      botName: vinculo.botName,
      items: validacion.items,
      nombre_cliente: validacion.nombre_cliente,
      modo_consumo: validacion.modo_consumo,
      hora_recogida: validacion.hora_recogida,
      metodo_pago: validacion.metodo_pago,
      mayor_edad_confirmado: validacion.mayor_edad_confirmado,
      creado_en: ahora,
      expira_en: ahora + this.ttlMs
    };

    this._purgar();
    this.borradores.set(codigo, borrador);
    await this._guardarBorradores();

    this.metrics?.increment?.('pedido-telegram.borrador.creado', { project: slug });
    await this._publicar('pedido-telegram.borrador.creado', {
      project_slug: slug,
      codigo,
      items: borrador.items.length
    });

    this.logger?.info?.('pedido-telegram.borrador', {
      project_slug: slug, codigo, items: borrador.items.length, bot: vinculo.botName
    });

    return {
      status: 201,
      data: {
        codigo,
        url: `https://t.me/${vinculo.botName}?start=${PREFIJO}${codigo}`,
        expira_en_s: Math.round(this.ttlMs / 1000)
      }
    };
  }

  async handleBorradorOptions() {
    return { status: 204, data: null };
  }

  async handleHealth() {
    return {
      status: 200,
      data: {
        status: 'ok',
        version: this.version,
        borradores: this.borradores.size,
        pedidos_en_vuelo: this.pendientes.size
      }
    };
  }

  // ==========================================
  // Telegram — el cliente abre el enlace
  // ==========================================

  async onTelegramCommand(event) {
    const d = event?.data || event;
    const texto = String(d?.text || '');
    // /start p_ABC123  (tolerante a /start@NombreBot)
    const m = texto.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_]+))?\s*$/);
    if (!m) return;

    const payload = m[1] || '';
    if (!payload.startsWith(PREFIJO)) {
      // /start pelado: es un alta de chat, no un pedido. El bridge ya lo trata como
      // mensaje; aquí no hacemos nada para no duplicar respuestas.
      return;
    }
    await this._abrirBorrador(d?.botName, d?.chatId, d?.from, payload.slice(PREFIJO.length));
  }

  async onTelegramText(event) {
    const d = event?.data || event;
    const texto = String(d?.text || '').trim();

    // ── Vía SIN CÓDIGO: el cliente comparte el pedido con el bot ────────────────
    // Compone en la carta y pulsa «Compartir» → bandeja del móvil → elige este bot.
    // Llega el mismo texto canónico que por WhatsApp (`PEDIDO slug-NONCE`, líneas,
    // `Nombre:` y `#P1`). Se exige el `#P1`: sin ids no hay re-tasado, y sin
    // re-tasado el precio sería el del navegador.
    if (/^PEDIDO\s+/i.test(texto) && /(^|\n)#P1\s+\S+/.test(texto)) {
      await this._pedidoCompartido(d?.botName, d?.chatId, texto);
      return;
    }

    // El cliente pegó el código a mano (formato p_ABC123). Se exige el prefijo: sin él,
    // cualquier palabra corta («HOLA») parecería un código y el cliente recibiría un
    // «no encuentro ese pedido» en vez de hablar con el chat del negocio.
    const m = texto.match(/^p_([A-Za-z0-9]{4,10})$/i);
    if (!m) return;
    await this._abrirBorrador(d?.botName, d?.chatId, d?.from, m[1].toUpperCase());
  }

  /**
   * PEDIDO compartido desde la carta (#P1). El camino corto: no hay borrador, ni
   * código, ni caducidad, ni ruta HTTP que abrir.
   *
   * El negocio se resuelve por el BOT que recibe, no por el slug escrito en el
   * texto: el texto lo teclea el cliente y el slug de otro negocio no debe servir
   * para meter un pedido aquí. El chatId hace de ancla del cliente (sin teléfono).
   */
  async _pedidoCompartido(botName, chatId, texto) {
    const parseado = parsearPedido(texto);
    if (!parseado?.ok) {
      this.logger?.warn?.('pedido-telegram.compartido.ilegible', { kind: parseado?.kind, botName });
      this.metrics?.increment?.('pedido-telegram.compartido.ilegible');
      await this._responder(botName, chatId,
        'No he podido leer el pedido. Vuelve a la carta y pulsa «Compartir con Telegram» otra vez.');
      return;
    }

    // Los ids del #P1 son la única fuente aceptable. El texto de las líneas y el total
    // son para que el cliente vea su pedido; aquí se ignoran.
    const items = Array.isArray(parseado.estructura?.items) ? parseado.estructura.items : null;
    if (!items || items.length === 0) {
      this.logger?.warn?.('pedido-telegram.compartido.sin_ids', { project: parseado.project_slug });
      this.metrics?.increment?.('pedido-telegram.compartido.sin_ids');
      await this._responder(botName, chatId,
        'Ese pedido no trae los productos. Vuelve a la carta y púlsalo desde el botón, por favor.');
      return;
    }

    // El negocio lo decide el BOT que recibe, no el slug escrito en el texto: el texto
    // lo teclea el cliente. Un bot sin proyecto vinculado no crea pedidos (mismo criterio
    // que el 409 CHANNEL_NOT_CONFIGURED de la vía por código).
    const porBot = await this._proyectoPorBot(botName);
    const slug = porBot?.slug || parseado.project_slug;

    if (!porBot?.project_id) {
      this.logger?.warn?.('pedido-telegram.compartido.sin_proyecto', { slug, botName });
      this.metrics?.increment?.('pedido-telegram.compartido.sin_proyecto');
      await this._responder(botName, chatId,
        'Este pedido no es de este negocio. Ábrelo desde la carta del negocio.');
      return;
    }
    const proyecto = { id: porBot.project_id, base_path: porBot.base_path || null };

    this.metrics?.increment?.('pedido-telegram.compartido.recibido', { project: slug });
    this.logger?.info?.('pedido-telegram.compartido', {
      project_slug: slug, items: items.length, bot: botName,
      chat_id: chatId != null ? String(chatId).slice(-4) : null
    });

    await this._crearPedido({
      botName,
      chatId,
      project_slug: slug,
      project_id: proyecto.id,
      base_path: proyecto.base_path || null,
      items,
      nombre_cliente: parseado.cliente_nombre,
      modo_consumo: parseado.modo_consumo,
      hora_recogida: parseado.hora_recogida,
      metodo_pago: parseado.metodo_pago,
      mayor_edad_confirmado: parseado.mayor_edad_confirmado === true
        || parseado.estructura?.mayor_edad_confirmado === true,
      codigo: null,
      origen: 'compartido'
    });
  }

  /**
   * El corazón: código → borrador → RE-TASADO contra la carta → pedido.crear-tienda.
   */
  async _abrirBorrador(botName, chatId, from, codigoRaw) {
    const codigo = String(codigoRaw || '').toUpperCase();
    const borrador = this.borradores.get(codigo);

    if (!borrador) {
      await this._responder(botName, chatId,
        'No encuentro ese pedido. Vuelve a la tienda y pulsa «Pedir por Telegram» otra vez.');
      this.metrics?.increment?.('pedido-telegram.codigo.desconocido');
      return;
    }
    if (Date.now() > borrador.expira_en) {
      this.borradores.delete(codigo);
      await this._guardarBorradores();
      await this._responder(botName, chatId,
        'Ese pedido ha caducado (30 min). Vuelve a la tienda, vuelve a componerlo y pulsa «Pedir por Telegram».');
      this.metrics?.increment?.('pedido-telegram.codigo.caducado');
      return;
    }
    // El bot que abre el código tiene que ser el del negocio que lo generó.
    if (botName && borrador.botName && String(botName) !== String(borrador.botName)) {
      this.logger?.warn?.('pedido-telegram.bot_no_coincide', { botName, esperado: borrador.botName, codigo });
      await this._responder(botName, chatId, 'Este pedido no es de este negocio.');
      return;
    }

    await this._crearPedido({
      botName,
      chatId,
      project_slug: borrador.project_slug,
      project_id: borrador.project_id,
      base_path: borrador.base_path || null,
      items: borrador.items,
      nombre_cliente: borrador.nombre_cliente,
      modo_consumo: borrador.modo_consumo,
      hora_recogida: borrador.hora_recogida,
      metodo_pago: borrador.metodo_pago,
      mayor_edad_confirmado: borrador.mayor_edad_confirmado,
      codigo,
      origen: 'codigo'
    });
  }

  /**
   * El corazón, compartido por las dos entradas (código `p_XXXX` y PEDIDO compartido):
   * RE-TASA contra la carta real y emite `pedido.crear-tienda`.
   *
   * El total NO viene del cliente: sale de `tasarPedido` sobre la carta del servidor.
   * `codigo` != null → se consume ese borrador (un código = un pedido); si el re-tasado
   * falla, el borrador NO se consume y el cliente puede reintentar.
   */
  async _crearPedido(ctx) {
    const { botName, chatId, project_slug, codigo } = ctx;

    const carta = await this._carta(ctx);
    if (!carta) {
      await this._responder(botName, chatId,
        'Estamos cargando la carta. Espera unos segundos y vuelve a intentarlo.');
      this.metrics?.increment?.('pedido-telegram.sin_carta', { project: project_slug });
      return;
    }

    const tasado = tasarPedido(ctx.items, carta);
    if (!tasado.ok) {
      this.logger?.warn?.('pedido-telegram.retasado_fallo', { codigo, errores: tasado.errores });
      this.metrics?.increment?.('pedido-telegram.retasado_fallo', { project: project_slug });
      await this._publicar('pedido-telegram.pedido.rechazado', {
        project_slug,
        codigo,
        motivo: 'retasado',
        errores: tasado.errores
      });
      await this._responder(botName, chatId,
        'Algo de tu pedido ya no está en la carta. Vuelve a la tienda y repítelo, por favor.');
      return;
    }

    const items = tasado.items.map(it => ({
      cantidad: it.cantidad,
      descripcion: it.descripcion,
      producto_id: it.producto_id || null,
      precio_unitario_centimos: it.precio_unitario_centimos,
      precio_total_centimos: it.precio_total_centimos,
      tipo: it.tipo,
      ...(it.variaciones ? { variaciones: it.variaciones } : {}),
      ...(it.ingredientes_base ? { ingredientes_base: it.ingredientes_base } : {})
    }));

    const request_id = crypto.randomUUID();
    const timeoutMs = this.config.pedido_wait_timeout_ms || 30000;

    const timeoutHandle = setTimeout(() => {
      if (!this.pendientes.delete(request_id)) return;
      this.logger?.warn?.('pedido-telegram.pedido.timeout', { codigo, request_id });
      this._responder(botName, chatId,
        'No pudimos cerrar tu pedido a tiempo. Vuelve a la tienda e inténtalo otra vez.').catch(() => {});
    }, timeoutMs);

    this.pendientes.set(request_id, {
      botName, chatId, codigo,
      project_slug,
      nombre_cliente: ctx.nombre_cliente,
      total_centimos: tasado.total_centimos,
      timeoutHandle
    });

    // El borrador se consume aquí: un código = un pedido. Si el bus falla, el
    // cliente recibe el error y vuelve a la tienda (nunca dos pedidos del mismo).
    if (codigo) {
      this.borradores.delete(codigo);
      await this._guardarBorradores();
    }

    await this._publicar('pedido.crear-tienda', {
      request_id,
      correlation_id: request_id,
      project_slug,
      items,
      total_centimos: tasado.total_centimos,
      canal_origen: 'telegram',
      cliente_telegram: chatId != null ? String(chatId) : null,
      cliente_nombre: ctx.nombre_cliente,
      modo_consumo: ctx.modo_consumo,
      hora_recogida: ctx.hora_recogida,
      metodo_pago: ctx.metodo_pago || 'efectivo',
      mayor_edad_confirmado: ctx.mayor_edad_confirmado === true
    });

    this.metrics?.increment?.('pedido-telegram.pedido.solicitado', { project: project_slug });
    this.logger?.info?.('pedido-telegram.pedido.solicitado', {
      project_slug,
      codigo,
      origen: ctx.origen || null,
      items: items.length,
      total_centimos: tasado.total_centimos,
      chat_id: chatId != null ? String(chatId).slice(-4) : null
    });
  }

  async onPedidoCreado(event) {
    const d = event?.data || event;
    const request_id = d?.request_id;
    if (!request_id) return;
    const pend = this.pendientes.get(request_id);
    if (!pend) return;

    if (pend.timeoutHandle) clearTimeout(pend.timeoutHandle);
    this.pendientes.delete(request_id);

    const ok = d?.success !== false && !d?.error;
    if (!ok) {
      const motivo = d?.error?.message || d?.error?.code || 'error del bus';
      this.logger?.warn?.('pedido-telegram.pedido.fallido', { request_id, motivo });
      this.metrics?.increment?.('pedido-telegram.pedido.fallido', { project: pend.project_slug });
      await this._responder(pend.botName, pend.chatId,
        'No pudimos registrar tu pedido. Vuelve a la tienda e inténtalo otra vez.');
      return;
    }

    const r = d?.result || d?.data || {};
    const total = Number.isInteger(pend.total_centimos) ? pend.total_centimos : null;
    const lineas = [
      '✅ Pedido confirmado',
      r.pedido_id ? `Nº ${r.pedido_id}` : null,
      total != null ? `Total: ${(total / 100).toFixed(2).replace('.', ',')} €` : null,
      `A nombre de: ${pend.nombre_cliente || r.cliente_nombre || '—'}`,
      '',
      'Te avisamos por aquí cuando esté listo.'
    ].filter(l => l !== null).join('\n');

    await this._responder(pend.botName, pend.chatId, lineas);
    this.metrics?.increment?.('pedido-telegram.pedido.creado', { project: pend.project_slug });
  }

  // ==========================================
  // Puentes (slug ↔ UUID) y carta
  // ==========================================

  async onProjectActivated(event) {
    const d = event?.data || event;
    const project_id = d?.project_id;
    if (!project_id) return;
    const slug = d?.slug || (d?.base_path ? path.basename(String(d.base_path)) : null);
    if (slug) this.pidPorSlug.set(slug, project_id);
    if (d?.base_path) this.basePathPorPid.set(project_id, d.base_path);
  }

  _slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /** slug → { id, base_path } por project-manager EN PROCESO (misma vía que whatsapp-bot). */
  _resolverProyecto(slug) {
    if (this.pidPorSlug.has(slug)) {
      const id = this.pidPorSlug.get(slug);
      return { id, base_path: this.basePathPorPid.get(id) || null };
    }
    try {
      const pm = this.moduleRegistry?.get?.('project-manager')?.instance;
      const store = pm?.projects;
      const iter = (store && typeof store.values === 'function') ? Array.from(store.values())
        : (Array.isArray(store) ? store : []);
      for (const p of iter) {
        const pid = p?.id || p?.project_id;
        if (!pid) continue;
        const candidatos = [
          p?.slug,
          p?.name ? (pm?._slugify?.(p.name) || this._slugify(p.name)) : null,
          p?.base_path ? path.basename(String(p.base_path)) : null
        ].filter(Boolean);
        if (candidatos.includes(slug)) {
          this.pidPorSlug.set(slug, pid);
          if (p.base_path) this.basePathPorPid.set(pid, p.base_path);
          return { id: pid, base_path: p.base_path || null };
        }
      }
    } catch (err) {
      this.logger?.warn?.('pedido-telegram.proyecto.resolve_failed', { slug, error: err?.message });
    }
    return null;
  }

  _instanciaProductos() {
    const reg = this.moduleRegistry;
    if (!reg || typeof reg.get !== 'function') return null;
    for (const clave of ['productos', 'pizzepos/productos']) {
      const inst = reg.get(clave)?.instance;
      if (inst?.handleCartaCompleta) return inst;
    }
    return null;
  }

  /** Carta del canal digital (la misma que ve el cliente) + fallback al fichero del proyecto. */
  async _carta(borrador) {
    try {
      const inst = this._instanciaProductos();
      if (inst) {
        const r = await inst.handleCartaCompleta({ project_id: borrador.project_id, canal: 'digital' });
        if (r?.status === 200 && r.data) {
          return {
            productos: Array.isArray(r.data.productos) ? r.data.productos : [],
            ingredientes_catalogo: Array.isArray(r.data.ingredientes) ? r.data.ingredientes : []
          };
        }
      }
    } catch (err) {
      this.logger?.warn?.('pedido-telegram.carta.failed', { error: err?.message });
    }
    // Fallback: el fichero de carta que la PWA publicó (mismo dato, sin depender del módulo).
    try {
      const base = borrador.base_path || this.basePathPorPid.get(borrador.project_id);
      if (!base) return null;
      const file = path.join(base, 'storage', 'pizzepos', 'cartas', `carta_${borrador.project_slug}.json`);
      const carta = JSON.parse(await fs.readFile(file, 'utf8'));
      return {
        productos: Array.isArray(carta.productos) ? carta.productos : [],
        ingredientes_catalogo: Array.isArray(carta.ingredientes_catalogo) ? carta.ingredientes_catalogo : []
      };
    } catch (_) {
      return null;
    }
  }

  /** botName vinculado a este proyecto (fuente: registro del telegram-bridge, solo lectura). */
  async _vinculoDelProyecto(project_id) {
    const file = path.join(__dirname, '..', '..', '..', 'data', 'telegram-bridge', 'registro.json');
    try {
      const reg = JSON.parse(await fs.readFile(file, 'utf8'));
      const vinculos = reg?.vinculos || {};
      for (const [botName, v] of Object.entries(vinculos)) {
        if (v?.project_id === project_id) return { botName, ...v };
      }
    } catch (err) {
      this.logger?.warn?.('pedido-telegram.registro.lectura_failed', { error: err?.message });
    }
    return null;
  }

  /** botName → { project_id, slug, base_path } (registro del telegram-bridge, solo lectura). */
  async _proyectoPorBot(botName) {
    if (!botName) return null;
    const file = path.join(__dirname, '..', '..', '..', 'data', 'telegram-bridge', 'registro.json');
    try {
      const reg = JSON.parse(await fs.readFile(file, 'utf8'));
      const v = reg?.vinculos?.[botName];
      if (!v?.project_id) return null;
      const slug = v.project_slug || v.slug
        || (v.base_path ? path.basename(String(v.base_path)) : null);
      return { project_id: v.project_id, slug, base_path: v.base_path || null };
    } catch (err) {
      this.logger?.warn?.('pedido-telegram.bot.sin_vinculo', { botName, error: err?.message });
      return null;
    }
  }

  // ==========================================
  // Utilidades
  // ==========================================

  _validarBorrador(body) {
    const err = (message) => ({ ok: false, error: { code: 'INVALID_INPUT', message } });
    if (!body || typeof body !== 'object' || Array.isArray(body)) return err('body must be an object');
    if (!Array.isArray(body.items) || body.items.length === 0) return err('items required (non-empty array)');

    const items = [];
    for (let i = 0; i < body.items.length; i++) {
      const it = body.items[i];
      if (!it || typeof it !== 'object') return err(`items[${i}] must be an object`);
      if (!Number.isInteger(it.cantidad) || it.cantidad <= 0 || it.cantidad > 999) {
        return err(`items[${i}].cantidad must be integer in [1, 999]`);
      }
      if (it.producto_id == null) return err(`items[${i}].producto_id required (el canal Telegram re-tasa por id)`);
      items.push({ ...it });
    }

    const nombre = typeof body.nombre_cliente === 'string' ? body.nombre_cliente.trim() : '';
    if (!nombre) return err('nombre_cliente required (ancla de recogida)');

    const modo = ['mesa', 'recoger', 'llevar'].includes(body.modo_consumo) ? body.modo_consumo : null;
    const pago = ['efectivo', 'tarjeta'].includes(body.metodo_pago) ? body.metodo_pago : 'efectivo';
    const hora = (modo === 'recoger' && typeof body.hora_recogida === 'string' && body.hora_recogida.trim())
      ? body.hora_recogida.trim().slice(0, 20) : null;

    return {
      ok: true,
      items,
      nombre_cliente: nombre.slice(0, 60),
      modo_consumo: modo,
      hora_recogida: hora,
      metodo_pago: pago,
      mayor_edad_confirmado: body.mayor_edad_confirmado === true
    };
  }

  _nuevoCodigo() {
    for (let intento = 0; intento < 20; intento++) {
      let c = '';
      const bytes = crypto.randomBytes(this.codigoLen);
      for (let i = 0; i < this.codigoLen; i++) c += ALFABETO[bytes[i] % ALFABETO.length];
      if (!this.borradores.has(c)) return c;
    }
    throw new Error('no se pudo generar un código libre');
  }

  _purgar() {
    const ahora = Date.now();
    for (const [codigo, b] of this.borradores) if (ahora > b.expira_en) this.borradores.delete(codigo);
  }

  _rutaBorradores() {
    // data/ vive en la raíz del deploy (/opt/enki/data), junto al registro del bridge.
    return path.join(__dirname, '..', '..', '..', 'data', 'pedido-telegram', 'borradores.json');
  }

  async _cargarBorradores() {
    try {
      const raw = await fs.readFile(this._rutaBorradores(), 'utf8');
      const lista = JSON.parse(raw);
      const ahora = Date.now();
      for (const b of (Array.isArray(lista) ? lista : [])) {
        if (b?.codigo && b.expira_en > ahora) this.borradores.set(b.codigo, b);
      }
    } catch (_) { /* primer arranque */ }
  }

  async _guardarBorradores() {
    try {
      const file = this._rutaBorradores();
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(Array.from(this.borradores.values())), 'utf8');
      await fs.rename(tmp, file);
    } catch (err) {
      this.logger?.warn?.('pedido-telegram.borradores.persist_failed', { error: err?.message });
    }
  }

  async _responder(botName, chatId, text) {
    if (!botName || chatId == null) return;
    try {
      await this.eventBus.publish('telegram.send_message.request', {
        request_id: crypto.randomUUID(),
        botName,
        chatId: Number(chatId),
        text,
        correlation_id: crypto.randomUUID()
      });
    } catch (err) {
      this.logger?.warn?.('pedido-telegram.respuesta.fallida', { error: err?.message });
    }
  }

  async _publicar(nombre, payload) {
    try {
      await this._publicarEvento(nombre, payload);
    } catch (err) {
      this.logger?.warn?.('pedido-telegram.publicar.fallido', { evento: nombre, error: err?.message });
    }
  }
}

module.exports = PedidoTelegramModule;
