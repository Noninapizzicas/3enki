/**
 * Módulo Encolado de excepción — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'encolado-excepcion' alimentado por su blueprint (encolado-excepcion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import EncoladoExcepcionPanel from './EncoladoExcepcionPanel.svelte';

export const encoladoExcepcionModule: UIModule = {
  manifest: {
    id: 'encolado-excepcion',
    name: 'Encolado de excepción',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'encolado-excepcion-btn',
      icon: '📥',
      label: 'Encolar excepción',
      action: { type: 'panel', panelId: 'encolado-excepcion-panel' },
      order: 42
    },
    panels: [{
      id: 'encolado-excepcion-panel',
      title: 'Encolado de excepción',
      size: 'lg'
    }]
  },
  PanelComponent: EncoladoExcepcionPanel
};

export default encoladoExcepcionModule;

export { default as EncoladoExcepcionPanel } from './EncoladoExcepcionPanel.svelte';
