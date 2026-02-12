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

const { EVENTS } = require('../../core/constants');

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
    this.unsubscribes = [];
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

    // ==================== EventBus Subscriptions ====================

    const subscriptions = [
      [EVENTS.DB.QUERY_RESPONSE, this.onDbQueryResponse],
      [EVENTS.PROJECT.GET_REQUEST, this.onGetProjectRequest],
      [EVENTS.PROJECT.LIST_REQUEST, this.onListProjectsRequest],
      ['project.active.request', this.onGetActiveProjectRequest],
      ['project/state/request', this.onProjectStateRequest],
      ['project/create', this.onProjectCreate],
      ['project/update', this.onProjectUpdate],
      ['project/delete', this.onProjectDelete],
      ['project/activate', this.onProjectActivate],
      ['context.full.request', this.onContextFullRequest]
    ];

    for (const [topic, handler] of subscriptions) {
      const unsub = await this.eventBus.subscribe(topic, handler.bind(this));
      this.unsubscribes.push(unsub);
    }

    this.logger.info('project-manager.eventbus.subscribed', {
      topics: subscriptions.map(([t]) => t)
    });

    // ==================== UI Request/Response Handlers ====================

    if (this.uiHandler) {
      // Project CRUD
      this.uiHandler.register('project', 'list', this.handleUIList.bind(this));
      this.uiHandler.register('project', 'get', this.handleUIGet.bind(this));
      this.uiHandler.register('project', 'create', this.handleUICreate.bind(this));
      this.uiHandler.register('project', 'update', this.handleUIUpdate.bind(this));
      this.uiHandler.register('project', 'delete', this.handleUIDelete.bind(this));
      this.uiHandler.register('project', 'activate', this.handleUIActivate.bind(this));
      this.uiHandler.register('project', 'deactivate', this.handleUIDeactivate.bind(this));

      // Features / Blueprints
      this.uiHandler.register('project', 'add-features', this.handleUIAddFeatures.bind(this));
      this.uiHandler.register('project', 'list-features', this.handleUIListFeatures.bind(this));

      // Session & AI Config
      this.uiHandler.register('project', 'saveSession', this.handleUISaveSession.bind(this));
      this.uiHandler.register('project', 'restoreSession', this.handleUIRestoreSession.bind(this));
      this.uiHandler.register('project', 'setAIConfig', this.handleUISetAIConfig.bind(this));
      this.uiHandler.register('project', 'setLastConversation', this.handleUISetLastConversation.bind(this));

      // Composition (Phase 1)
      this.uiHandler.register('project', 'link', this.handleUILink.bind(this));
      this.uiHandler.register('project', 'unlink', this.handleUIUnlink.bind(this));
      this.uiHandler.register('project', 'getLinks', this.handleUIGetLinks.bind(this));
      this.uiHandler.register('project', 'getRelated', this.handleUIGetRelated.bind(this));

      // Dependencies (Phase 2)
      this.uiHandler.register('project', 'addDependency', this.handleUIAddDependency.bind(this));
      this.uiHandler.register('project', 'removeDependency', this.handleUIRemoveDependency.bind(this));
      this.uiHandler.register('project', 'getDependencies', this.handleUIGetDependencies.bind(this));
      this.uiHandler.register('project', 'getDependents', this.handleUIGetDependents.bind(this));

      // Systems (Phase 3)
      this.uiHandler.register('system', 'create', this.handleUISystemCreate.bind(this));
      this.uiHandler.register('system', 'list', this.handleUISystemList.bind(this));
      this.uiHandler.register('system', 'get', this.handleUISystemGet.bind(this));
      this.uiHandler.register('system', 'update', this.handleUISystemUpdate.bind(this));
      this.uiHandler.register('system', 'delete', this.handleUISystemDelete.bind(this));
      this.uiHandler.register('system', 'addProject', this.handleUISystemAddProject.bind(this));
      this.uiHandler.register('system', 'removeProject', this.handleUISystemRemoveProject.bind(this));
      this.uiHandler.register('system', 'getUnassigned', this.handleUISystemGetUnassigned.bind(this));

      // Context (Phase 4)
      this.uiHandler.register('context', 'import', this.handleUIContextImport.bind(this));
      this.uiHandler.register('context', 'remove', this.handleUIContextRemove.bind(this));
      this.uiHandler.register('context', 'getShared', this.handleUIContextGetShared.bind(this));
      this.uiHandler.register('context', 'getExported', this.handleUIContextGetExported.bind(this));
      this.uiHandler.register('context', 'getSources', this.handleUIContextGetSources.bind(this));
      this.uiHandler.register('context', 'getFull', this.handleUIContextGetFull.bind(this));

      this.logger.info('project-manager.ui_handlers.registered');
    }

    // ==================== Initialization ====================

    await this.loadExistingProjects();
    await this.ensureSystemProject();

    this.logger.info('project-manager.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info({ correlationId: 'system' }, 'Project Manager module unloading');

    // Unregister UI handlers
    if (this.uiHandler) {
      const uiRegistrations = [
        ['project', 'list'], ['project', 'get'], ['project', 'create'],
        ['project', 'update'], ['project', 'delete'], ['project', 'activate'],
        ['project', 'deactivate'], ['project', 'add-features'], ['project', 'list-features'],
        ['project', 'saveSession'], ['project', 'restoreSession'],
        ['project', 'setAIConfig'], ['project', 'setLastConversation'],
        ['project', 'link'], ['project', 'unlink'],
        ['project', 'getLinks'], ['project', 'getRelated'],
        ['project', 'addDependency'], ['project', 'removeDependency'],
        ['project', 'getDependencies'], ['project', 'getDependents'],
        ['system', 'create'], ['system', 'list'], ['system', 'get'],
        ['system', 'update'], ['system', 'delete'],
        ['system', 'addProject'], ['system', 'removeProject'], ['system', 'getUnassigned'],
        ['context', 'import'], ['context', 'remove'],
        ['context', 'getShared'], ['context', 'getExported'],
        ['context', 'getSources'], ['context', 'getFull']
      ];

      for (const [domain, action] of uiRegistrations) {
        this.uiHandler.unregister(domain, action);
      }
    }

    // Unsubscribe all eventBus subscriptions
    for (const unsub of this.unsubscribes) {
      await unsub();
    }
    this.unsubscribes = [];

    // Clear pending requests
    for (const [requestId, pending] of this.pendingDbRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Module unloading'));
    }
    this.pendingDbRequests.clear();

    this.logger.info({ correlationId: 'system' }, 'Project Manager module unloaded');
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
