/**
 * Auto-UI Engine v2.0 - Main Orchestrator
 *
 * Sistema completo de generación de UIs declarativas
 */

const { UI } = require('../../core/constants');
const path = require('path');
const fs = require('fs');
const Loader = require('./loader');
const Generator = require('./generator');
const GeneratorV2 = require('./generator-v2');
const Bridge = require('./bridge');

// New v2 systems
const ComponentSystem = require('./component-system');
const Resolver = require('./resolver');
const LayoutEngine = require('./layout-engine');
const WidgetFactory = require('./widget-factory');
const Validator = require('./validator');
const PermissionSystem = require('./permission-system');
const Composer = require('./composer');

class AutoUIv2 {
  constructor(options = {}) {
    this.modulesPath = options.modulesPath;
    this.mqttClient = options.mqttClient;
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;

    // Config
    this.config = {
      enablePermissions: options.enablePermissions !== false,
      enableValidation: options.enableValidation !== false,
      enableCaching: options.enableCaching !== false,
      ...options.config
    };

    // Initialize legacy systems (for backward compatibility)
    this.loader = new Loader({
      modulesPath: this.modulesPath,
      logger: this.logger
    });

    // Legacy generator for backward compatibility
    this.generatorLegacy = new Generator({
      loader: this.loader,
      logger: this.logger
    });

    this.bridge = new Bridge({
      mqttClient: this.mqttClient,
      eventBus: this.eventBus,
      logger: this.logger
    });

    // Initialize new v2 systems
    this.initializeV2Systems();

    // V2 Generator with ComponentSystem integration
    this.generator = new GeneratorV2({
      loader: this.loader,
      componentSystem: this.componentSystem,
      widgetFactory: this.widgetFactory,
      logger: this.logger
    });

    // State
    this.initialized = false;
    this.version = '2.0.0';
  }

  // ==========================================
  // V2 Systems Initialization
  // ==========================================

  initializeV2Systems() {
    // Component System
    this.componentSystem = new ComponentSystem({
      logger: this.logger,
      cacheSize: this.config.componentCacheSize || 200
    });

    // Resolver
    this.resolver = new Resolver({
      logger: this.logger,
      eventBus: this.eventBus,
      cacheTTL: this.config.resolverCacheTTL || 60000
    });

    // Register data sources
    this.registerDataSources();

    // Layout Engine
    this.layoutEngine = new LayoutEngine({
      logger: this.logger,
      componentSystem: this.componentSystem,
      resolver: this.resolver
    });

    // Widget Factory
    this.widgetFactory = new WidgetFactory({
      logger: this.logger,
      resolver: this.resolver,
      componentSystem: this.componentSystem
    });

    // Validator
    this.validator = new Validator({
      logger: this.logger
    });

    // Permission System
    this.permissionSystem = new PermissionSystem({
      logger: this.logger,
      cacheTTL: this.config.permissionCacheTTL || 300000
    });

    // Composer
    this.composer = new Composer({
      logger: this.logger,
      componentSystem: this.componentSystem,
      layoutEngine: this.layoutEngine,
      widgetFactory: this.widgetFactory,
      resolver: this.resolver,
      validator: this.validator,
      permissionSystem: this.permissionSystem,
      config: this.config
    });

    this.logger.info('[AutoUI v2] Systems initialized');
  }

  // ==========================================
  // Data Sources Registration
  // ==========================================

  registerDataSources() {
    // Data source for fetching data
    this.resolver.registerDataSource('data', async (path, context) => {
      // Path format: module.field or just field
      const parts = path.split('.');

      if (parts.length === 1) {
        // Simple field from context
        return context.data?.[parts[0]];
      }

      // Module data fetch
      const moduleName = parts[0];
      const field = parts.slice(1).join('.');

      const module = this.loader.getModule(moduleName);
      if (!module) return null;

      // Fetch from module API
      try {
        const data = await this.fetchModuleData(module);
        return this.getNestedValue(data, field.split('.'));
      } catch (error) {
        this.logger.error('[AutoUI] Data source error:', error);
        return null;
      }
    });

    // Metrics source
    this.resolver.registerDataSource('metrics', async (path, context) => {
      // TODO: Integrate with metrics system
      return 0;
    });
  }

  // ==========================================
  // Initialization
  // ==========================================

  async init() {
    if (this.initialized) return;

    this.logger.info('[AutoUI v2] Initializing...');

    // Load resources
    await this.loader.reloadAll();

    // Subscribe to MQTT events
    if (this.eventBus) {
      await this.bridge.subscribeToMQTT();
    }

    // Load global components from /auto-ui/components/ (auto-discovery)
    await this.loadGlobalComponents();

    // Load module-specific components
    await this.loadModuleComponents();

    this.initialized = true;

    const stats = this.getStats();
    this.logger.info('[AutoUI v2] Initialized:', stats);

    return stats;
  }

  /**
   * Carga componentes personalizados desde módulos
   */
  async loadModuleComponents() {
    const modules = this.loader.listModules();

    for (const module of modules) {
      if (module.ui && module.ui.components) {
        for (const [name, componentDef] of Object.entries(module.ui.components)) {
          try {
            this.componentSystem.register(name, componentDef);
          } catch (error) {
            this.logger.error(`[AutoUI] Failed to register component ${name}:`, error);
          }
        }
      }
    }
  }

  /**
   * Carga componentes globales desde /auto-ui/components/
   * Auto-discovery: detecta y registra automáticamente todos los .json
   */
  async loadGlobalComponents() {
    const components = this.loader.listComponents();

    let registered = 0;
    for (const componentSummary of components) {
      try {
        const componentDef = this.loader.getComponent(componentSummary.name);
        if (componentDef) {
          this.componentSystem.register(componentDef.name, componentDef);
          registered++;
          this.logger.info(`[AutoUI v2] Registered global component: ${componentDef.name} (${componentDef._category})`);
        }
      } catch (error) {
        this.logger.error(`[AutoUI v2] Failed to register component ${componentSummary.name}:`, error.message);
      }
    }

    this.logger.info(`[AutoUI v2] Loaded ${registered} global components from /auto-ui/components/`);
    return registered;
  }

  // ==========================================
  // HTTP Request Handler
  // ==========================================

  async handle(req, res) {
    if (!this.initialized) {
      await this.init();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/^\/auto-ui\/?/, '') || '';
    const method = req.method;

    // Parse path
    const pathParts = path.split('/').filter(Boolean);
    const moduleName = pathParts[0];
    const action = pathParts[1];
    const id = pathParts[2];

    // Build context
    const context = {
      req,
      res,
      method,
      path,
      pathParts,
      moduleName,
      action,
      id,
      query: Object.fromEntries(url.searchParams),
      user: await this.getCurrentUser(req)
    };

    // Set user in permission system
    if (context.user) {
      this.permissionSystem.setUser(context.user);
    }

    // Route handlers
    const routes = {
      // SSE Events
      'GET events': () => this.bridge.connect(req, res),

      // Dashboard
      'GET ': () => this.handleDashboard(res, context),

      // Theme
      'GET theme': () => this.handleGetTheme(res),
      'PUT theme': () => this.handleSetTheme(req, res),

      // Module routes
      'GET :module': (params) => this.handleModuleView(res, params.module, context),
      'GET :module/:view': (params) => this.handleModuleView(res, params.module, context, params.view),
      'GET :module/list': (params) => this.handleModuleList(res, params.module, context),
      'GET :module/rows': (params) => this.handleModuleRows(res, params.module, context),
      'GET :module/form': (params) => this.handleModuleForm(res, params.module, context),
      'GET :module/form/:id': (params) => this.handleModuleForm(res, params.module, context, params.id),
      'GET :module/detail/:id': (params) => this.handleModuleDetail(res, params.module, params.id, context),

      // Static JS
      'GET js/core.js': () => this.handleStaticJS(res)
    };

    // Match route
    const match = this.matchRoute(method, path, routes);

    if (match) {
      try {
        await match.handler(match.params);
      } catch (error) {
        this.logger.error('[AutoUI v2] Handler error:', error);
        this.sendError(res, 500, error.message);
      }
    } else {
      this.sendError(res, 404, 'Not found');
    }
  }

  // ==========================================
  // Route Handlers
  // ==========================================

  async handleDashboard(res, context) {
    const content = this.generator.dashboard();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(this.generator.page('Dashboard', content, { sse: true }));
  }

  async handleModuleView(res, moduleName, context, viewName = 'main') {
    const module = this.loader.getModule(moduleName);

    if (!module) {
      return this.sendError(res, 404, `Module '${moduleName}' not found`);
    }

    try {
      // Check if module has v2 views
      if (module.ui?.views && module.ui.views[viewName]) {
        const viewDef = module.ui.views[viewName];

        // Compose view using v2 system
        const viewContext = {
          ...context,
          module,
          schema: module.schema
        };

        const viewHtml = await this.composer.composeView(viewDef, viewContext);

        // Wrap in page
        const html = this.generator.page(
          module.ui?.title || module.name,
          viewHtml,
          { sse: true }
        );

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);

      } else {
        // Fallback to legacy list view
        return this.handleModuleList(res, moduleName, context);
      }

    } catch (error) {
      this.logger.error('[AutoUI v2] View render error:', error);
      this.sendError(res, 500, error.message);
    }
  }

  async handleModuleList(res, moduleName, context) {
    const module = this.loader.getModule(moduleName);

    if (!module) {
      return this.sendError(res, 404, `Module '${moduleName}' not found`);
    }

    // Use legacy generator for now
    const content = this.generator.list(module);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(this.generator.page(module.ui?.title || module.name, content, { sse: true }));
  }

  async handleModuleRows(res, moduleName, context) {
    const module = this.loader.getModule(moduleName);

    if (!module) {
      return this.sendError(res, 404, 'Module not found');
    }

    try {
      const data = await this.fetchModuleData(module);
      const html = this.generator.rows(module, data);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (error) {
      this.logger.error('[AutoUI v2] Rows fetch error:', error);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<tr><td colspan="100" class="text-muted" style="text-align: center; padding: var(--space-lg)">Error: ${error.message}</td></tr>`);
    }
  }

  async handleModuleForm(res, moduleName, context, id = null) {
    const module = this.loader.getModule(moduleName);

    if (!module) {
      return this.sendError(res, 404, 'Module not found');
    }

    let data = null;
    if (id) {
      try {
        data = await this.fetchModuleItem(module, id);
      } catch (error) {
        this.logger.error('[AutoUI v2] Failed to fetch item:', error);
      }
    }

    const html = this.generator.form(module, data);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  async handleModuleDetail(res, moduleName, id, context) {
    const module = this.loader.getModule(moduleName);

    if (!module) {
      return this.sendError(res, 404, 'Module not found');
    }

    try {
      const data = await this.fetchModuleItem(module, id);

      // Try v2 detail view first
      if (module.ui?.views?.detail) {
        const viewContext = {
          ...context,
          module,
          schema: module.schema,
          data
        };

        const viewHtml = await this.composer.composeView(
          module.ui.views.detail,
          viewContext
        );

        const html = this.generator.page(
          `${module.ui?.title || module.name} - Detalle`,
          viewHtml,
          { sse: true }
        );

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);

      } else {
        // Fallback to legacy detail
        const html = this.generator.detail(module, data);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.generator.page(
          `${module.ui?.title || module.name} - Detalle`,
          html,
          { sse: true }
        ));
      }

    } catch (error) {
      this.logger.error('[AutoUI v2] Detail fetch error:', error);
      this.sendError(res, 404, 'Record not found');
    }
  }

  handleGetTheme(res) {
    const theme = this.loader.getTheme();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(theme));
  }

  async handleSetTheme(req, res) {
    try {
      const body = await this.parseBody(req);
      const theme = this.loader.setTheme(body.theme);

      this.bridge.emit(UI.EVENTS.THEME_CHANGED, { theme: theme.name });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, theme: theme.name }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  handleStaticJS(res) {
    try {
      const clientPath = path.join(__dirname, '..', 'client', 'core.js');

      if (fs.existsSync(clientPath)) {
        const js = fs.readFileSync(clientPath, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=3600'
        });
        res.end(js);
      } else {
        // Fallback to inline JS
        const js = this.getClientJS();
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(js);
      }
    } catch (error) {
      this.logger.error('[AutoUI v2] Failed to serve client JS:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('// Error loading client scripts');
    }
  }

  // ==========================================
  // Data Fetching
  // ==========================================

  async fetchModuleData(module) {
    const apis = module.apis || [];
    const listApi = apis.find(a => a.method === 'GET' && !a.path.includes(':'));

    if (!listApi) {
      return [];
    }

    const url = `http://localhost:3000/modules/${module.name}${listApi.path}`;

    try {
      const response = await fetch(url);
      const json = await response.json();
      return json.data || json || [];
    } catch (error) {
      this.logger.error('[AutoUI v2] Fetch error:', error);
      return [];
    }
  }

  async fetchModuleItem(module, id) {
    const apis = module.apis || [];
    const getApi = apis.find(a => a.method === 'GET' && a.path.includes(':id'));

    if (!getApi) {
      throw new Error('No GET API found');
    }

    const path = getApi.path.replace(':id', id);
    const url = `http://localhost:3000/modules/${module.name}${path}`;

    const response = await fetch(url);
    const json = await response.json();
    return json.data || json;
  }

  // ==========================================
  // Utilities
  // ==========================================

  matchRoute(method, path, routes) {
    for (const [pattern, handler] of Object.entries(routes)) {
      const [routeMethod, routePath] = pattern.split(' ');

      if (method !== routeMethod) continue;

      const params = this.matchPath(routePath, path);
      if (params !== null) {
        return { handler, params };
      }
    }
    return null;
  }

  matchPath(pattern, path) {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) return null;

    const params = {};

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }

    return params;
  }

  async getCurrentUser(req) {
    // TODO: Implement authentication
    // For now, return mock admin user
    return {
      id: 'user-1',
      username: 'admin',
      roles: ['admin']
    };
  }

  parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  getNestedValue(obj, parts) {
    if (!obj || !parts || parts.length === 0) return obj;

    let value = obj;
    for (const part of parts) {
      if (value === null || value === undefined) return null;
      value = value[part];
    }

    return value;
  }

  sendError(res, code, message) {
    res.writeHead(code, { 'Content-Type': 'text/html' });
    res.end(this.generator.page(`Error ${code}`, `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p>${message}</p>
      </div>
    `));
  }

  getClientJS() {
    // Inline fallback JS if file doesn't exist
    return `
      window.AutoUI = window.AutoUI || {
        version: '2.0.0',
        showToast: function(msg, type) {
          console.log('[Toast]', type, msg);
        },
        executeAction: function(action, params) {
          console.log('[Action]', action, params);
        }
      };
      console.log('[AutoUI v${this.version}] Client loaded (inline fallback)');
    `;
  }

  // ==========================================
  // API
  // ==========================================

  async reload() {
    return await this.loader.reloadAll();
  }

  getStats() {
    return {
      version: this.version,
      loader: this.loader.getStats(),
      bridge: this.bridge.getStats(),
      v2: {
        componentSystem: this.componentSystem.getStats(),
        resolver: this.resolver.getStats(),
        layoutEngine: this.layoutEngine.getStats(),
        widgetFactory: this.widgetFactory.getStats(),
        permissionSystem: this.permissionSystem.getStats()
      },
      initialized: this.initialized
    };
  }
}

module.exports = AutoUIv2;
