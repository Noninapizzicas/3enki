/**
 * PromptSelector Component
 * Selector de prompts guardados con búsqueda y categorías
 * @version 1.0.0
 */

class PromptSelector {
  constructor(element, config = {}) {
    this.element = element;
    this.config = { ...this.parseConfig(), ...config };
    this.prompts = [];
    this.filteredPrompts = [];
    this.selectedPrompt = null;

    this.init();
  }

  parseConfig() {
    const config = {};
    config.variant = this.element.getAttribute('data-variant') || 'panel';
    config.endpoint = this.element.getAttribute('data-endpoint') || '/modules/prompt-manager/prompts';
    config.scope = this.element.getAttribute('data-scope') || 'all';
    config.showVersioning = this.element.getAttribute('data-show-versioning') !== 'false';
    config.enableCreate = this.element.getAttribute('data-enable-create') !== 'false';
    config.enableEdit = this.element.getAttribute('data-enable-edit') !== 'false';
    config.showPreview = this.element.getAttribute('data-show-preview') !== 'false';
    config.searchEnabled = this.element.getAttribute('data-search-enabled') !== 'false';

    const categoriesAttr = this.element.getAttribute('data-categories');
    config.categories = categoriesAttr ? JSON.parse(categoriesAttr) : ['menu', 'product', 'support', 'general'];

    return config;
  }

  init() {
    this.render();
    this.attachEventListeners();
    this.loadPrompts();
  }

  render() {
    this.element.classList.add('prompt-selector');
    this.element.classList.add(`prompt-selector--${this.config.variant}`);

    this.element.innerHTML = `
      ${this.config.searchEnabled ? `
        <div class="prompt-selector__search">
          <input type="text" class="prompt-selector__search-input" placeholder="Buscar prompts..." />
        </div>
      ` : ''}

      <div class="prompt-selector__categories">
        <button class="prompt-selector__category-btn active" data-category="all">Todos</button>
        ${this.config.categories.map(cat => `
          <button class="prompt-selector__category-btn" data-category="${cat}">
            ${this.capitalize(cat)}
          </button>
        `).join('')}
      </div>

      <div class="prompt-selector__list">
        <!-- Prompts will be rendered here -->
      </div>

      ${this.config.showPreview ? `
        <div class="prompt-selector__preview" style="display: none;">
          <div class="prompt-selector__preview-title"></div>
          <div class="prompt-selector__preview-content"></div>
        </div>
      ` : ''}

      ${this.config.enableCreate ? `
        <button class="prompt-selector__create-btn">+ Crear Nuevo Prompt</button>
      ` : ''}
    `;

    this.listElement = this.element.querySelector('.prompt-selector__list');
    this.searchInput = this.element.querySelector('.prompt-selector__search-input');
    this.previewElement = this.element.querySelector('.prompt-selector__preview');
  }

  attachEventListeners() {
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    }

    const categoryButtons = this.element.querySelectorAll('.prompt-selector__category-btn');
    categoryButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        categoryButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.filterByCategory(e.target.getAttribute('data-category'));
      });
    });

    const createBtn = this.element.querySelector('.prompt-selector__create-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.createPrompt());
    }
  }

  async loadPrompts() {
    try {
      const response = await fetch(this.config.endpoint);
      this.prompts = await response.json();
      this.filteredPrompts = [...this.prompts];
      this.renderPrompts();
    } catch (error) {
      console.error('Error loading prompts:', error);
    }
  }

  renderPrompts() {
    if (this.filteredPrompts.length === 0) {
      this.listElement.innerHTML = '<div class="prompt-selector__empty">No hay prompts disponibles</div>';
      return;
    }

    this.listElement.innerHTML = this.filteredPrompts.map(prompt => `
      <div class="prompt-selector__item" data-prompt-id="${prompt.id}">
        <div class="prompt-selector__item-header">
          <div class="prompt-selector__item-title">${prompt.name}</div>
          ${this.config.showVersioning && prompt.version ? `
            <div class="prompt-selector__item-version">v${prompt.version}</div>
          ` : ''}
        </div>
        <div class="prompt-selector__item-category">${prompt.category || 'general'}</div>
        <div class="prompt-selector__item-actions">
          <button class="prompt-selector__action-btn" data-action="select">Usar</button>
          ${this.config.enableEdit ? `<button class="prompt-selector__action-btn" data-action="edit">✏️</button>` : ''}
        </div>
      </div>
    `).join('');

    this.attachPromptListeners();
  }

  attachPromptListeners() {
    const items = this.element.querySelectorAll('.prompt-selector__item');
    items.forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('prompt-selector__action-btn')) {
          const action = e.target.getAttribute('data-action');
          const promptId = item.getAttribute('data-prompt-id');
          this.handlePromptAction(action, promptId);
        } else {
          const promptId = item.getAttribute('data-prompt-id');
          this.showPreview(promptId);
        }
      });
    });
  }

  handleSearch(query) {
    this.filteredPrompts = this.prompts.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.content && p.content.toLowerCase().includes(query.toLowerCase()))
    );
    this.renderPrompts();
  }

  filterByCategory(category) {
    if (category === 'all') {
      this.filteredPrompts = [...this.prompts];
    } else {
      this.filteredPrompts = this.prompts.filter(p => p.category === category);
    }
    this.renderPrompts();
  }

  showPreview(promptId) {
    const prompt = this.prompts.find(p => p.id === promptId);
    if (!prompt || !this.previewElement) return;

    this.selectedPrompt = prompt;
    this.previewElement.style.display = 'block';
    this.previewElement.querySelector('.prompt-selector__preview-title').textContent = prompt.name;
    this.previewElement.querySelector('.prompt-selector__preview-content').textContent = prompt.content || '';
  }

  handlePromptAction(action, promptId) {
    const prompt = this.prompts.find(p => p.id === promptId);

    if (action === 'select') {
      this.dispatchEvent('promptSelected', { prompt });
    } else if (action === 'edit') {
      this.dispatchEvent('promptEdit', { prompt });
    }
  }

  createPrompt() {
    this.dispatchEvent('promptCreate');
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(`promptselector:${eventName}`, {
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
  window.AutoUI.components['prompt-selector'] = PromptSelector;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPromptSelectors);
  } else {
    initPromptSelectors();
  }
}

function initPromptSelectors() {
  document.querySelectorAll('[data-component="prompt-selector"]').forEach(element => {
    if (!element.__promptSelector) {
      element.__promptSelector = new PromptSelector(element);
    }
  });
}
