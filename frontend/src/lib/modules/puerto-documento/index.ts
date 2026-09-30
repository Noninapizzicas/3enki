/**
 * Módulo Frontera de documentos — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'puerto-documento' alimentado por su blueprint (puerto-documento.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PuertoDocumentoPanel from './PuertoDocumentoPanel.svelte';

export const puertoDocumentoModule: UIModule = {
  manifest: {
    id: 'puerto-documento',
    name: 'Frontera de documentos',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'puerto-documento-btn',
      icon: '📥',
      label: 'Documento',
      action: { type: 'panel', panelId: 'puerto-documento-panel' },
      order: 41
    },
    panels: [{
      id: 'puerto-documento-panel',
      title: 'Frontera de documentos',
      size: 'lg'
    }]
  },
  PanelComponent: PuertoDocumentoPanel
};

export default puertoDocumentoModule;

export { default as PuertoDocumentoPanel } from './PuertoDocumentoPanel.svelte';
