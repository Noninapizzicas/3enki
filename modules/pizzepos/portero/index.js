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
    // La config del módulo vive en `config.json → modules_config.portero`, NO en la raíz
    // del config del core. Leerla mal deja el portero siempre apagado (404) aunque esté
    // configurado: se comprobó en el deploy del 20-nov.
    this.config = core.config?.modules_config?.[this.name] || {};
    // RPC canónica entre módulos: el loader inyecta `mqttRequest(domain, action, payload)`,
    // que llama DIRECTO al uiHandler del core. Publicar `ui/request/...` en el eventBus
    // interno NO llega al uiHandler (ese camino es el del bus MQTT), y el turno salía con
    // "no puedo consultar la carta". Comprobado en el deploy del 20-nov.
    this.mqttRequest = core.mqttRequest;
    // Memoria corta de la conversación: si el cliente ya dijo su nombre (o viene con la
    // cuenta del pedido), no se le vuelve a preguntar. No es estado de negocio: es
    // contexto de la charla, con TTL y tope.
    this._sesiones = new Map();
    this._proyectos = new ResolutorProyecto({ eventBus: this.eventBus, logger: this.logger, metrics: this.metrics });
    this.servicio = new LectorServicio({ eventBus: this.eventBus, logger: this.logger, metrics: this.metrics, resolutor: this._proyectos });
    this.logger?.info('module.loaded', { module: this.name, version: this.version, mode: 'portero-determinista' });
  }

  async onUnload() {
    this._ctxCache.clear();
    this._sesiones?.clear();
    this.logger?.info('module.unloaded', { module: this.name });
  }

  // ── infraestructura ────────────────────────────────────────────────────────

  _cfgProyecto(project_id) {
    const c = this.config || {};
    const porProyecto = c.proyectos || c.projects || {};
    return porProyecto[project_id] || c[project_id] || {};
  }
  // RPC entre módulos: `mqttRequest` del loader (uiHandler directo). El fallback por
  // eventBus solo existe para los tests sin core.
  async _ui(dominio, accion, data) {
    if (typeof this.mqttRequest === 'function') {
      try { return await this.mqttRequest(dominio, accion, data); } catch (_) { return null; }
    }
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    return new Promise((resolve) => {
      let unsub = null;
      const t = setTimeout(() => { if (unsub) unsub(); resolve(null); }, RPC_TIMEOUT_MS);
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

    const [pub, cfg, servicio, pedidos, cuentas] = await Promise.all([
      this._ui('cartadigital', 'get_carta_publica', { project_id }),
      this._ui('cartadigital', 'get_config', { project_id }),
      this.servicio.leer(project_id),
      this._ui('pedido', 'list', {}),
      this._ui('cuenta', 'list', { project_id })
    ]);

    const carta = this._cuerpo(pub, 'productos');
    const config = this._cuerpo(cfg, 'opciones_visualizacion') || cfg?.data || {};
    const listaPedidos = pedidos?.data?.pedidos || pedidos?.data?.data?.pedidos || [];
    const listaCuentas = cuentas?.data?.cuentas || cuentas?.data?.data?.cuentas || [];

    const ctx = {
      carta,
      productos: Array.isArray(carta?.productos) ? carta.productos : [],
      opciones: config?.opciones_visualizacion || {},
      servicio: servicio || null,
      // PRIVACIDAD: pedido/list devuelve TODOS los pedidos del sistema. Se filtra por
      // proyecto y se deduplica (el mismo pedido aparece por varias cuentas) AQUÍ, antes
      // de mirar nada, para no enseñar el pedido de otro negocio.
      pedidos: this._pedidosDelProyecto(listaPedidos, listaCuentas, project_id)
    };
    this._ctxCache.set(project_id, { ctx, ts: ahora });
    return ctx;
  }

  // El pedido NO guarda el nombre del cliente: el nombre vive en la CUENTA
  // (`cuenta.nombre`). Sin este cruce, "¿cómo va mi pedido?" nunca encontraba a nadie.
  _pedidosDelProyecto(listaPedidos, listaCuentas, project_id) {
    const nombrePorCuenta = new Map((listaCuentas || []).map(c => [c.id, c.nombre]));
    const vistos = new Set();
    const salida = [];
    for (const p of (listaPedidos || [])) {
      const delProyecto = p.project_id === project_id || p.project_slug === project_id || p.project === project_id;
      if (!delProyecto) continue;
      if (vistos.has(p.id)) continue;   // el Map trae el mismo pedido repetido por cuentas
      vistos.add(p.id);
      salida.push({
        ...p,
        cliente_nombre: p.cliente_nombre || p.nombre_cliente || nombrePorCuenta.get(p.cuenta_id) || null
      });
    }
    return salida;
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
        const pedido = this._pedidoDeCliente(ctx, extra.nombre, extra.cuenta_id);
        if (pedido) return { resuelto: true, texto: `Tu pedido está ${pedido.estado.replace(/_/g, ' ')}. Te aviso en cuanto esté listo.`, acciones: [] };
        // No hay ETA en el sistema: se dice la verdad en vez de prometer minutos.
        return { resuelto: true, texto: 'No te quiero dar un tiempo a ojo: en cuanto lo pidas te digo cómo va.', acciones: [] };
      }

      case 'estado_pedido': {
        const pedido = this._pedidoDeCliente(ctx, extra.nombre, extra.cuenta_id);
        if (!pedido) {
          if (!extra.nombre) return { resuelto: false, texto: 'Dime el nombre con el que hiciste el pedido y te digo cómo va.', acciones: [] };
          return { resuelto: false, texto: `No encuentro un pedido a nombre de ${extra.nombre}. ¿Me lo confirmas?`, acciones: [] };
        }
        const quien = extra.nombre || pedido.cliente_nombre || null;
        return { resuelto: true, texto: `${quien ? `${quien}, tu` : 'Tu'} pedido está ${pedido.estado.replace(/_/g, ' ')}.`, acciones: [] };
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

  _pedidoDeCliente(ctx, nombre, cuenta_id) {
    const pedidos = ctx.pedidos || [];
    // La CUENTA es la identidad del pedido: si el cliente llega con la suya (la que creó
    // al pedir), no hace falta que repita el nombre. Se queda con el más reciente.
    if (cuenta_id) {
      const deCuenta = pedidos.filter(p => p.cuenta_id === cuenta_id);
      if (deCuenta.length) {
        return deCuenta.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
      }
    }
    if (!nombre) return null;
    const n = this._norm(nombre);
    const candidatos = pedidos.filter(p => this._norm(p.cliente_nombre || p.nombre_cliente || '').includes(n));
    if (candidatos.length !== 1) return null;   // 0 o ambiguo: no se adivina
    return candidatos[0];
  }

  // ── contexto de la conversación ─────────────────────────────────────────────

  // Memoria corta por sesión: nombre ya dicho y si estamos esperándolo. TTL 30 min y
  // poda al pasar de 500 sesiones — no es estado de negocio, es la charla.
  _sesion(id) {
    const ahora = Date.now();
    if (!this._sesiones) this._sesiones = new Map();
    if (!id) return { nombre: null, esperando: null, updated: ahora };
    let s = this._sesiones.get(id);
    if (!s || (ahora - s.updated) > 30 * 60 * 1000) {
      s = { nombre: null, esperando: null, updated: ahora };
      this._sesiones.set(id, s);
    }
    s.updated = ahora;
    if (this._sesiones.size > 500) {
      for (const [k, v] of this._sesiones) {
        if ((ahora - v.updated) > 30 * 60 * 1000) this._sesiones.delete(k);
      }
    }
    return s;
  }

  // "soy Mijael", "me llamo Mijael", "a nombre de Mijael". Descarta artículos para no
  // tomar "soy el asistente" como un nombre.
  _nombreDicho(texto) {
    const m = String(texto || '').match(/\b(?:soy|me llamo|a nombre de)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{1,40})/i);
    if (!m) return null;
    const n = m[1].trim().replace(/\s+/g, ' ').replace(/[.,!?¡¿]+$/, '');
    if (/^(el|la|los|las|un|una|de|del)\b/i.test(n)) return null;
    return n.slice(0, 60);
  }

  // Respuesta a "¿con qué nombre?": 1-3 palabras, solo letras, que no sean otra cosa.
  _posibleNombre(texto) {
    const t = String(texto || '').trim().replace(/[.,!?¡¿]+/g, '');
    if (!t || t.split(/\s+/).length > 3) return null;
    if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{1,40}$/.test(t)) return null;
    const NO = new Set(['hola', 'buenas', 'gracias', 'si', 'no', 'vale', 'ok', 'nada', 'carta',
      'precio', 'horario', 'pedido', 'pizza', 'mahon', 'reparto', 'ofertas']);
    if (NO.has(this._norm(t))) return null;
    return t.slice(0, 60);
  }

  // ── HTTP ────────────────────────────────────────────────────────────────────

  async handleChatPost(req) {
    const t0 = Date.now();
    const body = req?.body || {};
    const project_id = body.project_id;
    const message = String(body.message || '').trim();
    const sesion_id = body.sesion_id || body.session_id || null;
    const cuenta_id = body.cuenta_id || null;

    if (!project_id || !message) {
      return this._json(400, { error: { code: 'INVALID_INPUT', message: 'project_id y message son obligatorios' } });
    }

    const cfg = this._cfgProyecto(project_id);
    if (cfg.activado !== true) {
      return this._json(404, { error: { code: 'NOT_FOUND', message: `portero desactivado para ${project_id}` } });
    }
    const modo = cfg.modo === 'vivo' ? 'vivo' : 'sombra';

    // IDENTIDAD: explícita > la de su cuenta/pedido > la que ya dijo en la sesión. Solo
    // se pregunta si no hay ninguna. El nombre del pedido es el que puso el cliente al
    // pedir: si ya está ahí, volver a pedirlo es hacerle repetir lo que ya dijo.
    const sesion = this._sesion(sesion_id);
    let nombre = body.nombre || sesion.nombre || null;
    let intencionPendiente = null;
    const dicho = this._nombreDicho(message);
    if (dicho) { nombre = dicho; sesion.nombre = dicho; sesion.esperando = null; }
    if (!nombre && sesion.esperando === 'nombre') {
      const posible = this._posibleNombre(message);
      if (posible) {
        nombre = posible;
        sesion.nombre = posible;
        // La respuesta al "¿con qué nombre?" NO es una pregunta nueva: es la continuación
        // de la anterior. Sin esto, "Mijael" se clasificaba como intención desconocida y el
        // cliente recibía "No te he entendido" después de haber contestado lo que se le pidió.
        intencionPendiente = sesion.intencion_pendiente || 'estado_pedido';
        sesion.esperando = null;
        sesion.intencion_pendiente = null;
      }
    }

    let ctx, intencion = 'desconocida', respuesta;
    try {
      // EL HECHO COMPLETO, ANTES DE RESPONDER: quién pregunta, con qué sesión y cuenta, y
      // qué dice exactamente. Un consumidor (promociones, marketing, cocina) puede leerlo y
      // reaccionar sin que este módulo sepa que existe. Se publica antes de responder para
      // que el hecho no se pierda si el turno falla.
      try {
        this.eventBus?.publish?.('portero.pregunta', {
          project_id, sesion_id, cuenta_id,
          mensaje: message,
          canal: body.canal || null
        });
      } catch (_) { /* la medición nunca tumba el turno */ }

      ctx = await this._contexto(project_id);
      if (!ctx?.carta) {
        respuesta = { resuelto: false, texto: 'No puedo consultar la carta ahora mismo. Inténtalo en un momento.', acciones: [] };
      } else {
        const c = intencionPendiente
          ? { intencion: intencionPendiente, args: {} }
          : this.clasificar(message, ctx.productos);
        intencion = c.intencion;
        respuesta = this.responder(intencion, c.args, ctx, message, { nombre, cuenta_id });
        // Si la respuesta se quedó corta por no saber quién es, se pide UNA vez y se
        // recuerda para el siguiente turno — incluida la intención que quedó a medias.
        if (!respuesta.resuelto && !nombre && (intencion === 'estado_pedido' || intencion === 'tiempo')) {
          sesion.esperando = 'nombre';
          sesion.intencion_pendiente = intencion;
        }
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
      // Cierre del hecho: qué se interpretó y qué se contestó. Junto con portero.pregunta,
      // deja en un solo punto la pregunta y la respuesta — la demanda real del negocio.
      this.eventBus?.publish?.('portero.respuesta', {
        project_id, sesion_id, cuenta_id,
        mensaje: message,
        intencion,
        resuelto: !!respuesta.resuelto,
        texto: respuesta.texto,
        acciones,
        modo, ms
      });
      if (!respuesta.resuelto) {
        this.eventBus?.publish?.('portero.escalada', {
          project_id, motivo: intencion === 'desconocida' ? 'intencion_desconocida' : 'dato_ausente',
          mensaje: message, intencion
        });
        this.logger?.warn?.('portero.escalada', { project_id, intencion, mensaje: message });
      }
      if (modo === 'sombra') this.logger?.info?.('portero.sombra', { project_id, intencion, resuelto: !!respuesta.resuelto, ms });
    } catch (_) { /* la medición nunca tumba el turno */ }

    return this._sse({
      texto: respuesta.texto,
      acciones,
      fin: { intencion, resuelto: !!respuesta.resuelto, modo, ms }
    });
  }

  // El gateway NO pasa `res` al handler: le entrega (req, ctx) y serializa el RETORNO.
  // CORS ya lo pone el gateway; aquí solo el 204 del preflight.
  async handleChatOptions() {
    return { status: 204, data: null };
  }

  async handleHealthCheck() {
    const c = this.config || {};
    const proyectos = c.proyectos || c.projects || {};
    const estados = Object.entries(proyectos).map(([id, v]) => ({ project_id: id, activado: v?.activado === true, modo: v?.modo || 'sombra' }));
    return this._json(200, { version: this.version, proyectos: estados });
  }

  // ── salidas ────────────────────────────────────────────────────────────────

  // Forma que entiende el gateway: `{status, data}` se respeta tal cual (incluido el 4xx).
  _json(status, body) {
    return { status, data: body };
  }

  // SSE: el gateway lo detecta por `_responseType:'sse'` y llama `onConnect(res)` con el
  // response HTTP REAL. Escribir en el `res` del handler no servía: nunca llega.
  _sse({ texto, acciones, fin }) {
    return {
      status: 200,
      data: {
        _responseType: 'sse',
        onConnect: (res) => {
          try {
            const enviar = (evento, data) => res.write(`event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`);
            for (const trozo of String(texto).match(/[\s\S]{1,24}/g) || []) enviar('token', { t: trozo });
            for (const a of (acciones || [])) enviar('accion', a);
            enviar('fin', fin);
          } catch (err) {
            this.logger?.error('portero.sse.failed', { error: err.message });
          }
          try { res.end(); } catch (_) { /* ignore */ }
        }
      }
    };
  }
}

module.exports = PorteroModule;
