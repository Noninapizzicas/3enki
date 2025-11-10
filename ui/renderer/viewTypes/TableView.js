/**
 * Event Core - Table View Renderer
 *
 * Renders data tables with sorting, filtering, pagination
 */

export class TableView {
  /**
   * Render a table view
   *
   * @param {Object} viewDef - Normalized view definition
   * @param {Object} data - Data to populate (optional)
   * @param {Object} options - Rendering options
   * @returns {Object} - { html, css, js }
   */
  async render(viewDef, data = null, options = {}) {
    const {
      id,
      title,
      description,
      columns,
      actions = [],
      filters = [],
      pagination = true,
      pageSize = 10
    } = viewDef;

    const html = this.generateHTML(viewDef, data);
    const js = this.generateJS(viewDef);

    return { html, css: '', js };
  }

  /**
   * Generate HTML for table view
   */
  generateHTML(viewDef, data) {
    const { id, title, description, columns, actions, filters } = viewDef;
    const rows = data?.items || data || [];

    return `
<div class="view-table" id="${id}">
  ${title ? `<div class="page-header">
    <h2 class="page-title">${title}</h2>
    ${description ? `<p class="page-description">${description}</p>` : ''}
    <div class="page-actions">
      ${this.renderActions(actions, 'global')}
    </div>
  </div>` : ''}

  ${filters && filters.length > 0 ? this.renderFilters(filters) : ''}

  <div class="table-container">
    <table class="table" id="${id}-table">
      <thead>
        <tr>
          ${columns.map(col => `
            <th class="${col.sortable ? 'sortable' : ''}"
                data-field="${col.field}"
                data-sort="none"
                style="width: ${col.width}; text-align: ${col.align};">
              ${col.label}
            </th>
          `).join('')}
          ${actions && actions.length > 0 ? '<th style="width: 120px;">Acciones</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${rows.length > 0 ? rows.map(row => this.renderRow(row, columns, actions)).join('') : `
          <tr>
            <td colspan="${columns.length + (actions.length > 0 ? 1 : 0)}" class="text-center text-muted">
              No hay datos disponibles
            </td>
          </tr>
        `}
      </tbody>
    </table>
  </div>

  ${viewDef.pagination !== false ? this.renderPagination() : ''}
</div>
    `.trim();
  }

  /**
   * Render a single table row
   */
  renderRow(row, columns, actions) {
    return `
<tr data-row-id="${row.id || ''}">
  ${columns.map(col => `
    <td style="text-align: ${col.align};">
      ${this.formatCellValue(row[col.field], col)}
    </td>
  `).join('')}
  ${actions && actions.length > 0 ? `
    <td>
      <div class="d-flex gap-2">
        ${this.renderActions(actions, 'row', row)}
      </div>
    </td>
  ` : ''}
</tr>
    `.trim();
  }

  /**
   * Format cell value based on column type
   */
  formatCellValue(value, column) {
    if (value === null || value === undefined) {
      return '<span class="text-muted">—</span>';
    }

    switch (column.type) {
      case 'badge':
        // Use new status-badge with emoji icons
        return this.renderStatusBadge(value, column);

      case 'boolean':
        return value ? '✓' : '✗';

      case 'date':
        return new Date(value).toLocaleDateString();

      case 'datetime':
        return new Date(value).toLocaleString();

      case 'currency':
        return new Intl.NumberFormat('es-ES', {
          style: 'currency',
          currency: column.currency || 'EUR'
        }).format(value);

      case 'number':
        return new Intl.NumberFormat('es-ES').format(value);

      case 'link':
        return `<a href="${value}" target="_blank" class="text-primary">${value}</a>`;

      default:
        return this.escapeHTML(String(value));
    }
  }

  /**
   * Render status badge with emoji icon
   */
  renderStatusBadge(value, column) {
    const lowercaseValue = String(value).toLowerCase();
    let badgeClass = 'status-badge';
    let emoji = '';

    // Determine status type and emoji
    if (['active', 'success', 'completed', 'done'].includes(lowercaseValue)) {
      badgeClass += ' status-badge-success';
      emoji = '✅';
    } else if (['pending', 'in_progress'].includes(lowercaseValue)) {
      badgeClass += ' status-badge-warning';
      emoji = '⏳';
    } else if (['error', 'failed', 'cancelled', 'inactive'].includes(lowercaseValue)) {
      badgeClass += ' status-badge-danger';
      emoji = '❌';
    } else if (['info', 'draft'].includes(lowercaseValue)) {
      badgeClass += ' status-badge-info';
      emoji = 'ℹ️';
    } else {
      badgeClass += ' status-badge-default';
      emoji = '⚪';
    }

    // Handle priority badges
    if (column.field === 'priority') {
      if (lowercaseValue === 'high') {
        badgeClass = 'status-badge status-badge-danger';
        emoji = '🔴';
      } else if (lowercaseValue === 'medium') {
        badgeClass = 'status-badge status-badge-warning';
        emoji = '🟡';
      } else if (lowercaseValue === 'low') {
        badgeClass = 'status-badge status-badge-success';
        emoji = '🟢';
      }
    }

    return `<span class="${badgeClass}">${emoji} ${this.escapeHTML(value)}</span>`;
  }

  /**
   * Get badge CSS class based on value
   */
  getBadgeClass(value) {
    const lowercaseValue = String(value).toLowerCase();

    if (['active', 'success', 'completed', 'done'].includes(lowercaseValue)) {
      return 'badge-success';
    }
    if (['pending', 'warning', 'in_progress'].includes(lowercaseValue)) {
      return 'badge-warning';
    }
    if (['error', 'failed', 'cancelled', 'inactive'].includes(lowercaseValue)) {
      return 'badge-danger';
    }
    if (['info', 'draft'].includes(lowercaseValue)) {
      return 'badge-info';
    }

    return 'badge-gray';
  }

  /**
   * Render action buttons
   * Global actions: Full buttons with icons
   * Row actions: Icon-only buttons with tooltips
   */
  renderActions(actions, context, row = null) {
    return actions
      .filter(action => !action.context || action.context === context)
      .map(action => {
        const dataAttrs = row ? `data-row-id="${row.id || ''}" data-row='${JSON.stringify(row)}'` : '';
        const isRowAction = context === 'row';

        // Map action IDs to semantic button classes and icons
        const actionMap = {
          create: { class: 'btn-create', icon: '➕', tooltip: 'Crear nuevo' },
          add: { class: 'btn-create', icon: '➕', tooltip: 'Añadir' },
          edit: { class: 'btn-edit', icon: '✏️', tooltip: 'Editar' },
          view: { class: 'btn-view', icon: '👁️', tooltip: 'Ver detalles' },
          delete: { class: 'btn-delete', icon: '🗑️', tooltip: 'Eliminar', longPress: true },
          save: { class: 'btn-save', icon: '💾', tooltip: 'Guardar' },
          cancel: { class: 'btn-cancel', icon: '✕', tooltip: 'Cancelar' },
          download: { class: 'btn-download', icon: '⬇️', tooltip: 'Descargar' },
          upload: { class: 'btn-upload', icon: '⬆️', tooltip: 'Subir' },
          refresh: { class: 'btn-refresh', icon: '🔄', tooltip: 'Actualizar' },
          settings: { class: 'btn-settings', icon: '⚙️', tooltip: 'Configuración' },
        };

        const actionInfo = actionMap[action.id] || {
          class: `btn-${action.variant || 'primary'}`,
          icon: action.icon || '●',
          tooltip: action.label
        };

        if (isRowAction) {
          // Row actions: Icon-only buttons
          const longPressClass = actionInfo.longPress ? ' btn-long-press' : '';
          return `
            <button
              class="btn-icon ${actionInfo.class} btn-sm${longPressClass}"
              data-action="${action.id}"
              data-tooltip="${actionInfo.tooltip}"
              ${dataAttrs}
              onclick="EventCoreUI.handleAction('${action.id}', this)">
              ${actionInfo.icon}
            </button>
          `;
        } else {
          // Global actions: Full buttons with icon + text
          return `
            <button
              class="btn ${actionInfo.class}"
              data-action="${action.id}"
              ${dataAttrs}
              onclick="EventCoreUI.handleAction('${action.id}', this)">
              ${actionInfo.icon} ${action.label}
            </button>
          `;
        }
      })
      .join('');
  }

  /**
   * Render filter controls
   */
  renderFilters(filters) {
    return `
<div class="card mb-4">
  <div class="card-body">
    <div class="d-flex gap-4 items-center">
      ${filters.map(filter => `
        <div class="form-group" style="min-width: 200px;">
          <label class="form-label">${filter.label}</label>
          ${this.renderFilterInput(filter)}
        </div>
      `).join('')}
      <div style="margin-top: 28px;">
        <button class="btn btn-primary" onclick="EventCoreUI.applyFilters()">
          🔍 Filtrar
        </button>
        <button class="btn btn-ghost" onclick="EventCoreUI.clearFilters()">
          ✕ Limpiar
        </button>
      </div>
    </div>
  </div>
</div>
    `.trim();
  }

  /**
   * Render filter input based on type
   */
  renderFilterInput(filter) {
    switch (filter.type) {
      case 'select':
        return `
          <select class="select" data-filter="${filter.field}">
            <option value="">Todos</option>
            ${filter.options.map(opt => `
              <option value="${opt.value}">${opt.label}</option>
            `).join('')}
          </select>
        `;

      case 'date':
        return `
          <input
            type="date"
            class="input"
            data-filter="${filter.field}"
            value="${filter.defaultValue || ''}" />
        `;

      default:
        return `
          <input
            type="text"
            class="input"
            data-filter="${filter.field}"
            placeholder="Buscar..."
            value="${filter.defaultValue || ''}" />
        `;
    }
  }

  /**
   * Render pagination controls
   */
  renderPagination() {
    return `
<div class="d-flex justify-between items-center mt-4">
  <div class="text-sm text-muted">
    Mostrando <span id="pagination-start">0</span> - <span id="pagination-end">0</span> de <span id="pagination-total">0</span>
  </div>
  <ul class="pagination" id="pagination-controls">
    <!-- Pagination buttons will be generated dynamically -->
  </ul>
</div>
    `.trim();
  }

  /**
   * Generate JavaScript for table interactivity
   */
  generateJS(viewDef) {
    const { id, api, columns } = viewDef;

    return `
// Table View: ${id}
(function() {
  const table = {
    id: '${id}',
    data: [],
    filteredData: [],
    currentPage: 1,
    pageSize: ${viewDef.pageSize || 10},
    sortField: null,
    sortDirection: 'asc',

    async loadData() {
      if (!${JSON.stringify(api)}) return;

      try {
        const response = await EventCoreUI.api.request('${api?.method || 'GET'}', '${api?.url || ''}');
        this.data = ${api?.dataPath ? `EventCoreUI.getPath(response, '${api.dataPath}')` : 'response.items || response'};
        this.filteredData = [...this.data];
        this.render();
      } catch (error) {
        console.error('Error loading table data:', error);
        EventCoreUI.showError('Failed to load data');
      }
    },

    render() {
      const start = (this.currentPage - 1) * this.pageSize;
      const end = start + this.pageSize;
      const pageData = this.filteredData.slice(start, end);

      const tbody = document.querySelector('#${id}-table tbody');
      if (!tbody) return;

      tbody.innerHTML = pageData.map(row => this.renderRow(row)).join('');
      this.updatePagination();
    },

    renderRow(row) {
      // Row rendering is handled by server-side template
      // This is a simplified client-side version
      return \`<tr>\${${JSON.stringify(columns)}.map(col =>
        \`<td>\${row[col.field] || '—'}</td>\`
      ).join('')}</tr>\`;
    },

    sort(field) {
      if (this.sortField === field) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortField = field;
        this.sortDirection = 'asc';
      }

      this.filteredData.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        const modifier = this.sortDirection === 'asc' ? 1 : -1;

        if (aVal < bVal) return -1 * modifier;
        if (aVal > bVal) return 1 * modifier;
        return 0;
      });

      this.render();
    },

    updatePagination() {
      const total = this.filteredData.length;
      const start = Math.min((this.currentPage - 1) * this.pageSize + 1, total);
      const end = Math.min(this.currentPage * this.pageSize, total);

      document.getElementById('pagination-start').textContent = start;
      document.getElementById('pagination-end').textContent = end;
      document.getElementById('pagination-total').textContent = total;
    }
  };

  // Load data on mount
  table.loadData();

  // Expose to EventCoreUI
  if (!window.EventCoreUI.tables) window.EventCoreUI.tables = {};
  window.EventCoreUI.tables['${id}'] = table;
})();
    `.trim();
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

export default TableView;
