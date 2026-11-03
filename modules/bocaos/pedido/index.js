'use strict';

/**
 * pedido · CUSTODIO · PLAZA — C02 (EstadoPedido) + C07 (Cancelación).
 *
 * El pedido del mercado: nace con el precio CONGELADO y el sello de su plaza, y no hay
 * transición sin un hecho que la sostenga con hora. Vive en el registro de SU plaza: no hay
 * estado del pedido arriba (nacional) ni en la tienda.
 *
 * Tabla cerrada de transiciones (C02):
 *   RECIBIDO  → ACEPTADO (la tienda, Q27) · RECHAZADO (la tienda) · CANCELADO
 *   ACEPTADO  → LISTO (bocaos.listo_declarado) · CANCELADO
 *   LISTO     → EN_REPARTO (bocaos.contrato_creado) · CANCELADO
 *   EN_REPARTO→ ENTREGADO (bocaos.prueba_anotada)
 * Cualquier otra flecha → TRANSICION_NO_PERMITIDA. Es la guarda que impide que un pedido
 * «aparezca» listo sin que nadie lo haya aceptado.
 *
 * Cancelación (C07): quién y hasta cuándo. Quién paga el rechazo es Q36 y NO se cobra aquí.
 *
 * Lo que este módulo NO hace: no lee el almacén de otro, no llama a otro módulo, no anota
 * el hecho de «listo» (eso es A01, en `hecho-listo`). Sólo escucha y transita.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

const TRANSICIONES = {
  RECIBIDO: ['ACEPTADO', 'RECHAZADO', 'CANCELADO'],
  ACEPTADO: ['LISTO', 'CANCELADO'],
  LISTO: ['EN_REPARTO', 'CANCELADO'],
  EN_REPARTO: ['ENTREGADO'],
  ENTREGADO: [],
  RECHAZADO: [],
  CANCELADO: []
};

// C07 · tabla de quién puede cancelar y hasta cuándo. Cerrada: no hay «otros».
const CANCELACION = {
  cliente: ['RECIBIDO'],
  tienda: ['RECIBIDO', 'ACEPTADO'],
  plaza: ['RECIBIDO', 'ACEPTADO', 'LISTO']
};

const CENTIMOS = (v) => Number.isInteger(v) && v >= 0;

class Pedido extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'pedido';
    this.version = 'reflejo-0.2.0';
    this._path = '/bocaos/pedido.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onCrearRequest(e) { return this.servir(e, 'crear', 'pedido.crear', (d) => this._crear(d)); }
  onAceptarRequest(e) { return this.servir(e, 'aceptar', 'pedido.aceptar', (d) => this._aceptar(d)); }
  onRechazarRequest(e) { return this.servir(e, 'rechazar', 'pedido.rechazar', (d) => this._rechazar(d)); }
  onCancelarRequest(e) { return this.servir(e, 'cancelar', 'pedido.cancelar', (d) => this._cancelar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'pedido.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  async onPrecioCongelado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return;
    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p || p.precio_congelado) return;
    p.precio_congelado = d.precio_congelado || null;
    p.hechos.push({ estado: p.estado, hora: this.ahora(), autor: d.autor || 'tienda', origen: 'precio_cerrado' });
    await this.guardar(d.project_id);
  }

  async onListoDeclarado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return;
    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return;
    const err = this._transitar(p, 'LISTO', d.autor || 'tienda', d.hora_listo, 'listo_declarado');
    if (err) return;
    p.hora_listo = d.hora_listo || p.hora_listo;
    await this.guardar(d.project_id);
  }

  async onContratoCreado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return;
    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return;
    const err = this._transitar(p, 'EN_REPARTO', d.rider_id || 'rider', d.hora_contrato, 'contrato_creado');
    if (err) return;
    p.rider_id = d.rider_id || null;
    p.contrato_id = d.contrato_id || null;
    await this.guardar(d.project_id);
  }

  async onPruebaAnotada(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return;
    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return;
    const err = this._transitar(p, 'ENTREGADO', d.autor || 'rider', d.hora || this.ahora(), 'prueba_anotada');
    if (err) return;
    p.prueba = d.prueba || (d.falta ? { falta: true, motivo: d.motivo } : null);
    await this.guardar(d.project_id);
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= proyecciones =================
  async _crear(d) {
    const p = d.pedido && typeof d.pedido === 'object' ? d.pedido : d;
    const project_id = d.project_id || p.plaza_id;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido (la plaza donde vive el registro)', { field: 'project_id' });
    for (const campo of ['plaza_id', 'tienda_id', 'cliente_id']) {
      if (!p[campo]) return this._errorResponse(400, 'INVALID_INPUT', `${campo} requerido`, { field: campo });
    }
    if (!CENTIMOS(p.precio_congelado?.total_cents) || p.precio_congelado.total_cents === 0) {
      // C02: el pedido nace con precio congelado. Sin precio no nace, y se nombra el hueco.
      return this._errorResponse(409, 'PRECIO_SIN_CONGELAR', 'el pedido no nace sin precio congelado (E01/E03)', { field: 'precio_congelado', hueco: 'sin precio cerrado' });
    }
    if (!CENTIMOS(p.oferta_reparto_cents)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'oferta_reparto_cents requerido (la oferta del cliente viaja con el pedido)', { field: 'oferta_reparto_cents' });
    }
    // Q43: el cliente puede autorizar un TOPE por encima de su oferta. Si lo autoriza, viaja con
    // el pedido (y se anuncia como bocaos.tarifa): sin esa autorización la escalada no paga más.
    const tope = p.tope_reparto_cents ?? null;
    if (tope !== null && (!CENTIMOS(tope) || tope < p.oferta_reparto_cents)) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'tope_reparto_cents debe ser un entero ≥ la oferta del cliente: el tope no rebaja lo ofrecido',
        { field: 'tope_reparto_cents', oferta_reparto_cents: p.oferta_reparto_cents });
    }

    const est = await this.estado(project_id);
    est.pedidos = est.pedidos || {};

    const pedido_id = p.pedido_id || `ped-${crypto.randomUUID().slice(0, 8)}`;
    const existente = est.pedidos[pedido_id];
    if (existente) {
      return { status: 200, data: { pedido_id, estado: existente.estado, idempotente: true, pedido: existente } };
    }

    const hora = this.ahora();
    const nuevo = {
      pedido_id,
      plaza_id: p.plaza_id,
      tienda_id: p.tienda_id,
      cliente_id: p.cliente_id,
      zona: p.zona || null,
      punto: p.punto || null,
      destino: p.destino || null,
      lineas: Array.isArray(p.lineas) ? p.lineas : [],
      precio_congelado: p.precio_congelado,
      oferta_reparto_cents: p.oferta_reparto_cents,
      tope_reparto_cents: tope,
      estado: 'RECIBIDO',
      hora_pedido: p.hora_pedido || hora,
      hora_listo: null,
      rider_id: null,
      contrato_id: null,
      prueba: null,
      hechos: [{ estado: 'RECIBIDO', hora, autor: 'tienda', origen: 'alta' }]
    };
    est.pedidos[pedido_id] = nuevo;
    await this.guardar(project_id);

    if (tope !== null) {
      // El tope autorizado es un hecho propio: la escalada lo escucha y no sube sin él.
      this.hecho('bocaos.tarifa', {
        pedido_id,
        plaza_id: nuevo.plaza_id,
        tienda_id: nuevo.tienda_id,
        tope_cents: tope,
        escalon_cents: Number.isInteger(p.escalon_cents) && p.escalon_cents > 0 ? p.escalon_cents : null,
        autor: p.tarifa_autor || 'cliente'
      });
    }

    this.hecho('bocaos.pedido_creado', {
      pedido_id,
      plaza_id: nuevo.plaza_id,
      tienda_id: nuevo.tienda_id,
      cliente_id: nuevo.cliente_id,
      estado: 'RECIBIDO',
      hora,
      precio_congelado: nuevo.precio_congelado,
      oferta_reparto_cents: nuevo.oferta_reparto_cents,
      punto: nuevo.punto,
      zona: nuevo.zona
    });

    return { status: 201, data: { pedido_id, estado: 'RECIBIDO', pedido: nuevo } };
  }

  async _aceptar(d) {
    const r = await this._transicionarConAutor(d, 'ACEPTADO');
    if (r.status !== 200) return r;
    const p = (await this.estado(d.project_id)).pedidos[d.pedido_id];
    this.hecho('bocaos.pedido_aceptado', this._cargaDeTransicion(p, 'ACEPTADO', d));
    return r;
  }

  async _rechazar(d) {
    const r = await this._transicionarConAutor(d, 'RECHAZADO');
    if (r.status !== 200) return r;
    const p = (await this.estado(d.project_id)).pedidos[d.pedido_id];
    this.hecho('bocaos.pedido_rechazado', this._cargaDeTransicion(p, 'RECHAZADO', d));
    return r;
  }

  // Lo que viaja con la transición: sin esto, el que escucha tendría que leer este almacén.
  _cargaDeTransicion(p, destino, d) {
    return {
      pedido_id: p.pedido_id,
      plaza_id: p.plaza_id,
      tienda_id: p.tienda_id,
      estado: destino,
      hora: this._iso(d.hora) || this.ahora(),
      precio_congelado: p.precio_congelado,
      oferta_reparto_cents: p.oferta_reparto_cents,
      punto: p.punto,
      zona: p.zona,
      motivo: d.motivo || null
    };
  }

  async _transicionarConAutor(d, destino) {
    if (!d.project_id || !d.pedido_id) return this._invalid(!d.project_id ? 'project_id' : 'pedido_id');
    if (d.rol !== 'tienda' || !d.tienda_id) {
      // C02/Q27: sólo la tienda dueña acepta o rechaza su pedido.
      return this._errorResponse(403, 'FORBIDDEN', 'sólo la tienda dueña del pedido puede aceptarlo o rechazarlo', { field: 'rol', hueco: 'autor no es la tienda' });
    }
    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return this._errorResponse(404, 'PEDIDO_NO_CONSTA', 'el pedido no está en el registro de esta plaza', { field: 'pedido_id' });
    if (p.tienda_id !== d.tienda_id) {
      return this._errorResponse(403, 'FORBIDDEN', 'la tienda no es la dueña de este pedido', { field: 'tienda_id' });
    }
    const err = this._transitar(p, destino, 'tienda', d.hora, `transicion_${destino.toLowerCase()}`);
    if (err) return err;
    await this.guardar(d.project_id);
    return { status: 200, data: { pedido_id: p.pedido_id, estado: destino } };
  }

  async _cancelar(d) {
    if (!d.project_id || !d.pedido_id) return this._invalid(!d.project_id ? 'project_id' : 'pedido_id');
    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return this._errorResponse(404, 'PEDIDO_NO_CONSTA', 'el pedido no está en el registro de esta plaza', { field: 'pedido_id' });
    const puede = CANCELACION[d.rol];
    if (!puede) {
      return this._errorResponse(403, 'FORBIDDEN', 'rol no declarado en la tabla de cancelación (cliente|tienda|plaza)', { field: 'rol' });
    }
    if (!puede.includes(p.estado)) {
      return this._errorResponse(409, 'CANCELACION_FUERA_DE_PLAZO', `el ${d.rol} no puede cancelar un pedido en ${p.estado}`, { field: 'estado', estado: p.estado, rol: d.rol });
    }
    const err = this._transitar(p, 'CANCELADO', d.rol, d.hora, `cancelacion_${d.rol}`);
    if (err) return err;
    p.motivo_cancelacion = d.motivo || null;
    await this.guardar(d.project_id);

    this.hecho('bocaos.pedido_cancelado', {
      pedido_id: p.pedido_id,
      plaza_id: p.plaza_id,
      tienda_id: p.tienda_id,
      estado: 'CANCELADO',
      rol: d.rol,
      motivo: d.motivo || null,
      hora: d.hora || this.ahora()
    });
    return { status: 200, data: { pedido_id: p.pedido_id, estado: 'CANCELADO', cancelado_por: d.rol } };
  }

  async _de(d) {
    if (!d.project_id || !d.pedido_id) return this._invalid(!d.project_id ? 'project_id' : 'pedido_id');
    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return this._errorResponse(404, 'PEDIDO_NO_CONSTA', 'el pedido no está en el registro de esta plaza', { field: 'pedido_id' });
    return { status: 200, data: { pedido: p, hechos: p.hechos } };
  }

  // ================= tabla cerrada =================
  _transitar(p, destino, autor, hora, origen) {
    const permitidas = TRANSICIONES[p.estado] || [];
    if (!permitidas.includes(destino)) {
      return this._errorResponse(409, 'TRANSICION_NO_PERMITIDA', `${p.estado} → ${destino} no está en la tabla`, { estado: p.estado, destino });
    }
    p.estado = destino;
    p.hechos.push({ estado: destino, hora: this._iso(hora) || this.ahora(), autor: autor || 'sistema', origen: origen || null });
    return null;
  }
}

module.exports = Pedido;
module.exports.TRANSICIONES = TRANSICIONES;
module.exports.CANCELACION = CANCELACION;
