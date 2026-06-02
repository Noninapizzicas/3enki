/**
 * Módulo Tarifas
 *
 * Asignacion carta+canal del proyecto: carta general por defecto, override por
 * canal, variantes registradas. UI solo lectura (Postura B) — las mutaciones
 * (set_general, assign, register_variant, etc.) las dispara el chat via
 * prefillChatInput. Se integra en LazyShell con work-bar + chat + panel.
 *
 * Autodescubierto por el loader (import.meta.glob de manifest.json + index.ts);
 * no requiere registro manual en definitions.ts.
 *
 * Plan: arquitectura/decisiones/propuestas/cierre-ui-tarifas.json
 */

import type { UIModule } from '$lib/ui-core';
import TarifasPanel from './TarifasPanel.svelte';

export const tarifasModule: UIModule = {
  manifest: {
    id: 'tarifas',
    name: 'Tarifas',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'tarifas-btn',
      icon: '💰',
      label: 'Tarifas',
      action: { type: 'panel', panelId: 'tarifas-panel' },
      order: 5
    },
    panels: [{
      id: 'tarifas-panel',
      title: 'Tarifas',
      size: 'lg'
    }]
  },
  PanelComponent: TarifasPanel
};

export default tarifasModule;

// Re-export component for direct use
export { default as TarifasPanel } from './TarifasPanel.svelte';

// Re-export store (solo lectura) para conveniencia
export {
  tarifasConfig,
  cartasDisponibles,
  cartaGeneralResuelta,
  tarifasLoading,
  tarifasError,
  CANALES_CANONICOS,
  loadTarifasConfig,
  loadCartasDisponibles,
  initTarifasSubscriptions,
  type TarifasConfig,
  type CartaResumen,
  type TarifasVariante
} from '$lib/stores/tarifas';
