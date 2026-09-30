/**
 * Módulo Partida no identificada — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'partida-no-identificada' alimentado por su blueprint (partida-no-identificada.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PartidaNoIdentificadaPanel from './PartidaNoIdentificadaPanel.svelte';

export const partidaNoIdentificadaModule: UIModule = {
  manifest: {
    id: 'partida-no-identificada',
    name: 'Partida no identificada',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'partida-no-identificada-btn',
      icon: '🔔',
      label: 'Partidas dudosas',
      action: { type: 'panel', panelId: 'partida-no-identificada-panel' },
      order: 242
    },
    panels: [{
      id: 'partida-no-identificada-panel',
      title: 'Partida no identificada',
      size: 'lg'
    }]
  },
  PanelComponent: PartidaNoIdentificadaPanel
};

export default partidaNoIdentificadaModule;

export { default as PartidaNoIdentificadaPanel } from './PartidaNoIdentificadaPanel.svelte';
