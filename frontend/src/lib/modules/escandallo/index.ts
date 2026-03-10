/**
 * Módulo Escandallo
 *
 * Análisis de costes y escandallo de recetas.
 */

import type { UIModule } from '$lib/ui-core';
import EscandalloPanel from './EscandalloPanel.svelte';

export const escandalloModule: UIModule = {
  manifest: {
    id: 'escandallo',
    name: 'Escandallo',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'escandallo-btn',
      icon: '📊',
      label: 'Escandallo',
      action: { type: 'panel', panelId: 'escandallo-panel' },
      order: 2
    },
    panels: [{
      id: 'escandallo-panel',
      title: 'Escandallo',
      size: 'lg'
    }]
  },
  PanelComponent: EscandalloPanel
};

export default escandalloModule;

export { default as EscandalloPanel } from './EscandalloPanel.svelte';

export {
  escandalloStore,
  escandalloReceta,
  escandalloGlobal,
  escandalloLoading,
  escandalloError,
  initEscandalloSubscriptions,
  loadEscandalloReceta,
  loadEscandalloGlobal,
  setActiveView,
  clearError,
  type EscandalloReceta,
  type EscandalloGlobal,
  type EscandalloDesglose,
  type EscandalloState
} from '$lib/stores/escandallo';
