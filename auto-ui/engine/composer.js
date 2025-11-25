/**
 * Auto-UI Composer v2.0
 *
 * Orquesta todos los subsistemas para componer UIs completas desde definiciones
 */

class Composer {
  constructor(options = {}) {
    this.logger = options.logger || console;

    // Subsystems
    this.componentSystem = options.componentSystem;
    this.layoutEngine = options.layoutEngine;
    this.widgetFactory = options.widgetFactory;
    this.resolver = options.resolver;
    this.validator = options.validator;
    this.permissionSystem = options.permissionSystem;

    // Configuration
    this.config = options.config || {};
  }

  // ==========================================
  // View Composition
  // ==========================================

  /**
   * Compone una vista completa desde definición
   *
   * @param {Object} viewDef - Definición de la vista
   * @param {Object} context - Contexto de composición
   * @returns {Promise<string>} HTML completo
   */
  async composeView(viewDef, context = {}) {
    if (!viewDef) {
      return this.renderError('No view definition provided');
    }

    try {
      this.logger.debug('[Composer] Composing view:', viewDef.type || 'default');

      // Resolver definición
      const resolved = await this.resolver?.resolveDeep(viewDef, context) || viewDef;

      // Filtrar por permisos
      const filtered = await this.filterByPermissions(resolved, context);

      // Componer según tipo
      switch (filtered.type) {
        case 'dashboard':
          return await this.composeDashboard(filtered, context);

        case 'form':
          return await this.composeForm(filtered, context);

        case 'modal':
          return await this.composeModal(filtered, context);

        case 'detail':
          return await this.composeDetail(filtered, context);

        case 'list':
          return await this.composeList(filtered, context);

        case 'custom':
          return await this.composeCustom(filtered, context);

        default:
          return await this.composeGeneric(filtered, context);
      }

    } catch (error) {
      this.logger.error('[Composer] Composition error:', error);
      return this.renderError(`Composition error: ${error.message}`);
    }
  }

  // ==========================================
  // Specific View Composers
  // ==========================================

  /**
   * Compone un dashboard
   */
  async composeDashboard(viewDef, context) {
    const sections = [];

    // Header
    if (viewDef.header) {
      const headerHtml = await this.composeSection(viewDef.header, context);
      sections.push(`<div class="view-header">${headerHtml}</div>`);
    }

    // Body con layout
    if (viewDef.layout) {
      const layoutHtml = await this.layoutEngine?.render(
        viewDef.layout,
        viewDef,
        context
      );
      sections.push(`<div class="view-body">${layoutHtml}</div>`);
    } else if (viewDef.sections) {
      const sectionsHtml = await this.composeSections(viewDef.sections, context);
      sections.push(`<div class="view-body">${sectionsHtml}</div>`);
    }

    // Footer
    if (viewDef.footer) {
      const footerHtml = await this.composeSection(viewDef.footer, context);
      sections.push(`<div class="view-footer">${footerHtml}</div>`);
    }

    return `
      <div class="view view-dashboard" data-view-type="dashboard">
        ${sections.join('\n')}
      </div>
    `;
  }

  /**
   * Compone un formulario
   */
  async composeForm(viewDef, context) {
    const schema = viewDef.schema || context.schema || {};
    const data = viewDef.data || context.data || {};
    const mode = viewDef.mode || 'create';

    // Filtrar campos por permisos
    const allFields = Object.entries(schema).map(([name, fieldSchema]) => ({
      name,
      ...fieldSchema,
      permissions: fieldSchema.permissions
    }));

    const fields = await this.permissionSystem?.filterFields(
      allFields,
      mode === 'create' ? 'create' : 'edit',
      context
    ) || allFields;

    // Generar campos
    const fieldsHtml = await Promise.all(
      fields.map(field => this.composeFormField(field, data[field.name], context))
    );

    // Acciones
    const actions = await this.composeFormActions(viewDef, mode, context);

    return `
      <form class="view view-form" data-view-type="form" data-mode="${mode}">
        <div class="form-fields">
          ${fieldsHtml.join('\n')}
        </div>
        <div class="form-actions">
          ${actions}
        </div>
      </form>
    `;
  }

  /**
   * Compone un campo de formulario
   */
  async composeFormField(field, value, context) {
    const componentName = this.getFieldComponent(field);

    const props = {
      name: field.name,
      label: field.label || this.toLabel(field.name),
      type: field.type || 'text',
      value: value || field.default || '',
      required: field.required || false,
      disabled: field.disabled || false,
      placeholder: field.placeholder,
      help: field.help,
      error: context.errors?.[field.name],
      options: field.enum || field.options,
      ...field.props
    };

    return this.componentSystem?.render(componentName, props, context) || '';
  }

  /**
   * Compone acciones de formulario
   */
  async composeFormActions(viewDef, mode, context) {
    const defaultActions = [
      {
        type: 'submit',
        label: mode === 'create' ? 'Crear' : 'Guardar',
        variant: 'primary'
      },
      {
        type: 'button',
        label: 'Cancelar',
        variant: 'secondary',
        onClick: 'history.back()'
      }
    ];

    const actions = viewDef.actions || defaultActions;

    const rendered = await Promise.all(
      actions.map(action => {
        return this.componentSystem?.render('button', action, context) || '';
      })
    );

    return rendered.join('\n');
  }

  /**
   * Compone un modal
   */
  async composeModal(viewDef, context) {
    const content = viewDef.content ?
      await this.composeView(viewDef.content, context) :
      await this.composeSections(viewDef.sections || [], context);

    return `
      <div class="modal-backdrop" onclick="if(event.target === this) this.remove()">
        <div class="modal" style="max-width: ${viewDef.width || '500px'}">
          <div class="modal-header">
            <span class="modal-title">${viewDef.title || ''}</span>
            <button class="btn btn-icon btn-ghost" onclick="this.closest('.modal-backdrop').remove()">×</button>
          </div>
          <div class="modal-body">
            ${content}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Compone vista de detalle
   */
  async composeDetail(viewDef, context) {
    const data = viewDef.data || context.data || {};
    const schema = viewDef.schema || context.schema || {};

    const fields = Object.entries(schema).map(([name, fieldSchema]) => {
      const value = data[name];
      const formattedValue = this.formatValue(value, fieldSchema);

      return `
        <div class="detail-field">
          <span class="detail-label">${fieldSchema.label || this.toLabel(name)}</span>
          <span class="detail-value">${formattedValue}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="view view-detail" data-view-type="detail">
        <div class="detail-grid">
          ${fields}
        </div>
      </div>
      <style>
        .detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: var(--space-md);
        }
        .detail-field {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }
        .detail-label {
          font-size: var(--size-sm);
          color: var(--text-muted);
          font-weight: 500;
        }
        .detail-value {
          font-size: var(--size-base);
        }
      </style>
    `;
  }

  /**
   * Compone lista/tabla
   */
  async composeList(viewDef, context) {
    const data = viewDef.data || context.data || [];
    const config = {
      columns: viewDef.columns,
      sortable: viewDef.sortable,
      filterable: viewDef.filterable,
      pagination: viewDef.pagination,
      data
    };

    return await this.widgetFactory?.render('table-advanced', config, context) || '';
  }

  /**
   * Compone vista custom
   */
  async composeCustom(viewDef, context) {
    if (viewDef.component) {
      return this.componentSystem?.render(
        viewDef.component,
        viewDef.props || {},
        context
      ) || '';
    }

    if (viewDef.template) {
      return this.renderTemplate(viewDef.template, viewDef.data || {}, context);
    }

    return this.renderError('Custom view requires component or template');
  }

  /**
   * Compone vista genérica
   */
  async composeGeneric(viewDef, context) {
    if (viewDef.sections) {
      return await this.composeSections(viewDef.sections, context);
    }

    if (viewDef.html) {
      return viewDef.html;
    }

    return this.renderError('Unknown view type');
  }

  // ==========================================
  // Section Composition
  // ==========================================

  /**
   * Compone múltiples secciones
   */
  async composeSections(sections, context) {
    if (!Array.isArray(sections)) return '';

    const rendered = await Promise.all(
      sections.map(section => this.composeSection(section, context))
    );

    return rendered.join('\n');
  }

  /**
   * Compone una sección
   */
  async composeSection(section, context) {
    if (!section) return '';

    try {
      // Componente
      if (section.component) {
        const props = section.props || section.config || {};
        return this.componentSystem?.render(section.component, props, context) || '';
      }

      // Widget
      if (section.widget) {
        const config = section.config || {};
        return this.widgetFactory?.render(section.widget, config, context) || '';
      }

      // Layout anidado
      if (section.layout) {
        return this.layoutEngine?.render(section.layout, section, context) || '';
      }

      // Widgets múltiples
      if (section.widgets) {
        return await this.composeWidgets(section.widgets, context);
      }

      // Children
      if (section.children || section.sections) {
        return await this.composeSections(section.children || section.sections, context);
      }

      // HTML directo
      if (section.html) {
        return section.html;
      }

      return '';

    } catch (error) {
      this.logger.error('[Composer] Section error:', error);
      return this.renderError(`Section error: ${error.message}`);
    }
  }

  /**
   * Compone widgets
   */
  async composeWidgets(widgets, context) {
    if (!Array.isArray(widgets)) return '';

    const rendered = await Promise.all(
      widgets.map(widget => {
        const name = widget.component || widget.widget || widget.type;
        const config = widget.config || widget.props || {};
        return this.widgetFactory?.render(name, config, context) || '';
      })
    );

    return rendered.join('\n');
  }

  // ==========================================
  // Permission Filtering
  // ==========================================

  /**
   * Filtra vista por permisos
   */
  async filterByPermissions(viewDef, context) {
    if (!this.permissionSystem || !viewDef.permissions) {
      return viewDef;
    }

    const hasPermission = await this.permissionSystem.check(
      viewDef.permissions,
      context
    );

    if (!hasPermission) {
      throw new Error('Permission denied');
    }

    // Filtrar secciones
    if (viewDef.sections) {
      viewDef.sections = await this.permissionSystem.filterUI(
        viewDef.sections,
        context
      );
    }

    // Filtrar acciones
    if (viewDef.actions) {
      viewDef.actions = await this.permissionSystem.filterActions(
        viewDef.actions,
        context
      );
    }

    return viewDef;
  }

  // ==========================================
  // Utilities
  // ==========================================

  /**
   * Obtiene componente apropiado para un campo
   */
  getFieldComponent(field) {
    if (field.component) return field.component;

    switch (field.type) {
      case 'boolean':
        return 'checkbox';
      case 'enum':
        return 'select';
      case 'text':
        return 'textarea';
      case 'date':
      case 'datetime':
      case 'email':
      case 'url':
      case 'password':
      case 'number':
        return 'input';
      default:
        return 'input';
    }
  }

  /**
   * Formatea valor según esquema
   */
  formatValue(value, schema) {
    if (value === null || value === undefined) {
      return '<span class="text-muted">-</span>';
    }

    switch (schema.type) {
      case 'boolean':
        return value ? '✓' : '✗';

      case 'date':
        return new Date(value).toLocaleDateString();

      case 'datetime':
        return new Date(value).toLocaleString();

      case 'number':
        if (schema.format === 'currency') {
          return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR'
          }).format(value);
        }
        return Number(value).toLocaleString();

      case 'enum':
        return `<span class="badge badge-primary">${value}</span>`;

      default:
        return this.escapeHtml(String(value));
    }
  }

  /**
   * Renderiza template
   */
  renderTemplate(template, data, context) {
    // Simple template rendering
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return this.escapeHtml(data[key] || '');
    });
  }

  /**
   * Convierte nombre a label
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

  /**
   * Renderiza error
   */
  renderError(message) {
    return `
      <div class="composer-error">
        <span class="composer-error-icon">⚠️</span>
        <span class="composer-error-message">${this.escapeHtml(message)}</span>
      </div>
      <style>
        .composer-error {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-md);
          background: var(--danger);
          color: white;
          border-radius: var(--radius-md);
        }
        .composer-error-icon {
          font-size: 1.5rem;
        }
      </style>
    `;
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      componentSystem: this.componentSystem?.getStats(),
      layoutEngine: this.layoutEngine?.getStats(),
      widgetFactory: this.widgetFactory?.getStats(),
      resolver: this.resolver?.getStats(),
      permissionSystem: this.permissionSystem?.getStats()
    };
  }
}

module.exports = Composer;
