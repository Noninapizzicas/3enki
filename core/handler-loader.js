/**
 * Handler Loader
 *
 * Carga y gestiona handlers de eventos (reemplazo de flow-engine).
 * Soporta handlers globales y por proyecto.
 *
 * Estructura:
 * - handlers/           → Handlers globales (sin project_id)
 * - data/projects/X/handlers/ → Handlers del proyecto X (inyecta project_id: X)
 *
 * @example
 * const loader = new HandlerLoader(eventBus, serviceExecutor, logger);
 * loader.loadGlobal();
 * loader.loadProject('facturas-nonina');
 */

const fs = require('fs');
const path = require('path');

class HandlerLoader {
  constructor(eventBus, serviceExecutor, logger) {
    this.eventBus = eventBus;
    this.executor = serviceExecutor;
    this.logger = logger;

    // Map: "scope:handlerName" -> { handler, unsubscribe, projectId }
    this.handlers = new Map();
  }

  /**
   * Carga handlers globales desde handlers/
   *
   * @param {string} handlersPath - Path al directorio de handlers globales
   */
  loadGlobal(handlersPath = './handlers') {
    this.loadFrom(handlersPath, null);
  }

  /**
   * Carga handlers de un proyecto
   *
   * @param {string} projectId - ID del proyecto
   * @param {string} basePath - Path base de proyectos
   */
  loadProject(projectId, basePath = './data/projects') {
    const handlersPath = path.join(basePath, projectId, 'handlers');

    if (!fs.existsSync(handlersPath)) {
      this.logger?.debug('handlers.project.no-handlers', { projectId });
      return;
    }

    this.loadFrom(handlersPath, projectId);
  }

  /**
   * Descarga handlers de un proyecto
   *
   * @param {string} projectId - ID del proyecto
   */
  unloadProject(projectId) {
    const toRemove = [];

    for (const [key, data] of this.handlers) {
      if (data.projectId === projectId) {
        data.unsubscribe();
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      this.handlers.delete(key);
    }

    this.logger?.info('handlers.project.unloaded', {
      projectId,
      count: toRemove.length
    });
  }

  /**
   * Carga handlers desde un directorio
   *
   * @param {string} dir - Directorio con handlers .js
   * @param {string|null} projectId - ID del proyecto (null = global)
   */
  loadFrom(dir, projectId) {
    if (!fs.existsSync(dir)) {
      this.logger?.warn('handlers.dir.not-found', { dir });
      return;
    }

    const files = fs.readdirSync(dir).filter(f =>
      f.endsWith('.js') && f !== 'index.js'
    );

    let loaded = 0;

    for (const file of files) {
      try {
        const filePath = path.resolve(dir, file);

        // Clear cache para hot-reload
        delete require.cache[filePath];

        const handler = require(filePath);
        this.register(handler, projectId);
        loaded++;
      } catch (error) {
        this.logger?.error('handlers.load.failed', {
          file,
          error: error.message
        });
      }
    }

    this.logger?.info('handlers.loaded', {
      scope: projectId || 'global',
      count: loaded,
      dir
    });
  }

  /**
   * Registra un handler
   *
   * @param {Object} handler - Definición del handler
   * @param {string|null} projectId - ID del proyecto
   */
  register(handler, projectId) {
    const { name, trigger, filter, handle, enabled = true } = handler;

    if (!name || !trigger || !handle) {
      this.logger?.warn('handlers.invalid', {
        name,
        reason: 'Missing name, trigger or handle'
      });
      return;
    }

    if (!enabled) {
      this.logger?.debug('handlers.disabled', { name, projectId });
      return;
    }

    // Crear services con scope del proyecto
    const services = projectId
      ? this.executor.scoped(projectId)
      : { call: (s, a, p, o) => this.executor.call(s, a, p, o) };

    // Suscribirse al evento
    const unsubscribe = this.eventBus.subscribe(trigger, async (event) => {
      // Aplicar filtro si existe
      if (filter && !filter(event)) return;

      const startTime = Date.now();

      try {
        const result = await handle(event, {
          services,
          logger: this.logger,
          projectId
        });

        this.logger?.info('handler.completed', {
          name,
          projectId,
          duration: Date.now() - startTime
        });

        return result;
      } catch (error) {
        this.logger?.error('handler.failed', {
          name,
          projectId,
          error: error.message,
          duration: Date.now() - startTime
        });
      }
    });

    const key = `${projectId || 'global'}:${name}`;
    this.handlers.set(key, { handler, unsubscribe, projectId });
  }

  /**
   * Lista handlers cargados
   *
   * @param {string} scope - Filtrar por scope ('global', projectId, o null para todos)
   * @returns {Array}
   */
  list(scope = null) {
    const result = [];

    for (const [key, data] of this.handlers) {
      if (scope === null || data.projectId === scope || (scope === 'global' && !data.projectId)) {
        result.push({
          name: data.handler.name,
          trigger: data.handler.trigger,
          projectId: data.projectId,
          description: data.handler.description
        });
      }
    }

    return result;
  }

  /**
   * Descarga todos los handlers
   */
  unloadAll() {
    for (const [key, data] of this.handlers) {
      data.unsubscribe();
    }
    this.handlers.clear();
  }

  /**
   * Recarga handlers de un proyecto
   *
   * @param {string} projectId - ID del proyecto
   */
  reloadProject(projectId) {
    this.unloadProject(projectId);
    this.loadProject(projectId);
  }

  /**
   * Estadísticas
   */
  getStats() {
    const stats = { global: 0, byProject: {} };

    for (const [key, data] of this.handlers) {
      if (data.projectId) {
        stats.byProject[data.projectId] = (stats.byProject[data.projectId] || 0) + 1;
      } else {
        stats.global++;
      }
    }

    return stats;
  }
}

module.exports = HandlerLoader;
