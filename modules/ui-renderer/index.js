/**
 * UI Renderer Module
 * JSON-driven UI component renderer with design system tokens
 *
 * Follows event-driven architecture
 */

const fs = require('fs');
const path = require('path');

class UIRendererModule {
  constructor() {
    this.name = 'ui-renderer';
    this.version = '2.0.0';

    // State
    this.components = new Map(); // name -> definition
    this.templates = new Map(); // type -> render function
    this.tokens = null;
    this.componentsPath = null;
    this.tokensPath = null;

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('module.loading', {
      module: this.name,
      version: this.version
    });

    // Configure paths
    this.componentsPath = this.config.componentsPath || path.join(process.cwd(), 'ui-components');
    this.tokensPath = this.config.tokensPath || path.join(process.cwd(), 'docs', 'biblioteca_componentes_ui_v1.json');

    // Load design system tokens
    await this.loadTokens();

    // Load component templates
    this.loadTemplates();

    // Subscribe to events
    await this.subscribeToEvents();

    // Discover and load components
    await this.discoverComponents();

    // Update metrics
    this.updateMetrics();

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      components_count: this.components.size,
      templates_count: this.templates.size,
      has_tokens: !!this.tokens
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    this.components.clear();
    this.templates.clear();
    this.tokens = null;

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Initialization
  // ==========================================

  async loadTokens() {
    try {
      if (fs.existsSync(this.tokensPath)) {
        const content = fs.readFileSync(this.tokensPath, 'utf-8');
        this.tokens = JSON.parse(content);

        this.logger.info('tokens.loaded', {
          path: this.tokensPath,
          has_colors: !!this.tokens.tokens?.color,
          has_spacing: !!this.tokens.tokens?.espaciado
        });

        await this.eventBus.publish('ui.tokens.loaded', {
          source: this.tokensPath,
          color_count: Object.keys(this.tokens.tokens?.color || {}).length,
          spacing_count: Object.keys(this.tokens.tokens?.espaciado || {}).length,
          loaded_at: new Date().toISOString()
        });
      } else {
        this.logger.warn('tokens.file.not_found', { path: this.tokensPath });
        this.tokens = this.getDefaultTokens();
      }
    } catch (error) {
      this.logger.error('tokens.load.error', {
        error: error.message,
        path: this.tokensPath
      });
      this.tokens = this.getDefaultTokens();
    }
  }

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

  loadTemplates() {
    // Button template
    this.templates.set('button', (component, props) => {
      const state = props.state || 'default';
      const stateConfig = component.states?.[state] || {};
      const color = stateConfig.color || this.tokens.tokens.color.gris_base;
      const text = props.text || stateConfig.text || component.name || 'Button';
      const icon = stateConfig.icon || props.icon || '';

      return {
        html: `<button class="ui-button ui-button-${state}" data-component="${component.component}">
          ${icon ? `<span class="ui-button-icon">${icon}</span>` : ''}
          <span class="ui-button-text">${text}</span>
        </button>`,
        css: `.ui-button {
          background-color: ${color};
          color: white;
          border: none;
          border-radius: 12px;
          padding: ${this.tokens.tokens.espaciado.md}px ${this.tokens.tokens.espaciado.lg}px;
          font-size: 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: ${this.tokens.tokens.espaciado.sm}px;
        }`
      };
    });

    // Card template
    this.templates.set('card', (component, props) => {
      const title = props.title || 'Card';
      const content = props.content || '';
      const footer = props.footer || '';

      return {
        html: `<div class="ui-card" data-component="${component.component}">
          ${title ? `<div class="ui-card-header">${title}</div>` : ''}
          <div class="ui-card-body">${content}</div>
          ${footer ? `<div class="ui-card-footer">${footer}</div>` : ''}
        </div>`,
        css: `.ui-card {
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
        }`
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
        html: `<div class="ui-table-wrapper" data-component="${component.component}">
          <table class="ui-table">
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`,
        css: `.ui-table-wrapper {
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
        }
        .ui-table td {
          padding: ${this.tokens.tokens.espaciado.md}px;
          border-top: 1px solid #374151;
          color: #d1d5db;
        }`
      };
    });

    // Form template
    this.templates.set('form', (component, props) => {
      const fields = props.fields || [];

      const fieldsHtml = fields.map(field => {
        const type = field.type || 'text';
        const label = field.label || field.name;
        const required = field.required ? 'required' : '';

        return `<div class="ui-form-group">
          <label class="ui-form-label">${label}${field.required ? ' *' : ''}</label>
          <input type="${type}" name="${field.name}" class="ui-form-input" ${required} />
        </div>`;
      }).join('');

      return {
        html: `<form class="ui-form" data-component="${component.component}">
          ${fieldsHtml}
          <div class="ui-form-actions">
            <button type="submit" class="ui-form-submit">Submit</button>
          </div>
        </form>`,
        css: `.ui-form {
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
          margin-bottom: ${this.tokens.tokens.espaciado.sm}px;
        }
        .ui-form-input {
          width: 100%;
          padding: ${this.tokens.tokens.espaciado.md}px;
          background-color: #0F1216;
          border: 1px solid #374151;
          border-radius: 8px;
          color: white;
        }
        .ui-form-submit {
          background-color: ${this.tokens.tokens.color.verde_accion};
          color: white;
          border: none;
          padding: ${this.tokens.tokens.espaciado.md}px ${this.tokens.tokens.espaciado.lg}px;
          border-radius: 8px;
          cursor: pointer;
        }`
      };
    });

    this.logger.info('templates.loaded', { count: this.templates.size });
  }

  async discoverComponents() {
    const startTime = Date.now();

    this.logger.info('components.discovery.start', {
      path: this.componentsPath
    });

    try {
      if (!fs.existsSync(this.componentsPath)) {
        fs.mkdirSync(this.componentsPath, { recursive: true });
        this.logger.info('components.directory.created', {
          path: this.componentsPath
        });
        return;
      }

      const files = fs.readdirSync(this.componentsPath);
      const jsonFiles = files.filter(f => f.endsWith('.component.json'));

      let loadedCount = 0;
      let errorCount = 0;

      for (const file of jsonFiles) {
        const filePath = path.join(this.componentsPath, file);
        const success = await this.loadComponent(filePath);

        if (success) {
          loadedCount++;
        } else {
          errorCount++;
        }
      }

      const duration = Date.now() - startTime;

      this.logger.info('components.discovery.completed', {
        total: this.components.size,
        loaded: loadedCount,
        errors: errorCount,
        duration
      });

      // REMOVED: this.metrics.timing('ui.component.load.duration', duration);
    } catch (error) {
      this.logger.error('components.discovery.error', {
        error: error.message
      });
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('ui.component.error.total');
    // → Counter extracted from events
    }
  }

  async loadComponent(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const component = JSON.parse(content);

      if (!component.component) {
        throw new Error('Missing "component" field');
      }

      this.components.set(component.component, component);

      this.logger.info('component.loaded', {
        name: component.component,
        type: component.component,
        file: filePath
      });

      await this.eventBus.publish('ui.component.loaded', {
        component: component.component,
        type: component.component,
        has_states: !!component.states,
        loaded_at: new Date().toISOString()
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('ui.component.loaded.total');
    // → Counter extracted from events

      return true;
    } catch (error) {
      this.logger.error('component.load.error', {
        file: filePath,
        error: error.message
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('ui.component.error.total');
    // → Counter extracted from events
      return false;
    }
  }

  updateMetrics() {
    // REMOVED: this.metrics.gauge('ui.component.count', this.components.size);
    // REMOVED: this.metrics.gauge('ui.template.count', this.templates.size);
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('ui.component.get.request', this.onGetComponentRequest.bind(this));
    await this.eventBus.subscribe('ui.component.render.request', this.onRenderComponentRequest.bind(this));
    await this.eventBus.subscribe('ui.tokens.get.request', this.onGetTokensRequest.bind(this));

    this.logger.info('events.subscribed', {
      events: ['ui.component.get.request', 'ui.component.render.request', 'ui.tokens.get.request']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onGetComponentRequest(event) {
    const { name, request_id, correlation_id } = event.payload || event;

    this.logger.info('component.get.request.received', {
      name,
      request_id,
      correlation_id
    });

    const component = this.components.get(name);

    if (component) {
      await this.eventBus.publish('ui.component.get.response', {
        request_id,
        success: true,
        component
      }, { correlationId: correlation_id });
    } else {
      await this.eventBus.publish('ui.component.get.response', {
        request_id,
        success: false,
        error: `Component '${name}' not found`
      }, { correlationId: correlation_id });
    }
  }

  async onRenderComponentRequest(event) {
    const { name, props, request_id, correlation_id } = event.payload || event;

    this.logger.info('component.render.request.received', {
      name,
      request_id,
      correlation_id
    });

    try {
      const rendered = this.renderComponent(name, props || {});

      await this.eventBus.publish('ui.component.render.response', {
        request_id,
        success: true,
        html: rendered.html,
        css: rendered.css
      }, { correlationId: correlation_id });
    } catch (error) {
      await this.eventBus.publish('ui.component.render.response', {
        request_id,
        success: false,
        error: error.message
      }, { correlationId: correlation_id });
    }
  }

  async onGetTokensRequest(event) {
    const { request_id, correlation_id } = event.payload || event;

    this.logger.info('tokens.get.request.received', {
      request_id,
      correlation_id
    });

    await this.eventBus.publish('ui.tokens.get.response', {
      request_id,
      success: true,
      tokens: this.tokens
    }, { correlationId: correlation_id });
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleGetComponent(req, context) {
    const { name } = context.params;

    this.logger.info('component.get.start', {
      name,
      correlation_id: context.correlationId
    });

    const component = this.components.get(name);

    if (!component) {
      this.logger.warn('component.get.not_found', {
        name,
        correlation_id: context.correlationId
      });

      return {
        status: 404,
        data: {
          success: false,
          error: `Component '${name}' not found`
        }
      };
    }

    this.logger.info('component.retrieved', {
      name,
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: {
        success: true,
        component
      }
    };
  }

  async handleListComponents(req, context) {
    this.logger.info('components.list.start', {
      correlation_id: context.correlationId
    });

    const components = Array.from(this.components.values());

    this.logger.info('components.listed', {
      count: components.length,
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: {
        success: true,
        components,
        count: components.length
      }
    };
  }

  async handleRenderComponent(req, context) {
    const { name } = context.params;
    const props = context.body || {};
    const startTime = Date.now();

    this.logger.info('component.render.start', {
      name,
      correlation_id: context.correlationId
    });

    try {
      const rendered = this.renderComponent(name, props);
      const duration = Date.now() - startTime;

      // Metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('ui.component.rendered.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.timing('ui.component.render.duration', duration);

      // Publish event
      await this.eventBus.publish('ui.component.rendered', {
        component: name,
        type: this.components.get(name)?.component || name,
        duration,
        html_length: rendered.html.length,
        css_length: rendered.css.length
      }, { correlationId: context.correlationId });

      this.logger.info('component.rendered', {
        name,
        duration,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          component: name,
          html: rendered.html,
          css: rendered.css
        }
      };
    } catch (error) {
      this.logger.error('component.render.error', {
        name,
        error: error.message,
        correlation_id: context.correlationId
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('ui.component.error.total');
    // → Counter extracted from events

      return {
        status: 400,
        data: {
          success: false,
          error: error.message
        }
      };
    }
  }

  async handleGetTokens(req, context) {
    this.logger.info('tokens.get.start', {
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: {
        success: true,
        tokens: this.tokens
      }
    };
  }

  async handleReloadComponents(req, context) {
    this.logger.info('components.reload.start', {
      correlation_id: context.correlationId
    });

    try {
      this.components.clear();
      await this.discoverComponents();

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('ui.reload.total');
    // → Counter extracted from events
      this.updateMetrics();

      this.logger.info('components.reloaded', {
        count: this.components.size,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          message: 'Components reloaded successfully',
          count: this.components.size
        }
      };
    } catch (error) {
      this.logger.error('components.reload.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to reload components',
          message: error.message
        }
      };
    }
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        components_count: this.components.size,
        templates_count: this.templates.size,
        has_tokens: !!this.tokens
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        counters: {
          'ui.component.loaded.total': this.metrics.getCounter('ui.component.loaded.total') || 0,
          'ui.component.rendered.total': this.metrics.getCounter('ui.component.rendered.total') || 0,
          'ui.component.error.total': this.metrics.getCounter('ui.component.error.total') || 0,
          'ui.reload.total': this.metrics.getCounter('ui.reload.total') || 0
        },
        gauges: {
          'ui.component.count': this.components.size,
          'ui.template.count': this.templates.size
        }
      }
    };
  }

  // ==========================================
  // Core Logic
  // ==========================================

  renderComponent(componentName, props = {}) {
    const component = this.components.get(componentName);

    if (!component) {
      throw new Error(`Component '${componentName}' not found`);
    }

    const template = this.templates.get(component.component);

    if (!template) {
      throw new Error(`No template for component type '${component.component}'`);
    }

    return template(component, props);
  }
}

module.exports = UIRendererModule;
