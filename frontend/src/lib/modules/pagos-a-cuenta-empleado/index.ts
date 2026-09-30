/**
 * Módulo Pagos a cuenta — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'pagos-a-cuenta-empleado' alimentado por su blueprint (pagos-a-cuenta-empleado.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PagosACuentaEmpleadoPanel from './PagosACuentaEmpleadoPanel.svelte';

export const pagosACuentaEmpleadoModule: UIModule = {
  manifest: {
    id: 'pagos-a-cuenta-empleado',
    name: 'Pagos a cuenta',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'pagos-a-cuenta-empleado-btn',
      icon: '👤',
      label: 'Pagos a cuenta',
      action: { type: 'panel', panelId: 'pagos-a-cuenta-empleado-panel' },
      order: 124
    },
    panels: [{
      id: 'pagos-a-cuenta-empleado-panel',
      title: 'Pagos a cuenta',
      size: 'lg'
    }]
  },
  PanelComponent: PagosACuentaEmpleadoPanel
};

export default pagosACuentaEmpleadoModule;

export { default as PagosACuentaEmpleadoPanel } from './PagosACuentaEmpleadoPanel.svelte';
