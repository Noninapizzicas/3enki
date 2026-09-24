/**
 * nichos/puerto-fuente-datos — PUENTE STATELESS: cero persistencia, solo enruta.
 *
 * J1 del plan: es el puerto abierto hacia las fuentes de datos de validación/búsqueda
 * (buscadores, APIs, scraping, comunidades). Declara y normaliza el acceso a distintas
 * fuentes de forma AGNOSTICA al vendor — cada fuente se registra y se puede sustituir por
 * evento, sin acoplarse a una API concreta. Recibe el pedido de datos de un nicho y emite
 * el resultado consultado con su par de fallo.
 *
 * Tres proyecciones puras:
 *   _autorizar    valida que la fuente esté en la whitelist autorizada por el dueño.
 *   _conectar     declara/conecta una fuente → ok (swap sin acople; publica conectada).
 *   _reemplazar   sustituye una fuente por otra → ok (publica reemplazada).
 *   _consultar    enruta hacia la fuente activa → DatasetBruto + Rate + Coste.
 *
 * Sin store, sin red, sin custodio: cada op entra objeto, sale objeto; el código enruta
 * peticiones y NO asume un vendor concreto.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PuertoFuenteDatos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-fuente-datos';
    this.version = 'reflejo-0.1.0';
    // Registro de fuentes conectadas — estado EN MEMORIA (puerto no persiste).
    this.fuentes = new Map();
  }
  async onUnload() { return super.onUnload(); }

  // Consulta de datos hacia una fuente → DatasetBruto + Rate + Coste.
  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'nichos.fuente.consultar.response', async (d) => {
      const res = this._consultar(d);
      if (res.status !== 200) this.eventBus?.publish('nichos.fuente.consultar.failed', res);
      return res;
    });
  }

  // Conectar/declarar una fuente -> swap sin acople a vendor.
  onConectarRequest(e) {
    return this._atender(e, 'conectar', 'nichos.fuente.conectar.response', async (d) => {
      const res = this._conectar(d);
      if (res.status === 200) this.eventBus?.publish('nichos.fuente.conectada', res.data);
      return res;
    });
  }

  // Reemplazar una fuente conectada por otra declarada.
  onReemplazarRequest(e) {
    return this._atender(e, 'reemplazar', 'nichos.fuente.reemplazar.response', async (d) => {
      const res = this._reemplazar(d);
      if (res.status === 200) this.eventBus?.publish('nichos.fuente.reemplazada', res.data);
      return res;
    });
  }

  // Proyección pura: fuente autorizada por el dueño (whitelist) — agnóstico al vendor.
  _autorizar({ fuente } = {}) {
    if (!fuente || typeof fuente !== 'string') {
      return this._errorResponse(400, 'INVALID_INPUT', 'fuente requerida', {});
    }
    // Whitelist de fuentes de validación/búsqueda declarables. Cada entrada es un PUERTO,
    // no una API concreta: buscador, api, scraping, comunidad (reemplazables por evento).
    const autorizadas = ['buscador', 'api', 'scraping', 'comunidad'];
    if (!autorizadas.includes(fuente)) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        `la fuente '${fuente}' no esta en la whitelist autorizada por el duenyo`, { fuente });
    }
    return { status: 200, data: { fuente, autorizada: true } };
  }

  // Proyección pura: conecta (o actualiza) una fuente declarada — swap sin acople a vendor.
  _conectar({ fuente, config = {} } = {}) {
    if (!fuente) return this._errorResponse(400, 'INVALID_INPUT', 'fuente requerida', {});
    const auth = this._autorizar({ fuente });
    if (auth.status !== 200) return auth;
    const previa = this.fuentes.has(fuente);
    this.fuentes.set(fuente, {
      id: fuente,
      tipo: config.tipo || 'generica',
      estado: 'conectada',
      reemplaza: previa,
      conectada_en: new Date().toISOString()
    });
    return { status: 200, data: { fuente, conectada: true, reemplaza: previa, config: this.fuentes.get(fuente) } };
  }

  // Proyección pura: reemplaza una fuente conectada por otra declarada.
  _reemplazar({ fuente, por, config = {} } = {}) {
    if (!fuente || !por) return this._errorResponse(400, 'INVALID_INPUT', 'fuente y destino requeridos', {});
    const auth = this._autorizar({ fuente: por });
    if (auth.status !== 200) return auth;
    if (!this.fuentes.has(fuente)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `la fuente '${fuente}' no esta conectada`, { fuente });
    }
    this.fuentes.delete(fuente);
    this.fuentes.set(por, {
      id: por,
      tipo: config.tipo || 'generica',
      estado: 'conectada',
      reemplazada: fuente,
      conectada_en: new Date().toISOString()
    });
    return { status: 200, data: { de: fuente, a: por, reemplazada: true, config: this.fuentes.get(por) } };
  }

  // Proyección pura: enruta el pedido de datos de un nicho hacia su fuente activa.
  _consultar({ nicho, fuente, pagina = 1 } = {}) {
    if (!nicho) return this._errorResponse(400, 'INVALID_INPUT', 'nicho requerido', {});
    const origen = fuente || [...this.fuentes.keys()][0];
    if (!origen) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        'no hay fuente conectada; conecta una antes (nichos.fuente.conectar.request)', { nicho });
    }
    if (!this.fuentes.has(origen)) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `la fuente '${origen}' no esta conectada`, { nicho, fuente: origen });
    }
    const activa = this.fuentes.get(origen);
    // Enrutamiento agnóstico: el DatasetBruto llega del proveedor conectado; el puente NO
    // asume el formato del vendor — solo transmite el resultado y el coste/rate de la petición.
    return {
      status: 200,
      data: {
        nicho,
        fuente: origen,
        proveedor_tipo: activa.tipo,
        dataset_bruto: { items: [], pagina, semilla: nicho },
        rate: { por_minuto: 10, usados_pagina: pagina <= 3 ? pagina : 3 },
        coste: { creditos: 1, moneda: 'creditos' }
      }
    };
  }
}

module.exports = PuertoFuenteDatos;
