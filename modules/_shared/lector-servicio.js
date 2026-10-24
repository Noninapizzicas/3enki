'use strict';

const ResolutorProyecto = require('./resolutor-proyecto');

/**
 * LectorServicio — la ÚNICA puerta a la config de servicio de un proyecto.
 *
 * Lee `/pizzepos/servicio/config.json` del storage del proyecto por el bus (`fs.read.request`),
 * con caché corta: un cierre puesto por el dueño tiene que morder en segundos, no en el
 * siguiente deploy. La caché se invalida además con `servicio.cambiado`.
 *
 * Una llave, dos consumidores (pizzepos/pedidos frena, tienda-api informa): el DATO
 * es el mismo y el que decide quién frena es la puerta del pedido, no este lector.
 *
 * Degradación honesta: si el bus no contesta en `timeoutMs`, devuelve `null` y quien
 * llama decide. Sin config NO se cierra nada (un fallo de lectura no puede parar el
 * negocio); el freno es una decisión escrita, no un efecto de un timeout.
 */

const CONFIG_PATH_POR_DEFECTO = '/pizzepos/servicio/config.json';

// El fichero admite las dos formas: el bloque suelto ({ horario, interruptor, recogida })
// o envuelto ({ servicio: {...} }) como los demás configs de módulo. Se acepta el mismo
// dato por las dos puertas para que nadie tenga que adivinar el envoltorio.
function extraerServicio(cfg) {
  if (!cfg || typeof cfg !== 'object') return {};
  if (cfg.servicio && typeof cfg.servicio === 'object') return cfg.servicio;
  return cfg;
}

class LectorServicio {
  constructor({
    eventBus,
    logger = null,
    metrics = null,
    resolutor = null,
    configPath = CONFIG_PATH_POR_DEFECTO,
    ttlMs = 15000,
    timeoutMs = 5000
  } = {}) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.metrics = metrics;
    this.configPath = configPath;
    this.ttlMs = ttlMs;
    this.timeoutMs = timeoutMs;
    this.resolutor = resolutor || new ResolutorProyecto({ eventBus, logger, metrics });

    this.cache = new Map();   // clave(slug) → { servicio, ts }
  }

  _rpc(evento, payload = {}) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return Promise.resolve(null);
    const request_id = require('crypto').randomUUID();
    const responseEvent = evento.endsWith('.request')
      ? evento.slice(0, -'.request'.length) + '.response'
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

  async _clave(projectId) {
    try {
      return await this.resolutor.slugDe(projectId);
    } catch (_) {
      return projectId;
    }
  }

  // Lee el bloque `servicio` (o `null` si no se pudo leer / no existe).
  async leer(projectId, { recargar = false } = {}) {
    if (projectId === null || projectId === undefined || projectId === '') return null;
    const clave = await this._clave(projectId);
    const ahora = Date.now();

    if (!recargar) {
      const enCache = this.cache.get(clave);
      if (enCache && (ahora - enCache.ts) < this.ttlMs) return enCache.servicio;
    }

    const r = await this._rpc('fs.read.request', { project_id: clave, path: this.configPath });
    if (!r || r.error) {
      this.metrics?.increment?.('servicio.lectura.fallida', 1, {
        project: clave, kind: 'config'
      });
      this.logger?.warn?.('servicio.config.no_leida', {
        project: clave,
        path: this.configPath,
        error: r?.error?.code || 'SIN_RESPUESTA'
      });
      // Sin lectura no se inventa: se respeta lo último bueno que hubiera.
      const previo = this.cache.get(clave);
      return previo ? previo.servicio : null;
    }

    let cfg = null;
    const contenido = typeof r.content === 'string' ? r.content : (typeof r.data?.content === 'string' ? r.data.content : null);
    if (contenido) {
      try { cfg = JSON.parse(contenido); } catch (_) {
        this.logger?.warn?.('servicio.config.json_invalido', { project: clave, path: this.configPath });
      }
    }
    const servicio = extraerServicio(cfg);
    this.cache.set(clave, { servicio, ts: ahora });
    return servicio;
  }

  // El interruptor: la tecla del dueño. Escribe el config y suelta la caché.
  // `hasta` ausente = cerrado hasta que lo abra él. `hasta` con fecha = se reabre solo.
  async fijarInterruptor(projectId, { abierto, motivo = null, motivo_texto = null, hasta = null, aviso = null } = {}) {
    if (typeof abierto !== 'boolean') {
      return { ok: false, error: { code: 'INVALID_INPUT', message: 'abierto debe ser boolean', details: { field: 'abierto' } } };
    }
    const clave = await this._clave(projectId);
    const leido = await this._rpc('fs.read.request', { project_id: clave, path: this.configPath });
    if (!leido || leido.error) {
      return { ok: false, error: { code: 'UPSTREAM_UNREACHABLE', message: 'no se pudo leer la config del proyecto', details: { project: clave } } };
    }
    const contenido = typeof leido.content === 'string' ? leido.content : (typeof leido.data?.content === 'string' ? leido.data.content : null);
    let cfg;
    try { cfg = contenido ? JSON.parse(contenido) : {}; } catch (_) {
      return { ok: false, error: { code: 'CONFLICT_STATE', message: 'config.json del proyecto no es JSON valido', details: { project: clave } } };
    }
    if (!cfg || typeof cfg !== 'object') cfg = {};
    // Se respeta el envoltorio que ya tuviera el fichero: el dueño escribe donde escriba.
    const destino = (cfg.servicio && typeof cfg.servicio === 'object') ? cfg.servicio : cfg;
    destino.interruptor = {
      abierto,
      motivo: abierto ? null : (motivo || 'manual'),
      motivo_texto: abierto ? null : (motivo_texto || null),
      hasta: abierto ? null : (hasta || null),
      aviso: abierto ? null : (aviso || null),
      actualizado_en: new Date().toISOString()
    };

    const escrito = await this.eventBus?.publish
      ? await this._rpc('fs.write.request', {
        project_id: clave,
        path: this.configPath,
        content: JSON.stringify(cfg, null, 2),
        encoding: 'utf-8',
        atomic: true
      })
      : null;

    if (!escrito || escrito.error) {
      return { ok: false, error: escrito?.error || { code: 'UPSTREAM_UNREACHABLE', message: 'no se pudo escribir la config del proyecto' } };
    }

    this.cache.set(clave, { servicio: destino, ts: Date.now() });
    this.logger?.info?.('servicio.interruptor.fijado', { project: clave, abierto, motivo: destino.interruptor.motivo, hasta: destino.interruptor.hasta });
    return { ok: true, servicio: destino, clave };
  }

  invalidar(projectId) {
    if (projectId === null || projectId === undefined) { this.cache.clear(); return; }
    const clave = String(projectId);
    this.cache.delete(clave);
    // El mismo proyecto puede llegar como uuid o slug: se suelta todo lo que apunte a él.
    for (const [k, v] of this.cache) {
      if (k === clave || v?.clave === clave) this.cache.delete(k);
    }
  }
}

module.exports = LectorServicio;
