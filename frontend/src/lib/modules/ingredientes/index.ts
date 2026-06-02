/**
 * Módulo Ingredientes
 *
 * Catálogo de ingredientes con precios de mercado (solo lectura, Postura B).
 * Las mutaciones de precio se piden al chat — los botones pre-rellenan el
 * input. Hermano de recetas/: comparten el store y el /recetas.json del
 * proyecto (ingredientes_catalogo).
 */

import type { UIModule } from '$lib/ui-core';
import IngredientesPanel from './IngredientesPanel.svelte';

export const ingredientesModule: UIModule = {
  manifest: {
    id: 'ingredientes',
    name: 'Ingredientes',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'ingredientes-btn',
      icon: '🥬',
      label: 'Ingredientes',
      action: { type: 'panel', panelId: 'ingredientes-panel' },
      order: 2
    },
    panels: [{
      id: 'ingredientes-panel',
      title: 'Ingredientes',
      size: 'lg'
    }]
  },
  PanelComponent: IngredientesPanel
};

export default ingredientesModule;

// Re-export component for direct use
export { default as IngredientesPanel } from './IngredientesPanel.svelte';
