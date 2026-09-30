/**
 * Módulo Cola de excepciones — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'encolado-excepcion' alimentado por su blueprint (encolado-excepcion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import EncoladoExcepcionPanel from './EncoladoExcepcionPanel.svelte';

export const encoladoExcepcionModule: UIModule = {
  manifest: {
    id: 'encolado-excepcion',
    name: 'Cola de excepciones',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'encolado-excepcion-btn',
      icon: '⚙️',
      label: 'Excepciones',
      action: { type: 'panel', panelId: 'encolado-excepcion-panel' },
      order: 205
    },
    panels: [{
      id: 'encolado-excepcion-panel',
      title: 'Cola de excepciones',
      size: 'lg'
    }]
  },
  PanelComponent: EncoladoExcepcionPanel
};

export default encoladoExcepcionModule;

export { default as EncoladoExcepcionPanel } from './EncoladoExcepcionPanel.svelte';
