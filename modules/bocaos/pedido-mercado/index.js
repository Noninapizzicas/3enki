'use strict';

/**
 * pedido-mercado · CUSTODIO · PLAZA — C02 (EstadoPedido) + C07 (Cancelación).
 *
 * EL PEDIDO DEL MERCADO. No es el pedido de la tienda: es lo que la plaza necesita saber del
 * pedido de la tienda para repartirlo. Nace del `pedido.creado` de pizzepos con EL MISMO
 * `pedido_id` (es la clave de unión), lleva el sello `plaza_id` y la tabla cerrada de estados del
 * reparto.
 *
 * Lo que este módulo NO guarda, y es la mitad del módulo: ni líneas, ni importe de comida, ni
 * estado de cocina, ni pago. Eso es de la tienda y llega por evento cuando llega. Si Bocaos
 * guardara el pedido entero, tendría la cuenta de cada restaurante y H06 dejaría de ser una
 * propiedad para ser una promesa.
 *
 * Tabla cerrada (C02). Ninguna flecha sin hecho con hora:
 *
 *   RECIBIDO   → ACEPTADO (la tienda acepta, Q27) · RECHAZADO (la tienda) · CANCELADO
 *   ACEPTADO   → LISTO (bocaos.pedido_listo, C04) · CANCELADO
 *   LISTO      → EN_REPARTO (hecho de recogida) · CANCELADO
 *   EN_REPARTO → ENTREGADO (prueba o su falta declarada)
 *   ENTREGADO · RECHAZADO · CANCELADO → nada. Un estado terminal no se reabre: si hubo un error,
 *   se avanza a uno nuevo que lo reconoce y las dos horas quedan.
 *
 * C07 · cancelación: quién y hasta cuándo. Quién PAGA el rechazo es Q36 y aquí NO se cobra a
 * nadie: se anota la cancelación con su hora y la deuda queda visible, no inventada.
 *
 * El pedido de RECOGIDA no entra: si el `pedido.creado` no trae `entrega` (dirección y oferta),
 * no es un pedido del mercado, es un pedido de la tienda. No se rellena con ceros ni se inventa
 * una dirección para poder aceptarlo.
 *
 * Isla: cero require a otra isla. Lo que necesita viaja en el evento o se pide al bus.
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

class PedidoMercado extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'pedido-mercado';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/pedido-mercado.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onAceptarRequest(e) { return this.servir(e, 'aceptar', 'pedido-mercado.aceptar', (d) => this._aceptar(d)); }
  onRechazarRequest(e) { return this.servir(e, 'rechazar', 'pedido-mercado.rechazar', (d) => this._rechazar(d)); }
  onCancelarRequest(e) { return this.servir(e, 'cancelar', 'pedido-mercado.cancelar', (d) => this._cancelar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'pedido-mercado.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  // C02 · el pedido NACE del de pizzepos: mismo id, sello de la plaza y la entrega que viaja.
  async onPedidoCreado(e) {
    const d = this.datos(e);
    const plaza_id = this.plaza_id || d.plaza_id || null;
    if (!plaza_id) {
      this.logger?.warn('pedido-mercado.sin_plaza', { pedido_id: d.pedido_id || null, hueco: 'sin plaza' });
      return null;
    }
    const entrega = (d.entrega && typeof d.entrega === 'object') ? d.entrega : null;
    if (!entrega) {
      // No es un pedido del mercado: es de la tienda. No se rellena con ceros.
      this.logger?.info('pedido-mercado.ignorado', { pedido_id: d.pedido_id || null, motivo: 'sin entrega: no es de domicilio' });
      return null;
    }
    return this._nacer({ ...d, project_id: plaza_id, plaza_id });
  }

  // pedido.cancelado de pizzepos: la tienda (o el cliente por su canal) canceló. Se anota; no se cobra.
  async onPedidoCancelado(e) {
    const d = this.datos(e);
    const plaza_id = this.plaza_id || d.plaza_id || null;
    if (!plaza_id || !d.pedido_id) return null;
    const est = await this.estado(plaza_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return null;
    const err = this._transitar(p, 'CANCELADO', d.rol || 'tienda', this._iso(d.hora) || this.ahora(), 'pedido.cancelado');
    if (err) {
      this.logger?.warn('pedido-mercado.cancelado_no_aplicado', { pedido_id: p.pedido_id, estado: p.estado, code: err.error?.code });
      return null;
    }
    p.motivo_cancelacion = d.motivo || null;
    await this.guardar(plaza_id);
    this.hecho('bocaos.pedido_cancelado', {
      pedido_id: p.pedido_id,
      plaza_id: p.plaza_id,
      tienda_id: p.tienda_id,
      estado: 'CANCELADO',
      rol: d.rol || 'tienda',
      motivo: p.motivo_cancelacion,
      hora: this._iso(d.hora) || this.ahora(),
      // Q36 abierto: se anota, NO se cobra a nadie.
      cobrado: false,
      deuda_visible: true
    });
    return null;
  }

  // C04: la tienda declaró listo (el hecho lo anota `hecho-listo` con su sello).
  async onPedidoListo(e) {
    const d = this.datos(e);
    const plaza_id = this.plaza_id || d.plaza_id || null;
    if (!plaza_id || !d.pedido_id) return null;
    const est = await this.estado(plaza_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return null;
    const err = this._transitar(p, 'LISTO', d.tienda_id || p.tienda_id, this._iso(d.hora_listo) || this.ahora(), 'pedido_listo');
    if (err) return null;
    p.hora_listo = this._iso(d.hora_listo) || null;
    await this.guardar(plaza_id);
    return null;
  }

  // El reparto empieza cuando el rider RECOGE: ése es el hecho, no la firma del contrato.
  async onHechoRepartoAnotado(e) {
    const d = this.datos(e);
    const plaza_id = this.plaza_id || d.plaza_id || null;
    if (!plaza_id || !d.pedido_id) return null;
    const est = await this.estado(plaza_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return null;

    const hora = this._iso(d.hora) || this.ahora();
    if (d.tipo === 'recogida') {
      const err = this._transitar(p, 'EN_REPARTO', d.autor || 'rider', hora, 'recogida');
      if (err) {
        this.logger?.warn('pedido-mercado.recogida_no_aplicada', { pedido_id: p.pedido_id, estado: p.estado });
        return null;
      }
      p.rider_id = d.autor || p.rider_id || null;
      p.contrato_id = d.contrato_id || p.contrato_id || null;
      p.hora_recogida = hora;
      await this.guardar(plaza_id);
      return null;
    }

    if (d.tipo === 'entrega') {
      // La entrega se anota, pero NO entrega el pedido: entregar exige prueba (o su falta
      // declarada), y ésa es un hecho aparte. Un «entregado» sin prueba es una opinión.
      p.hora_entrega = hora;
      p.entrega_anotada = { hora, autor: d.autor || null };
      await this.guardar(plaza_id);
      return null;
    }
    return null;
  }

  // F02: la prueba o su falta declarada. Es lo ÚNICO que cierra un pedido en ENTREGADO.
  async onPruebaAnotada(e) {
    const d = this.datos(e);
    const plaza_id = this.plaza_id || d.plaza_id || null;
    if (!plaza_id || !d.pedido_id) return null;
    const est = await this.estado(plaza_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return null;
    if (!p.entrega_anotada) {
      // Sin hecho de entrega no hay nada que probar: se dice el hueco, no se entrega de palabra.
      this.logger?.warn('pedido-mercado.prueba_sin_entrega', { pedido_id: p.pedido_id, hueco: 'sin hecho de entrega' });
      return null;
    }
    const prueba = d.prueba || (d.falta ? { falta: true, motivo: d.motivo || null } : null);
    if (!prueba) {
      this.logger?.warn('pedido-mercado.prueba_vacia', { pedido_id: p.pedido_id, hueco: 'prueba sin dato' });
      return null;
    }
    const err = this._transitar(p, 'ENTREGADO', prueba.autor || d.autor || 'rider', p.hora_entrega || this.ahora(), 'prueba_anotada');
    if (err) {
      this.logger?.warn('pedido-mercado.entrega_no_aplicada', { pedido_id: p.pedido_id, estado: p.estado });
      return null;
    }
    p.prueba = prueba;
    await this.guardar(plaza_id);
    return null;
  }

  // El contrato cerrado no entrega un pedido: cierra el reparto. Si no hay hecho de entrega, se
  // nombra el hueco en lugar de dar por entregado lo que nadie probó.
  async onContratoCerrado(e) {
    const d = this.datos(e);
    const plaza_id = this.plaza_id || d.plaza_id || null;
    if (!plaza_id || !d.pedido_id) return null;
    const est = await this.estado(plaza_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) return null;
    p.contrato_cerrado_en = this._iso(d.hora_cierre) || this.ahora();
    if (p.estado === 'EN_REPARTO' && !p.entrega_anotada) {
      p.huecos = [...new Set([...(p.huecos || []), 'contrato cerrado sin hecho de entrega'])];
    }
    await this.guardar(plaza_id);
    return null;
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) {
      this.plaza_id = d.project_id;
      await this.estado(d.project_id);
    }
  }

  // ================= C02 · nacer =================
  async _nacer(d) {
    const p = d;
    if (!p.pedido_id) {
      this.logger?.warn('pedido-mercado.sin_id', { hueco: 'pedido_id' });
      return null;
    }
    // El id del pedido de la tienda es la clave de unión: sin él no hay unión, hay un pedido nuevo.
    if (!p.tienda_id) p.tienda_id = p.project_slug || null;
    if (!p.tienda_id) {
      this.logger?.warn('pedido-mercado.sin_tienda', { pedido_id: p.pedido_id, hueco: 'sin tienda' });
      return null;
    }

    const entrega = p.entrega || {};
    const oferta = entrega.oferta_centimos ?? entrega.oferta_cents ?? p.oferta_reparto_cents ?? null;
    if (!CENTIMOS(oferta)) {
      // C02/E01: sin la oferta del cliente no hay precio congelado; sin precio el pedido no nace.
      this.logger?.warn('pedido-mercado.sin_oferta', { pedido_id: p.pedido_id, hueco: 'sin oferta del cliente' });
      return null;
    }
    const direccion = entrega.direccion || p.direccion || null;
    if (!direccion) {
      this.logger?.warn('pedido-mercado.sin_direccion', { pedido_id: p.pedido_id, hueco: 'sin dirección de entrega' });
      return null;
    }

    const est = await this.estado(p.project_id);
    est.pedidos = est.pedidos || {};
    const existente = est.pedidos[p.pedido_id];
    if (existente) return existente;   // idempotente: el mismo hecho no nace dos veces

    const hora = this._iso(p.hora) || this.ahora();
    const pedido = {
      pedido_id: p.pedido_id,
      plaza_id: p.plaza_id || p.project_id,
      tienda_id: p.tienda_id,
      zona: p.zona || (entrega.zona || null),
      direccion,
      // El precio del REPARTO es lo único económico que la plaza guarda (E01/E03). El importe de
      // la comida no entra aquí: no es asunto del mercado.
      precio: {
        oferta_centimos: oferta,
        tope_centimos: CENTIMOS(entrega.tope_centimos) ? entrega.tope_centimos : null,
        cerrado: false
      },
      estado: 'RECIBIDO',
      hora_pedido: hora,
      hora_listo: null,
      hora_recogida: null,
      hora_entrega: null,
      entrega_anotada: null,
      contrato_id: null,
      rider_id: null,
      prueba: null,
      huecos: [],
      hechos: [{ estado: 'RECIBIDO', hora, autor: 'tienda', origen: 'pedido.creado' }]
    };
    est.pedidos[p.pedido_id] = pedido;
    await this.guardar(p.project_id);

    this.hecho('bocaos.pedido_creado', {
      pedido_id: pedido.pedido_id,
      plaza_id: pedido.plaza_id,
      tienda_id: pedido.tienda_id,
      estado: 'RECIBIDO',
      hora,
      direccion: pedido.direccion,
      zona: pedido.zona,
      oferta_centimos: pedido.precio.oferta_centimos,
      items_count: Number.isInteger(p.items_count) ? p.items_count : null,
      // Lo que NO viaja, y se dice: el teléfono del cliente se queda en la tienda (D05).
      telefono_en_el_evento: false
    });
    return pedido;
  }

  // ================= C02/Q27 · la tienda acepta o rechaza =================
  async _aceptar(d) {
    const r = await this._transicionDeLaTienda(d, 'ACEPTADO');
    if (r.status !== 200) return r;
    this.hecho('bocaos.pedido_aceptado', this._cargaDeTransicion(r.data.pedido, 'ACEPTADO', d));
    return { status: 200, data: { pedido_id: r.data.pedido.pedido_id, estado: 'ACEPTADO', pedido: this._vista(r.data.pedido) } };
  }

  async _rechazar(d) {
    const r = await this._transicionDeLaTienda(d, 'RECHAZADO');
    if (r.status !== 200) return r;
    const carga = this._cargaDeTransicion(r.data.pedido, 'RECHAZADO', d);
    // Q36: se anota el rechazo; NO se cobra a nadie mientras no haya respuesta.
    this.hecho('bocaos.pedido_rechazado', { ...carga, motivo: d.motivo || null, cobrado: false, deuda_visible: true });
    return { status: 200, data: { pedido_id: r.data.pedido.pedido_id, estado: 'RECHAZADO', pedido: this._vista(r.data.pedido) } };
  }

  async _transicionDeLaTienda(d, destino) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    if (d.rol !== 'tienda' || !d.tienda_id) {
      // C02/Q27: sólo la tienda dueña acepta o rechaza su pedido. La plaza no opera el restaurante.
      return this._errorResponse(403, 'FORBIDDEN',
        'sólo la tienda dueña del pedido puede aceptarlo o rechazarlo (Q27)',
        { field: 'rol', hueco: 'el autor no es la tienda' });
    }
    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) {
      return this._errorResponse(404, 'PEDIDO_NO_CONSTA',
        'el pedido no está en el registro de esta plaza: no se inventa para poder aceptarlo',
        { field: 'pedido_id' });
    }
    if (p.tienda_id !== d.tienda_id) {
      return this._errorResponse(403, 'FORBIDDEN', 'la tienda no es la dueña de este pedido', { field: 'tienda_id' });
    }
    const err = this._transitar(p, destino, 'tienda', this._iso(d.hora) || this.ahora(), `transicion_${destino.toLowerCase()}`);
    if (err) return err;
    await this.guardar(d.project_id);
    return { status: 200, data: { pedido: p } };
  }

  // ================= C07 · cancelar =================
  async _cancelar(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) {
      return this._errorResponse(404, 'PEDIDO_NO_CONSTA', 'el pedido no está en el registro de esta plaza', { field: 'pedido_id' });
    }
    const puede = CANCELACION[d.rol];
    if (!puede) {
      return this._errorResponse(403, 'FORBIDDEN',
        'rol no declarado en la tabla de cancelación (cliente | tienda | plaza)', { field: 'rol' });
    }
    const veredicto = this._puedeCancelar(p, d.rol, this._iso(d.hora) || this.ahora());
    if (!veredicto.si) {
      return this._errorResponse(409, 'CANCELACION_FUERA_DE_PLAZO', veredicto.motivo,
        { field: 'estado', estado: p.estado, rol: d.rol, hasta: veredicto.hasta });
    }
    const err = this._transitar(p, 'CANCELADO', d.rol, this._iso(d.hora) || this.ahora(), `cancelacion_${d.rol}`);
    if (err) return err;
    p.motivo_cancelacion = d.motivo || null;
    await this.guardar(d.project_id);

    this.hecho('bocaos.pedido_cancelado', {
      pedido_id: p.pedido_id,
      plaza_id: p.plaza_id,
      tienda_id: p.tienda_id,
      estado: 'CANCELADO',
      rol: d.rol,
      motivo: p.motivo_cancelacion,
      hora: this._iso(d.hora) || this.ahora(),
      // Q36 abierto: se anota, NO se cobra a nadie.
      cobrado: false,
      deuda_visible: true
    });
    return { status: 200, data: { pedido_id: p.pedido_id, estado: 'CANCELADO', cancelado_por: d.rol, pedido: this._vista(p) } };
  }

  // C07: quién y hasta cuándo. La tabla es la respuesta; el motivo se dice.
  _puedeCancelar(p, rol, instante) {
    const estados = CANCELACION[rol] || [];
    if (!estados.includes(p.estado)) {
      return {
        si: false,
        motivo: `el ${rol} no puede cancelar un pedido en ${p.estado}`,
        hasta: estados.length > 0 ? `hasta ${estados[estados.length - 1]}` : 'nunca'
      };
    }
    return { si: true, en: instante };
  }

  // ================= C02 · de (PREGUNTA) =================
  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const est = await this.estado(d.project_id);
    const p = est.pedidos?.[d.pedido_id];
    if (!p) {
      return this._errorResponse(404, 'PEDIDO_NO_CONSTA', 'el pedido no está en el registro de esta plaza', { field: 'pedido_id' });
    }
    return {
      status: 200,
      data: {
        pedido: this._vista(p),
        hechos: p.hechos,
        // C07, respondido de una vez: quién puede cancelar ahora y hasta cuándo.
        cancelacion: {
          cliente: this._puedeCancelar(p, 'cliente', this.ahora()).si,
          tienda: this._puedeCancelar(p, 'tienda', this.ahora()).si,
          plaza: this._puedeCancelar(p, 'plaza', this.ahora()).si,
          hasta: { cliente: 'RECIBIDO', tienda: 'ACEPTADO', plaza: 'LISTO' }
        }
      }
    };
  }

  // ================= tabla cerrada =================
  _transitar(p, destino, autor, hora, origen) {
    const permitidas = TRANSICIONES[p.estado] || [];
    if (!permitidas.includes(destino)) {
      return this._errorResponse(409, 'TRANSICION_NO_PERMITIDA',
        `${p.estado} → ${destino} no está en la tabla: un estado sin hecho con hora es una opinión`,
        { estado: p.estado, destino, permitidas });
    }
    p.estado = destino;
    p.hechos.push({ estado: destino, hora: this._iso(hora) || this.ahora(), autor: autor || 'sistema', origen: origen || null });
    return null;
  }

  // Lo que viaja con la transición: sin esto, el que escucha tendría que leer este almacén.
  _cargaDeTransicion(p, destino, d) {
    return {
      pedido_id: p.pedido_id,
      plaza_id: p.plaza_id,
      tienda_id: p.tienda_id,
      estado: destino,
      hora: this._iso(d.hora) || this.ahora(),
      direccion: p.direccion,
      zona: p.zona,
      precio: p.precio
    };
  }

  _vista(p) {
    return {
      pedido_id: p.pedido_id,
      plaza_id: p.plaza_id,
      tienda_id: p.tienda_id,
      zona: p.zona,
      direccion: p.direccion,
      precio: p.precio,
      estado: p.estado,
      hora_pedido: p.hora_pedido,
      hora_listo: p.hora_listo,
      hora_recogida: p.hora_recogida,
      hora_entrega: p.hora_entrega,
      contrato_id: p.contrato_id,
      rider_id: p.rider_id,
      prueba: p.prueba,
      motivo_cancelacion: p.motivo_cancelacion || null,
      huecos: p.huecos || [],
      hechos: p.hechos.length
    };
  }
}

module.exports = PedidoMercado;
module.exports.TRANSICIONES = TRANSICIONES;
module.exports.CANCELACION = CANCELACION;
