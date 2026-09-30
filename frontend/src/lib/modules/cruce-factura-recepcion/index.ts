/**
 * Módulo Cruce factura-recepción — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'cruce-factura-recepcion' alimentado por su blueprint (cruce-factura-recepcion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CruceFacturaRecepcionPanel from './CruceFacturaRecepcionPanel.svelte';

export const cruceFacturaRecepcionModule: UIModule = {
  manifest: {
    id: 'cruce-factura-recepcion',
    name: 'Cruce factura-recepción',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cruce-factura-recepcion-btn',
      icon: '🏭',
      label: 'Cruce',
      action: { type: 'panel', panelId: 'cruce-factura-recepcion-panel' },
      order: 153
    },
    panels: [{
      id: 'cruce-factura-recepcion-panel',
      title: 'Cruce factura-recepción',
      size: 'lg'
    }]
  },
  PanelComponent: CruceFacturaRecepcionPanel
};

export default cruceFacturaRecepcionModule;

export { default as CruceFacturaRecepcionPanel } from './CruceFacturaRecepcionPanel.svelte';
