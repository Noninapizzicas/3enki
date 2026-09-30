/**
 * Módulo Partidas conciliatorias — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'partida-conciliatoria' alimentado por su blueprint (partida-conciliatoria.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PartidaConciliatoriaPanel from './PartidaConciliatoriaPanel.svelte';

export const partidaConciliatoriaModule: UIModule = {
  manifest: {
    id: 'partida-conciliatoria',
    name: 'Partidas conciliatorias',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'partida-conciliatoria-btn',
      icon: '🏦',
      label: 'Partidas',
      action: { type: 'panel', panelId: 'partida-conciliatoria-panel' },
      order: 97
    },
    panels: [{
      id: 'partida-conciliatoria-panel',
      title: 'Partidas conciliatorias',
      size: 'lg'
    }]
  },
  PanelComponent: PartidaConciliatoriaPanel
};

export default partidaConciliatoriaModule;

export { default as PartidaConciliatoriaPanel } from './PartidaConciliatoriaPanel.svelte';
