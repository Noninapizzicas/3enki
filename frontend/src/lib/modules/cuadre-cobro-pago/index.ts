/**
 * Módulo Cuadre cobro-pago — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'cuadre-cobro-pago' alimentado por su blueprint (cuadre-cobro-pago.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CuadreCobroPagoPanel from './CuadreCobroPagoPanel.svelte';

export const cuadreCobroPagoModule: UIModule = {
  manifest: {
    id: 'cuadre-cobro-pago',
    name: 'Cuadre cobro-pago',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cuadre-cobro-pago-btn',
      icon: '🏦',
      label: 'Cuadre pagos',
      action: { type: 'panel', panelId: 'cuadre-cobro-pago-panel' },
      order: 94
    },
    panels: [{
      id: 'cuadre-cobro-pago-panel',
      title: 'Cuadre cobro-pago',
      size: 'lg'
    }]
  },
  PanelComponent: CuadreCobroPagoPanel
};

export default cuadreCobroPagoModule;

export { default as CuadreCobroPagoPanel } from './CuadreCobroPagoPanel.svelte';
