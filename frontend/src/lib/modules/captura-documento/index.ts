/**
 * Módulo Captura de documento — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'captura-documento' alimentado por su blueprint (captura-documento.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CapturaDocumentoPanel from './CapturaDocumentoPanel.svelte';

export const capturaDocumentoModule: UIModule = {
  manifest: {
    id: 'captura-documento',
    name: 'Captura de documento',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'captura-documento-btn',
      icon: '📥',
      label: 'Captura',
      action: { type: 'panel', panelId: 'captura-documento-panel' },
      order: 42
    },
    panels: [{
      id: 'captura-documento-panel',
      title: 'Captura de documento',
      size: 'lg'
    }]
  },
  PanelComponent: CapturaDocumentoPanel
};

export default capturaDocumentoModule;

export { default as CapturaDocumentoPanel } from './CapturaDocumentoPanel.svelte';
