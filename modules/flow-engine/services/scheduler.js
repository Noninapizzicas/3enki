/**
 * Flow Scheduler Service
 *
 * Ejecuta flujos programados usando expresiones cron.
 *
 * Sintaxis cron: "minuto hora día-mes mes día-semana"
 * Ejemplos:
 * - "0 3 * * 0"   → Domingos a las 3:00 AM
 * - "0 3 * * *"   → Todos los días a las 3:00 AM
 * - "0 6 * * 0"   → Domingos a las 6:00 AM
 * - "30 4 * * 1-5" → Lunes a Viernes a las 4:30 AM
 *
 * @module flow-engine/scheduler
 * @version 1.0.0
 */

const cron = require('node-cron');

class FlowScheduler {
  constructor(logger, eventBus) {
    this.logger = logger;
    this.eventBus = eventBus;

    // Tareas programadas activas
    this.scheduledTasks = new Map();

    // Stats
    this.stats = {
      scheduled: 0,
      executed: 0,
      errors: 0
    };
  }

  /**
   * Inicializa el scheduler con los flujos que tienen schedule
   * @param {Array} flows - Lista de flujos del registry
   */
  initialize(flows) {
    this.logger.info('scheduler.initializing', {
      totalFlows: flows.length
    });

    let scheduledCount = 0;

    for (const flow of flows) {
      if (flow.schedule && flow.enabled !== false) {
        this.scheduleFlow(flow);
        scheduledCount++;
      }
    }

    this.stats.scheduled = scheduledCount;

    this.logger.info('scheduler.initialized', {
      scheduledFlows: scheduledCount
    });
  }

  /**
   * Programa un flujo para ejecución
   * @param {Object} flow - Definición del flujo
   */
  scheduleFlow(flow) {
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

    // Validar expresión cron
    if (!cron.validate(cronExpression)) {
      this.logger.error('scheduler.invalid-cron', {
        flowId: id,
        cron: cronExpression,
        original: schedule.cron
      });
      return;
    }

    // Si ya existe, cancelar anterior
    if (this.scheduledTasks.has(id)) {
      this.unscheduleFlow(id);
    }

    // Crear tarea cron con expresión resuelta
    const task = cron.schedule(cronExpression, async () => {
      await this.executeScheduledFlow(flow);
    }, {
      scheduled: true,
      timezone: timezone
    });

    this.scheduledTasks.set(id, {
      task,
      flow,
      cronExpression, // Guardar expresión resuelta
      timezone,
      lastRun: null,
      nextRun: this.getNextRun(cronExpression),
      runCount: 0
    });

    this.logger.info('scheduler.flow-scheduled', {
      flowId: id,
      flowName: name,
      cron: cronExpression,
      timezone: timezone,
      nextRun: this.getNextRun(cronExpression)
    });
  }

  /**
   * Resuelve variables de template {{ config.* }} con la config del proyecto
   * @param {string} template - String con variables {{ }}
   * @param {Object} config - Configuración del proyecto
   * @returns {string} - String con variables resueltas
   */
  resolveTemplate(template, config) {
    return template.replace(/\{\{\s*config\.([a-zA-Z_.]+)\s*\}\}/g, (match, path) => {
      const value = this.getNestedValue(config, path);
      return value !== undefined ? value : match;
    });
  }

  /**
   * Obtiene valor anidado de un objeto usando path con puntos
   * @param {Object} obj - Objeto fuente
   * @param {string} path - Path como "schedule.gmail"
   * @returns {*} - Valor encontrado o undefined
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Ejecuta un flujo programado
   * @param {Object} flow - Definición del flujo
   */
  async executeScheduledFlow(flow) {
    const { id, name } = flow;
    const startTime = Date.now();

    this.logger.info('scheduler.executing', {
      flowId: id,
      flowName: name,
      scheduledTime: new Date().toISOString()
    });

    try {
      // Publicar evento flow.trigger con datos del schedule
      await this.eventBus.publish('flow.trigger', {
        flowId: id,
        trigger: 'schedule',
        scheduledAt: new Date().toISOString(),
        scheduleConfig: flow.schedule
      });

      // Actualizar stats
      const taskInfo = this.scheduledTasks.get(id);
      if (taskInfo) {
        taskInfo.lastRun = new Date().toISOString();
        taskInfo.runCount++;
        taskInfo.nextRun = this.getNextRun(flow.schedule.cron);
      }

      this.stats.executed++;

      this.logger.info('scheduler.executed', {
        flowId: id,
        flowName: name,
        duration: Date.now() - startTime
      });

    } catch (error) {
      this.stats.errors++;

      this.logger.error('scheduler.execution-error', {
        flowId: id,
        flowName: name,
        error: error.message
      });
    }
  }

  /**
   * Cancela la programación de un flujo
   * @param {string} flowId - ID del flujo
   */
  unscheduleFlow(flowId) {
    const taskInfo = this.scheduledTasks.get(flowId);

    if (taskInfo) {
      taskInfo.task.stop();
      this.scheduledTasks.delete(flowId);

      this.logger.info('scheduler.flow-unscheduled', {
        flowId
      });
    }
  }

  /**
   * Calcula la próxima ejecución (aproximada)
   * @param {string} cronExpression - Expresión cron
   * @returns {string} - ISO timestamp de próxima ejecución
   */
  getNextRun(cronExpression) {
    // node-cron no tiene método nativo para esto
    // Devolvemos una aproximación basada en la expresión
    try {
      const parts = cronExpression.split(' ');
      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      const now = new Date();
      const next = new Date();

      // Ajustar hora y minuto
      if (hour !== '*') next.setHours(parseInt(hour));
      if (minute !== '*') next.setMinutes(parseInt(minute));
      next.setSeconds(0);

      // Si ya pasó hoy, siguiente día
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      // Si es día específico de semana (0=domingo)
      if (dayOfWeek !== '*') {
        const targetDay = parseInt(dayOfWeek);
        while (next.getDay() !== targetDay) {
          next.setDate(next.getDate() + 1);
        }
      }

      return next.toISOString();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Obtiene estado de todas las tareas programadas
   * @returns {Array} - Lista de tareas con su estado
   */
  getStatus() {
    const tasks = [];

    for (const [flowId, info] of this.scheduledTasks) {
      tasks.push({
        flowId,
        flowName: info.flow.name,
        cron: info.cronExpression, // Usar expresión resuelta
        cronTemplate: info.flow.schedule.cron, // Template original
        timezone: info.timezone,
        lastRun: info.lastRun,
        nextRun: info.nextRun,
        runCount: info.runCount
      });
    }

    return {
      stats: this.stats,
      tasks
    };
  }

  /**
   * Fuerza la ejecución inmediata de un flujo programado
   * @param {string} flowId - ID del flujo
   */
  async triggerNow(flowId) {
    const taskInfo = this.scheduledTasks.get(flowId);

    if (!taskInfo) {
      throw new Error(`Flow ${flowId} is not scheduled`);
    }

    this.logger.info('scheduler.manual-trigger', {
      flowId
    });

    await this.executeScheduledFlow(taskInfo.flow);
  }

  /**
   * Detiene todas las tareas programadas
   */
  stop() {
    this.logger.info('scheduler.stopping', {
      activeTasks: this.scheduledTasks.size
    });

    for (const [flowId, info] of this.scheduledTasks) {
      info.task.stop();
    }

    this.scheduledTasks.clear();

    this.logger.info('scheduler.stopped');
  }
}

module.exports = FlowScheduler;
