/**
 * Módulo Regla de movimiento bancario — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'regla-movimiento-bancario' alimentado por su blueprint (regla-movimiento-bancario.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import ReglaMovimientoBancarioPanel from './ReglaMovimientoBancarioPanel.svelte';

export const reglaMovimientoBancarioModule: UIModule = {
  manifest: {
    id: 'regla-movimiento-bancario',
    name: 'Regla de movimiento bancario',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'regla-movimiento-bancario-btn',
      icon: '🔀',
      label: 'Regla movimiento',
      action: { type: 'panel', panelId: 'regla-movimiento-bancario-panel' },
      order: 53
    },
    panels: [{
      id: 'regla-movimiento-bancario-panel',
      title: 'Regla de movimiento bancario',
      size: 'lg'
    }]
  },
  PanelComponent: ReglaMovimientoBancarioPanel
};

export default reglaMovimientoBancarioModule;

export { default as ReglaMovimientoBancarioPanel } from './ReglaMovimientoBancarioPanel.svelte';
