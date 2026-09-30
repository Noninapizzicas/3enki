/**
 * Módulo Liquidación de IVA — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'liquidacion-iva' alimentado por su blueprint (liquidacion-iva.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import LiquidacionIvaPanel from './LiquidacionIvaPanel.svelte';

export const liquidacionIvaModule: UIModule = {
  manifest: {
    id: 'liquidacion-iva',
    name: 'Liquidación de IVA',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'liquidacion-iva-btn',
      icon: '🧾',
      label: 'IVA',
      action: { type: 'panel', panelId: 'liquidacion-iva-panel' },
      order: 61
    },
    panels: [{
      id: 'liquidacion-iva-panel',
      title: 'Liquidación de IVA',
      size: 'lg'
    }]
  },
  PanelComponent: LiquidacionIvaPanel
};

export default liquidacionIvaModule;

export { default as LiquidacionIvaPanel } from './LiquidacionIvaPanel.svelte';
