/**
 * Event Core - Detail View Renderer
 *
 * Renders detailed view of a single record
 */

export class DetailView {
  async render(viewDef, data = null, options = {}) {
    const html = this.generateHTML(viewDef, data);
    const js = this.generateJS(viewDef);

    return { html, css: '', js };
  }

  generateHTML(viewDef, data) {
    const { id, title, description, fields, actions = [], layout = 'vertical' } = viewDef;

    const layoutClass = layout === 'horizontal' ? 'd-grid' : 'd-flex flex-column';
    const gridStyle = layout === 'horizontal' ? 'style="grid-template-columns: repeat(2, 1fr); gap: var(--spacing-4);"' : '';

    return `
<div class="view-detail" id="${id}">
  ${title ? `<div class="page-header">
    <h2 class="page-title">${title}</h2>
    ${description ? `<p class="page-description">${description}</p>` : ''}
    <div class="page-actions">
      ${this.renderActions(actions)}
    </div>
  </div>` : ''}

  <div class="card">
    <div class="card-body">
      <div class="${layoutClass}" ${gridStyle}>
        ${fields.map(field => this.renderField(field, data)).join('')}
      </div>
    </div>
  </div>
</div>
    `.trim();
  }

  renderField(field, data) {
    const value = data ? data[field.name] : '';
    const formattedValue = this.formatValue(value, field);

    return `
<div class="detail-field">
  <dt class="detail-label">${field.label}</dt>
  <dd class="detail-value">${formattedValue}</dd>
</div>
    `.trim();
  }

  formatValue(value, field) {
    if (value === null || value === undefined || value === '') {
      return '<span class="text-muted">—</span>';
    }

    switch (field.type) {
      case 'badge':
        return `<span class="badge badge-primary">${value}</span>`;
      case 'boolean':
        return value ? '✓ Sí' : '✗ No';
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'datetime':
        return new Date(value).toLocaleString();
      case 'link':
        return `<a href="${value}" target="_blank" class="text-primary">${value}</a>`;
      case 'email':
        return `<a href="mailto:${value}" class="text-primary">${value}</a>`;
      default:
        return this.escapeHTML(String(value));
    }
  }

  renderActions(actions) {
    return actions.map(action => {
      const btnClass = `btn btn-${action.variant || 'primary'}`;
      return `
        <button class="${btnClass}" data-action="${action.id}"
                onclick="EventCoreUI.handleAction('${action.id}', this)">
          ${action.icon ? action.icon + ' ' : ''}${action.label}
        </button>
      `;
    }).join('');
  }

  generateJS(viewDef) {
    const { id, api } = viewDef;

    return `
(function() {
  const detail = {
    id: '${id}',
    async loadData(recordId) {
      if (!${JSON.stringify(api)}) return;

      try {
        const url = '${api?.url || ''}'.replace(':id', recordId);
        const response = await EventCoreUI.api.get(url);
        this.render(response);
      } catch (error) {
        console.error('Error loading detail:', error);
        EventCoreUI.showError('Failed to load data');
      }
    },

    render(data) {
      // Update field values
      Object.keys(data).forEach(key => {
        const el = document.querySelector(\`[data-field="\${key}"]\`);
        if (el) el.textContent = data[key];
      });
    }
  };

  if (!window.EventCoreUI.details) window.EventCoreUI.details = {};
  window.EventCoreUI.details['${id}'] = detail;
})();
    `.trim();
  }

  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

export default DetailView;
