/**
 * Módulo Importación de Modelo — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'importacion-modelo' alimentado por su blueprint (importacion-modelo.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ImportacionModeloPanel from './ImportacionModeloPanel.svelte';

export const importacionModeloModule: UIModule = {
  manifest: {
    id: 'importacion-modelo',
    name: 'Importar Modelo',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'importacion-modelo-btn',
      icon: '📥',
      label: 'Importar',
      action: { type: 'panel', panelId: 'importacion-modelo-panel' },
      order: 27
    },
    panels: [{
      id: 'importacion-modelo-panel',
      title: 'Importar Modelo',
      size: 'lg'
    }]
  },
  PanelComponent: ImportacionModeloPanel
};

export default importacionModeloModule;

export { default as ImportacionModeloPanel } from './ImportacionModeloPanel.svelte';
