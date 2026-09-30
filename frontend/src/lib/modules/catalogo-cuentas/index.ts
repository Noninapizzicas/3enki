/**
 * Módulo Catálogo de cuentas — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'catalogo-cuentas' alimentado por su blueprint (catalogo-cuentas.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CatalogoCuentasPanel from './CatalogoCuentasPanel.svelte';

export const catalogoCuentasModule: UIModule = {
  manifest: {
    id: 'catalogo-cuentas',
    name: 'Catálogo de cuentas',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'catalogo-cuentas-btn',
      icon: '📒',
      label: 'Cuentas',
      action: { type: 'panel', panelId: 'catalogo-cuentas-panel' },
      order: 31
    },
    panels: [{
      id: 'catalogo-cuentas-panel',
      title: 'Catálogo de cuentas',
      size: 'lg'
    }]
  },
  PanelComponent: CatalogoCuentasPanel
};

export default catalogoCuentasModule;

export { default as CatalogoCuentasPanel } from './CatalogoCuentasPanel.svelte';
