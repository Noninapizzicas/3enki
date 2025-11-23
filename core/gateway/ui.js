/**
 * Event Core - UI Gateway
 *
 * Sirve archivos estáticos de la interfaz gráfica y expone
 * las definiciones de UI de los módulos
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync } = require('fs');

class UIGateway {
  constructor(core) {
    this.core = core;
    this.uiDir = path.join(__dirname, '../../ui');
    this.modulesDir = path.join(__dirname, '../../modules');

    // MIME types for static files
    this.mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    };
  }


  /**
   * Serve the admin panel (index.html)
   */
  async serveAdminPanel(request, response) {
    const indexPath = path.join(this.uiDir, 'admin/index.html');

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(content);
    } catch (error) {
      this.core.logger.error('[UIGateway] Error serving admin panel:', error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Failed to load admin panel' }));
    }
  }

  /**
   * Serve static files from the UI directory
   */
  async serveStaticFile(request, response) {
    // Remove /ui prefix and get the file path
    const urlPath = request.url.replace(/^\/ui/, '');

    // Security: prevent directory traversal
    const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(this.uiDir, safePath);

    // Ensure the requested file is within the UI directory
    if (!filePath.startsWith(this.uiDir)) {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }

    try {
      // Check if file exists
      if (!existsSync(filePath)) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'File not found' }));
        return;
      }

      // Read file
      const content = await fs.readFile(filePath);

      // Determine MIME type
      const ext = path.extname(filePath);
      const mimeType = this.mimeTypes[ext] || 'application/octet-stream';

      // Serve file
      response.writeHead(200, { 'Content-Type': mimeType });
      response.end(content);
    } catch (error) {
      this.core.logger.error('[UIGateway] Error serving file:', error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Failed to load file' }));
    }
  }

  /**
   * List all modules that have UI enabled
   *
   * GET /ui/modules
   *
   * Response:
   * {
   *   modules: [
   *     {
   *       name: "todo-list",
   *       title: "Lista de Tareas",
   *       description: "...",
   *       icon: "✓",
   *       version: "1.0.0"
   *     }
   *   ]
   * }
   */
  async listModulesWithUI(request, response) {
    try {
      const modules = [];

      // Get all loaded modules from ModuleLoader
      const moduleLoader = this.core.moduleLoader;

      if (!moduleLoader || !moduleLoader.loadedModules) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ modules: [] }));
        return;
      }

      // Iterate through loaded modules
      for (const [moduleName, moduleData] of moduleLoader.loadedModules.entries()) {
        const moduleConfig = moduleData.manifest;

        // Check if module has UI enabled
        if (moduleConfig.ui && moduleConfig.ui.enabled) {
          modules.push({
            name: moduleName,
            title: moduleConfig.ui.title || moduleConfig.name,
            description: moduleConfig.ui.description || moduleConfig.description || '',
            icon: moduleConfig.ui.icon || '📦',
            version: moduleConfig.version || '1.0.0',
            views: moduleConfig.ui.views ? moduleConfig.ui.views.length : 0
          });
        }
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ modules }));
    } catch (error) {
      this.core.logger.error('[UIGateway] Error listing modules:', error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Failed to list modules' }));
    }
  }

  /**
   * Render module view dynamically from JSON configuration
   *
   * GET /ui/:moduleName
   *
   * Generates HTML from:
   * - module.json.ui.views
   * - ui-components/*.component.json
   * - Design tokens
   */
  async renderModuleView(request, response, moduleName) {
    try {
      // Get module from ModuleLoader
      const moduleLoader = this.core.moduleLoader;
      const moduleData = moduleLoader?.loadedModules.get(moduleName);

      if (!moduleData) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: `Module "${moduleName}" not found` }));
        return;
      }

      const moduleConfig = moduleData.manifest;

      // Check if module has UI enabled
      if (!moduleConfig.ui || !moduleConfig.ui.enabled) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: `Module "${moduleName}" does not have UI enabled` }));
        return;
      }

      const uiConfig = moduleConfig.ui;
      const mainView = uiConfig.views?.main;

      if (!mainView) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: `Module "${moduleName}" does not have a main view defined` }));
        return;
      }

      // Load component definition if specified
      let componentDef = null;
      if (mainView.component) {
        const componentPath = path.join(process.cwd(), 'ui-components', `${mainView.component}.component.json`);
        if (existsSync(componentPath)) {
          const componentContent = await fs.readFile(componentPath, 'utf-8');
          componentDef = JSON.parse(componentContent);
        }
      }

      // Generate HTML
      const html = this.generateViewHTML(moduleName, uiConfig, mainView, componentDef);

      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(html);

    } catch (error) {
      this.core.logger.error('[UIGateway] Error rendering module view:', error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Failed to render module view' }));
    }
  }

  /**
   * Generate HTML from JSON configuration
   */
  generateViewHTML(moduleName, uiConfig, viewConfig, componentDef) {
    const title = uiConfig.title || moduleName;
    const icon = uiConfig.icon || '📦';
    const endpoint = viewConfig.config?.endpoint || `/modules/${moduleName}`;
    const mqttTopics = viewConfig.config?.mqtt_topics || componentDef?.mqtt?.topics || [];
    const refreshInterval = viewConfig.config?.refresh_interval || 5000;

    // Build sections HTML from component definition
    let sectionsHTML = '';
    if (componentDef?.sections) {
      sectionsHTML = componentDef.sections.map(section => `
        <div class="section" id="section-${section.id}">
          <h3 class="section-title">${section.title}</h3>
          <div class="section-content" data-field="${section.data_source?.field || section.id}">
            <div class="loading">Cargando...</div>
          </div>
        </div>
      `).join('');
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${icon} ${title}</title>
  <style>
    :root {
      --bg-primary: #0F1216;
      --bg-secondary: #1a1d24;
      --bg-tertiary: #1f2937;
      --text-primary: #ffffff;
      --text-secondary: #9CA3AF;
      --text-muted: #6B7280;
      --accent-green: #2FBF71;
      --accent-blue: #1D4ED8;
      --accent-amber: #F5B700;
      --accent-red: #E63946;
      --border-color: #374151;
      --radius: 8px;
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 12px;
      --spacing-lg: 16px;
      --spacing-xl: 24px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      padding: var(--spacing-lg);
    }
    .header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-xl);
      padding-bottom: var(--spacing-lg);
      border-bottom: 1px solid var(--border-color);
    }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 24px; font-weight: 700; }
    .header-status {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      font-size: 12px;
      color: var(--text-muted);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--spacing-lg);
    }
    .section {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: var(--spacing-lg);
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: var(--spacing-md);
    }
    .section-content { min-height: 100px; }
    .loading {
      color: var(--text-muted);
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100px;
    }
    .metric-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--border-color);
    }
    .metric-item:last-child { border-bottom: none; }
    .metric-name {
      font-size: 13px;
      color: var(--text-secondary);
      font-family: monospace;
    }
    .metric-value {
      font-size: 16px;
      font-weight: 700;
      color: var(--accent-green);
    }
    .metric-value.gauge { color: var(--accent-blue); }
    .metric-value.timing { color: var(--accent-amber); }
    .empty-state {
      text-align: center;
      padding: var(--spacing-xl);
      color: var(--text-muted);
    }
    .empty-state-icon { font-size: 48px; margin-bottom: var(--spacing-md); }
    .refresh-info {
      font-size: 11px;
      color: var(--text-muted);
      text-align: right;
      margin-top: var(--spacing-lg);
    }
  </style>
</head>
<body>
  <header class="header">
    <span class="header-icon">${icon}</span>
    <h1 class="header-title">${title}</h1>
    <div class="header-status">
      <span class="status-dot"></span>
      <span id="last-update">Conectando...</span>
    </div>
  </header>

  <div class="grid">
    ${sectionsHTML || `
    <div class="section" id="section-counters">
      <h3 class="section-title">🔢 Contadores</h3>
      <div class="section-content" data-field="counters">
        <div class="loading">Cargando...</div>
      </div>
    </div>
    <div class="section" id="section-gauges">
      <h3 class="section-title">📏 Valores Actuales</h3>
      <div class="section-content" data-field="gauges">
        <div class="loading">Cargando...</div>
      </div>
    </div>
    <div class="section" id="section-timings">
      <h3 class="section-title">⏱️ Timings</h3>
      <div class="section-content" data-field="timings">
        <div class="loading">Cargando...</div>
      </div>
    </div>
    `}
  </div>

  <div class="refresh-info">
    Auto-refresh: ${refreshInterval / 1000}s | MQTT: ${mqttTopics.join(', ') || 'none'}
  </div>

  <script>
    const CONFIG = {
      endpoint: '${endpoint}',
      refreshInterval: ${refreshInterval},
      mqttTopics: ${JSON.stringify(mqttTopics)}
    };

    async function fetchData() {
      try {
        const res = await fetch(CONFIG.endpoint);
        const json = await res.json();
        const data = json.data || json;
        renderData(data);
        document.getElementById('last-update').textContent =
          'Actualizado: ' + new Date().toLocaleTimeString();
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    }

    function renderData(data) {
      // Render counters
      const countersEl = document.querySelector('[data-field="counters"]');
      if (countersEl && data.counters) {
        const entries = Object.entries(data.counters);
        if (entries.length === 0) {
          countersEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div>Sin contadores</div>';
        } else {
          countersEl.innerHTML = entries.map(([k, v]) =>
            '<div class="metric-item"><span class="metric-name">' + k + '</span><span class="metric-value">' + v + '</span></div>'
          ).join('');
        }
      }

      // Render gauges
      const gaugesEl = document.querySelector('[data-field="gauges"]');
      if (gaugesEl && data.gauges) {
        const entries = Object.entries(data.gauges);
        if (entries.length === 0) {
          gaugesEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📏</div>Sin gauges</div>';
        } else {
          gaugesEl.innerHTML = entries.map(([k, v]) => {
            const displayValue = typeof v === 'number' ? v.toFixed(2) : v;
            return '<div class="metric-item"><span class="metric-name">' + k + '</span><span class="metric-value gauge">' + displayValue + '</span></div>';
          }).join('');
        }
      }

      // Render timings
      const timingsEl = document.querySelector('[data-field="timings"]');
      if (timingsEl && data.timings) {
        if (data.timings.length === 0) {
          timingsEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏱️</div>Sin timings</div>';
        } else {
          timingsEl.innerHTML = data.timings.slice(-10).reverse().map(t =>
            '<div class="metric-item"><span class="metric-name">' + t.event_type + '</span><span class="metric-value timing">' + t.duration + 'ms</span></div>'
          ).join('');
        }
      }
    }

    // Initial fetch
    fetchData();

    // Auto refresh
    setInterval(fetchData, CONFIG.refreshInterval);
  </script>
</body>
</html>`;
  }

  /**
   * Get UI definition for a specific module
   *
   * GET /ui/modules/:name
   *
   * Response:
   * {
   *   name: "todo-list",
   *   title: "Lista de Tareas",
   *   description: "...",
   *   icon: "✓",
   *   version: "1.0.0",
   *   views: [...]
   * }
   */
  async getModuleUI(request, response) {
    try {
      const moduleName = request.params.name;

      // Get module from ModuleLoader
      const moduleLoader = this.core.moduleLoader;
      const moduleData = moduleLoader?.loadedModules.get(moduleName);

      if (!moduleData) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: `Module "${moduleName}" not found` }));
        return;
      }

      const moduleConfig = moduleData.manifest;

      // Check if module has UI
      if (!moduleConfig.ui || !moduleConfig.ui.enabled) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: `Module "${moduleName}" does not have UI enabled` }));
        return;
      }

      // Return UI definition
      const uiDefinition = {
        name: moduleName,
        title: moduleConfig.ui.title || moduleConfig.name,
        description: moduleConfig.ui.description || moduleConfig.description || '',
        icon: moduleConfig.ui.icon || '📦',
        version: moduleConfig.version || '1.0.0',
        views: moduleConfig.ui.views || [],
        components: moduleConfig.ui.components || {},
        permissions: moduleConfig.ui.permissions || {}
      };

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(uiDefinition));
    } catch (error) {
      this.core.logger.error('[UIGateway] Error getting module UI:', error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Failed to get module UI' }));
    }
  }
}

module.exports = UIGateway;
