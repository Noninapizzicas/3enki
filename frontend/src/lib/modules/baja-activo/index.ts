/**
 * Módulo Baja de activo — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'baja-activo' alimentado por su blueprint (baja-activo.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import BajaActivoPanel from './BajaActivoPanel.svelte';

export const bajaActivoModule: UIModule = {
  manifest: {
    id: 'baja-activo',
    name: 'Baja de activo',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'baja-activo-btn',
      icon: '🏗️',
      label: 'Baja activo',
      action: { type: 'panel', panelId: 'baja-activo-panel' },
      order: 103
    },
    panels: [{
      id: 'baja-activo-panel',
      title: 'Baja de activo',
      size: 'lg'
    }]
  },
  PanelComponent: BajaActivoPanel
};

export default bajaActivoModule;

export { default as BajaActivoPanel } from './BajaActivoPanel.svelte';
