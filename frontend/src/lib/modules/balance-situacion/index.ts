/**
 * Módulo Balance de situación — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'balance-situacion' alimentado por su blueprint (balance-situacion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import BalanceSituacionPanel from './BalanceSituacionPanel.svelte';

export const balanceSituacionModule: UIModule = {
  manifest: {
    id: 'balance-situacion',
    name: 'Balance de situación',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'balance-situacion-btn',
      icon: '📒',
      label: 'Balance',
      action: { type: 'panel', panelId: 'balance-situacion-panel' },
      order: 35
    },
    panels: [{
      id: 'balance-situacion-panel',
      title: 'Balance de situación',
      size: 'lg'
    }]
  },
  PanelComponent: BalanceSituacionPanel
};

export default balanceSituacionModule;

export { default as BalanceSituacionPanel } from './BalanceSituacionPanel.svelte';
