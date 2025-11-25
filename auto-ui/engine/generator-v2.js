/**
 * Auto-UI HTML Generator v2.0
 *
 * Generador mejorado con integración completa del ComponentSystem
 */

const { UI } = require('../../core/constants');

class GeneratorV2 {
  constructor(options = {}) {
    this.loader = options.loader;
    this.componentSystem = options.componentSystem;
    this.widgetFactory = options.widgetFactory;
    this.logger = options.logger || console;
  }

  // ==========================================
  // CSS desde Theme (Mejorado)
  // ==========================================

  /**
   * Genera CSS completo desde el tema con todas las mejoras v2
   */
  generateCSS() {
    const theme = this.loader.getTheme();

    // Variables de tema
    const themeVars = this.generateThemeVariables(theme);

    // Estilos base mejorados
    const baseStyles = this.generateBaseStyles();

    // Estilos de componentes
    const componentStyles = this.generateComponentStyles();

    // Animaciones
    const animations = this.generateAnimations();

    // Utilidades
    const utilities = this.generateUtilities();

    return `
      ${themeVars}
      ${baseStyles}
      ${componentStyles}
      ${animations}
      ${utilities}
    `;
  }

  generateThemeVariables(theme) {
    const colorVars = Object.entries(theme.colors || {})
      .map(([k, v]) => `--${k}: ${v};`)
      .join('\n      ');

    const spacingVars = Object.entries(theme.spacing || {})
      .map(([k, v]) => `--space-${k}: ${v};`)
      .join('\n      ');

    const radiusVars = Object.entries(theme.radius || {})
      .map(([k, v]) => `--radius-${k}: ${v};`)
      .join('\n      ');

    const typographyVars = Object.entries(theme.typography || {})
      .map(([k, v]) => `--${k}: ${v};`)
      .join('\n      ');

    const shadowVars = Object.entries(theme.shadows || {})
      .map(([k, v]) => `--shadow-${k}: ${v};`)
      .join('\n      ');

    const transitionVars = Object.entries(theme.transitions || {})
      .map(([k, v]) => `--transition-${k}: ${v};`)
      .join('\n      ');

    return `
      :root {
        /* Colors */
        ${colorVars}

        /* Spacing */
        ${spacingVars}

        /* Border Radius */
        ${radiusVars}

        /* Typography */
        ${typographyVars}

        /* Shadows */
        ${shadowVars}

        /* Transitions */
        ${transitionVars}
      }
    `;
  }

  generateBaseStyles() {
    return `
      /* Reset & Base */
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      html {
        font-size: 16px;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      body {
        font-family: var(--font, system-ui, -apple-system, sans-serif);
        background: var(--bg);
        color: var(--text);
        line-height: var(--line-height, 1.5);
        min-height: 100vh;
      }

      /* Links */
      a {
        color: var(--primary);
        text-decoration: none;
        transition: color var(--transition-fast, 150ms);
      }

      a:hover {
        color: var(--primary-hover, var(--primary));
        text-decoration: underline;
      }

      /* Focus */
      :focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
    `;
  }

  generateComponentStyles() {
    return `
      /* Buttons */
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-sm);
        padding: var(--space-sm) var(--space-md);
        border: 1px solid transparent;
        border-radius: var(--radius-md);
        font-family: inherit;
        font-size: var(--size-base, 1rem);
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        transition: all var(--transition-fast, 150ms) ease;
        white-space: nowrap;
        user-select: none;
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      .btn-primary {
        background: var(--primary);
        color: white;
        border-color: var(--primary);
      }

      .btn-primary:hover:not(:disabled) {
        background: var(--primary-hover, var(--primary));
        transform: translateY(-1px);
        box-shadow: var(--shadow-md);
      }

      .btn-secondary {
        background: var(--bg-card);
        color: var(--text);
        border-color: var(--border);
      }

      .btn-secondary:hover:not(:disabled) {
        background: var(--bg-hover);
        border-color: var(--primary);
      }

      .btn-success {
        background: var(--success);
        color: white;
        border-color: var(--success);
      }

      .btn-warning {
        background: var(--warning);
        color: var(--bg);
        border-color: var(--warning);
      }

      .btn-danger {
        background: var(--danger);
        color: white;
        border-color: var(--danger);
      }

      .btn-ghost {
        background: transparent;
        color: var(--primary);
        border-color: transparent;
      }

      .btn-ghost:hover:not(:disabled) {
        background: rgba(var(--primary-rgb, 59, 130, 246), 0.1);
      }

      .btn-icon {
        padding: var(--space-sm);
        aspect-ratio: 1;
      }

      .btn-sm {
        padding: var(--space-xs) var(--space-sm);
        font-size: var(--size-sm);
      }

      .btn-lg {
        padding: var(--space-md) var(--space-lg);
        font-size: var(--size-lg);
      }

      /* Cards */
      .card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: var(--space-md);
        transition: all var(--transition-normal, 250ms);
      }

      .card-elevated {
        box-shadow: var(--shadow-md);
      }

      .card-interactive {
        cursor: pointer;
      }

      .card-interactive:hover {
        border-color: var(--primary);
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
      }

      .card-header {
        font-size: var(--size-lg);
        font-weight: 600;
        margin-bottom: var(--space-md);
        padding-bottom: var(--space-sm);
        border-bottom: 1px solid var(--border);
      }

      .card-body {
        flex: 1;
      }

      .card-footer {
        margin-top: var(--space-md);
        padding-top: var(--space-sm);
        border-top: 1px solid var(--border);
      }

      /* Forms */
      .form-group {
        margin-bottom: var(--space-md);
      }

      .form-label {
        display: block;
        margin-bottom: var(--space-xs);
        font-weight: 500;
        font-size: var(--size-sm);
        color: var(--text);
      }

      .form-label-required::after {
        content: ' *';
        color: var(--danger);
      }

      .form-input,
      .form-select,
      .form-textarea {
        width: 100%;
        padding: var(--space-sm) var(--space-md);
        background: var(--bg-input, var(--bg));
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text);
        font-family: inherit;
        font-size: var(--size-base);
        transition: all var(--transition-fast, 150ms);
      }

      .form-input:hover,
      .form-select:hover,
      .form-textarea:hover {
        border-color: var(--border-focus, var(--primary));
      }

      .form-input:focus,
      .form-select:focus,
      .form-textarea:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(var(--primary-rgb, 59, 130, 246), 0.1);
      }

      .form-input:disabled,
      .form-select:disabled,
      .form-textarea:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: var(--bg-card);
      }

      .form-input.error {
        border-color: var(--danger);
      }

      .form-error {
        display: block;
        margin-top: var(--space-xs);
        font-size: var(--size-xs);
        color: var(--danger);
      }

      .form-help {
        display: block;
        margin-top: var(--space-xs);
        font-size: var(--size-xs);
        color: var(--text-muted);
      }

      .form-checkbox,
      .form-radio {
        width: auto;
        margin-right: var(--space-xs);
      }

      /* Tables */
      .table-wrapper {
        overflow-x: auto;
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
      }

      .table {
        width: 100%;
        border-collapse: collapse;
        background: var(--bg-card);
      }

      .table thead {
        background: rgba(255, 255, 255, 0.02);
      }

      .table th {
        text-align: left;
        font-weight: 600;
        font-size: var(--size-sm);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
      }

      .table th,
      .table td {
        padding: var(--space-sm) var(--space-md);
        border-bottom: 1px solid var(--border);
      }

      .table tbody tr {
        transition: background var(--transition-fast, 150ms);
      }

      .table tbody tr:hover {
        background: var(--bg-hover, rgba(255, 255, 255, 0.02));
      }

      .table tbody tr:last-child td {
        border-bottom: none;
      }

      /* Badges */
      .badge {
        display: inline-flex;
        align-items: center;
        gap: var(--space-xs);
        padding: var(--space-xs) var(--space-sm);
        border-radius: var(--radius-full, 9999px);
        font-size: var(--size-xs);
        font-weight: 500;
        line-height: 1;
      }

      .badge-primary { background: var(--primary); color: white; }
      .badge-success { background: var(--success); color: white; }
      .badge-warning { background: var(--warning); color: var(--bg); }
      .badge-danger { background: var(--danger); color: white; }
      .badge-info { background: var(--info, var(--primary)); color: white; }

      /* Modal */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: var(--overlay, rgba(0, 0, 0, 0.7));
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 200;
        animation: fadeIn var(--transition-normal, 250ms) ease;
      }

      .modal {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: var(--radius-xl, var(--radius-lg));
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow: auto;
        box-shadow: var(--shadow-xl, 0 20px 25px rgba(0,0,0,0.6));
        animation: slideIn var(--transition-normal, 250ms) ease;
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-md);
        border-bottom: 1px solid var(--border);
        font-weight: 600;
        font-size: var(--size-lg);
      }

      .modal-body {
        padding: var(--space-md);
      }

      .modal-footer {
        padding: var(--space-md);
        border-top: 1px solid var(--border);
        display: flex;
        gap: var(--space-sm);
        justify-content: flex-end;
      }

      /* Toast */
      .toast-container {
        position: fixed;
        top: var(--space-md);
        right: var(--space-md);
        z-index: 300;
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
        max-width: 400px;
      }

      .toast {
        padding: var(--space-sm) var(--space-md);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        animation: toastIn var(--transition-normal, 250ms) ease;
        display: flex;
        align-items: center;
        gap: var(--space-sm);
      }

      .toast-success { background: var(--success); color: white; }
      .toast-warning { background: var(--warning); color: var(--bg); }
      .toast-danger { background: var(--danger); color: white; }
      .toast-info { background: var(--info, var(--primary)); color: white; }

      /* Layout */
      .sidebar {
        width: 280px;
        background: var(--bg-card);
        border-right: 1px solid var(--border);
        height: 100vh;
        position: fixed;
        left: 0;
        top: 0;
        overflow-y: auto;
      }

      .main {
        margin-left: 280px;
        padding: var(--space-lg);
        min-height: 100vh;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-lg);
        padding-bottom: var(--space-md);
        border-bottom: 1px solid var(--border);
      }

      /* Grid */
      .grid {
        display: grid;
        gap: var(--space-md);
      }

      .grid-2 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
      .grid-3 { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
      .grid-4 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }

      /* Empty State */
      .empty-state {
        text-align: center;
        padding: var(--space-2xl, var(--space-xl));
        color: var(--text-muted);
      }

      .empty-state-icon {
        font-size: 4rem;
        margin-bottom: var(--space-md);
        opacity: 0.5;
      }

      /* Loading */
      .loading {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 2px solid currentColor;
        border-radius: 50%;
        border-top-color: transparent;
        animation: spin 0.6s linear infinite;
      }

      /* Skeleton */
      .skeleton {
        background: linear-gradient(
          90deg,
          var(--bg-card) 0%,
          rgba(255, 255, 255, 0.05) 50%,
          var(--bg-card) 100%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
        border-radius: var(--radius-md);
      }

      .skeleton-text {
        height: 1em;
        margin-bottom: var(--space-xs);
      }

      .skeleton-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
      }
    `;
  }

  generateAnimations() {
    return `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes toastIn {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
    `;
  }

  generateUtilities() {
    return `
      /* Display */
      .hidden { display: none !important; }
      .block { display: block !important; }
      .inline-block { display: inline-block !important; }
      .flex { display: flex !important; }
      .inline-flex { display: inline-flex !important; }
      .grid { display: grid !important; }

      /* Flex */
      .flex-row { flex-direction: row; }
      .flex-col { flex-direction: column; }
      .flex-wrap { flex-wrap: wrap; }
      .items-start { align-items: flex-start; }
      .items-center { align-items: center; }
      .items-end { align-items: flex-end; }
      .items-stretch { align-items: stretch; }
      .justify-start { justify-content: flex-start; }
      .justify-center { justify-content: center; }
      .justify-end { justify-content: flex-end; }
      .justify-between { justify-content: space-between; }
      .justify-around { justify-content: space-around; }
      .gap-xs { gap: var(--space-xs); }
      .gap-sm { gap: var(--space-sm); }
      .gap-md { gap: var(--space-md); }
      .gap-lg { gap: var(--space-lg); }

      /* Text */
      .text-left { text-align: left; }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .text-xs { font-size: var(--size-xs); }
      .text-sm { font-size: var(--size-sm); }
      .text-base { font-size: var(--size-base); }
      .text-lg { font-size: var(--size-lg); }
      .text-xl { font-size: var(--size-xl); }
      .font-normal { font-weight: 400; }
      .font-medium { font-weight: 500; }
      .font-semibold { font-weight: 600; }
      .font-bold { font-weight: 700; }
      .text-muted { color: var(--text-muted); }
      .text-primary { color: var(--primary); }
      .text-success { color: var(--success); }
      .text-warning { color: var(--warning); }
      .text-danger { color: var(--danger); }

      /* Spacing */
      .m-0 { margin: 0; }
      .mt-xs { margin-top: var(--space-xs); }
      .mt-sm { margin-top: var(--space-sm); }
      .mt-md { margin-top: var(--space-md); }
      .mt-lg { margin-top: var(--space-lg); }
      .mb-xs { margin-bottom: var(--space-xs); }
      .mb-sm { margin-bottom: var(--space-sm); }
      .mb-md { margin-bottom: var(--space-md); }
      .mb-lg { margin-bottom: var(--space-lg); }
      .p-0 { padding: 0; }
      .p-sm { padding: var(--space-sm); }
      .p-md { padding: var(--space-md); }
      .p-lg { padding: var(--space-lg); }

      /* Width */
      .w-full { width: 100%; }
      .w-auto { width: auto; }
      .max-w-sm { max-width: 640px; }
      .max-w-md { max-width: 768px; }
      .max-w-lg { max-width: 1024px; }
      .max-w-xl { max-width: 1280px; }

      /* Responsive */
      @media (max-width: 768px) {
        .sidebar {
          transform: translateX(-100%);
          transition: transform var(--transition-normal, 250ms);
        }

        .sidebar.open {
          transform: translateX(0);
        }

        .main {
          margin-left: 0;
        }

        .grid-2,
        .grid-3,
        .grid-4 {
          grid-template-columns: 1fr;
        }

        .modal {
          width: 95%;
        }
      }
    `;
  }

  // ==========================================
  // Page Template (Mejorado)
  // ==========================================

  page(title, content, options = {}) {
    const css = this.generateCSS();
    const sidebarHtml = options.sidebar !== false ? this.sidebar() : '';
    const mainClass = options.sidebar !== false ? 'main' : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Auto-UI v2.0 - ${this.escapeHtml(title)}">
  <title>${this.escapeHtml(title)} - Auto-UI</title>
  <style>${css}</style>
  <script src="https://unpkg.com/htmx.org@1.9.10" defer></script>
  ${options.chartjs ? '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" defer></script>' : ''}
</head>
<body>
  ${sidebarHtml}
  <main class="${mainClass}">
    ${content}
  </main>
  <div id="modal-container"></div>
  <div class="toast-container" id="toast-container"></div>
  ${options.sse ? this.sseScript() : ''}
  <script src="/auto-ui/js/core.js" defer></script>
</body>
</html>`;
  }

  // ... (resto de métodos del generator original se mantienen igual)
  // Continúo en siguiente archivo...

  /**
   * Escapa HTML para prevenir XSS
   */
  escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

module.exports = GeneratorV2;
  }

  // ==========================================
  // Sidebar
  // ==========================================

  /**
   * Genera el sidebar con navegación
   */
  sidebar() {
    const modules = this.loader.listUIModules();

    const navItems = modules.map(m => `
      <a href="/auto-ui/${m.name}" class="sidebar-item" hx-get="/auto-ui/${m.name}" hx-target=".main" hx-push-url="true">
        <span class="sidebar-icon">${m.ui?.icon || '📦'}</span>
        <span class="sidebar-label">${m.ui?.title || m.name}</span>
      </a>
    `).join('');

    return `
      <nav class="sidebar">
        <div class="sidebar-header">
          <a href="/auto-ui" class="sidebar-brand">
            <span class="sidebar-icon">⚡</span>
            <span class="sidebar-label">Auto-UI</span>
          </a>
        </div>
        <div class="sidebar-nav">
          ${navItems}
        </div>
      </nav>
      <style>
        .sidebar-header { padding: var(--space-md); border-bottom: 1px solid var(--border); }
        .sidebar-brand { display: flex; align-items: center; gap: var(--space-sm); text-decoration: none; color: var(--text); font-weight: 600; }
        .sidebar-nav { padding: var(--space-sm); }
        .sidebar-item { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-sm) var(--space-md); color: var(--text-muted); text-decoration: none; border-radius: var(--radius-md); margin-bottom: var(--space-xs); transition: all 150ms; }
        .sidebar-item:hover { background: var(--bg-hover); color: var(--text); }
        .sidebar-item.active { background: var(--primary); color: white; }
        .sidebar-icon { font-size: 1.25rem; }
      </style>
    `;
  }

  // ==========================================
  // Dashboard
  // ==========================================

  /**
   * Genera el dashboard principal
   */
  dashboard() {
    const modules = this.loader.listUIModules();

    const cards = modules.map(m => `
      <a href="/auto-ui/${m.name}" class="dashboard-card" hx-get="/auto-ui/${m.name}" hx-target=".main" hx-push-url="true">
        <span class="dashboard-card-icon">${m.ui?.icon || '📦'}</span>
        <span class="dashboard-card-title">${m.ui?.title || m.name}</span>
        <span class="dashboard-card-desc">${m.description || ''}</span>
      </a>
    `).join('');

    return `
      <div class="header">
        <h1>Dashboard</h1>
      </div>
      <div class="grid grid-3">
        ${cards}
      </div>
      <style>
        .dashboard-card { display: flex; flex-direction: column; align-items: center; gap: var(--space-sm); padding: var(--space-lg); background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); text-decoration: none; color: var(--text); transition: all 150ms; }
        .dashboard-card:hover { border-color: var(--primary); transform: translateY(-2px); }
        .dashboard-card-icon { font-size: 2.5rem; }
        .dashboard-card-title { font-weight: 600; }
        .dashboard-card-desc { font-size: var(--size-sm); color: var(--text-muted); text-align: center; }
      </style>
    `;
  }

  // ==========================================
  // Lista/Tabla
  // ==========================================

  /**
   * Genera vista de lista para un módulo
   */
  list(module, options = {}) {
    const schema = module.schema || {};
    const columns = Object.keys(schema);

    return `
      <div class="header">
        <div class="flex items-center gap-md">
          <span style="font-size: 2rem">${module.ui?.icon || '📦'}</span>
          <h1>${module.ui?.title || module.name}</h1>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" hx-get="/auto-ui/${module.name}/form" hx-target="#modal-container">
            + Crear
          </button>
          <button class="btn btn-ghost" hx-get="/auto-ui/${module.name}/rows" hx-target="#table-body" hx-swap="innerHTML">
            ↻ Actualizar
          </button>
        </div>
      </div>

      <div class="card">
        <div class="table-wrapper">
          <table class="table"
            hx-get="/auto-ui/${module.name}/rows"
            hx-trigger="${module.name}.created from:body, ${module.name}.updated from:body, ${module.name}.deleted from:body"
            hx-target="#table-body"
            hx-swap="innerHTML"
          >
            <thead>
              <tr>
                ${columns.map(col => `<th>${this.toLabel(col)}</th>`).join('')}
                <th style="width: 120px">Acciones</th>
              </tr>
            </thead>
            <tbody id="table-body" hx-get="/auto-ui/${module.name}/rows" hx-trigger="load">
              <tr><td colspan="${columns.length + 1}" class="text-muted text-sm" style="text-align: center; padding: var(--space-lg);">Cargando...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * Genera filas de tabla
   */
  rows(module, data) {
    if (!data || data.length === 0) {
      const columns = Object.keys(module.schema || {});
      return `
        <tr>
          <td colspan="${columns.length + 1}">
            <div class="empty-state">
              <div class="empty-state-icon">📭</div>
              <p>No hay registros</p>
              <button class="btn btn-primary" hx-get="/auto-ui/${module.name}/form" hx-target="#modal-container" style="margin-top: var(--space-md)">
                Crear primero
              </button>
            </div>
          </td>
        </tr>
      `;
    }

    const schema = module.schema || {};
    const columns = Object.keys(schema);

    return data.map(row => {
      const cells = columns.map(col => {
        const value = row[col];
        const fieldSchema = schema[col] || {};
        return `<td>${this.formatCell(value, fieldSchema)}</td>`;
      }).join('');

      const actions = this.rowActions(module, row);

      return `<tr data-id="${row.id}">${cells}<td>${actions}</td></tr>`;
    }).join('');
  }

  /**
   * Genera acciones de fila
   */
  rowActions(module, row) {
    const api = module.apis || module.api || {};

    let html = '';

    // Ver detalle
    html += `
      <button class="btn btn-icon btn-ghost" title="Ver detalle"
        hx-get="/auto-ui/${module.name}/detail/${row.id}"
        hx-target=".main"
        hx-push-url="true">
        👁️
      </button>
    `;

    // Editar
    html += `
      <button class="btn btn-icon btn-ghost" title="Editar"
        hx-get="/auto-ui/${module.name}/form/${row.id}"
        hx-target="#modal-container">
        ✏️
      </button>
    `;

    // Eliminar con hold
    html += `
      <button class="btn btn-icon btn-ghost" title="Mantener para eliminar"
        data-component="button"
        data-hold='{"action":"delete","endpoint":"/modules/${module.name}/${row.id}","duration":2000}'
        hx-delete="/modules/${module.name}/${row.id}"
        hx-target="closest tr"
        hx-swap="outerHTML"
        hx-confirm="¿Eliminar este registro?">
        🗑️
      </button>
    `;

    return html;
  }

  // ==========================================
  // Vista Detalle
  // ==========================================

  /**
   * Genera vista de detalle para un registro
   */
  detail(module, data) {
    const schema = module.schema || {};

    const fields = Object.entries(schema).map(([name, fieldSchema]) => {
      const label = fieldSchema.label || this.toLabel(name);
      const value = data[name];
      const formattedValue = this.formatCell(value, fieldSchema);

      return `
        <div class="detail-field">
          <span class="detail-label">${label}</span>
          <span class="detail-value">${formattedValue}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="header">
        <div class="flex items-center gap-md">
          <button class="btn btn-ghost" onclick="history.back()">← Volver</button>
          <span style="font-size: 2rem">${module.ui?.icon || '📦'}</span>
          <h1>${module.ui?.title || module.name} - Detalle</h1>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" hx-get="/auto-ui/${module.name}/form/${data.id}" hx-target="#modal-container">
            ✏️ Editar
          </button>
          <button class="btn btn-danger"
            data-hold='{"action":"delete","endpoint":"/modules/${module.name}/${data.id}","duration":2000}'
            hx-delete="/modules/${module.name}/${data.id}"
            hx-swap="none"
            hx-on::after-request="if(event.detail.successful) { history.back(); }"
            hx-confirm="¿Eliminar este registro?">
            🗑️ Eliminar
          </button>
        </div>
      </div>

      <div class="card">
        <div class="detail-grid">
          ${fields}
        </div>
      </div>

      <style>
        .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-md); }
        .detail-field { display: flex; flex-direction: column; gap: var(--space-xs); }
        .detail-label { font-size: var(--size-sm); color: var(--text-muted); font-weight: 500; }
        .detail-value { font-size: var(--size-base); }
      </style>
    `;
  }

  // ==========================================
  // Formulario
  // ==========================================

  /**
   * Genera formulario de crear/editar
   */
  form(module, data = null) {
    const schema = module.schema || {};
    const isEdit = data !== null;

    const fields = Object.entries(schema).map(([name, fieldSchema]) => {
      return this.formField(name, fieldSchema, data?.[name]);
    }).join('');

    const action = isEdit
      ? `hx-put="/modules/${module.name}/${data.id}"`
      : `hx-post="/modules/${module.name}"`;

    return `
      <div class="modal-backdrop" onclick="if(event.target === this) this.remove()">
        <div class="modal">
          <div class="modal-header flex justify-between items-center">
            <span>${isEdit ? 'Editar' : 'Crear'} ${module.ui?.title || module.name}</span>
            <button class="btn btn-icon btn-ghost" onclick="this.closest('.modal-backdrop').remove()">✕</button>
          </div>
          <form class="modal-body" ${action} hx-target="#modal-container" hx-swap="innerHTML"
            hx-on::after-request="if(event.detail.successful) { this.closest('.modal-backdrop').remove(); htmx.trigger('body', '${module.name}.${isEdit ? 'updated' : 'created'}'); }">
            ${fields}
          </form>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancelar</button>
            <button type="submit" class="btn btn-primary" form="form">Guardar</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Genera campo de formulario
   */
  formField(name, schema, value = '') {
    const label = schema.label || this.toLabel(name);
    const required = schema.required ? 'required' : '';
    const type = this.getInputType(schema);

    let input;

    if (schema.type === 'boolean') {
      input = `<input type="checkbox" name="${name}" class="form-checkbox" ${value ? 'checked' : ''}>`;
    } else if (schema.type === 'enum' || schema.enum) {
      const options = (schema.enum || schema.values || [])
        .map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`)
        .join('');
      input = `<select name="${name}" class="form-input" ${required}><option value="">Seleccionar...</option>${options}</select>`;
    } else if (schema.type === 'text' || schema.multiline) {
      input = `<textarea name="${name}" class="form-input" rows="3" ${required}>${this.escapeHtml(value || '')}</textarea>`;
    } else {
      input = `<input type="${type}" name="${name}" class="form-input" value="${this.escapeHtml(value || '')}" ${required}>`;
    }

    return `
      <div class="form-group">
        <label class="form-label">${label}${schema.required ? ' *' : ''}</label>
        ${input}
      </div>
    `;
  }

  // ==========================================
  // SSE Script
  // ==========================================

  /**
   * Genera script para SSE
   */
  sseScript() {
    return `
      <script>
        (function() {
          let es = null;
          let retries = 0;
          const maxRetries = ${UI.CONFIG.SSE_MAX_RETRIES};
          const reconnectDelay = ${UI.CONFIG.SSE_RECONNECT_DELAY};

          function connect() {
            es = new EventSource('/auto-ui/events');

            es.onopen = () => {
              console.log('[SSE] Connected');
              retries = 0;
            };

            es.onmessage = (e) => {
              try {
                const event = JSON.parse(e.data);
                console.log('[SSE] Event:', event);

                // Trigger htmx event
                if (event.type) {
                  htmx.trigger('body', event.type, event.data);
                }

                // Show toast if configured
                if (event.toast) {
                  window.AutoUI?.showToast(event.toast.message, event.toast.type);
                }
              } catch (err) {
                console.error('[SSE] Parse error:', err);
              }
            };

            es.onerror = () => {
              es.close();
              if (retries < maxRetries) {
                retries++;
                console.log('[SSE] Reconnecting in', reconnectDelay * retries, 'ms');
                setTimeout(connect, reconnectDelay * retries);
              } else {
                console.error('[SSE] Max retries reached');
              }
            };
          }

          connect();
        })();
      </script>
    `;
  }

  // ==========================================
  // Helpers
  // ==========================================

  /**
   * Formatea valor de celda según tipo
   */
  formatCell(value, schema) {
    if (value === null || value === undefined) return '<span class="text-muted">-</span>';

    switch (schema.type) {
      case 'boolean':
        return value ? '✓' : '✗';

      case 'number':
        if (schema.format === 'currency') {
          return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
        }
        return Number(value).toLocaleString('es-ES');

      case 'date':
        return new Date(value).toLocaleDateString('es-ES');

      case 'datetime':
        return new Date(value).toLocaleString('es-ES');

      case 'enum':
        const variant = this.getEnumVariant(value);
        return `<span class="badge badge-${variant}">${value}</span>`;

      default:
        return this.escapeHtml(String(value));
    }
  }

  /**
   * Obtiene variante de badge para enum
   */
  getEnumVariant(value) {
    const lowerValue = String(value).toLowerCase();
    if (['activo', 'active', 'success', 'completado', 'done', 'listo'].includes(lowerValue)) return 'success';
    if (['pendiente', 'pending', 'warning', 'preparando'].includes(lowerValue)) return 'warning';
    if (['error', 'failed', 'danger', 'cancelado'].includes(lowerValue)) return 'danger';
    if (['nuevo', 'new', 'info'].includes(lowerValue)) return 'primary';
    return 'primary';
  }

  /**
   * Obtiene tipo de input HTML según schema
   */
  getInputType(schema) {
    if (schema.format === 'email') return 'email';
    if (schema.format === 'url') return 'url';
    if (schema.format === 'password') return 'password';
    if (schema.format === 'date') return 'date';
    if (schema.format === 'datetime') return 'datetime-local';
    if (schema.format === 'time') return 'time';
    if (schema.type === 'number' || schema.type === 'integer') return 'number';
    return 'text';
  }

  /**
   * Convierte snake_case a Title Case
   */
  toLabel(str) {
    return str
      .replace(/_/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Escapa HTML
   */
  escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

module.exports = Generator;
