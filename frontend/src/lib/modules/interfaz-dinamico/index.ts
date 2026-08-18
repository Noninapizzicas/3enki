/**
 * Módulo Interfaz-Dinámico — DOGFOOD del generador schema→UI (patrón Windmill aplicado a Enki).
 * Un único componente (BlueprintForm) renderiza las 4 zonas del panel del módulo 'interfaz'
 * alimentado por su blueprint (interfaz.blueprint.json, sección `ui`). Nada artesanal:
 * el trío de este módulo es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 */

import type { UIModule } from '$lib/ui-core';
import InterfazDinamicoPanel from './InterfazDinamicoPanel.svelte';

export const interfazDinamicoModule: UIModule = {
  manifest: {
    id: 'interfaz-dinamico',
    name: 'Radar (auto)',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'interfaz-dinamico-btn',
      icon: '🧬',
      label: 'Radar-auto',
      action: { type: 'panel', panelId: 'interfaz-dinamico-panel' },
      order: 8
    },
    panels: [{
      id: 'interfaz-dinamico-panel',
      title: 'Radar (auto)',
      size: 'lg'
    }]
  },
  PanelComponent: InterfazDinamicoPanel
};

export default interfazDinamicoModule;

export { default as InterfazDinamicoPanel } from './InterfazDinamicoPanel.svelte';
