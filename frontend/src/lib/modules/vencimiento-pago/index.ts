/**
 * Módulo Vencimientos de pago — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'vencimiento-pago' alimentado por su blueprint (vencimiento-pago.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import VencimientoPagoPanel from './VencimientoPagoPanel.svelte';

export const vencimientoPagoModule: UIModule = {
  manifest: {
    id: 'vencimiento-pago',
    name: 'Vencimientos de pago',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'vencimiento-pago-btn',
      icon: '🏦',
      label: 'Vencimientos',
      action: { type: 'panel', panelId: 'vencimiento-pago-panel' },
      order: 95
    },
    panels: [{
      id: 'vencimiento-pago-panel',
      title: 'Vencimientos de pago',
      size: 'lg'
    }]
  },
  PanelComponent: VencimientoPagoPanel
};

export default vencimientoPagoModule;

export { default as VencimientoPagoPanel } from './VencimientoPagoPanel.svelte';
