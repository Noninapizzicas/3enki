const fs = require('fs');
const path = require('path');

/**
 * Admin Panel Module
 * Web-based UI for managing Event Core system
 * Integrates with plugin-manager, ai-agent-framework, prompt-manager
 */
class AdminPanelModule {
  constructor(config, logger, eventBus, coreConfig) {
    this.config = config || {};
    this.logger = logger;
    this.eventBus = eventBus;
    this.coreConfig = coreConfig;

    this.publicPath = path.join(__dirname, 'public');

    // Cache for module data
    this.cache = {
      plugins: [],
      agents: [],
      prompts: [],
      modules: []
    };

    this.logger.info({ module: 'admin-panel' }, 'Admin Panel Module initialized');
  }

  async onLoad() {
    this.logger.info('admin-panel.loading', 'Loading Admin Panel Module');

    // Subscribe to events for cache updates
    this.eventBus.subscribe('plugin.loaded', (data) => {
      this.logger.debug('admin-panel.plugin.loaded', data);
      this.refreshPluginsCache();
    });

    this.eventBus.subscribe('ui.component.loaded', (data) => {
      this.logger.debug('admin-panel.ui.component.loaded', data);
    });

    // Initial cache load
    await this.refreshAllCaches();

    this.logger.info('Admin Panel Module loaded - UI available at /modules/admin-panel/');
  }

  async onUnload() {
    this.logger.info('admin-panel.unloading', 'Unloading Admin Panel Module');
  }

  /**
   * Refresh all caches
   */
  async refreshAllCaches() {
    await Promise.all([
      this.refreshPluginsCache(),
      this.refreshAgentsCache(),
      this.refreshPromptsCache(),
      this.refreshModulesCache()
    ]);
  }

  /**
   * Refresh plugins cache by calling plugin-manager
   */
  async refreshPluginsCache() {
    try {
      const response = await this.httpRequest('GET', '/modules/plugin-manager/plugins');
      this.cache.plugins = response.plugins || [];
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Failed to refresh plugins cache');
      this.cache.plugins = [];
    }
  }

  /**
   * Refresh agents cache
   */
  async refreshAgentsCache() {
    try {
      // For now, return mock data until we implement agent registry
      this.cache.agents = [
        {
          id: 'agent-1',
          name: 'Code Reviewer',
          status: 'active',
          subscribes: ['git.push'],
          provider: 'deepseek'
        }
      ];
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Failed to refresh agents cache');
      this.cache.agents = [];
    }
  }

  /**
   * Refresh prompts cache by calling prompt-manager
   */
  async refreshPromptsCache() {
    try {
      const response = await this.httpRequest('GET', '/modules/prompt-manager/prompts');
      this.cache.prompts = response.prompts || [];
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Failed to refresh prompts cache');
      this.cache.prompts = [];
    }
  }

  /**
   * Refresh modules cache from core
   */
  async refreshModulesCache() {
    try {
      const response = await this.httpRequest('GET', '/core/modules');
      this.cache.modules = response.modules || [];
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Failed to refresh modules cache');
      this.cache.modules = [];
    }
  }

  /**
   * Make HTTP request to internal API
   */
  async httpRequest(method, path) {
    const http = require('http');
    const port = this.coreConfig.port || 3000;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: port,
        path: path,
        method: method
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  /**
   * HTTP API: Serve UI
   */
  async ui(req, res) {
    const indexPath = path.join(this.publicPath, 'index.html');

    if (!fs.existsSync(indexPath)) {
      return res.status(404).send('Admin Panel UI not found');
    }

    const html = fs.readFileSync(indexPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  /**
   * HTTP API: Get dashboard data
   */
  async getDashboardData(req, res) {
    await this.refreshAllCaches();

    res.json({
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
    });
  }

  /**
   * HTTP API: List modules
   */
  async listModules(req, res) {
    await this.refreshModulesCache();
    res.json({
      modules: this.cache.modules,
      count: this.cache.modules.length
    });
  }

  /**
   * HTTP API: List plugins
   */
  async listPlugins(req, res) {
    await this.refreshPluginsCache();
    res.json({
      plugins: this.cache.plugins,
      count: this.cache.plugins.length
    });
  }

  /**
   * HTTP API: Toggle plugin (enable/disable)
   */
  async togglePlugin(req, res) {
    const { name } = req.params;

    try {
      // Forward to plugin-manager
      const response = await this.httpRequest('POST', `/modules/plugin-manager/plugin/${name}/toggle`);

      await this.refreshPluginsCache();

      this.eventBus.publish('admin.action', {
        action: 'plugin.toggle',
        plugin: name,
        timestamp: new Date().toISOString()
      });

      res.json(response);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * HTTP API: List agents
   */
  async listAgents(req, res) {
    await this.refreshAgentsCache();
    res.json({
      agents: this.cache.agents,
      count: this.cache.agents.length
    });
  }

  /**
   * HTTP API: Create agent
   */
  async createAgent(req, res) {
    const agentData = req.body;

    try {
      // TODO: Implement agent creation via AI Agent Framework
      // For now, return mock response
      const newAgent = {
        id: `agent-${Date.now()}`,
        name: agentData.name,
        status: 'inactive',
        subscribes: agentData.subscribes || [],
        provider: agentData.provider || 'deepseek',
        created_at: new Date().toISOString()
      };

      this.cache.agents.push(newAgent);

      this.eventBus.publish('admin.action', {
        action: 'agent.created',
        agent: newAgent.id,
        timestamp: new Date().toISOString()
      });

      res.status(201).json(newAgent);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * HTTP API: Delete agent
   */
  async deleteAgent(req, res) {
    const { id } = req.params;

    try {
      const index = this.cache.agents.findIndex(a => a.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      this.cache.agents.splice(index, 1);

      this.eventBus.publish('admin.action', {
        action: 'agent.deleted',
        agent: id,
        timestamp: new Date().toISOString()
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * HTTP API: List prompts
   */
  async listPrompts(req, res) {
    await this.refreshPromptsCache();
    res.json({
      prompts: this.cache.prompts,
      count: this.cache.prompts.length
    });
  }

  /**
   * HTTP API: Get single prompt
   */
  async getPrompt(req, res) {
    const { name } = req.params;

    try {
      const response = await this.httpRequest('GET', `/modules/prompt-manager/prompt/${name}`);
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * HTTP API: Create prompt
   */
  async createPrompt(req, res) {
    const promptData = req.body;

    try {
      // Forward to prompt-manager
      const response = await this.httpPostRequest('/modules/prompt-manager/prompts', promptData);

      await this.refreshPromptsCache();

      this.eventBus.publish('admin.action', {
        action: 'prompt.created',
        prompt: promptData.name,
        timestamp: new Date().toISOString()
      });

      res.status(201).json(response);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * HTTP API: Update prompt
   */
  async updatePrompt(req, res) {
    const { name } = req.params;
    const promptData = req.body;

    try {
      // Forward to prompt-manager
      const response = await this.httpPutRequest(`/modules/prompt-manager/prompt/${name}`, promptData);

      await this.refreshPromptsCache();

      this.eventBus.publish('admin.action', {
        action: 'prompt.updated',
        prompt: name,
        timestamp: new Date().toISOString()
      });

      res.json(response);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Helper: POST request
   */
  async httpPostRequest(path, data) {
    const http = require('http');
    const port = this.coreConfig.port || 3000;

    return new Promise((resolve, reject) => {
      const body = JSON.stringify(data);

      const options = {
        hostname: 'localhost',
        port: port,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = http.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Helper: PUT request
   */
  async httpPutRequest(path, data) {
    const http = require('http');
    const port = this.coreConfig.port || 3000;

    return new Promise((resolve, reject) => {
      const body = JSON.stringify(data);

      const options = {
        hostname: 'localhost',
        port: port,
        path: path,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = http.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(body);
      req.end();
    });
  }
}

module.exports = AdminPanelModule;
