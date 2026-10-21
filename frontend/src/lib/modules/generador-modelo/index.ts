/**
 * Módulo Generador de modelo — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'generador-modelo' alimentado por su blueprint (generador-modelo.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import GeneradorModeloPanel from './GeneradorModeloPanel.svelte';

export const GeneradorModeloModule: UIModule = {
  manifest: {
    id: 'generador-modelo',
    name: 'Generador de modelo',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'generador-modelo-btn',
      icon: '📤',
      label: 'Gen. modelo',
      action: { type: 'panel', panelId: 'generador-modelo-panel' },
      order: 104
    },
    panels: [{
      id: 'generador-modelo-panel',
      title: 'Generador de modelo',
      size: 'lg'
    }]
  },
  PanelComponent: GeneradorModeloPanel
};

export default GeneradorModeloModule;

export { default as GeneradorModeloPanel } from './GeneradorModeloPanel.svelte';
