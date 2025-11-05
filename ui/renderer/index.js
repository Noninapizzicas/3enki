/**
 * Event Core - UI Renderer
 *
 * Orchestrates the rendering of module UIs from JSON definitions
 */

import { Parser } from './parser.js';
import { Validator } from './validator.js';

// View types
import { TableView } from './viewTypes/TableView.js';
import { FormView } from './viewTypes/FormView.js';
import { DetailView } from './viewTypes/DetailView.js';
import { DashboardView } from './viewTypes/DashboardView.js';
import { CustomView } from './viewTypes/CustomView.js';

/**
 * Main UI Renderer class
 *
 * Converts JSON UI definitions into HTML/CSS/JS
 */
class UIRenderer {
  constructor() {
    this.parser = new Parser();
    this.validator = new Validator();

    // Register view renderers
    this.viewRenderers = new Map([
      ['table', TableView],
      ['form', FormView],
      ['detail', DetailView],
      ['dashboard', DashboardView],
      ['custom', CustomView]
    ]);
  }

  /**
   * Render a complete module UI
   *
   * @param {Object} moduleDefinition - Complete module UI definition
   * @param {Object} options - Rendering options
   * @returns {Object} - { html, css, js, metadata }
   */
  async renderModule(moduleDefinition, options = {}) {
    // Validate the UI definition
    const validation = this.validator.validate(moduleDefinition);
    if (!validation.valid) {
      throw new Error(`Invalid UI definition: ${validation.errors.join(', ')}`);
    }

    // Parse and normalize the definition
    const parsed = this.parser.parse(moduleDefinition);

    // Render metadata
    const metadata = {
      moduleName: parsed.name,
      title: parsed.title,
      version: parsed.version,
      views: parsed.views.map(v => ({
        id: v.id,
        type: v.type,
        title: v.title
      }))
    };

    // Generate HTML container
    const html = this.generateModuleContainer(parsed);

    // Generate CSS (if any custom styles)
    const css = this.generateModuleStyles(parsed);

    // Generate JS for interactivity
    const js = this.generateModuleScript(parsed);

    return {
      html,
      css,
      js,
      metadata
    };
  }

  /**
   * Render a specific view from a module
   *
   * @param {Object} viewDefinition - View definition from module.json
   * @param {Object} data - Data to populate the view (optional)
   * @param {Object} options - Rendering options
   * @returns {Object} - { html, css, js }
   */
  async renderView(viewDefinition, data = null, options = {}) {
    // Validate view definition
    const validation = this.validator.validateView(viewDefinition);
    if (!validation.valid) {
      throw new Error(`Invalid view definition: ${validation.errors.join(', ')}`);
    }

    // Parse and normalize
    const parsed = this.parser.parseView(viewDefinition);

    // Get appropriate renderer for this view type
    const RendererClass = this.viewRenderers.get(parsed.type);
    if (!RendererClass) {
      throw new Error(`Unknown view type: ${parsed.type}`);
    }

    // Create renderer instance and render
    const renderer = new RendererClass();
    const result = await renderer.render(parsed, data, options);

    return result;
  }

  /**
   * Generate HTML container for a module
   */
  generateModuleContainer(parsed) {
    return `
<div class="module-container" data-module="${parsed.name}">
  <div class="module-header">
    <h1 class="module-title">${parsed.title}</h1>
    ${parsed.description ? `<p class="module-description">${parsed.description}</p>` : ''}
  </div>

  <div class="module-views">
    ${parsed.views.length > 1 ? this.generateViewTabs(parsed.views) : ''}
    <div class="module-view-content" id="view-container">
      <!-- Views will be rendered here dynamically -->
    </div>
  </div>
</div>
    `.trim();
  }

  /**
   * Generate view tabs if module has multiple views
   */
  generateViewTabs(views) {
    return `
<nav class="module-tabs">
  ${views.map((view, index) => `
    <button
      class="module-tab ${index === 0 ? 'active' : ''}"
      data-view-id="${view.id}"
      onclick="EventCoreUI.switchView('${view.id}')">
      ${view.title || view.id}
    </button>
  `).join('')}
</nav>
    `.trim();
  }

  /**
   * Generate module-specific CSS
   */
  generateModuleStyles(parsed) {
    // For now, return empty - modules use the Design System
    // Custom styles can be added here if needed
    return '';
  }

  /**
   * Generate module JavaScript for interactivity
   */
  generateModuleScript(parsed) {
    return `
// Module: ${parsed.name}
(function() {
  'use strict';

  const module = {
    name: '${parsed.name}',
    views: ${JSON.stringify(parsed.views.map(v => ({ id: v.id, type: v.type, title: v.title })))},
    currentView: null,

    async loadView(viewId) {
      const view = this.views.find(v => v.id === viewId);
      if (!view) {
        console.error('View not found:', viewId);
        return;
      }

      this.currentView = viewId;

      // Update active tab
      document.querySelectorAll('.module-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.viewId === viewId);
      });

      // Load and render view
      try {
        const viewDef = await EventCoreUI.api.get(\`/ui/modules/${parsed.name}/view/\${viewId}\`);
        const rendered = await EventCoreUI.renderer.renderView(viewDef);
        document.getElementById('view-container').innerHTML = rendered.html;

        // Load data if view has API endpoint
        if (viewDef.api) {
          await this.loadViewData(viewDef);
        }
      } catch (error) {
        console.error('Error loading view:', error);
        EventCoreUI.showError('Failed to load view: ' + error.message);
      }
    },

    async loadViewData(viewDef) {
      try {
        const response = await EventCoreUI.api.request(viewDef.api.method, viewDef.api.url);
        EventCoreUI.populateView(viewDef, response);
      } catch (error) {
        console.error('Error loading view data:', error);
        EventCoreUI.showError('Failed to load data: ' + error.message);
      }
    }
  };

  // Load first view on initialization
  window.addEventListener('DOMContentLoaded', () => {
    if (module.views.length > 0) {
      module.loadView(module.views[0].id);
    }
  });

  // Expose module to EventCoreUI
  if (!window.EventCoreUI) window.EventCoreUI = {};
  if (!window.EventCoreUI.modules) window.EventCoreUI.modules = {};
  window.EventCoreUI.modules['${parsed.name}'] = module;
})();
    `.trim();
  }

  /**
   * Register a custom view renderer
   *
   * @param {string} viewType - Type identifier (e.g., 'custom-chart')
   * @param {Class} RendererClass - Renderer class
   */
  registerViewRenderer(viewType, RendererClass) {
    this.viewRenderers.set(viewType, RendererClass);
  }

  /**
   * Get list of supported view types
   *
   * @returns {Array<string>} - Array of view type identifiers
   */
  getSupportedViewTypes() {
    return Array.from(this.viewRenderers.keys());
  }
}

// Export singleton instance
export const renderer = new UIRenderer();
export default UIRenderer;
