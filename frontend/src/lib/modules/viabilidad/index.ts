/**
 * Módulo Viabilidad
 *
 * Estudio de viabilidad de negocio.
 */

import type { UIModule } from '$lib/ui-core';
import ViabilidadPanel from './ViabilidadPanel.svelte';

export const viabilidadModule: UIModule = {
  manifest: {
    id: 'viabilidad',
    name: 'Viabilidad',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'viabilidad-btn',
      icon: '💰',
      label: 'Viabilidad',
      action: { type: 'panel', panelId: 'viabilidad-panel' },
      order: 3
    },
    panels: [{
      id: 'viabilidad-panel',
      title: 'Viabilidad',
      size: 'lg'
    }]
  },
  PanelComponent: ViabilidadPanel
};

export default viabilidadModule;

export { default as ViabilidadPanel } from './ViabilidadPanel.svelte';

export {
  viabilidadStore,
  viabilidadEstudio,
  viabilidadProyeccion,
  viabilidadConfig,
  viabilidadLoading,
  viabilidadError,
  initViabilidadSubscriptions,
  loadEstudio,
  loadConfig,
  setActiveView,
  clearError,
  type Estudio,
  type Escenario,
  type Proyeccion,
  type NegocioConfig,
  type ViabilidadState
} from '$lib/stores/viabilidad';
