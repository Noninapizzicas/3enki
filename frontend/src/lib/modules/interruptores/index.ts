/**
 * Módulo Interruptores
 *
 * Panel central de on/off del sistema en la barra lateral (work-bar). Cada
 * feature del backend registra su botón (interruptor.registrar); este panel
 * los lista (interruptores.listar) y los enciende/apaga (interruptores.set),
 * que avisa al dueño en caliente vía interruptor.cambiado.
 */

import type { UIModule } from '$lib/ui-core';
import InterruptoresPanel from './InterruptoresPanel.svelte';

export const interruptoresModule: UIModule = {
  manifest: {
    id: 'interruptores',
    name: 'Interruptores',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'interruptores-btn',
      icon: '🎛️',
      label: 'Interruptores',
      action: { type: 'panel', panelId: 'interruptores-panel' },
      order: 99
    },
    panels: [{
      id: 'interruptores-panel',
      title: 'Interruptores',
      size: 'md'
    }]
  },
  PanelComponent: InterruptoresPanel
};

export default interruptoresModule;

export { default as InterruptoresPanel } from './InterruptoresPanel.svelte';
