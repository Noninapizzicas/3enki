/**
 * Módulo Rappel por pronto pago — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'rappel-pronto-pago' alimentado por su blueprint (rappel-pronto-pago.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import RappelProntoPagoPanel from './RappelProntoPagoPanel.svelte';

export const rappelProntoPagoModule: UIModule = {
  manifest: {
    id: 'rappel-pronto-pago',
    name: 'Rappel por pronto pago',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'rappel-pronto-pago-btn',
      icon: '🏭',
      label: 'Rappel',
      action: { type: 'panel', panelId: 'rappel-pronto-pago-panel' },
      order: 154
    },
    panels: [{
      id: 'rappel-pronto-pago-panel',
      title: 'Rappel por pronto pago',
      size: 'lg'
    }]
  },
  PanelComponent: RappelProntoPagoPanel
};

export default rappelProntoPagoModule;

export { default as RappelProntoPagoPanel } from './RappelProntoPagoPanel.svelte';
