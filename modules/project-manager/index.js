/**
 * Project Manager Module
 *
 * Event-driven project lifecycle management with database integration.
 *
 * Architecture:
 * - index.js        → Shell: constructor, onLoad (wiring), onUnload (cleanup)
 * - lib/helpers.js  → slugify, toUIFormat, publishUIState
 * - lib/directories.js → createDirs, deleteDirs, blueprint, schema init
 * - lib/db.js       → queryDatabase, loadExistingProjects, ensureSystemProject, migration
 * - lib/crud.js     → create, update, delete, activate, get, list
 * - lib/session.js  → saveSession, restoreSession, setAIConfig, setLastConversation
 * - lib/composition.js → links (phase 1) + dependencies (phase 2)
 * - lib/systems.js  → systems (phase 3)
 * - lib/context.js  → shared context (phase 4)
 * - lib/features.js → blueprint features (add-features, list-features)
 * - lib/http-handlers.js → HTTP API adapter
 * - lib/ui-handlers.js   → UI MQTT adapter
 * - lib/event-handlers.js → EventBus adapter
 *
 * Principio: el módulo DICE (contrato en module.json),
 * la lógica HACE (en lib/).
 */

const fs = require('fs');
const path = require('path');

// Business logic (mixed into prototype)
const helpers = require('./lib/helpers');
const directories = require('./lib/directories');
const db = require('./lib/db');
const crud = require('./lib/crud');
const session = require('./lib/session');
const composition = require('./lib/composition');
const systems = require('./lib/systems');
const context = require('./lib/context');
const features = require('./lib/features');

// Adapter layers (mixed into prototype)
const httpHandlers = require('./lib/http-handlers');
const uiHandlers = require('./lib/ui-handlers');
const eventHandlers = require('./lib/event-handlers');

class ProjectManagerModule {
  constructor() {
    this.name = 'project-manager';
    this.version = '2.0.0';

    // Dependencies (injected in onLoad)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.uiHandler = null;
    this.config = null;

    // State
    this.projects = new Map();
    this.activeProjectId = null;
    this.pendingDbRequests = new Map();
    this.projectsBasePath = path.join(process.cwd(), 'data', 'projects');
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    // Load config: module.json defaults + core overrides
    try {
      const moduleJsonPath = path.join(__dirname, 'module.json');
      const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));
      const moduleConfig = moduleJson.config || {};

      const coreConfig = core.config || {};
      this.config = { ...moduleConfig };
      for (const [key, value] of Object.entries(coreConfig)) {
        if (value !== undefined && value !== null) {
          this.config[key] = value;
        }
      }
    } catch (err) {
      this.logger.warn('project-manager.config.load.error', { error: err.message });
      this.config = core.config || {};
    }

    this.logger.info('project-manager.loading', { module: this.name, configLoaded: !!this.config.defaultSchema });

    // ==================== Initialization ====================

    await this.initializeSystemSchema();
    await this.loadExistingProjects();
    await this.ensureSystemProject();

    this.logger.info('project-manager.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info('project-manager.unloading', { correlationId: 'system' });

    // Clear pending DB requests (module-specific state)
    for (const [requestId, pending] of this.pendingDbRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Module unloading'));
    }
    this.pendingDbRequests.clear();

    this.logger.info('project-manager.unloaded', { correlationId: 'system' });
  }
}

// Mix in all methods from lib/ modules
Object.assign(ProjectManagerModule.prototype,
  helpers,
  directories,
  db,
  crud,
  session,
  composition,
  systems,
  context,
  features,
  httpHandlers,
  uiHandlers,
  eventHandlers
);

module.exports = ProjectManagerModule;
