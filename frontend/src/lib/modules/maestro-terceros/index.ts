/**
 * Módulo Maestro de terceros — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'maestro-terceros' alimentado por su blueprint (maestro-terceros.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import MaestroTercerosPanel from './MaestroTercerosPanel.svelte';

export const maestroTercerosModule: UIModule = {
  manifest: {
    id: 'maestro-terceros',
    name: 'Maestro de terceros',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'maestro-terceros-btn',
      icon: '📥',
      label: 'Terceros',
      action: { type: 'panel', panelId: 'maestro-terceros-panel' },
      order: 46
    },
    panels: [{
      id: 'maestro-terceros-panel',
      title: 'Maestro de terceros',
      size: 'lg'
    }]
  },
  PanelComponent: MaestroTercerosPanel
};

export default maestroTercerosModule;

export { default as MaestroTercerosPanel } from './MaestroTercerosPanel.svelte';
