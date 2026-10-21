/**
 * Módulo Lotes — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'lotes' alimentado por su blueprint (lotes.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import LotesPanel from './LotesPanel.svelte';

export const lotesModule: UIModule = {
  manifest: {
    id: 'lotes',
    name: 'Lotes',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'lotes-btn',
      icon: '🧊',
      label: 'Lotes',
      action: { type: 'panel', panelId: 'lotes-panel' },
      order: 11
    },
    panels: [{
      id: 'lotes-panel',
      title: 'Lotes',
      size: 'lg'
    }]
  },
  PanelComponent: LotesPanel
};

export default lotesModule;

export { default as LotesPanel } from './LotesPanel.svelte';
