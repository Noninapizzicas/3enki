/**
 * Event Core - Form View Renderer
 *
 * Renders forms for creating and editing data
 */

export class FormView {
  /**
   * Render a form view
   */
  async render(viewDef, data = null, options = {}) {
    const html = this.generateHTML(viewDef, data);
    const js = this.generateJS(viewDef);

    return { html, css: '', js };
  }

  /**
   * Generate HTML for form view
   */
  generateHTML(viewDef, data) {
    const { id, title, description, fields, actions = [] } = viewDef;

    return `
<div class="view-form" id="${id}">
  ${title ? `<div class="page-header">
    <h2 class="page-title">${title}</h2>
    ${description ? `<p class="page-description">${description}</p>` : ''}
  </div>` : ''}

  <div class="card">
    <div class="card-body">
      <form id="${id}-form" onsubmit="return EventCoreUI.handleFormSubmit(event, '${id}')">
        ${fields.map(field => this.renderField(field, data)).join('')}

        <div class="form-group mt-4">
          ${this.renderActions(actions)}
        </div>
      </form>
    </div>
  </div>
</div>
    `.trim();
  }

  /**
   * Render a single form field
   */
  renderField(field, data) {
    const value = data ? data[field.name] : (field.defaultValue || '');
    const errorId = `${field.name}-error`;

    return `
<div class="form-group">
  <label class="form-label ${field.required ? 'required' : ''}" for="${field.name}">
    ${field.label}
  </label>
  ${this.renderInput(field, value)}
  ${field.helpText ? `<small class="form-help">${field.helpText}</small>` : ''}
  <small class="form-error" id="${errorId}"></small>
</div>
    `.trim();
  }

  /**
   * Render input based on field type
   */
  renderInput(field, value) {
    const commonAttrs = `
      id="${field.name}"
      name="${field.name}"
      ${field.required ? 'required' : ''}
      ${field.readonly ? 'readonly' : ''}
      ${field.disabled ? 'disabled' : ''}
      ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}
      ${field.pattern ? `pattern="${field.pattern}"` : ''}
      ${field.min !== undefined ? `min="${field.min}"` : ''}
      ${field.max !== undefined ? `max="${field.max}"` : ''}
      ${field.step !== undefined ? `step="${field.step}"` : ''}
    `.trim();

    switch (field.type) {
      case 'textarea':
        return `
          <textarea
            class="textarea"
            rows="${field.rows || 3}"
            ${commonAttrs}>${this.escapeHTML(value || '')}</textarea>
        `;

      case 'select':
        return `
          <select class="select" ${commonAttrs} ${field.multiple ? 'multiple' : ''}>
            ${!field.required ? '<option value="">-- Seleccionar --</option>' : ''}
            ${field.options.map(opt => {
              const optValue = typeof opt === 'string' ? opt : opt.value;
              const optLabel = typeof opt === 'string' ? opt : opt.label;
              const selected = value === optValue ? 'selected' : '';
              return `<option value="${optValue}" ${selected}>${optLabel}</option>`;
            }).join('')}
          </select>
        `;

      case 'checkbox':
        if (field.options && field.options.length > 0) {
          // Multiple checkboxes
          return field.options.map(opt => {
            const optValue = typeof opt === 'string' ? opt : opt.value;
            const optLabel = typeof opt === 'string' ? opt : opt.label;
            const checked = Array.isArray(value) && value.includes(optValue) ? 'checked' : '';
            return `
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  name="${field.name}"
                  value="${optValue}"
                  ${checked}
                  ${field.disabled ? 'disabled' : ''} />
                ${optLabel}
              </label>
            `;
          }).join('');
        } else {
          // Single checkbox
          const checked = value ? 'checked' : '';
          return `
            <label class="checkbox-label">
              <input
                type="checkbox"
                ${commonAttrs}
                ${checked} />
              ${field.label}
            </label>
          `;
        }

      case 'radio':
        return field.options.map(opt => {
          const optValue = typeof opt === 'string' ? opt : opt.value;
          const optLabel = typeof opt === 'string' ? opt : opt.label;
          const checked = value === optValue ? 'checked' : '';
          return `
            <label class="radio-label">
              <input
                type="radio"
                name="${field.name}"
                value="${optValue}"
                ${checked}
                ${field.required ? 'required' : ''}
                ${field.disabled ? 'disabled' : ''} />
              ${optLabel}
            </label>
          `;
        }).join('');

      case 'file':
        return `
          <input
            type="file"
            class="input"
            ${commonAttrs}
            ${field.accept ? `accept="${field.accept}"` : ''}
            ${field.multiple ? 'multiple' : ''} />
        `;

      case 'hidden':
        return `<input type="hidden" name="${field.name}" value="${value || ''}" />`;

      default:
        // text, email, password, number, tel, url, date, time, datetime-local
        return `
          <input
            type="${field.type}"
            class="input"
            value="${this.escapeHTML(value || '')}"
            ${commonAttrs} />
        `;
    }
  }

  /**
   * Render action buttons
   */
  renderActions(actions) {
    if (actions.length === 0) {
      // Default submit button
      return `
        <button type="submit" class="btn btn-primary">
          Guardar
        </button>
        <button type="button" class="btn btn-ghost" onclick="history.back()">
          Cancelar
        </button>
      `;
    }

    return actions.map(action => {
      const btnClass = `btn btn-${action.variant || 'primary'}`;
      const btnType = action.type === 'submit' ? 'submit' : 'button';

      return `
        <button
          type="${btnType}"
          class="${btnClass}"
          data-action="${action.id}"
          onclick="EventCoreUI.handleFormAction('${action.id}', this, event)">
          ${action.icon ? action.icon + ' ' : ''}${action.label}
        </button>
      `;
    }).join(' ');
  }

  /**
   * Generate JavaScript for form handling
   */
  generateJS(viewDef) {
    const { id, api, fields } = viewDef;

    return `
// Form View: ${id}
(function() {
  const form = {
    id: '${id}',
    fields: ${JSON.stringify(fields)},

    async submit(formData) {
      const errors = this.validate(formData);
      if (errors.length > 0) {
        this.showErrors(errors);
        return false;
      }

      if (!${JSON.stringify(api)}) {
        console.warn('No API configured for form');
        return false;
      }

      try {
        const response = await EventCoreUI.api.request(
          '${api?.method || 'POST'}',
          '${api?.url || ''}',
          formData
        );

        EventCoreUI.showSuccess('Guardado', 'Los datos se guardaron correctamente');

        // Redirect or refresh
        if (response.redirect) {
          window.location.href = response.redirect;
        }

        return true;
      } catch (error) {
        console.error('Form submission error:', error);
        EventCoreUI.showError('Error al guardar', error.message);
        return false;
      }
    },

    validate(formData) {
      const errors = [];

      this.fields.forEach(field => {
        const value = formData[field.name];

        // Required validation
        if (field.required && !value) {
          errors.push({ field: field.name, message: \`\${field.label} es requerido\` });
        }

        // Type-specific validation
        if (value) {
          switch (field.type) {
            case 'email':
              if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {
                errors.push({ field: field.name, message: 'Email inválido' });
              }
              break;

            case 'url':
              try {
                new URL(value);
              } catch {
                errors.push({ field: field.name, message: 'URL inválida' });
              }
              break;

            case 'number':
              const num = parseFloat(value);
              if (isNaN(num)) {
                errors.push({ field: field.name, message: 'Debe ser un número' });
              } else {
                if (field.min !== undefined && num < field.min) {
                  errors.push({ field: field.name, message: \`Mínimo: \${field.min}\` });
                }
                if (field.max !== undefined && num > field.max) {
                  errors.push({ field: field.name, message: \`Máximo: \${field.max}\` });
                }
              }
              break;
          }
        }

        // Custom validation
        if (field.validation) {
          // Apply custom validation rules
          if (field.validation.pattern && value) {
            const regex = new RegExp(field.validation.pattern);
            if (!regex.test(value)) {
              errors.push({
                field: field.name,
                message: field.validation.message || 'Formato inválido'
              });
            }
          }
        }
      });

      return errors;
    },

    showErrors(errors) {
      // Clear previous errors
      document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
      document.querySelectorAll('.input, .select, .textarea').forEach(el => {
        el.style.borderColor = '';
      });

      // Show new errors
      errors.forEach(error => {
        const errorEl = document.getElementById(\`\${error.field}-error\`);
        const inputEl = document.getElementById(error.field);

        if (errorEl) errorEl.textContent = error.message;
        if (inputEl) inputEl.style.borderColor = 'var(--danger-500)';
      });
    },

    getData() {
      const formEl = document.getElementById('${id}-form');
      const formData = new FormData(formEl);
      const data = {};

      for (const [key, value] of formData.entries()) {
        if (data[key]) {
          // Handle multiple values (checkboxes)
          if (Array.isArray(data[key])) {
            data[key].push(value);
          } else {
            data[key] = [data[key], value];
          }
        } else {
          data[key] = value;
        }
      }

      return data;
    }
  };

  // Expose to EventCoreUI
  if (!window.EventCoreUI.forms) window.EventCoreUI.forms = {};
  window.EventCoreUI.forms['${id}'] = form;
})();
    `.trim();
  }

  /**
   * Escape HTML
   */
  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

export default FormView;
