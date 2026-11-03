'use strict';

/**
 * entrada-listo · PUENTE · PLAZA — el paso ① del §7.1 (C04 lo escribe la tienda; A01 lo guarda).
 *
 * LA PUERTA DEL MERCADO. Es el ÚNICO punto donde Bocaos escucha a la tienda, y lo que hace es
 * traducir un hecho de la tienda a un hecho del mercado:
 *
 *   cocina.pedido_listo (pizzepos)  →  AvisoPedidoListo  →  bocaos.listo_declarado  →  hecho-listo
 *
 * Lo que este puente NO hace, y por eso es un puente y no un custodio:
 *
 *   · NO guarda nada. El hecho de listo lo escribe `hecho-listo`, que es su dueño (A01). Si este
 *     módulo guardara una copia, habría dos horas de listo y una sería vieja.
 *   · NO inventa el destino ni el precio. Sin destino o sin precio NO hay aviso: se emite el
 *     `bocaos.hueco_nombrado` con el dato que falta (A34) y el pedido NO entra al enlace. Un pedido
 *     que entrase con un precio estimado sería una subasta con otro nombre.
 *   · NO escribe en la tienda. Lee su pedido por el bus (`pedido.get`) — la dirección y el total
 *     son de la tienda y se quedan en la tienda; aquí sólo pasan a formar parte del hecho.
 *   · NO adelanta ni corrige la hora: la hora de listo es la que la cocina declaró al pulsar
 *     «listo» (C04). Declarar tiene consecuencia.
 *
 * La oferta del cliente y el tope son de `tarifa-pedido` (E01/E03/E07): aquí se PIDEN, no se
 * recalculan. El número que viaja es el que el rider verá.
 *
 * Isla: cero require a otra isla. Todo lo que necesita lo pide al bus.
 */

const ModuloBocaos = require('../_bocaos');

const TIMEOUT_PEDIDO_MS = 3000;
const TIMEOUT_PRECIO_MS = 2000;

class EntradaListo extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'entrada-listo';
    this.version = 'puente-0.1.0';
    this._path = null;                    // sin store: el hecho lo guarda `hecho-listo`

    this.tiempo_pedido_ms = TIMEOUT_PEDIDO_MS;
    this.tiempo_precio_ms = TIMEOUT_PRECIO_MS;
  }

  // ================= RPC del bus =================
  onReintentarRequest(e) { return this.servir(e, 'reintentar', 'entrada-listo.reintentar', (d) => this._reintentar(d)); }

  // ================= hechos que escucha =================
  // El disparador del mercado: la cocina de la tienda dice que el pedido está listo.
  async onCocinaPedidoListo(e) {
    const d = (e && e.data) || e || {};
    const r = await this._componer(d, { via: 'cocina.pedido_listo' });
    // El par honesto también en el camino del hecho: quien mira el bus ve si el aviso salió.
    if (r.status >= 400) {
      this.eventBus.publish('entrada-listo.componer.failed', { request_id: null, op: 'componer', ...r });
    } else {
      this.eventBus.publish('entrada-listo.componer.response', { request_id: null, op: 'componer', ...r });
    }
    return r;
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    return null;
  }

  // ================= reintentar (ORDEN) =================
  // Se vuelve a componer desde el pedido de la tienda, no desde la memoria del bus: reintentar no
  // es repetir un mensaje, es volver a mirar el pedido. Si el pedido no está, se dice con motivo.
  async _reintentar(d) {
    if (!d.pedido_id) return this._invalid('pedido_id');
    const r = await this._componer(d, { via: 'reintentar' });
    return r;
  }

  // ================= el aviso =================
  async _componer(d, { via } = {}) {
    const plaza_id = this.plaza_id || d.plaza_id || null;
    const pedido_id = d.pedido_id || null;
    if (!pedido_id) return this._errorResponse(400, 'INVALID_INPUT', 'pedido_id requerido', { field: 'pedido_id', via });
    if (!plaza_id) {
      return this._errorResponse(409, 'SIN_PLAZA', 'el puente no sabe de qué plaza es: falta el sello de la plaza',
        { field: 'plaza_id', hueco: 'sin plaza', via });
    }

    // A01: el pedido es de la tienda y la dirección vive allí. Se PIDE; no se copia ni se adivina.
    const pedido = await this._pedidoDe(d, pedido_id);
    if (!pedido) {
      return this._hueco({
        pedido_id, plaza_id,
        hueco: d.sin_pedido || 'sin pedido en la tienda (falta la adaptación `entrega` o el pedido no existe)',
        field: 'pedido_id', code: 404, motivo: 'pedido.get no devolvió el pedido', via
      });
    }

    // C04: la hora de listo es la que declaró la cocina. Se acepta el nombre que use el emisor real
    // (`listo_at`, en el evento o guardado en el pedido) y los del arnés; si no viene NINGUNA, no hay
    // hecho: se nombra el hueco. La hora no se adelanta ni se corrige.
    const hora_listo = this._iso(d.listo_at || d.hora_listo || d.hora || d.timestamp
      || pedido.listo_at || pedido.hora_listo);
    if (!hora_listo) {
      return this._hueco({ pedido_id, plaza_id, hueco: 'sin hora de listo', field: 'hora_listo', via });
    }

    const entrega = (pedido.entrega && typeof pedido.entrega === 'object') ? pedido.entrega : {};
    const destino = entrega.destino || entrega.direccion || pedido.destino || pedido.direccion || null;
    if (!destino) {
      // A34: sin destino no hay enlace. Se dice qué falta y el pedido NO entra.
      return this._hueco({
        pedido_id, plaza_id,
        hueco: 'sin destino de entrega',
        field: 'destino',
        motivo: 'la tienda no declaró dirección de entrega: la adaptación `entrega` está pendiente',
        via
      });
    }

    const precio = await this._precioDe(d, pedido_id, plaza_id);
    if (!precio || !Number.isInteger(precio.precio_centimos)) {
      // E03: sin precio cerrado no hay propuesta. El hueco es del pedido, no del enlace.
      return this._hueco({
        pedido_id, plaza_id,
        hueco: 'sin precio de reparto cerrado (E03)',
        field: 'precio',
        motivo: 'tarifa-pedido no tiene oferta congelada para ese pedido',
        via
      });
    }

    // El importe de la comida es de la tienda y viaja en su pedido; se convierte a céntimos con su
    // unidad declarada. Si no está, se nombra: el hecho de listo lleva precio o no es un hecho.
    const total_cents = Number.isInteger(pedido.total_centimos) ? pedido.total_centimos
      : (Number.isFinite(pedido.total) ? Math.round(pedido.total * 100) : null);
    if (!Number.isInteger(total_cents)) {
      return this._hueco({
        pedido_id, plaza_id,
        hueco: 'sin total del pedido',
        field: 'total_centimos',
        motivo: 'el pedido de la tienda no trae total: no se inventa el importe de la comida',
        via
      });
    }

    const tienda_id = pedido.project_slug || pedido.tienda_id || d.project_slug || d.tienda_id || null;
    const aviso = {
      plaza_id,
      tienda_id,
      pedido_id,
      hora_listo,
      hora: hora_listo,
      precio_congelado: {
        total_cents,
        moneda: 'EUR',
        // E01/E02/E03: los cuatro números viajan tal y como los cerró su custodio.
        reparto_cents: precio.precio_centimos,
        oferta_centimos: precio.desglose ? precio.desglose.oferta_centimos : null,
        incentivo_centimos: precio.desglose ? precio.desglose.incentivo_centimos : null,
        tope_centimos: precio.tope_centimos ?? null,
        congelada_en: precio.congelada_en || null
      },
      punto: entrega.punto || pedido.punto || null,
      // El destino es el sitio, tal y como lo dio la tienda. Las instrucciones van aparte porque son
      // dato del cliente (F05) y no se mezclan con la dirección que usa el puerto de ruta.
      destino,
      instrucciones: entrega.instrucciones || null,
      local: pedido.local || entrega.local || null,
      zona: entrega.zona || pedido.zona || null,
      autor: { rol: 'tienda', tienda_id },
      via
    };

    // El hecho es del mercado y lo escribe SU custodio (A01). Aquí se declara: `hecho-listo` escucha
    // `bocaos.listo_declarado` y lo anota. No se pide por RPC además: serían dos escrituras del
    // mismo hecho y la segunda sería un 409 disfrazado de éxito.
    this.hecho('bocaos.listo_declarado', aviso);

    return {
      status: 201,
      data: {
        pedido_id,
        plaza_id,
        tienda_id,
        listo: aviso,
        via,
        nota: 'el hecho lo escribe hecho-listo (A01): este puente declara, no guarda'
      }
    };
  }

  // ================= piezas =================
  async _pedidoDe(d, pedido_id) {
    try {
      const r = await this._rpc('pedido.get.request', {
        // El pedido vive en el proyecto de la tienda; si no lo sabemos, se prueba con el que trae
        // el evento (que es el suyo). El bus no adivina: el módulo dice lo que tiene.
        project_id: d.tienda_project_id || d.tienda_id || d.project_id || null,
        pedido_id
      }, { timeout_ms: this.tiempo_pedido_ms });
      const p = r && r.status === 200 ? (r.data && (r.data.pedido || r.data)) : null;
      if (!p || typeof p !== 'object') return null;
      // `pedido.get` de pizzepos devuelve el pedido con `id`; el arnés y la adaptación usan
      // `pedido_id`. Se aceptan los dos nombres del MISMO dato, no dos datos.
      if (!p.pedido_id && p.id) p.pedido_id = p.id;
      return p;
    } catch (_) {
      return null;
    }
  }

  async _precioDe(d, pedido_id, plaza_id) {
    try {
      const r = await this._rpc('tarifa-pedido.de.request', {
        project_id: plaza_id, plaza_id, pedido_id
      }, { timeout_ms: this.tiempo_precio_ms });
      return (r && r.status === 200 && r.data && r.data.precio) ? r.data.precio : null;
    } catch (_) {
      return null;
    }
  }

  // A34 · el hueco se NOMBRA: se publica para que la tienda lo vea (aviso-tienda) y se devuelve con
  // código, para que quien reintentó sepa qué falta. Nunca silencio.
  _hueco({ pedido_id, plaza_id, hueco, field, motivo, via, code = 409 }) {
    this.hecho('bocaos.hueco_nombrado', {
      pedido_id,
      plaza_id,
      rider_id: null,
      hueco,
      motivo: motivo || hueco,
      via: via || null
    });
    return this._errorResponse(code, 'HUECO', motivo || hueco, { field, hueco, via: via || null, pedido_id });
  }
}

module.exports = EntradaListo;
module.exports.TIMEOUT_PEDIDO_MS = TIMEOUT_PEDIDO_MS;
