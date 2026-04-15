/**
 * Módulo Escandallo v2.0.0
 *
 * Análisis de costes y escandallo de recetas.
 *
 * Components:
 * - EscandalloPanel: Main panel with all views
 * - EscandalloCard: Compact summary card for single escandallo
 * - EscandalloDetail: Full details view with breakdown and history
 * - EscandalloAlerts: Display price change alerts and anomalies
 * - EscandalloBrowser: Search/filter interface with rankings
 */

import type { UIModule } from '$lib/ui-core';
import EscandalloPanel from './EscandalloPanel.svelte';

export const escandalloModule: UIModule = {
  manifest: {
    id: 'escandallo',
    name: 'Escandallo',
    version: '2.0.0',
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

// Main panel component
export { default as EscandalloPanel } from './EscandalloPanel.svelte';

// Sub-components for modularity
export { default as EscandalloCard } from './EscandalloCard.svelte';
export { default as EscandalloDetail } from './EscandalloDetail.svelte';
export { default as EscandalloAlerts } from './EscandalloAlerts.svelte';
export { default as EscandalloBrowser } from './EscandalloBrowser.svelte';

// Store exports
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
