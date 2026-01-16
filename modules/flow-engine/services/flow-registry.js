/**
 * Flow Registry
 * Gestiona las definiciones de flujos
 */

const fs = require('fs').promises;
const path = require('path');

class FlowRegistry {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.flows = new Map(); // flowId -> flowDefinition
    this.triggerIndex = new Map(); // event -> [flowIds]
    this.projectConfigs = new Map(); // projectId -> config
  }

  async initialize() {
    // Cargar flujos globales desde archivos si está configurado
    if (this.config.autoLoadFlows) {
      await this.loadFromDirectory(this.config.flowsPath);
    }

    // Cargar flujos de todos los proyectos
    await this.loadProjectFlows();

    this.logger.info('flow-registry.initialized', {
      flows_count: this.flows.size,
      projects_with_flows: this.projectConfigs.size
    });
  }

  /**
   * Carga flujos de todos los proyectos
   * También carga desde templates/ si el proyecto no tiene flows propios
   */
  async loadProjectFlows() {
    const projectsPath = this.config.projectsPath || './data/projects';
    const templatesPath = this.config.templatesPath || './templates';
    const resolvedPath = path.resolve(projectsPath);

    try {
      await fs.access(resolvedPath);
    } catch {
      this.logger.debug('flow-registry.projects.not_found', { path: resolvedPath });
      return;
    }

    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const projects = entries.filter(e => e.isDirectory());

    for (const project of projects) {
      const projectId = project.name;
      const projectPath = path.join(resolvedPath, projectId);

      // Cargar configuración del proyecto si existe
      await this.loadProjectConfig(projectId, projectPath);

      // Cargar flujos del proyecto desde data/projects/{project}/flows/
      const flowsPath = path.join(projectPath, 'flows');
      let hasProjectFlows = false;

      try {
        await fs.access(flowsPath);
        const flowFiles = await fs.readdir(flowsPath);
        if (flowFiles.some(f => f.endsWith('.json'))) {
          hasProjectFlows = true;
          await this.loadFromDirectory(flowsPath, projectId);
        }
      } catch {
        // Proyecto sin directorio flows
      }

      // Si no tiene flows propios, buscar en templates/
      if (!hasProjectFlows) {
        await this.loadTemplateFlows(projectId, templatesPath);
      }
    }
  }

  /**
   * Carga flows desde templates para un proyecto
   * Busca templates que coincidan con el nombre del proyecto
   */
  async loadTemplateFlows(projectId, templatesPath) {
    const resolvedTemplatesPath = path.resolve(templatesPath);

    try {
      await fs.access(resolvedTemplatesPath);
    } catch {
      return;
    }

    // Buscar template que coincida con el nombre del proyecto
    // ej: facturas-nonina -> buscar en templates/facturas/
    const templateNames = [
      projectId,                           // facturas-nonina
      projectId.split('-')[0],             // facturas
      projectId.replace(/-[^-]+$/, '')     // facturas (quitar sufijo)
    ];

    for (const templateName of templateNames) {
      const templateFlowsPath = path.join(resolvedTemplatesPath, templateName, 'flows');

      try {
        await fs.access(templateFlowsPath);
        this.logger.info('flow-registry.template.loading', {
          projectId,
          templateName,
          path: templateFlowsPath
        });
        await this.loadFromDirectory(templateFlowsPath, projectId);
        return; // Encontrado, no buscar más
      } catch {
        // Template no encontrado, continuar
      }
    }
  }

  /**
   * Carga la configuración de facturas de un proyecto
   */
  async loadProjectConfig(projectId, projectPath) {
    const configPath = path.join(projectPath, 'config', 'facturas.json');

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      this.projectConfigs.set(projectId, config);

      this.logger.debug('flow-registry.project.config.loaded', {
        projectId,
        enabled: config.enabled
      });
    } catch {
      // Sin config de facturas, ok
    }
  }

  /**
   * Obtiene la configuración de un proyecto
   */
  getProjectConfig(projectId) {
    return this.projectConfigs.get(projectId);
  }

  /**
   * Carga flujos desde un directorio
   * @param {string} dirPath - Ruta al directorio
   * @param {string} projectId - ID del proyecto (opcional, para flujos de proyecto)
   */
  async loadFromDirectory(dirPath, projectId = null) {
    const resolvedPath = path.resolve(dirPath);

    try {
      await fs.access(resolvedPath);
    } catch {
      this.logger.info('flow-registry.directory.not_found', {
        path: resolvedPath
      });
      return;
    }

    const files = await fs.readdir(resolvedPath);
    const flowFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.yaml'));

    for (const file of flowFiles) {
      try {
        const filePath = path.join(resolvedPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const flow = JSON.parse(content);

        // Asegurar que tiene ID
        if (!flow.id) {
          flow.id = path.basename(file, path.extname(file));
        }

        // Si es de proyecto, añadir prefijo y metadata
        if (projectId) {
          flow._projectId = projectId;
          flow._originalId = flow.id;
          flow.id = `${projectId}:${flow.id}`; // ID único: proyecto:flujo

          // Cargar config del proyecto al flujo
          const projectConfig = this.projectConfigs.get(projectId);
          if (projectConfig) {
            flow._projectConfig = projectConfig;
          }
        }

        await this.register(flow);

        this.logger.info('flow-registry.flow.loaded', {
          flowId: flow.id,
          projectId: projectId || 'global',
          file
        });
      } catch (error) {
        this.logger.error('flow-registry.flow.load_error', {
          file,
          projectId,
          error: error.message
        });
      }
    }
  }

  /**
   * Registra un nuevo flujo
   */
  async register(flow) {
    // Validar estructura mínima
    if (!flow.id) {
      throw new Error('Flow must have an id');
    }

    if (!flow.steps || !Array.isArray(flow.steps) || flow.steps.length === 0) {
      throw new Error('Flow must have at least one step');
    }

    // Guardar flujo
    this.flows.set(flow.id, {
      ...flow,
      registeredAt: new Date().toISOString()
    });

    // Indexar por trigger
    if (flow.trigger?.event) {
      const event = flow.trigger.event;
      if (!this.triggerIndex.has(event)) {
        this.triggerIndex.set(event, []);
      }
      const flowIds = this.triggerIndex.get(event);
      if (!flowIds.includes(flow.id)) {
        flowIds.push(flow.id);
      }
    }

    return flow;
  }

  /**
   * Actualiza un flujo existente
   */
  async update(flowId, updates) {
    const existing = this.flows.get(flowId);
    if (!existing) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    // Quitar del índice antiguo si cambió el trigger
    if (existing.trigger?.event) {
      const oldFlows = this.triggerIndex.get(existing.trigger.event) || [];
      const index = oldFlows.indexOf(flowId);
      if (index > -1) {
        oldFlows.splice(index, 1);
      }
    }

    // Actualizar
    const updated = {
      ...existing,
      ...updates,
      id: flowId, // No permitir cambiar el ID
      updatedAt: new Date().toISOString()
    };

    this.flows.set(flowId, updated);

    // Re-indexar
    if (updated.trigger?.event) {
      const event = updated.trigger.event;
      if (!this.triggerIndex.has(event)) {
        this.triggerIndex.set(event, []);
      }
      const flowIds = this.triggerIndex.get(event);
      if (!flowIds.includes(flowId)) {
        flowIds.push(flowId);
      }
    }

    return updated;
  }

  /**
   * Elimina un flujo
   */
  async delete(flowId) {
    const flow = this.flows.get(flowId);
    if (!flow) {
      return false;
    }

    // Quitar del índice
    if (flow.trigger?.event) {
      const flowIds = this.triggerIndex.get(flow.trigger.event) || [];
      const index = flowIds.indexOf(flowId);
      if (index > -1) {
        flowIds.splice(index, 1);
      }
    }

    this.flows.delete(flowId);
    return true;
  }

  /**
   * Obtiene un flujo por ID
   */
  get(flowId) {
    return this.flows.get(flowId);
  }

  /**
   * Lista todos los flujos
   */
  getAll() {
    return Array.from(this.flows.values());
  }

  /**
   * Lista flujos de un proyecto específico
   */
  getByProject(projectId) {
    return Array.from(this.flows.values()).filter(f => f._projectId === projectId);
  }

  /**
   * Lista flujos globales (sin proyecto)
   */
  getGlobal() {
    return Array.from(this.flows.values()).filter(f => !f._projectId);
  }

  /**
   * Lista todos los proyectos con flujos
   */
  getProjects() {
    const projects = new Set();
    for (const flow of this.flows.values()) {
      if (flow._projectId) {
        projects.add(flow._projectId);
      }
    }
    return Array.from(projects);
  }

  /**
   * Busca flujos que coincidan con un evento
   */
  findByEvent(eventName) {
    const flowIds = this.triggerIndex.get(eventName) || [];
    return flowIds.map(id => this.flows.get(id)).filter(Boolean);
  }

  /**
   * Busca flujos que coincidan con un evento y datos
   */
  findMatching(eventName, eventData) {
    const flows = this.findByEvent(eventName);

    return flows.filter(flow => {
      // Si no hay filtro, coincide
      if (!flow.trigger?.filter) {
        return true;
      }

      // Verificar cada condición del filtro
      return this.matchesFilter(flow.trigger.filter, eventData);
    });
  }

  /**
   * Verifica si los datos coinciden con un filtro
   */
  matchesFilter(filter, data) {
    for (const [key, expected] of Object.entries(filter)) {
      const actual = this.getNestedValue(data, key);

      // Soporte para operadores
      if (typeof expected === 'object' && expected !== null) {
        // { $eq: value }
        if ('$eq' in expected && actual !== expected.$eq) return false;
        // { $ne: value }
        if ('$ne' in expected && actual === expected.$ne) return false;
        // { $in: [values] }
        if ('$in' in expected && !expected.$in.includes(actual)) return false;
        // { $nin: [values] }
        if ('$nin' in expected && expected.$nin.includes(actual)) return false;
        // { $contains: substring }
        if ('$contains' in expected && !String(actual).includes(expected.$contains)) return false;
        // { $startsWith: prefix }
        if ('$startsWith' in expected && !String(actual).startsWith(expected.$startsWith)) return false;
        // { $endsWith: suffix }
        if ('$endsWith' in expected && !String(actual).endsWith(expected.$endsWith)) return false;
        // { $regex: pattern }
        if ('$regex' in expected && !new RegExp(expected.$regex).test(String(actual))) return false;
        // { $gt: value }
        if ('$gt' in expected && !(actual > expected.$gt)) return false;
        // { $gte: value }
        if ('$gte' in expected && !(actual >= expected.$gte)) return false;
        // { $lt: value }
        if ('$lt' in expected && !(actual < expected.$lt)) return false;
        // { $lte: value }
        if ('$lte' in expected && !(actual <= expected.$lte)) return false;
        // { $exists: boolean }
        if ('$exists' in expected && (actual !== undefined) !== expected.$exists) return false;
      } else {
        // Comparación directa
        if (actual !== expected) return false;
      }
    }

    return true;
  }

  /**
   * Obtiene valor anidado de un objeto
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Guarda un flujo a archivo
   */
  async saveToFile(flowId) {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    const filePath = path.resolve(this.config.flowsPath, `${flowId}.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(flow, null, 2), 'utf-8');

    return filePath;
  }

  /**
   * Habilita/deshabilita un flujo
   */
  setEnabled(flowId, enabled) {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    flow.enabled = enabled;
    return flow;
  }
}

module.exports = FlowRegistry;
