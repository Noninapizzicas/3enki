/**
 * ResultPreviewCard Component
 * Card de preview de resultados con estados y acciones
 * @version 1.0.0
 */

class ResultPreviewCard {
  constructor(element, config = {}) {
    this.element = element;
    this.config = { ...this.parseConfig(), ...config };
    this.data = this.config.data || null;
    this.expanded = this.config.expanded;

    this.init();
  }

  parseConfig() {
    const config = {};
    config.variant = this.element.getAttribute('data-variant') || 'generic';
    config.status = this.element.getAttribute('data-status') || 'pending';
    config.dataFormat = this.element.getAttribute('data-data-format') || 'json';
    config.endpoint = this.element.getAttribute('data-endpoint');
    config.title = this.element.getAttribute('data-title') || 'Preview';
    config.showActions = this.element.getAttribute('data-show-actions') !== 'false';
    config.expandable = this.element.getAttribute('data-expandable') !== 'false';
    config.expanded = this.element.getAttribute('data-expanded') === 'true';
    config.highlightChanges = this.element.getAttribute('data-highlight-changes') === 'true';
    config.maxHeight = this.element.getAttribute('data-max-height') || '500px';
    config.loadOnInit = this.element.getAttribute('data-load-on-init') !== 'false';

    const dataAttr = this.element.getAttribute('data-data');
    config.data = dataAttr ? JSON.parse(dataAttr) : null;

    const actionsAttr = this.element.getAttribute('data-actions');
    config.actions = actionsAttr ? JSON.parse(actionsAttr) : [];

    return config;
  }

  init() {
    this.render();
    this.attachEventListeners();

    if (this.config.loadOnInit && this.config.endpoint && !this.data) {
      this.loadData();
    }
  }

  render() {
    this.element.classList.add('result-preview-card');
    this.element.classList.add(`result-preview-card--${this.config.variant}`);
    this.element.classList.add(`result-preview-card--${this.config.status}`);

    const statusIcons = {
      pending: '⏳',
      processing: '⚙️',
      completed: '✅',
      error: '❌'
    };

    this.element.innerHTML = `
      <div class="result-preview-card__header">
        <div class="result-preview-card__title">
          <span class="result-preview-card__status-icon">${statusIcons[this.config.status]}</span>
          <span class="result-preview-card__title-text">${this.config.title}</span>
        </div>

        ${this.config.expandable ? `
          <button class="result-preview-card__expand-btn" aria-label="${this.expanded ? 'Colapsar' : 'Expandir'}">
            ${this.expanded ? '▼' : '▶'}
          </button>
        ` : ''}
      </div>

      <div class="result-preview-card__body ${this.expanded ? '' : 'result-preview-card__body--collapsed'}" style="max-height: ${this.config.maxHeight}">
        ${this.renderData()}
      </div>

      ${this.config.showActions && this.config.actions.length > 0 ? `
        <div class="result-preview-card__actions">
          ${this.config.actions.map(action => `
            <button class="result-preview-card__action-btn" data-action="${action.action}">
              ${action.icon} ${action.label}
            </button>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  renderData() {
    if (!this.data) {
      return '<div class="result-preview-card__empty">No hay datos para mostrar</div>';
    }

    if (this.config.status === 'processing') {
      return '<div class="result-preview-card__spinner">⏳ Procesando...</div>';
    }

    switch (this.config.dataFormat) {
      case 'json':
        return this.renderJSON();
      case 'table':
        return this.renderTable();
      case 'cards':
        return this.renderCards();
      case 'list':
        return this.renderList();
      default:
        return this.renderJSON();
    }
  }

  renderJSON() {
    const json = JSON.stringify(this.data, null, 2);
    return `<pre class="result-preview-card__json"><code>${this.escapeHtml(json)}</code></pre>`;
  }

  renderTable() {
    const items = Array.isArray(this.data) ? this.data : [this.data];
    if (items.length === 0) return '<div class="result-preview-card__empty">Sin datos</div>';

    const keys = Object.keys(items[0]);

    return `
      <table class="result-preview-card__table">
        <thead>
          <tr>
            ${keys.map(key => `<th>${key}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              ${keys.map(key => `<td>${this.escapeHtml(String(item[key] || ''))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  renderCards() {
    const items = Array.isArray(this.data) ? this.data : [this.data];

    return `
      <div class="result-preview-card__cards">
        ${items.map((item, index) => `
          <div class="result-preview-card__card">
            <div class="result-preview-card__card-title">${item.name || item.title || `Item ${index + 1}`}</div>
            <div class="result-preview-card__card-content">
              ${Object.entries(item).map(([key, value]) => `
                <div class="result-preview-card__card-field">
                  <strong>${key}:</strong> ${this.escapeHtml(String(value))}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderList() {
    const items = Array.isArray(this.data) ? this.data : [this.data];

    return `
      <ul class="result-preview-card__list">
        ${items.map(item => `
          <li class="result-preview-card__list-item">
            ${item.name || item.title || JSON.stringify(item)}
          </li>
        `).join('')}
      </ul>
    `;
  }

  attachEventListeners() {
    const expandBtn = this.element.querySelector('.result-preview-card__expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => this.toggleExpand());
    }

    const actionButtons = this.element.querySelectorAll('.result-preview-card__action-btn');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.closest('button').getAttribute('data-action');
        this.handleAction(action);
      });
    });
  }

  toggleExpand() {
    this.expanded = !this.expanded;
    const body = this.element.querySelector('.result-preview-card__body');
    const btn = this.element.querySelector('.result-preview-card__expand-btn');

    if (this.expanded) {
      body.classList.remove('result-preview-card__body--collapsed');
      btn.textContent = '▼';
      btn.setAttribute('aria-label', 'Colapsar');
    } else {
      body.classList.add('result-preview-card__body--collapsed');
      btn.textContent = '▶';
      btn.setAttribute('aria-label', 'Expandir');
    }
  }

  async loadData() {
    try {
      this.setStatus('processing');
      const response = await fetch(this.config.endpoint);
      this.data = await response.json();
      this.setStatus('completed');
      this.render();
      this.attachEventListeners();
    } catch (error) {
      console.error('Error loading data:', error);
      this.setStatus('error');
    }
  }

  handleAction(action) {
    this.dispatchEvent('action', { action, data: this.data });
  }

  setStatus(status) {
    this.config.status = status;
    this.render();
    this.attachEventListeners();
  }

  setData(data) {
    this.data = data;
    this.render();
    this.attachEventListeners();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(`resultpreviewcard:${eventName}`, {
      detail,
      bubbles: true
    });
    this.element.dispatchEvent(event);
  }
}

// Auto-initialize
if (typeof window !== 'undefined') {
  window.AutoUI = window.AutoUI || {};
  window.AutoUI.components = window.AutoUI.components || {};
  window.AutoUI.components['result-preview-card'] = ResultPreviewCard;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResultPreviewCards);
  } else {
    initResultPreviewCards();
  }
}

function initResultPreviewCards() {
  document.querySelectorAll('[data-component="result-preview-card"]').forEach(element => {
    if (!element.__resultPreviewCard) {
      element.__resultPreviewCard = new ResultPreviewCard(element);
    }
  });
}
