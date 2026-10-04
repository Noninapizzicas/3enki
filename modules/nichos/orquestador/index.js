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
    const viables = d.viables || d.resultados || [];
    ciclo.viables = viables;

    if (viables.length === 0) {
      // Sin viables — cerrar ciclo sin ensamblaje
      this._cerrarCiclo(correlationId, { viables: 0, razon: 'sin_viables' });
      return;
    }

    // Disparar ensamblaje
    this.eventBus?.publish('nichos.solucion.ensamblar.request', {
      request_id: `ens-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      viables,
      correlation_id: correlationId,
      project_id: ciclo.project_id || null
    });

    this.logger?.info('orquestador.ensamblaje.disparado', {
      correlation_id: correlationId,
      num_viables: viables.length
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
    this.eventBus?.publish('nichos.cuadro.salud.actualizar.request', {
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
  _cerrarCiclo(correlationId, resultado) {
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

    // Limpiar ciclo del Map
    this._ciclos.delete(correlationId);
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
