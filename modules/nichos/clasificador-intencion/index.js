/**
 * nichos/clasificador-intencion — REFLEJO JS (MICRO-AGENTE del vertical NICHOS).
 *
 * Clasifica cada mensaje entrante del canal en 5 intenciones canonicas via
 * ai-gateway (llm.complete.request). Reactivo: escucha nichos.canal.mensaje.recibido
 * (F7b) y emite nichos.intencion.clasificada; atiende el RPC nichos.intencion.clasificar.
 *
 * 5 intenciones canonicas:
 *   SEMILLA             — idea nueva de nicho.
 *   RESPUESTA_DECISION  — respuesta a solicitud pendiente del sistema.
 *   CONSULTA            — pregunta del dueno.
 *   AJUSTE_CONFIG       — cambio de perfil/umbral.
 *   DESCONOCIDO         — no encaja en ninguna.
 *
 * Sin estado persistido — micro-agente puro (request → LLM → response).
 * Patron: ModuloHibridoReflejo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const INTENCIONES_VALIDAS = [
  'SEMILLA',
  'RESPUESTA_DECISION',
  'CONSULTA',
  'AJUSTE_CONFIG',
  'DESCONOCIDO'
];

const PROMPT_SISTEMA = [
  'Eres un clasificador de intenciones para un sistema de gestion de nichos de mercado.',
  'Clasifica el mensaje del usuario en EXACTAMENTE una de estas 5 intenciones:',
  '',
  '- SEMILLA: idea nueva de nicho o mercado a explorar.',
  '- RESPUESTA_DECISION: respuesta a una solicitud pendiente del sistema (aprobacion, rechazo, eleccion).',
  '- CONSULTA: pregunta del dueno sobre el estado, datos o funcionamiento del sistema.',
  '- AJUSTE_CONFIG: peticion de cambio de configuracion, perfil, umbral o parametro.',
  '- DESCONOCIDO: no encaja en ninguna de las anteriores.',
  '',
  'Responde SOLO con un JSON: {"tipo":"<INTENCION>","confianza":<0.0-1.0>,"opcion":<null|"SI"|"NO">}',
  'Si la intencion es RESPUESTA_DECISION, rellena "opcion" con "SI" o "NO" segun',
  'lo que el dueno decide; en cualquier otro caso "opcion" es null.',
  'Sin explicacion, sin texto adicional. Solo el JSON.'
].join('\n');

class ClasificadorIntencion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'clasificador-intencion';
    this.version = '0.1.0';
    this._pendientes = new Map(); // correlation_id → { resolve, reject, context }
  }
  async onLoad(context) {
    // OJO: this.eventBus lo asigna super.onLoad. Si se llama al subscribe
    // ANTES, this.eventBus es undefined y el optional-chaining traga la
    // suscripcion EN SILENCIO: el modulo pedia al LLM y nunca oia la
    // respuesta (→ timeout de 30s y nichos.intencion.clasificada.failed).
    await super.onLoad(context);
    // Escuchar respuestas del LLM correladas.
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
  }

  // ── RPC HANDLER ──
  onClasificarRequest(e) {
    return this._atender(e, 'clasificar', 'nichos.intencion.clasificar.response', d => this._clasificar(d));
  }

  // ── FIRE-AND-FORGET: reaccion a mensaje del canal (F7b) ──
  async onMensajeRecibido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.mensaje_entrante && !d.texto) return;

    const texto = d.mensaje_entrante || d.texto;
    const projectId = d.project_id;

    try {
      const resultado = await this._pedirAlLLM(texto, projectId);
      const mensajeRef = d.mensaje_ref || d.id || null;

      this.eventBus?.publish('nichos.intencion.clasificada', {
        project_id: projectId,
        mensaje_ref: mensajeRef,
        tipo: resultado.tipo,
        confianza: resultado.confianza,
        timestamp: nowISO()
      });

      // CABLE: una idea nueva de nicho (SEMILLA) ARRANCA la vertical.
      // Este salto no existia: el clasificador clasificaba y la intencion
      // moria en el bus (nadie consumia nichos.intencion.clasificada). Es el
      // eslabon que une el bot de la vertical con la cadena reflectiva
      // (capturador → normalizador → orquestador → ...).
      if (resultado.tipo === 'SEMILLA') {
        this.eventBus?.publish('nichos.semilla.capturar.request', {
          texto,
          project_id: projectId,
          origen: 'telegram',
          meta: { mensaje_ref: mensajeRef, confianza: resultado.confianza },
          correlation_id: `sem-canal-${Date.now()}`
        });
      } else {
        // LA VOZ — sin esto el dueño escribia "Hola", "No" o una pregunta y no
        // le volvia NADA: la intencion se clasificaba y moria en el bus (nadie
        // consume nichos.intencion.clasificada). La vertical solo respondia a
        // las ideas nuevas; todo lo demas era silencio → "no me responde".
        let cierre = null;
        if (resultado.tipo === 'RESPUESTA_DECISION') {
          // CERRAR EL BUCLE: la respuesta del dueño cierra la solicitud que la
          // vertical le dejo abierta en cola-decisiones. Antes moria aqui: el
          // clasificador solo pedia LLM, acusaba recibo y la decision no
          // llegaba a nadie (bucle construido y SIN LLAVE — "algo falla").
          cierre = await this._cerrarSolicitud(projectId, texto, resultado.opcion);
        }
        this._responderAlDueno(projectId, resultado.tipo, mensajeRef, cierre);
      }
    } catch (err) {
      this.eventBus?.publish('nichos.intencion.clasificada.failed', {
        project_id: projectId,
        code: 'CLASIFICACION_FALLIDA',
        message: err.message || 'error al clasificar intencion',
        timestamp: nowISO()
      });
    }
  }

  // ── LA VOZ del puerto — respuesta a un mensaje que NO arranca ciclo ──
  // Publica por la boca NATIVA del vertical (nichos.canal.enviar.request); el
  // puerto resuelve el destino del origen aprendido por la oreja (bot:chat de
  // quien escribio), asi que aqui NO se clava ningun chat_id.
  _responderAlDueno(projectId, tipo, mensajeRef, cierre) {
    let cuerpo;
    if (cierre && cierre.cerrada) {
      cuerpo = `✅ Decisión registrada: ${cierre.respuesta}. La tengo en cuenta.`;
    } else if (tipo === 'RESPUESTA_DECISION') {
      cuerpo = '🧭 Anotado. (no hay ninguna decisión abierta ahora mismo)';
    } else {
      cuerpo = {
        CONSULTA: '🧭 Soy la vertical de nichos. Dime una idea de negocio (ej. "quiero montar un taller de crochet en Lorca") y la evalúo: competencia, demanda y precio.',
        AJUSTE_CONFIG: '🧭 Anotado el ajuste.',
        DESCONOCIDO: '🧭 No te he entendido. Dime una idea de nicho y la evalúo.'
      }[tipo] || '🧭 Anotado.';
    }

    this.eventBus?.publish('nichos.canal.enviar.request', {
      request_id: `resp-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      project_id: projectId,
      proposito: 'respuesta',
      mensaje: { cuerpo, escalon: 'intencion' },
      correlation_id: `int-${mensajeRef || Date.now()}`
    });
  }

  // ── CERRAR EL BUCLE: la respuesta del dueño cierra la solicitud abierta ──
  // Pide a cola-decisiones las solicitudes ABIERTAS (el custodio ya las ordena
  // por caducidad), elige la mas urgente, interpreta el voto y la cierra
  // (nichos.cola.decisiones.cerrar.request). El custodio emite entonces
  // nichos.decision.solicitud.respondida → el flujo de decision continua.
  async _cerrarSolicitud(projectId, texto, opcionLLM) {
    if (!projectId) return null;

    const resp = await this._rpc('nichos.cola.decisiones.siguientes.request',
      { project_id: projectId, dueno: 'dueño' }, { timeout_ms: 8000 });
    const sols = (resp && resp.data && Array.isArray(resp.data.solicitudes))
      ? resp.data.solicitudes : [];
    if (!sols.length) return null;

    const sol = sols.find(s => s && (!s.estado || s.estado === 'ABIERTA')) || sols[0];
    const respuesta = this._interpretarRespuesta(texto, opcionLLM, sol.opciones);

    const cierre = await this._rpc('nichos.cola.decisiones.cerrar.request', {
      project_id: projectId,
      solicitud_id: sol.id,
      respuesta,
      dueno: 'dueño',
      nota_libre: texto
    }, { timeout_ms: 8000 });

    const cerrada = !!(cierre && cierre.status === 200);
    this.eventBus?.publish('nichos.intencion.decision.cerrada', {
      project_id: projectId,
      solicitud_id: sol.id,
      tipo: sol.tipo || null,
      respuesta,
      cerrada,
      timestamp: nowISO()
    });
    return { solicitud_id: sol.id, tipo: sol.tipo || null, respuesta, cerrada };
  }

  // ── Interpreta el voto del dueño → una de las opciones de la solicitud ──
  _interpretarRespuesta(texto, opcionLLM, opciones) {
    const ops = Array.isArray(opciones) ? opciones.map(o => String(o).toUpperCase()) : [];
    const tiene = (v) => ops.includes(String(v).toUpperCase());
    if (opcionLLM && (!ops.length || tiene(opcionLLM))) return String(opcionLLM).toUpperCase();

    const t = String(texto || '').toLowerCase();
    const NEG = ['no', 'nada', 'paso', 'pasa', 'descarta', 'dejalo', 'déjalo', 'olvidalo', 'olvídalo', 'rechaza', 'cancela'];
    const POS = ['si', 'sí', 'vale', 'dale', 'ok', 'okay', 'adelante', 'hazlo', 'lanza', 'lanzo', 'claro', 'yes', 'sigue', 'venga'];
    const hayPalabra = (lista) => lista.some(w => new RegExp(`(^|\\W)${w}(\\W|$)`).test(t));
    const esSi = hayPalabra(POS);
    const esNo = hayPalabra(NEG);

    if (esSi && !esNo) return tiene('SI') ? 'SI' : (ops[0] || 'SI');
    if (esNo && !esSi) return tiene('NO') ? 'NO' : (ops[1] || ops[0] || 'NO');
    return ops.length ? ops[0] : 'SI';
  }

  // ── PROYECCION: clasificar (usada por RPC) ──
  async _clasificar(input) {
    if (!input.mensaje_entrante) return this._invalid('mensaje_entrante');

    try {
      const resultado = await this._pedirAlLLM(input.mensaje_entrante, input.project_id);
      return {
        status: 200,
        data: {
          intencion_entrante: {
            tipo: resultado.tipo,
            confianza: resultado.confianza
          }
        }
      };
    } catch (err) {
      this.eventBus?.publish('nichos.intencion.clasificada.failed', {
        project_id: input.project_id,
        code: 'CLASIFICACION_FALLIDA',
        message: err.message || 'error al clasificar intencion',
        timestamp: nowISO()
      });
      return this._errorResponse(
        502,
        'LLM_ERROR',
        err.message || 'el LLM no devolvio una clasificacion valida',
        {}
      );
    }
  }

  // =============================================================
  // LLM — pide clasificacion via ai-gateway
  // =============================================================
  _pedirAlLLM(texto, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `clf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this._pendientes.delete(correlationId);
        reject(new Error('timeout esperando respuesta del LLM'));
      }, 30000);

      this._pendientes.set(correlationId, {
        resolve: (resultado) => {
          clearTimeout(timeout);
          this._pendientes.delete(correlationId);
          resolve(resultado);
        },
        reject: (err) => {
          clearTimeout(timeout);
          this._pendientes.delete(correlationId);
          reject(err);
        }
      });

      this.eventBus?.publish('llm.complete.request', {
        request_id: correlationId,
        project_id: projectId,
        messages: [
          { role: 'system', content: PROMPT_SISTEMA },
          { role: 'user', content: texto }
        ],
        options: {
          temperature: 0.1,
          max_tokens: 100
        }
      });
    });
  }

  _onLLMResponse(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.request_id;
    if (!correlationId) return;

    const pendiente = this._pendientes.get(correlationId);
    if (!pendiente) return;

    if (d.error) {
      pendiente.reject(new Error(d.error.message || 'error del LLM'));
      return;
    }

    // Parsear la respuesta del LLM.
    const contenido = (d.content || d.text || '').trim();
    try {
      const parsed = JSON.parse(contenido);
      const tipo = INTENCIONES_VALIDAS.includes(parsed.tipo) ? parsed.tipo : 'DESCONOCIDO';
      const confianza = typeof parsed.confianza === 'number'
        ? Math.max(0, Math.min(1, parsed.confianza))
        : 0.5;
      // `opcion` (SI/NO) la devuelve el LLM cuando la intencion es una
      // RESPUESTA_DECISION: es el voto del dueño, que cierra la solicitud.
      const opcion = (parsed.opcion === 'SI' || parsed.opcion === 'NO') ? parsed.opcion : null;
      pendiente.resolve({ tipo, confianza, opcion });
    } catch (_parseErr) {
      // Si el LLM no devolvio JSON valido, intentar extraer la intencion del texto.
      const tipoEncontrado = INTENCIONES_VALIDAS.find(t => contenido.toUpperCase().includes(t));
      if (tipoEncontrado) {
        pendiente.resolve({ tipo: tipoEncontrado, confianza: 0.5, opcion: null });
      } else {
        pendiente.resolve({ tipo: 'DESCONOCIDO', confianza: 0.1, opcion: null });
      }
    }
  }
}

module.exports = ClasificadorIntencion;
