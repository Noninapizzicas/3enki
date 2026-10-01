/**
 * Módulo Plan de amortización — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'plan-amortizacion' alimentado por su blueprint (plan-amortizacion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import PlanAmortizacionPanel from './PlanAmortizacionPanel.svelte';

export const PlanAmortizacionModule: UIModule = {
  manifest: {
    id: 'plan-amortizacion',
    name: 'Plan de amortización',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'plan-amortizacion-btn',
      icon: '📉',
      label: 'Amortización',
      action: { type: 'panel', panelId: 'plan-amortizacion-panel' },
      order: 100
    },
    panels: [{
      id: 'plan-amortizacion-panel',
      title: 'Plan de amortización',
      size: 'lg'
    }]
  },
  PanelComponent: PlanAmortizacionPanel
};

export default PlanAmortizacionModule;

export { default as PlanAmortizacionPanel } from './PlanAmortizacionPanel.svelte';
