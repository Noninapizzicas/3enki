import type { UIModule } from '$lib/ui-core';
import MotorPropuestaPanel from './MotorPropuestaPanel.svelte';

export const motor_propuestaModule: UIModule = {
  manifest: {
    id: 'motor_propuesta',
    name: 'MotorPropuesta',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'motor_propuesta-btn',
      icon: '🎯',
      label: 'MotorPropuesta',
      action: { type: 'panel', panelId: 'motor_propuesta-panel' },
      order: 51
    },
    panels: [{
      id: 'motor_propuesta-panel',
      title: 'MotorPropuesta',
      size: 'md'
    }]
  },
  PanelComponent: MotorPropuestaPanel
};

export default motor_propuestaModule;

export { default as MotorPropuestaPanel } from './MotorPropuestaPanel.svelte';
