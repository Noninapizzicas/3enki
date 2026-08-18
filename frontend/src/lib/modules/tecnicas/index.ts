/**
 * Módulo Técnicas — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las 4 zonas del panel del módulo
 * 'tecnicas' alimentado por su blueprint (tecnicas.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import TecnicasPanel from './TecnicasPanel.svelte';

export const tecnicasModule: UIModule = {
  manifest: {
    id: 'tecnicas',
    name: 'Técnicas (auto)',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'tecnicas-btn',
      icon: '🍳',
      label: 'Técnicas',
      action: { type: 'panel', panelId: 'tecnicas-panel' },
      order: 9
    },
    panels: [{
      id: 'tecnicas-panel',
      title: 'Técnicas (auto)',
      size: 'lg'
    }]
  },
  PanelComponent: TecnicasPanel
};

export default tecnicasModule;

export { default as TecnicasPanel } from './TecnicasPanel.svelte';
