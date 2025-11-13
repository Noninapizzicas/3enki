const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Prompt Manager Module
 *
 * Manages AI prompts with versioning, templates, and analytics
 */
class PromptManagerModule {
  constructor() {
    this.prompts = new Map(); // In-memory cache
    this.analytics = new Map(); // Usage analytics
    this.storagePath = null;
    this.config = null;
    this.logger = null;
    this.eventBus = null;
  }

  /**
   * Module lifecycle: onLoad
   */
  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};

    // Setup storage path
    this.storagePath = this.config.storage_path || './data/prompts';
    await this.ensureStorageDirectory();

    // Load existing prompts from disk
    await this.loadPromptsFromDisk();

    this.logger.info('prompt-manager.loaded', {
      prompts_count: this.prompts.size,
      storage_path: this.storagePath
    });
  }

  /**
   * Module lifecycle: onUnload
   */
  async onUnload() {
    // Save analytics before unload
    if (this.config.enable_analytics) {
      await this.saveAnalyticsToDisk();
    }

    this.logger.info('prompt-manager.unloaded', {
      prompts_count: this.prompts.size
    });
  }

  /**
   * Ensure storage directory exists
   */
  async ensureStorageDirectory() {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
    } catch (error) {
      this.logger.error('prompt-manager.storage.error', { error: error.message });
      throw error;
    }
  }

  /**
   * Load prompts from disk
   */
  async loadPromptsFromDisk() {
    try {
      const files = await fs.readdir(this.storagePath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(this.storagePath, file);
        const content = await fs.readFile(filePath, 'utf8');
        const prompt = JSON.parse(content);

        this.prompts.set(prompt.id, prompt);
      }

      this.logger.info('prompt-manager.prompts.loaded', { count: jsonFiles.length });
    } catch (error) {
      this.logger.error('prompt-manager.load.error', { error: error.message });
    }
  }

  /**
   * API Handler: Create Prompt
   */
  async createPrompt(req, res) {
    try {
      const { name, title, description, content, variables, tags, metadata } = req.body;

      // Check if prompt with same name exists
      const existing = Array.from(this.prompts.values()).find(p => p.name === name);
      if (existing) {
        return res.status(409).json({
          error: 'PROMPT_EXISTS',
          message: `Prompt with name '${name}' already exists`
        });
      }

      // Create prompt object
      const prompt = {
        id: this.generateId(),
        name,
        title: title || name,
        description: description || '',
        content,
        variables: variables || [],
        tags: tags || [],
        metadata: metadata || {},
        versions: [
          {
            version: '1.0.0',
            content,
            variables: variables || [],
            created_at: new Date().toISOString(),
            created_by: 'system'
          }
        ],
        current_version: '1.0.0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Save to memory and disk
      this.prompts.set(prompt.id, prompt);
      await this.savePromptToDisk(prompt);

      this.logger.info('prompt-manager.prompt.created', {
        id: prompt.id,
        name: prompt.name
      });

      return res.status(201).json(prompt);
    } catch (error) {
      this.logger.error('prompt-manager.create.error', { error: error.message });
      return res.status(500).json({
        error: 'CREATE_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: List Prompts
   */
  async listPrompts(req, res) {
    try {
      const { tag, search } = req.query;
      let prompts = Array.from(this.prompts.values());

      // Filter by tag
      if (tag) {
        prompts = prompts.filter(p => p.tags && p.tags.includes(tag));
      }

      // Search in name, title, description
      if (search) {
        const searchLower = search.toLowerCase();
        prompts = prompts.filter(p =>
          p.name.toLowerCase().includes(searchLower) ||
          p.title.toLowerCase().includes(searchLower) ||
          (p.description && p.description.toLowerCase().includes(searchLower))
        );
      }

      return res.status(200).json({
        prompts: prompts.map(p => ({
          id: p.id,
          name: p.name,
          title: p.title,
          description: p.description,
          current_version: p.current_version,
          tags: p.tags,
          created_at: p.created_at,
          updated_at: p.updated_at
        })),
        total: prompts.length
      });
    } catch (error) {
      this.logger.error('prompt-manager.list.error', { error: error.message });
      return res.status(500).json({
        error: 'LIST_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Get Prompt
   */
  async getPrompt(req, res) {
    try {
      const { id } = req.params;
      const prompt = this.prompts.get(id);

      if (!prompt) {
        return res.status(404).json({
          error: 'PROMPT_NOT_FOUND',
          message: `Prompt with id '${id}' not found`
        });
      }

      return res.status(200).json(prompt);
    } catch (error) {
      this.logger.error('prompt-manager.get.error', { error: error.message });
      return res.status(500).json({
        error: 'GET_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Update Prompt
   */
  async updatePrompt(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const prompt = this.prompts.get(id);
      if (!prompt) {
        return res.status(404).json({
          error: 'PROMPT_NOT_FOUND',
          message: `Prompt with id '${id}' not found`
        });
      }

      // Check if content changed (new version)
      if (updates.content && updates.content !== prompt.content) {
        const newVersion = this.bumpVersion(prompt.current_version);

        prompt.versions.push({
          version: newVersion,
          content: updates.content,
          variables: updates.variables || prompt.variables,
          created_at: new Date().toISOString(),
          created_by: 'system'
        });

        prompt.current_version = newVersion;
        prompt.content = updates.content;

        // Keep only max versions
        const maxVersions = this.config.max_versions_per_prompt || 10;
        if (prompt.versions.length > maxVersions) {
          prompt.versions = prompt.versions.slice(-maxVersions);
        }
      }

      // Update other fields
      if (updates.title) prompt.title = updates.title;
      if (updates.description) prompt.description = updates.description;
      if (updates.variables) prompt.variables = updates.variables;
      if (updates.tags) prompt.tags = updates.tags;
      if (updates.metadata) prompt.metadata = { ...prompt.metadata, ...updates.metadata };

      prompt.updated_at = new Date().toISOString();

      // Save to disk
      await this.savePromptToDisk(prompt);

      this.logger.info('prompt-manager.prompt.updated', {
        id: prompt.id,
        version: prompt.current_version
      });

      return res.status(200).json(prompt);
    } catch (error) {
      this.logger.error('prompt-manager.update.error', { error: error.message });
      return res.status(500).json({
        error: 'UPDATE_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Delete Prompt
   */
  async deletePrompt(req, res) {
    try {
      const { id } = req.params;

      const prompt = this.prompts.get(id);
      if (!prompt) {
        return res.status(404).json({
          error: 'PROMPT_NOT_FOUND',
          message: `Prompt with id '${id}' not found`
        });
      }

      // Delete from memory and disk
      this.prompts.delete(id);
      await this.deletePromptFromDisk(prompt.id);

      this.logger.info('prompt-manager.prompt.deleted', { id });

      return res.status(200).json({
        success: true,
        message: 'Prompt deleted successfully'
      });
    } catch (error) {
      this.logger.error('prompt-manager.delete.error', { error: error.message });
      return res.status(500).json({
        error: 'DELETE_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: List Versions
   */
  async listVersions(req, res) {
    try {
      const { id } = req.params;

      const prompt = this.prompts.get(id);
      if (!prompt) {
        return res.status(404).json({
          error: 'PROMPT_NOT_FOUND',
          message: `Prompt with id '${id}' not found`
        });
      }

      return res.status(200).json({
        prompt_id: id,
        current_version: prompt.current_version,
        versions: prompt.versions
      });
    } catch (error) {
      this.logger.error('prompt-manager.versions.error', { error: error.message });
      return res.status(500).json({
        error: 'LIST_VERSIONS_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Render Template
   */
  async renderTemplate(req, res) {
    try {
      const { id } = req.params;
      const { variables, version } = req.body;

      const prompt = this.prompts.get(id);
      if (!prompt) {
        return res.status(404).json({
          error: 'PROMPT_NOT_FOUND',
          message: `Prompt with id '${id}' not found`
        });
      }

      // Get specific version or latest
      let content = prompt.content;
      if (version) {
        const versionData = prompt.versions.find(v => v.version === version);
        if (!versionData) {
          return res.status(404).json({
            error: 'VERSION_NOT_FOUND',
            message: `Version '${version}' not found`
          });
        }
        content = versionData.content;
      }

      // Render template
      const rendered = this.renderTemplateString(content, variables);

      // Record analytics
      if (this.config.enable_analytics) {
        this.recordUsage(id, version || prompt.current_version, variables);
      }

      return res.status(200).json({
        prompt_id: id,
        version: version || prompt.current_version,
        rendered,
        variables_used: variables
      });
    } catch (error) {
      this.logger.error('prompt-manager.render.error', { error: error.message });
      return res.status(500).json({
        error: 'RENDER_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Get Analytics
   */
  async getAnalytics(req, res) {
    try {
      const { prompt_id, days } = req.query;
      const retentionDays = parseInt(days) || this.config.analytics_retention_days || 90;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      let analyticsData = Array.from(this.analytics.entries()).map(([key, data]) => ({
        prompt_id: key.split(':')[0],
        version: key.split(':')[1],
        ...data
      }));

      // Filter by prompt_id if provided
      if (prompt_id) {
        analyticsData = analyticsData.filter(a => a.prompt_id === prompt_id);
      }

      // Filter by date
      analyticsData = analyticsData.filter(a =>
        new Date(a.last_used) >= cutoffDate
      );

      return res.status(200).json({
        analytics: analyticsData,
        total: analyticsData.length
      });
    } catch (error) {
      this.logger.error('prompt-manager.analytics.error', { error: error.message });
      return res.status(500).json({
        error: 'ANALYTICS_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Compare Prompts (A/B Testing)
   */
  async comparePrompts(req, res) {
    try {
      const { prompt_a_id, prompt_b_id, metric } = req.body;

      const analyticsA = this.analytics.get(`${prompt_a_id}:*`) || { usage_count: 0 };
      const analyticsB = this.analytics.get(`${prompt_b_id}:*`) || { usage_count: 0 };

      return res.status(200).json({
        prompt_a: {
          id: prompt_a_id,
          ...analyticsA
        },
        prompt_b: {
          id: prompt_b_id,
          ...analyticsB
        },
        comparison: {
          metric: metric || 'usage_count',
          winner: analyticsA.usage_count > analyticsB.usage_count ? 'A' : 'B'
        }
      });
    } catch (error) {
      this.logger.error('prompt-manager.compare.error', { error: error.message });
      return res.status(500).json({
        error: 'COMPARE_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Hook: afterEventReceive
   * Record analytics when AI completion events arrive
   */
  async afterEventReceive(context) {
    if (!this.config.enable_analytics) return context;

    const { event } = context;

    if (event.type && event.type.startsWith('ai.') && event.type.endsWith('.completed')) {
      const { prompt_id, tokens_used, latency_ms, cost } = event.payload || {};

      if (prompt_id) {
        this.recordCompletion(prompt_id, tokens_used, latency_ms, cost);
      }
    }

    return context;
  }

  // ============ HELPER METHODS ============

  /**
   * Generate unique ID
   */
  generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Bump semantic version (patch)
   */
  bumpVersion(version) {
    const [major, minor, patch] = version.split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
  }

  /**
   * Render template string with variables
   */
  renderTemplateString(template, variables) {
    let rendered = template;

    // Replace {{variable}} with values
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      rendered = rendered.replace(regex, String(value));
    }

    return rendered;
  }

  /**
   * Record prompt usage
   */
  recordUsage(promptId, version, variables) {
    const key = `${promptId}:${version}`;

    if (!this.analytics.has(key)) {
      this.analytics.set(key, {
        usage_count: 0,
        first_used: new Date().toISOString(),
        last_used: new Date().toISOString()
      });
    }

    const data = this.analytics.get(key);
    data.usage_count++;
    data.last_used = new Date().toISOString();
  }

  /**
   * Record completion analytics
   */
  recordCompletion(promptId, tokens, latency, cost) {
    const key = `${promptId}:*`;

    if (!this.analytics.has(key)) {
      this.analytics.set(key, {
        usage_count: 0,
        total_tokens: 0,
        total_latency_ms: 0,
        total_cost: 0,
        avg_tokens: 0,
        avg_latency_ms: 0,
        avg_cost: 0
      });
    }

    const data = this.analytics.get(key);
    data.usage_count++;
    data.total_tokens += tokens || 0;
    data.total_latency_ms += latency || 0;
    data.total_cost += cost || 0;

    data.avg_tokens = data.total_tokens / data.usage_count;
    data.avg_latency_ms = data.total_latency_ms / data.usage_count;
    data.avg_cost = data.total_cost / data.usage_count;
  }

  /**
   * Save prompt to disk
   */
  async savePromptToDisk(prompt) {
    const filePath = path.join(this.storagePath, `${prompt.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(prompt, null, 2), 'utf8');
  }

  /**
   * Delete prompt from disk
   */
  async deletePromptFromDisk(promptId) {
    const filePath = path.join(this.storagePath, `${promptId}.json`);
    await fs.unlink(filePath);
  }

  /**
   * Save analytics to disk
   */
  async saveAnalyticsToDisk() {
    const analyticsPath = path.join(this.storagePath, '_analytics.json');
    const analyticsData = Object.fromEntries(this.analytics);
    await fs.writeFile(analyticsPath, JSON.stringify(analyticsData, null, 2), 'utf8');
  }
}

module.exports = PromptManagerModule;
