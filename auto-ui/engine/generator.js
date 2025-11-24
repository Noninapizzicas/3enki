/**
 * Auto-UI HTML Generator
 *
 * Genera HTML desde schemas de módulos y definiciones de componentes
 */

const { UI } = require('../../core/constants');

class Generator {
  constructor(options = {}) {
    this.loader = options.loader;
    this.logger = options.logger || console;
  }

  // ==========================================
  // CSS desde Theme
  // ==========================================

  /**
   * Genera CSS variables desde el tema
   */
  generateCSS() {
    const theme = this.loader.getTheme();

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

    return `
      :root {
        /* Colors */
        ${colorVars}

        /* Spacing */
        ${spacingVars}

        /* Radius */
        ${radiusVars}

        /* Typography */
        ${typographyVars}

        /* Shadows */
        ${shadowVars}
      }

      /* Base Styles */
      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        font-family: var(--font, system-ui, sans-serif);
        background: var(--bg);
        color: var(--text);
        line-height: var(--line-height, 1.5);
      }

      /* Buttons */
      .btn {
        display: inline-flex;
        align-items: center;
        gap: var(--space-sm);
        padding: var(--space-sm) var(--space-md);
        border: 1px solid transparent;
        border-radius: var(--radius-md);
        font-weight: 500;
        cursor: pointer;
        transition: all 150ms ease;
      }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-primary { background: var(--primary); color: white; }
      .btn-primary:hover:not(:disabled) { background: var(--primary-hover, var(--primary)); }
      .btn-secondary { background: var(--bg-card); color: var(--text); border-color: var(--border); }
      .btn-success { background: var(--success); color: white; }
      .btn-warning { background: var(--warning); color: var(--bg); }
      .btn-danger { background: var(--danger); color: white; }
      .btn-ghost { background: transparent; color: var(--primary); }
      .btn-icon { padding: var(--space-sm); }
      .btn-sm { padding: var(--space-xs) var(--space-sm); font-size: var(--size-sm); }
      .btn-lg { padding: var(--space-md) var(--space-lg); font-size: var(--size-lg); }

      /* Cards */
      .card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: var(--space-md);
      }
      .card-header { font-size: var(--size-lg); font-weight: 600; margin-bottom: var(--space-md); }

      /* Tables */
      .table-wrapper { overflow-x: auto; border-radius: var(--radius-lg); }
      .table { width: 100%; border-collapse: collapse; background: var(--bg-card); }
      .table th { background: rgba(255,255,255,0.05); text-align: left; font-weight: 600; }
      .table th, .table td { padding: var(--space-sm) var(--space-md); border-bottom: 1px solid var(--border); }
      .table tr:hover { background: rgba(255,255,255,0.02); }

      /* Forms */
      .form-group { margin-bottom: var(--space-md); }
      .form-label { display: block; margin-bottom: var(--space-xs); font-weight: 500; }
      .form-input {
        width: 100%;
        padding: var(--space-sm) var(--space-md);
        background: var(--bg-input, var(--bg));
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text);
      }
      .form-input:focus { outline: none; border-color: var(--border-focus); }

      /* Badges */
      .badge {
        display: inline-flex;
        padding: var(--space-xs) var(--space-sm);
        border-radius: var(--radius-full, 9999px);
        font-size: var(--size-xs);
        font-weight: 500;
      }
      .badge-primary { background: var(--primary); color: white; }
      .badge-success { background: var(--success); color: white; }
      .badge-warning { background: var(--warning); color: var(--bg); }
      .badge-danger { background: var(--danger); color: white; }

      /* Modal */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: var(--overlay, rgba(0,0,0,0.7));
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 200;
      }
      .modal {
        background: var(--bg-card);
        border-radius: var(--radius-xl, var(--radius-lg));
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow: auto;
      }
      .modal-header { padding: var(--space-md); border-bottom: 1px solid var(--border); font-weight: 600; }
      .modal-body { padding: var(--space-md); }
      .modal-footer { padding: var(--space-md); border-top: 1px solid var(--border); display: flex; gap: var(--space-sm); justify-content: flex-end; }

      /* Toast */
      .toast-container { position: fixed; top: var(--space-md); right: var(--space-md); z-index: 300; display: flex; flex-direction: column; gap: var(--space-sm); }
      .toast { padding: var(--space-sm) var(--space-md); border-radius: var(--radius-md); animation: toast-in 250ms ease; }
      .toast-success { background: var(--success); color: white; }
      .toast-warning { background: var(--warning); color: var(--bg); }
      .toast-danger { background: var(--danger); color: white; }
      .toast-info { background: var(--info, var(--primary)); color: white; }
      @keyframes toast-in { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }

      /* Layout */
      .sidebar { width: 280px; background: var(--bg-card); border-right: 1px solid var(--border); height: 100vh; position: fixed; left: 0; top: 0; }
      .main { margin-left: 280px; padding: var(--space-lg); }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-lg); }
      .grid { display: grid; gap: var(--space-md); }
      .grid-2 { grid-template-columns: repeat(2, 1fr); }
      .grid-3 { grid-template-columns: repeat(3, 1fr); }
      .grid-4 { grid-template-columns: repeat(4, 1fr); }

      /* Hold Progress */
      .hold-progress-ring { animation: hold-progress-animation linear forwards; }
      @keyframes hold-progress-animation {
        from { clip-path: polygon(50% 50%, 50% 0%, 50% 0%, 50% 0%, 50% 0%, 50% 0%); }
        to { clip-path: polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%); }
      }

      /* Empty State */
      .empty-state { text-align: center; padding: var(--space-xl); color: var(--text-muted); }
      .empty-state-icon { font-size: 3rem; margin-bottom: var(--space-md); }

      /* Pagination */
      .pagination { display: flex; gap: var(--space-xs); align-items: center; }
      .pagination-info { color: var(--text-muted); font-size: var(--size-sm); }

      /* Utilities */
      .hidden { display: none !important; }
      .flex { display: flex; }
      .items-center { align-items: center; }
      .justify-between { justify-content: space-between; }
      .gap-sm { gap: var(--space-sm); }
      .gap-md { gap: var(--space-md); }
      .text-muted { color: var(--text-muted); }
      .text-sm { font-size: var(--size-sm); }
    `;
  }

  // ==========================================
  // Página completa
  // ==========================================

  /**
   * Genera una página HTML completa
   */
  page(title, content, options = {}) {
    const css = this.generateCSS();

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)} - Auto-UI</title>
  <style>${css}</style>
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
</head>
<body>
  ${options.sidebar !== false ? this.sidebar() : ''}
  <main class="${options.sidebar !== false ? 'main' : ''}">
    ${content}
  </main>
  <div id="modal-container"></div>
  <div class="toast-container" id="toast-container"></div>
  ${options.sse ? this.sseScript() : ''}
  <script src="/auto-ui/js/core.js"></script>
</body>
</html>`;
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

    // Ver/Editar
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
