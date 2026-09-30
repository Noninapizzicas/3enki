/**
 * Módulo Factura electrónica — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'factura-electronica' alimentado por su blueprint (factura-electronica.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import FacturaElectronicaPanel from './FacturaElectronicaPanel.svelte';

export const facturaElectronicaModule: UIModule = {
  manifest: {
    id: 'factura-electronica',
    name: 'Factura electrónica',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'factura-electronica-btn',
      icon: '🧾',
      label: 'Facturae',
      action: { type: 'panel', panelId: 'factura-electronica-panel' },
      order: 70
    },
    panels: [{
      id: 'factura-electronica-panel',
      title: 'Factura electrónica',
      size: 'lg'
    }]
  },
  PanelComponent: FacturaElectronicaPanel
};

export default facturaElectronicaModule;

export { default as FacturaElectronicaPanel } from './FacturaElectronicaPanel.svelte';
