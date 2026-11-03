'use strict';

/**
 * hecho-listo · CUSTODIO · PLAZA — A01 (HechoDeListo).
 *
 * El hecho de «listo» tal como lo anota la plaza: una sola vez, con el dato VIAJANDO CON el
 * hecho (local, destino, hora, precio, punto). Es lo que dispara el cuello del enlace.
 *
 * Dos guardas que son el módulo:
 *   · sin precio congelado no hay hecho — hay HUECO NOMBRADO, y el pedido espera (A34).
 *   · el plaza_id lo pone la plaza al anotar (sello). La tienda no puede declarar un pedido
 *     de otra plaza: si el sello no es el suyo, 403.
 *
 * Si la tienda se equivocó, se DESMIENTE: se anota un segundo hecho con su hora y el primero
 * no se borra. Las dos horas quedan y el pedido se vuelve a medir.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

class HechoListo extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'hecho-listo';
    this.version = 'reflejo-0.1.0';
    this._path = '/bocaos/hecho-listo.json';
  }

  onAnotarRequest(e) { return this.servir(e, 'anotar', 'hecho-listo.anotar', (d) => this._anotar(d)); }
  onDesmentirRequest(e) { return this.servir(e, 'desmentir', 'hecho-listo.desmentir', (d) => this._desmentir(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'hecho-listo.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  async onListoDeclarado(e) {
    const d = this.datos(e);
    if (!d.project_id) return;
    const r = await this._anotar(d);
    if (r.status >= 400) {
      this.logger?.warn('hecho-listo.no_anotado', { pedido_id: d.pedido_id, code: r.error?.code, hueco: r.error?.details?.hueco });
    }
    return r;
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= proyecciones =================
  async _anotar(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const hora_listo = this._iso(d.hora_listo);
    if (!hora_listo) return this._invalid('hora_listo');

    // El sello: la plaza anota con SU plaza_id. Si el hecho dice otra plaza, no entra.
    const sello = this.plaza_id || d.plaza_id || d.project_id;
    if (d.plaza_id && this.plaza_id && d.plaza_id !== this.plaza_id) {
      return this._errorResponse(403, 'PLAZA_AJENA', 'el hecho es de otra plaza: plaza_id(pedido) != plaza_id(plaza)', { field: 'plaza_id', hueco: 'pedido de otra plaza' });
    }
    if (!d.precio_congelado || !Number.isInteger(d.precio_congelado.total_cents)) {
      // A01/A34: sin precio no hay hecho. Se nombra el hueco; no se inventa el precio.
      return this._errorResponse(409, 'PRECIO_SIN_CONGELAR', 'sin precio congelado no hay hecho de listo: hueco nombrado', { field: 'precio_congelado', hueco: 'sin precio congelado' });
    }

    const est = await this.estado(d.project_id);
    est.hechos = est.hechos || {};
    const previos = est.hechos[d.pedido_id] || [];
    const vigente = previos.find((h) => h.vigente);
    if (vigente) {
      return this._errorResponse(409, 'YA_ANOTADO', 'el hecho ya está anotado; corregirlo exige desmentir (no se borra)', {
        field: 'pedido_id', hecho_id: vigente.hecho_id, hora_listo: vigente.hora_listo
      });
    }

    const hecho = {
      hecho_id: `hl-${crypto.randomUUID().slice(0, 8)}`,
      pedido_id: d.pedido_id,
      plaza_id: sello,
      tienda_id: d.tienda_id || null,
      hora_listo,
      precio_congelado: d.precio_congelado,
      punto: d.punto || null,
      destino: d.destino || null,
      local: d.local || null,
      zona: d.zona || null,
      autor: d.autor || null,
      anotado_en: this.ahora(),
      desmiente_a: null,
      vigente: true
    };
    est.hechos[d.pedido_id] = [...previos, hecho];
    await this.guardar(d.project_id);

    this.hecho('bocaos.pedido_listo', {
      pedido_id: hecho.pedido_id,
      plaza_id: hecho.plaza_id,
      tienda_id: hecho.tienda_id,
      hora_listo: hecho.hora_listo,
      precio_congelado: hecho.precio_congelado,
      punto: hecho.punto,
      destino: hecho.destino,
      local: hecho.local,
      zona: hecho.zona,
      hecho_id: hecho.hecho_id,
      hora_anotado: hecho.anotado_en
    });

    return { status: 201, data: { hecho } };
  }

  async _desmentir(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const hora_listo = this._iso(d.hora_listo);
    if (!hora_listo) return this._invalid('hora_listo');

    const est = await this.estado(d.project_id);
    const previos = est.hechos?.[d.pedido_id] || [];
    const anterior = previos.find((h) => h.vigente);
    if (!anterior) return this._errorResponse(404, 'NO_CONSTA', 'no hay hecho vigente que desmentir', { field: 'pedido_id' });
    if (anterior.hora_listo === hora_listo && !d.motivo) {
      return this._errorResponse(400, 'INVALID_INPUT', 'la hora nueva es la misma que la vigente y sin motivo', { field: 'hora_listo' });
    }

    anterior.vigente = false;
    const nuevo = {
      ...anterior,
      hecho_id: `hl-${crypto.randomUUID().slice(0, 8)}`,
      hora_listo,
      precio_congelado: d.precio_congelado || anterior.precio_congelado,
      motivo: d.motivo || null,
      autor: d.autor || null,
      anotado_en: this.ahora(),
      desmiente_a: anterior.hecho_id,
      vigente: true
    };
    est.hechos[d.pedido_id] = [...previos, nuevo];
    await this.guardar(d.project_id);

    // Las dos horas quedan. El pedido se vuelve a medir con el hecho nuevo.
    this.hecho('bocaos.hecho_desmentido', {
      pedido_id: nuevo.pedido_id,
      plaza_id: nuevo.plaza_id,
      tienda_id: nuevo.tienda_id,
      hora_listo: nuevo.hora_listo,
      hora_anterior: anterior.hora_listo,
      precio_congelado: nuevo.precio_congelado,
      punto: nuevo.punto,
      zona: nuevo.zona,
      hecho_id: nuevo.hecho_id,
      desmiente_a: anterior.hecho_id,
      motivo: nuevo.motivo
    });

    return { status: 200, data: { hecho: nuevo, desmentido: anterior.hecho_id } };
  }

  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const est = await this.estado(d.project_id);
    const hechos = est.hechos?.[d.pedido_id] || [];
    const vigente = hechos.find((h) => h.vigente);
    if (!vigente) return this._errorResponse(404, 'NO_CONSTA', 'no hay hecho de listo para ese pedido', { field: 'pedido_id' });
    return { status: 200, data: { hecho: vigente, hechos } };
  }
}

module.exports = HechoListo;
