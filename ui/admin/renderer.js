/**
 * Event Core - UI Renderer Bundle
 *
 * Expone el sistema de renderizado de vistas para el Admin Panel
 */

// Import view renderers
import { TableView } from '../renderer/viewTypes/TableView.js';
import { FormView } from '../renderer/viewTypes/FormView.js';
import { DetailView } from '../renderer/viewTypes/DetailView.js';
import { DashboardView } from '../renderer/viewTypes/DashboardView.js';
import { CustomView } from '../renderer/viewTypes/CustomView.js';

/**
 * UI Renderer for Admin Panel
 * Simplified version that works client-side
 */
class UIRenderer {
  constructor() {
    // Register view renderers
    this.viewRenderers = new Map([
      ['table', new TableView()],
      ['form', new FormView()],
      ['detail', new DetailView()],
      ['dashboard', new DashboardView()],
      ['custom', new CustomView()]
    ]);
  }

  /**
   * Render a view
   * @param {Object} viewDef - View definition from module.json
   * @param {Object} data - Data to populate the view
   * @param {Object} options - Rendering options
   * @returns {Object} { html, css, js }
   */
  async renderView(viewDef, data = null, options = {}) {
    const renderer = this.viewRenderers.get(viewDef.type);

    if (!renderer) {
      throw new Error(`Unknown view type: ${viewDef.type}`);
    }

    const result = await renderer.render(viewDef, data, options);
    return result;
  }

  /**
   * Get supported view types
   */
  getSupportedViewTypes() {
    return Array.from(this.viewRenderers.keys());
  }
}

// Create singleton instance and expose globally
const renderer = new UIRenderer();

// Expose to window for use in app.js
if (!window.EventCoreUI) {
  window.EventCoreUI = {};
}

window.EventCoreUI.renderer = renderer;

export default renderer;
