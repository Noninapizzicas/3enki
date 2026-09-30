/**
 * Módulo Ajuste de inventario — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'ajuste-inventario' alimentado por su blueprint (ajuste-inventario.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import AjusteInventarioPanel from './AjusteInventarioPanel.svelte';

export const ajusteInventarioModule: UIModule = {
  manifest: {
    id: 'ajuste-inventario',
    name: 'Ajuste de inventario',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'ajuste-inventario-btn',
      icon: '📊',
      label: 'Ajuste inv.',
      action: { type: 'panel', panelId: 'ajuste-inventario-panel' },
      order: 222
    },
    panels: [{
      id: 'ajuste-inventario-panel',
      title: 'Ajuste de inventario',
      size: 'lg'
    }]
  },
  PanelComponent: AjusteInventarioPanel
};

export default ajusteInventarioModule;

export { default as AjusteInventarioPanel } from './AjusteInventarioPanel.svelte';
