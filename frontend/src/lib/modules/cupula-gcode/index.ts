/**
 * Módulo Cúpula GCode — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'cupula-gcode' alimentado por su blueprint (cupula-gcode.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CupulaGcodePanel from './CupulaGcodePanel.svelte';

export const cupulaGcodeModule: UIModule = {
  manifest: {
    id: 'cupula-gcode',
    name: 'Cúpula GCode',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cupula-gcode-btn',
      icon: '📦',
      label: 'Cúpula',
      action: { type: 'panel', panelId: 'cupula-gcode-panel' },
      order: 23
    },
    panels: [{
      id: 'cupula-gcode-panel',
      title: 'Cúpula GCode',
      size: 'lg'
    }]
  },
  PanelComponent: CupulaGcodePanel
};

export default cupulaGcodeModule;

export { default as CupulaGcodePanel } from './CupulaGcodePanel.svelte';
