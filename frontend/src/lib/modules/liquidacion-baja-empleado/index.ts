/**
 * Módulo Liquidación de baja — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'liquidacion-baja-empleado' alimentado por su blueprint (liquidacion-baja-empleado.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import LiquidacionBajaEmpleadoPanel from './LiquidacionBajaEmpleadoPanel.svelte';

export const liquidacionBajaEmpleadoModule: UIModule = {
  manifest: {
    id: 'liquidacion-baja-empleado',
    name: 'Liquidación de baja',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'liquidacion-baja-empleado-btn',
      icon: '👤',
      label: 'Finiquito',
      action: { type: 'panel', panelId: 'liquidacion-baja-empleado-panel' },
      order: 126
    },
    panels: [{
      id: 'liquidacion-baja-empleado-panel',
      title: 'Liquidación de baja',
      size: 'lg'
    }]
  },
  PanelComponent: LiquidacionBajaEmpleadoPanel
};

export default liquidacionBajaEmpleadoModule;

export { default as LiquidacionBajaEmpleadoPanel } from './LiquidacionBajaEmpleadoPanel.svelte';
