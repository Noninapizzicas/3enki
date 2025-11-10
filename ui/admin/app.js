/**
 * Event Core Admin Panel - Main Application
 *
 * SPA Router and API client
 */

// ============================================================================
// API CLIENT
// ============================================================================

class APIClient {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
  }

  async request(method, path, data = null, options = {}) {
    const url = `${this.baseURL}${path}`;
    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`
        }));
        throw new Error(error.error || error.message || 'Request failed');
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${method} ${path}]:`, error);
      throw error;
    }
  }

  get(path, options) {
    return this.request('GET', path, null, options);
  }

  post(path, data, options) {
    return this.request('POST', path, data, options);
  }

  put(path, data, options) {
    return this.request('PUT', path, data, options);
  }

  patch(path, data, options) {
    return this.request('PATCH', path, data, options);
  }

  delete(path, options) {
    return this.request('DELETE', path, null, options);
  }
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

class ToastManager {
  constructor() {
    this.container = document.getElementById('toast-container');
  }

  show(title, message, type = 'info', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <div class="toast-content">
        <p class="toast-title">${title}</p>
        <p class="toast-message">${message}</p>
      </div>
      <button class="toast-close">×</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.remove(toast));

    this.container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => this.remove(toast), duration);
    }

    return toast;
  }

  remove(toast) {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }

  success(title, message, duration) {
    return this.show(title, message, 'success', duration);
  }

  error(title, message, duration) {
    return this.show(title, message, 'error', duration);
  }

  warning(title, message, duration) {
    return this.show(title, message, 'warning', duration);
  }

  info(title, message, duration) {
    return this.show(title, message, 'info', duration);
  }
}

// ============================================================================
// ROUTER
// ============================================================================

class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.container = document.getElementById('app-container');

    window.addEventListener('hashchange', () => this.navigate());
    window.addEventListener('load', () => this.navigate());
  }

  register(path, handler) {
    this.routes.set(path, handler);
  }

  async navigate() {
    const hash = window.location.hash.slice(1) || '/';
    const [path, ...paramsParts] = hash.split('?');
    const params = this.parseParams(paramsParts.join('?'));

    this.currentRoute = { path, params };

    // Update active link in sidebar
    document.querySelectorAll('.sidebar-link').forEach(link => {
      const route = link.getAttribute('data-route');
      link.classList.toggle('active', route === path);
    });

    // Find and execute route handler
    const handler = this.routes.get(path) || this.routes.get('*');

    if (handler) {
      try {
        this.showLoading();
        await handler(params);
      } catch (error) {
        console.error('Route handler error:', error);
        this.showError(error.message);
      }
    } else {
      this.show404();
    }
  }

  parseParams(queryString) {
    const params = {};
    if (queryString) {
      queryString.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        params[decodeURIComponent(key)] = decodeURIComponent(value || '');
      });
    }
    return params;
  }

  render(html) {
    this.container.innerHTML = html;
  }

  showLoading() {
    this.render(`
      <div class="content-loading">
        <div class="loader"></div>
        <p class="text-muted mt-4">Cargando...</p>
      </div>
    `);
  }

  showError(message) {
    this.render(`
      <div class="content-loading">
        <div class="alert alert-danger">
          <h3>Error</h3>
          <p>${message}</p>
        </div>
      </div>
    `);
  }

  show404() {
    this.render(`
      <div class="content-loading">
        <h1 style="font-size: 72px; margin: 0;">404</h1>
        <p class="text-muted mt-4">Página no encontrada</p>
        <a href="#/" class="btn btn-primary mt-4">Volver al inicio</a>
      </div>
    `);
  }
}

// ============================================================================
// APPLICATION
// ============================================================================

class App {
  constructor() {
    this.api = new APIClient('/modules');
    this.toast = new ToastManager();
    this.router = new Router();
    this.modules = [];

    this.init();
  }

  async init() {
    // Setup theme toggle
    this.setupThemeToggle();

    // Load modules
    await this.loadModules();

    // Register routes
    this.registerRoutes();

    // Start router
    this.router.navigate();
  }

  setupThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);

    toggle.addEventListener('click', () => {
      const theme = document.documentElement.getAttribute('data-theme');
      const newTheme = theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      toggle.querySelector('span').textContent = newTheme === 'light' ? '🌙' : '☀️';
    });
  }

  async loadModules() {
    try {
      // Get modules with UI enabled from the UI Gateway
      const response = await fetch('/ui/modules');
      const data = await response.json();
      this.modules = data.modules || [];

      this.renderModulesMenu();
    } catch (error) {
      console.error('Error loading modules:', error);
      this.renderModulesMenuError();
    }
  }

  renderModulesMenu() {
    const menu = document.getElementById('modules-menu');

    if (this.modules.length === 0) {
      menu.innerHTML = `
        <li class="sidebar-loading">
          <span class="text-muted text-sm">No hay módulos con UI</span>
        </li>
      `;
      return;
    }

    menu.innerHTML = this.modules.map(module => `
      <li>
        <a href="#/module/${module.name}" class="sidebar-link" data-route="/module/${module.name}">
          <span class="sidebar-link-icon">${module.icon || '📦'}</span>
          <span class="sidebar-link-text">${module.title || module.name}</span>
        </a>
      </li>
    `).join('');
  }

  renderModulesMenuError() {
    const menu = document.getElementById('modules-menu');
    menu.innerHTML = `
      <li class="sidebar-loading">
        <span class="text-danger text-sm">Error al cargar módulos</span>
      </li>
    `;
  }

  /**
   * Get nested property from object using dot notation
   * Example: getPath(obj, 'data.items') returns obj.data.items
   */
  getPath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }

  registerRoutes() {
    // Home / Dashboard
    this.router.register('/', async () => {
      this.router.render(`
        <div class="page-header">
          <h1 class="page-title">Dashboard</h1>
          <p class="page-description">Panel de control de Event Core</p>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <p class="stat-label">Módulos Activos</p>
            <p class="stat-value">${this.modules.length}</p>
          </div>
          <div class="stat-card">
            <p class="stat-label">Estado del Sistema</p>
            <p class="stat-value text-success">Activo</p>
          </div>
          <div class="stat-card">
            <p class="stat-label">Uptime</p>
            <p class="stat-value text-sm">--</p>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">Módulos Disponibles</h2>
          ${this.modules.length > 0 ? `
            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Versión</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.modules.map(module => `
                    <tr>
                      <td>
                        <strong>${module.title || module.name}</strong>
                        <br>
                        <small class="text-muted">${module.description || ''}</small>
                      </td>
                      <td>${module.version || '1.0.0'}</td>
                      <td><span class="badge badge-success">Activo</span></td>
                      <td>
                        <a href="#/module/${module.name}" class="btn btn-sm btn-primary">Ver</a>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="alert alert-info">
              <p>No hay módulos con interfaz gráfica disponibles.</p>
            </div>
          `}
        </div>
      `);
    });

    // Module view - will load UI definition and render with UIRenderer
    this.router.register('/module/:name', async (params) => {
      const moduleName = params.name || window.location.hash.split('/').pop().split('?')[0];
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const viewId = urlParams.get('view');

      try {
        // Load module UI definition
        const response = await fetch(`/ui/modules/${moduleName}`);
        const moduleUI = await response.json();

        // Store current module
        this.currentModule = moduleUI;

        // Get the view to display (first view or specified view)
        let activeView = moduleUI.views[0];
        if (viewId) {
          activeView = moduleUI.views.find(v => v.id === viewId) || activeView;
        }

        // Render module container with tabs if multiple views
        let html = `
          <div class="page-header">
            <h1 class="page-title">${moduleUI.icon || ''} ${moduleUI.title || moduleName}</h1>
            ${moduleUI.description ? `<p class="page-description">${moduleUI.description}</p>` : ''}
          </div>
        `;

        // Add view tabs if multiple views
        if (moduleUI.views.length > 1) {
          html += `
            <nav class="module-tabs mb-4">
              ${moduleUI.views.map(view => `
                <button
                  class="module-tab ${view.id === activeView.id ? 'active' : ''}"
                  onclick="window.location.hash = '#/module/${moduleName}?view=${view.id}'">
                  ${view.title || view.id}
                </button>
              `).join('')}
            </nav>
          `;
        }

        // Render the active view
        html += `<div id="view-container">`;

        // Check if renderer is available
        if (window.EventCoreUI && window.EventCoreUI.renderer) {
          try {
            // Load data if view has API
            let viewData = null;
            if (activeView.api) {
              const dataResponse = await this.api.request(
                activeView.api.method || 'GET',
                activeView.api.url
              );
              viewData = activeView.api.dataPath
                ? this.getPath(dataResponse, activeView.api.dataPath)
                : dataResponse;
            }

            // Render view with UIRenderer
            const rendered = await window.EventCoreUI.renderer.renderView(activeView, viewData);
            html += rendered.html;

            // Execute JS after rendering
            setTimeout(() => {
              if (rendered.js) {
                try {
                  eval(rendered.js);
                } catch (e) {
                  console.error('Error executing view JS:', e);
                }
              }
            }, 100);
          } catch (error) {
            console.error('Error rendering view:', error);
            html += `
              <div class="alert alert-danger">
                <h3>Error al renderizar vista</h3>
                <p>${error.message}</p>
              </div>
            `;
          }
        } else {
          html += `
            <div class="alert alert-warning">
              <p>UI Renderer no está disponible. Cargando...</p>
            </div>
          `;
        }

        html += `</div>`;

        this.router.render(html);
      } catch (error) {
        this.toast.error('Error', `No se pudo cargar el módulo: ${error.message}`);
        this.router.render(`
          <div class="alert alert-danger">
            <h3>Error al cargar módulo</h3>
            <p>${error.message}</p>
            <a href="#/" class="btn btn-primary mt-4">Volver al inicio</a>
          </div>
        `);
      }
    });

    // Settings
    this.router.register('/settings', async () => {
      this.router.render(`
        <div class="page-header">
          <h1 class="page-title">Configuración</h1>
          <p class="page-description">Ajustes del sistema</p>
        </div>

        <div class="section">
          <h2 class="section-title">Apariencia</h2>
          <div class="form-group">
            <label class="form-label">Tema</label>
            <select class="select" id="theme-select">
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">Sistema</h2>
          <p class="text-muted">Configuración del sistema en desarrollo...</p>
        </div>
      `);

      const themeSelect = document.getElementById('theme-select');
      const currentTheme = document.documentElement.getAttribute('data-theme');
      themeSelect.value = currentTheme;

      themeSelect.addEventListener('change', (e) => {
        const newTheme = e.target.value;
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.toast.success('Tema actualizado', `Se cambió al tema ${newTheme === 'light' ? 'claro' : 'oscuro'}`);
      });
    });

    // Logs
    this.router.register('/logs', async () => {
      this.router.render(`
        <div class="page-header">
          <h1 class="page-title">Logs del Sistema</h1>
          <p class="page-description">Registro de actividad</p>
        </div>

        <div class="section">
          <div class="alert alert-info">
            <p>Sistema de logs en desarrollo...</p>
          </div>
        </div>
      `);
    });

    // 404 fallback
    this.router.register('*', () => {
      this.router.show404();
    });
  }
}

// ============================================================================
// GLOBAL EVENT CORE UI HELPERS
// ============================================================================

// Initialize EventCoreUI global object
if (!window.EventCoreUI) {
  window.EventCoreUI = {};
}

/**
 * Handle action button clicks (for tables, detail views, etc.)
 */
window.EventCoreUI.handleAction = async function(actionId, button) {
  const rowId = button.dataset.rowId;
  const rowData = button.dataset.row ? JSON.parse(button.dataset.row) : null;

  console.log('Action clicked:', actionId, rowId, rowData);

  // Handle standard actions
  switch (actionId) {
    case 'create':
      // Navigate to create form
      const moduleName = window.eventCoreApp.currentModule.name;
      window.location.hash = `#/module/${moduleName}?view=create`;
      break;

    case 'edit':
      // Navigate to edit form with row data
      if (rowId) {
        const moduleName = window.eventCoreApp.currentModule.name;
        window.location.hash = `#/module/${moduleName}?view=edit&id=${rowId}`;
      }
      break;

    case 'view':
      // Navigate to detail view
      if (rowId) {
        const moduleName = window.eventCoreApp.currentModule.name;
        window.location.hash = `#/module/${moduleName}?view=detail&id=${rowId}`;
      }
      break;

    case 'delete':
      // Confirm and delete
      if (confirm('¿Estás seguro de eliminar este elemento?')) {
        try {
          // Get delete API from button data or action definition
          const deleteUrl = button.dataset.deleteUrl || `/modules/${window.eventCoreApp.currentModule.name}/todos/${rowId}`;
          await window.eventCoreApp.api.delete(deleteUrl);
          window.eventCoreApp.toast.success('Eliminado', 'El elemento se eliminó correctamente');

          // Reload current view
          window.location.reload();
        } catch (error) {
          window.eventCoreApp.toast.error('Error', 'No se pudo eliminar: ' + error.message);
        }
      }
      break;

    default:
      console.warn('Unknown action:', actionId);
  }
};

/**
 * Handle form submission
 */
window.EventCoreUI.handleFormSubmit = async function(event, formId) {
  event.preventDefault();

  const form = window.EventCoreUI.forms[formId];
  if (!form) {
    console.error('Form not found:', formId);
    return false;
  }

  const formData = form.getData();
  const success = await form.submit(formData);

  if (success) {
    // Navigate back to list view
    const moduleName = window.eventCoreApp.currentModule.name;
    window.location.hash = `#/module/${moduleName}`;
  }

  return false;
};

/**
 * Handle form action buttons (cancel, etc.)
 */
window.EventCoreUI.handleFormAction = function(actionId, button, event) {
  if (event) event.preventDefault();

  switch (actionId) {
    case 'cancel':
      history.back();
      break;

    case 'submit':
      // Let form handle it naturally
      break;

    default:
      console.warn('Unknown form action:', actionId);
  }
};

/**
 * Show success toast
 */
window.EventCoreUI.showSuccess = function(title, message) {
  window.eventCoreApp.toast.success(title, message);
};

/**
 * Show error toast
 */
window.EventCoreUI.showError = function(title, message) {
  window.eventCoreApp.toast.error(title, message);
};

/**
 * Apply filters to table
 */
window.EventCoreUI.applyFilters = function() {
  console.log('Apply filters');
  // TODO: Implement filtering logic
};

/**
 * Clear filters from table
 */
window.EventCoreUI.clearFilters = function() {
  console.log('Clear filters');
  // TODO: Implement clear filters logic
};

/**
 * Get nested property from object using dot notation
 */
window.EventCoreUI.getPath = function(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

/**
 * API client reference
 */
window.EventCoreUI.api = null; // Will be set by App

// ============================================================================
// INITIALIZE APP
// ============================================================================

const app = new App();

// Expose app globally for debugging
window.eventCoreApp = app;

// Expose API client to EventCoreUI
window.EventCoreUI.api = app.api;
