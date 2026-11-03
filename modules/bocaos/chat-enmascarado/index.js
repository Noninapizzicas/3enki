'use strict';

/**
 * chat-enmascarado · PUENTE · PLAZA — F04 (ChatEnmascarado).
 *
 * RIDER ↔ CLIENTE CON ALIAS POR CONTRATO Y SIN NÚMEROS DE TELÉFONO.
 *
 * Tres reglas que son el módulo:
 *
 *   1. EL ALIAS ES DEL CONTRATO, NO DE LA PERSONA. Se deriva del `contrato_id` con una huella: el
 *      mismo rider en otro contrato tiene otro alias, y el cliente tampoco arrastra el suyo. Por eso
 *      no hay tabla que guardar (y por eso no hay tabla que filtrar).
 *   2. AL CERRAR EL CONTRATO, EL ALIAS MUERE. Antes de entregar se le pregunta a su custodio
 *      (`contrato-puntual.de`) si el contrato sigue VIVO: un alias que sobrevive al contrato sería
 *      una puerta abierta entre dos personas que ya no tienen nada que ver.
 *   3. CERO AGREGADOS SOBRE LA CONVERSACIÓN (art. 15 de la Directiva). El mensaje cruza y NO se
 *      guarda: ni el texto, ni su longitud, ni cuántos van, ni el histórico. El hecho que se publica
 *      dice que cruzó y por dónde, nada más. Un chat con histórico legible por la plaza es un chat
 *      que la plaza puede leer, y aquí no hay nada que ganar leyendo.
 *
 * El número de teléfono no viaja en el mensaje: se sustituye por el alias. El destino sí se resuelve
 * (el móvil del rider por el censo, el del cliente por el pedido de la tienda), pero el número se
 * queda en el transporte y no entra ni en el texto ni en el hecho.
 *
 * Isla: cero require a otra isla. Todo lo que necesita lo pide al bus.
 */

const ModuloBocaos = require('../_bocaos');

const LADOS = ['rider', 'cliente'];
const TIMEOUT_BUS_MS = 2000;
const TIMEOUT_ENVIO_MS = 5000;

// Un teléfono español (o con prefijo) en cualquier formato razonable: +34 600 11 22 33 · 600112233.
const TELEFONO = /(\+?\d[\d\s.\-().]{7,}\d)/g;

class ChatEnmascarado extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'chat-enmascarado';
    this.version = 'puente-0.1.0';
    this._path = null;             // sin store: aquí no se guarda ni el texto ni el histórico
    this.bot = 'bocaos';
    this.transporte = null;        // inyectable: { enviar(msg) → {ok, mensaje_id}|{ok:false, motivo} }
    this.tiempo_bus_ms = TIMEOUT_BUS_MS;
    this.tiempo_envio_ms = TIMEOUT_ENVIO_MS;
    this._abiertos = new Map();    // contrato_id → { pedido_id, rider_id, plaza_id } (sólo para no preguntar de más)
  }

  // ================= RPC del bus =================
  onEntregarRequest(e) { return this.servir(e, 'entregar', 'chat-enmascarado.entregar', (d) => this._entregar(d)); }

  // ================= hechos que escucha =================
  // Con el contrato nace el canal. La plaza NO abre un chat por pedido: abre el del contrato vivo.
  async onContratoCreado(e) {
    const d = this.datos(e);
    if (!d.contrato_id || !d.pedido_id) return null;
    this._abiertos.set(d.contrato_id, {
      pedido_id: d.pedido_id,
      rider_id: d.rider_id || null,
      plaza_id: d.plaza_id || this.plaza_id || null
    });
    if (this._abiertos.size > 2000) this._abiertos.delete(this._abiertos.keys().next().value);
    return null;
  }

  // ================= F04 · entregar (ORDEN) =================
  async _entregar(d) {
    const plaza_id = this.plaza_id || d.plaza_id || null;
    if (!plaza_id) return this._invalid('plaza_id');
    if (!d.contrato_id && !d.pedido_id) return this._invalid('contrato_id');
    if (typeof d.texto !== 'string' || !d.texto.trim()) return this._invalid('texto');
    if (!LADOS.includes(d.de)) {
      return this._errorResponse(422, 'LADO_INVALIDO', 'de debe ser rider | cliente: la plaza no chatea',
        { field: 'de', lados: LADOS });
    }
    const a = d.de === 'rider' ? 'cliente' : 'rider';

    // El contrato es la ÚNICA prueba de que el alias vive. Se pregunta a su custodio, no a la memoria.
    const contrato = await this._contratoDe(d, plaza_id);
    if (!contrato) {
      return this._rechazar(d, {
        code: 404, motivo: 'no hay contrato para ese pedido: sin contrato no hay alias',
        hueco: 'sin contrato', a
      });
    }
    if (contrato.estado !== 'VIVO') {
      // F04: el alias muere con el contrato. No se entrega «por si acaso».
      return this._rechazar(d, {
        code: 409, motivo: `el contrato está ${contrato.estado}: el alias murió con él`,
        hueco: 'alias muerto', a, contrato_id: contrato.contrato_id
      });
    }

    const contrato_id = contrato.contrato_id;
    const alias_de = this._alias(contrato_id, d.de);
    const alias_a = this._alias(contrato_id, a);

    // El número no cruza: se tapa en el texto y se sustituye por el alias del que habla.
    const limpio = this._sinNumeros(d.texto);
    if (!limpio) {
      return this._rechazar(d, {
        code: 422,
        motivo: 'el mensaje sólo llevaba un número de teléfono: sin número no queda mensaje',
        hueco: 'mensaje vacío tras enmascarar', a, contrato_id
      });
    }
    const texto = `${alias_de}: ${limpio}`;

    // El destino se resuelve por el lado que recibe. Si no se puede, se dice: el mensaje no se pierde
    // en silencio (y no se inventa un móvil).
    const cliente = a === 'cliente' ? await this._clienteDe(contrato, d) : null;
    const destino = a === 'rider' ? await this._chatDelRider(contrato, plaza_id) : (cliente && cliente.telefono);
    if (!destino) {
      const hueco = a === 'rider' ? 'sin chat_id del rider' : 'sin teléfono del cliente';
      return this._rechazar(d, {
        code: 422,
        motivo: `no hay a quién entregar (${hueco}): la plaza no guarda el móvil de nadie`,
        hueco, a, contrato_id
      });
    }

    const mensaje = {
      canal: `chat-${a}`,
      de: d.de,
      a,
      alias_de,
      alias_a,
      // El destino (chat_id o teléfono) viaja al TRANSPORTE y no entra en el hecho.
      destino,
      chat_id: a === 'rider' ? destino : null,
      to: a === 'cliente' ? destino : null,
      // El canal del cliente es el DE LA TIENDA (K02): la plaza no tiene canal propio hacia él.
      project_slug: a === 'cliente' ? (cliente && cliente.project_slug) || null : null,
      texto,
      pedido_id: contrato.pedido_id,
      contrato_id
    };

    let res;
    try {
      res = await this._enviar(mensaje);
    } catch (err) {
      res = { ok: false, motivo: err.message };
    }
    if (!res || res.ok === false) {
      return this._rechazar(d, {
        code: 502,
        motivo: (res && res.motivo) || 'el transporte no entregó',
        hueco: (res && res.hueco) || 'sin entrega', a, contrato_id, alias_de, alias_a
      });
    }

    // Lo que se publica: que cruzó y por dónde. NI el texto, NI su tamaño, NI cuántos van (F04).
    this.hecho('bocaos.mensaje_entregado', {
      contrato_id,
      pedido_id: contrato.pedido_id,
      plaza_id,
      de: d.de,
      a,
      alias_de,
      alias_a,
      canal: mensaje.canal,
      mensaje_id: (res && (res.mensaje_id ?? res.id ?? null)) || null,
      hora: this.ahora(),
      cuerpo_guardado: false
    });

    return {
      status: 200,
      data: {
        contrato_id,
        de: d.de,
        a,
        alias_de,
        alias_a,
        entregado: true,
        mensaje_id: (res && (res.mensaje_id ?? res.id ?? null)) || null,
        // Se dice en la propia respuesta: el canal no guarda copia.
        historico: false,
        agregados: false
      }
    };
  }

  // ================= piezas =================
  async _contratoDe(d, plaza_id) {
    try {
      const r = await this._rpc('contrato-puntual.de.request', {
        project_id: plaza_id,
        contrato_id: d.contrato_id || null,
        pedido_id: d.pedido_id || (d.contrato_id ? null : null)
      }, { timeout_ms: this.tiempo_bus_ms });
      const c = r && r.status === 200 ? (r.data && r.data.contrato) : null;
      return c || null;
    } catch (_) {
      return null;
    }
  }

  async _chatDelRider(contrato, plaza_id) {
    const rider_id = contrato.rider_id || (this._abiertos.get(contrato.contrato_id) || {}).rider_id;
    if (!rider_id) return null;
    try {
      const r = await this._rpc('estado-parte.de.request', {
        project_id: plaza_id, plaza_id, parte_id: rider_id
      }, { timeout_ms: this.tiempo_bus_ms });
      const chat = r && r.data && r.data.parte ? r.data.parte.chat_id : null;
      return (chat === null || chat === undefined || chat === '') ? null : String(chat);
    } catch (_) {
      return null;
    }
  }

  // El móvil del cliente y el canal de su tienda: los dos están en el pedido de la tienda (D05).
  // La plaza no los guarda; los pide para entregar y los deja ir con el mensaje.
  async _clienteDe(contrato, d) {
    if (typeof d.telefono === 'string' && d.telefono.trim()) {
      return { telefono: d.telefono.trim(), project_slug: d.project_slug || d.tienda_id || null };
    }
    try {
      const r = await this._rpc('pedido.get.request', {
        project_id: d.tienda_project_id || d.tienda_id || null, pedido_id: contrato.pedido_id
      }, { timeout_ms: this.tiempo_bus_ms });
      const p = (r && r.data && (r.data.pedido || r.data)) || null;
      if (!p) return null;
      const t = p.cliente_telefono || p.telefono;
      if (typeof t !== 'string' || !t.trim()) return null;
      return { telefono: t.trim(), project_slug: p.project_slug || p.tienda_id || null };
    } catch (_) {
      return null;
    }
  }

  // El alias: huella del CONTRATO y del lado. No se guarda y no se puede invertir.
  _alias(contrato_id, lado) {
    return `${lado === 'rider' ? 'r' : 'c'}-${this.huella({ contrato_id, lado }).slice(0, 6)}`;
  }

  _sinNumeros(texto) {
    const limpio = String(texto).replace(TELEFONO, '[número oculto]').replace(/\s+/g, ' ').trim();
    // Si lo único que quedaba era el número, no hay mensaje que entregar.
    return /[a-zA-Z0-9áéíóúüñ]/.test(limpio.replace(/\[número oculto\]/g, '')) ? limpio : null;
  }

  async _enviar(mensaje) {
    if (this.transporte && typeof this.transporte.enviar === 'function') {
      return this.transporte.enviar(mensaje);
    }
    return this._enviarPorBus(mensaje);
  }

  // El mismo transporte que usa la plaza para los avisos: el de la tienda para el cliente, el del
  // rider para el rider. Ninguno de los dos es de Bocaos.
  async _enviarPorBus(mensaje) {
    if (mensaje.a === 'rider') {
      const r = await this._rpc('telegram.send_message.request', {
        botName: this.bot, chatId: mensaje.chat_id, text: mensaje.texto
      }, { timeout_ms: this.tiempo_envio_ms });
      if (!r || r.status !== 200) {
        return { ok: false, motivo: (r && r.error && r.error.message) || 'sin respuesta de telegram.send_message', hueco: 'sin telegram' };
      }
      return { ok: true, mensaje_id: (r.data && r.data.message_id) || null };
    }
    const r = await this._rpc('whatsapp.enviar.request', {
      project_slug: mensaje.project_slug || null, to: mensaje.to, text: mensaje.texto
    }, { timeout_ms: this.tiempo_envio_ms });
    if (!r || r.status !== 200) {
      return { ok: false, motivo: (r && r.error && r.error.message) || 'sin respuesta de whatsapp.enviar', hueco: 'sin whatsapp' };
    }
    return { ok: true, mensaje_id: (r.data && r.data.message_id) || null };
  }

  // El rechazo también es un hecho: nadie se queda mirando un mensaje que no salió y no sabe por qué.
  _rechazar(d, { code, motivo, hueco, a, contrato_id, alias_de, alias_a }) {
    const carga = {
      contrato_id: contrato_id || d.contrato_id || null,
      pedido_id: d.pedido_id || null,
      plaza_id: this.plaza_id || d.plaza_id || null,
      de: d.de || null,
      a: a || null,
      motivo,
      hueco,
      hora: this.ahora(),
      entregado: false,
      cuerpo_guardado: false
    };
    if (alias_de) carga.alias_de = alias_de;
    if (alias_a) carga.alias_a = alias_a;
    this.hecho('bocaos.mensaje_rechazado', carga);
    return this._errorResponse(code, 'MENSAJE_RECHAZADO', motivo, { field: 'texto', hueco });
  }
}

module.exports = ChatEnmascarado;
module.exports.LADOS = LADOS;
