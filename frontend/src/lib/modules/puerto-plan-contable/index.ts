/**
 * Módulo Puerto de plan contable — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'puerto-plan-contable' alimentado por su blueprint (puerto-plan-contable.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PuertoPlanContablePanel from './PuertoPlanContablePanel.svelte';

export const puertoPlanContableModule: UIModule = {
  manifest: {
    id: 'puerto-plan-contable',
    name: 'Puerto de plan contable',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'puerto-plan-contable-btn',
      icon: '📋',
      label: 'Plan contable',
      action: { type: 'panel', panelId: 'puerto-plan-contable-panel' },
      order: 301
    },
    panels: [{
      id: 'puerto-plan-contable-panel',
      title: 'Puerto de plan contable',
      size: 'lg'
    }]
  },
  PanelComponent: PuertoPlanContablePanel
};

export default puertoPlanContableModule;

export { default as PuertoPlanContablePanel } from './PuertoPlanContablePanel.svelte';
