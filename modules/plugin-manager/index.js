const fs = require('fs');
const path = require('path');

class PluginManagerModule {
  constructor(config, { logger, eventBus, metrics }) {
    this.logger = logger.child({ module: 'plugin-manager' });
    this.eventBus = eventBus;
    this.metrics = metrics;
    this.config = config;
    this.plugins = new Map(); // Stores loaded plugin definitions
    this.pluginsPath = path.resolve(__dirname, config.plugins_path || '../../plugins');
    this.watchInterval = null;
  }

  async onLoad() {
    this.logger.info('Plugin Manager module loaded');
    await this.discoverAndLoadPlugins();

    // Setup auto-reload if enabled
    if (this.config.auto_reload) {
      this.startWatching();
    }
  }

  async onUnload() {
    this.logger.info('Plugin Manager module unloading');
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
    this.plugins.clear();
  }

  /**
   * Starts watching the plugins directory for changes
   */
  startWatching() {
    const interval = this.config.watch_interval || 5000;
    this.logger.info({ interval }, 'Starting plugin directory watch');

    this.watchInterval = setInterval(() => {
      this.discoverAndLoadPlugins();
    }, interval);
  }

  /**
   * Discovers and loads all plugins from the plugins directory
   */
  async discoverAndLoadPlugins() {
    this.logger.info({ pluginsPath: this.pluginsPath }, 'Scanning for plugins');

    try {
      if (!fs.existsSync(this.pluginsPath)) {
        this.logger.warn({ pluginsPath: this.pluginsPath }, 'Plugins directory does not exist. Creating it.');
        fs.mkdirSync(this.pluginsPath, { recursive: true });
        return;
      }

      const pluginDirs = fs.readdirSync(this.pluginsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      let loadedCount = 0;
      let errorCount = 0;

      for (const dirName of pluginDirs) {
        const pluginDirPath = path.join(this.pluginsPath, dirName);
        const files = fs.readdirSync(pluginDirPath);
        const definitionFile = files.find(f => f.endsWith('.functions.json'));

        if (definitionFile) {
          const filePath = path.join(pluginDirPath, definitionFile);
          const success = await this.loadPluginFromFile(filePath);
          if (success) {
            loadedCount++;
          } else {
            errorCount++;
          }
        }
      }

      this.logger.info({
        total: this.plugins.size,
        loaded: loadedCount,
        errors: errorCount
      }, 'Plugin discovery completed');

      this.metrics.gauge('plugins.loaded.total', this.plugins.size);

    } catch (error) {
      this.logger.error({ err: error }, 'Failed to discover or load plugins');
      this.eventBus.publish('plugin.error', {
        error: error.message,
        context: 'discovery'
      });
    }
  }

  /**
   * Loads a plugin from a JSON file
   * @param {string} filePath - Path to the plugin JSON file
   * @returns {boolean} - True if successful, false otherwise
   */
  async loadPluginFromFile(filePath) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const pluginDef = JSON.parse(fileContent);

      // Validate plugin structure
      if (!pluginDef.metadata || !pluginDef.metadata.name || !pluginDef.functions) {
        this.logger.error({ file: filePath }, 'Invalid plugin definition: missing metadata, name, or functions');
        this.eventBus.publish('plugin.error', {
          file: filePath,
          error: 'Invalid structure'
        });
        return false;
      }

      const pluginName = pluginDef.metadata.name;

      // Check if plugin already exists
      if (this.plugins.has(pluginName)) {
        this.logger.debug({ pluginName }, 'Plugin already loaded, skipping');
        return true;
      }

      // Store plugin definition
      this.plugins.set(pluginName, pluginDef);

      this.logger.info({
        pluginName,
        file: filePath,
        functionCount: Object.keys(pluginDef.functions).length
      }, 'Plugin loaded successfully');

      // Publish plugin.loaded event
      this.eventBus.publish('plugin.loaded', {
        name: pluginName,
        metadata: pluginDef.metadata,
        functions: Object.keys(pluginDef.functions),
        definition: pluginDef
      });

      this.metrics.increment('plugins.loaded.count', 1);
      return true;

    } catch (error) {
      this.logger.error({ err: error, file: filePath }, 'Failed to load plugin from file');
      this.eventBus.publish('plugin.error', {
        file: filePath,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Returns the definition of a specific plugin
   * @param {string} pluginName - The name of the plugin
   * @returns {object | undefined} - The plugin definition or undefined if not found
   */
  getPlugin(pluginName) {
    return this.plugins.get(pluginName);
  }

  /**
   * Returns all loaded plugin definitions
   * @returns {Map<string, object>} - A map of all loaded plugins
   */
  getAllPlugins() {
    return this.plugins;
  }

  /**
   * Reloads all plugins from disk
   */
  async reloadPlugins() {
    this.logger.info('Reloading all plugins');
    this.plugins.clear();
    await this.discoverAndLoadPlugins();
  }

  // ========================================================================
  // HTTP API Handlers
  // ========================================================================

  /**
   * GET /plugin/:name - Get a specific plugin
   */
  async handleGetPlugin(req, res) {
    const pluginName = req.params.name;
    const plugin = this.getPlugin(pluginName);

    if (!plugin) {
      return res.status(404).json({
        success: false,
        error: `Plugin '${pluginName}' not found`
      });
    }

    res.json({
      success: true,
      plugin
    });
  }

  /**
   * GET /plugins - List all plugins
   */
  async handleListPlugins(req, res) {
    const pluginsList = Array.from(this.plugins.entries()).map(([name, def]) => ({
      name,
      description: def.metadata.description || '',
      version: def.metadata.version || '1.0.0',
      functions: Object.keys(def.functions),
      function_count: Object.keys(def.functions).length
    }));

    res.json({
      success: true,
      count: pluginsList.length,
      plugins: pluginsList
    });
  }

  /**
   * POST /plugins/reload - Reload all plugins
   */
  async handleReloadPlugins(req, res) {
    try {
      await this.reloadPlugins();

      res.json({
        success: true,
        message: 'Plugins reloaded successfully',
        count: this.plugins.size
      });
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to reload plugins');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = PluginManagerModule;
