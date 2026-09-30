/**
 * Módulo Previsión de caja — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'prevision-caja' alimentado por su blueprint (prevision-caja.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PrevisionCajaPanel from './PrevisionCajaPanel.svelte';

export const previsionCajaModule: UIModule = {
  manifest: {
    id: 'prevision-caja',
    name: 'Previsión de caja',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'prevision-caja-btn',
      icon: '🏦',
      label: 'Previsión',
      action: { type: 'panel', panelId: 'prevision-caja-panel' },
      order: 96
    },
    panels: [{
      id: 'prevision-caja-panel',
      title: 'Previsión de caja',
      size: 'lg'
    }]
  },
  PanelComponent: PrevisionCajaPanel
};

export default previsionCajaModule;

export { default as PrevisionCajaPanel } from './PrevisionCajaPanel.svelte';
