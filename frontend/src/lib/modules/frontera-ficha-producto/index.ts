/**
 * Módulo Frontera de ficha — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'frontera-ficha-producto' alimentado por su blueprint (frontera-ficha-producto.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import FronteraFichaProductoPanel from './FronteraFichaProductoPanel.svelte';

export const fronteraFichaProductoModule: UIModule = {
  manifest: {
    id: 'frontera-ficha-producto',
    name: 'Frontera de ficha',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'frontera-ficha-producto-btn',
      icon: '📦',
      label: 'Ficha producto',
      action: { type: 'panel', panelId: 'frontera-ficha-producto-panel' },
      order: 131
    },
    panels: [{
      id: 'frontera-ficha-producto-panel',
      title: 'Frontera de ficha',
      size: 'lg'
    }]
  },
  PanelComponent: FronteraFichaProductoPanel
};

export default fronteraFichaProductoModule;

export { default as FronteraFichaProductoPanel } from './FronteraFichaProductoPanel.svelte';
