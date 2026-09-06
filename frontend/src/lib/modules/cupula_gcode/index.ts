import type { UIModule } from '$lib/ui-core';
import CupulaGcodePanel from './CupulaGcodePanel.svelte';

export const cupula_gcodeModule: UIModule = {
  manifest: {
    id: 'cupula_gcode',
    name: 'CupulaGcode',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cupula_gcode-btn',
      icon: '📦',
      label: 'CupulaGcode',
      action: { type: 'panel', panelId: 'cupula_gcode-panel' },
      order: 50
    },
    panels: [{
      id: 'cupula_gcode-panel',
      title: 'CupulaGcode',
      size: 'lg'
    }]
  },
  PanelComponent: CupulaGcodePanel
};

export default cupula_gcodeModule;

export { default as CupulaGcodePanel } from './CupulaGcodePanel.svelte';
