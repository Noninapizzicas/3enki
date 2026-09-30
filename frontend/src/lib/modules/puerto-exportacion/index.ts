/**
 * Módulo Puerto de exportación — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'puerto-exportacion' alimentado por su blueprint (puerto-exportacion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PuertoExportacionPanel from './PuertoExportacionPanel.svelte';

export const puertoExportacionModule: UIModule = {
  manifest: {
    id: 'puerto-exportacion',
    name: 'Puerto de exportación',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'puerto-exportacion-btn',
      icon: '📋',
      label: 'Exportar',
      action: { type: 'panel', panelId: 'puerto-exportacion-panel' },
      order: 305
    },
    panels: [{
      id: 'puerto-exportacion-panel',
      title: 'Puerto de exportación',
      size: 'lg'
    }]
  },
  PanelComponent: PuertoExportacionPanel
};

export default puertoExportacionModule;

export { default as PuertoExportacionPanel } from './PuertoExportacionPanel.svelte';
