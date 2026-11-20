'use strict';

/**
 * portero — CAPA 1 del asistente de la carta: determinista, sin LLM.
 *
 * Regla madre: el portero NO genera hechos. Clasifica la frase del cliente en una de las
 * ocho intenciones de servicio, consulta la VERDAD del proyecto por el bus y rellena una
 * plantilla. Si el dato no está, lo dice. Nunca inventa precio, plazo ni disponibilidad.
 *
 * Fuentes (todas por bus, ninguna copia local):
 *   carta      → cartadigital.get_carta_publica  (la misma proyección que sirve la PWA)
 *   config     → cartadigital.get_config          (modos de consumo, teléfono, pago)
 *   servicio   → LectorServicio                   (horario, excepciones, interruptor)
 *   pedidos    → pedido.list                      (filtrado por project_id SIEMPRE)
 *
 * Modo sombra: responde y registra, pero NO emite `accion` (el carrito no se mueve).
 * Desactivado por defecto: sin `activado: true` en la config del proyecto responde 404.
 */

const crypto = require('crypto');
const BaseModule = require('../../_shared/base-module');
const LectorServicio = require('../../_shared/lector-servicio');
const ResolutorProyecto = require('../../_shared/resolutor-proyecto');
const { estadoServicio } = require('../../_shared/horario-servicio');

const CTX_TTL_MS = 30000;        // carta/servicio/config cambian en caliente: 30 s basta
const RPC_TIMEOUT_MS = 8000;

class PorteroModule extends BaseModule {
  constructor() {
    super();
    this.name = 'portero';
    this.version = require('./module.json').version;
    this.config = null;

    this._ctxCache = new Map();   // project_id → { ctx, ts }
    this._proyectos = null;
    this.servicio = null;
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};
    this._proyectos = new ResolutorProyecto({ eventBus: this.eventBus, logger: this.logger, metrics: this.metrics });
    this.servicio = new LectorServicio({ eventBus: this.eventBus, logger: this.logger, metrics: this.metrics, resolutor: this._proyectos });
    this.logger?.info('module.loaded', { module: this.name, version: this.version, mode: 'portero-determinista' });
  }

  async onUnload() {
    this._ctxCache.clear();
    this.logger?.info('module.unloaded', { module: this.name });
  }

  // ── infraestructura ────────────────────────────────────────────────────────

  _cfgProyecto(project_id) {
    const c = this.config || {};
    const porProyecto = c.proyectos || c.projects || {};
    return porProyecto[project_id] || c[project_id] || {};
  }

  // RPC al wrapper UI del core (mismo camino que usa la PWA para publicar).
  _ui(dominio, accion, data, timeoutMs = RPC_TIMEOUT_MS) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return Promise.resolve(null);
    const request_id = crypto.randomUUID();
    return new Promise((resolve) => {
      let unsub = null;
      const t = setTimeout(() => { if (unsub) unsub(); resolve(null); }, timeoutMs);
      try {
        unsub = this.eventBus.subscribe(`ui/response/${request_id}`, (event) => {
          const d = event?.data || event?.payload || event || {};
          if (!d || d.request_id !== request_id) return;
          clearTimeout(t);
          if (unsub) unsub();
          resolve(d);
        });
        this.eventBus.publish(`ui/request/${dominio}/${accion}`, { request_id, data });
      } catch (_) {
        clearTimeout(t);
        if (unsub) unsub();
        resolve(null);
      }
    });
  }

  // Desenvuelve la respuesta del wrapper: según el handler puede venir {data:{data:{...}}}
  // o {data:{...}}. Se normaliza aquí, en un solo sitio.
  _cuerpo(resp, marca) {
    const d = resp?.data || null;
    if (!d) return null;
    if (d?.data && d.data[marca]) return d.data;
    if (d[marca]) return d;
    return d;
  }

  async _contexto(project_id) {
    const ahora = Date.now();
    const cache = this._ctxCache.get(project_id);
    if (cache && (ahora - cache.ts) < CTX_TTL_MS) return cache.ctx;

    const [pub, cfg, servicio, pedidos] = await Promise.all([
      this._ui('cartadigital', 'get_carta_publica', { project_id }),
      this._ui('cartadigital', 'get_config', { project_id }),
      this.servicio.leer(project_id),
      this._ui('pedido', 'list', {})
    ]);

    const carta = this._cuerpo(pub, 'productos');
    const config = this._cuerpo(cfg, 'opciones_visualizacion') || cfg?.data || {};
    const listaPedidos = pedidos?.data?.pedidos || pedidos?.data?.data?.pedidos || [];

    const ctx = {
      carta,
      productos: Array.isArray(carta?.productos) ? carta.productos : [],
      opciones: config?.opciones_visualizacion || {},
      servicio: servicio || null,
      // PRIVACIDAD: pedido/list devuelve TODOS los pedidos del sistema. Se filtra aquí,
      // antes de mirar nada, para no enseñar el pedido de otro negocio.
      pedidos: listaPedidos.filter(p => (p.project_id === project_id || p.project_slug === project_id || p.project === project_id))
    };
    this._ctxCache.set(project_id, { ctx, ts: ahora });
    return ctx;
  }

  // ── clasificador (determinista) ─────────────────────────────────────────────

  _norm(s) {
    return String(s || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // El producto se busca por el nombre más largo que aparezca en la frase. Evita que
  // "una" o "de" se coman la consulta.
  _productoEn(texto, productos) {
    const t = ' ' + this._norm(texto) + ' ';
    let mejor = null;
    for (const p of productos || []) {
      const n = this._norm(p.nombre);
      if (!n || n.length < 3) continue;
      if (t.includes(' ' + n + ' ') || t.includes(' ' + n)) {
        if (!mejor || n.length > this._norm(mejor.nombre).length) mejor = p;
      }
    }
    return mejor;
  }

  clasificar(texto, productos = []) {
    const t = this._norm(texto);
    const hay = re => re.test(t);
    const producto = this._productoEn(texto, productos);
    const conProducto = producto ? { producto: producto.nombre } : {};

    // Orden por especificidad. `pedir` va al final: es el cajón más ancho.
    if (hay(/\b(mi pedido|como va|esta listo|esta hecho|donde esta mi|pedi hace)\b/))
      return { intencion: 'estado_pedido', args: {} };
    if (hay(/(abiert|cerrad|horario|hasta que hora|a que hora|abris|cerrais|abren|cierran)/))
      return { intencion: 'horario', args: {} };
    if (hay(/(reparto|domicilio|a casa|llevais|llevan|recoger|recogida|donde estais|direccion)/))
      return { intencion: 'reparto', args: {} };
    if (hay(/(cuanto tarda|cuanto tiempo|minutos|para las|cuando estara|cuanto falta)/))
      return { intencion: 'tiempo', args: {} };
    if (hay(/(alergen|gluten|lacteo|lacteos|lactosa|celiac|frutos secos|vegan|sin carne|sin cerdo|sin lactosa)/)) {
      const excluir = [];
      if (hay(/gluten/)) excluir.push('gluten');
      if (hay(/lacteo|lacteos|lactosa/)) excluir.push('lacteos');
      if (hay(/frutos secos/)) excluir.push('frutos_secos');
      return { intencion: 'alergenos', args: { ...conProducto, excluir } };
    }
    if (hay(/(cuanto cuesta|cuanto vale|precio|a como esta)/))
      return { intencion: 'precio', args: conProducto };
    if (hay(/(que lleva|que tiene|ingredientes|de que es|lleva)/))
      return { intencion: 'que_lleva', args: conProducto };
    if (hay(/(oferta|descuento|promo|2x1|rebaja)/))
      return { intencion: 'ofertas', args: {} };
    if (hay(/\b(ponme|dame|quiero|anademe|anademelo|marchando|pedir|una|uno|dos|tres)\b/))
      return { intencion: 'pedir', args: { ...conProducto } };
    if (hay(/\b(hola|buenas|hey|buenos dias|buenas tardes|buenas noches)\b/))
      return { intencion: 'saludo', args: {} };
    return { intencion: 'desconocida', args: {} };
  }

  // ── respondedor ────────────────────────────────────────────────────────────

  _eur(n) { return Number(n || 0).toFixed(2).replace('.', ',') + ' €'; }
  _nombreNegocio(ctx) { return ctx?.carta?.branding?.nombre || 'el local'; }

  // `proxima_apertura` es un OBJETO {fecha, desde, hasta, iso}, no un texto. Formatearlo
  // aquí evita el "[object Object]" que salió en la primera prueba con la carta viva.
  _cuandoAbre(prox, estado) {
    if (!prox) return null;
    const hoy = estado?.ahora?.fecha;
    if (prox.fecha === hoy) return `hoy a las ${prox.desde}`;
    try {
      const d = new Date(prox.fecha + 'T12:00:00Z');
      const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      return `el ${dias[d.getUTCDay()]} a las ${prox.desde}`;
    } catch (_) { return `a las ${prox.desde}`; }
  }

  responder(intencion, args, ctx, textoOriginal = '', extra = {}) {
    const productos = ctx.productos || [];
    const porNombre = n => this._productoEn(n, productos);

    switch (intencion) {
      case 'saludo': {
        return { resuelto: true, texto: `¡Hola! Soy el asistente de ${this._nombreNegocio(ctx)}. Puedo decirte lo que hay, precios, alérgenos u horario, y tomar tu pedido. ¿Qué te apetece?`, acciones: [] };
      }

      case 'horario': {
        if (!ctx.servicio) return { resuelto: false, texto: 'No puedo confirmar el horario ahora mismo. Mejor pregúntale al local.', acciones: [] };
        const e = estadoServicio(ctx.servicio);
        if (e.abierto) return { resuelto: true, texto: `Ahora estamos abiertos${e.hasta ? ` hasta las ${e.hasta}` : ''}. ¿Te preparo algo?`, acciones: [] };
        const prox = e.proxima_apertura;
        const cuando = prox ? this._cuandoAbre(prox, e) : null;
        return { resuelto: true, texto: cuando ? `Ahora está cerrado. Abrimos ${cuando}.` : 'Ahora está cerrado.', acciones: [] };
      }

      case 'que_lleva': {
        const p = args.producto ? porNombre(args.producto) : null;
        if (!p) return { resuelto: false, texto: 'No tengo ese plato en la carta. ¿Quieres que te diga lo que hay?', acciones: [] };
        const ings = (p.ingredientes || []).map(i => i.nombre).filter(Boolean);
        return {
          resuelto: true,
          texto: `${p.nombre}${ings.length ? ': ' + ings.join(', ') : ''}. ${this._eur(p.precio)}.`,
          acciones: []
        };
      }

      case 'alergenos': {
        const p = args.producto ? porNombre(args.producto) : null;
        if (p) {
          const al = p.alergenos || [];
          if (!al.length) return { resuelto: false, texto: `No tengo los alérgenos declarados de ${p.nombre}. Mejor confírmalo en el local.`, acciones: [] };
          return { resuelto: true, texto: `${p.nombre} lleva: ${al.join(', ')}.`, acciones: [] };
        }
        const excluir = args.excluir || [];
        if (!excluir.length) return { resuelto: false, texto: 'Dime qué tienes que evitar y te digo qué puedes comer.', acciones: [] };
        // Solo productos de COMIDA: sin bebidas ni categorías que no sean platos.
        const catBebida = new Set((ctx.carta?.categorias || []).filter(c => /bebida/i.test(c.nombre || '')).map(c => c.id));
        const validos = productos.filter(x => x.disponible !== false && !catBebida.has(x.categoria_id)
          && !excluir.some(a => (x.alergenos || []).map(this._norm).includes(this._norm(a))));
        if (!validos.length) return { resuelto: true, texto: `No tengo platos sin ${excluir.join(' ni ')}.`, acciones: [] };
        return { resuelto: true, texto: `Sin ${excluir.join(' ni ')} tienes: ${validos.slice(0, 5).map(x => x.nombre).join(', ')}. ¿Te digo precios?`, acciones: [] };
      }

      case 'precio': {
        const p = args.producto ? porNombre(args.producto) : null;
        if (!p) return { resuelto: false, texto: 'Dime qué plato y te digo el precio.', acciones: [] };
        return { resuelto: true, texto: `${p.nombre} está a ${this._eur(p.precio)}.`, acciones: [] };
      }

      case 'reparto': {
        const modos = ctx.opciones.modos_consumo || [];
        const rec = ctx.servicio?.recogida || {};
        if (modos.includes('domicilio')) {
          return { resuelto: true, texto: 'Sí, llevamos a domicilio.', acciones: [] };
        }
        const donde = rec.direccion ? ` en ${rec.direccion}${rec.ciudad ? ', ' + rec.ciudad : ''}` : '';
        if (modos.length) {
          return { resuelto: true, texto: `Reparto a domicilio no hacemos. Puedes recoger${donde}.`, acciones: [] };
        }
        return { resuelto: false, texto: 'No puedo confirmar cómo se entrega ahora mismo. Pregúntale al local.', acciones: [] };
      }

      case 'tiempo': {
        const pedido = this._pedidoDeCliente(ctx, extra.nombre);
        if (pedido) return { resuelto: true, texto: `Tu pedido está ${pedido.estado.replace(/_/g, ' ')}. Te aviso en cuanto esté listo.`, acciones: [] };
        // No hay ETA en el sistema: se dice la verdad en vez de prometer minutos.
        return { resuelto: true, texto: 'No te quiero dar un tiempo a ojo: en cuanto lo pidas te digo cómo va.', acciones: [] };
      }

      case 'estado_pedido': {
        if (!extra.nombre) return { resuelto: false, texto: 'Dime el nombre con el que hiciste el pedido y te digo cómo va.', acciones: [] };
        const pedido = this._pedidoDeCliente(ctx, extra.nombre);
        if (!pedido) return { resuelto: false, texto: `No encuentro un pedido a nombre de ${extra.nombre}. ¿Me lo confirmas?`, acciones: [] };
        return { resuelto: true, texto: `${extra.nombre}, tu pedido está ${pedido.estado.replace(/_/g, ' ')}.`, acciones: [] };
      }

      case 'oferta':
      case 'ofertas': {
        const conEtiqueta = productos.filter(p => (p.etiquetas || []).length);
        if (!conEtiqueta.length) return { resuelto: true, texto: 'Hoy no tenemos ofertas activas.', acciones: [] };
        return { resuelto: true, texto: `Hoy tenemos: ${conEtiqueta.slice(0, 4).map(p => p.nombre).join(', ')}.`, acciones: [] };
      }

      case 'pedir': {
        const p = args.producto ? porNombre(args.producto) : null;
        if (!p) return { resuelto: false, texto: 'Dime qué plato quieres y te lo preparo. ¿Te digo la carta?', acciones: [] };
        if (p.disponible === false) return { resuelto: true, texto: `Hoy no tengo ${p.nombre}. ¿Te propongo otra?`, acciones: [] };
        return {
          resuelto: true,
          texto: `Marchando ${p.nombre} (${this._eur(p.precio)}). ¿Para tomar aquí, recoger o llevar?`,
          acciones: [{ tipo: 'anadir_carrito', producto_id: p.id, cantidad: 1 }]
        };
      }

      default:
        return { resuelto: false, texto: 'No te he entendido. Puedo ayudarte con la carta, precios, alérgenos, horario o tomar tu pedido.', acciones: [] };
    }
  }

  _pedidoDeCliente(ctx, nombre) {
    if (!nombre) return null;
    const n = this._norm(nombre);
    const candidatos = (ctx.pedidos || []).filter(p => this._norm(p.cliente_nombre || p.nombre_cliente || '').includes(n));
    if (candidatos.length !== 1) return null;   // 0 o ambiguo: no se adivina
    return candidatos[0];
  }

  // ── HTTP ────────────────────────────────────────────────────────────────────

  async handleChatPost(req, res) {
    const t0 = Date.now();
    const body = req?.body || {};
    const project_id = body.project_id;
    const message = String(body.message || '').trim();
    const nombre = body.nombre || null;

    if (!project_id || !message) {
      return this._json(res, 400, { status: 400, error: { code: 'INVALID_INPUT', message: 'project_id y message son obligatorios' } });
    }

    const cfg = this._cfgProyecto(project_id);
    if (cfg.activado !== true) {
      return this._json(res, 404, { status: 404, error: { code: 'NOT_FOUND', message: `portero desactivado para ${project_id}` } });
    }
    const modo = cfg.modo === 'vivo' ? 'vivo' : 'sombra';

    let ctx, intencion = 'desconocida', respuesta;
    try {
      ctx = await this._contexto(project_id);
      if (!ctx?.carta) {
        respuesta = { resuelto: false, texto: 'No puedo consultar la carta ahora mismo. Inténtalo en un momento.', acciones: [] };
      } else {
        const c = this.clasificar(message, ctx.productos);
        intencion = c.intencion;
        respuesta = this.responder(intencion, c.args, ctx, message, { nombre });
      }
    } catch (err) {
      this.logger?.error('portero.turno.failed', { project_id, error: err.message });
      respuesta = { resuelto: false, texto: 'Se me ha ido el hilo. ¿Me lo repites?', acciones: [] };
    }

    // En sombra NO se emiten acciones: el carrito no se mueve.
    const acciones = modo === 'sombra' ? [] : (respuesta.acciones || []);
    const ms = Date.now() - t0;

    try {
      this.metrics?.increment?.('portero.turno.total', { project: project_id, intencion, modo, resuelto: String(!!respuesta.resuelto) });
      this.eventBus?.publish?.('portero.turno', { project_id, intencion, resuelto: !!respuesta.resuelto, modo, ms });
      if (!respuesta.resuelto) {
        this.eventBus?.publish?.('portero.escalada', {
          project_id, motivo: intencion === 'desconocida' ? 'intencion_desconocida' : 'dato_ausente',
          mensaje: message, intencion
        });
        this.logger?.warn?.('portero.escalada', { project_id, intencion, mensaje: message });
      }
      if (modo === 'sombra') this.logger?.info?.('portero.sombra', { project_id, intencion, resuelto: !!respuesta.resuelto, ms });
    } catch (_) { /* la medición nunca tumba el turno */ }

    return this._sse(res, {
      texto: respuesta.texto,
      acciones,
      fin: { intencion, resuelto: !!respuesta.resuelto, modo, ms }
    });
  }

  async handleChatOptions(req, res) {
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (res && typeof res.status === 'function') res.status(204).end();
    return { status: 204 };
  }

  async handleHealthCheck(req, res) {
    const c = this.config || {};
    const proyectos = c.proyectos || c.projects || {};
    const estados = Object.entries(proyectos).map(([id, v]) => ({ project_id: id, activado: v?.activado === true, modo: v?.modo || 'sombra' }));
    return this._json(res, 200, { status: 200, data: { version: this.version, proyectos: estados } });
  }

  // ── salidas ────────────────────────────────────────────────────────────────

  _json(res, status, body) {
    try {
      if (res && typeof res.status === 'function' && !res.headersSent) {
        res.setHeader?.('Access-Control-Allow-Origin', '*');
        res.setHeader?.('Cache-Control', 'no-store');
        return res.status(status).json(body);
      }
    } catch (_) { /* ignore */ }
    return { status, ...body };
  }

  // SSE: el formato que la PWA ya sabe consumir (token/token/... + accion* + fin).
  _sse(res, { texto, acciones, fin }) {
    try {
      if (res && typeof res.writeHead === 'function' && !res.headersSent) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'X-Accel-Buffering': 'no'
        });
        const enviar = (evento, data) => res.write(`event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`);
        for (const trozo of String(texto).match(/[\s\S]{1,24}/g) || []) enviar('token', { t: trozo });
        for (const a of (acciones || [])) enviar('accion', a);
        enviar('fin', fin);
        res.end();
        return;
      }
    } catch (err) {
      this.logger?.error('portero.sse.failed', { error: err.message });
    }
    return { status: 200, data: { texto, acciones, fin } };
  }
}

module.exports = PorteroModule;
