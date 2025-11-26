/**
 * Auto-UI Layout Engine v2.0
 *
 * Motor de layouts para composición de vistas complejas
 */

class LayoutEngine {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.componentSystem = options.componentSystem;
    this.resolver = options.resolver;

    // Registry de layouts
    this.layouts = new Map();

    // Register built-in layouts
    this.registerBuiltInLayouts();
  }

  // ==========================================
  // Layout Registration
  // ==========================================

  /**
   * Registra un layout
   */
  register(name, definition) {
    if (!name || typeof name !== 'string') {
      throw new Error('Layout name is required');
    }

    if (!definition || !definition.render) {
      throw new Error('Layout must have a render function');
    }

    this.layouts.set(name, definition);
    this.logger.info(`[LayoutEngine] Registered layout: ${name}`);

    return this;
  }

  /**
   * Obtiene un layout
   */
  get(name) {
    return this.layouts.get(name);
  }

  /**
   * Lista todos los layouts
   */
  list() {
    return Array.from(this.layouts.keys());
  }

  // ==========================================
  // Layout Rendering
  // ==========================================

  /**
   * Renderiza un layout
   *
   * @param {string} name - Nombre del layout
   * @param {Object} config - Configuración del layout
   * @param {Object} context - Contexto de renderizado
   * @returns {Promise<string>} HTML renderizado
   */
  async render(name, config = {}, context = {}) {
    const layout = this.layouts.get(name);

    if (!layout) {
      this.logger.warn(`[LayoutEngine] Layout not found: ${name}`);
      return this.renderError(name, 'Layout not found');
    }

    try {
      // Resolver configuración
      const resolvedConfig = await this.resolver?.resolveDeep(config, context) || config;

      // Renderizar layout
      const html = await layout.render(resolvedConfig, context, this);

      return html;

    } catch (error) {
      this.logger.error(`[LayoutEngine] Render error for ${name}:`, error);
      return this.renderError(name, error.message);
    }
  }

  /**
   * Renderiza secciones de un layout
   */
  async renderSections(sections, context = {}) {
    if (!sections || !Array.isArray(sections)) {
      return '';
    }

    const rendered = [];

    for (const section of sections) {
      const html = await this.renderSection(section, context);
      rendered.push(html);
    }

    return rendered.join('\n');
  }

  /**
   * Renderiza una sección individual
   */
  async renderSection(section, context = {}) {
    if (!section) return '';

    try {
      // Si tiene componente, renderizar componente
      if (section.component) {
        const props = section.props || {};
        return this.componentSystem?.render(section.component, props, context) || '';
      }

      // Si tiene layout anidado, renderizar layout
      if (section.layout) {
        return await this.render(section.layout, section, context);
      }

      // Si tiene widgets, renderizar widgets
      if (section.widgets) {
        return await this.renderWidgets(section.widgets, context);
      }

      // Si tiene children, renderizar children
      if (section.children) {
        return await this.renderSections(section.children, context);
      }

      // Si tiene HTML directo
      if (section.html) {
        return section.html;
      }

      return '';

    } catch (error) {
      this.logger.error('[LayoutEngine] Section render error:', error);
      return this.renderError('section', error.message);
    }
  }

  /**
   * Renderiza widgets
   */
  async renderWidgets(widgets, context = {}) {
    if (!Array.isArray(widgets)) return '';

    const rendered = [];

    for (const widget of widgets) {
      if (widget.component) {
        const html = this.componentSystem?.render(
          widget.component,
          widget.props || widget.config || {},
          context
        );
        rendered.push(html || '');
      }
    }

    return rendered.join('\n');
  }

  // ==========================================
  // Built-in Layouts
  // ==========================================

  registerBuiltInLayouts() {
    // Single Column
    this.register('single', {
      render: async (config, context, engine) => {
        const content = await engine.renderSections(config.sections || config.children, context);
        return `
          <div class="layout layout-single">
            ${content}
          </div>
        `;
      }
    });

    // Two Column
    this.register('two-column', {
      render: async (config, context, engine) => {
        // Support multiple layout structures:
        // 1. config.left / config.right (original)
        // 2. config.left_column / config.right_column (credential-manager style)
        // 3. config.columns[0] / config.columns[1] (generic columns array)

        // Extract left sections
        const leftSections = config.left
          || config.left_column?.sections
          || config.columns?.[0]?.sections
          || [];

        // Extract right sections
        const rightSections = config.right
          || config.right_column?.sections
          || config.columns?.[1]?.sections
          || [];

        // Extract widths
        const leftWidth = config.leftWidth
          || config.left_width
          || config.left_column?.width
          || config.columns?.[0]?.width
          || '50%';

        const rightWidth = config.rightWidth
          || config.right_width
          || config.right_column?.width
          || config.columns?.[1]?.width
          || '50%';

        const leftContent = await engine.renderSections(leftSections, context);
        const rightContent = await engine.renderSections(rightSections, context);

        return `
          <div class="layout layout-two-column">
            <div class="layout-column layout-column-left" style="width: ${leftWidth}">
              ${leftContent}
            </div>
            <div class="layout-column layout-column-right" style="width: ${rightWidth}">
              ${rightContent}
            </div>
          </div>
          <style>
            .layout-two-column {
              display: flex;
              gap: var(--space-md);
              width: 100%;
            }
            .layout-column {
              display: flex;
              flex-direction: column;
              gap: var(--space-md);
            }
          </style>
        `;
      }
    });

    // Three Column
    this.register('three-column', {
      render: async (config, context, engine) => {
        const columns = config.columns || [];

        const rendered = await Promise.all(
          columns.map(async (col, idx) => {
            const width = col.width || '33.33%';
            const content = await engine.renderSections(col.sections || [], context);
            return `
              <div class="layout-column layout-column-${idx}" style="width: ${width}">
                ${content}
              </div>
            `;
          })
        );

        return `
          <div class="layout layout-three-column">
            ${rendered.join('\n')}
          </div>
          <style>
            .layout-three-column {
              display: flex;
              gap: var(--space-md);
              width: 100%;
            }
          </style>
        `;
      }
    });

    // Grid
    this.register('grid', {
      render: async (config, context, engine) => {
        const columns = config.columns || 3;
        const gap = config.gap || 'var(--space-md)';
        const minWidth = config.minWidth || '300px';

        const content = await engine.renderSections(config.sections || config.items || [], context);

        return `
          <div class="layout layout-grid" style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(${minWidth}, 1fr));
            gap: ${gap};
          ">
            ${content}
          </div>
        `;
      }
    });

    // Sidebar Left
    this.register('sidebar-left', {
      render: async (config, context, engine) => {
        const sidebarWidth = config.sidebarWidth || '280px';

        const sidebarContent = await engine.renderSections(config.sidebar || [], context);
        const mainContent = await engine.renderSections(config.main || [], context);

        return `
          <div class="layout layout-sidebar-left">
            <aside class="layout-sidebar" style="width: ${sidebarWidth}">
              ${sidebarContent}
            </aside>
            <main class="layout-main">
              ${mainContent}
            </main>
          </div>
          <style>
            .layout-sidebar-left {
              display: flex;
              gap: var(--space-md);
              width: 100%;
            }
            .layout-sidebar {
              flex-shrink: 0;
            }
            .layout-main {
              flex: 1;
              min-width: 0;
            }
          </style>
        `;
      }
    });

    // Sidebar Right
    this.register('sidebar-right', {
      render: async (config, context, engine) => {
        const sidebarWidth = config.sidebarWidth || '280px';

        const mainContent = await engine.renderSections(config.main || [], context);
        const sidebarContent = await engine.renderSections(config.sidebar || [], context);

        return `
          <div class="layout layout-sidebar-right">
            <main class="layout-main">
              ${mainContent}
            </main>
            <aside class="layout-sidebar" style="width: ${sidebarWidth}">
              ${sidebarContent}
            </aside>
          </div>
          <style>
            .layout-sidebar-right {
              display: flex;
              gap: var(--space-md);
              width: 100%;
            }
            .layout-main {
              flex: 1;
              min-width: 0;
            }
            .layout-sidebar {
              flex-shrink: 0;
            }
          </style>
        `;
      }
    });

    // Flex
    this.register('flex', {
      render: async (config, context, engine) => {
        const direction = config.direction || 'row';
        const justify = config.justify || 'flex-start';
        const align = config.align || 'stretch';
        const wrap = config.wrap || 'nowrap';
        const gap = config.gap || 'var(--space-md)';

        const content = await engine.renderSections(config.sections || config.items || [], context);

        return `
          <div class="layout layout-flex" style="
            display: flex;
            flex-direction: ${direction};
            justify-content: ${justify};
            align-items: ${align};
            flex-wrap: ${wrap};
            gap: ${gap};
          ">
            ${content}
          </div>
        `;
      }
    });

    // Stack (vertical)
    this.register('stack', {
      render: async (config, context, engine) => {
        const gap = config.gap || 'var(--space-md)';
        const content = await engine.renderSections(config.sections || config.items || [], context);

        return `
          <div class="layout layout-stack" style="
            display: flex;
            flex-direction: column;
            gap: ${gap};
          ">
            ${content}
          </div>
        `;
      }
    });

    // Dashboard
    this.register('dashboard', {
      render: async (config, context, engine) => {
        // Header
        const headerHtml = config.header ? await engine.renderSection(config.header, context) : '';

        // Body layout (puede ser grid, columns, etc)
        let bodyHtml = '';

        if (config.layout === 'two-column') {
          bodyHtml = await engine.render('two-column', config, context);
        } else if (config.layout === 'three-column') {
          bodyHtml = await engine.render('three-column', config, context);
        } else if (config.layout === 'grid') {
          bodyHtml = await engine.render('grid', config, context);
        } else {
          bodyHtml = await engine.renderSections(config.sections || [], context);
        }

        return `
          <div class="layout layout-dashboard">
            ${headerHtml ? `<div class="dashboard-header">${headerHtml}</div>` : ''}
            <div class="dashboard-body">
              ${bodyHtml}
            </div>
          </div>
          <style>
            .layout-dashboard {
              display: flex;
              flex-direction: column;
              gap: var(--space-lg);
            }
            .dashboard-header {
              padding-bottom: var(--space-md);
              border-bottom: 1px solid var(--border);
            }
            .dashboard-body {
              flex: 1;
            }
          </style>
        `;
      }
    });

    // Tabs
    this.register('tabs', {
      render: async (config, context, engine) => {
        const tabs = config.tabs || [];
        const defaultTab = config.defaultTab || 0;

        // Render tab headers
        const tabHeaders = tabs.map((tab, idx) => `
          <button class="tab-button ${idx === defaultTab ? 'active' : ''}"
                  data-tab="${idx}"
                  onclick="window.AutoUI.switchTab(${idx})">
            ${tab.icon ? `<span class="tab-icon">${tab.icon}</span>` : ''}
            <span class="tab-label">${tab.label}</span>
          </button>
        `).join('');

        // Render tab panels
        const tabPanels = await Promise.all(
          tabs.map(async (tab, idx) => {
            const content = await engine.renderSections(tab.sections || [], context);
            return `
              <div class="tab-panel ${idx === defaultTab ? 'active' : ''}" data-tab="${idx}">
                ${content}
              </div>
            `;
          })
        );

        return `
          <div class="layout layout-tabs">
            <div class="tab-headers">
              ${tabHeaders}
            </div>
            <div class="tab-panels">
              ${tabPanels.join('\n')}
            </div>
          </div>
          <style>
            .tab-headers {
              display: flex;
              gap: var(--space-xs);
              border-bottom: 2px solid var(--border);
              margin-bottom: var(--space-md);
            }
            .tab-button {
              display: flex;
              align-items: center;
              gap: var(--space-xs);
              padding: var(--space-sm) var(--space-md);
              border: none;
              background: transparent;
              color: var(--text-muted);
              cursor: pointer;
              border-bottom: 2px solid transparent;
              margin-bottom: -2px;
              transition: all 150ms;
            }
            .tab-button:hover {
              color: var(--text);
              background: var(--bg-hover);
            }
            .tab-button.active {
              color: var(--primary);
              border-bottom-color: var(--primary);
            }
            .tab-panel {
              display: none;
            }
            .tab-panel.active {
              display: block;
            }
          </style>
          <script>
            window.AutoUI.switchTab = function(idx) {
              const container = event.target.closest('.layout-tabs');
              container.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
              container.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
              container.querySelector('[data-tab="' + idx + '"].tab-button').classList.add('active');
              container.querySelector('[data-tab="' + idx + '"].tab-panel').classList.add('active');
            };
          </script>
        `;
      }
    });

    // Accordion
    this.register('accordion', {
      render: async (config, context, engine) => {
        const items = config.items || [];
        const allowMultiple = config.allowMultiple || false;

        const rendered = await Promise.all(
          items.map(async (item, idx) => {
            const content = await engine.renderSections(item.sections || [], context);
            return `
              <div class="accordion-item">
                <button class="accordion-header" onclick="window.AutoUI.toggleAccordion(this, ${allowMultiple})">
                  <span class="accordion-title">${item.title}</span>
                  <span class="accordion-icon">▼</span>
                </button>
                <div class="accordion-content">
                  ${content}
                </div>
              </div>
            `;
          })
        );

        return `
          <div class="layout layout-accordion">
            ${rendered.join('\n')}
          </div>
          <style>
            .accordion-item {
              border: 1px solid var(--border);
              border-radius: var(--radius-md);
              margin-bottom: var(--space-sm);
              overflow: hidden;
            }
            .accordion-header {
              width: 100%;
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: var(--space-md);
              background: var(--bg-card);
              border: none;
              color: var(--text);
              cursor: pointer;
              font-weight: 500;
            }
            .accordion-header:hover {
              background: var(--bg-hover);
            }
            .accordion-icon {
              transition: transform 150ms;
            }
            .accordion-item.active .accordion-icon {
              transform: rotate(180deg);
            }
            .accordion-content {
              max-height: 0;
              overflow: hidden;
              transition: max-height 300ms ease;
            }
            .accordion-item.active .accordion-content {
              max-height: 2000px;
              padding: var(--space-md);
              border-top: 1px solid var(--border);
            }
          </style>
          <script>
            window.AutoUI.toggleAccordion = function(btn, allowMultiple) {
              const item = btn.closest('.accordion-item');
              const container = btn.closest('.layout-accordion');

              if (!allowMultiple) {
                container.querySelectorAll('.accordion-item').forEach(i => {
                  if (i !== item) i.classList.remove('active');
                });
              }

              item.classList.toggle('active');
            };
          </script>
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
      <div class="layout-error">
        <span class="layout-error-icon">⚠️</span>
        <span class="layout-error-message">Error rendering layout '${name}': ${message}</span>
      </div>
    `;
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      layouts: this.layouts.size
    };
  }
}

module.exports = LayoutEngine;
