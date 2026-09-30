/**
 * Módulo Reglas de movimiento — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'regla-movimiento-bancario' alimentado por su blueprint (regla-movimiento-bancario.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ReglaMovimientoBancarioPanel from './ReglaMovimientoBancarioPanel.svelte';

export const reglaMovimientoBancarioModule: UIModule = {
  manifest: {
    id: 'regla-movimiento-bancario',
    name: 'Reglas de movimiento',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'regla-movimiento-bancario-btn',
      icon: '🏦',
      label: 'Reglas banco',
      action: { type: 'panel', panelId: 'regla-movimiento-bancario-panel' },
      order: 92
    },
    panels: [{
      id: 'regla-movimiento-bancario-panel',
      title: 'Reglas de movimiento',
      size: 'lg'
    }]
  },
  PanelComponent: ReglaMovimientoBancarioPanel
};

export default reglaMovimientoBancarioModule;

export { default as ReglaMovimientoBancarioPanel } from './ReglaMovimientoBancarioPanel.svelte';
