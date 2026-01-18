/**
 * Flow Executor
 * Motor de ejecución de flujos
 */

const crypto = require('crypto');

class FlowExecutor {
  constructor(config, logger, eventBus, stepHandlers, variableResolver) {
    this.config = config;
    this.logger = logger;
    this.eventBus = eventBus;
    this.stepHandlers = stepHandlers;
    this.resolver = variableResolver;

    // Ejecuciones activas
    this.executions = new Map(); // executionId -> executionState

    // Timeout por defecto
    this.defaultTimeout = config.defaultTimeout || 300000; // 5 min

    // Retry defaults
    this.defaultRetry = {
      attempts: 1,      // Sin retry por defecto
      delay: 1000,      // 1 segundo
      backoff: 2,       // Multiplicador exponencial
      maxDelay: 30000   // Máximo 30 segundos entre reintentos
    };
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calcula el delay para un intento específico
   */
  calculateDelay(retryConfig, attempt) {
    if (attempt === 0) return 0; // Primer intento, sin delay

    const baseDelay = retryConfig.delay || this.defaultRetry.delay;
    const backoff = retryConfig.backoff || this.defaultRetry.backoff;
    const maxDelay = retryConfig.maxDelay || this.defaultRetry.maxDelay;

    // Exponential backoff: delay * backoff^(attempt-1)
    const delay = baseDelay * Math.pow(backoff, attempt - 1);
    return Math.min(delay, maxDelay);
  }

  /**
   * Parsea configuración de retry del step
   */
  parseRetryConfig(step) {
    if (!step.retry) {
      return { ...this.defaultRetry, attempts: 1 };
    }

    // Formato simple: retry: 3 (número de intentos)
    if (typeof step.retry === 'number') {
      return { ...this.defaultRetry, attempts: step.retry };
    }

    // Formato completo: retry: { attempts, delay, backoff }
    return {
      attempts: step.retry.attempts || this.defaultRetry.attempts,
      delay: step.retry.delay || this.defaultRetry.delay,
      backoff: step.retry.backoff || this.defaultRetry.backoff,
      maxDelay: step.retry.maxDelay || this.defaultRetry.maxDelay
    };
  }

  /**
   * Inicia la ejecución de un flujo
   */
  async start(flow, triggerData) {
    const executionId = `exec_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const execution = {
      id: executionId,
      flowId: flow.id,
      flowName: flow.name || flow.id,
      status: 'running',
      currentStepIndex: 0,
      currentStepId: flow.steps[0]?.id || 'step_0',
      steps: flow.steps,
      totalSteps: flow.steps.length,

      // Contexto disponible para las variables
      context: {
        trigger: triggerData,
        flow: {
          id: flow.id,
          name: flow.name
        },
        project: {
          id: flow._projectId || null,
          config: flow._projectConfig || {}
        },
        config: flow._projectConfig || {},  // Atajo para acceder a config
        steps: {},       // Resultados de cada step por ID
        variables: {},   // Variables definidas con step 'set'
        execution: {
          id: executionId,
          startedAt: new Date().toISOString()
        }
      },

      // Historial de ejecución
      history: [],

      // Timing
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,

      // Timeout
      timeoutId: null
    };

    // Configurar timeout
    const timeout = flow.timeout || this.defaultTimeout;
    execution.timeoutId = setTimeout(() => {
      this.handleTimeout(executionId);
    }, timeout);

    this.executions.set(executionId, execution);

    this.logger.info('flow-executor.started', {
      executionId,
      flowId: flow.id,
      totalSteps: flow.steps.length
    });

    // Publicar evento de inicio
    await this.eventBus.publish('flow.started', {
      executionId,
      flowId: flow.id,
      flowName: flow.name,
      trigger: triggerData,
      timestamp: execution.startedAt
    });

    // Ejecutar primer paso
    await this.executeStep(executionId);

    return executionId;
  }

  /**
   * Ejecuta el paso actual con soporte de retry/backoff
   */
  async executeStep(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return;
    }

    const step = execution.steps[execution.currentStepIndex];
    if (!step) {
      // No hay más pasos, completar
      await this.complete(executionId);
      return;
    }

    const stepId = step.id || `step_${execution.currentStepIndex}`;
    execution.currentStepId = stepId;

    // Configuración de retry
    const retryConfig = this.parseRetryConfig(step);
    const maxAttempts = retryConfig.attempts;

    this.logger.info('flow-executor.step.starting', {
      executionId,
      stepIndex: execution.currentStepIndex + 1,
      totalSteps: execution.totalSteps,
      stepId,
      stepType: step.type,
      maxAttempts
    });

    // Publicar evento de inicio de paso
    await this.eventBus.publish('flow.step.started', {
      executionId,
      flowId: execution.flowId,
      stepIndex: execution.currentStepIndex,
      stepId,
      stepType: step.type,
      maxAttempts,
      timestamp: new Date().toISOString()
    });

    const stepStartTime = Date.now();
    let lastError = null;

    // === RETRY LOOP ===
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Calcular delay para este intento (0 para el primero)
      const delay = this.calculateDelay(retryConfig, attempt);

      if (delay > 0) {
        this.logger.info('flow-executor.step.retrying', {
          executionId,
          stepId,
          attempt: attempt + 1,
          maxAttempts,
          delayMs: delay
        });

        // Publicar evento de retry
        await this.eventBus.publish('flow.step.retrying', {
          executionId,
          flowId: execution.flowId,
          stepId,
          attempt: attempt + 1,
          maxAttempts,
          delayMs: delay,
          previousError: lastError?.message,
          timestamp: new Date().toISOString()
        });

        await this.sleep(delay);
      }

      try {
        // Ejecutar el paso
        const result = await this.stepHandlers.execute(step, execution.context, executionId);

        // === ÉXITO ===
        // Guardar resultado en contexto
        execution.context.steps[stepId] = result.output;

        // Si el step define variables, añadirlas al contexto
        if (result.setVariables) {
          Object.assign(execution.context.variables, result.setVariables);
        }

        // Guardar en historial
        execution.history.push({
          stepIndex: execution.currentStepIndex,
          stepId,
          stepType: step.type,
          status: 'completed',
          output: result.output,
          attempts: attempt + 1,
          duration: Date.now() - stepStartTime,
          timestamp: new Date().toISOString()
        });

        this.logger.info('flow-executor.step.completed', {
          executionId,
          stepId,
          attempts: attempt + 1,
          duration: Date.now() - stepStartTime
        });

        // Publicar evento de paso completado
        await this.eventBus.publish('flow.step.completed', {
          executionId,
          flowId: execution.flowId,
          stepIndex: execution.currentStepIndex,
          stepId,
          stepType: step.type,
          attempts: attempt + 1,
          duration: Date.now() - stepStartTime,
          timestamp: new Date().toISOString()
        });

        // Determinar siguiente paso
        if (result.nextStep) {
          // Salto condicional a un step específico
          const nextIndex = execution.steps.findIndex(s => s.id === result.nextStep);
          if (nextIndex === -1) {
            throw new Error(`Step not found: ${result.nextStep}`);
          }
          execution.currentStepIndex = nextIndex;
        } else {
          // Siguiente paso secuencial
          execution.currentStepIndex++;
        }

        // Continuar con siguiente paso
        await this.executeStep(executionId);
        return; // Salir del retry loop

      } catch (error) {
        lastError = error;

        this.logger.warn('flow-executor.step.attempt.failed', {
          executionId,
          stepId,
          attempt: attempt + 1,
          maxAttempts,
          error: error.message
        });

        // Si quedan intentos, continuar el loop
        if (attempt < maxAttempts - 1) {
          continue;
        }

        // === TODOS LOS INTENTOS FALLARON ===
        execution.history.push({
          stepIndex: execution.currentStepIndex,
          stepId,
          stepType: step.type,
          status: 'failed',
          error: error.message,
          attempts: attempt + 1,
          duration: Date.now() - stepStartTime,
          timestamp: new Date().toISOString()
        });

        this.logger.error('flow-executor.step.failed', {
          executionId,
          stepId,
          attempts: attempt + 1,
          error: error.message
        });

        // Publicar evento de paso fallido
        await this.eventBus.publish('flow.step.failed', {
          executionId,
          flowId: execution.flowId,
          stepIndex: execution.currentStepIndex,
          stepId,
          stepType: step.type,
          error: error.message,
          attempts: attempt + 1,
          timestamp: new Date().toISOString()
        });

        // Verificar si hay onError en el step
        if (step.onError === 'continue') {
          // Continuar con siguiente paso
          execution.currentStepIndex++;
          await this.executeStep(executionId);
        } else if (step.onError && typeof step.onError === 'string') {
          // Saltar a step de error
          const errorStepIndex = execution.steps.findIndex(s => s.id === step.onError);
          if (errorStepIndex !== -1) {
            execution.context.error = { step: stepId, message: error.message, attempts: attempt + 1 };
            execution.currentStepIndex = errorStepIndex;
            await this.executeStep(executionId);
          } else {
            await this.fail(executionId, error.message);
          }
        } else {
          // Por defecto, fallar el flujo
          await this.fail(executionId, error.message);
        }
      }
    } // Fin del retry loop
  }

  /**
   * Completa el flujo exitosamente
   */
  async complete(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    // Cancelar timeout
    if (execution.timeoutId) {
      clearTimeout(execution.timeoutId);
    }

    execution.status = 'completed';
    execution.completedAt = new Date().toISOString();

    const duration = Date.now() - new Date(execution.startedAt).getTime();

    this.logger.info('flow-executor.completed', {
      executionId,
      flowId: execution.flowId,
      stepsExecuted: execution.history.length,
      duration
    });

    // Publicar evento
    await this.eventBus.publish('flow.completed', {
      executionId,
      flowId: execution.flowId,
      flowName: execution.flowName,
      stepsExecuted: execution.history.length,
      results: execution.context.steps,
      duration,
      timestamp: execution.completedAt
    });

    // Limpiar después de un tiempo
    setTimeout(() => {
      this.executions.delete(executionId);
    }, 300000); // 5 min
  }

  /**
   * Falla el flujo
   */
  async fail(executionId, error) {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    // Cancelar timeout
    if (execution.timeoutId) {
      clearTimeout(execution.timeoutId);
    }

    execution.status = 'failed';
    execution.error = error;
    execution.completedAt = new Date().toISOString();

    const duration = Date.now() - new Date(execution.startedAt).getTime();

    this.logger.error('flow-executor.failed', {
      executionId,
      flowId: execution.flowId,
      stepId: execution.currentStepId,
      error,
      duration
    });

    // Publicar evento
    await this.eventBus.publish('flow.failed', {
      executionId,
      flowId: execution.flowId,
      flowName: execution.flowName,
      stepId: execution.currentStepId,
      error,
      history: execution.history,
      duration,
      timestamp: execution.completedAt
    });

    // Limpiar después de un tiempo
    setTimeout(() => {
      this.executions.delete(executionId);
    }, 300000);
  }

  /**
   * Maneja timeout
   */
  async handleTimeout(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return;
    }

    await this.fail(executionId, `Flow timeout after ${this.defaultTimeout}ms`);
  }

  /**
   * Cancela una ejecución
   */
  async cancel(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    await this.fail(executionId, 'Cancelled by user');
    return true;
  }

  /**
   * Obtiene estado de una ejecución
   */
  getExecution(executionId) {
    return this.executions.get(executionId);
  }

  /**
   * Lista ejecuciones activas
   */
  listActive() {
    return Array.from(this.executions.values())
      .filter(e => e.status === 'running');
  }

  /**
   * Lista todas las ejecuciones (incluye completadas recientes)
   */
  listAll() {
    return Array.from(this.executions.values());
  }

  /**
   * Estadísticas
   */
  getStats() {
    const all = Array.from(this.executions.values());
    return {
      total: all.length,
      running: all.filter(e => e.status === 'running').length,
      completed: all.filter(e => e.status === 'completed').length,
      failed: all.filter(e => e.status === 'failed').length
    };
  }
}

module.exports = FlowExecutor;
