/**
 * Módulo Recetas
 *
 * Gestión de recetas con ingredientes, cantidades y precios de mercado.
 * Se integra en LazyShell con work-bar + chat + panel flotante.
 */

import type { UIModule } from '$lib/ui-core';
import RecetasPanel from './RecetasPanel.svelte';

export const recetasModule: UIModule = {
  manifest: {
    id: 'recetas',
    name: 'Recetas',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'recetas-btn',
      icon: '📖',
      label: 'Recetas',
      action: { type: 'panel', panelId: 'recetas-panel' },
      order: 1
    },
    panels: [{
      id: 'recetas-panel',
      title: 'Recetas',
      size: 'lg'
    }]
  },
  PanelComponent: RecetasPanel
};

export default recetasModule;

// Re-export component for direct use
export { default as RecetasPanel } from './RecetasPanel.svelte';

// Re-export store functions
export {
  recetasStore,
  sortedRecetas,
  selectedReceta,
  recetasActiveTab,
  recetasLoading,
  recetasError,
  recetasStats,
  recetasIngredientes,
  initRecetasSubscriptions,
  loadRecetas,
  getReceta,
  loadIngredientes,
  loadStats,
  setActiveTab,
  selectReceta,
  clearError,
  type Receta,
  type RecetaResumen,
  type RecetaIngrediente,
  type CatalogoIngrediente,
  type RecetasState
} from '$lib/stores/recetas';
