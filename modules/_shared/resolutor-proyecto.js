'use strict';

/**
 * ResolutorProyecto — la identidad de un proyecto, en UN SOLO CAMINO: el SLUG.
 *
 * El bus admite dos llaves para el mismo proyecto (id UUID y slug) y quien escribe
 * ficheros por proyecto (`/data/projects/<llave>/`) parte el dato en dos carpetas
 * cuando cada consumidor usa la suya. Verificado en vivo con the-pirate: cuentas
 * de mesa en la carpeta UUID y de llevar en la de slug, invisibles entre sí.
 *
 * Este resolutor cierra esa grieta en el BORDE: cualquier llave que llegue
 * (uuid o slug) se resuelve al slug, que es el nombre de la carpeta física.
 *
 * El mapa id→slug NO se re-deriva aquí: lo calcula su dueño (project-manager) y
 * viaja en `project.list.response`. El respaldo es `base_path` — la carpeta real
 * del disco —, no una segunda copia del algoritmo de slugify.
 *
 * Degradación honesta: si el bus no contesta, se devuelve la llave tal cual.
 * Nunca se inventa una identidad.
 */
class ResolutorProyecto {
  static UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor({ eventBus, logger = null, metrics = null, timeoutMs = 5000, reintentoMs = 30000 } = {}) {
    this.eventBus   = eventBus;
    this.logger     = logger;
    this.metrics    = metrics;
    this.timeoutMs  = timeoutMs;
    this.reintentoMs = reintentoMs;

    this.cache      = new Map();   // id|slug → slug
    this._cargando  = null;        // promesa en vuelo (dedupe)
    this._intentadoEn = 0;         // último intento (no reintentar en bucle)
  }

  // RPC al bus — publica <ev>.request y espera <ev>.response correlada por request_id.
  // Best-effort: sin respuesta en timeoutMs resuelve null (no cuelga al llamante).
  _rpc(evento, payload = {}) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return Promise.resolve(null);
    const request_id = require('crypto').randomUUID();
    const responseEvent = evento.endsWith('.request')
      ? evento.slice(0, -('.request'.length)) + '.response'
      : `${evento}.response`;

    return new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => { if (unsub) unsub(); resolve(null); }, this.timeoutMs);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const d = event?.data || event?.payload || event || {};
          if (!d || d.request_id !== request_id) return;
          clearTimeout(timeout);
          if (unsub) unsub();
          resolve(d);
        });
        this.eventBus.publish(evento, { request_id, ...payload });
      } catch (_) {
        clearTimeout(timeout);
        if (unsub) unsub();
        resolve(null);
      }
    });
  }

  async cargarSlugs({ recargar = false } = {}) {
    if (!recargar && this.cache.size > 0) return this.cache;
    if (this._cargando) return this._cargando;
    if (!recargar && this._intentadoEn && (Date.now() - this._intentadoEn) < this.reintentoMs) {
      return this.cache;
    }

    this._cargando = (async () => {
      const r = await this._rpc('project.list.request');
      const proyectos = Array.isArray(r?.projects) ? r.projects : [];
      for (const p of proyectos) {
        const slug = p?.slug || (p?.base_path ? require('path').basename(p.base_path) : null);
        if (!slug) continue;
        if (p.id) this.cache.set(String(p.id), slug);
        this.cache.set(slug, slug);
      }
      this._intentadoEn = Date.now();
      if (proyectos.length === 0) {
        this.metrics?.increment?.('resolutor-proyecto.errors', 1,
          { kind: 'slugs_proyecto', code: 'UPSTREAM_TIMEOUT' });
        this.logger?.warn?.('resolutor.proyecto.sin_respuesta', { timeout_ms: this.timeoutMs });
      } else {
        this.logger?.debug?.('resolutor.proyecto.cargado', { proyectos: proyectos.length });
      }
      return this.cache;
    })().finally(() => { this._cargando = null; });

    return this._cargando;
  }

  // uuid | slug → slug. Lo desconocido se respeta tal cual.
  async slugDe(projectId) {
    if (projectId === null || projectId === undefined || projectId === '') return projectId;
    const pid = String(projectId);
    if (!ResolutorProyecto.UUID_RE.test(pid)) return pid;   // ya es slug (o id legacy)
    const mapa = await this.cargarSlugs();
    return mapa.get(pid) || pid;
  }

  // Dos llaves distintas son el mismo proyecto cuando resuelven al mismo slug.
  async mismoProyecto(a, b) {
    const [sa, sb] = await Promise.all([this.slugDe(a), this.slugDe(b)]);
    return sa === sb;
  }

  // La vuelta del mismo mapa: slug → uuid. Sirve para hablar la llave que viaja
  // en los eventos del bus (project_id) cuando lo unico que se tiene es el slug.
  // Best-effort: si el mapa no esta, devuelve null (nunca inventa identidad).
  async idDe(projectId) {
    if (projectId === null || projectId === undefined || projectId === '') return null;
    const pid = String(projectId);
    if (ResolutorProyecto.UUID_RE.test(pid)) return pid;
    const mapa = await this.cargarSlugs();
    for (const [llave, slug] of mapa) {
      if (slug === pid && ResolutorProyecto.UUID_RE.test(llave)) return llave;
    }
    return null;
  }

  // Calienta el mapa en segundo plano (el primer uso no paga el RPC).
  calentar() {
    this.cargarSlugs().catch(() => { /* best-effort */ });
  }
}

module.exports = ResolutorProyecto;
