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

      if (!moduleLoader || !moduleLoader.modules) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ modules: [] }));
        return;
      }

      // Iterate through loaded modules
      for (const [moduleName, moduleInstance] of moduleLoader.modules.entries()) {
        const moduleConfig = moduleInstance.config;

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
      const moduleInstance = moduleLoader?.modules.get(moduleName);

      if (!moduleInstance) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: `Module "${moduleName}" not found` }));
        return;
      }

      const moduleConfig = moduleInstance.config;

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
