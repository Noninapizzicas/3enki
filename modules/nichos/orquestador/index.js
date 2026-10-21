/**
 * nichos/orquestador — MICRO-AGENTE del vertical NICHOS (cerebro reactivo).
 *
 * Escucha pulsos del bus y encadena el ciclo completo del vertical:
 *   1. semilla.capturada     → registra ciclo, espera normalizada
 *   2. semilla.normalizada   → dispara sondeo del territorio
 *   3. sondeo.completado     → dispara batch-validacion
 *   4. validacion.lote.completado → dispara ensamblaje de viables
 *   5. construccion.completada    → actualiza cuadro salud, cierra ciclo
 *
 * Gate de operacion: si gate.cerrado → no arranca nuevos ciclos (degradacion
 * honesta). Los ciclos ya activos siguen hasta completarse.
 *
 * Sin estado persistido — correlaciona ciclos activos en un Map en memoria.
 * Si reinicia, los ciclos activos se pierden (trade-off aceptado: el dueno
 * puede relanzar la semilla).
 *
 * Patron: ModuloHibridoReflejo (micro-agente reactivo por bus).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

/**
 * Estados de un ciclo de descubrimiento.
 */
const ESTADO_CICLO = {
  ESPERANDO_NORMALIZACION: 'esperando_normalizacion',
  SONDEANDO: 'sondeando',
  VALIDANDO: 'validando',
  CONSTRUYENDO: 'construyendo',
  COMPLETADO: 'completado'
};

class Orquestador extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'orquestador';
    this.version = '0.1.0';
    this._ciclos = new Map();  // correlation_id → { estado, semilla, inicio, ... }
    this._operando = true;     // gate abierto por defecto
  }

  onLoad(context) {
    const result = super.onLoad(context);
    // Escuchar respuestas del LLM correladas.
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
    this._pendientesLLM = new Map();
    return result;
  }

  // =============================================================
  // HANDLERS — cada uno escucha un PULSO y avanza el ciclo
  // =============================================================

  /**
   * 1. semilla.capturada → registra ciclo pendiente esperando normalizacion.
   */
  onSemillaCapturada(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.correlation_id;
    if (!correlationId) return;

    if (!this._operando) {
      this.logger?.info('orquestador.gate.cerrado.ignorando', {
        correlation_id: correlationId,
        razon: 'gate cerrado, no se arranca ciclo nuevo'
      });
      return;
    }

    const ahora = nowISO();
    this._ciclos.set(correlationId, {
      estado: ESTADO_CICLO.ESPERANDO_NORMALIZACION,
      semilla_texto: d.texto || null,
      origen: d.origen || null,
      project_id: d.project_id || null,
      inicio: ahora
    });

    this.eventBus?.publish('nichos.orquestador.ciclo.iniciado', {
      ciclo_id: correlationId,
      semilla: { texto: d.texto, origen: d.origen },
      project_id: d.project_id || null,
      timestamp: ahora
    });

    this.logger?.info('orquestador.ciclo.iniciado', {
      correlation_id: correlationId,
      estado: ESTADO_CICLO.ESPERANDO_NORMALIZACION
    });
  }

  /**
   * 2. semilla.normalizada → dispara sondeo del territorio.
   */
  onSemillaNormalizada(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.correlation_id;
    if (!correlationId) return;

    const ciclo = this._ciclos.get(correlationId);
    if (!ciclo) {
      // Semilla normalizada sin ciclo registrado — puede ser relanzada o de otro origen.
      // Arranca ciclo nuevo si el gate esta abierto.
      if (!this._operando) return;
      this._ciclos.set(correlationId, {
        estado: ESTADO_CICLO.SONDEANDO,
        semilla_normalizada: d.semilla_normalizada || null,
        project_id: d.project_id || null,
        inicio: nowISO()
      });
    } else {
      ciclo.estado = ESTADO_CICLO.SONDEANDO;
      ciclo.semilla_normalizada = d.semilla_normalizada || null;
    }

    // Disparar sondeo
    this.eventBus?.publish('nichos.territorio.sondear.request', {
      request_id: `sondeo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      semilla_normalizada: d.semilla_normalizada || null,
      correlation_id: correlationId,
      project_id: d.project_id || null
    });

    this.logger?.info('orquestador.sondeo.disparado', { correlation_id: correlationId });
  }

  /**
   * 3. sondeo.completado → dispara batch-validacion de candidatos.
   */
  onSondeoCompletado(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.correlation_id;
    if (!correlationId) return;

    const ciclo = this._ciclos.get(correlationId);
    if (!ciclo) return;

    ciclo.estado = ESTADO_CICLO.VALIDANDO;
    ciclo.candidatos = d.candidatos || [];

    // Disparar batch-validacion
    this.eventBus?.publish('nichos.validacion.lote.correr.request', {
      request_id: `val-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      candidatos: d.candidatos || [],
      correlation_id: correlationId,
      project_id: ciclo.project_id || null
    });

    this.logger?.info('orquestador.validacion.disparada', {
      correlation_id: correlationId,
      num_candidatos: (d.candidatos || []).length
    });
  }

  /**
   * 4. validacion.lote.completado → dispara ensamblaje de viables.
   */
  onValidacionCompletada(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.correlation_id;
    if (!correlationId) return;

    const ciclo = this._ciclos.get(correlationId);
    if (!ciclo) return;

    ciclo.estado = ESTADO_CICLO.CONSTRUYENDO;
    // `viables` puede venir como número (contrato nuevo) o como la lista de
    // ids (`resultados`, contrato viejo). `detalle` es la lista de viables
    // CON su informe/veredicto/camino — lo que el ensamblador necesita.
    const detalle = Array.isArray(d.detalle) ? d.detalle : [];
    const viables = (typeof d.viables === 'number')
      ? d.viables
      : (Array.isArray(d.resultados) ? d.resultados.length : 0);
    ciclo.viables = viables;
    // Resumen para el aviso al dueño (la BOCA): contadores + el detalle de
    // TODO lo evaluado (no solo los viables) para poder citar el motivo del
    // primer PUENTE — que es la decisión que el dueño debe tomar.
    ciclo.resumen = {
      viables,
      no_viables: typeof d.no_viables === 'number' ? d.no_viables : 0,
      puentes: typeof d.puentes === 'number' ? d.puentes : 0
    };
    ciclo.evaluados = Array.isArray(d.evaluados) ? d.evaluados : [];

    if (viables === 0 || detalle.length === 0) {
      // Sin viables — cerrar ciclo sin ensamblaje.
      this._cerrarCiclo(correlationId, { viables: 0, razon: 'sin_viables' });
      return;
    }

    // Disparar UN ensamblaje por nicho viable, con el CONTRATO que el
    // ensamblador exige: id_nicho + veredicto + camino. Antes se le pasaba
    // `viables: <n>` (un número) → "id_nicho requerido" (400) y el ciclo
    // moría aquí sin producir solución.
    for (const item of detalle) {
      this.eventBus?.publish('nichos.solucion.ensamblar.request', {
        request_id: `ens-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        id_nicho: item.id_nicho,
        veredicto: item.veredicto || { codigo: 'VIABLE' },
        camino: item.camino || { tipo: 'CONSTRUIR' },
        correlation_id: correlationId,
        project_id: ciclo.project_id || null
      });
    }

    this.logger?.info('orquestador.ensamblaje.disparado', {
      correlation_id: correlationId,
      num_viables: detalle.length
    });
  }

  /**
   * 5. construccion.completada → actualiza cuadro salud, cierra ciclo.
   */
  onConstruccionCompletada(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.correlation_id;
    if (!correlationId) return;

    const ciclo = this._ciclos.get(correlationId);
    if (!ciclo) return;

    // Actualizar cuadro de salud
    this.eventBus?.publish('nichos.cuadro.salud.recalcular.request', {
      request_id: `salud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      resultado: d.resultado || d,
      correlation_id: correlationId,
      project_id: ciclo.project_id || null
    });

    this._cerrarCiclo(correlationId, d.resultado || { completado: true });
  }

  /**
   * Gate abierto — permite arrancar nuevos ciclos.
   */
  onGateAbierto(e) {
    this._operando = true;
    this.logger?.info('orquestador.gate.abierto', { timestamp: nowISO() });
  }

  /**
   * Gate cerrado — degradacion honesta. No arranca nuevos ciclos.
   * Los ciclos ya activos siguen hasta completarse.
   */
  onGateCerrado(e) {
    this._operando = false;
    const d = (e && (e.data || e)) || {};
    this.logger?.info('orquestador.gate.cerrado', {
      razon: d.razon || 'sin_razon',
      ciclos_activos: this._ciclos.size,
      timestamp: nowISO()
    });
  }

  // =============================================================
  // UTILIDADES INTERNAS
  // =============================================================

  /**
   * Cierra un ciclo: emite pulso completado y limpia el Map.
   */
  async _cerrarCiclo(correlationId, resultado) {
    const ciclo = this._ciclos.get(correlationId);
    if (!ciclo) return;

    const ahora = nowISO();
    const inicio = ciclo.inicio ? new Date(ciclo.inicio).getTime() : Date.now();
    const duracion_ms = Date.now() - inicio;

    ciclo.estado = ESTADO_CICLO.COMPLETADO;

    this.eventBus?.publish('nichos.orquestador.ciclo.completado', {
      ciclo_id: correlationId,
      resultado,
      duracion_ms,
      project_id: ciclo.project_id || null,
      timestamp: ahora
    });

    this.logger?.info('orquestador.ciclo.completado', {
      correlation_id: correlationId,
      duracion_ms
    });

    // BOCA — devolver el resultado al dueño por su canal (bot de la vertical).
    // El destino lo resuelve puerto-canal del origen aprendido (quien escribió).
    await this._avisarDueno(ciclo, correlationId, resultado);

    // Limpiar ciclo del Map
    this._ciclos.delete(correlationId);
  }

  /**
   * _avisarDueno — la BOCA: compone el aviso del ciclo y lo publica hacia el
   * dueño vía el puerto de canal (nichos.canal.enviar.request). El puerto
   * resuelve el destino real (bot:chat del que escribió) — aquí NO se clava
   * ningún chat_id.
   */
  async _avisarDueno(ciclo, correlationId, resultado) {
    const projectId = ciclo && ciclo.project_id;
    if (!projectId) return; // sin proyecto no hay a quién devolver

    const s = ciclo.semilla_normalizada || {};
    const nombre = s.vertical_sugerido || s.titulo || ciclo.semilla_texto || 'tu idea';
    const r = ciclo.resumen || {};
    const v = typeof r.viables === 'number' ? r.viables : (ciclo.viables || 0);
    const p = typeof r.puentes === 'number' ? r.puentes : 0;
    const n = typeof r.no_viables === 'number' ? r.no_viables : 0;

    let cuerpo = '🧭 Nichos — resultado del ciclo\n';
    cuerpo += `Semilla: ${nombre}\n`;
    cuerpo += `Evaluados: viables ${v} · puentes ${p} · no viables ${n}`;

    // El motivo del PRIMER PUENTE es la decisión que el dueño debe tomar.
    const puente = (ciclo.evaluados || []).find(x => x && x.codigo === 'PUENTE' && x.veredicto);
    if (puente && puente.veredicto && puente.veredicto.razon) {
      // B — el PUENTE deja de ser un callejón: en vez de preguntar en abstracto,
      // se le entrega un TEST DE VENTA concreto (dónde · precio · plazo · qué
      // cuenta como sí). Es lo que convierte la duda en disposición a pagar.
      cuerpo += `\n⚠️ Sin números que confirmen la demanda: ${puente.veredicto.razon}`;
      cuerpo += '\n\n' + await this._planTestVenta(ciclo, puente);
      cuerpo += '\n¿Lanzo el test de venta? Responde SÍ o NO.';
    } else if (v === 0 && p === 0) {
      cuerpo += '\nNo hay candidatos viables todavía.';
    } else if (v > 0) {
      cuerpo += `\n✅ Hay ${v} candidato(s) viable(s) — puedo preparar la propuesta.`;
    }

    this.eventBus?.publish('nichos.canal.enviar.request', {
      request_id: `aviso-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      project_id: projectId,
      proposito: 'notificacion',
      mensaje: { cuerpo, escalon: 'resultado_ciclo' },
      correlation_id: correlationId
    });

    // BUCLE DE DECISIÓN — si el ciclo muere pidiendo una decisión, se ENCOLA en
    // cola-decisiones para que la respuesta del dueño tenga algo que cerrar.
    // Antes NADIE emitía el encolar → cola vacía → la respuesta del dueño caía
    // al vacío: "algo falla en la vertical a través del bot".
    if (puente) {
      const razon = (puente.veredicto && puente.veredicto.razon) || 'sin_numeros';
      this.eventBus?.publish('nichos.cola.decisiones.encolar.request', {
        request_id: `enc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        project_id: projectId,
        solicitud_decision: {
          tipo: 'VALIDACION_PUENTE',
          contexto: razon,
          opciones: ['SI', 'NO'],
          dueno: 'dueño',
          id_nicho: puente.id_nicho || null,
          caducidad: new Date(Date.now() + 7 * 864e5).toISOString()
        }
      });
    }

    this.logger?.info('orquestador.aviso.dueno', {
      correlation_id: correlationId, project_id: projectId, viables: v, puentes: p,
      decision_encolada: !!puente
    });
  }

  /**
   * _planTestVenta — compone un TEST DE VENTA concreto para un PUENTE: qué se
   * vende, dónde anunciarlo, a qué precio, en cuántos días y qué cuenta como
   * SÍ. El precio sale de la disposición mínima DECLARADA por el dueño
   * (criterio-viabilidad); si aún no la declaró, se usa 30 € como referencia.
   */
  async _planTestVenta(ciclo, puente) {
    const s = ciclo.semilla_normalizada || {};
    const territorio = (s.territorio && s.territorio !== 'sin_territorio') ? s.territorio : 'tu zona';
    const nombre = s.vertical_sugerido || s.titulo || ciclo.semilla_texto || 'el nicho';

    let precio = 30;
    try {
      const resp = await this._rpc('nichos.criterio.viabilidad.leer.request', { project_id: ciclo.project_id });
      const umbral = resp && resp.data && resp.data.umbral_viabilidad && resp.data.umbral_viabilidad.umbral;
      const dpm = umbral && umbral.disposicion_pagar_min;
      if (typeof dpm === 'number' && dpm > 0) precio = dpm;
    } catch (_) { /* degradación honesta: se usa la referencia */ }

    return [
      '📣 Test de venta (7 días) — así la duda se convierte en dato:',
      `· Qué: ${nombre}.`,
      `· Dónde: anuncio en Instagram + grupos locales de ${territorio}, y un puesto/feria en ${territorio}.`,
      `· Precio: ${precio} € (tu disposición mínima declarada) — mide si PAGAN, no si les gusta.`,
      `· Plazo: 7 días.`,
      `· Qué cuenta como SÍ: al menos 5 personas que paguen o reserven con dinero.`
    ].join('\n');
  }

  // =============================================================
  // LLM — para decisiones de orquestacion futuras
  // =============================================================
  _pedirAlLLM(mensajes, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `orq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this._pendientesLLM.delete(correlationId);
        reject(new Error('timeout esperando respuesta del LLM'));
      }, 30000);

      this._pendientesLLM.set(correlationId, {
        resolve: (resultado) => {
          clearTimeout(timeout);
          this._pendientesLLM.delete(correlationId);
          resolve(resultado);
        },
        reject: (err) => {
          clearTimeout(timeout);
          this._pendientesLLM.delete(correlationId);
          reject(err);
        }
      });

      this.eventBus?.publish('llm.complete.request', {
        request_id: correlationId,
        project_id: projectId,
        messages: mensajes,
        options: {
          temperature: 0.2,
          max_tokens: 500
        }
      });
    });
  }

  _onLLMResponse(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.request_id;
    if (!correlationId || !this._pendientesLLM) return;

    const pendiente = this._pendientesLLM.get(correlationId);
    if (!pendiente) return;

    if (d.error) {
      pendiente.reject(new Error(d.error.message || 'error del LLM'));
      return;
    }

    const contenido = (d.content || d.text || '').trim();
    try {
      const parsed = JSON.parse(contenido);
      pendiente.resolve(parsed);
    } catch (_) {
      pendiente.resolve({ texto: contenido });
    }
  }
}

module.exports = Orquestador;
