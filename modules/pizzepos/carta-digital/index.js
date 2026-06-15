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

const CONFIG_PATH = '/pizzepos/carta-digital/config.json';

class CartaDigitalModule extends BaseModule {
  constructor() {
    super();
    this.name = 'carta-digital';
    this.version = '2.0.0';
    // ÚNICO estado: el mapping canal→carta_id por proyecto (de tarifas.config.actualizada).
    this.mappingCanalesPerProject = new Map();
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
    if (d?.project_id) this.eventBus.publish('tarifas.config.solicitada', { project_id: d.project_id, correlation_id: crypto.randomUUID() });
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

  // ── PROYECCIÓN de la carta pública (al vuelo) ──
  async _proyectarPublica(project_id) {
    if (!project_id) return this._err(400, 'INVALID_INPUT', 'project_id requerido');
    const [carta, marca, contenido, config] = await Promise.all([
      this._carta(project_id), this._marca(project_id), this._contenido(project_id), this._leerConfig(project_id)
    ]);
    if (!carta) return this._err(404, 'RESOURCE_NOT_FOUND', 'el canal digital no tiene carta asignada (revisa tarifas) ni hay carta en servicio');

    const cont = contenido || {};
    const categorias = (Array.isArray(carta.categorias) ? carta.categorias : [])
      .filter(c => c.activa !== false)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const productos = (Array.isArray(carta.productos) ? carta.productos : []).map(p => {
      const c = cont[p.id] || {};
      const imgs = Array.isArray(c.imagenes) ? c.imagenes : [];
      const principal = imgs.find(im => im.principal) || imgs[0] || null;
      return {
        id: p.id, nombre: p.nombre,
        precio: (p.precio ?? p.precio_base ?? 0),
        categoria: p.categoria || p.categoria_id || null,
        categoria_id: p.categoria_id || p.categoria || null,
        descripcion: c.descripcion || p.descripcion || '',
        imagen: principal ? principal.url : null,
        imagenes: imgs,
        ingredientes: Array.isArray(p.ingredientes) ? p.ingredientes : (p.ingredientes_base || [])
      };
    });
    const branding = marca ? {
      nombre: marca.esencia?.nombre || null,
      lema: marca.esencia?.lema || null,
      colores: marca.visual?.colores || {},
      tipografias: marca.visual?.tipografias || {},
      logo: marca.visual?.logo || null,
      voz: marca.voz || {},
      negocio: marca.negocio || {}
    } : null;

    return { status: 200, data: {
      branding,
      dominio_publico: config.dominio_publico || null,
      opciones: config.opciones_visualizacion || {},
      categorias, productos,
      generado_at: new Date().toISOString()
    } };
  }

  // ── handlers (ui_handlers) ──
  async handleGetCartaPublica(data) {
    try { return await this._proyectarPublica(data?.project_id); }
    catch (err) { this.logger?.error('carta-digital.get_carta_publica.failed', { error: err.message }); return this._err(500, 'UNKNOWN_ERROR', err.message); }
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
