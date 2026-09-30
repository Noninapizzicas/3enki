/**
 * Módulo Cuadre del documento — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'control-cuadre-documento' alimentado por su blueprint (control-cuadre-documento.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ControlCuadreDocumentoPanel from './ControlCuadreDocumentoPanel.svelte';

export const controlCuadreDocumentoModule: UIModule = {
  manifest: {
    id: 'control-cuadre-documento',
    name: 'Cuadre del documento',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'control-cuadre-documento-btn',
      icon: '📥',
      label: 'Cuadre',
      action: { type: 'panel', panelId: 'control-cuadre-documento-panel' },
      order: 44
    },
    panels: [{
      id: 'control-cuadre-documento-panel',
      title: 'Cuadre del documento',
      size: 'lg'
    }]
  },
  PanelComponent: ControlCuadreDocumentoPanel
};

export default controlCuadreDocumentoModule;

export { default as ControlCuadreDocumentoPanel } from './ControlCuadreDocumentoPanel.svelte';
