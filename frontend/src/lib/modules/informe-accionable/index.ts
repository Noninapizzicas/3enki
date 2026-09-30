/**
 * Módulo Informe accionable — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'informe-accionable' alimentado por su blueprint (informe-accionable.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import InformeAccionablePanel from './InformeAccionablePanel.svelte';

export const informeAccionableModule: UIModule = {
  manifest: {
    id: 'informe-accionable',
    name: 'Informe accionable',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'informe-accionable-btn',
      icon: '📋',
      label: 'Informe',
      action: { type: 'panel', panelId: 'informe-accionable-panel' },
      order: 304
    },
    panels: [{
      id: 'informe-accionable-panel',
      title: 'Informe accionable',
      size: 'lg'
    }]
  },
  PanelComponent: InformeAccionablePanel
};

export default informeAccionableModule;

export { default as InformeAccionablePanel } from './InformeAccionablePanel.svelte';
