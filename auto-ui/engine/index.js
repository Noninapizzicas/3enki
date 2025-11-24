/**
 * Auto-UI - Main Orchestrator
 *
 * Sistema de interfaces auto-generadas para event-core
 * Genera UI completa desde schemas de módulos
 */

const { UI } = require('../../core/constants');
const Loader = require('./loader');
const Generator = require('./generator');
const Bridge = require('./bridge');

class AutoUI {
  constructor(options = {}) {
    this.modulesPath = options.modulesPath;
    this.mqttClient = options.mqttClient;
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;

    // Inicializar componentes
    this.loader = new Loader({
      modulesPath: this.modulesPath,
      logger: this.logger
    });

    this.generator = new Generator({
      loader: this.loader,
      logger: this.logger
    });

    this.bridge = new Bridge({
      mqttClient: this.mqttClient,
      eventBus: this.eventBus,
      logger: this.logger
    });

    // Estado
    this.initialized = false;
  }

  // ==========================================
  // Initialization
  // ==========================================

  /**
   * Inicializa el sistema
   */
  async init() {
    if (this.initialized) return;

    this.logger.info('[AutoUI] Initializing...');

    // Cargar recursos
    await this.loader.reloadAll();

    // Suscribir a eventos MQTT
    if (this.eventBus) {
      await this.bridge.subscribeToMQTT();
    }

    this.initialized = true;

    const stats = this.loader.getStats();
    this.logger.info('[AutoUI] Initialized:', stats);

    return stats;
  }

  // ==========================================
  // HTTP Request Handler
  // ==========================================

  /**
   * Handler principal para requests HTTP
   */
  async handle(req, res) {
    if (!this.initialized) {
      await this.init();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/^\/auto-ui\/?/, '') || '';
    const method = req.method;

    // Construir rutas
    const routes = {
      // SSE Events
      'GET events': () => this.bridge.connect(req, res),

      // Dashboard
      'GET ': () => this.handleDashboard(res),

      // Theme
      'GET theme': () => this.handleGetTheme(res),
      'PUT theme': () => this.handleSetTheme(req, res),

      // Module routes
      'GET :module': (params) => this.handleModuleList(res, params.module),
      'GET :module/rows': (params) => this.handleModuleRows(res, params.module),
      'GET :module/form': (params) => this.handleModuleForm(res, params.module),
      'GET :module/form/:id': (params) => this.handleModuleForm(res, params.module, params.id),

      // Static JS
      'GET js/core.js': () => this.handleStaticJS(res)
    };

    // Match route
    const match = this.matchRoute(method, path, routes);

    if (match) {
      try {
        await match.handler(match.params);
      } catch (error) {
        this.logger.error('[AutoUI] Handler error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(this.generator.page('404', '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>Página no encontrada</p></div>'));
    }
  }

  // ==========================================
  // Route Handlers
  // ==========================================

  /**
   * Dashboard principal
   */
  handleDashboard(res) {
    const content = this.generator.dashboard();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(this.generator.page('Dashboard', content, { sse: true }));
  }

  /**
   * Lista de un módulo
   */
  handleModuleList(res, moduleName) {
    const module = this.loader.getModule(moduleName);

    if (!module) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(this.generator.page('404', `<div class="empty-state"><div class="empty-state-icon">📦</div><p>Módulo '${moduleName}' no encontrado</p></div>`));
      return;
    }

    const content = this.generator.list(module);
    res.writeHead(200, { 'Content-Type': 'text/html' });

    // Si es request htmx, solo devolver contenido
    if (this.isHtmxRequest(res.req || {})) {
      res.end(content);
    } else {
      res.end(this.generator.page(module.ui?.title || module.name, content, { sse: true }));
    }
  }

  /**
   * Filas de tabla de un módulo
   */
  async handleModuleRows(res, moduleName) {
    const module = this.loader.getModule(moduleName);

    if (!module) {
      res.writeHead(404);
      res.end('Module not found');
      return;
    }

    try {
      // Fetch data from module API
      const data = await this.fetchModuleData(module);
      const html = this.generator.rows(module, data);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (error) {
      this.logger.error('[AutoUI] Failed to fetch module data:', error);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<tr><td colspan="100" class="text-muted" style="text-align: center; padding: var(--space-lg)">Error: ${error.message}</td></tr>`);
    }
  }

  /**
   * Formulario de crear/editar
   */
  async handleModuleForm(res, moduleName, id = null) {
    const module = this.loader.getModule(moduleName);

    if (!module) {
      res.writeHead(404);
      res.end('Module not found');
      return;
    }

    let data = null;
    if (id) {
      try {
        data = await this.fetchModuleItem(module, id);
      } catch (error) {
        this.logger.error('[AutoUI] Failed to fetch item:', error);
      }
    }

    const html = this.generator.form(module, data);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Obtiene tema actual
   */
  handleGetTheme(res) {
    const theme = this.loader.getTheme();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(theme));
  }

  /**
   * Cambia tema
   */
  async handleSetTheme(req, res) {
    try {
      const body = await this.parseBody(req);
      const theme = this.loader.setTheme(body.theme);

      // Notificar cambio
      this.bridge.emit(UI.EVENTS.THEME_CHANGED, { theme: theme.name });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, theme: theme.name }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Sirve JS del cliente
   */
  handleStaticJS(res) {
    const js = this.getClientJS();
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(js);
  }

  // ==========================================
  // Data Fetching
  // ==========================================

  /**
   * Obtiene datos de un módulo
   */
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
      this.logger.error('[AutoUI] Fetch error:', error);
      return [];
    }
  }

  /**
   * Obtiene un item específico
   */
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
  // Routing
  // ==========================================

  /**
   * Simple route matching
   */
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

  /**
   * Match path with params
   */
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

  // ==========================================
  // Helpers
  // ==========================================

  /**
   * Verifica si es request htmx
   */
  isHtmxRequest(req) {
    return req.headers?.['hx-request'] === 'true';
  }

  /**
   * Parsea body de request
   */
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

  /**
   * JS del cliente
   */
  getClientJS() {
    return `
/**
 * Auto-UI Client
 */
window.AutoUI = window.AutoUI || {};

// Toast system
AutoUI.showToast = function(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, ${UI.CONFIG.TOAST_DURATION});
};

// Action executor
AutoUI.executeAction = function(action, params, element) {
  switch (action) {
    case '${UI.ACTIONS.NAVIGATE}':
      window.location.href = params.to;
      break;

    case '${UI.ACTIONS.BACK}':
      history.back();
      break;

    case '${UI.ACTIONS.REFRESH}':
      location.reload();
      break;

    case '${UI.ACTIONS.SHOW_TOAST}':
      AutoUI.showToast(params.message, params.type);
      break;

    case '${UI.ACTIONS.OPEN_MODAL}':
      // htmx will handle this
      break;

    case '${UI.ACTIONS.CLOSE_MODAL}':
      document.querySelector('.modal-backdrop')?.remove();
      break;

    case '${UI.ACTIONS.DELETE}':
      if (params.endpoint && element) {
        htmx.ajax('DELETE', params.endpoint, { target: element.closest('tr'), swap: 'outerHTML' });
      }
      break;

    case '${UI.ACTIONS.EMIT}':
      htmx.trigger('body', params.event, params.data);
      break;

    default:
      console.log('[AutoUI] Unknown action:', action, params);
  }
};

// Hold interaction
(function() {
  let holdTimer = null;
  let holdProgress = null;

  document.addEventListener('mousedown', function(e) {
    const el = e.target.closest('[data-hold]');
    if (!el) return;

    const config = JSON.parse(el.dataset.hold);
    const duration = config.duration || ${UI.CONFIG.HOLD_DURATION};

    // Create progress ring
    holdProgress = document.createElement('div');
    holdProgress.className = 'hold-progress-ring';
    holdProgress.style.cssText = 'position:absolute;inset:0;border:2px solid var(--primary);border-radius:inherit;animation:hold-progress-animation ' + duration + 'ms linear forwards;pointer-events:none;';
    el.style.position = 'relative';
    el.appendChild(holdProgress);

    holdTimer = setTimeout(function() {
      AutoUI.executeAction(config.action, config, el);
      cleanup();
    }, duration);
  });

  document.addEventListener('mouseup', cleanup);
  document.addEventListener('mouseleave', cleanup);

  function cleanup() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (holdProgress) {
      holdProgress.remove();
      holdProgress = null;
    }
  }
})();

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  console.log('[AutoUI] Client initialized');
});
    `;
  }

  // ==========================================
  // API
  // ==========================================

  /**
   * Recarga recursos
   */
  async reload() {
    return await this.loader.reloadAll();
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      loader: this.loader.getStats(),
      bridge: this.bridge.getStats(),
      initialized: this.initialized
    };
  }
}

module.exports = AutoUI;
