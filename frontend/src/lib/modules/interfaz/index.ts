/**
 * Módulo Interfaz — superficie de dominio del dueño del radar de nichos.
 * Panel en la work-bar (barra superior): ver candidatos, examinar evidencia (M11),
 * sellar el veredicto (PASA/NO_PASA), añadir a mano y corregir fichas (M10).
 * Proyección pura — el estado vive en los custodios; aquí solo se traduce la voz del dueño.
 */

import type { UIModule } from '$lib/ui-core';
import InterfazPanel from './InterfazPanel.svelte';

export const interfazModule: UIModule = {
  manifest: {
    id: 'interfaz',
    name: 'Radar de nichos',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'interfaz-btn',
      icon: '📡',
      label: 'Radar',
      action: { type: 'panel', panelId: 'interfaz-panel' },
      order: 8
    },
    panels: [{
      id: 'interfaz-panel',
      title: 'Radar de nichos',
      size: 'lg'
    }]
  },
  PanelComponent: InterfazPanel
};

export default interfazModule;

export { default as InterfazPanel } from './InterfazPanel.svelte';
