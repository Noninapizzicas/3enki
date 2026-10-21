/**
 * Modulo Carta-manager — eje central del subsistema-carta.
 *
 * UI Postura B (solo lectura + pre-relleno del chat para mutaciones). Catalogo
 * de cartas con shape ABIERTO (multi-proyecto: pizzepos pizzas, vapers sabores,
 * futuros N modelos) + versionado + history. Se integra en LazyShell con
 * work-bar + chat + panel flotante.
 *
 * Plan: arquitectura/decisiones/propuestas/cierre-ui-carta-manager.json (v1.3.0)
 */

import type { UIModule } from '$lib/ui-core';
import CartaManagerPanel from './CartaManagerPanel.svelte';

export const cartaManagerModule: UIModule = {
  manifest: {
    id: 'carta-manager',
    name: 'Cartas',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-manager-btn',
      icon: '🃏',
      label: 'Cartas',
      action: { type: 'panel', panelId: 'carta-manager-panel' },
      order: 4
    },
    panels: [{
      id: 'carta-manager-panel',
      title: 'Cartas',
      size: 'lg'
    }]
  },
  PanelComponent: CartaManagerPanel
};

export default cartaManagerModule;

// Re-export component for direct use
export { default as CartaManagerPanel } from './CartaManagerPanel.svelte';

// Re-export store (solo lectura)
export {
  cartasStore,
  cartaSeleccionada,
  cartasLoading,
  cartasError,
  cartasStats,
  sortedCartas,
  loadCartas,
  getCarta,
  loadHistorial,
  loadVersionSnapshot,
  initCartaManagerSubscriptions,
  type Carta,
  type CartaResumen,
  type CartaVersionResumen
} from '$lib/stores/carta-manager';
