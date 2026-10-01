/**
 * Módulo Aviso de revisión — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'aviso-revision' alimentado por su blueprint (aviso-revision.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import AvisoRevisionPanel from './AvisoRevisionPanel.svelte';

export const avisoRevisionModule: UIModule = {
  manifest: {
    id: 'aviso-revision',
    name: 'Aviso de revisión',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'aviso-revision-btn',
      icon: '🚩',
      label: 'Aviso revisión',
      action: { type: 'panel', panelId: 'aviso-revision-panel' },
      order: 81
    },
    panels: [{
      id: 'aviso-revision-panel',
      title: 'Aviso de revisión',
      size: 'lg'
    }]
  },
  PanelComponent: AvisoRevisionPanel
};

export default avisoRevisionModule;

export { default as AvisoRevisionPanel } from './AvisoRevisionPanel.svelte';
