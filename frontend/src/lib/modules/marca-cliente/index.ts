/**
 * Módulo Marca-Cliente — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'marca-cliente' alimentado por su blueprint (marca-cliente.blueprint.json, sección `ui`).
 * Reflejo del patrón masa (F7): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="marca" en el panel = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import MarcaClientePanel from './MarcaClientePanel.svelte';

export const marcaClienteModule: UIModule = {
  manifest: {
    id: 'marca-cliente',
    name: 'Marca',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'marca-cliente-btn',
      icon: '🎯',
      label: 'Marca',
      action: { type: 'panel', panelId: 'marca-cliente-panel' },
      order: 15
    },
    panels: [{
      id: 'marca-cliente-panel',
      title: 'Marca y cliente',
      size: 'lg'
    }]
  },
  PanelComponent: MarcaClientePanel
};

export default marcaClienteModule;

export { default as MarcaClientePanel } from './MarcaClientePanel.svelte';
