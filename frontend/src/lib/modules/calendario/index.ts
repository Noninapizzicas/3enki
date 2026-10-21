/**
 * Módulo Calendario — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'calendario' alimentado por su blueprint (calendario.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CalendarioPanel from './CalendarioPanel.svelte';

export const calendarioModule: UIModule = {
  manifest: {
    id: 'calendario',
    name: 'Calendario',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'calendario-btn',
      icon: '📅',
      label: 'Calendario',
      action: { type: 'panel', panelId: 'calendario-panel' },
      order: 12
    },
    panels: [{
      id: 'calendario-panel',
      title: 'Calendario',
      size: 'lg'
    }]
  },
  PanelComponent: CalendarioPanel
};

export default calendarioModule;

export { default as CalendarioPanel } from './CalendarioPanel.svelte';
