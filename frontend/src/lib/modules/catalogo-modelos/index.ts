/**
 * Módulo Catalogo-Modelos — envoltorio del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las 4 zonas del panel del módulo
 * 'catalogo-modelos' alimentado por su blueprint (catalogo-modelos.blueprint.json, sección `ui`).
 * Nada artesanal: el trío de este módulo es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 */

import type { UIModule } from '$lib/ui-core';
import CatalogoModelosPanel from './CatalogoModelosPanel.svelte';

export const catalogoModelosModule: UIModule = {
  manifest: {
    id: 'catalogo-modelos',
    name: 'Catálogo de modelos 3D',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'catalogo-modelos-btn',
      icon: '🧊',
      label: 'Catálogo 3D',
      action: { type: 'panel', panelId: 'catalogo-modelos-panel' },
      order: 8
    },
    panels: [{
      id: 'catalogo-modelos-panel',
      title: 'Catálogo de modelos 3D',
      size: 'lg'
    }]
  },
  PanelComponent: CatalogoModelosPanel
};

export default catalogoModelosModule;

export { default as CatalogoModelosPanel } from './CatalogoModelosPanel.svelte';
