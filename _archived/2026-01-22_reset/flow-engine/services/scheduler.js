/**
 * Flow Scheduler Service
 *
 * Delega al módulo scheduler para ejecución de flujos programados.
 * Actúa como facade que traduce flujos con schedule a jobs del scheduler.
 *
 * Sintaxis cron: "minuto hora día-mes mes día-semana"
 * Ejemplos:
 * - "0 3 * * 0"   → Domingos a las 3:00 AM
 * - "0 3 * * *"   → Todos los días a las 3:00 AM
 * - "30 4 * * 1-5" → Lunes a Viernes a las 4:30 AM
 *
 * @module flow-engine/scheduler
 * @version 2.0.0
 */

const crypto = require('crypto');

class FlowScheduler {
  constructor(logger, eventBus) {
    this.logger = logger;
    this.eventBus = eventBus;

    // Mapping: flowId -> schedulerJobId
    this.flowToJob = new Map();

    // Pending job creations (waiting for scheduler response)
    this.pendingCreations = new Map();

    // Stats
    this.stats = {
      scheduled: 0,
      executed: 0,
      errors: 0
    };

    // Event subscriptions
    this.unsubscribes = [];
  }

  /**
   * Inicializa el scheduler suscribiéndose a eventos del módulo scheduler
   * @param {Array} flows - Lista de flujos del registry
   */
  async initialize(flows) {
    this.logger.info('flow-scheduler.initializing', {
      totalFlows: flows.length
    });

    // Suscribirse a eventos del scheduler
    await this.subscribeToSchedulerEvents();

    let scheduledCount = 0;

    for (const flow of flows) {
      if (flow.schedule && flow.enabled !== false) {
        await this.scheduleFlow(flow);
        scheduledCount++;
      }
    }

    this.stats.scheduled = scheduledCount;

    this.logger.info('flow-scheduler.initialized', {
      scheduledFlows: scheduledCount
    });
  }

  /**
   * Suscribirse a eventos del módulo scheduler
   */
  async subscribeToSchedulerEvents() {
    // Cuando un job del scheduler se ejecuta, verificar si es un flow
    const unsubTriggered = await this.eventBus.subscribe(
      'scheduler.job.triggered',
      this.onSchedulerJobTriggered.bind(this)
    );
    this.unsubscribes.push(unsubTriggered);

    // Cuando se completa la creación de un job
    const unsubCreated = await this.eventBus.subscribe(
      'scheduler.job.created',
      this.onSchedulerJobCreated.bind(this)
    );
    this.unsubscribes.push(unsubCreated);

    this.logger.debug('flow-scheduler.events.subscribed');
  }

  /**
   * Maneja evento de job triggered del scheduler
   */
  async onSchedulerJobTriggered(event) {
    const data = event?.data || event?.payload || event;
    const { jobId, jobName } = data;

    // Verificar si este job corresponde a un flow
    let flowId = null;
    for (const [fId, jId] of this.flowToJob.entries()) {
      if (jId === jobId) {
        flowId = fId;
        break;
      }
    }

    if (flowId) {
      this.stats.executed++;
      this.logger.info('flow-scheduler.flow.triggered', {
        flowId,
        jobId,
        scheduledTime: new Date().toISOString()
      });
    }
  }

  /**
   * Maneja evento de job created del scheduler
   */
  onSchedulerJobCreated(event) {
    const data = event?.data || event?.payload || event;
    const job = data.job || data;

    // Buscar si hay una creación pendiente para este job
    if (job?.metadata?.flowId) {
      const pending = this.pendingCreations.get(job.metadata.flowId);
      if (pending) {
        this.flowToJob.set(job.metadata.flowId, job.id);
        this.pendingCreations.delete(job.metadata.flowId);
        this.logger.debug('flow-scheduler.job.linked', {
          flowId: job.metadata.flowId,
          jobId: job.id
        });
      }
    }
  }

  /**
   * Programa un flujo para ejecución delegando al módulo scheduler
   * @param {Object} flow - Definición del flujo
   */
  async scheduleFlow(flow) {
    const { id, name, schedule } = flow;

    // Resolver variables en la expresión cron
    let cronExpression = schedule.cron;
    let timezone = schedule.timezone || 'Europe/Madrid';

    // Si es un template, resolver con la config del proyecto
    if (cronExpression.includes('{{') && flow._projectConfig) {
      cronExpression = this.resolveTemplate(cronExpression, flow._projectConfig);
    }
    if (timezone.includes('{{') && flow._projectConfig) {
      timezone = this.resolveTemplate(timezone, flow._projectConfig);
    }

    // Validar expresión cron (validación básica)
    if (!this.isValidCron(cronExpression)) {
      this.logger.error('flow-scheduler.invalid-cron', {
        flowId: id,
        cron: cronExpression,
        original: schedule.cron
      });
      return;
    }

    // Si ya existe un job para este flow, eliminarlo primero
    if (this.flowToJob.has(id)) {
      await this.unscheduleFlow(id);
    }

    // Marcar como pendiente
    this.pendingCreations.set(id, { flow, cronExpression, timezone });

    // Crear job en el módulo scheduler via evento
    // El scheduler creará el job y publicará scheduler.job.created
    await this.eventBus.publish('ui.request', {
      module: 'scheduler',
      action: 'create',
      data: {
        name: `flow:${name || id}`,
        description: `Scheduled execution of flow: ${name || id}`,
        trigger: {
          type: 'cron',
          expression: cronExpression,
          timezone: timezone
        },
        action: {
          type: 'mqtt',
          topic: 'flow.trigger',
          payload: {
            flowId: id,
            trigger: 'schedule',
            scheduledAt: '{{ now }}',
            scheduleConfig: schedule
          }
        },
        options: {
          enabled: true,
          maxRetries: 0 // Los flujos manejan su propio retry
        },
        metadata: {
          flowId: id,
          flowName: name,
          source: 'flow-engine',
          createdAt: new Date().toISOString()
        }
      }
    });

    this.logger.info('flow-scheduler.flow.scheduling', {
      flowId: id,
      flowName: name,
      cron: cronExpression,
      timezone: timezone
    });
  }

  /**
   * Valida expresión cron básica
   */
  isValidCron(expression) {
    if (!expression || typeof expression !== 'string') return false;
    const parts = expression.trim().split(/\s+/);
    // Cron estándar tiene 5 partes (minuto hora día mes día-semana)
    return parts.length === 5 || parts.length === 6;
  }

  /**
   * Resuelve variables de template {{ config.* }} con la config del proyecto
   */
  resolveTemplate(template, config) {
    return template.replace(/\{\{\s*config\.([a-zA-Z_.]+)\s*\}\}/g, (match, path) => {
      const value = this.getNestedValue(config, path);
      return value !== undefined ? value : match;
    });
  }

  /**
   * Obtiene valor anidado de un objeto usando path con puntos
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Cancela la programación de un flujo
   * @param {string} flowId - ID del flujo
   */
  async unscheduleFlow(flowId) {
    const jobId = this.flowToJob.get(flowId);

    if (jobId) {
      // Eliminar job del scheduler
      await this.eventBus.publish('ui.request', {
        module: 'scheduler',
        action: 'delete',
        data: { jobId }
      });

      this.flowToJob.delete(flowId);
      this.pendingCreations.delete(flowId);

      this.logger.info('flow-scheduler.flow.unscheduled', {
        flowId,
        jobId
      });
    }
  }

  /**
   * Obtiene estado de todas las tareas programadas
   */
  getStatus() {
    const tasks = [];

    for (const [flowId, jobId] of this.flowToJob) {
      tasks.push({
        flowId,
        jobId,
        source: 'scheduler-module'
      });
    }

    return {
      stats: this.stats,
      tasks,
      delegatedTo: 'modules/scheduler'
    };
  }

  /**
   * Fuerza la ejecución inmediata de un flujo programado
   * @param {string} flowId - ID del flujo
   */
  async triggerNow(flowId) {
    const jobId = this.flowToJob.get(flowId);

    if (!jobId) {
      throw new Error(`Flow ${flowId} is not scheduled`);
    }

    this.logger.info('flow-scheduler.manual-trigger', {
      flowId,
      jobId
    });

    // Trigger el job en el scheduler
    await this.eventBus.publish('ui.request', {
      module: 'scheduler',
      action: 'trigger',
      data: { jobId }
    });
  }

  /**
   * Detiene todas las tareas programadas
   */
  async stop() {
    this.logger.info('flow-scheduler.stopping', {
      activeTasks: this.flowToJob.size
    });

    // Desuscribirse de eventos
    for (const unsub of this.unsubscribes) {
      if (typeof unsub === 'function') {
        await unsub();
      }
    }
    this.unsubscribes = [];

    // No eliminamos los jobs del scheduler - persisten independientemente
    // Solo limpiamos el mapping local
    this.flowToJob.clear();
    this.pendingCreations.clear();

    this.logger.info('flow-scheduler.stopped');
  }
}

module.exports = FlowScheduler;
