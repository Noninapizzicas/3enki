/**
 * Módulo Padrón de terceros — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'padron-terceros' alimentado por su blueprint (padron-terceros.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import PadronTercerosPanel from './PadronTercerosPanel.svelte';

export const padronTercerosModule: UIModule = {
  manifest: {
    id: 'padron-terceros',
    name: 'Padrón de terceros',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'padron-terceros-btn',
      icon: '🪪',
      label: 'Padrón terceros',
      action: { type: 'panel', panelId: 'padron-terceros-panel' },
      order: 45
    },
    panels: [{
      id: 'padron-terceros-panel',
      title: 'Padrón de terceros',
      size: 'lg'
    }]
  },
  PanelComponent: PadronTercerosPanel
};

export default padronTercerosModule;

export { default as PadronTercerosPanel } from './PadronTercerosPanel.svelte';
