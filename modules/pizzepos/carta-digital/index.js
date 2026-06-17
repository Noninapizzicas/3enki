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
const { proyectarCartaPublica } = require('./proyeccion');
const { generateStaticHTML, generateServiceWorker, generateManifest, generateIcon, slugify } = require('./static-template');

const CONFIG_PATH = '/pizzepos/carta-digital/config.json';
const DISENO_PATH = '/pizzepos/carta-digital/diseno.json';   // el look que compone Enki, por proyecto
// Bundle estático servido por Caddy en /shop/<slug>. project-manager symlinka
// /opt/enki/public/shop/<slug> → <proyecto>/storage/tienda/bundle/ al activar la feature `tienda`.
// Publicar = escribir aquí; Caddy lo sirve por el symlink (sin reload, sin tocar Caddyfile).
const BUNDLE_DIR = '/tienda/bundle';

class CartaDigitalModule extends BaseModule {
  constructor() {
    super();
    this.name = 'carta-digital';
    this.version = '2.0.0';
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

    const sub = (ev, fn) => { try { this._subs.push(this.eventBus.subscribe(ev, fn)); } catch (_) {} };
    sub('tarifas.config.actualizada', e => this._onTarifas(e));
    sub('carta.actualizada', e => this._reemitir(e));
    sub('carta.editada', e => this._reemitir(e));
    sub('carta.borrada', e => this._reemitir(e));
    sub('contenido.actualizado', e => this._reemitir(e));
    sub('marketing.perfil.actualizado', e => this._reemitir(e));
    sub('project.activated', e => this._onProjectActivated(e));
    sub('project.deactivated', e => this._onProjectDeactivated(e));
    // RPC de bus: el cajón diseñar_carta_digital persiste el diseño por aquí.
    sub('cartadigital.guardar_diseno.request', e => this._onGuardarDisenoRequest(e));
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

  // RPC de bus para el cajón: valida el CONTRATO de slots antes de guardar.
  async _onGuardarDisenoRequest(event) {
    const d = event?.data || event;
    const request_id = d?.request_id;
    const responder = (status, body) => { try { this.eventBus.publish('cartadigital.guardar_diseno.response', { request_id, status, ...body }); } catch (_) {} };
    try {
      if (!d?.project_id || !d?.diseno || typeof d.diseno !== 'object') return responder(400, { error: { code: 'INVALID_INPUT', message: 'project_id y diseno requeridos' } });
      const tpl = d.diseno.card_template;
      if (typeof tpl !== 'string' || !tpl.includes('{{id}}') || !tpl.includes('data-accion') || !tpl.includes('{{nombre}}')) {
        return responder(422, { error: { code: 'INVALID_DESIGN', message: 'card_template debe incluir los hooks del contrato: {{id}}, {{nombre}} y data-accion (detalle|add)' } });
      }
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
    // para que la PWA estática las sirva desde /shop/<slug>/img/... (fs.copy = binario seguro, JS↔JS).
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
    const tplConfig = {
      nombre_negocio: b.nombre || this.activos.get(project_id)?.name || 'Carta',
      moneda: op.moneda || '€',
      whatsapp_telefono: b.negocio?.redes?.whatsapp || b.negocio?.local?.telefono || '',
      pago_online: !!op.pago_online,
      pedido_endpoint: op.pedido_endpoint || '',
      tema: { color_primario: colorPrimario, color_fondo: colorFondo, color_texto: colores.texto || '#e5e5e5', logo_emoji: logoEmoji }
    };

    const html = generateStaticHTML(
      { categorias: data.categorias, productos, alergenos_leyenda: data.alergenos_leyenda },
      tplConfig, { diseno }
    );

    // Escribir el bundle (fs.write hace mkdir -p del dir). Si la feature `tienda` no está
    // activa el symlink no existe y /shop/<slug> dará 404 — lo avisa el aviso, no se finge.
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
      alojada_url: `/shop/${slug}`,
      bundle_dir: 'storage/tienda/bundle',
      productos: productos.length,
      imagenes_copiadas: imagenesCopiadas,
      aviso: `Bundle escrito. Si la feature \`tienda\` está activa en el proyecto, ya se ve en /shop/${slug} (Caddy lo sirve estático por el symlink). Si da 404, activa la feature \`tienda\` (crea el symlink /opt/enki/public/shop/${slug}). Cada cambio requiere volver a publicar — es estático, no al vuelo.`
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
        whatsapp_telefono: b.negocio?.redes?.whatsapp || b.negocio?.local?.telefono || '',
        mensaje_header: op.mensaje_pedido || '¡Hola! Quiero pedir:',
        pago_online: !!op.pago_online,
        pedido_endpoint: '',                           // SUELTA: checkout WhatsApp (no online)
        tema: {
          color_primario: colores.primario || colores.principal || colores.acento || '#f59e0b',
          color_fondo: colores.fondo || '#0a0a0a',
          color_texto: colores.texto || '#e5e5e5',
          logo_emoji: (typeof b.logo === 'string' && b.logo.length <= 4) ? b.logo : '\u{1F355}'
        }
      };
      const html = generateStaticHTML(
        { categorias: d.categorias, productos: d.productos, alergenos_leyenda: d.alergenos_leyenda },
        tplConfig, { diseno }
      );
      return { status: 200, data: { html, productos: d.productos.length } };
    } catch (err) {
      this.logger?.error('carta-digital.preview.failed', { error: err.message });
      return this._err(500, 'UNKNOWN_ERROR', err.message);
    }
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
