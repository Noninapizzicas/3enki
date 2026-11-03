'use strict';

/**
 * aviso-tienda · PUENTE · PLAZA — C03 (AvisoTienda) + K01 (ReclamaciónPorLaTienda).
 *
 * AVISA A LA TIENDA POR SU CANAL. Y nada más: ésa es la regla.
 *
 *   1. AVISA, NO DECIDE (C03). No acepta por ella, no arranca su cocina, no la compromete a una
 *      hora. Si pudiera, la plaza estaría operando el restaurante. Un aviso que trae una orden se
 *      rechaza con 409 AVISO_NO_ORDENA: el aviso es una voz, no una mano.
 *   2. SI EL AVISO NO LLEGA, EL PEDIDO EXISTE IGUAL. El aviso es transporte, no verdad: un chat
 *      sin configurar produce `aviso-tienda.fallido` con su motivo, y nadie pierde el pedido.
 *   3. LA QUEJA VA A LA TIENDA (K01). Bocaos no atiende al cliente final: no tiene dónde poner su
 *      caso. Si una reclamación llega aquí por error, se DEVUELVE a la tienda con su hora — no se
 *      atiende, no se responde, no se guarda como relación.
 *
 * El transporte es el de siempre (`telegram.send_message.request`, el mismo que usa reporte-caja),
 * inyectable en tests. El chat NO se guarda aquí: es del censo (`censo-parte.de`), que es quien lo
 * declara. Sin store: este puente no escribe estado.
 *
 * Isla: cero require a otra isla.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

// C03 · lo que el aviso hace es avisar. Estas son las llaves con las que alguien intentaría que
// decidiera, y ninguna tiene dónde ponerse.
const ORDENES = ['aceptar', 'arrancar_cocina', 'hora_comprometida', 'comprometer_hora', 'estado_pedido', 'asignar_rider'];

const TIMEOUT_ENVIO_MS = 5000;
const TIMEOUT_CENSO_MS = 3000;
const BOT = 'bocaos';

class AvisoTienda extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'aviso-tienda';
    this.version = 'puente-0.1.0';
    this._path = null;             // sin estado: avisar no escribe nada
    this.bot = BOT;
    this.transporte = null;        // inyectable: { enviar(msg) → {ok, mensaje_id} }
    this._enviados = new Set();    // pedido|tipo ya avisado (el mismo hecho no se avisa dos veces)
  }

  onDevolverRequest(e) { return this.servir(e, 'devolver', 'aviso-tienda.devolver', (d) => this._devolver(d)); }

  // ================= hechos que escucha =================
  async onPedidoCreado(e) { return this._porHecho(e, 'pedido_recibido'); }
  async onContratoCreado(e) { return this._porHecho(e, 'rider_asignado'); }
  async onHuecoNombrado(e) { return this._porHecho(e, 'hueco_nombrado'); }

  async _porHecho(e, tipo) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    // Un mismo hecho dos veces no abre dos avisos.
    const clave = `${d.pedido_id}|${tipo}`;
    if (this._enviados.has(clave)) return null;
    this._enviados.add(clave);
    if (this._enviados.size > 2000) this._enviados.delete(this._enviados.values().next().value);

    await this._avisar({
      project_id: d.project_id,
      plaza_id: d.plaza_id || null,
      tienda_id: d.tienda_id || d.partes_id || null,
      pedido_id: d.pedido_id,
      tipo,
      texto: this._texto(tipo, d)
    });
    return null;
  }

  // ================= C03 · avisar =================
  // La única cosa que este módulo hace: poner un mensaje en el canal de la tienda.
  async _avisar(d) {
    if (!d.tienda_id) {
      this.hecho('aviso-tienda.fallido', {
        pedido_id: d.pedido_id || null,
        plaza_id: d.plaza_id || null,
        tipo: d.tipo,
        motivo: 'sin tienda: no se sabe a qué canal avisar'
      });
      return { status: 422, error: { code: 'SIN_TIENDA', message: 'sin tienda no hay canal', details: { field: 'tienda_id' } } };
    }

    const chat_id = await this._chatDeTienda(d);
    if (!chat_id) {
      // Sin chat configurado el pedido sigue vivo: se dice el fallo y se sigue.
      this.hecho('aviso-tienda.fallido', {
        pedido_id: d.pedido_id || null,
        plaza_id: d.plaza_id || null,
        tienda_id: d.tienda_id,
        tipo: d.tipo,
        motivo: 'la tienda no tiene chat configurado en el censo',
        hueco: 'sin canal'
      });
      return { status: 422, error: { code: 'SIN_CANAL', message: 'la tienda no tiene chat en el censo', details: { field: 'chat_id', hueco: 'sin canal' } } };
    }

    const mensaje = {
      canal: 'tienda',
      botName: this.bot,
      chatId: Number.isFinite(Number(chat_id)) ? Number(chat_id) : chat_id,
      text: d.texto,
      pedido_id: d.pedido_id || null,
      tipo: d.tipo
    };

    let res;
    try {
      res = await this._enviar(mensaje);
    } catch (err) {
      res = { ok: false, motivo: err.message };
    }

    if (!res || res.ok === false) {
      this.hecho('aviso-tienda.fallido', {
        pedido_id: d.pedido_id || null,
        plaza_id: d.plaza_id || null,
        tienda_id: d.tienda_id,
        tipo: d.tipo,
        chat_id,
        motivo: (res && res.motivo) || 'el transporte no entregó',
        hueco: 'sin entrega'
      });
      return { status: 502, error: { code: 'ENVIO_FALLIDO', message: 'el aviso no llegó; el pedido existe igual', details: { field: 'telegram' } } };
    }

    this.hecho('aviso-tienda.enviado', {
      pedido_id: d.pedido_id || null,
      plaza_id: d.plaza_id || null,
      tienda_id: d.tienda_id,
      tipo: d.tipo,
      chat_id,
      mensaje_id: (res.mensaje_id ?? res.id ?? null) || null,
      texto: d.texto,
      // C03: se dice en el propio hecho que el aviso no mueve nada.
      ordena: false
    });
    return { status: 200, data: { pedido_id: d.pedido_id || null, tipo: d.tipo, chat_id, enviado: true } };
  }

  // ================= K01 · devolver la reclamación a la tienda =================
  async _devolver(d) {
    if (!d.project_id) return this._invalid('project_id');
    const orden = ORDENES.filter((k) => d[k] !== undefined && d[k] !== null);
    if (orden.length > 0) {
      return this._errorResponse(409, 'AVISO_NO_ORDENA',
        `un aviso no ${orden[0]}: la tienda decide, la plaza avisa (C03)`,
        { field: orden[0], rechazos: orden });
    }
    const tienda_id = d.tienda_id || null;
    if (!tienda_id) return this._invalid('tienda_id');

    const hora = this._iso(d.hora) || this.ahora();
    const texto = typeof d.texto === 'string' && d.texto
      ? d.texto
      : `Reclamación del cliente devuelta a tu tienda (${d.pedido_id || 'sin pedido'}). Bocaos no atiende al cliente final.`;

    const r = await this._avisar({
      project_id: d.project_id,
      plaza_id: d.plaza_id || null,
      tienda_id,
      pedido_id: d.pedido_id || null,
      tipo: 'reclamacion',
      texto
    });

    // K01: se devuelve con su hora, se diga lo que diga el transporte. La devolución es el hecho;
    // que llegue o no, es transporte.
    this.hecho('bocaos.reclamacion_devuelta', {
      reclamacion_id: d.reclamacion_id || null,
      pedido_id: d.pedido_id || null,
      plaza_id: d.plaza_id || null,
      tienda_id,
      hora,
      motivo: 'Bocaos no atiende al cliente final: su única vía de queja pasa por la tienda (K01)',
      entregada: r.status === 200
    });

    if (r.status !== 200) return r;
    return { status: 200, data: { reclamacion_id: d.reclamacion_id || null, devuelta_a: tienda_id, hora, entregada: true } };
  }

  // ================= el canal de la tienda: se PIDE al censo =================
  async _chatDeTienda(d) {
    try {
      const r = await this._rpc('censo-parte.de.request', {
        project_id: d.project_id, plaza_id: d.plaza_id || null, parte_id: d.tienda_id
      }, { timeout_ms: TIMEOUT_CENSO_MS });
      const chat = r?.data?.parte?.chat_id;
      if (chat === null || chat === undefined || chat === '') return null;
      return String(chat);
    } catch (_) {
      return null;
    }
  }

  // El texto NO da órdenes: cuenta lo que pasó. Nada de «acepta», «empieza», «a las 21:30».
  _texto(tipo, d) {
    const id = d.pedido_id || 'un pedido';
    switch (tipo) {
      case 'pedido_recibido':
        return `Pedido recibido en tu tienda: ${id}${d.zona ? ` · zona ${d.zona}` : ''}.`;
      case 'rider_asignado':
        return `Rider asignado al pedido ${id}.`;
      case 'hueco_nombrado':
        return `Todavía sin rider para el pedido ${id}${d.motivo ? `: ${d.motivo}` : '.'}`;
      case 'reclamacion':
        return d.texto || `Reclamación del cliente sobre ${id}, devuelta a tu tienda.`;
      default:
        return `Aviso de tu tienda sobre ${id}.`;
    }
  }

  // ================= transporte =================
  async _enviar(mensaje) {
    if (this.transporte && typeof this.transporte.enviar === 'function') {
      return this.transporte.enviar(mensaje);
    }
    return this._enviarPorBus(mensaje);
  }

  // La MISMA puerta que usa `reporte-caja`: telegram.send_message.request. Se publica y se espera
  // su response correlada; si no contesta, el aviso se declara fallido (no se cuelga el puente).
  _enviarPorBus(mensaje) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve) => {
      let unsub = null;
      const timer = setTimeout(() => { if (unsub) unsub(); resolve({ ok: false, motivo: 'sin respuesta de telegram.send_message', hueco: 'sin telegram' }); }, TIMEOUT_ENVIO_MS);
      try {
        unsub = this.eventBus.subscribe('telegram.send_message.response', (event) => {
          const r = event?.data || event;
          if (!r || r.request_id !== request_id) return;
          clearTimeout(timer);
          if (unsub) unsub();
          if (r.status === 200) return resolve({ ok: true, mensaje_id: r?.data?.message_id ?? null });
          resolve({ ok: false, motivo: r?.error?.message || 'telegram rechazó el mensaje' });
        });
        this.eventBus.publish('telegram.send_message.request', {
          request_id,
          botName: mensaje.botName,
          chatId: mensaje.chatId,
          text: mensaje.text
        });
      } catch (err) {
        clearTimeout(timer);
        if (unsub) unsub();
        resolve({ ok: false, motivo: err.message });
      }
    });
  }
}

module.exports = AvisoTienda;
module.exports.ORDENES = ORDENES;
