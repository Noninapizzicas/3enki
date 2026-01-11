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
  }

  async initialize() {
    // Cargar flujos desde archivos si está configurado
    if (this.config.autoLoadFlows) {
      await this.loadFromDirectory(this.config.flowsPath);
    }

    this.logger.info('flow-registry.initialized', {
      flows_count: this.flows.size
    });
  }

  /**
   * Carga flujos desde un directorio
   */
  async loadFromDirectory(dirPath) {
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

        await this.register(flow);

        this.logger.info('flow-registry.flow.loaded', {
          flowId: flow.id,
          file
        });
      } catch (error) {
        this.logger.error('flow-registry.flow.load_error', {
          file,
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
