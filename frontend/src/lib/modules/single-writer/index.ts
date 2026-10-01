/**
 * Módulo Un solo escritor — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'single-writer' alimentado por su blueprint (single-writer.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import SingleWriterPanel from './SingleWriterPanel.svelte';

export const singleWriterModule: UIModule = {
  manifest: {
    id: 'single-writer',
    name: 'Un solo escritor',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'single-writer-btn',
      icon: '🛡️',
      label: 'Single writer',
      action: { type: 'panel', panelId: 'single-writer-panel' },
      order: 96
    },
    panels: [{
      id: 'single-writer-panel',
      title: 'Un solo escritor',
      size: 'lg'
    }]
  },
  PanelComponent: SingleWriterPanel
};

export default singleWriterModule;

export { default as SingleWriterPanel } from './SingleWriterPanel.svelte';
