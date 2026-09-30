/**
 * Módulo Contrapartida asistida — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'contrapartida-asistida' alimentado por su blueprint (contrapartida-asistida.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ContrapartidaAsistidaPanel from './ContrapartidaAsistidaPanel.svelte';

export const contrapartidaAsistidaModule: UIModule = {
  manifest: {
    id: 'contrapartida-asistida',
    name: 'Contrapartida asistida',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'contrapartida-asistida-btn',
      icon: '⚙️',
      label: 'Contrapartida',
      action: { type: 'panel', panelId: 'contrapartida-asistida-panel' },
      order: 209
    },
    panels: [{
      id: 'contrapartida-asistida-panel',
      title: 'Contrapartida asistida',
      size: 'lg'
    }]
  },
  PanelComponent: ContrapartidaAsistidaPanel
};

export default contrapartidaAsistidaModule;

export { default as ContrapartidaAsistidaPanel } from './ContrapartidaAsistidaPanel.svelte';
