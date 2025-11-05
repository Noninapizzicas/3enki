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
      const moduleName = params.name || window.location.hash.split('/').pop();

      try {
        // Load module UI definition
        const response = await fetch(`/ui/modules/${moduleName}`);
        const moduleUI = await response.json();

        // For now, show a placeholder - UIRenderer will handle this later
        this.router.render(`
          <div class="page-header">
            <h1 class="page-title">${moduleUI.title || moduleName}</h1>
            <p class="page-description">${moduleUI.description || ''}</p>
          </div>

          <div class="alert alert-info">
            <h3>UI Renderer en desarrollo</h3>
            <p>El módulo "${moduleName}" tiene una interfaz definida, pero el renderer aún no está implementado.</p>
            <p class="mt-2"><strong>Vistas disponibles:</strong></p>
            <ul>
              ${moduleUI.views ? moduleUI.views.map(view => `
                <li>${view.title || view.id} (${view.type})</li>
              `).join('') : '<li>No hay vistas definidas</li>'}
            </ul>
          </div>
        `);
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
// INITIALIZE APP
// ============================================================================

const app = new App();

// Expose app globally for debugging
window.eventCoreApp = app;
