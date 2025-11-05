/**
 * Event Core - Dashboard View Renderer
 *
 * Renders dashboard with widgets (stats, charts, tables)
 */

export class DashboardView {
  async render(viewDef, data = null, options = {}) {
    const html = this.generateHTML(viewDef, data);
    const js = this.generateJS(viewDef);

    return { html, css: '', js };
  }

  generateHTML(viewDef, data) {
    const { id, title, description, widgets = [] } = viewDef;

    return `
<div class="view-dashboard" id="${id}">
  ${title ? `<div class="page-header">
    <h2 class="page-title">${title}</h2>
    ${description ? `<p class="page-description">${description}</p>` : ''}
  </div>` : ''}

  <div class="stats-grid">
    ${widgets.map(widget => this.renderWidget(widget, data)).join('')}
  </div>
</div>
    `.trim();
  }

  renderWidget(widget, data) {
    const { id, type, title, size = 'medium' } = widget;
    const widgetData = data ? data[id] : null;

    switch (type) {
      case 'stat':
        return this.renderStatWidget(widget, widgetData);
      case 'chart':
        return this.renderChartWidget(widget, widgetData);
      case 'table':
        return this.renderTableWidget(widget, widgetData);
      case 'list':
        return this.renderListWidget(widget, widgetData);
      default:
        return this.renderCustomWidget(widget, widgetData);
    }
  }

  renderStatWidget(widget, data) {
    const value = data?.value || '—';
    const label = widget.title || widget.config?.label || 'Stat';
    const change = data?.change;

    return `
<div class="stat-card">
  <p class="stat-label">${label}</p>
  <p class="stat-value">${value}</p>
  ${change ? `
    <p class="stat-change ${change > 0 ? 'positive' : 'negative'}">
      ${change > 0 ? '↑' : '↓'} ${Math.abs(change)}%
    </p>
  ` : ''}
</div>
    `.trim();
  }

  renderChartWidget(widget, data) {
    return `
<div class="card">
  <div class="card-header">
    <h3 class="card-title">${widget.title}</h3>
  </div>
  <div class="card-body">
    <div id="${widget.id}-chart" style="height: 300px;">
      <p class="text-muted text-center">Chart implementation pending</p>
    </div>
  </div>
</div>
    `.trim();
  }

  renderTableWidget(widget, data) {
    return `
<div class="card">
  <div class="card-header">
    <h3 class="card-title">${widget.title}</h3>
  </div>
  <div class="card-body">
    <div id="${widget.id}-table">
      <!-- Mini table will be rendered here -->
    </div>
  </div>
</div>
    `.trim();
  }

  renderListWidget(widget, data) {
    const items = data?.items || [];

    return `
<div class="card">
  <div class="card-header">
    <h3 class="card-title">${widget.title}</h3>
  </div>
  <div class="card-body">
    ${items.length > 0 ? `
      <ul class="list-unstyled">
        ${items.map(item => `<li>${item.label || item.name}: ${item.value}</li>`).join('')}
      </ul>
    ` : '<p class="text-muted">No hay datos</p>'}
  </div>
</div>
    `.trim();
  }

  renderCustomWidget(widget, data) {
    return `
<div class="card">
  <div class="card-header">
    <h3 class="card-title">${widget.title}</h3>
  </div>
  <div class="card-body">
    <div id="${widget.id}">
      <!-- Custom widget content -->
    </div>
  </div>
</div>
    `.trim();
  }

  generateJS(viewDef) {
    const { id, widgets } = viewDef;

    return `
(function() {
  const dashboard = {
    id: '${id}',
    widgets: ${JSON.stringify(widgets)},

    async loadData() {
      for (const widget of this.widgets) {
        if (widget.api) {
          try {
            const data = await EventCoreUI.api.get(widget.api.url);
            this.updateWidget(widget.id, data);
          } catch (error) {
            console.error(\`Error loading widget \${widget.id}:\`, error);
          }
        }

        if (widget.refreshInterval) {
          setInterval(() => this.loadData(), widget.refreshInterval);
        }
      }
    },

    updateWidget(widgetId, data) {
      const el = document.getElementById(widgetId);
      if (el && data) {
        // Update widget with new data
        console.log(\`Updating widget \${widgetId}\`, data);
      }
    }
  };

  dashboard.loadData();

  if (!window.EventCoreUI.dashboards) window.EventCoreUI.dashboards = {};
  window.EventCoreUI.dashboards['${id}'] = dashboard;
})();
    `.trim();
  }
}

export default DashboardView;
