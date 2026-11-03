'use strict';

/**
 * tienda-hora-listo · CUSTODIO · TIENDA — C04 (HoraDeListo).
 *
 * La tienda declara la hora de listo. Es el disparador de todo el mercado y lo escribe ELLA:
 * no la sala, no la plaza, no una estimación del sistema. Una sola vez; si se equivocó, la
 * plaza anota un hecho que DESMIENTE (A01) — aquí no se reescribe nada.
 *
 * Guarda de autor (C04): el autor tiene que ser la tienda dueña del pedido. La tienda se
 * entera de quién es dueña por el hecho `bocaos.pedido_aceptado` de la plaza; no lo pregunta
 * al almacén de nadie.
 */

const ModuloBocaos = require('../_bocaos');

class TiendaHoraListo extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'tienda-hora-listo';
    this.version = 'reflejo-0.1.0';
    this._path = '/bocaos/tienda-hora-listo.json';
  }

  onDeclararRequest(e) { return this.servir(e, 'declarar', 'tienda-hora-listo.declarar', (d) => this._declarar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'tienda-hora-listo.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  async onPedidoAceptado(e) {
    const d = this.datos(e, 'tienda_id');
    if (!d.project_id || !d.pedido_id) return;
    const est = await this.estado(d.project_id);
    est.pedidos = est.pedidos || {};
    // El dato VIAJA en el hecho: dueño del pedido y precio congelado, para que la declaración
    // de listo los lleve consigo sin leer el almacén de la plaza.
    est.pedidos[d.pedido_id] = {
      pedido_id: d.pedido_id,
      tienda_id: d.tienda_id || null,
      plaza_id: d.plaza_id || null,
      precio_congelado: d.precio_congelado || null,
      oferta_reparto_cents: d.oferta_reparto_cents ?? null,
      punto: d.punto || null,
      zona: d.zona || null
    };
    await this.guardar(d.project_id);
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= proyecciones =================
  async _declarar(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const hora_listo = this._iso(d.hora_listo);
    if (!hora_listo) return this._invalid('hora_listo');

    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) {
      return this._errorResponse(409, 'PEDIDO_NO_CONSTA_EN_TIENDA', 'la tienda no conoce ese pedido (no llegó su aceptación)', { field: 'pedido_id', hueco: 'sin pedido aceptado en la tienda' });
    }

    // C04: el autor es la tienda dueña. La sala y la plaza no declaran por ella.
    const autor = d.autor && typeof d.autor === 'object' ? d.autor : { rol: d.rol || 'tienda', tienda_id: d.tienda_id };
    if (autor.rol !== 'tienda') {
      return this._errorResponse(403, 'FORBIDDEN', 'sólo la tienda declara su hora de listo', { field: 'autor.rol', hueco: 'autor no es la tienda' });
    }
    // Sin tienda_id explícito, el autor es la tienda de este proyecto: la dueña del pedido.
    const tienda_autora = autor.tienda_id || p.tienda_id;
    if (p.tienda_id && tienda_autora !== p.tienda_id) {
      return this._errorResponse(403, 'FORBIDDEN', 'la tienda no es la dueña de este pedido', { field: 'autor.tienda_id' });
    }

    est.declaraciones = est.declaraciones || {};
    const previa = est.declaraciones[d.pedido_id];
    if (previa) {
      return this._errorResponse(409, 'YA_DECLARADO', 'la hora de listo ya se declaró; corregirla exige desmentir en la plaza (A01)', {
        field: 'pedido_id', hora_declarada: previa.hora_listo, declarada_en: previa.declarado_en
      });
    }

    const declaracion = {
      pedido_id: d.pedido_id,
      plaza_id: p.plaza_id || this.plaza_id,
      tienda_id: p.tienda_id || autor.tienda_id,
      hora_listo,
      hora_estimada: this._iso(d.hora_estimada),
      autor: { rol: 'tienda', tienda_id: tienda_autora },
      declarado_en: this.ahora(),
      precio_congelado: d.precio_congelado || p.precio_congelado,
      punto: p.punto,
      zona: p.zona
    };
    est.declaraciones[d.pedido_id] = declaracion;
    await this.guardar(d.project_id);

    this.hecho('bocaos.listo_declarado', declaracion);
    return { status: 201, data: { declaracion } };
  }

  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const est = await this.estado(d.project_id);
    const declaracion = est.declaraciones?.[d.pedido_id];
    if (!declaracion) return this._errorResponse(404, 'NO_CONSTA', 'no hay hora de listo declarada para ese pedido', { field: 'pedido_id' });
    return { status: 200, data: { declaracion } };
  }
}

module.exports = TiendaHoraListo;
