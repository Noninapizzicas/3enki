/**
 * carta-digital — PROYECTOR del canal DIGITAL (gemelo de `productos`, pero para la carta pública).
 *
 * NO compone ni guarda snapshots: PROYECTA la carta pública AL VUELO bebiendo de las fuentes reales:
 *   tarifas         → qué carta le toca al canal 'digital' (mapping canal→carta, cacheado)
 *   carta-manager   → esa carta (categorías/productos/precios)   [carta.get]
 *   carta-marketing → el branding (nombre/lema/colores/logo/voz) [get_perfil]
 *   contenido       → imágenes/descripción/media por producto    [contenido.get]
 *
 * Lo ÚNICO que posee: el config del CANAL (dominio_publico + opciones de PWA). NO branding (bebe
 * marca), NO productos (bebe carta-manager), NO carta_compuesta de record (proyecta al vuelo →
 * nunca se queda viejo). Reemplaza la composición por agentes (aparcados/muertos) del v1.x.
 *
 * El cf-worker / PWA sirve esta proyección al cliente final (infra, intacta).
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../../_shared/base-module');
const { proyectarCartaPublica, normalizarTelefono } = require('./proyeccion');
const { generateStaticHTML, generateServiceWorker, generateManifest, generateIcon, slugify } = require('./static-template');

const CONFIG_PATH = '/pizzepos/carta-digital/config.json';
const DISENO_PATH = '/pizzepos/carta-digital/diseno.json';   // el look que compone Enki, por proyecto
// Bundle estático servido por Caddy en /<ns>/<slug>/. project-manager symlinka
// /opt/enki/public/<ns>/<slug> → <proyecto>/storage/www/ al activar la feature `www`.
// La PWA de la carta vive en la RAÍZ del www del proyecto (es la home pública); los
// subdirs que suba el comerciante (www/catalogo/, …) conviven al lado y se espejan en
// la URL. Publicar = escribir aquí; Caddy lo sirve por el symlink (sin reload, sin
// tocar Caddyfile). El árbol de www/ se espeja tal cual en /<ns>/<slug>/… (ver www.json).
const BUNDLE_DIR = '/www';

class CartaDigitalModule extends BaseModule {
  constructor() {
    super();
    this.name = 'carta-digital';
    // Versión DERIVADA del manifest (fuente única) → la constante no puede volver a divergir
    // del module.json (antes quedó clavada en 2.7.0 mientras el módulo iba por 2.19.0, y la
    // observabilidad/propiocepción mentían sobre qué versión corre).
    this.version = require('./module.json').version;
    // ÚNICO estado: el mapping canal→carta_id por proyecto (de tarifas.config.actualizada).
    this.mappingCanalesPerProject = new Map();
    // Proyectos activos vistos por project.activated (project_id → {name, slug}) + el ÚLTIMO
    // activado, que es DONDE escribe el filesystem (fs scopea por el último project.activated).
    // El guard de publicar compara contra esto — sin RPC frágil a project-manager.
    this.activos = new Map();
    this.ultimoActivo = null;
    this._subs = [];
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.config = core.config || {};
    this.moduleRegistry = core.moduleRegistry;   // para leer el catálogo de ingredientes por instancia (patrón cuentas-canales→cuentas)

    const sub = (ev, fn) => { try { this._subs.push(this.eventBus.subscribe(ev, fn)); } catch (_) {} };
    sub('tarifas.config.actualizada', e => this._onTarifas(e));
    sub('carta.actualizada', e => this._reemitir(e));
    sub('carta.editada', e => this._reemitir(e));
    sub('carta.borrada', e => this._reemitir(e));
    sub('contenido.actualizado', e => this._reemitir(e));
    sub('marketing.perfil.actualizado', e => this._reemitir(e));
    sub('project.activated', e => this._onProjectActivated(e));
    sub('project.deactivated', e => this._onProjectDeactivated(e));
    // RPC de bus: el cajón diseñar_carta_digital persiste el diseño por aquí (RE-VALIDA como gate).
    sub('cartadigital.guardar_diseno.request', e => this._onGuardarDisenoRequest(e));
    // RPC de bus (FRENO, skill blueprint-agentico): valida el diseño contra el contrato de slots.
    sub('cartadigital.validar.request', e => this._onValidarRequest(e));
    // RPC de bus: el cajón publicar genera el bundle estático (deploy real desde el chat).
    sub('cartadigital.publicar.request', e => this._onPublicarRequest(e));

    try { await this.eventBus.publish('tarifas.config.solicitada', { correlation_id: crypto.randomUUID() }); } catch (_) {}
    this.logger?.info('module.loaded', { module: this.name, version: this.version, mode: 'proyector-canal-digital' });
  }

  async onUnload() {
    for (const u of this._subs) { try { u(); } catch (_) {} }
    this._subs = [];
    this.mappingCanalesPerProject.clear();
    this.logger?.info('module.unloaded', { module: this.name });
  }

  // ── RPC al bus (best-effort) ──
  async _rpc(evento, payload = {}, { timeout_ms = 5000 } = {}) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    const responseEvent = evento.endsWith('.request') ? evento.slice(0, -8) + '.response' : `${evento}.response`;
    return new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => { if (unsub) unsub(); resolve(null); }, timeout_ms);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const d = event?.data || event;
          if (!d || d.request_id !== request_id) return;
          clearTimeout(timeout); if (unsub) unsub(); resolve(d);
        });
        this.eventBus.publish(evento, { request_id, ...payload });
      } catch (_) { clearTimeout(timeout); if (unsub) unsub(); resolve(null); }
    });
  }

  // ── catálogo de ingredientes del proyecto activo (para "añadir" en la PWA) ──
  // FUENTE ÚNICA: la PROYECCIÓN de la carta activa (productos.handleListIngredientes), la MISMA
  // que usa el comandero (AlGustoPanel). Coherente con productos v5.1.0 (catalogo == proyectar
  // (carta_activa)): el comandero ya dejó de leer el módulo `ingredientes` (store en-memoria que
  // en nonina estaba VACÍO); la carta-digital termina aquí esa migración → los dos canales beben
  // de la carta, ninguno depende de ingredientes.json (que aparece/desaparece). canal='digital'
  // para proyectar la carta del canal público. GATE de negocio: SOLO extras con precio_extra>0
  // (no se regalan toppings); con todo a 0 el catálogo viaja vacío → "añadir" degrada a solo-quitar.
  // Soft-fail total → [] (nunca rompe la publicación).
  async _catalogoIngredientes(project_id, canal) {
    try {
      const inst = this.moduleRegistry?.get('productos')?.instance;
      if (!inst?.handleListIngredientes) return { catalogo: [], sin_precio: 0 };
      const r = await inst.handleListIngredientes({ project_id, canal: canal || 'digital' });
      const arr = (r && r.data && r.data.ingredientes) || [];
      const disponibles = arr.filter(i => i && i.disponible !== false);
      // GATE de negocio: la carta pública NO ofrece extras a 0€ (no precio cero). Los que no tienen
      // precio NO se muestran al cliente, pero se CUENTAN (sin_precio) para avisar al dueño.
      const catalogo = disponibles
        .filter(i => Number(i.precio_extra) > 0)
        .map(i => ({
          id: i.id,
          nombre: i.nombre,
          emoji: i.emoji || '',
          tipo: (i.familia || i.tipo || 'otro'),
          grupos: Array.isArray(i.grupos) ? i.grupos : (i.grupo ? [i.grupo] : []),
          precio_extra: Number(i.precio_extra) || 0
        }));
      return { catalogo, sin_precio: disponibles.length - catalogo.length };
    } catch (_) { return { catalogo: [], sin_precio: 0 }; }
  }

  // ── cache del mapping canal→carta (de tarifas) ──
  _onTarifas(event) {
    const d = event?.data || event;
    if (!d?.project_id || !d?.config) return;
    this.mappingCanalesPerProject.set(d.project_id, { general: d.config.general || null, ...(d.config.canales || {}) });
  }
  _onProjectActivated(event) {
    const d = event?.data || event;
    if (!d?.project_id) return;
    // Rastrea el activo + su slug (el evento trae name, igual que lo recibe filesystem).
    // slug = slugify(name), como project-manager para el symlink /opt/enki/public/shop/<slug>.
    const name = d.name || '';
    this.activos.set(d.project_id, { name, slug: name ? slugify(name) : String(d.project_id).slice(0, 8) });
    this.ultimoActivo = d.project_id;
    this.eventBus.publish('tarifas.config.solicitada', { project_id: d.project_id, correlation_id: crypto.randomUUID() });
  }
  _onProjectDeactivated(event) {
    const d = event?.data || event;
    if (!d?.project_id) return;
    this.activos.delete(d.project_id);
    if (this.ultimoActivo === d.project_id) this.ultimoActivo = null;
  }
  // señal de refresco para la PWA/frontend cuando cambia cualquier fuente.
  _reemitir(event) {
    const d = event?.data || event;
    this.eventBus.publish('cartadigital.carta_publica.actualizada', {
      project_id: d?.project_id || null, correlation_id: d?.correlation_id || crypto.randomUUID(), timestamp: new Date().toISOString()
    });
  }

  // ── resolución de la carta del canal 'digital' (digital → general → en_servicio) ──
  async _resolverCarta(project_id) {
    const map = this.mappingCanalesPerProject.get(project_id) || {};
    if (map.digital) return map.digital;
    if (map.general) return map.general;
    const r = await this._rpc('carta.list.request', { project_id });
    if (r?.status === 200 && Array.isArray(r.data)) {
      const e = r.data.find(c => c.estado === 'en_servicio');
      if (e) return e.id;
      const a = r.data.find(c => c.estado !== 'archivada');
      return (a || r.data[0])?.id || null;
    }
    return null;
  }

  async _carta(project_id) {
    const cid = await this._resolverCarta(project_id);
    if (!cid) return null;
    const r = await this._rpc('carta.get.request', { project_id, carta_id: cid });
    return (r?.status === 200) ? r.data : null;
  }
  async _marca(project_id) {
    const r = await this._rpc('carta-marketing.get_perfil.request', { project_id }, { timeout_ms: 6000 });
    return (r?.status === 200) ? r.data : null;
  }
  async _contenido(project_id) {
    const r = await this._rpc('contenido.get.request', { project_id }, { timeout_ms: 6000 });
    return (r?.status === 200 && r.data && typeof r.data === 'object') ? r.data : {};
  }

  // ── config del canal (lo único que posee) ──
  async _leerConfig(project_id) {
    const r = await this._rpc('fs.read.request', { project_id, path: CONFIG_PATH });
    if (!r || r.error || typeof r.content !== 'string') return { _version: '1.0', dominio_publico: null, opciones_visualizacion: {} };
    try { return JSON.parse(r.content); } catch (_) { return { _version: '1.0', dominio_publico: null, opciones_visualizacion: {} }; }
  }
  async _guardarConfig(project_id, config) {
    config._updated_at = new Date().toISOString();
    const r = await this._rpc('fs.write.request', { project_id, path: CONFIG_PATH, content: JSON.stringify(config, null, 2), encoding: 'utf-8', atomic: true });
    if (!r) return { status: 503 };
    if (r.error) return { status: 502, error: r.error };
    return { status: 200 };
  }

  // ── diseño del canal (el LOOK que compone Enki) ──
  async _leerDiseno(project_id) {
    const r = await this._rpc('fs.read.request', { project_id, path: DISENO_PATH });
    if (!r || r.error || typeof r.content !== 'string') return { card_template: null, tema_css: null };
    try { return JSON.parse(r.content); } catch (_) { return { card_template: null, tema_css: null }; }
  }
  async _guardarDiseno(project_id, diseno) {
    const payload = {
      card_template: typeof diseno.card_template === 'string' ? diseno.card_template : null,
      tema_css: typeof diseno.tema_css === 'string' ? diseno.tema_css : null,
      detalle_template: typeof diseno.detalle_template === 'string' ? diseno.detalle_template : null,
      layout: (diseno.layout && typeof diseno.layout === 'object') ? diseno.layout : null,
      generado_at: new Date().toISOString()
    };
    const w = await this._rpc('fs.write.request', { project_id, path: DISENO_PATH, content: JSON.stringify(payload, null, 2), encoding: 'utf-8', atomic: true });
    if (!w) return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: 'fs no responde' } };
    if (w.error) return { status: 502, error: w.error };
    this.eventBus.publish('cartadigital.diseno.actualizada', { project_id, correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString() });
    return { status: 200, data: payload };
  }

  // ── EL FRENO (skill blueprint-agentico). El card_template del diseño tiene un CONTRATO
  //    DE SLOTS explícito: el runtime rellena {{id}} {{nombre}} {{precio}} {{alergenos}}
  //    {{add_label}} y delega los clics por data-accion="detalle"/"add". Si el LLM se deja
  //    un slot, ese campo NO renderiza nunca — un diseño "listo" pero sin precio (carta rota)
  //    o sin alérgenos (ILEGAL, Reg. UE 1169/2011), o sin botón de pedir. El freno exige el
  //    núcleo funcional+legal del contrato; los slots de enriquecimiento (visual/descripcion/
  //    gancho/badges) son opcionales. Función pura: no lee ni escribe. ──
  _checkDiseno(diseno) {
    const errors = [];
    const tpl = (diseno && typeof diseno.card_template === 'string') ? diseno.card_template : null;
    if (!tpl) { errors.push({ code: 'CARD_TEMPLATE_AUSENTE', message: 'card_template debe ser un string con los slots del contrato' }); return { ok: false, errors }; }
    const SLOTS_REQ = ['{{id}}', '{{nombre}}', '{{precio}}', '{{alergenos}}', '{{add_label}}'];
    const faltan = SLOTS_REQ.filter(s => !tpl.includes(s));
    if (faltan.length) errors.push({ code: 'SLOTS_FALTAN', message: `card_template no incluye slots obligatorios: ${faltan.join(' ')}`, faltan });
    if (!/data-accion\s*=\s*["']?detalle/.test(tpl)) errors.push({ code: 'HOOK_DETALLE_AUSENTE', message: 'falta el hook data-accion="detalle" (tap → ficha del producto)' });
    if (!/data-accion\s*=\s*["']?add(?![_a-z])/.test(tpl)) errors.push({ code: 'HOOK_ADD_AUSENTE', message: 'falta el hook data-accion="add" (añadir al carrito)' });
    if (/onclick=|<script/i.test(tpl)) errors.push({ code: 'JS_EN_TEMPLATE', message: 'el card_template no debe traer JS (onclick/<script>): el runtime delega por data-accion' });
    return { ok: errors.length === 0, errors };
  }

  // RPC de bus (FRENO explícito): el cajón diseñar lo llama en bucle antes de guardar.
  async _onValidarRequest(event) {
    const d = event?.data || event;
    const request_id = d?.request_id;
    const responder = (status, body) => { try { this.eventBus.publish('cartadigital.validar.response', { request_id, status, ...body }); } catch (_) {} };
    try {
      const diseno = (d && d.diseno && typeof d.diseno === 'object') ? d.diseno : d;
      if (!diseno || typeof diseno !== 'object') return responder(400, { error: { code: 'INVALID_INPUT', message: 'diseno requerido' } });
      const c = this._checkDiseno(diseno);
      this.metrics?.increment?.('carta-digital.validar', { veredicto: c.ok ? 'valido' : 'invalido' });
      return responder(200, { data: { valid: c.ok, errors: c.errors } });
    } catch (err) {
      return responder(500, { error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  // RPC de bus para el cajón: RE-VALIDA el CONTRATO de slots (gate inquebrantable) antes de guardar.
  async _onGuardarDisenoRequest(event) {
    const d = event?.data || event;
    const request_id = d?.request_id;
    const responder = (status, body) => { try { this.eventBus.publish('cartadigital.guardar_diseno.response', { request_id, status, ...body }); } catch (_) {} };
    try {
      if (!d?.project_id || !d?.diseno || typeof d.diseno !== 'object') return responder(400, { error: { code: 'INVALID_INPUT', message: 'project_id y diseno requeridos' } });
      const c = this._checkDiseno(d.diseno);
      if (!c.ok) return responder(422, { error: { code: 'INVALID_DESIGN', message: 'el card_template no cumple el contrato de slots', details: { errors: c.errors } } });
      const r = await this._guardarDiseno(d.project_id, d.diseno);
      return responder(r.status, r.status >= 400 ? { error: r.error } : { data: r.data });
    } catch (err) {
      return responder(500, { error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }
  async handleGetDiseno(data) {
    if (!data?.project_id) return this._err(400, 'INVALID_INPUT', 'project_id requerido');
    return { status: 200, data: await this._leerDiseno(data.project_id) };
  }


  // ── PUBLICAR: deploy real desde el chat. Genera el bundle estático y lo escribe en
  // storage/tienda/bundle/ (que project-manager symlinka a /opt/enki/public/shop/<slug>/
  // al activar la feature `tienda`). Caddy lo sirve estático — sin reload, sin tocar Caddyfile.
  // NO es servido al vuelo por el gateway: /shop/* es handle_path estático en Caddy.
  async _publicarBundle(project_id, slugHint) {
    if (!project_id) return this._err(400, 'INVALID_INPUT', 'project_id requerido');

    // GUARD anti-escritura-cross-project: el fs escribe en el ÚLTIMO proyecto activado
    // (filesystem._busDispatch descarta el project_id del payload). Si el objetivo no es
    // ese, el bundle iría a otro proyecto en silencio → fallar claro (no_silent_failures).
    // ultimoActivo se rastrea por project.activated (event-driven, sin RPC frágil).
    if (this.ultimoActivo && project_id !== this.ultimoActivo) {
      const nomActivo = this.activos.get(this.ultimoActivo)?.name || this.ultimoActivo;
      return this._err(412, 'PRECONDITION_FAILED',
        `el filesystem escribe en el proyecto activo («${nomActivo}»), no en el objetivo (${project_id}). Activa el proyecto objetivo antes de publicar para no escribir su carta en otro.`);
    }
    const slug = slugHint || this.activos.get(project_id)?.slug || String(project_id).slice(0, 8);

    const proy = await this._proyectarPublica(project_id);
    if (proy.status !== 200) return proy;   // 404 sin carta / 503 fuentes caídas — propaga

    const data = proy.data;
    const b = data.branding || {};
    const colores = b.colores || {};
    const [diseno, config] = await Promise.all([
      this._leerDiseno(project_id), this._leerConfig(project_id)
    ]);
    const op = config.opciones_visualizacion || {};

    // Imágenes: copiar las locales al bundle (img/<basename>) y reescribir la url a relativa,
    // para que la PWA estática las sirva desde /<ns>/<slug>/img/... (fs.copy = binario seguro, JS↔JS).
    let imagenesCopiadas = 0;
    const productos = [];
    for (const p of (data.productos || [])) {
      const prod = { ...p };
      if (prod.imagen && typeof prod.imagen === 'string' && !/^https?:\/\//.test(prod.imagen)) {
        const base = prod.imagen.split('/').pop();
        const dest = `${BUNDLE_DIR}/img/${base}`;
        const cp = await this._rpc('fs.copy.request', { project_id, from: prod.imagen, to: dest });
        if (cp && !cp.error) { prod.imagen = `img/${base}`; imagenesCopiadas++; }
      }
      productos.push(prod);
    }

    const colorPrimario = colores.primario || colores.principal || colores.acento || '#f59e0b';
    const colorFondo = colores.fondo || '#0a0a0a';
    const logoEmoji = (typeof b.logo === 'string' && b.logo.length <= 4) ? b.logo : '\u{1F355}';
    // NOTA: el ALOJADO NO setea ai_endpoint a propósito → el chat IA sale OFF (autoservicio
    // puro: carta+carrito+pedido→cocina). El cerebro del chat es el cf-worker del escenario
    // SUELTO (export-cli + cf-worker/deploy.js); el core no sirve HTTP-SSE de chat. No cablear
    // aquí un endpoint de chat sin tener un worker detrás (sería apuntar a un fantasma).
    // Prefijo público global (el "botón único": config.json web.public_ns). El bundle
    // se sirve en /<ns>/<slug>/ (raíz del www del proyecto). Ver lib/public-ns.js.
    let nsPub = 'a';
    try { nsPub = require('../../../lib/public-ns.js').publicNs(); } catch (_) { /* default 'a' */ }
    const tplConfig = {
      nombre_negocio: b.nombre || this.activos.get(project_id)?.name || 'Carta',
      moneda: op.moneda || '€',
      whatsapp_telefono: normalizarTelefono(op.whatsapp_telefono || b.negocio?.redes?.whatsapp || b.negocio?.local?.telefono || ''),
      mensaje_header: op.mensaje_pedido || '¡Hola! Quiero pedir:',
      project_slug: slug,
      // Caddy sirve el bundle en /<ns>/<slug>/. La <base> hace que img/·manifest·sw·iconos
      // resuelvan bien aunque se abra la URL sin barra final → evita el 404 de assets sin slug.
      // El SUELTO (export-cli, raíz del dominio) NO setea base_href.
      base_href: `/${nsPub}/${slug}/`,
      pago_online: !!op.pago_online,
      pedido_endpoint: op.pedido_endpoint || '',
      tema: { color_primario: colorPrimario, color_fondo: colorFondo, color_texto: colores.texto || '#e5e5e5', logo_emoji: logoEmoji }
    };

    const { catalogo: catalogo_ingredientes, sin_precio: extrasSinPrecio } = await this._catalogoIngredientes(project_id, 'digital');
    const html = generateStaticHTML(
      { categorias: data.categorias, productos, alergenos_leyenda: data.alergenos_leyenda, catalogo_ingredientes },
      tplConfig, { diseno }
    );

    // 2º FRENO (render real): no DESPLEGAR un bundle que renderiza roto. Se lo pide al
    // órgano verificador-visual (abre Chromium y mira). BEST-EFFORT: solo bloquea si
    // pudo MIRAR de verdad (verificado && !ok). Sin órgano, sin navegador en el host
    // o sin respuesta → se publica igual (no se vuelve dependencia dura del deploy).
    //
    // OJO: el verificador renderiza el HTML SUELTO (Chromium headless, about:blank, SIN
    // servidor). El bundle usa `<img src="img/...">` relativo a /<ns>/<slug>/ — que ahí NO
    // se puede bajar → naturalWidth=0 → 'imagenes_rotas' = FALSO POSITIVO que tumbaba todo
    // publish con imágenes. Para verificar NO inlineamos las imágenes REALES (43×~400KB =
    // HTML de ~23MB → render de ~30s y el botón del frontend corta a 10s): basta un
    // placeholder 1×1. El verificador comprueba layout/overflow/blank/console SIN falso
    // 'imagenes_rotas' y SIN payload pesado. La integridad de copia la da `imagenesCopiadas`.
    const PLACEHOLDER_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const productosVerif = (data.productos || []).map(p => {
      const im = p.imagen;
      const local = im && typeof im === 'string' && !/^https?:\/\//.test(im);
      return local ? { ...p, imagen: PLACEHOLDER_IMG } : { ...p };
    });
    const htmlVerif = generateStaticHTML(
      { categorias: data.categorias, productos: productosVerif, alergenos_leyenda: data.alergenos_leyenda, catalogo_ingredientes },
      tplConfig, { diseno }
    );
    const rnd = await this._rpc('render.verificar.request', { html: htmlVerif, etiqueta: slug }, { timeout_ms: 20000 });
    const rd = rnd && (rnd.data || rnd);
    if (rd && rd.verificado === true && rd.ok === false) {
      this.metrics?.increment?.('cartadigital.publicar.render_roto', { project: slug });
      return this._err(422, 'UPSTREAM_INVALID_RESPONSE', `la carta digital RENDERIZA rota (${(rd.motivos || []).join(', ')}) — NO publicada`);
    }
    // carta-digital es una PWA de MÓVIL: una carta que se sale del ancho en el teléfono está
    // ROTA para este canal (aunque el render de escritorio pase). Promovemos el aviso SOFT
    // overflow_movil a BLOQUEO — el caller elige su severidad (verificador-visual v1.1.0).
    if (rd && rd.verificado === true && Array.isArray(rd.avisos) && rd.avisos.includes('overflow_movil')) {
      this.metrics?.increment?.('cartadigital.publicar.overflow_movil', { project: slug });
      return this._err(422, 'UPSTREAM_INVALID_RESPONSE', 'la carta digital se SALE DEL ANCHO en móvil (overflow_movil) — NO publicada (es una PWA de móvil)');
    }

    // Auto-activar la feature `www` (crea el symlink /opt/enki/public/<ns>/<slug> → storage/www)
    // ANTES de escribir → /<ns>/<slug> sirve sin paso manual. Best-effort e IDEMPOTENTE: si ya
    // está instalada, project-manager no re-inicializa. project-manager es el ÚNICO dueño del
    // symlink; aquí solo se le PIDE. Si no responde, el aviso de abajo lo dice (no se finge).
    let featureOk = false;
    try {
      const ef = await this._rpc('project.ensure-feature.request', { id: project_id, features: ['www'] }, { timeout_ms: 8000 });
      featureOk = !!(ef && typeof ef.status === 'number' && ef.status < 400);
    } catch (_) { /* best-effort */ }

    // Escribir el bundle (fs.write hace mkdir -p del dir). Si la feature `www` no está
    // activa el symlink no existe y /<ns>/<slug> dará 404 — lo avisa el aviso, no se finge.
    const files = [
      [`${BUNDLE_DIR}/index.html`, html],
      [`${BUNDLE_DIR}/sw.js`, generateServiceWorker(tplConfig.nombre_negocio)],
      [`${BUNDLE_DIR}/manifest.json`, generateManifest(tplConfig.nombre_negocio, colorPrimario, colorFondo)],
      [`${BUNDLE_DIR}/icon-192.svg`, generateIcon(192, logoEmoji, colorPrimario, colorFondo)],
      [`${BUNDLE_DIR}/icon-512.svg`, generateIcon(512, logoEmoji, colorPrimario, colorFondo)]
    ];
    for (const [pth, content] of files) {
      const w = await this._rpc('fs.write.request', { project_id, path: pth, content, encoding: 'utf-8', atomic: true });
      if (!w || w.error) {
        return this._err(w ? 502 : 503, w ? 'UPSTREAM_INVALID_RESPONSE' : 'UPSTREAM_UNREACHABLE',
          `no se pudo escribir ${pth}: ${w?.error?.message || 'fs no responde'}`);
      }
    }

    this.eventBus.publish('cartadigital.publicado', {
      project_id, slug, productos: productos.length, imagenes: imagenesCopiadas,
      correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    });
    this.metrics?.increment?.('cartadigital.publicado', { project: slug });

    return { status: 200, data: {
      alojada_url: `/${nsPub}/${slug}`,
      bundle_dir: 'storage/www',
      productos: productos.length,
      imagenes_copiadas: imagenesCopiadas,
      extras_sin_precio: extrasSinPrecio,
      ...(extrasSinPrecio > 0 ? { aviso_extras: `${extrasSinPrecio} ingredientes extra sin precio — NO se ofrecen en la carta pública. Ponles precio para activarlos como extras.` } : {}),
      feature_www: featureOk,
      aviso: featureOk
        ? `Bundle escrito y feature \`www\` asegurada → se ve en /${nsPub}/${slug} (Caddy lo sirve estático por el symlink). Cada cambio requiere volver a publicar — es estático, no al vuelo.`
        : `Bundle escrito, pero no se pudo confirmar la feature \`www\` (project-manager no respondió). Si da 404, actívala a mano (crea el symlink /opt/enki/public/${nsPub}/${slug}). Cada cambio requiere volver a publicar — es estático, no al vuelo.`
    } };
  }

  // RPC de bus para el cajón `publicar`.
  async _onPublicarRequest(event) {
    const d = event?.data || event;
    const request_id = d?.request_id;
    const responder = (status, body) => { try { this.eventBus.publish('cartadigital.publicar.response', { request_id, status, ...body }); } catch (_) {} };
    try {
      const r = await this._publicarBundle(d?.project_id, d?.slug);
      return responder(r.status, r.status >= 400 ? { error: r.error } : { data: r.data });
    } catch (err) {
      this.logger?.error('carta-digital.publicar.failed', { error: err.message });
      return responder(500, { error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }

  // ui_handler: publicar desde el frontend/LLM.
  async handlePublicar(data) {
    try { return await this._publicarBundle(data?.project_id, data?.slug); }
    catch (err) { this.logger?.error('carta-digital.publicar.failed', { error: err.message }); return this._err(500, 'UNKNOWN_ERROR', err.message); }
  }

  // ── PROYECCIÓN de la carta pública (al vuelo) ──
  async _proyectarPublica(project_id) {
    if (!project_id) return this._err(400, 'INVALID_INPUT', 'project_id requerido');
    const [carta, marca, contenido, config] = await Promise.all([
      this._carta(project_id), this._marca(project_id), this._contenido(project_id), this._leerConfig(project_id)
    ]);
    if (!carta) return this._err(404, 'RESOURCE_NOT_FOUND', 'el canal digital no tiene carta asignada (revisa tarifas) ni hay carta en servicio');

    return { status: 200, data: proyectarCartaPublica(carta, marca, contenido, config) };
  }

  // ── handlers (ui_handlers) ──
  async handleGetCartaPublica(data) {
    try { return await this._proyectarPublica(data?.project_id); }
    catch (err) { this.logger?.error('carta-digital.get_carta_publica.failed', { error: err.message }); return this._err(500, 'UNKNOWN_ERROR', err.message); }
  }

  // PREVIEW del PWA SIN DOMINIO: genera el HTML real (variante SUELTA → checkout WhatsApp,
  // sin pedido_endpoint) y lo DEVUELVE (no escribe nada). El frontend lo mete en un iframe.
  // Mismo generateStaticHTML que ve el cliente → preview fiel, no maqueta.
  async handlePreview(data) {
    try {
      const project_id = data?.project_id;
      if (!project_id) return this._err(400, 'INVALID_INPUT', 'project_id requerido');
      const proy = await this._proyectarPublica(project_id);
      if (proy.status !== 200) return proy;            // 404 sin carta / 503 fuentes — propaga
      const d = proy.data;
      const b = d.branding || {};
      const colores = b.colores || {};
      const [diseno, config] = await Promise.all([this._leerDiseno(project_id), this._leerConfig(project_id)]);
      const op = config.opciones_visualizacion || {};
      const tplConfig = {                              // espejo del de publicar, pero suelta
        nombre_negocio: b.nombre || this.activos.get(project_id)?.name || 'Carta',
        moneda: op.moneda || '€',
        whatsapp_telefono: normalizarTelefono(op.whatsapp_telefono || b.negocio?.redes?.whatsapp || b.negocio?.local?.telefono || ''),
        mensaje_header: op.mensaje_pedido || '¡Hola! Quiero pedir:',
        project_slug: this.activos.get(project_id)?.slug || String(project_id).slice(0, 8),
        pago_online: !!op.pago_online,
        pedido_endpoint: '',                           // SUELTA: checkout WhatsApp (no online)
        tema: {
          color_primario: colores.primario || colores.principal || colores.acento || '#f59e0b',
          color_fondo: colores.fondo || '#0a0a0a',
          color_texto: colores.texto || '#e5e5e5',
          logo_emoji: (typeof b.logo === 'string' && b.logo.length <= 4) ? b.logo : '\u{1F355}'
        }
      };
      const { catalogo: catalogo_ingredientes, sin_precio: extrasSinPrecio } = await this._catalogoIngredientes(project_id, 'digital');
      // El preview va a un <iframe srcdoc> sin copia de assets: las imágenes de storage
      // (/pizzepos/contenido/imagenes/...) no tienen URL servible → se INLINEAN como data: URI
      // para que se vean (en publicar NO: ahí se copian a img/, más ligero y cacheable).
      const productosInline = await this._inlineImagenes(project_id, d.productos);
      const html = generateStaticHTML(
        { categorias: d.categorias, productos: productosInline, alergenos_leyenda: d.alergenos_leyenda, catalogo_ingredientes },
        tplConfig, { diseno }
      );
      return { status: 200, data: { html, productos: d.productos.length, extras_sin_precio: extrasSinPrecio,
        ...(extrasSinPrecio > 0 ? { aviso_extras: `${extrasSinPrecio} ingredientes extra sin precio — no se ofrecen en la carta pública.` } : {}) } };
    } catch (err) {
      this.logger?.error('carta-digital.preview.failed', { error: err.message });
      return this._err(500, 'UNKNOWN_ERROR', err.message);
    }
  }

  // Inlinea las imágenes de producto (de storage) como data: URI — SOLO para el preview en
  // iframe srcdoc, que no tiene copia de assets ni ruta HTTP para /pizzepos/contenido/imagenes/.
  // Best-effort: si una imagen no se puede leer, se deja sin imagen (placeholder), nunca 404.
  async _inlineImagenes(project_id, productos) {
    const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp' };
    const out = [];
    for (const p of (productos || [])) {
      const prod = { ...p };
      const im = prod.imagen;
      if (im && typeof im === 'string' && !/^(https?:|data:)/.test(im)) {
        try {
          const r = await this._rpc('fs.read.request', { project_id, path: im });
          if (r && !r.error && typeof r.content === 'string' && r.content) {
            const ext = (im.split('.').pop() || '').toLowerCase();
            prod.imagen = `data:${MIME[ext] || 'image/jpeg'};base64,${r.content}`;
          } else {
            prod.imagen = null;
          }
        } catch (_) { prod.imagen = null; }
      }
      out.push(prod);
    }
    return out;
  }
  async handleGetConfig(data) {
    if (!data?.project_id) return this._err(400, 'INVALID_INPUT', 'project_id requerido');
    return { status: 200, data: await this._leerConfig(data.project_id) };
  }
  async handleUpdateConfig(data) {
    if (!data?.project_id) return this._err(400, 'INVALID_INPUT', 'project_id requerido');
    if (!data.campos || typeof data.campos !== 'object') return this._err(400, 'INVALID_INPUT', 'campos requerido');
    const config = await this._leerConfig(data.project_id);
    // solo lo del canal: dominio_publico + opciones_visualizacion (branding/productos NO se guardan aquí).
    if ('dominio_publico' in data.campos) config.dominio_publico = data.campos.dominio_publico;
    if (data.campos.opciones_visualizacion && typeof data.campos.opciones_visualizacion === 'object') {
      config.opciones_visualizacion = { ...(config.opciones_visualizacion || {}), ...data.campos.opciones_visualizacion };
    }
    const w = await this._guardarConfig(data.project_id, config);
    if (w.status >= 400) return w;
    this.eventBus.publish('cartadigital.config.actualizada', { project_id: data.project_id, correlation_id: data.correlation_id || crypto.randomUUID(), timestamp: new Date().toISOString() });
    return { status: 200, data: config };
  }

  _err(status, code, message, details) {
    const error = { code, message }; if (details) error.details = details;
    return { status, error };
  }
}

module.exports = CartaDigitalModule;
