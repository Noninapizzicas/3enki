/**
 * Módulo Desatasco de entrada — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'desatasco-entrada' alimentado por su blueprint (desatasco-entrada.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import DesatascoEntradaPanel from './DesatascoEntradaPanel.svelte';

export const desatascoEntradaModule: UIModule = {
  manifest: {
    id: 'desatasco-entrada',
    name: 'Desatasco de entrada',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'desatasco-entrada-btn',
      icon: '🧯',
      label: 'Desatasco',
      action: { type: 'panel', panelId: 'desatasco-entrada-panel' },
      order: 83
    },
    panels: [{
      id: 'desatasco-entrada-panel',
      title: 'Desatasco de entrada',
      size: 'lg'
    }]
  },
  PanelComponent: DesatascoEntradaPanel
};

export default desatascoEntradaModule;

export { default as DesatascoEntradaPanel } from './DesatascoEntradaPanel.svelte';
