/**
 * Módulo Estimación IS/IRPF — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'estimacion-is-irpf' alimentado por su blueprint (estimacion-is-irpf.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import EstimacionIsIrpfPanel from './EstimacionIsIrpfPanel.svelte';

export const estimacionIsIrpfModule: UIModule = {
  manifest: {
    id: 'estimacion-is-irpf',
    name: 'Estimación IS/IRPF',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'estimacion-is-irpf-btn',
      icon: '🧾',
      label: 'IS/IRPF',
      action: { type: 'panel', panelId: 'estimacion-is-irpf-panel' },
      order: 65
    },
    panels: [{
      id: 'estimacion-is-irpf-panel',
      title: 'Estimación IS/IRPF',
      size: 'lg'
    }]
  },
  PanelComponent: EstimacionIsIrpfPanel
};

export default estimacionIsIrpfModule;

export { default as EstimacionIsIrpfPanel } from './EstimacionIsIrpfPanel.svelte';
