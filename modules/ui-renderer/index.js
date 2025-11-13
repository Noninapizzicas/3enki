const fs = require('fs');
const path = require('path');

/**
 * UI Renderer Module
 * JSON-driven component system with design system tokens
 * Reads component definitions from ui-components/ and generates HTML/CSS
 */
class UIRendererModule {
  constructor(config, logger, eventBus, coreConfig) {
    this.config = config || {};
    this.logger = logger;
    this.eventBus = eventBus;
    this.coreConfig = coreConfig;

    this.componentsPath = path.join(coreConfig.rootPath, 'ui-components');
    this.tokensPath = path.join(coreConfig.rootPath, 'docs', 'biblioteca_componentes_ui_v1.json');

    this.components = new Map(); // name -> component definition
    this.tokens = null; // Design system tokens
    this.templates = new Map(); // component type -> template function

    this.logger.info({ module: 'ui-renderer' }, 'UI Renderer Module initialized');
  }

  async onLoad() {
    this.logger.info('ui-renderer.loading', 'Loading UI Renderer Module');

    // Load design system tokens
    await this.loadTokens();

    // Load component templates
    this.loadTemplates();

    // Discover and load components
    await this.discoverAndLoadComponents();

    this.logger.info({
      components: this.components.size,
      tokens: !!this.tokens
    }, 'UI Renderer Module loaded');
  }

  async onUnload() {
    this.logger.info('ui-renderer.unloading', 'Unloading UI Renderer Module');
    this.components.clear();
    this.templates.clear();
    this.tokens = null;
  }

  /**
   * Load design system tokens from biblioteca_componentes_ui_v1.json
   */
  async loadTokens() {
    try {
      if (fs.existsSync(this.tokensPath)) {
        const content = fs.readFileSync(this.tokensPath, 'utf-8');
        this.tokens = JSON.parse(content);
        this.logger.info({ tokensPath: this.tokensPath }, 'Design system tokens loaded');
      } else {
        this.logger.warn({ tokensPath: this.tokensPath }, 'Design system tokens file not found');
        this.tokens = this.getDefaultTokens();
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to load design tokens');
      this.tokens = this.getDefaultTokens();
    }
  }

  /**
   * Get default tokens if file not found
   */
  getDefaultTokens() {
    return {
      tokens: {
        color: {
          verde_accion: '#2FBF71',
          ambar_pendiente: '#F5B700',
          rojo_error: '#E63946',
          azul_info: '#1D4ED8',
          gris_base: '#6B7280',
          gris_fondo: '#0F1216'
        },
        espaciado: {
          xs: 4,
          sm: 8,
          md: 12,
          lg: 16
        }
      }
    };
  }

  /**
   * Load component rendering templates
   */
  loadTemplates() {
    // Button template
    this.templates.set('button', (component, props) => {
      const state = props.state || 'default';
      const stateConfig = component.states?.[state] || {};
      const color = stateConfig.color || this.tokens.tokens.color.gris_base;
      const text = props.text || stateConfig.text || component.name;
      const icon = stateConfig.icon || props.icon || '';

      return {
        html: `
          <button class="ui-button ui-button-${state}" data-component="${component.component}">
            ${icon ? `<span class="ui-button-icon">${icon}</span>` : ''}
            <span class="ui-button-text">${text}</span>
          </button>
        `,
        css: `
          .ui-button {
            background-color: ${color};
            color: white;
            border: none;
            border-radius: 12px;
            padding: ${this.tokens.tokens.espaciado.md}px ${this.tokens.tokens.espaciado.lg}px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: ${this.tokens.tokens.espaciado.sm}px;
            min-width: 56px;
            min-height: 56px;
            transition: all 0.2s ease;
          }
          .ui-button:hover {
            filter: brightness(1.1);
            transform: translateY(-2px);
          }
          .ui-button:active {
            transform: translateY(0);
          }
          .ui-button-icon {
            font-size: 18px;
          }
        `
      };
    });

    // Card template
    this.templates.set('card', (component, props) => {
      const title = props.title || 'Card Title';
      const content = props.content || '';
      const footer = props.footer || '';

      return {
        html: `
          <div class="ui-card" data-component="${component.component}">
            ${title ? `<div class="ui-card-header">${title}</div>` : ''}
            <div class="ui-card-body">${content}</div>
            ${footer ? `<div class="ui-card-footer">${footer}</div>` : ''}
          </div>
        `,
        css: `
          .ui-card {
            background-color: #1a1d24;
            border-radius: 12px;
            padding: ${this.tokens.tokens.espaciado.lg}px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
          }
          .ui-card-header {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: ${this.tokens.tokens.espaciado.md}px;
            color: white;
          }
          .ui-card-body {
            color: #d1d5db;
            line-height: 1.6;
          }
          .ui-card-footer {
            margin-top: ${this.tokens.tokens.espaciado.md}px;
            padding-top: ${this.tokens.tokens.espaciado.md}px;
            border-top: 1px solid #374151;
            color: #9ca3af;
            font-size: 12px;
          }
        `
      };
    });

    // Table template
    this.templates.set('table', (component, props) => {
      const columns = props.columns || [];
      const rows = props.rows || [];

      const headerHtml = columns.map(col => `<th>${col.label || col.key}</th>`).join('');
      const rowsHtml = rows.map(row => {
        const cells = columns.map(col => `<td>${row[col.key] || ''}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      return {
        html: `
          <div class="ui-table-wrapper" data-component="${component.component}">
            <table class="ui-table">
              <thead>
                <tr>${headerHtml}</tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        `,
        css: `
          .ui-table-wrapper {
            overflow-x: auto;
            border-radius: 12px;
            background-color: #1a1d24;
          }
          .ui-table {
            width: 100%;
            border-collapse: collapse;
          }
          .ui-table th {
            background-color: #374151;
            color: white;
            padding: ${this.tokens.tokens.espaciado.md}px;
            text-align: left;
            font-weight: 600;
            font-size: 14px;
          }
          .ui-table td {
            padding: ${this.tokens.tokens.espaciado.md}px;
            border-top: 1px solid #374151;
            color: #d1d5db;
            font-size: 14px;
          }
          .ui-table tbody tr:hover {
            background-color: #1f2937;
          }
        `
      };
    });

    // Form template
    this.templates.set('form', (component, props) => {
      const fields = props.fields || [];

      const fieldsHtml = fields.map(field => {
        const type = field.type || 'text';
        const label = field.label || field.name;
        const required = field.required ? 'required' : '';

        return `
          <div class="ui-form-group">
            <label class="ui-form-label">${label}${field.required ? ' *' : ''}</label>
            <input
              type="${type}"
              name="${field.name}"
              class="ui-form-input"
              placeholder="${field.placeholder || ''}"
              ${required}
            />
          </div>
        `;
      }).join('');

      return {
        html: `
          <form class="ui-form" data-component="${component.component}">
            ${fieldsHtml}
            <div class="ui-form-actions">
              <button type="submit" class="ui-form-submit">Submit</button>
              <button type="reset" class="ui-form-reset">Reset</button>
            </div>
          </form>
        `,
        css: `
          .ui-form {
            background-color: #1a1d24;
            padding: ${this.tokens.tokens.espaciado.lg}px;
            border-radius: 12px;
          }
          .ui-form-group {
            margin-bottom: ${this.tokens.tokens.espaciado.md}px;
          }
          .ui-form-label {
            display: block;
            color: white;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: ${this.tokens.tokens.espaciado.sm}px;
          }
          .ui-form-input {
            width: 100%;
            padding: ${this.tokens.tokens.espaciado.md}px;
            background-color: #0F1216;
            border: 1px solid #374151;
            border-radius: 8px;
            color: white;
            font-size: 14px;
          }
          .ui-form-input:focus {
            outline: none;
            border-color: ${this.tokens.tokens.color.azul_info};
          }
          .ui-form-actions {
            display: flex;
            gap: ${this.tokens.tokens.espaciado.sm}px;
            margin-top: ${this.tokens.tokens.espaciado.lg}px;
          }
          .ui-form-submit, .ui-form-reset {
            padding: ${this.tokens.tokens.espaciado.md}px ${this.tokens.tokens.espaciado.lg}px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          }
          .ui-form-submit {
            background-color: ${this.tokens.tokens.color.verde_accion};
            color: white;
          }
          .ui-form-reset {
            background-color: #374151;
            color: white;
          }
        `
      };
    });

    this.logger.info({ templates: this.templates.size }, 'Component templates loaded');
  }

  /**
   * Discover and load component definitions from ui-components/
   */
  async discoverAndLoadComponents() {
    try {
      if (!fs.existsSync(this.componentsPath)) {
        this.logger.warn({ componentsPath: this.componentsPath }, 'Components directory not found, creating it');
        fs.mkdirSync(this.componentsPath, { recursive: true });
        return;
      }

      const files = fs.readdirSync(this.componentsPath);
      const jsonFiles = files.filter(f => f.endsWith('.component.json'));

      this.logger.info({ count: jsonFiles.length }, 'Discovered component files');

      for (const file of jsonFiles) {
        const filePath = path.join(this.componentsPath, file);
        await this.loadComponent(filePath);
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to discover components');
    }
  }

  /**
   * Load a single component from file
   */
  async loadComponent(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const component = JSON.parse(content);

      if (!component.component) {
        throw new Error('Component definition missing "component" field');
      }

      this.components.set(component.component, component);

      this.logger.info({
        component: component.component,
        filePath
      }, 'Component loaded');

      this.eventBus.publish('ui.component.loaded', {
        component: component.component,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error({
        error: error.message,
        filePath
      }, 'Failed to load component');
    }
  }

  /**
   * Render a component with given props
   */
  renderComponent(componentName, props = {}) {
    const component = this.components.get(componentName);
    if (!component) {
      throw new Error(`Component '${componentName}' not found`);
    }

    const template = this.templates.get(component.component);
    if (!template) {
      throw new Error(`No template found for component type '${component.component}'`);
    }

    const rendered = template(component, props);

    this.eventBus.publish('ui.component.rendered', {
      component: componentName,
      timestamp: new Date().toISOString()
    });

    return rendered;
  }

  /**
   * HTTP API: Get single component definition
   */
  async getComponent(req, res) {
    const { name } = req.params;
    const component = this.components.get(name);

    if (!component) {
      return res.status(404).json({ error: `Component '${name}' not found` });
    }

    res.json(component);
  }

  /**
   * HTTP API: List all components
   */
  async listComponents(req, res) {
    const components = Array.from(this.components.values());
    res.json({
      components,
      count: components.length
    });
  }

  /**
   * HTTP API: Render component
   */
  async renderComponentApi(req, res) {
    const { name } = req.params;
    const props = req.body || {};

    try {
      const rendered = this.renderComponent(name, props);
      res.json({
        component: name,
        html: rendered.html,
        css: rendered.css
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * HTTP API: Get design system tokens
   */
  async getTokens(req, res) {
    res.json(this.tokens);
  }
}

module.exports = UIRendererModule;
