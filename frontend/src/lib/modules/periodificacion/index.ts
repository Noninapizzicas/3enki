/**
 * Módulo Periodificación — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'periodificacion' alimentado por su blueprint (periodificacion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PeriodificacionPanel from './PeriodificacionPanel.svelte';

export const periodificacionModule: UIModule = {
  manifest: {
    id: 'periodificacion',
    name: 'Periodificación',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'periodificacion-btn',
      icon: '📒',
      label: 'Periodificar',
      action: { type: 'panel', panelId: 'periodificacion-panel' },
      order: 52
    },
    panels: [{
      id: 'periodificacion-panel',
      title: 'Periodificación',
      size: 'lg'
    }]
  },
  PanelComponent: PeriodificacionPanel
};

export default periodificacionModule;

export { default as PeriodificacionPanel } from './PeriodificacionPanel.svelte';
