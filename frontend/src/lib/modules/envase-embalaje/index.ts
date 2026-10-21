/**
 * Módulo Envase-Embalaje — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'envase-embalaje' alimentado por su blueprint (envase-embalaje.blueprint.json, sección `ui`).
 * Reflejo del patrón masa (F7): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import EnvasePanel from './EnvasePanel.svelte';

export const envaseEmbalajeModule: UIModule = {
  manifest: {
    id: 'envase-embalaje',
    name: 'Envase',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'envase-btn',
      icon: '📦',
      label: 'Envase',
      action: { type: 'panel', panelId: 'envase-panel' },
      order: 14
    },
    panels: [{
      id: 'envase-panel',
      title: 'Envase y embalaje',
      size: 'lg'
    }]
  },
  PanelComponent: EnvasePanel
};

export default envaseEmbalajeModule;

export { default as EnvasePanel } from './EnvasePanel.svelte';
