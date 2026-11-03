'use strict';

/**
 * tienda-captura · REFLEJO · TIENDA — C01 (CapturaPedido).
 *
 * El alta de un pedido: DE A UNO, con el precio ya cerrado y la oferta de reparto congelada.
 * Nace con el plaza_id de la plaza donde vive la tienda — y ese plaza_id lo declara la tienda,
 * nunca el payload del cliente.
 *
 * Sin estado: si guardara una copia del pedido, habría dos verdades y una sería vieja. El
 * pedido lo escribe la PLAZA (`pedido`, custodio single-writer); este reflejo compone y pide
 * el alta por el bus. Si el precio no viene cerrado, no hay pedido: se nombra el hueco
 * (PRECIO_SIN_CERRAR) y no se crea nada.
 */

const ModuloBocaos = require('../_bocaos');

const CENTIMOS = (v) => Number.isInteger(v) && v >= 0;

class TiendaCaptura extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'tienda-captura';
    this.version = 'reflejo-0.1.0';
  }

  onAltaRequest(e) { return this.servir(e, 'alta', 'tienda-captura.alta', (d) => this._alta(d)); }

  async _alta(d) {
    // C01: de a uno. Ni alta en bloque, ni pedido programado, ni plantilla recurrente.
    if (Array.isArray(d.pedidos) || Array.isArray(d.lote)) {
      return this._errorResponse(422, 'ALTA_EN_BLOQUE', 'el alta es de a un pedido (C01); no hay alta en bloque', { field: 'pedidos' });
    }
    for (const campo of ['plaza_id', 'tienda_id', 'cliente_id']) {
      if (!d[campo]) return this._errorResponse(400, 'INVALID_INPUT', `${campo} requerido`, { field: campo });
    }
    if (!Array.isArray(d.lineas) || d.lineas.length === 0) {
      return this._errorResponse(400, 'INVALID_INPUT', 'lineas requerido (al menos una)', { field: 'lineas' });
    }
    for (const [i, l] of d.lineas.entries()) {
      if (!l || typeof l !== 'object' || !Number.isFinite(l.cantidad) || l.cantidad <= 0) {
        return this._errorResponse(400, 'INVALID_INPUT', `lineas[${i}] sin cantidad`, { field: `lineas[${i}].cantidad` });
      }
    }
    if (!d.precio_congelado || !CENTIMOS(d.precio_congelado.total_cents) || d.precio_congelado.total_cents === 0) {
      // C01: si el precio no está cerrado, no hay pedido. Se nombra el hueco, no se inventa.
      return this._errorResponse(409, 'PRECIO_SIN_CERRAR', 'sin precio cerrado no hay pedido (D03 → C01)', { field: 'precio_congelado', hueco: 'sin precio cerrado' });
    }
    if (!CENTIMOS(d.oferta_reparto_cents)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'oferta_reparto_cents requerido (la oferta del cliente por el reparto)', { field: 'oferta_reparto_cents' });
    }

    // La plaza es un proyecto: su project_id es `plaza-<slug>` (§1.1). El dato viaja en el alta.
    const project_id_plaza = d.plaza_project_id || d.plaza_id;

    const pedido = {
      plaza_id: d.plaza_id,
      tienda_id: d.tienda_id,
      cliente_id: d.cliente_id,
      zona: d.zona || null,
      punto: d.punto || null,
      destino: d.destino || null,
      lineas: d.lineas,
      precio_congelado: d.precio_congelado,
      oferta_reparto_cents: d.oferta_reparto_cents,
      hora_pedido: d.hora_pedido || this.ahora()
    };

    const resp = await this._rpc('pedido.crear.request', { project_id: project_id_plaza, pedido }, { timeout_ms: 5000 });
    const creado = resp?.data || null;
    if (!resp || resp.status >= 400 || !creado?.pedido_id) {
      return this._errorResponse(502, 'PEDIDO_NO_CREADO', 'la plaza no confirmó el alta del pedido', {
        field: 'pedido.crear',
        causa: resp?.error?.code || 'SIN_RESPUESTA'
      });
    }

    // El hecho de la tienda: el pedido que ella compuso, con su plaza y su precio.
    this.hecho('bocaos.pedido_compuesto', {
      pedido_id: creado.pedido_id,
      plaza_id: d.plaza_id,
      tienda_id: d.tienda_id,
      cliente_id: d.cliente_id,
      precio_congelado: d.precio_congelado,
      oferta_reparto_cents: d.oferta_reparto_cents,
      lineas: d.lineas,
      estado: creado.estado || 'RECIBIDO'
    });

    return { status: 201, data: { pedido_id: creado.pedido_id, estado: creado.estado || 'RECIBIDO', plaza_id: d.plaza_id } };
  }
}

module.exports = TiendaCaptura;
