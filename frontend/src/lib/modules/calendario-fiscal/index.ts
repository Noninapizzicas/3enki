/**
 * Módulo Calendario fiscal — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'calendario-fiscal' alimentado por su blueprint (calendario-fiscal.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CalendarioFiscalPanel from './CalendarioFiscalPanel.svelte';

export const calendarioFiscalModule: UIModule = {
  manifest: {
    id: 'calendario-fiscal',
    name: 'Calendario fiscal',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'calendario-fiscal-btn',
      icon: '🧾',
      label: 'Calendario',
      action: { type: 'panel', panelId: 'calendario-fiscal-panel' },
      order: 67
    },
    panels: [{
      id: 'calendario-fiscal-panel',
      title: 'Calendario fiscal',
      size: 'lg'
    }]
  },
  PanelComponent: CalendarioFiscalPanel
};

export default calendarioFiscalModule;

export { default as CalendarioFiscalPanel } from './CalendarioFiscalPanel.svelte';
