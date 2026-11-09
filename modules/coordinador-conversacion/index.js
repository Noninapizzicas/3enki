'use strict';
/**
 * coordinador-conversacion — C1–C3 · MICRO-AGENTE (la SECUENCIA, no la decisión).
 *
 * Los tres objetos de coordinación del diseño (`CoordinadorDeEntrada`,
 * `CoordinadorDeLectura`, `CoordinadorDeGobierno`) fundidos en UN dueño de la
 * secuencia: no tienen almacén ni juicio, sólo ordenan llamadas. Tres módulos
 * serían tres caminos para romper el orden; aquí hay uno y tres caminos internos.
 *
 * Esta hoja construye el camino de ENTRADA (F1/F2) sobre las islas ya vivas:
 *   1  SOBRE     sobre-conversacion  construir + validar (nada se completa: S1)
 *   2  LLAVES    gestor-llaves       hidratar las vigentes del hilo (I7)
 *   3  PUERTA    puerta-admision     veredicto ABRIR | RECHAZAR (I6)
 *   4  SESIÓN    amarre-sesion       atar el par (participante, conversación) (I4)
 *   5  RELAY     chat.message.saved  SÓLO tras ABRIR + sesión atada
 *
 * Fail-closed: cada paso espera su `.response` Y su `.failed` correlados por
 * `request_id`, con timeout declarado. Si un paso falla (failed, timeout o
 * respuesta de error) NO se sigue: se publica `conversacion.entrada_rechazada`
 * con el motivo literal y el paso, y el mensaje NUNCA llega al relay.
 * Sin `sobre`, sin puerta o sin sesión no hay llamada al LLM (I1).
 *
 * Invariantes:
 *   CO1  el orden es de este módulo y de nadie más (una secuencia, un dueño).
 *   CO2  toda llamada correlaciona por request_id; el `.failed` cierra el
 *        círculo — un timeout NUNCA se disfraza de respuesta.
 *   CO3  fail-closed: sin ABRIR + sesión atada no se publica el paso al relay.
 *   CO4  el coordinador no juzga ni escribe almacén ajeno: ordena y asienta el
 *        rastro; su único estado es el `pending` de RPC en vuelo.
 *   I1   ninguna entrada anónima toca estado ni llega al LLM.
 *   I4   la sesión se ata al par (participante, conversación).
 *   I7   LEER ≠ ESCRIBIR: la llave que cubre el acto la decide la puerta.
 *
 * Nota de costura (declarada, no inventada): hoy `hermes-relay` escucha
 * `chat.message.saved`. El plan (§5.2) sustituirá esa suscripción por la op
 * `llamada.nativa.request`; cuando eso ocurra, se cambia SOLO la constante
 * `EVENTO_RELAY`. Tocar el relay no es parte de esta hoja.
 *
 * Contrato:
 *   conversacion.entrada.recibida { request_id?, project_id, conversacion,
 *                                   participante, user_message,
 *                                   estado_conversacion?, politica?, acto?,
 *                                   mensaje?, padre?, instante?, ahora? }
 *     → conversacion.entrada_resultado { request_id, status, data|error }
 *     → conversacion.sobre_incompleto { motivo, faltantes, estado, referencia }
 *     → conversacion.entrada_rechazada { motivo, paso, base, referencia, detalle? }
 *     → chat.message.saved (el paso al relay, SÓLO si ABRIR + sesión atada)
 *
 * Dependencias SÓLO por evento (nunca por require): sobre-conversacion,
 * gestor-llaves, puerta-admision, amarre-sesion, hermes-relay.
 */

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const COMPLETO = 'COMPLETO';
const DESCONOCIDO = 'DESCONOCIDO';
const NINGUNO = 'NINGUNO';
const ABRIR = 'ABRIR';
const RECHAZAR = 'RECHAZAR';
const ACTO_ESCRIBIR = 'ESCRIBIR';
const EVENTO_RELAY = 'chat.message.saved';

const PASO_DE_EVENTO = {
  'sobre.construir.request': 'sobre',
  'sobre.validar.request': 'sobre',
  'llave.vigentes.request': 'llaves',
  'conversacion.admitir.request': 'puerta',
  'sesion.resolver.request': 'sesion'
};

class CoordinadorConversacion extends ModuloHibridoReflejo {
  constructor(opts = {}) {
    super();
    this.name = 'coordinador-conversacion';
    this.version = 'reflejo-0.1.0';

    // Único «estado»: los RPC en vuelo. Map request_id → { evento, desde }.
    // No hay almacén de negocio: el coordinador no escribe estado ajeno (CO4).
    this.pendientes = new Map();

    // Timeouts DECLARADOS por paso (nunca espera infinita). Inyectables en test.
    this.timeouts = {
      default: 8000,
      sobre: 8000,
      llaves: 8000,
      puerta: 8000,
      sesion: 8000,
      ...(opts.timeouts || {})
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Entrada — fire-and-forget desde chat-io (gate ON), pero con resultado
  // correlado: chat-io espera `conversacion.entrada_resultado` ANTES del INSERT.
  // ───────────────────────────────────────────────────────────────────────

  onEntradaRecibida(e) {
    return this._atender(e, 'entrada', 'conversacion.entrada_resultado', (d) => this._recibir(d));
  }

  // ───────────────────────────────────────────────────────────────────────
  // La secuencia (aquí vive el ORDEN; la lógica de dominio es de las islas)
  // ───────────────────────────────────────────────────────────────────────

  async _recibir(d = {}) {
    const entrada = d.entrada && typeof d.entrada === 'object' ? { ...d, ...d.entrada } : d;
    const ahora = entrada.ahora || new Date().toISOString();
    const correlacion = entrada.correlation_id || null;

    const proyecto = this._id(entrada.proyecto ?? entrada.project_id);
    const conversacion = this._id(entrada.conversacion ?? entrada.conversation_id);
    const participante = this._id(entrada.participante ?? entrada.participant_id);
    const acto = entrada.acto || ACTO_ESCRIBIR;
    const referencia = { proyecto, conversacion, participante, acto };

    // ── 1 · EL SOBRE (P01) — construir sin completar, luego validar ──────
    const construido = await this._pedir('sobre.construir.request', {
      declaracion: {
        proyecto,
        conversacion,
        participante,
        mensaje: entrada.mensaje ?? entrada.message_id ?? null,
        padre: entrada.padre ?? null,
        instante: entrada.instante ?? ahora
      }
    });
    if (!this._ok(construido)) {
      return this._fallo('sobre', 'SOBRE_NO_CONSTRUIDO', construido, referencia, correlacion);
    }

    const sobre = this._data(construido) || {};
    if (sobre.estado !== COMPLETO) {
      // Cuarentena (O5): se nombra el hueco y NO se toca cuaderno ni hilo (I1).
      await this._publicarEvento('conversacion.sobre_incompleto', {
        motivo: 'SOBRE_INCOMPLETO',
        estado: sobre.estado || null,
        faltantes: sobre.faltantes || [],
        referencia
      }, d);
      return this._rechazo('SOBRE_INCOMPLETO', {
        status: 422,
        code: 'PRECONDITION_FAILED',
        referencia,
        detalle: { faltantes: sobre.faltantes || [], estado: sobre.estado || null }
      }, correlacion);
    }

    const validado = await this._pedir('sobre.validar.request', {
      sobre: sobre.sobre,
      definicion: sobre.definicion
    });
    if (!this._ok(validado)) {
      return this._fallo('sobre', 'SOBRE_NO_VALIDADO', validado, referencia, correlacion);
    }
    const veredicto = (this._data(validado) || {}).veredicto;
    if (!veredicto || veredicto.estado !== COMPLETO) {
      await this._publicarEvento('conversacion.sobre_incompleto', {
        motivo: 'SOBRE_INCOMPLETO',
        estado: veredicto?.estado || null,
        faltantes: veredicto?.faltantes || [],
        referencia
      }, d);
      return this._rechazo('SOBRE_INCOMPLETO', {
        status: 422,
        code: 'PRECONDITION_FAILED',
        referencia,
        detalle: { faltantes: veredicto?.faltantes || [], estado: veredicto?.estado || null }
      }, correlacion);
    }

    // ── 2 · LAS LLAVES (P07) — la puerta no consulta almacenes (isla) ────
    const vigentes = await this._pedir('llave.vigentes.request', {
      project_id: proyecto,
      conversacion,
      ahora
    });
    if (!this._ok(vigentes)) {
      // Un fallo de transporte NO se convierte en «no hay llaves» (eso sería un
      // motivo de dominio falso): se falla con el paso y la causa real.
      return this._fallo('llaves', 'LLAVES_NO_HIDRATADAS', vigentes, referencia, correlacion);
    }
    const llaves = Array.isArray((this._data(vigentes) || {}).llaves)
      ? (this._data(vigentes) || {}).llaves
      : [];

    // ── 3 · LA PUERTA (P03) — veredicto reproducible (I6) ────────────────
    const admitida = await this._pedir('conversacion.admitir.request', {
      veredicto,
      proyecto: { idCanonico: proyecto },
      conversacion: {
        id: conversacion,
        proyecto,
        estado: entrada.estado_conversacion ?? entrada.estado ?? null
      },
      participante: { id: participante },
      acto,
      politica: entrada.politica ?? null,
      llaves,
      ahora
    });
    if (!this._ok(admitida)) {
      return this._fallo('puerta', 'ADMISION_NO_DECIDIDA', admitida, referencia, correlacion);
    }
    const decision = this._data(admitida) || {};
    if (decision.decision !== ABRIR) {
      // RECHAZAR corta la cadena: no hay sesión y el paso al relay NO se publica.
      return this._rechazo(decision.motivo || 'ENTRADA_RECHAZADA', {
        status: 403,
        code: 'PERMISSION_DENIED',
        referencia,
        detalle: { decision: decision.decision || RECHAZAR, base: decision.base || null },
        base: decision.base || null
      }, correlacion);
    }

    // ── 4 · LA SESIÓN (P08) — el par, nunca una sesión global (I4) ───────
    const atada = await this._pedir('sesion.resolver.request', {
      project_id: proyecto,
      participante,
      conversacion,
      ahora
    });
    if (!this._ok(atada)) {
      return this._fallo('sesion', 'SESION_NO_ATADA', atada, referencia, correlacion);
    }
    const sesion = (this._data(atada) || {}).sesion || null;
    if (!sesion || !sesion.id) {
      // Respuesta vacía = no hay sesión: sin sesión no se llama al LLM (CO3).
      return this._fallo('sesion', 'SESION_NO_ATADA', atada, referencia, correlacion);
    }

    // ── 5 · EL RELAY — sólo ahora el mensaje puede llegar al LLM ─────────
    const pase = this._paseAlRelay(entrada, sobre.sobre, decision, sesion, correlacion);
    if (!pase.ok) {
      return this._rechazo(pase.motivo, {
        status: 422,
        code: 'PRECONDITION_FAILED',
        referencia,
        detalle: { faltantes: pase.faltantes || [] }
      }, correlacion);
    }

    // UN SOLO DUEÑO DEL RELAY: chat-io publica `chat.message.saved` (es suyo
    // desde siempre). El coordinador NO lo publica — solo ENTREGA el payload
    // enriquecido (sobre + sesión + referencia) para que chat-io lo use al
    // publicarlo. Dos emisores del mismo evento = el relay razona dos veces.
    this.metrics?.increment(`${this.name}.entrada.admitida`, {});
    this.logger?.info('coordinador-conversacion.admitida', {
      module: this.name,
      proyecto,
      conversacion,
      participante,
      sesion: sesion.id,
      relay_event: EVENTO_RELAY
    });

    return {
      status: 200,
      data: {
        ok: true,
        admitida: true,
        actos: decision.actos || [],
        llaves: decision.llaves || [],
        sesion: { id: sesion.id, participante: sesion.participante, conversacion: sesion.conversacion },
        sobre: sobre.sobre,
        relay_event: EVENTO_RELAY,
        // El llamador (chat-io) publica EVENTO_RELAY con ESTE payload: lleva el
        // sobre, la sesión atada y la referencia. El coordinador no publica.
        relay_payload: pase.payload,
        referencia
      }
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // RPC correlado: escucha `.response` Y `.failed` (el círculo siempre cierra)
  // ───────────────────────────────────────────────────────────────────────

  _pedir(evento, payload = {}, { timeout_ms } = {}) {
    const bus = this.eventBus;
    if (!bus?.subscribe || !bus?.publish) {
      return Promise.resolve({ ok: false, motivo: 'BUS_NO_DISPONIBLE', evento });
    }

    const request_id = crypto.randomUUID();
    const respuesta = evento.replace(/\.request$/, '.response');
    const fallo = evento.replace(/\.request$/, '.failed');
    const paso = PASO_DE_EVENTO[evento] || 'default';
    const ms = Number.isFinite(timeout_ms) && timeout_ms > 0
      ? timeout_ms
      : (this.timeouts[paso] || this.timeouts.default);

    return new Promise((resolve) => {
      let vivo = true;
      let timer = null;
      const desuscribir = [];

      const cerrar = (res) => {
        if (!vivo) return;
        vivo = false;
        if (timer) clearTimeout(timer);
        for (const u of desuscribir) { try { u(); } catch (_) { /* ya no importa */ } }
        this.pendientes.delete(request_id);
        resolve(res);
      };

      timer = setTimeout(() => {
        // Timeout DECLARADO: jamás se inventa una respuesta ni se espera infinito.
        cerrar({ ok: false, motivo: 'TIMEOUT', evento, request_id, timeout_ms: ms });
      }, ms);

      try {
        desuscribir.push(bus.subscribe(respuesta, (ev) => {
          const data = ev?.data || ev;
          if (!data || data.request_id !== request_id) return;
          cerrar({ ok: true, evento, request_id, status: data.status, data });
        }));
        desuscribir.push(bus.subscribe(fallo, (ev) => {
          const data = ev?.data || ev;
          if (!data) return;
          const correlado = data.request_id === request_id ||
            // Las islas publican su `.failed` con `_publicarEvento` SIN request_id
            // (p. ej. `sesion.resolver.failed`). Se acepta sólo si hay UNA sola
            // llamada en vuelo para ese evento: sin correlación posible, no se
            // deja que un fallo ajeno corte esta cadena.
            (data.request_id == null && this._unicoEnVuelo(evento));
          if (!correlado) return;
          cerrar({ ok: false, motivo: 'FAILED', evento, request_id, status: data.status, data });
        }));
      } catch (err) {
        cerrar({ ok: false, motivo: 'BUS_NO_DISPONIBLE', evento, error: err.message });
        return;
      }

      this.pendientes.set(request_id, { evento, paso, desde: Date.now() });

      Promise.resolve()
        .then(() => bus.publish(evento, { request_id, ...payload }))
        .catch((err) => cerrar({ ok: false, motivo: 'PUBLISH_FALLIDO', evento, request_id, error: err.message }));
    });
  }

  _unicoEnVuelo(evento) {
    let n = 0;
    for (const p of this.pendientes.values()) if (p.evento === evento) n += 1;
    return n === 1;
  }

  // ───────────────────────────────────────────────────────────────────────
  // El paso al relay (el único evento que el cable escucha hoy)
  // ───────────────────────────────────────────────────────────────────────

  _paseAlRelay(entrada, sobre, decision, sesion, correlacion) {
    const project_id = sobre?.proyecto;
    const conversation_id = sobre?.conversacion;
    const user_message = entrada.user_message ?? entrada.contenido ?? entrada.mensaje_texto ?? null;
    const message_id = sobre?.mensaje && sobre.mensaje !== DESCONOCIDO && sobre.mensaje !== NINGUNO
      ? sobre.mensaje
      : (entrada.message_id || null);

    if (!user_message) return { ok: false, motivo: 'MENSAJE_AUSENTE', faltantes: ['user_message'] };
    if (!project_id || project_id === DESCONOCIDO || !conversation_id || conversation_id === DESCONOCIDO) {
      return { ok: false, motivo: 'SOBRE_SIN_HILO', faltantes: ['proyecto', 'conversacion'] };
    }

    return {
      ok: true,
      payload: {
        // contrato real de hermes-relay.onMessageSaved (module.json 1.0.0)
        correlation_id: correlacion || crypto.randomUUID(),
        project_id,
        conversation_id,
        message_id,
        user_message,
        user_id: entrada.user_id || sobre.participante,
        channel: entrada.channel || 'web',
        channel_context: entrada.channel_context || {},
        settings: entrada.settings || {},
        page_id: entrada.page_id || null,
        page_context: entrada.page_context || null,
        attachments: Array.isArray(entrada.attachments) ? entrada.attachments : [],
        intencion: entrada.intencion || null,
        // rastro de la admisión (el relay de hoy no lo usa; viaja para el eco)
        admitido: true,
        sobre,
        sesion: sesion ? { id: sesion.id, participante: sesion.participante, conversacion: sesion.conversacion } : null,
        decision: decision ? { decision: decision.decision, actos: decision.actos || [] } : null,
        entrada_request_id: entrada.request_id || null
      }
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Fallos honestos (fail-closed) — nunca un éxito inventado
  // ───────────────────────────────────────────────────────────────────────

  _ok(r) {
    if (!r || r.ok !== true || !r.data) return false;
    if (Number(r.data.status) >= 400) return false;
    if (r.data.error) return false;
    return true;
  }

  _data(r) {
    return (r && r.data && r.data.data) || null;
  }

  _codigoDe(r) {
    return r?.data?.error?.code || r?.motivo || null;
  }

  /** Fallo de un paso: asienta el intento y NO sigue. Devuelve el resultado del RPC. */
  async _fallo(paso, motivo, r, referencia, correlacion) {
    const causa = this._codigoDe(r) || null;
    const timeout = r?.motivo === 'TIMEOUT';
    await this._publicarEvento('conversacion.entrada_rechazada', {
      motivo,
      paso,
      causa,
      referencia,
      base: null
    }, { correlation_id: correlacion || undefined });
    this.metrics?.increment(`${this.name}.entrada.rechazada`, { paso });
    this.logger?.warn('coordinador-conversacion.paso.fallido', {
      module: this.name, paso, motivo, causa, timeout_ms: r?.timeout_ms || null
    });
    return {
      status: timeout ? 504 : 503,
      error: {
        code: timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE',
        message: `${paso}: ${motivo}${causa ? ` (${causa})` : ''}`,
        details: { kind: 'dependency', motivo, paso, causa, referencia, timeout_ms: r?.timeout_ms || null }
      }
    };
  }

  /** Rechazo de dominio decidido por la puerta/sobre: hecho + resultado correlado. */
  async _rechazo(motivo, { status = 403, code = 'PERMISSION_DENIED', detalle = null, referencia = null, base = null, paso = null } = {}, correlacion) {
    await this._publicarEvento('conversacion.entrada_rechazada', {
      motivo,
      paso: paso || (code === 'PRECONDITION_FAILED' ? 'sobre' : 'puerta'),
      base,
      detalle,
      referencia
    }, { correlation_id: correlacion || undefined });
    this.metrics?.increment(`${this.name}.entrada.rechazada`, { motivo });
    this.logger?.info('coordinador-conversacion.rechazada', { module: this.name, motivo });
    return {
      status,
      error: {
        code,
        message: `entrada rechazada: ${motivo}`,
        details: { kind: 'domain', motivo, ...(detalle ? { detalle } : {}) }
      }
    };
  }

  _id(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return v.id || v.idCanonico || v.slug || null;
    return v;
  }
}

module.exports = CoordinadorConversacion;
