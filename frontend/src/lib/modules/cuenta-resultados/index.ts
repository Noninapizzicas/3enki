/**
 * Módulo Cuenta de resultados — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'cuenta-resultados' alimentado por su blueprint (cuenta-resultados.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CuentaResultadosPanel from './CuentaResultadosPanel.svelte';

export const cuentaResultadosModule: UIModule = {
  manifest: {
    id: 'cuenta-resultados',
    name: 'Cuenta de resultados',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cuenta-resultados-btn',
      icon: '📒',
      label: 'Resultados',
      action: { type: 'panel', panelId: 'cuenta-resultados-panel' },
      order: 36
    },
    panels: [{
      id: 'cuenta-resultados-panel',
      title: 'Cuenta de resultados',
      size: 'lg'
    }]
  },
  PanelComponent: CuentaResultadosPanel
};

export default cuentaResultadosModule;

export { default as CuentaResultadosPanel } from './CuentaResultadosPanel.svelte';
