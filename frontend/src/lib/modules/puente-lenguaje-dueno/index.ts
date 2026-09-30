/**
 * Módulo Lenguaje del dueño — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'puente-lenguaje-dueno' alimentado por su blueprint (puente-lenguaje-dueno.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PuenteLenguajeDuenoPanel from './PuenteLenguajeDuenoPanel.svelte';

export const puenteLenguajeDuenoModule: UIModule = {
  manifest: {
    id: 'puente-lenguaje-dueno',
    name: 'Lenguaje del dueño',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'puente-lenguaje-dueno-btn',
      icon: '📋',
      label: 'Lenguaje',
      action: { type: 'panel', panelId: 'puente-lenguaje-dueno-panel' },
      order: 303
    },
    panels: [{
      id: 'puente-lenguaje-dueno-panel',
      title: 'Lenguaje del dueño',
      size: 'lg'
    }]
  },
  PanelComponent: PuenteLenguajeDuenoPanel
};

export default puenteLenguajeDuenoModule;

export { default as PuenteLenguajeDuenoPanel } from './PuenteLenguajeDuenoPanel.svelte';
