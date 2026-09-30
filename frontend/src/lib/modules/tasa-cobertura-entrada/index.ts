/**
 * Módulo Tasa de cobertura — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'tasa-cobertura-entrada' alimentado por su blueprint (tasa-cobertura-entrada.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import TasaCoberturaEntradaPanel from './TasaCoberturaEntradaPanel.svelte';

export const tasaCoberturaEntradaModule: UIModule = {
  manifest: {
    id: 'tasa-cobertura-entrada',
    name: 'Tasa de cobertura',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'tasa-cobertura-entrada-btn',
      icon: '🗂️',
      label: 'Tasa',
      action: { type: 'panel', panelId: 'tasa-cobertura-entrada-panel' },
      order: 233
    },
    panels: [{
      id: 'tasa-cobertura-entrada-panel',
      title: 'Tasa de cobertura',
      size: 'lg'
    }]
  },
  PanelComponent: TasaCoberturaEntradaPanel
};

export default tasaCoberturaEntradaModule;

export { default as TasaCoberturaEntradaPanel } from './TasaCoberturaEntradaPanel.svelte';
