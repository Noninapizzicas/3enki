/**
 * Módulo Puerto de evento de vertical — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'puerto-evento-vertical' alimentado por su blueprint (puerto-evento-vertical.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import PuertoEventoVerticalPanel from './PuertoEventoVerticalPanel.svelte';

export const puertoEventoVerticalModule: UIModule = {
  manifest: {
    id: 'puerto-evento-vertical',
    name: 'Puerto de evento de vertical',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'puerto-evento-vertical-btn',
      icon: '🛃',
      label: 'Puerto vertical',
      action: { type: 'panel', panelId: 'puerto-evento-vertical-panel' },
      order: 46
    },
    panels: [{
      id: 'puerto-evento-vertical-panel',
      title: 'Puerto de evento de vertical',
      size: 'lg'
    }]
  },
  PanelComponent: PuertoEventoVerticalPanel
};

export default puertoEventoVerticalModule;

export { default as PuertoEventoVerticalPanel } from './PuertoEventoVerticalPanel.svelte';
