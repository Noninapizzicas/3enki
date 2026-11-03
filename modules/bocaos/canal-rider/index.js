'use strict';

/**
 * canal-rider · PUENTE · PLAZA — Q42 (dos relojes) + A15 (acuse ≠ respuesta).
 *
 * EL ÚLTIMO TRAMO: pone la propuesta en el móvil del rider y devuelve lo que el rider hizo.
 * No decide nada: no elige a quién, no caduca, no acepta por nadie. Si el móvil no está,
 * lo dice con el hueco nombrado y sigue — el que cierra la propuesta es su custodio.
 *
 *   SALE  bocaos.propuesta_emitida → se resuelve el chat del rider POR EL BUS (estado-parte)
 *         y se entrega. Emite bocaos.propuesta_entregada | bocaos.propuesta_no_entregada.
 *   FRASE bocaos.propuesta_redactada llega del micro-agente `redaccion-propuesta`. Se espera
 *         como MUCHO `espera_redaccion_ms` (Q42, latencia crítica): si no llega, se entrega
 *         con la frase que ya trae la propuesta. Nunca se bloquea el reloj por una redacción.
 *   VUELTA el móvil entra por `canal-rider.recibir.request` (puerta del transporte) o publica
 *         `bocaos.propuesta_acuse | propuesta_aceptada | propuesta_rechazada`, y el canal lo
 *         reenvía al bus como `propuesta.<op>.request`. El canal no escribe estado: pide al
 *         custodio que lo escriba. El ACUSE, además, queda como hecho del bus (`via: 'movil'`):
 *         es la única de las tres voces sin hecho gemelo del custodio. Una intención se aplica
 *         UNA vez (dos acuses con la misma hora no reabren el reloj).
 *
 * El chat_id NO se guarda aquí: se pregunta a `estado-parte.de` (es su contacto, lo declara él).
 * El transporte se INYECTA (`this.transporte.enviar(msg)`); en producción es
 * `telegram.send_message.request`, en tests un transporte de mentira. Sin token, siempre.
 *
 * Isla: cero require a otra isla. Lo que necesita lo pide al bus.
 */

const ModuloBocaos = require('../_bocaos');

// Las tres voces del móvil. `acuse` es la única sin hecho gemelo del custodio (suyo es
// `propuesta_acusada`); por eso es la única que el canal pone en el bus con su nombre.
const ACCIONES = { acuse: 'acuse', aceptar: 'aceptar', rechazar: 'rechazar' };

const ESPERA_REDACCION_MS = 600;   // Q42: margen corto; el reloj de validez manda
const TIMEOUT_ENVIO_MS = 5000;
const TIMEOUT_ACUSE_MS = 1500;

class CanalRider extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'canal-rider';
    this.version = 'puente-0.1.0';
    this._path = null;                 // sin estado propio: la propuesta la guarda su custodio

    this.bot = 'bocaos';               // bot de Telegram del despliegue
    this.espera_redaccion_ms = ESPERA_REDACCION_MS;
    this.transporte = null;            // inyectable: { enviar(msg) → {ok, mensaje_id}|false }

    this._armadas = new Map();         // propuesta_id → { propuesta, chat_id, frase, timer }
    this._frases = new Map();          // propuesta_id → frase que llegó antes que el chat
    this._entregadas = new Set();      // propuesta_id ya enviadas (no se entrega dos veces)
    this._enVuelo = new Set();         // propuesta_id en entrega (dos disparos, un envío)
    this._aplicadas = new Set();       // op|propuesta|hora: una intención se aplica una vez
  }

  async onUnload() {
    for (const a of this._armadas.values()) if (a.timer) clearTimeout(a.timer);
    this._armadas.clear();
    await super.onUnload();
  }

  // ================= hechos que escucha =================

  // Q42 · el reloj empieza al EMITIR. Aquí se resuelve el móvil y se entrega (o se nombra el hueco).
  async onPropuestaEmitida(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.propuesta_id) return null;
    if (this._entregadas.has(d.propuesta_id) || this._enVuelo.has(d.propuesta_id)) return null;

    const chat_id = await this._chatDeRider(d.project_id, d.plaza_id, d.rider_id);
    if (!chat_id) {
      // No se inventa un destino ni se abre una ventana: se dice el hueco y el custodio decide.
      this.hecho('bocaos.propuesta_no_entregada', {
        propuesta_id: d.propuesta_id,
        pedido_id: d.pedido_id || null,
        rider_id: d.rider_id || null,
        plaza_id: d.plaza_id || null,
        canal: 'rider',
        motivo: 'el rider no tiene chat_id en el censo',
        hueco: 'sin chat_id'
      });
      return null;
    }

    // La frase del micro-agente manda; la de la propuesta es el SUELO, no el disparo: se espera
    // `espera_redaccion_ms` y, si no llega, sale el suelo. Nunca se espera más que eso (Q42).
    const guardada = this._frases.get(d.propuesta_id) || null;
    if (guardada) this._frases.delete(d.propuesta_id);
    const enElEvento = typeof d.frase === 'string' && d.frase ? d.frase : null;

    const espera = Number.isFinite(this.espera_redaccion_ms) ? this.espera_redaccion_ms : 0;
    if (guardada || enElEvento || espera <= 0) {
      await this._entregar(d, chat_id, guardada || enElEvento || null);
      return null;
    }

    const armada = { propuesta: d, chat_id, timer: null };
    armada.timer = setTimeout(() => {
      this._armadas.delete(d.propuesta_id);
      this._entregar(d, chat_id, d.vista?.frase || null);
    }, espera);
    this._armadas.set(d.propuesta_id, armada);
    return null;
  }

  // La frase ya está: si había una entrega armada, sale AHORA con la frase del micro-agente.
  async onPropuestaRedactada(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.propuesta_id || typeof d.frase !== 'string' || !d.frase) return null;
    if (this._entregadas.has(d.propuesta_id) || this._enVuelo.has(d.propuesta_id)) return null;

    const armada = this._armadas.get(d.propuesta_id);
    if (!armada) {
      // Llegó antes que la resolución del chat: se guarda para cuando toque.
      this._frases.set(d.propuesta_id, d.frase);
      if (this._frases.size > 500) this._frases.delete(this._frases.keys().next().value);
      return null;
    }
    if (armada.timer) clearTimeout(armada.timer);
    this._armadas.delete(d.propuesta_id);
    await this._entregar(armada.propuesta, armada.chat_id, d.frase);
    return null;
  }

  // ================= la vuelta: el móvil habla, el bus decide =================
  // Puerta del TRANSPORTE (el móvil no habla el bus): entra por RPC, se convierte en voz del bus
  // y el custodio escribe. Sin esta puerta, el acuse no lo emitiría nadie del repo.
  onRecibirRequest(e) { return this.servir(e, 'recibir', 'canal-rider.recibir', (d) => this._recibir(d)); }

  async _recibir(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.propuesta_id) return this._invalid('propuesta_id');
    const op = ACCIONES[d.accion];
    if (!op) {
      return this._errorResponse(400, 'INVALID_INPUT', 'accion debe ser acuse | aceptar | rechazar', { field: 'accion' });
    }

    const carga = {
      project_id: d.project_id,
      propuesta_id: d.propuesta_id,
      rider_id: d.rider_id || null,
      hora: this._iso(d.hora) || this.ahora()
    };
    if (op === 'rechazar') carga.motivo = d.motivo || 'rechazo desde el móvil';
    if (this._yaAplicada(op, carga)) {
      return { status: 200, data: { propuesta_id: carga.propuesta_id, accion: op, idempotente: true } };
    }

    // El ACUSE queda en el bus como hecho de la voz del móvil: es el único de los tres que no
    // tiene un gemelo emitido por el custodio (`propuesta_acusada` es su hecho). Así el reloj de
    // decisión tiene un origen que se puede mirar (Q42). Los otros dos ya tienen hecho propio.
    if (op === 'acuse') {
      this._marcar(op, carga);
      this.hecho('bocaos.propuesta_acuse', {
        propuesta_id: carga.propuesta_id,
        pedido_id: d.pedido_id || null,
        rider_id: carga.rider_id,
        plaza_id: d.plaza_id || null,
        hora: carga.hora,
        canal: 'rider',
        via: 'movil'
      });
    }

    const r = await this._pedirAlCustodio(op, carga);
    if (!r) return this._errorResponse(504, 'SIN_RESPUESTA', 'el custodio de la propuesta no contestó', { field: 'propuesta_id' });
    if (typeof r.status === 'number' && r.status >= 400) return r;
    return { status: 200, data: { propuesta_id: carga.propuesta_id, accion: op, propuesta: r.data?.propuesta || null } };
  }

  // El acuse arranca el reloj de DECISIÓN del custodio (A15): no lo arranca el canal.
  async onPropuestaAcuse(e) {
    return this._reenviar(e, 'acuse');
  }

  async onPropuestaAceptada(e) {
    return this._reenviar(e, 'aceptar');
  }

  async onPropuestaRechazada(e) {
    return this._reenviar(e, 'rechazar');
  }

  async _reenviar(e, op) {
    const d = this.datos(e);
    if (!d.project_id || !d.propuesta_id) return null;
    // Los hechos del custodio ya están resueltos: reenviarlos sería un bucle (y un doble sí).
    // Sólo se traduce la INTENCIÓN que llega del móvil, y una sola vez.
    if (!this._esIntencion(d)) return null;

    const carga = {
      project_id: d.project_id,
      propuesta_id: d.propuesta_id,
      rider_id: d.rider_id || null,
      hora: this._iso(d.hora) || this._iso(d.hora_acuse) || this._iso(d.hora_aceptacion) || this.ahora()
    };
    if (op === 'rechazar') carga.motivo = d.motivo || 'rechazo desde el móvil';
    if (this._yaAplicada(op, carga)) return null;
    this._marcar(op, carga);

    await this._pedirAlCustodio(op, carga);
    return null;
  }

  // Una intención se aplica UNA vez: dos publicaciones del mismo acuse no reabren el reloj.
  _clave(op, carga) {
    return `${op}|${carga.propuesta_id}|${carga.hora}|${carga.rider_id || ''}`;
  }

  _yaAplicada(op, carga) {
    return this._aplicadas.has(this._clave(op, carga));
  }

  _marcar(op, carga) {
    this._aplicadas.add(this._clave(op, carga));
    if (this._aplicadas.size > 500) this._aplicadas.delete(this._aplicadas.values().next().value);
  }

  async _pedirAlCustodio(op, carga) {
    try {
      const r = await this._rpc(`propuesta.${op}.request`, carga, { timeout_ms: TIMEOUT_ACUSE_MS });
      if (!r || (typeof r.status === 'number' && r.status >= 400)) {
        this.logger?.warn('canal-rider.reenvio_no_aplicado', {
          op, propuesta_id: carga.propuesta_id, code: r?.error?.code || 'SIN_RESPUESTA'
        });
      }
      return r;
    } catch (err) {
      this.logger?.error('canal-rider.reenvio_fallo', { op, propuesta_id: carga.propuesta_id, error: err.message });
      return null;
    }
  }

  _esIntencion(d) {
    // `hecho()` sella origen con el nombre del módulo que publica: los del custodio son 'propuesta'.
    return d.origen !== 'propuesta';
  }

  // ================= la entrega =================
  async _entregar(propuesta, chat_id, frase) {
    const id = propuesta.propuesta_id;
    if (!id || this._entregadas.has(id) || this._enVuelo.has(id)) return;
    this._enVuelo.add(id);

    const texto = frase || propuesta.vista?.frase || `Propuesta ${id}`;
    const mensaje = {
      canal: 'rider',
      chat_id,
      propuesta_id: id,
      pedido_id: propuesta.pedido_id || null,
      texto,
      ventana_s: propuesta.ventana_s ?? null,
      expira_en: propuesta.expira_en || null,
      teclado: [
        { texto: '✅ Acepto', accion: 'aceptar', propuesta_id: id },
        { texto: '⛔ No', accion: 'rechazar', propuesta_id: id }
      ]
    };

    let res;
    try {
      res = await this._enviar(mensaje);
    } catch (err) {
      res = { ok: false, motivo: err.message };
    }

    this._enVuelo.delete(id);

    if (res && res.ok === false) {
      this.hecho('bocaos.propuesta_no_entregada', {
        propuesta_id: id,
        pedido_id: mensaje.pedido_id,
        rider_id: propuesta.rider_id || null,
        plaza_id: propuesta.plaza_id || null,
        canal: 'rider',
        chat_id,
        motivo: res.motivo || 'el transporte no entregó',
        hueco: res.hueco || 'sin entrega'
      });
      return;
    }

    this._entregadas.add(id);
    // La memoria del canal no crece sin freno: se olvidan las entregas más viejas.
    if (this._entregadas.size > 2000) this._entregadas.delete(this._entregadas.values().next().value);
    this.hecho('bocaos.propuesta_entregada', {
      propuesta_id: id,
      pedido_id: mensaje.pedido_id,
      rider_id: propuesta.rider_id || null,
      plaza_id: propuesta.plaza_id || null,
      canal: 'rider',
      chat_id,
      mensaje_id: (res && (res.mensaje_id ?? res.id ?? null)) || null,
      texto,
      hora: this.ahora()
    });
  }

  async _enviar(mensaje) {
    if (this.transporte && typeof this.transporte.enviar === 'function') {
      return this.transporte.enviar(mensaje);
    }
    return this._enviarPorBus(mensaje);
  }

  // Transporte por defecto: la MISMA puerta que telegram-bridge (telegram.send_message).
  async _enviarPorBus(mensaje) {
    const replyMarkup = {
      inline_keyboard: [mensaje.teclado.map((b) => ({
        text: b.texto,
        callback_data: `prop:${b.accion}:${b.propuesta_id}`
      }))]
    };
    const r = await this._rpc('telegram.send_message.request', {
      botName: this.bot,
      chatId: mensaje.chat_id,
      text: mensaje.texto,
      replyMarkup
    }, { timeout_ms: TIMEOUT_ENVIO_MS });

    if (!r || r.status !== 200) {
      return { ok: false, motivo: r?.error?.message || 'sin respuesta de telegram.send_message', hueco: 'sin telegram' };
    }
    return { ok: true, mensaje_id: r?.data?.message_id ?? null };
  }

  // ================= el móvil del rider: se PIDE al censo =================
  async _chatDeRider(project_id, plaza_id, rider_id) {
    if (!rider_id) return null;
    try {
      const r = await this._rpc('estado-parte.de.request', {
        project_id, plaza_id: plaza_id || null, parte_id: rider_id
      }, { timeout_ms: TIMEOUT_ACUSE_MS });
      const chat = r?.data?.parte?.chat_id;
      if (chat === null || chat === undefined || chat === '') return null;
      return String(chat);
    } catch (_) {
      return null;
    }
  }
}

module.exports = CanalRider;
module.exports.ESPERA_REDACCION_MS = ESPERA_REDACCION_MS;
