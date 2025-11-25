/**
 * Auto-UI Component System v2.0
 *
 * Sistema declarativo de componentes reutilizables
 */

class ComponentSystem {
  constructor(options = {}) {
    this.logger = options.logger || console;

    // Registry de componentes
    this.components = new Map();
    this.templates = new Map();
    this.validators = new Map();

    // Cache
    this.cache = new Map();
    this.cacheSize = options.cacheSize || 200;

    // Stats
    this.stats = {
      registered: 0,
      rendered: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  // ==========================================
  // Component Registration
  // ==========================================

  /**
   * Registra un componente
   *
   * @param {string} name - Nombre del componente
   * @param {Object} definition - Definición del componente
   */
  register(name, definition) {
    if (!name || typeof name !== 'string') {
      throw new Error('Component name is required');
    }

    if (!definition) {
      throw new Error('Component definition is required');
    }

    // Validar definición
    this.validateDefinition(definition);

    // Normalizar definición
    const normalized = this.normalizeDefinition(definition);

    // Registrar
    this.components.set(name, normalized);
    this.stats.registered++;

    this.logger.info(`[ComponentSystem] Registered: ${name}`);

    return this;
  }

  /**
   * Registra múltiples componentes
   */
  registerMany(components) {
    for (const [name, definition] of Object.entries(components)) {
      this.register(name, definition);
    }
    return this;
  }

  /**
   * Obtiene un componente registrado
   */
  get(name) {
    return this.components.get(name);
  }

  /**
   * Verifica si existe un componente
   */
  has(name) {
    return this.components.has(name);
  }

  /**
   * Lista todos los componentes
   */
  list() {
    return Array.from(this.components.keys());
  }

  /**
   * Lista componentes por categoría
   */
  listByCategory(category) {
    return Array.from(this.components.entries())
      .filter(([_, def]) => def.metadata?.category === category)
      .map(([name, _]) => name);
  }

  // ==========================================
  // Component Rendering
  // ==========================================

  /**
   * Renderiza un componente
   *
   * @param {string} name - Nombre del componente
   * @param {Object} props - Propiedades
   * @param {Object} context - Contexto de renderizado
   * @returns {string} HTML renderizado
   */
  render(name, props = {}, context = {}) {
    const startTime = Date.now();

    // Verificar si existe
    const component = this.components.get(name);
    if (!component) {
      this.logger.warn(`[ComponentSystem] Component not found: ${name}`);
      return this.renderError(name, 'Component not found');
    }

    try {
      // Cache key
      const cacheKey = this.getCacheKey(name, props);

      // Check cache
      if (this.cache.has(cacheKey)) {
        this.stats.cacheHits++;
        return this.cache.get(cacheKey);
      }

      this.stats.cacheMisses++;

      // Merge props con defaults
      const mergedProps = this.mergeProps(component, props);

      // Validar props
      if (component.validate) {
        const validation = component.validate(mergedProps);
        if (!validation.valid) {
          return this.renderError(name, `Validation error: ${validation.errors.join(', ')}`);
        }
      }

      // Renderizar
      let html;
      if (typeof component.render === 'function') {
        html = component.render(mergedProps, context);
      } else if (component.template) {
        html = this.renderTemplate(component.template, mergedProps, context);
      } else {
        html = this.renderDefault(name, mergedProps, component);
      }

      // Wrap con metadata
      html = this.wrapComponent(name, html, mergedProps, component);

      // Cache
      this.cacheSet(cacheKey, html);

      // Stats
      this.stats.rendered++;
      const duration = Date.now() - startTime;

      this.logger.debug(`[ComponentSystem] Rendered ${name} in ${duration}ms`);

      return html;

    } catch (error) {
      this.logger.error(`[ComponentSystem] Render error for ${name}:`, error);
      return this.renderError(name, error.message);
    }
  }

  /**
   * Renderiza múltiples componentes
   */
  renderMany(components, context = {}) {
    return components.map(comp => {
      if (typeof comp === 'string') {
        return this.render(comp, {}, context);
      } else {
        return this.render(comp.component, comp.props || {}, context);
      }
    }).join('\n');
  }

  // ==========================================
  // Template Rendering
  // ==========================================

  /**
   * Renderiza un template con props
   */
  renderTemplate(template, props, context) {
    let html = template;

    // Replace variables: {{prop}}
    html = html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return this.escapeHtml(props[key] || '');
    });

    // Replace expressions: {{@context.value}}
    html = html.replace(/\{\{@(\w+)\.(\w+)\}\}/g, (match, obj, key) => {
      if (obj === 'context' && context[key] !== undefined) {
        return this.escapeHtml(context[key]);
      }
      return '';
    });

    // Conditionals: {{#if prop}}...{{/if}}
    html = html.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
      return props[key] ? content : '';
    });

    // Loops: {{#each items}}...{{/each}}
    html = html.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, template) => {
      const items = props[key] || [];
      return items.map(item => {
        return this.renderTemplate(template, item, context);
      }).join('');
    });

    return html;
  }

  // ==========================================
  // Default Renderers
  // ==========================================

  /**
   * Renderizado por defecto según tipo
   */
  renderDefault(name, props, component) {
    const type = component.metadata?.type || 'unknown';

    switch (type) {
      case 'button':
        return this.renderButton(props, component);
      case 'input':
        return this.renderInput(props, component);
      case 'card':
        return this.renderCard(props, component);
      case 'table':
        return this.renderTable(props, component);
      default:
        return this.renderGeneric(name, props, component);
    }
  }

  /**
   * Renderiza un botón
   */
  renderButton(props, component) {
    const variant = props.variant || 'primary';
    const size = props.size || 'md';
    const disabled = props.disabled ? 'disabled' : '';

    const classes = [
      'btn',
      `btn-${variant}`,
      `btn-${size}`,
      props.className
    ].filter(Boolean).join(' ');

    const attrs = [];
    if (props.onClick) attrs.push(`onclick="${this.escapeHtml(props.onClick)}"`);
    if (props.type) attrs.push(`type="${props.type}"`);
    if (props.id) attrs.push(`id="${props.id}"`);

    // HTMX attributes
    if (props.hxGet) attrs.push(`hx-get="${props.hxGet}"`);
    if (props.hxPost) attrs.push(`hx-post="${props.hxPost}"`);
    if (props.hxTarget) attrs.push(`hx-target="${props.hxTarget}"`);

    return `
      <button class="${classes}" ${attrs.join(' ')} ${disabled}>
        ${props.icon ? `<span class="btn-icon">${props.icon}</span>` : ''}
        ${props.label ? `<span class="btn-label">${this.escapeHtml(props.label)}</span>` : ''}
        ${props.children || ''}
      </button>
    `;
  }

  /**
   * Renderiza un input
   */
  renderInput(props, component) {
    const type = props.type || 'text';
    const value = props.value || '';
    const placeholder = props.placeholder || '';
    const required = props.required ? 'required' : '';
    const disabled = props.disabled ? 'disabled' : '';

    return `
      <div class="form-group">
        ${props.label ? `<label class="form-label">${this.escapeHtml(props.label)}</label>` : ''}
        <input
          type="${type}"
          name="${props.name || ''}"
          class="form-input ${props.className || ''}"
          value="${this.escapeHtml(value)}"
          placeholder="${this.escapeHtml(placeholder)}"
          ${required}
          ${disabled}
        />
        ${props.error ? `<span class="form-error">${this.escapeHtml(props.error)}</span>` : ''}
        ${props.help ? `<span class="form-help">${this.escapeHtml(props.help)}</span>` : ''}
      </div>
    `;
  }

  /**
   * Renderiza una card
   */
  renderCard(props, component) {
    const variant = props.variant || 'default';
    const classes = ['card', `card-${variant}`, props.className].filter(Boolean).join(' ');

    return `
      <div class="${classes}">
        ${props.header ? `<div class="card-header">${props.header}</div>` : ''}
        <div class="card-body">
          ${props.children || props.content || ''}
        </div>
        ${props.footer ? `<div class="card-footer">${props.footer}</div>` : ''}
      </div>
    `;
  }

  /**
   * Renderiza una tabla
   */
  renderTable(props, component) {
    const columns = props.columns || [];
    const data = props.data || [];

    const headers = columns.map(col =>
      `<th>${this.escapeHtml(col.label || col.key)}</th>`
    ).join('');

    const rows = data.map(row => {
      const cells = columns.map(col => {
        const value = row[col.key];
        return `<td>${this.escapeHtml(value)}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `
      <div class="table-wrapper">
        <table class="table">
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * Renderizado genérico
   */
  renderGeneric(name, props, component) {
    return `
      <div class="component component-${name}" data-component="${name}">
        ${props.children || JSON.stringify(props, null, 2)}
      </div>
    `;
  }

  // ==========================================
  // Utilities
  // ==========================================

  /**
   * Valida definición de componente
   */
  validateDefinition(definition) {
    if (!definition.metadata) {
      throw new Error('Component definition must have metadata');
    }

    if (!definition.render && !definition.template) {
      throw new Error('Component must have either render function or template');
    }

    return true;
  }

  /**
   * Normaliza definición
   */
  normalizeDefinition(definition) {
    return {
      metadata: {
        type: 'custom',
        category: 'unknown',
        version: '1.0.0',
        ...definition.metadata
      },
      schema: definition.schema || {},
      props: definition.props || {},
      defaults: definition.defaults || {},
      render: definition.render,
      template: definition.template,
      validate: definition.validate,
      styles: definition.styles || {},
      events: definition.events || {}
    };
  }

  /**
   * Merge props con defaults
   */
  mergeProps(component, props) {
    return {
      ...component.defaults,
      ...props
    };
  }

  /**
   * Genera cache key
   */
  getCacheKey(name, props) {
    const propsHash = JSON.stringify(props);
    return `${name}:${this.hashCode(propsHash)}`;
  }

  /**
   * Hash simple
   */
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Cache set con LRU
   */
  cacheSet(key, value) {
    if (this.cache.size >= this.cacheSize) {
      // Remove oldest
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  /**
   * Wrap component con metadata
   */
  wrapComponent(name, html, props, component) {
    if (props.unwrapped) return html;

    return `
      <div class="component-wrapper" data-component="${name}" data-version="${component.metadata.version}">
        ${html}
      </div>
    `;
  }

  /**
   * Renderiza error
   */
  renderError(name, message) {
    return `
      <div class="component-error" data-component="${name}">
        <span class="component-error-icon">⚠️</span>
        <span class="component-error-message">Error rendering ${name}: ${this.escapeHtml(message)}</span>
      </div>
    `;
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

  /**
   * Limpia cache
   */
  clearCache() {
    this.cache.clear();
    this.logger.info('[ComponentSystem] Cache cleared');
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      hitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)
    };
  }
}

module.exports = ComponentSystem;
