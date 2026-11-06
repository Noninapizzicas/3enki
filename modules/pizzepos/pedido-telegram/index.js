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
 * Telegram NO permite eso en un enlace a un bot: `t.me/<bot>?start=<payload>` admite
 * 64 caracteres y nada más. Por eso hay DOS puertas, y la buena es la segunda:
 *
 *   VÍA A — BANDEJA DE COMPARTIR (la preferida). La carta llama a `navigator.share`
 *   con el MISMO mensaje canónico de WhatsApp (líneas humanas + `#P1` con los ids).
 *   El cliente elige el chat del bot y el texto llega como mensaje normal: sin
 *   código, sin borrador, sin caducidad. Aquí se parsea el mensaje, se RE-TASA
 *   contra la carta y se emite `pedido.crear-tienda` (canal_origen='telegram').
 *
 *   VÍA B — CÓDIGO CORTO (fallback sin bandeja de compartir):
 *   1. La carta POSTea el pedido POR IDS a /tienda/telegram/borrador/<slug>
 *      → este módulo guarda el borrador y devuelve { codigo, url }.
 *   2. La carta abre `https://t.me/<bot>?start=p_<codigo>`.
 *   3. Telegram manda `/start p_<codigo>` al bot del negocio.
 *   4. Aquí se RE-TASA el borrador contra la carta real.
 *   5. `pedidos` crea la cuenta igual que un pedido de mesa y el cliente recibe
 *      la confirmación en SU chat.
 *
 * Las dos vías desembocan en el mismo `_crearPedidoDesde`: ni un precio del cliente
 * entra en el pedido. El chatId es una identidad de hecho — el cliente queda atado a
 * su pedido sin pedirle el teléfono, y el mismo hilo sirve para avisarle del estado.
 * El teléfono era el ancla de WhatsApp; aquí el ancla es el chat.
 *
 * Dinero en CÉNTIMOS de punta a punta. Ni el borrador ni el mensaje compartido
 * mandan el total: mandan ids.
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
const { tasarPedido } = require('../../_shared/pedido-tasador');
const { parsearPedido } = require('../../_shared/pedido-mensaje-parser');

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
    this.compartidos = new Map();  // "<chat>:<slug>:<nonce>" -> ts (anti doble-pulsación)
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
    this.compartidos.clear();
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
      direccion_entrega: validacion.direccion_entrega || null,
      cliente_telefono: validacion.cliente_telefono || null,
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
    // (1) El cliente pegó el CÓDIGO a mano (formato p_ABC123). Se exige el prefijo: sin él,
    // cualquier palabra corta («HOLA») parecería un código y el cliente recibiría un
    // «no encuentro ese pedido» en vez de hablar con el chat del negocio.
    const m = texto.match(/^p_([A-Za-z0-9]{4,10})$/i);
    if (m) {
      await this._abrirBorrador(d?.botName, d?.chatId, d?.from, m[1].toUpperCase());
      return;
    }
    // (2) El cliente COMPARTIÓ el pedido desde la bandeja del móvil (navigator.share).
    // Llega el mensaje canónico de la carta con su línea #P1 — el mismo contrato que
    // WhatsApp. No se confunde con una conversación normal: se exige la cabecera o la #P1.
    if (!/^PEDIDO\s+\S+/i.test(texto) && !/(^|\n)#P1\s+\S+/.test(texto)) return;
    await this._abrirPedidoCompartido(d?.botName, d?.chatId, texto);
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

    await this._crearPedidoDesde(borrador, botName, chatId);
  }

  /**
   * VÍA 2 — el cliente COMPARTE el pedido desde la bandeja del móvil.
   *
   * Es el mismo mensaje canónico de WhatsApp (`navigator.share`), no un código: el
   * cuerpo de un mensaje no tiene el techo de 64 caracteres del `?start=`, así que el
   * carrito entero viaja de una vez y **sin caducidad ni borrador**. El chatId llega
   * igual que en el `/start` y sigue siendo el ancla del pedido.
   *
   * Lo que NO cambia: el precio lo pone el servidor. El mensaje solo aporta los ids
   * del `#P1`; las líneas con euros son decorativas.
   */
  async _abrirPedidoCompartido(botName, chatId, texto) {
    const parsed = parsearPedido(texto);

    // Sin `#P1` no hay ids → no se puede re-tasar. Antes que cobrar el precio del texto
    // (que es editable a mano) se le pide repetirlo desde la carta, que es la única
    // fuente que emite ids.
    if (!parsed.ok || !parsed.estructura) {
      this.logger?.warn?.('pedido-telegram.compartido.ilegible', { kind: parsed?.kind, botName });
      this.metrics?.increment?.('pedido-telegram.compartido.ilegible');
      await this._responder(botName, chatId,
        'No he podido leer el pedido. Vuelve a la carta, compón el pedido y pulsa «Telegram» otra vez.');
      return;
    }

    const proyecto = this._resolverProyecto(parsed.project_slug);
    if (!proyecto?.id) {
      this.logger?.warn?.('pedido-telegram.compartido.sin_proyecto', { slug: parsed.project_slug });
      await this._responder(botName, chatId,
        'No encuentro esa tienda. Vuelve a la carta y pulsa «Telegram» otra vez.');
      return;
    }

    // El slug viaja DENTRO del texto, y el texto es editable a mano: sin este cotejo,
    // cualquiera podría escribir «PEDIDO <otro-negocio>-XXXX» en este chat y pedir
    // contra la carta de otro negocio. El bot que recibe manda.
    const vinculo = await this._vinculoDelProyecto(proyecto.id);
    if (!vinculo?.botName || (botName && String(vinculo.botName) !== String(botName))) {
      this.logger?.warn?.('pedido-telegram.compartido.bot_no_coincide', {
        botName, esperado: vinculo?.botName || null, slug: parsed.project_slug
      });
      await this._responder(botName, chatId, 'Este pedido no es de este negocio.');
      return;
    }

    // Doble pulsación en la bandeja = dos mensajes idénticos = dos pedidos en cocina.
    // El nonce del header identifica el pedido; se recuerda por chat durante el TTL.
    this._purgarCompartidos();
    const clave = `${chatId}:${parsed.project_slug}:${parsed.nonce}`;
    if (this.compartidos.has(clave)) {
      this.metrics?.increment?.('pedido-telegram.compartido.duplicado', { project: parsed.project_slug });
      await this._responder(botName, chatId, 'Ya tengo tu pedido, dame un momento.');
      return;
    }
    this.compartidos.set(clave, Date.now());

    await this._crearPedidoDesde({
      codigo: null,
      project_slug: parsed.project_slug,
      project_id: proyecto.id,
      base_path: proyecto.base_path || null,
      botName: vinculo.botName,
      items: parsed.estructura.items,
      nombre_cliente: parsed.cliente_nombre,
      modo_consumo: parsed.modo_consumo,
      direccion_entrega: parsed.direccion_entrega || null,
      cliente_telefono: parsed.cliente_telefono || null,
      hora_recogida: parsed.hora_recogida,
      metodo_pago: parsed.metodo_pago,
      // El #P1 no lleva el gate de edad (la carta no lo emite): si el proyecto lo
      // necesita, se comprueba al entregar. null = «sin información», no «false».
      mayor_edad_confirmado: parsed.mayor_edad_confirmado
    }, botName, chatId);
  }

  /**
   * El corazón compartido por las dos vías: borrador re-tasado contra la carta viva y
   * `pedido.crear-tienda`. Aquí no entra ni un precio del cliente.
   */
  async _crearPedidoDesde(borrador, botName, chatId) {
    const codigo = borrador.codigo || null;
    const origen = codigo ? 'borrador' : 'compartido';

    const carta = await this._carta(borrador);
    if (!carta) {
      await this._responder(botName, chatId,
        'Estamos cargando la carta. Espera unos segundos y vuelve a abrir el enlace.');
      this.metrics?.increment?.('pedido-telegram.sin_carta', { project: borrador.project_slug });
      return;
    }

    const tasado = tasarPedido(borrador.items, carta);
    if (!tasado.ok) {
      this.logger?.warn?.('pedido-telegram.retasado_fallo', { codigo, origen, errores: tasado.errores });
      this.metrics?.increment?.('pedido-telegram.retasado_fallo', { project: borrador.project_slug });
      await this._publicar('pedido-telegram.pedido.rechazado', {
        project_slug: borrador.project_slug,
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
      project_slug: borrador.project_slug,
      nombre_cliente: borrador.nombre_cliente,
      total_centimos: tasado.total_centimos,
      timeoutHandle
    });

    // Un borrador = un pedido: se consume ANTES de emitir. Si el bus falla, el cliente
    // recibe el error y vuelve a la tienda (nunca dos pedidos del mismo código). El
    // mensaje compartido no tiene código que consumir; su duplicado lo corta el nonce.
    if (codigo) {
      this.borradores.delete(codigo);
      await this._guardarBorradores();
    }

    await this._publicar('pedido.crear-tienda', {
      request_id,
      correlation_id: request_id,
      project_slug: borrador.project_slug,
      items,
      total_centimos: tasado.total_centimos,
      canal_origen: 'telegram',
      cliente_telegram: chatId != null ? String(chatId) : null,
      cliente_nombre: borrador.nombre_cliente,
      modo_consumo: borrador.modo_consumo,
      direccion_entrega: borrador.direccion_entrega || null,
      cliente_telefono: borrador.cliente_telefono || null,
      hora_recogida: borrador.hora_recogida,
      metodo_pago: borrador.metodo_pago || 'efectivo',
      mayor_edad_confirmado: borrador.mayor_edad_confirmado === true
    });

    this.metrics?.increment?.('pedido-telegram.pedido.solicitado', { project: borrador.project_slug });
    this.logger?.info?.('pedido-telegram.pedido.solicitado', {
      project_slug: borrador.project_slug,
      origen,
      codigo,
      items: items.length,
      total_centimos: tasado.total_centimos,
      chat_id: chatId != null ? String(chatId).slice(-4) : null
    });
  }

  _purgarCompartidos() {
    const limite = Date.now() - this.ttlMs;
    for (const [k, t] of this.compartidos) if (t < limite) this.compartidos.delete(k);
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

    const modo = ['mesa', 'recoger', 'llevar', 'domicilio'].includes(body.modo_consumo) ? body.modo_consumo : null;
    const pago = ['efectivo', 'tarjeta'].includes(body.metodo_pago) ? body.metodo_pago : 'efectivo';
    const hora = (modo === 'recoger' && typeof body.hora_recogida === 'string' && body.hora_recogida.trim())
      ? body.hora_recogida.trim().slice(0, 20) : null;
    // Entrega a domicilio: destino y teléfono viajan con el borrador y se exigen al crear
    // el pedido (pedidos es la puerta; aquí solo se transporta).
    const direccion = (modo === 'domicilio' && typeof body.direccion_entrega === 'string' && body.direccion_entrega.trim())
      ? body.direccion_entrega.trim().replace(/\s+/g, ' ').slice(0, 240) : null;
    const telCliente = (modo === 'domicilio' && typeof body.cliente_telefono === 'string' && body.cliente_telefono.trim())
      ? body.cliente_telefono.trim().slice(0, 30) : null;

    return {
      ok: true,
      items,
      nombre_cliente: nombre.slice(0, 60),
      modo_consumo: modo,
      direccion_entrega: direccion,
      cliente_telefono: telCliente,
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
