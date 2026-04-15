/**
 * Carta Scheduler v1.0.0 — Programación de cambios de carta
 *
 * Permite programar cambios de carta por canal: "los lunes carta del día en mesa",
 * "del 15 al 31 agosto carta terraza en todos", "1 de junio carta verano en general".
 *
 * Los agentes hacen el trabajo:
 *   - scheduler-planner: conversa con el usuario, crea reglas, detecta conflictos
 *   - scheduler-dispatcher: cuando llega el momento, avisa y espera confirmación
 *
 * Responsabilidades del módulo:
 *   1. Almacenar reglas de programación por proyecto
 *   2. Registrar jobs en el scheduler del core para cada regla
 *   3. Recibir el trigger del scheduler y dispatch al agente dispatcher
 *   4. Gestionar cambios pendientes (esperando confirmación del usuario)
 *   5. Aplicar cambio confirmado via tarifas.assign
 *
 * Cuando usuario confirma un cambio pendiente → aplica vía tarifas.
 * Cuando rechaza o vence la ventana → queda registrado, no se aplica.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const VENTANA_CONFIRMACION_MS = 24 * 60 * 60 * 1000;  // 24h para confirmar

class CartaSchedulerModule {
  constructor() {
    this.name = 'carta-scheduler';
    this.version = '1.0.0';

    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.moduleLoader = null;

    // Multi-tenant
    this.reglasPerProject = new Map();       // project_id → Map<regla_id, regla>
    this.pendientesPerProject = new Map();   // project_id → Map<pendiente_id, pendiente>
    this.projectPaths = new Map();

    // Limpieza de pendientes vencidos
    this.cleanupTimer = null;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.moduleLoader = context.moduleLoader;

    // Suscribirse a eventos del scheduler para cuando nuestros jobs disparen
    this.jobTriggeredUnsub = await this.eventBus.subscribe(
      'scheduler.job.triggered',
      this.onSchedulerJobTriggered.bind(this)
    );

    // Limpieza periódica de pendientes vencidos (cada hora)
    this.cleanupTimer = setInterval(() => this.limpiarPendientesVencidos(), 60 * 60 * 1000);

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    if (this.jobTriggeredUnsub) await this.jobTriggeredUnsub();
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    this.reglasPerProject.clear();
    this.pendientesPerProject.clear();
    this.projectPaths.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Project Lifecycle
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;
    if (!project_id) return;

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, path.join(resolvedBase, 'storage', 'pizzepos'));
    }

    await this.loadReglas(project_id);
    await this.loadPendientes(project_id);

    // Registrar jobs en el scheduler para reglas activas
    await this.registrarJobsEnScheduler(project_id);

    this.logger.info('carta-scheduler.project.activated', {
      project_id,
      reglas: this.getReglas(project_id).size,
      pendientes: this.getPendientes(project_id).size
    });
  }

  async onProjectDeactivated(event) {
    // Keep state
  }

  // ==========================================
  // Persistence
  // ==========================================

  reglasPathFor(projectId) {
    const basePath = this.projectPaths.get(projectId);
    if (!basePath) return null;
    return path.join(basePath, 'config', 'carta-scheduler-reglas.json');
  }

  pendientesPathFor(projectId) {
    const basePath = this.projectPaths.get(projectId);
    if (!basePath) return null;
    return path.join(basePath, 'config', 'carta-scheduler-pendientes.json');
  }

  async loadReglas(projectId) {
    const filePath = this.reglasPathFor(projectId);
    if (!filePath) {
      this.reglasPerProject.set(projectId, new Map());
      return;
    }
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const arr = JSON.parse(content);
      const m = new Map();
      for (const regla of arr) m.set(regla.id, regla);
      this.reglasPerProject.set(projectId, m);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('carta-scheduler.reglas.load_error', { project_id: projectId, error: err.message });
      }
      this.reglasPerProject.set(projectId, new Map());
    }
  }

  async saveReglas(projectId) {
    const filePath = this.reglasPathFor(projectId);
    if (!filePath) return;
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const arr = Array.from(this.getReglas(projectId).values());
      await fs.writeFile(filePath, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error('carta-scheduler.reglas.save_error', { project_id: projectId, error: err.message });
    }
  }

  async loadPendientes(projectId) {
    const filePath = this.pendientesPathFor(projectId);
    if (!filePath) {
      this.pendientesPerProject.set(projectId, new Map());
      return;
    }
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const arr = JSON.parse(content);
      const m = new Map();
      for (const p of arr) m.set(p.id, p);
      this.pendientesPerProject.set(projectId, m);
    } catch (err) {
      this.pendientesPerProject.set(projectId, new Map());
    }
  }

  async savePendientes(projectId) {
    const filePath = this.pendientesPathFor(projectId);
    if (!filePath) return;
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const arr = Array.from(this.getPendientes(projectId).values());
      await fs.writeFile(filePath, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error('carta-scheduler.pendientes.save_error', { project_id: projectId, error: err.message });
    }
  }

  getReglas(projectId) {
    if (!this.reglasPerProject.has(projectId)) {
      this.reglasPerProject.set(projectId, new Map());
    }
    return this.reglasPerProject.get(projectId);
  }

  getPendientes(projectId) {
    if (!this.pendientesPerProject.has(projectId)) {
      this.pendientesPerProject.set(projectId, new Map());
    }
    return this.pendientesPerProject.get(projectId);
  }

  // ==========================================
  // Registrar jobs en el scheduler del core
  // ==========================================

  async registrarJobsEnScheduler(projectId) {
    const reglas = this.getReglas(projectId);
    const scheduler = this.moduleLoader?.getModule?.('scheduler');
    if (!scheduler?.instance?.addJob) {
      this.logger.warn('carta-scheduler.scheduler_not_available');
      return;
    }

    for (const regla of reglas.values()) {
      if (!regla.activa) continue;
      try {
        await scheduler.instance.addJob({
          name: `carta-scheduler:${regla.id}`,
          description: regla.descripcion || `Cambio de carta programado (${regla.id})`,
          project_id: projectId,
          trigger: regla.trigger,
          action: {
            type: 'event',
            event: 'carta-scheduler.regla.triggered',
            payload: {
              regla_id: regla.id,
              project_id: projectId
            }
          },
          metadata: {
            managedBy: 'carta-scheduler',
            regla_id: regla.id
          }
        });
      } catch (err) {
        this.logger.warn('carta-scheduler.job.register_error', {
          regla_id: regla.id, error: err.message
        });
      }
    }
  }

  // ==========================================
  // Scheduler event: un job nuestro se disparó
  // ==========================================

  async onSchedulerJobTriggered(event) {
    const data = event?.data || event?.payload || event;
    const job = data?.job;
    if (!job?.name?.startsWith('carta-scheduler:')) return;   // No es nuestro

    const reglaId = job.metadata?.regla_id;
    const projectId = job.project_id;
    if (!reglaId || !projectId) return;

    const regla = this.getReglas(projectId).get(reglaId);
    if (!regla || !regla.activa) return;

    this.logger.info('carta-scheduler.regla.triggered', {
      regla_id: reglaId, project_id: projectId
    });

    // Crear pendiente esperando confirmación
    const pendiente = {
      id: `pend_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      regla_id: reglaId,
      project_id: projectId,
      cambios: regla.cambios,            // [{ canal, carta_id }]
      estado: 'esperando_confirmacion',
      creado_at: new Date().toISOString(),
      expira_at: new Date(Date.now() + VENTANA_CONFIRMACION_MS).toISOString()
    };

    this.getPendientes(projectId).set(pendiente.id, pendiente);
    await this.savePendientes(projectId);

    // Dispatch al agente dispatcher para avisar al usuario
    await this.eventBus.publish('agent.execute.request', {
      agentName: 'scheduler-dispatcher',
      context: {
        project_id: projectId,
        pendiente_id: pendiente.id,
        regla,
        cambios: regla.cambios
      },
      task: `Cambio de carta programado listo. Avisa al usuario y pide confirmación. Regla: "${regla.descripcion}". Cambios: ${JSON.stringify(regla.cambios)}.`
    });

    this.metrics?.increment('carta-scheduler.regla.triggered');
  }

  // ==========================================
  // Limpieza de pendientes vencidos
  // ==========================================

  async limpiarPendientesVencidos() {
    const now = Date.now();
    for (const [projectId, pendientes] of this.pendientesPerProject) {
      let limpiados = 0;
      for (const [id, pendiente] of pendientes) {
        if (pendiente.estado === 'esperando_confirmacion' &&
            new Date(pendiente.expira_at).getTime() < now) {
          pendiente.estado = 'vencido';
          pendiente.cerrado_at = new Date().toISOString();
          limpiados++;
        }
      }
      if (limpiados > 0) {
        await this.savePendientes(projectId);
        this.logger.info('carta-scheduler.pendientes.vencidos', {
          project_id: projectId, count: limpiados
        });
      }
    }
  }

  // ==========================================
  // Tools
  // ==========================================

  async toolCrearRegla({ project_id, regla }) {
    if (!project_id || !regla) return { status: 400, error: 'Se requiere project_id y regla' };

    const reglas = this.getReglas(project_id);
    const id = regla.id || `regla_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const nueva = {
      id,
      descripcion: regla.descripcion || '',
      cambios: regla.cambios || [],    // [{ canal, carta_id }]
      trigger: regla.trigger,           // { type: cron|datetime|interval, ... }
      activa: regla.activa !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    reglas.set(id, nueva);
    await this.saveReglas(project_id);

    // Registrar job en scheduler
    if (nueva.activa) {
      await this.registrarJobEnScheduler(project_id, nueva);
    }

    return {
      status: 200,
      data: {
        regla: nueva,
        message: `Regla "${id}" creada y ${nueva.activa ? 'activada' : 'inactiva'}.`
      }
    };
  }

  async registrarJobEnScheduler(projectId, regla) {
    const scheduler = this.moduleLoader?.getModule?.('scheduler');
    if (!scheduler?.instance?.addJob) return;
    try {
      await scheduler.instance.addJob({
        name: `carta-scheduler:${regla.id}`,
        description: regla.descripcion || `Cambio de carta programado (${regla.id})`,
        project_id: projectId,
        trigger: regla.trigger,
        action: {
          type: 'event',
          event: 'carta-scheduler.regla.triggered',
          payload: { regla_id: regla.id, project_id: projectId }
        },
        metadata: { managedBy: 'carta-scheduler', regla_id: regla.id }
      });
    } catch (err) {
      this.logger.warn('carta-scheduler.job.register_error', {
        regla_id: regla.id, error: err.message
      });
    }
  }

  async toolListarReglas({ project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const reglas = Array.from(this.getReglas(project_id).values());
    return { status: 200, data: { reglas, total: reglas.length } };
  }

  async toolEliminarRegla({ project_id, regla_id }) {
    if (!project_id || !regla_id) return { status: 400, error: 'Se requiere project_id y regla_id' };
    const reglas = this.getReglas(project_id);
    if (!reglas.has(regla_id)) return { status: 404, error: `Regla "${regla_id}" no encontrada` };

    reglas.delete(regla_id);
    await this.saveReglas(project_id);

    // Eliminar job del scheduler
    const scheduler = this.moduleLoader?.getModule?.('scheduler');
    if (scheduler?.instance?.deleteJob) {
      try {
        const jobs = await scheduler.instance.listJobs?.({ project_id });
        const job = (jobs || []).find(j => j.name === `carta-scheduler:${regla_id}`);
        if (job) await scheduler.instance.deleteJob(job.id);
      } catch (_) {}
    }

    return { status: 200, data: { regla_id, message: `Regla "${regla_id}" eliminada.` } };
  }

  async toolDetectarConflictos({ project_id, nueva_regla }) {
    if (!project_id || !nueva_regla) return { status: 400, error: 'Se requiere project_id y nueva_regla' };

    const reglas = Array.from(this.getReglas(project_id).values()).filter(r => r.activa);
    const conflictos = [];

    // Conflicto simple: otra regla afecta al mismo canal en ventana solapada
    // (esto es una heurística — el planner puede refinar)
    for (const canal of (nueva_regla.cambios || []).map(c => c.canal)) {
      const otras = reglas.filter(r => r.cambios.some(c => c.canal === canal));
      if (otras.length > 0) {
        conflictos.push({
          canal,
          reglas_existentes: otras.map(r => ({ id: r.id, descripcion: r.descripcion, trigger: r.trigger }))
        });
      }
    }

    return {
      status: 200,
      data: {
        hay_conflicto: conflictos.length > 0,
        conflictos,
        message: conflictos.length > 0
          ? `Atención: ${conflictos.length} canal(es) ya tienen reglas activas. Revisar antes de guardar.`
          : 'Sin conflictos detectados.'
      }
    };
  }

  async toolProximosCambios({ project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    // Cambios pendientes esperando confirmación
    const pendientes = Array.from(this.getPendientes(project_id).values())
      .filter(p => p.estado === 'esperando_confirmacion')
      .sort((a, b) => new Date(a.creado_at) - new Date(b.creado_at));

    return {
      status: 200,
      data: { pendientes, total: pendientes.length }
    };
  }

  async toolConfirmar({ project_id, pendiente_id }) {
    if (!project_id || !pendiente_id) return { status: 400, error: 'Se requiere project_id y pendiente_id' };

    const pendientes = this.getPendientes(project_id);
    const pendiente = pendientes.get(pendiente_id);
    if (!pendiente) return { status: 404, error: `Pendiente "${pendiente_id}" no encontrado` };
    if (pendiente.estado !== 'esperando_confirmacion') {
      return { status: 400, error: `Pendiente en estado "${pendiente.estado}", no se puede confirmar` };
    }

    // Aplicar cambios vía tarifas.assign
    const tarifas = this.moduleLoader?.getModule?.('tarifas');
    const aplicados = [];
    const fallidos = [];

    if (tarifas?.instance?.toolAssign) {
      for (const cambio of pendiente.cambios) {
        try {
          const result = await tarifas.instance.toolAssign({
            canal: cambio.canal,
            carta_id: cambio.carta_id,
            project_id
          });
          if (result.status === 200) {
            aplicados.push(cambio);
          } else {
            fallidos.push({ cambio, error: result.error });
          }
        } catch (err) {
          fallidos.push({ cambio, error: err.message });
        }
      }
    } else {
      return { status: 500, error: 'Módulo tarifas no disponible' };
    }

    pendiente.estado = fallidos.length > 0 ? 'aplicado_con_errores' : 'aplicado';
    pendiente.aplicado_at = new Date().toISOString();
    pendiente.aplicados = aplicados;
    pendiente.fallidos = fallidos;
    await this.savePendientes(project_id);

    this.metrics?.increment('carta-scheduler.pendiente.aplicado');

    return {
      status: 200,
      data: {
        pendiente_id,
        aplicados: aplicados.length,
        fallidos: fallidos.length,
        detalle: { aplicados, fallidos },
        message: fallidos.length > 0
          ? `Cambios aplicados parcialmente (${aplicados.length} OK, ${fallidos.length} fallidos).`
          : `Cambios aplicados correctamente (${aplicados.length}).`
      }
    };
  }

  async toolRechazar({ project_id, pendiente_id, razon }) {
    if (!project_id || !pendiente_id) return { status: 400, error: 'Se requiere project_id y pendiente_id' };

    const pendiente = this.getPendientes(project_id).get(pendiente_id);
    if (!pendiente) return { status: 404, error: `Pendiente "${pendiente_id}" no encontrado` };

    pendiente.estado = 'rechazado';
    pendiente.rechazado_at = new Date().toISOString();
    pendiente.razon = razon || null;
    await this.savePendientes(project_id);

    this.metrics?.increment('carta-scheduler.pendiente.rechazado');

    return {
      status: 200,
      data: { pendiente_id, message: 'Cambio rechazado.' }
    };
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleListarReglas(data) {
    return (await this.toolListarReglas({ project_id: data?.project_id })).data;
  }

  async handleProximosCambios(data) {
    return (await this.toolProximosCambios({ project_id: data?.project_id })).data;
  }

  async handleHealth() {
    let totalReglas = 0;
    let totalPendientes = 0;
    for (const r of this.reglasPerProject.values()) totalReglas += r.size;
    for (const p of this.pendientesPerProject.values()) totalPendientes += p.size;

    return {
      status: 'healthy', module: this.name, version: this.version,
      reglas: totalReglas, pendientes: totalPendientes
    };
  }
}

module.exports = CartaSchedulerModule;
