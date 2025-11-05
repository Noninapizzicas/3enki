/**
 * Event Core - Custom View Renderer
 *
 * Renders custom HTML views defined by modules
 */

export class CustomView {
  async render(viewDef, data = null, options = {}) {
    const html = this.generateHTML(viewDef, data);
    const js = this.generateJS(viewDef);

    return { html, css: '', js };
  }

  generateHTML(viewDef, data) {
    const { id, title, description, html, template } = viewDef;

    let content = '';
    if (html) {
      content = html;
    } else if (template) {
      content = this.renderTemplate(template, data);
    } else {
      content = '<p class="text-muted">Custom view - no content provided</p>';
    }

    return `
<div class="view-custom" id="${id}">
  ${title ? `<div class="page-header">
    <h2 class="page-title">${title}</h2>
    ${description ? `<p class="page-description">${description}</p>` : ''}
  </div>` : ''}

  <div class="custom-content">
    ${content}
  </div>
</div>
    `.trim();
  }

  renderTemplate(template, data) {
    if (!data) return template;

    // Simple template engine - replace {{field}} with data[field]
    return template.replace(/\{\{(\w+)\}\}/g, (match, field) => {
      return data[field] !== undefined ? data[field] : match;
    });
  }

  generateJS(viewDef) {
    const { id, script } = viewDef;

    if (!script) return '';

    return `
(function() {
  const customView = {
    id: '${id}',
    initialize() {
      ${script}
    }
  };

  customView.initialize();

  if (!window.EventCoreUI.customViews) window.EventCoreUI.customViews = {};
  window.EventCoreUI.customViews['${id}'] = customView;
})();
    `.trim();
  }
}

export default CustomView;
