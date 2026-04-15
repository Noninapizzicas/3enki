/**
 * Módulo Viabilidad Receta v2.0.0
 *
 * Evaluación de viabilidad de recetas: rentabilidad, riesgos y recomendaciones.
 *
 * Components:
 * - ViabilidadPanel: Main panel with browser and detail views
 * - ViabilidadBrowser: Search/filter interface with rankings
 * - ViabilidadCard: Compact summary card for single viability
 * - ViabilidadDetail: Full details view with breakdown and recommendations
 * - ViabilidadRecomendaciones: Display recommendations and their impact
 */

import type { UIModule } from '$lib/ui-core';
import ViabilidadPanel from './ViabilidadPanel.svelte';

export const viabilidadModule: UIModule = {
  manifest: {
    id: 'viabilidad',
    name: 'Viabilidad Receta',
    version: '2.0.0',
    zone: 'work-bar',
    button: {
      id: 'viabilidad-btn',
      icon: '📈',
      label: 'Viabilidad',
      action: { type: 'panel', panelId: 'viabilidad-panel' },
      order: 3
    },
    panels: [{
      id: 'viabilidad-panel',
      title: 'Viabilidad Receta',
      size: 'lg'
    }]
  },
  PanelComponent: ViabilidadPanel
};

export default viabilidadModule;

// Main panel component
export { default as ViabilidadPanel } from './ViabilidadPanel.svelte';

// Sub-components for modularity
export { default as ViabilidadBrowser } from './ViabilidadBrowser.svelte';
export { default as ViabilidadCard } from './ViabilidadCard.svelte';
export { default as ViabilidadDetail } from './ViabilidadDetail.svelte';
export { default as ViabilidadRecomendaciones } from './ViabilidadRecomendaciones.svelte';
