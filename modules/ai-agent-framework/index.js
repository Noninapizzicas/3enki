const Agent = require('./agent');
const ContextManager = require('./context-manager');
const ToolManager = require('./tool-manager');
const fs = require('fs').promises;
const path = require('path');

/**
 * AI Agent Framework Module
 *
 * Orquesta agentes IA event-driven con:
 * - Context management (memoria)
 * - Tool calling (acceso a APIs)
 * - Agent registry (descubrimiento)
 * - Orchestration (coordinación)
 */
class AIAgentFrameworkModule {
  constructor() {
    this.agents = new Map(); // Map<agentId, Agent>
    this.contextManager = null;
    this.toolManager = null;
    this.config = null;
    this.logger = null;
    this.eventBus = null;

    // Dependencies
    this.promptManager = null;
    this.aiGateway = null;
  }

  /**
   * Module lifecycle: onLoad
   */
  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};

    // Initialize Context Manager
    this.contextManager = new ContextManager(
      this.config.context || {},
      this.logger
    );
    await this.contextManager.initialize();

    // Initialize Tool Manager
    this.toolManager = new ToolManager(
      this.config.tools || {},
      this.logger,
      context.config
    );
    await this.toolManager.initialize();
    this.toolManager.setEventBus(this.eventBus);

    // Get dependencies from other modules
    await this.resolveDependencies(context);

    // Load agents from disk
    await this.loadAgentsFromDisk();

    this.logger.info('ai-agent-framework.loaded', {
      agents_count: this.agents.size,
      tools_count: this.toolManager.tools.size
    });
  }

  /**
   * Module lifecycle: onUnload
   */
  async onUnload() {
    // Shutdown context manager
    if (this.contextManager) {
      await this.contextManager.shutdown();
    }

    // Save agents to disk
    await this.saveAgentsToDisk();

    this.logger.info('ai-agent-framework.unloaded', {
      agents_count: this.agents.size
    });
  }

  /**
   * Resolve dependencies (Prompt Manager, AI Gateway)
   */
  async resolveDependencies(context) {
    // These will be injected by the core or accessed via HTTP
    // For now, we'll create lightweight wrappers

    this.promptManager = {
      renderTemplate: async (promptId, variables) => {
        return this.callModuleAPI('prompt-manager', 'POST', `/prompts/${promptId}/render`, {
          variables
        });
      }
    };

    this.aiGateway = {
      chatCompletion: async (params) => {
        return this.callModuleAPI('ai-gateway', 'POST', '/chat', params);
      }
    };
  }

  /**
   * Call another module's API
   */
  async callModuleAPI(moduleName, method, path, body = null) {
    const http = require('http');
    const baseUrl = process.env.CORE_URL || 'http://localhost:3000';
    const url = `${baseUrl}/modules/${moduleName}${path}`;

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const options = {
        method,
        hostname: urlObj.hostname,
        port: urlObj.port || 3000,
        path: urlObj.pathname,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Load agents from disk
   */
  async loadAgentsFromDisk() {
    const agentsDir = path.join(__dirname, 'agents');

    try {
      await fs.mkdir(agentsDir, { recursive: true });

      const files = await fs.readdir(agentsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(agentsDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const agentData = JSON.parse(content);

          const agent = Agent.fromJSON(agentData);
          await this.registerAgent(agent);
        } catch (error) {
          this.logger.error('ai-agent-framework.load-agent.failed', {
            file,
            error: error.message
          });
        }
      }

      this.logger.info('ai-agent-framework.agents.loaded', {
        count: this.agents.size
      });
    } catch (error) {
      this.logger.warn('ai-agent-framework.load-agents.failed', {
        error: error.message
      });
    }
  }

  /**
   * Save agents to disk
   */
  async saveAgentsToDisk() {
    const agentsDir = path.join(__dirname, 'agents');

    try {
      await fs.mkdir(agentsDir, { recursive: true });

      for (const [agentId, agent] of this.agents.entries()) {
        const filePath = path.join(agentsDir, `${agentId}.json`);
        await fs.writeFile(filePath, JSON.stringify(agent.toJSON(), null, 2), 'utf8');
      }

      this.logger.info('ai-agent-framework.agents.saved', {
        count: this.agents.size
      });
    } catch (error) {
      this.logger.error('ai-agent-framework.save-agents.failed', {
        error: error.message
      });
    }
  }

  /**
   * Register agent
   */
  async registerAgent(agent) {
    // Initialize agent with dependencies
    await agent.initialize({
      logger: this.logger,
      eventBus: this.eventBus,
      contextManager: this.contextManager,
      toolManager: this.toolManager,
      promptManager: this.promptManager,
      aiGateway: this.aiGateway
    });

    this.agents.set(agent.id, agent);

    this.logger.info('ai-agent-framework.agent.registered', {
      agent_id: agent.id,
      name: agent.name
    });
  }

  /**
   * API Handler: Register Agent
   */
  async handleRegisterAgent(req, res) {
    try {
      const agentConfig = req.body;

      // Validate
      if (!agentConfig.name) {
        return res.status(400).json({
          error: 'INVALID_CONFIG',
          message: 'Agent name is required'
        });
      }

      // Check if agent with same name exists
      const existing = Array.from(this.agents.values()).find(a => a.name === agentConfig.name);
      if (existing) {
        return res.status(409).json({
          error: 'AGENT_EXISTS',
          message: `Agent with name '${agentConfig.name}' already exists`
        });
      }

      // Create agent
      const agent = new Agent(agentConfig);
      await this.registerAgent(agent);

      // Save to disk
      await this.saveAgentsToDisk();

      return res.status(201).json(agent.toJSON());
    } catch (error) {
      this.logger.error('ai-agent-framework.register.error', {
        error: error.message
      });

      return res.status(500).json({
        error: 'REGISTER_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: List Agents
   */
  async handleListAgents(req, res) {
    try {
      const { enabled } = req.query;

      let agents = Array.from(this.agents.values());

      // Filter by enabled status
      if (enabled !== undefined) {
        const isEnabled = enabled === 'true';
        agents = agents.filter(a => a.enabled === isEnabled);
      }

      return res.status(200).json({
        agents: agents.map(a => a.toJSON()),
        total: agents.length
      });
    } catch (error) {
      this.logger.error('ai-agent-framework.list.error', {
        error: error.message
      });

      return res.status(500).json({
        error: 'LIST_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Get Agent
   */
  async handleGetAgent(req, res) {
    try {
      const { id } = req.params;

      const agent = this.agents.get(id);

      if (!agent) {
        return res.status(404).json({
          error: 'AGENT_NOT_FOUND',
          message: `Agent '${id}' not found`
        });
      }

      return res.status(200).json(agent.toJSON());
    } catch (error) {
      this.logger.error('ai-agent-framework.get.error', {
        error: error.message
      });

      return res.status(500).json({
        error: 'GET_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Update Agent
   */
  async handleUpdateAgent(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const agent = this.agents.get(id);

      if (!agent) {
        return res.status(404).json({
          error: 'AGENT_NOT_FOUND',
          message: `Agent '${id}' not found`
        });
      }

      // Update fields
      if (updates.description !== undefined) agent.description = updates.description;
      if (updates.prompt_id !== undefined) agent.prompt_id = updates.prompt_id;
      if (updates.provider !== undefined) agent.provider = updates.provider;
      if (updates.model !== undefined) agent.model = updates.model;
      if (updates.temperature !== undefined) agent.temperature = updates.temperature;
      if (updates.max_tokens !== undefined) agent.max_tokens = updates.max_tokens;
      if (updates.subscribes !== undefined) agent.subscribes = updates.subscribes;
      if (updates.tools !== undefined) agent.tools = updates.tools;
      if (updates.enabled !== undefined) agent.enabled = updates.enabled;
      if (updates.metadata !== undefined) agent.metadata = { ...agent.metadata, ...updates.metadata };

      agent.updated_at = new Date().toISOString();

      // Save to disk
      await this.saveAgentsToDisk();

      return res.status(200).json(agent.toJSON());
    } catch (error) {
      this.logger.error('ai-agent-framework.update.error', {
        error: error.message
      });

      return res.status(500).json({
        error: 'UPDATE_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Delete Agent
   */
  async handleDeleteAgent(req, res) {
    try {
      const { id } = req.params;

      const agent = this.agents.get(id);

      if (!agent) {
        return res.status(404).json({
          error: 'AGENT_NOT_FOUND',
          message: `Agent '${id}' not found`
        });
      }

      // Remove agent
      this.agents.delete(id);

      // Delete from disk
      const filePath = path.join(__dirname, 'agents', `${id}.json`);
      try {
        await fs.unlink(filePath);
      } catch {}

      // Clear context
      await this.contextManager.clearContext(id);

      return res.status(200).json({
        success: true,
        message: 'Agent deleted successfully'
      });
    } catch (error) {
      this.logger.error('ai-agent-framework.delete.error', {
        error: error.message
      });

      return res.status(500).json({
        error: 'DELETE_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Trigger Agent
   */
  async handleTriggerAgent(req, res) {
    try {
      const { id } = req.params;
      const { payload } = req.body;

      const agent = this.agents.get(id);

      if (!agent) {
        return res.status(404).json({
          error: 'AGENT_NOT_FOUND',
          message: `Agent '${id}' not found`
        });
      }

      // Create synthetic event
      const event = {
        type: 'agent.manual.trigger',
        payload: payload || {},
        timestamp: new Date().toISOString()
      };

      // Execute agent
      const result = await agent.handleEvent(event);

      return res.status(200).json({
        agent_id: id,
        agent_name: agent.name,
        result
      });
    } catch (error) {
      this.logger.error('ai-agent-framework.trigger.error', {
        error: error.message
      });

      return res.status(500).json({
        error: 'TRIGGER_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Get Context
   */
  async handleGetContext(req, res) {
    try {
      const { id } = req.params;

      const agent = this.agents.get(id);

      if (!agent) {
        return res.status(404).json({
          error: 'AGENT_NOT_FOUND',
          message: `Agent '${id}' not found`
        });
      }

      const context = await this.contextManager.getContext(id);

      return res.status(200).json(context);
    } catch (error) {
      this.logger.error('ai-agent-framework.get-context.error', {
        error: error.message
      });

      return res.status(500).json({
        error: 'GET_CONTEXT_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Clear Context
   */
  async handleClearContext(req, res) {
    try {
      const { id } = req.params;

      const agent = this.agents.get(id);

      if (!agent) {
        return res.status(404).json({
          error: 'AGENT_NOT_FOUND',
          message: `Agent '${id}' not found`
        });
      }

      await this.contextManager.clearContext(id);

      return res.status(200).json({
        success: true,
        message: 'Context cleared successfully'
      });
    } catch (error) {
      this.logger.error('ai-agent-framework.clear-context.error', {
        error: error.message
      });

      return res.status(500).json({
        error: 'CLEAR_CONTEXT_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: List Tools
   */
  async handleListTools(req, res) {
    try {
      const tools = this.toolManager.listTools();

      return res.status(200).json({
        tools,
        total: tools.length
      });
    } catch (error) {
      this.logger.error('ai-agent-framework.list-tools.error', {
        error: error.message
      });

      return res.status(500).json({
        error: 'LIST_TOOLS_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Get Agent Stats
   */
  async handleGetAgentStats(req, res) {
    try {
      const { id } = req.params;

      const agent = this.agents.get(id);

      if (!agent) {
        return res.status(404).json({
          error: 'AGENT_NOT_FOUND',
          message: `Agent '${id}' not found`
        });
      }

      return res.status(200).json({
        agent_id: id,
        agent_name: agent.name,
        stats: agent.stats
      });
    } catch (error) {
      this.logger.error('ai-agent-framework.get-stats.error', {
        error: error.message
      });

      return res.status(500).json({
        error: 'GET_STATS_FAILED',
        message: error.message
      });
    }
  }
}

module.exports = AIAgentFrameworkModule;
