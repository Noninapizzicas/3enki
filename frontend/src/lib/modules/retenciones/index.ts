/**
 * Módulo Retenciones — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'retenciones' alimentado por su blueprint (retenciones.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import RetencionesPanel from './RetencionesPanel.svelte';

export const retencionesModule: UIModule = {
  manifest: {
    id: 'retenciones',
    name: 'Retenciones',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'retenciones-btn',
      icon: '🧾',
      label: 'Retenciones',
      action: { type: 'panel', panelId: 'retenciones-panel' },
      order: 64
    },
    panels: [{
      id: 'retenciones-panel',
      title: 'Retenciones',
      size: 'lg'
    }]
  },
  PanelComponent: RetencionesPanel
};

export default retencionesModule;

export { default as RetencionesPanel } from './RetencionesPanel.svelte';
