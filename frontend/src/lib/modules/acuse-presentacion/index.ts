/**
 * Módulo Acuse de presentación — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'acuse-presentacion' alimentado por su blueprint (acuse-presentacion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import AcusePresentacionPanel from './AcusePresentacionPanel.svelte';

export const acusePresentacionModule: UIModule = {
  manifest: {
    id: 'acuse-presentacion',
    name: 'Acuse de presentación',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'acuse-presentacion-btn',
      icon: '🧾',
      label: 'Acuse',
      action: { type: 'panel', panelId: 'acuse-presentacion-panel' },
      order: 82
    },
    panels: [{
      id: 'acuse-presentacion-panel',
      title: 'Acuse de presentación',
      size: 'lg'
    }]
  },
  PanelComponent: AcusePresentacionPanel
};

export default acusePresentacionModule;

export { default as AcusePresentacionPanel } from './AcusePresentacionPanel.svelte';
