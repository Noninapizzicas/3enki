/**
 * Admin Panel Module v2.0.0 — POC2 canonico.
 *
 * Web-based UI para gestionar Event Core. Integra con plugin-manager,
 * ai-agent-framework, prompt-manager via HTTP requests internas (loopback).
 *
 * Eventos publicados (canonicos, reemplazan el viejo 'admin.action' generico):
 *   admin.plugin.toggled, admin.agent.creado, admin.agent.eliminado,
 *   admin.prompt.creado, admin.prompt.actualizado.
 *
 * Cache in-memory de plugins/agents/prompts/modules con refresh on-demand.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const UI_ACTIONS = [
  'dashboard', 'modules', 'plugins', 'plugin-toggle',
  'agents', 'agent-create', 'agent-delete',
  'prompts', 'prompt-get', 'prompt-create', 'prompt-update', 'health'
];

class AdminPanelModule {
  constructor() {
    this.name = 'admin-panel';
    this.version = '2.0.0';

    this.publicPath = path.join(__dirname, 'public');
    this.cache = {
      plugins: [],
      agents: [],
      prompts: [],
      modules: []
    };

    this.core = null;
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.config = {};
    this.coreConfig = {};
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.core = core;
    this.eventBus = core.eventBus;
    this.logger = core.logger;
    this.metrics = core.metrics || null;
    this.config = core.moduleConfig || {};
    this.coreConfig = core.config || {};

    this.logger.info('admin-panel.loading', {
      module: this.name, version: this.version
    });

    await this.refreshAllCaches();

    this.logger.info('admin-panel.loaded', {
      module: this.name, version: this.version,
      ui_url: '/modules/admin-panel/',
      cache_sizes: {
        plugins: this.cache.plugins.length,
        agents: this.cache.agents.length,
        prompts: this.cache.prompts.length,
        modules: this.cache.modules.length
      }
    });
  }

  async onUnload() {
    this.logger?.info?.('admin-panel.unloading', {});
    this.cache = { plugins: [], agents: [], prompts: [], modules: [] };
    this.logger?.info?.('admin-panel.unloaded', {});
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (code === 'EACCES' || code === 'EPERM') return { status: 500, code: 'FILESYSTEM_ERROR' };
    if (/timeout/i.test(msg)) return { status: 504, code: 'TIMEOUT' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/unavailable|ECONNREFUSED|ENOTFOUND/i.test(msg)) return { status: 503, code: 'DEPENDENCY_UNAVAILABLE' };
    return { status: 500, code: 'INTERNAL_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('admin-panel.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.warn?.('admin-panel.publish.failed', {
        event: name, error_message: err.message
      });
    }
    return enriched;
  }

  // ==========================================
  // Bus subscribers
  // ==========================================

  async onPluginLoaded(event) {
    try {
      const data = event?.data || event?.payload || event;
      this.logger.debug('admin-panel.plugin.loaded.received', { plugin: data?.plugin });
      await this.refreshPluginsCache();
    } catch (err) {
      this._handleHandlerError('admin-panel.plugin_loaded.error', err, 'subscribe');
    }
  }

  // ==========================================
  // Cache refresh
  // ==========================================

  async refreshAllCaches() {
    await Promise.all([
      this.refreshPluginsCache(),
      this.refreshAgentsCache(),
      this.refreshPromptsCache(),
      this.refreshModulesCache()
    ]);
  }

  async refreshPluginsCache() {
    try {
      const response = await this._httpRequest('GET', '/modules/plugin-manager/plugins');
      this.cache.plugins = response.plugins || [];
    } catch (err) {
      this.logger.warn('admin-panel.cache.plugins.refresh_failed', {
        error_message: err.message
      });
      this.cache.plugins = [];
    }
  }

  async refreshAgentsCache() {
    try {
      // mock data hasta que se implemente registro de agentes
      this.cache.agents = [
        {
          id: 'agent-1',
          name: 'Code Reviewer',
          status: 'active',
          subscribes: ['git.push'],
          provider: 'deepseek'
        }
      ];
    } catch (err) {
      this.logger.warn('admin-panel.cache.agents.refresh_failed', {
        error_message: err.message
      });
      this.cache.agents = [];
    }
  }

  async refreshPromptsCache() {
    try {
      const response = await this._httpRequest('GET', '/modules/prompt-manager/prompts');
      this.cache.prompts = response.prompts || [];
    } catch (err) {
      this.logger.warn('admin-panel.cache.prompts.refresh_failed', {
        error_message: err.message
      });
      this.cache.prompts = [];
    }
  }

  async refreshModulesCache() {
    try {
      const modulesPath = path.join(process.cwd(), 'modules');
      const moduleDirs = fs.readdirSync(modulesPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      this.cache.modules = [];
      for (const moduleName of moduleDirs) {
        try {
          const moduleJsonPath = path.join(modulesPath, moduleName, 'module.json');
          if (fs.existsSync(moduleJsonPath)) {
            const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));
            this.cache.modules.push({
              name: moduleJson.name,
              version: moduleJson.version,
              description: moduleJson.description,
              ui: moduleJson.ui || null,
              hasAutoUI: !!(moduleJson.ui && moduleJson.ui.enabled)
            });
          }
        } catch (err) {
          this.logger.warn('admin-panel.cache.module_metadata.read_failed', {
            module: moduleName, error_message: err.message
          });
        }
      }
    } catch (err) {
      this.logger.warn('admin-panel.cache.modules.refresh_failed', {
        error_message: err.message
      });
      this.cache.modules = [];
    }
  }

  // ==========================================
  // UI Handlers (canonical shape)
  // ==========================================

  async handleDashboard() {
    try {
      await this.refreshAllCaches();
      return {
        status: 200,
        data: {
          summary: {
            total_modules: this.cache.modules.length,
            total_plugins: this.cache.plugins.length,
            active_agents: this.cache.agents.filter(a => a.status === 'active').length,
            total_prompts: this.cache.prompts.length
          },
          modules: this.cache.modules,
          plugins: this.cache.plugins,
          agents: this.cache.agents,
          prompts: this.cache.prompts
        }
      };
    } catch (err) {
      return this._handleHandlerError('admin-panel.dashboard.error', err);
    }
  }

  async handleListModules() {
    try {
      await this.refreshModulesCache();
      return {
        status: 200,
        data: { modules: this.cache.modules, count: this.cache.modules.length }
      };
    } catch (err) {
      return this._handleHandlerError('admin-panel.list_modules.error', err);
    }
  }

  async handleListPlugins() {
    try {
      await this.refreshPluginsCache();
      return {
        status: 200,
        data: { plugins: this.cache.plugins, count: this.cache.plugins.length }
      };
    } catch (err) {
      return this._handleHandlerError('admin-panel.list_plugins.error', err);
    }
  }

  async handleTogglePlugin(data) {
    try {
      const name = data?.name || data?.params?.name;
      if (!name) {
        this.metrics?.increment?.('admin-panel.errors', { code: 'INVALID_INPUT', kind: 'plugin-toggle' });
        return this._errorResponse(400, 'INVALID_INPUT', 'plugin name required', { field: 'name' });
      }

      const response = await this._httpRequest('POST', `/modules/plugin-manager/plugin/${name}/toggle`);
      await this.refreshPluginsCache();

      await this._publicarEvento('admin.plugin.toggled', {
        plugin: name, project_id: data?.project_id || null
      }, data);

      this.logger.info('admin-panel.plugin.toggled', { plugin: name });
      return { status: 200, data: response };
    } catch (err) {
      return this._handleHandlerError('admin-panel.toggle_plugin.error', err);
    }
  }

  async handleListAgents() {
    try {
      await this.refreshAgentsCache();
      return {
        status: 200,
        data: { agents: this.cache.agents, count: this.cache.agents.length }
      };
    } catch (err) {
      return this._handleHandlerError('admin-panel.list_agents.error', err);
    }
  }

  async handleCreateAgent(data) {
    try {
      const agentData = data?.body || data || {};
      if (!agentData.name) {
        return this._errorResponse(400, 'INVALID_INPUT', 'name required', { field: 'name' });
      }

      // TODO: Implementar creacion via AI Agent Framework. Por ahora mock.
      const newAgent = {
        id: `agent-${Date.now()}`,
        name: agentData.name,
        status: 'inactive',
        subscribes: agentData.subscribes || [],
        provider: agentData.provider || 'deepseek',
        created_at: new Date().toISOString()
      };

      this.cache.agents.push(newAgent);

      await this._publicarEvento('admin.agent.creado', {
        agent_id: newAgent.id,
        agent_name: newAgent.name,
        project_id: data?.project_id || null
      }, data);

      this.logger.info('admin-panel.agent.creado', {
        agent_id: newAgent.id, name: newAgent.name
      });
      return { status: 201, data: newAgent };
    } catch (err) {
      return this._handleHandlerError('admin-panel.create_agent.error', err);
    }
  }

  async handleDeleteAgent(data) {
    try {
      const id = data?.id || data?.params?.id;
      if (!id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'agent id required', { field: 'id' });
      }

      const index = this.cache.agents.findIndex(a => a.id === id);
      if (index === -1) {
        this.metrics?.increment?.('admin-panel.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'agent-delete' });
        this.logger.warn('admin-panel.delete_agent.not_found', { agent_id: id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Agent not found', { agent_id: id });
      }

      this.cache.agents.splice(index, 1);

      await this._publicarEvento('admin.agent.eliminado', {
        agent_id: id, project_id: data?.project_id || null
      }, data);

      this.logger.info('admin-panel.agent.eliminado', { agent_id: id });
      return { status: 200, data: { agent_id: id, deleted: true } };
    } catch (err) {
      return this._handleHandlerError('admin-panel.delete_agent.error', err);
    }
  }

  async handleListPrompts() {
    try {
      await this.refreshPromptsCache();
      return {
        status: 200,
        data: { prompts: this.cache.prompts, count: this.cache.prompts.length }
      };
    } catch (err) {
      return this._handleHandlerError('admin-panel.list_prompts.error', err);
    }
  }

  async handleGetPrompt(data) {
    try {
      const name = data?.name || data?.params?.name;
      if (!name) {
        return this._errorResponse(400, 'INVALID_INPUT', 'prompt name required', { field: 'name' });
      }
      const response = await this._httpRequest('GET', `/modules/prompt-manager/prompt/${name}`);
      return { status: 200, data: response };
    } catch (err) {
      return this._handleHandlerError('admin-panel.get_prompt.error', err);
    }
  }

  async handleCreatePrompt(data) {
    try {
      const promptData = data?.body || data || {};
      if (!promptData.name) {
        return this._errorResponse(400, 'INVALID_INPUT', 'prompt name required', { field: 'name' });
      }

      const response = await this._httpRequest('POST', '/modules/prompt-manager/prompts', promptData);
      await this.refreshPromptsCache();

      await this._publicarEvento('admin.prompt.creado', {
        prompt_name: promptData.name,
        project_id: data?.project_id || null
      }, data);

      this.logger.info('admin-panel.prompt.creado', { prompt_name: promptData.name });
      return { status: 201, data: response };
    } catch (err) {
      return this._handleHandlerError('admin-panel.create_prompt.error', err);
    }
  }

  async handleUpdatePrompt(data) {
    try {
      const name = data?.name || data?.params?.name;
      const promptData = data?.body || data || {};
      if (!name) {
        return this._errorResponse(400, 'INVALID_INPUT', 'prompt name required', { field: 'name' });
      }

      const response = await this._httpRequest('PUT', `/modules/prompt-manager/prompt/${name}`, promptData);
      await this.refreshPromptsCache();

      await this._publicarEvento('admin.prompt.actualizado', {
        prompt_name: name, project_id: data?.project_id || null
      }, data);

      this.logger.info('admin-panel.prompt.actualizado', { prompt_name: name });
      return { status: 200, data: response };
    } catch (err) {
      return this._handleHandlerError('admin-panel.update_prompt.error', err);
    }
  }

  async handleHealth() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        cache_sizes: {
          plugins: this.cache.plugins.length,
          agents: this.cache.agents.length,
          prompts: this.cache.prompts.length,
          modules: this.cache.modules.length
        }
      }
    };
  }

  // ==========================================
  // HTTP loopback helper
  // ==========================================

  _httpRequest(method, requestPath, payload) {
    const port = this.coreConfig.port || 3000;
    return new Promise((resolve, reject) => {
      const body = payload != null ? JSON.stringify(payload) : null;
      const headers = body
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        : {};

      const options = {
        hostname: 'localhost',
        port,
        path: requestPath,
        method,
        headers
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`Invalid JSON response from ${method} ${requestPath}: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      if (body) req.write(body);
      req.end();
    });
  }
}

module.exports = AdminPanelModule;
