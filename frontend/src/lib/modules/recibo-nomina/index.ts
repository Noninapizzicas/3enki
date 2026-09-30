/**
 * Módulo Recibo de nómina — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'recibo-nomina' alimentado por su blueprint (recibo-nomina.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ReciboNominaPanel from './ReciboNominaPanel.svelte';

export const reciboNominaModule: UIModule = {
  manifest: {
    id: 'recibo-nomina',
    name: 'Recibo de nómina',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'recibo-nomina-btn',
      icon: '👤',
      label: 'Recibo',
      action: { type: 'panel', panelId: 'recibo-nomina-panel' },
      order: 112
    },
    panels: [{
      id: 'recibo-nomina-panel',
      title: 'Recibo de nómina',
      size: 'lg'
    }]
  },
  PanelComponent: ReciboNominaPanel
};

export default reciboNominaModule;

export { default as ReciboNominaPanel } from './ReciboNominaPanel.svelte';
