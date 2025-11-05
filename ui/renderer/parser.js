/**
 * Event Core - UI Parser
 *
 * Parses and normalizes UI definitions from module.json
 */

export class Parser {
  /**
   * Parse a complete module UI definition
   *
   * @param {Object} moduleDefinition - Raw module UI definition
   * @returns {Object} - Normalized definition
   */
  parse(moduleDefinition) {
    const { name, title, description, icon, version, views = [], components = {}, permissions = {} } = moduleDefinition;

    return {
      name,
      title: title || name,
      description: description || '',
      icon: icon || '📦',
      version: version || '1.0.0',
      views: views.map(view => this.parseView(view)),
      components,
      permissions
    };
  }

  /**
   * Parse a single view definition
   *
   * @param {Object} viewDef - Raw view definition
   * @returns {Object} - Normalized view
   */
  parseView(viewDef) {
    const {
      id,
      type,
      title,
      description,
      api,
      columns,
      fields,
      actions,
      filters,
      widgets,
      layout,
      permissions,
      ...rest
    } = viewDef;

    const normalized = {
      id,
      type,
      title: title || id,
      description: description || '',
      api: api ? this.parseAPI(api) : null,
      permissions: permissions || {},
      ...rest
    };

    // Type-specific parsing
    switch (type) {
      case 'table':
        normalized.columns = columns ? columns.map(col => this.parseColumn(col)) : [];
        normalized.actions = actions ? actions.map(act => this.parseAction(act)) : [];
        normalized.filters = filters ? filters.map(f => this.parseFilter(f)) : [];
        break;

      case 'form':
        normalized.fields = fields ? fields.map(f => this.parseField(f)) : [];
        normalized.actions = actions ? actions.map(act => this.parseAction(act)) : [];
        break;

      case 'detail':
        normalized.fields = fields ? fields.map(f => this.parseField(f)) : [];
        normalized.actions = actions ? actions.map(act => this.parseAction(act)) : [];
        normalized.layout = layout || 'vertical';
        break;

      case 'dashboard':
        normalized.widgets = widgets ? widgets.map(w => this.parseWidget(w)) : [];
        break;

      case 'custom':
        // Custom views keep all additional properties
        break;
    }

    return normalized;
  }

  /**
   * Parse API endpoint definition
   */
  parseAPI(apiDef) {
    if (typeof apiDef === 'string') {
      // Shorthand: just URL (defaults to GET)
      return {
        method: 'GET',
        url: apiDef,
        headers: {},
        params: {}
      };
    }

    return {
      method: apiDef.method || 'GET',
      url: apiDef.url,
      headers: apiDef.headers || {},
      params: apiDef.params || {},
      dataPath: apiDef.dataPath || null // Path to data in response (e.g., 'data.items')
    };
  }

  /**
   * Parse table column definition
   */
  parseColumn(colDef) {
    if (typeof colDef === 'string') {
      // Shorthand: just field name
      return {
        field: colDef,
        label: this.humanize(colDef),
        type: 'text',
        sortable: true,
        width: 'auto'
      };
    }

    return {
      field: colDef.field,
      label: colDef.label || this.humanize(colDef.field),
      type: colDef.type || 'text',
      sortable: colDef.sortable !== false,
      width: colDef.width || 'auto',
      align: colDef.align || 'left',
      format: colDef.format || null,
      render: colDef.render || null // Custom render function name
    };
  }

  /**
   * Parse form field definition
   */
  parseField(fieldDef) {
    if (typeof fieldDef === 'string') {
      // Shorthand: just field name
      return {
        name: fieldDef,
        label: this.humanize(fieldDef),
        type: 'text',
        required: false,
        readonly: false
      };
    }

    return {
      name: fieldDef.name,
      label: fieldDef.label || this.humanize(fieldDef.name),
      type: fieldDef.type || 'text',
      required: fieldDef.required || false,
      readonly: fieldDef.readonly || false,
      disabled: fieldDef.disabled || false,
      placeholder: fieldDef.placeholder || '',
      helpText: fieldDef.helpText || '',
      defaultValue: fieldDef.defaultValue || null,
      validation: fieldDef.validation || {},
      options: fieldDef.options || [], // For select, radio, checkbox
      multiple: fieldDef.multiple || false,
      rows: fieldDef.rows || 3, // For textarea
      min: fieldDef.min,
      max: fieldDef.max,
      step: fieldDef.step,
      pattern: fieldDef.pattern,
      accept: fieldDef.accept, // For file inputs
      ...fieldDef
    };
  }

  /**
   * Parse action definition
   */
  parseAction(actionDef) {
    if (typeof actionDef === 'string') {
      // Shorthand: just action name
      return {
        id: actionDef,
        label: this.humanize(actionDef),
        type: 'button',
        variant: 'primary',
        icon: null,
        confirm: false
      };
    }

    return {
      id: actionDef.id,
      label: actionDef.label || this.humanize(actionDef.id),
      type: actionDef.type || 'button',
      variant: actionDef.variant || 'primary', // primary, secondary, success, danger, ghost
      icon: actionDef.icon || null,
      confirm: actionDef.confirm || false,
      confirmMessage: actionDef.confirmMessage || 'Are you sure?',
      api: actionDef.api ? this.parseAPI(actionDef.api) : null,
      handler: actionDef.handler || null, // Custom handler function name
      permissions: actionDef.permissions || []
    };
  }

  /**
   * Parse filter definition
   */
  parseFilter(filterDef) {
    if (typeof filterDef === 'string') {
      return {
        field: filterDef,
        label: this.humanize(filterDef),
        type: 'text',
        operator: 'contains'
      };
    }

    return {
      field: filterDef.field,
      label: filterDef.label || this.humanize(filterDef.field),
      type: filterDef.type || 'text',
      operator: filterDef.operator || 'equals', // equals, contains, gt, lt, between, in
      options: filterDef.options || [],
      defaultValue: filterDef.defaultValue || null
    };
  }

  /**
   * Parse dashboard widget definition
   */
  parseWidget(widgetDef) {
    return {
      id: widgetDef.id,
      type: widgetDef.type, // stat, chart, table, list, custom
      title: widgetDef.title,
      size: widgetDef.size || 'medium', // small, medium, large, full
      api: widgetDef.api ? this.parseAPI(widgetDef.api) : null,
      config: widgetDef.config || {},
      refreshInterval: widgetDef.refreshInterval || null
    };
  }

  /**
   * Convert snake_case or camelCase to Human Readable
   */
  humanize(str) {
    return str
      .replace(/([A-Z])/g, ' $1') // camelCase to spaces
      .replace(/[_-]/g, ' ') // snake_case to spaces
      .replace(/\b\w/g, l => l.toUpperCase()) // capitalize
      .trim();
  }

  /**
   * Get nested property from object using dot notation
   * Example: getPath(obj, 'data.items') returns obj.data.items
   */
  getPath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }
}

export default Parser;
