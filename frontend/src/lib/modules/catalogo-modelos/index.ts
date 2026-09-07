/**
 * Módulo Catálogo Modelos — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'catalogo-modelos' alimentado por su blueprint (catalogo-modelos.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CatalogoModelosPanel from './CatalogoModelosPanel.svelte';

export const catalogoModelosModule: UIModule = {
  manifest: {
    id: 'catalogo-modelos',
    name: 'Catálogo Modelos',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'catalogo-modelos-btn',
      icon: '🗂️',
      label: 'Catálogo',
      action: { type: 'panel', panelId: 'catalogo-modelos-panel' },
      order: 20
    },
    panels: [{
      id: 'catalogo-modelos-panel',
      title: 'Catálogo',
      size: 'lg'
    }]
  },
  PanelComponent: CatalogoModelosPanel
};

export default catalogoModelosModule;

export { default as CatalogoModelosPanel } from './CatalogoModelosPanel.svelte';
