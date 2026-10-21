/**
 * Módulo Agenda-Operacion — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'agenda-operacion' alimentado por su blueprint (agenda-operacion.blueprint.json, sección `ui`).
 * Reflejo del patrón masa (F7): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="agenda" en el panel = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import AgendaOperacionPanel from './AgendaOperacionPanel.svelte';

export const agendaOperacionModule: UIModule = {
  manifest: {
    id: 'agenda-operacion',
    name: 'Agenda',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'agenda-operacion-btn',
      icon: '📅',
      label: 'Agenda',
      action: { type: 'panel', panelId: 'agenda-operacion-panel' },
      order: 16
    },
    panels: [{
      id: 'agenda-operacion-panel',
      title: 'Agenda de operación',
      size: 'lg'
    }]
  },
  PanelComponent: AgendaOperacionPanel
};

export default agendaOperacionModule;

export { default as AgendaOperacionPanel } from './AgendaOperacionPanel.svelte';
