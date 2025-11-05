/**
 * Event Core - UI Validator
 *
 * Validates UI definitions for correctness
 */

export class Validator {
  constructor() {
    this.supportedViewTypes = ['table', 'form', 'detail', 'dashboard', 'custom'];
    this.supportedFieldTypes = [
      'text', 'email', 'password', 'number', 'tel', 'url',
      'date', 'time', 'datetime-local',
      'select', 'radio', 'checkbox',
      'textarea', 'file', 'hidden'
    ];
  }

  /**
   * Validate complete module UI definition
   *
   * @param {Object} definition - Module UI definition
   * @returns {Object} - { valid: boolean, errors: string[] }
   */
  validate(definition) {
    const errors = [];

    // Required fields
    if (!definition.name) {
      errors.push('Module name is required');
    }

    if (!definition.views || !Array.isArray(definition.views)) {
      errors.push('Views array is required');
    } else if (definition.views.length === 0) {
      errors.push('At least one view is required');
    } else {
      // Validate each view
      definition.views.forEach((view, index) => {
        const viewValidation = this.validateView(view);
        if (!viewValidation.valid) {
          viewValidation.errors.forEach(err => {
            errors.push(`View ${index} (${view.id || 'unnamed'}): ${err}`);
          });
        }
      });

      // Check for duplicate view IDs
      const viewIds = definition.views.map(v => v.id).filter(Boolean);
      const duplicates = viewIds.filter((id, index) => viewIds.indexOf(id) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate view IDs: ${duplicates.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate a single view definition
   *
   * @param {Object} view - View definition
   * @returns {Object} - { valid: boolean, errors: string[] }
   */
  validateView(view) {
    const errors = [];

    // Required fields
    if (!view.id) {
      errors.push('View ID is required');
    }

    if (!view.type) {
      errors.push('View type is required');
    } else if (!this.supportedViewTypes.includes(view.type)) {
      errors.push(`Unsupported view type: ${view.type}. Supported: ${this.supportedViewTypes.join(', ')}`);
    }

    // Type-specific validation
    switch (view.type) {
      case 'table':
        this.validateTableView(view, errors);
        break;
      case 'form':
        this.validateFormView(view, errors);
        break;
      case 'detail':
        this.validateDetailView(view, errors);
        break;
      case 'dashboard':
        this.validateDashboardView(view, errors);
        break;
      case 'custom':
        // Custom views have minimal requirements
        break;
    }

    // Validate API if present
    if (view.api) {
      this.validateAPI(view.api, errors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate table view
   */
  validateTableView(view, errors) {
    if (!view.columns || !Array.isArray(view.columns) || view.columns.length === 0) {
      errors.push('Table view requires at least one column');
    }

    if (view.columns) {
      view.columns.forEach((col, index) => {
        if (typeof col !== 'string' && !col.field) {
          errors.push(`Column ${index}: field is required`);
        }
      });
    }

    if (view.api && !view.api.url) {
      errors.push('Table view with API requires url');
    }
  }

  /**
   * Validate form view
   */
  validateFormView(view, errors) {
    if (!view.fields || !Array.isArray(view.fields) || view.fields.length === 0) {
      errors.push('Form view requires at least one field');
    }

    if (view.fields) {
      view.fields.forEach((field, index) => {
        const fieldName = typeof field === 'string' ? field : field.name;
        const fieldType = typeof field === 'string' ? 'text' : field.type;

        if (!fieldName) {
          errors.push(`Field ${index}: name is required`);
        }

        if (fieldType && !this.supportedFieldTypes.includes(fieldType)) {
          errors.push(`Field ${fieldName}: unsupported type "${fieldType}"`);
        }

        // Validate select/radio/checkbox fields have options
        if (['select', 'radio', 'checkbox'].includes(fieldType)) {
          if (!field.options || !Array.isArray(field.options) || field.options.length === 0) {
            errors.push(`Field ${fieldName}: ${fieldType} requires options array`);
          }
        }
      });
    }
  }

  /**
   * Validate detail view
   */
  validateDetailView(view, errors) {
    if (!view.fields || !Array.isArray(view.fields) || view.fields.length === 0) {
      errors.push('Detail view requires at least one field');
    }

    if (view.api && !view.api.url) {
      errors.push('Detail view with API requires url');
    }
  }

  /**
   * Validate dashboard view
   */
  validateDashboardView(view, errors) {
    if (!view.widgets || !Array.isArray(view.widgets) || view.widgets.length === 0) {
      errors.push('Dashboard view requires at least one widget');
    }

    if (view.widgets) {
      view.widgets.forEach((widget, index) => {
        if (!widget.id) {
          errors.push(`Widget ${index}: id is required`);
        }
        if (!widget.type) {
          errors.push(`Widget ${index}: type is required`);
        }
      });
    }
  }

  /**
   * Validate API definition
   */
  validateAPI(api, errors) {
    if (typeof api === 'string') {
      // Shorthand is always valid
      return;
    }

    if (!api.url) {
      errors.push('API url is required');
    }

    if (api.method && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(api.method)) {
      errors.push(`Invalid API method: ${api.method}`);
    }
  }

  /**
   * Check if a view type is supported
   */
  isViewTypeSupported(type) {
    return this.supportedViewTypes.includes(type);
  }

  /**
   * Check if a field type is supported
   */
  isFieldTypeSupported(type) {
    return this.supportedFieldTypes.includes(type);
  }
}

export default Validator;
