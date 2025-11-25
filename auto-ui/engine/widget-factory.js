/**
 * Auto-UI Widget Factory v2.0
 *
 * Factory para crear widgets dinámicos complejos:
 * - Stats, Charts, Tables avanzadas, Calendarios, Kanban, etc.
 */

class WidgetFactory {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.resolver = options.resolver;
    this.componentSystem = options.componentSystem;

    // Registry de widgets
    this.widgets = new Map();

    // Register built-in widgets
    this.registerBuiltInWidgets();
  }

  // ==========================================
  // Widget Registration
  // ==========================================

  /**
   * Registra un widget
   */
  register(name, definition) {
    if (!name || typeof name !== 'string') {
      throw new Error('Widget name is required');
    }

    if (!definition || !definition.render) {
      throw new Error('Widget must have a render function');
    }

    this.widgets.set(name, definition);
    this.logger.info(`[WidgetFactory] Registered widget: ${name}`);

    return this;
  }

  /**
   * Obtiene un widget
   */
  get(name) {
    return this.widgets.get(name);
  }

  /**
   * Lista todos los widgets
   */
  list() {
    return Array.from(this.widgets.keys());
  }

  // ==========================================
  // Widget Rendering
  // ==========================================

  /**
   * Renderiza un widget
   */
  async render(name, config = {}, context = {}) {
    const widget = this.widgets.get(name);

    if (!widget) {
      this.logger.warn(`[WidgetFactory] Widget not found: ${name}`);
      return this.renderError(name, 'Widget not found');
    }

    try {
      // Resolver configuración
      const resolvedConfig = await this.resolver?.resolveDeep(config, context) || config;

      // Obtener datos si hay dataSource
      let data = resolvedConfig.data;
      if (resolvedConfig.dataSource) {
        data = await this.fetchData(resolvedConfig.dataSource, context);
      }

      // Renderizar widget
      const html = await widget.render(data, resolvedConfig, context, this);

      return html;

    } catch (error) {
      this.logger.error(`[WidgetFactory] Render error for ${name}:`, error);
      return this.renderError(name, error.message);
    }
  }

  /**
   * Obtiene datos desde data source
   */
  async fetchData(dataSource, context) {
    if (typeof dataSource === 'string') {
      // Si es URL o referencia
      if (dataSource.startsWith('@')) {
        return await this.resolver.resolve(dataSource, context);
      } else if (dataSource.startsWith('/')) {
        // API call
        const url = `http://localhost:3000${dataSource}`;
        const response = await fetch(url);
        const json = await response.json();
        return json.data || json;
      }
    }

    return dataSource;
  }

  // ==========================================
  // Built-in Widgets
  // ==========================================

  registerBuiltInWidgets() {
    // Stat Card
    this.register('stat-card', {
      render: (data, config, context) => {
        const value = config.value || data?.value || 0;
        const label = config.label || data?.label || 'Stat';
        const icon = config.icon || data?.icon || '📊';
        const change = config.change || data?.change;
        const trend = config.trend || data?.trend;
        const color = config.color || 'var(--primary)';

        let changeHtml = '';
        if (change !== undefined) {
          const changeColor = change >= 0 ? 'var(--success)' : 'var(--danger)';
          const changeIcon = change >= 0 ? '↑' : '↓';
          changeHtml = `
            <div class="stat-change" style="color: ${changeColor}">
              ${changeIcon} ${Math.abs(change)}%
            </div>
          `;
        }

        return `
          <div class="widget widget-stat-card">
            <div class="stat-icon" style="color: ${color}">${icon}</div>
            <div class="stat-content">
              <div class="stat-value" style="color: ${color}">${value}</div>
              <div class="stat-label">${label}</div>
              ${changeHtml}
            </div>
          </div>
          <style>
            .widget-stat-card {
              display: flex;
              align-items: center;
              gap: var(--space-md);
              padding: var(--space-lg);
              background: var(--bg-card);
              border: 1px solid var(--border);
              border-radius: var(--radius-lg);
            }
            .stat-icon {
              font-size: 2.5rem;
            }
            .stat-content {
              flex: 1;
            }
            .stat-value {
              font-size: var(--size-2xl);
              font-weight: 700;
              line-height: 1;
              margin-bottom: var(--space-xs);
            }
            .stat-label {
              color: var(--text-muted);
              font-size: var(--size-sm);
            }
            .stat-change {
              margin-top: var(--space-xs);
              font-size: var(--size-sm);
              font-weight: 600;
            }
          </style>
        `;
      }
    });

    // Progress Bar
    this.register('progress-bar', {
      render: (data, config, context) => {
        const value = config.value || data?.value || 0;
        const max = config.max || data?.max || 100;
        const label = config.label || data?.label;
        const color = config.color || 'var(--primary)';
        const showPercent = config.showPercent !== false;

        const percent = Math.min((value / max) * 100, 100);

        return `
          <div class="widget widget-progress-bar">
            ${label ? `<div class="progress-label">${label}</div>` : ''}
            <div class="progress-container">
              <div class="progress-bar" style="width: ${percent}%; background: ${color}">
                ${showPercent ? `<span class="progress-text">${percent.toFixed(0)}%</span>` : ''}
              </div>
            </div>
          </div>
          <style>
            .widget-progress-bar {
              padding: var(--space-sm);
            }
            .progress-label {
              margin-bottom: var(--space-xs);
              font-size: var(--size-sm);
              color: var(--text-muted);
            }
            .progress-container {
              height: 24px;
              background: var(--bg-input);
              border-radius: var(--radius-full);
              overflow: hidden;
            }
            .progress-bar {
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: width 500ms ease;
              border-radius: var(--radius-full);
            }
            .progress-text {
              color: white;
              font-size: var(--size-xs);
              font-weight: 600;
            }
          </style>
        `;
      }
    });

    // Table Advanced
    this.register('table-advanced', {
      render: (data, config, context) => {
        const columns = config.columns || [];
        const rows = Array.isArray(data) ? data : [];
        const sortable = config.sortable !== false;
        const filterable = config.filterable !== false;
        const pagination = config.pagination !== false;
        const pageSize = config.pageSize || 10;

        // Headers
        const headers = columns.map(col => {
          const sortIcon = sortable ? ' <span class="sort-icon">⇅</span>' : '';
          return `<th data-key="${col.key}">${col.label || col.key}${sortIcon}</th>`;
        }).join('');

        // Rows
        const tableRows = rows.slice(0, pageSize).map(row => {
          const cells = columns.map(col => {
            let value = row[col.key];

            // Formatear según tipo
            if (col.format) {
              if (col.format === 'date') {
                value = new Date(value).toLocaleDateString();
              } else if (col.format === 'currency') {
                value = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
              } else if (col.format === 'number') {
                value = Number(value).toLocaleString();
              }
            }

            // Badge para enums
            if (col.type === 'enum') {
              value = `<span class="badge badge-primary">${value}</span>`;
            }

            return `<td>${value || '-'}</td>`;
          }).join('');

          return `<tr>${cells}</tr>`;
        }).join('');

        return `
          <div class="widget widget-table-advanced">
            ${filterable ? '<input type="text" class="table-filter" placeholder="Buscar...">' : ''}
            <div class="table-wrapper">
              <table class="table" data-sortable="${sortable}">
                <thead><tr>${headers}</tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
            ${pagination ? `
              <div class="table-pagination">
                <button class="btn btn-sm btn-secondary" disabled>← Anterior</button>
                <span class="pagination-info">Página 1 de ${Math.ceil(rows.length / pageSize)}</span>
                <button class="btn btn-sm btn-secondary">Siguiente →</button>
              </div>
            ` : ''}
          </div>
          <style>
            .widget-table-advanced {
              background: var(--bg-card);
              border: 1px solid var(--border);
              border-radius: var(--radius-lg);
              padding: var(--space-md);
            }
            .table-filter {
              width: 100%;
              padding: var(--space-sm) var(--space-md);
              margin-bottom: var(--space-md);
              background: var(--bg-input);
              border: 1px solid var(--border);
              border-radius: var(--radius-md);
              color: var(--text);
            }
            .sort-icon {
              font-size: var(--size-xs);
              color: var(--text-muted);
            }
            .table-pagination {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: var(--space-md);
              padding-top: var(--space-md);
              border-top: 1px solid var(--border);
            }
            .pagination-info {
              font-size: var(--size-sm);
              color: var(--text-muted);
            }
          </style>
        `;
      }
    });

    // List
    this.register('list', {
      render: (data, config, context) => {
        const items = Array.isArray(data) ? data : [];
        const template = config.template || ((item) => JSON.stringify(item));

        const rendered = items.map(item => {
          const content = typeof template === 'function' ? template(item) : template;
          return `<li class="list-item">${content}</li>`;
        }).join('');

        return `
          <ul class="widget widget-list">
            ${rendered}
          </ul>
          <style>
            .widget-list {
              list-style: none;
              padding: 0;
            }
            .list-item {
              padding: var(--space-sm) var(--space-md);
              border-bottom: 1px solid var(--border);
            }
            .list-item:last-child {
              border-bottom: none;
            }
            .list-item:hover {
              background: var(--bg-hover);
            }
          </style>
        `;
      }
    });

    // Activity Feed
    this.register('activity-feed', {
      render: (data, config, context) => {
        const activities = Array.isArray(data) ? data : [];

        const items = activities.map(activity => {
          const icon = activity.icon || '•';
          const title = activity.title || activity.message;
          const time = activity.time ? new Date(activity.time).toLocaleString() : '';
          const color = activity.color || 'var(--text-muted)';

          return `
            <div class="activity-item">
              <div class="activity-icon" style="color: ${color}">${icon}</div>
              <div class="activity-content">
                <div class="activity-title">${title}</div>
                ${time ? `<div class="activity-time">${time}</div>` : ''}
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="widget widget-activity-feed">
            ${items}
          </div>
          <style>
            .widget-activity-feed {
              display: flex;
              flex-direction: column;
              gap: var(--space-md);
            }
            .activity-item {
              display: flex;
              gap: var(--space-md);
              align-items: start;
            }
            .activity-icon {
              font-size: 1.5rem;
              flex-shrink: 0;
            }
            .activity-content {
              flex: 1;
            }
            .activity-title {
              color: var(--text);
            }
            .activity-time {
              font-size: var(--size-xs);
              color: var(--text-muted);
              margin-top: var(--space-xs);
            }
          </style>
        `;
      }
    });

    // Chart (placeholder para integración con Chart.js)
    this.register('chart', {
      render: (data, config, context) => {
        const type = config.type || 'line';
        const chartId = `chart-${Math.random().toString(36).substr(2, 9)}`;

        return `
          <div class="widget widget-chart">
            <canvas id="${chartId}"></canvas>
            <script>
              // TODO: Integrar Chart.js
              console.log('[Widget] Chart placeholder:', {
                id: '${chartId}',
                type: '${type}',
                data: ${JSON.stringify(data)}
              });
            </script>
          </div>
          <style>
            .widget-chart {
              padding: var(--space-md);
              background: var(--bg-card);
              border: 1px solid var(--border);
              border-radius: var(--radius-lg);
            }
            .widget-chart canvas {
              max-width: 100%;
            }
          </style>
        `;
      }
    });

    // Badge
    this.register('badge', {
      render: (data, config, context) => {
        const label = config.label || data?.label || data;
        const variant = config.variant || data?.variant || 'primary';
        const size = config.size || 'md';

        return `
          <span class="badge badge-${variant} badge-${size}">${label}</span>
        `;
      }
    });

    // Alert
    this.register('alert', {
      render: (data, config, context) => {
        const message = config.message || data?.message || data;
        const type = config.type || data?.type || 'info';
        const dismissible = config.dismissible !== false;

        return `
          <div class="widget widget-alert alert-${type}">
            <span class="alert-message">${message}</span>
            ${dismissible ? '<button class="alert-close" onclick="this.parentElement.remove()">×</button>' : ''}
          </div>
          <style>
            .widget-alert {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: var(--space-md);
              border-radius: var(--radius-md);
              margin-bottom: var(--space-sm);
            }
            .alert-info { background: var(--info); color: white; }
            .alert-success { background: var(--success); color: white; }
            .alert-warning { background: var(--warning); color: var(--bg); }
            .alert-danger { background: var(--danger); color: white; }
            .alert-close {
              background: transparent;
              border: none;
              color: inherit;
              font-size: 1.5rem;
              cursor: pointer;
              padding: 0;
              line-height: 1;
            }
          </style>
        `;
      }
    });

    // Empty State
    this.register('empty-state', {
      render: (data, config, context) => {
        const icon = config.icon || '📭';
        const title = config.title || 'No hay datos';
        const message = config.message || '';
        const action = config.action;

        return `
          <div class="widget widget-empty-state">
            <div class="empty-icon">${icon}</div>
            <div class="empty-title">${title}</div>
            ${message ? `<div class="empty-message">${message}</div>` : ''}
            ${action ? `
              <button class="btn btn-primary" onclick="${action.onClick}">
                ${action.label}
              </button>
            ` : ''}
          </div>
          <style>
            .widget-empty-state {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: var(--space-2xl);
              text-align: center;
            }
            .empty-icon {
              font-size: 4rem;
              margin-bottom: var(--space-md);
              opacity: 0.5;
            }
            .empty-title {
              font-size: var(--size-lg);
              font-weight: 600;
              margin-bottom: var(--space-xs);
            }
            .empty-message {
              color: var(--text-muted);
              margin-bottom: var(--space-md);
            }
          </style>
        `;
      }
    });
  }

  // ==========================================
  // Utilities
  // ==========================================

  /**
   * Renderiza error
   */
  renderError(name, message) {
    return `
      <div class="widget-error">
        <span class="widget-error-icon">⚠️</span>
        <span class="widget-error-message">Error rendering widget '${name}': ${message}</span>
      </div>
    `;
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      widgets: this.widgets.size
    };
  }
}

module.exports = WidgetFactory;
