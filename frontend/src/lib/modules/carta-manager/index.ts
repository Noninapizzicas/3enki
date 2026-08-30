/**
 * Modulo Carta-manager — eje central del subsistema-carta.
 *
 * DOS paneles:
 *   - CartaManagerPanel (Postura B, solo lectura + pre-relleno del chat para
 *     mutaciones): catalogo con shape ABIERTO (multi-proyecto: pizzepos pizzas,
 *     vapers sabores, futuros N modelos) + versionado + history. Se integra en
 *     LazyShell con work-bar + chat + panel flotante.
 *   - CartaManagerJefePanel (F7, panel JEFE): cinta de estados + ref-select +
 *     transiciones nombradas (activar/clonar/archivar/restaurar) + ALTA DE
 *     PRODUCTO + FREÑO validar antes de activar. Canal RPC directo al custodio
 *     por core/{ASTERISCO}/events (ver stores/carta-jefe.ts).
 *
 * Plan: arquitectura/decisiones/propuestas/cierre-ui-carta-manager.json (v1.3.0)
 */

import type { UIModule } from '$lib/ui-core';
import CartaManagerPanel from './CartaManagerPanel.svelte';
import CartaManagerJefePanel from './CartaManagerJefePanel.svelte';

export const cartaManagerModule: UIModule = {
  manifest: {
    id: 'carta-manager',
    name: 'Cartas',
    version: '1.1.0',
    zone: 'work-bar',
    button: {
      id: 'carta-manager-btn',
      icon: '🃏',
      label: 'Cartas',
      action: { type: 'panel', panelId: 'carta-manager-panel' },
      order: 4
    },
    panels: [
      {
        id: 'carta-manager-panel',
        title: 'Cartas',
        size: 'lg'
      },
      {
        id: 'carta-manager-jefe-panel',
        title: 'Cartas · Jefe',
        size: 'lg'
      }
    ]
  },
  PanelComponent: CartaManagerPanel
};

export default cartaManagerModule;

// Re-export components for direct use
export { default as CartaManagerPanel } from './CartaManagerPanel.svelte';
export { default as CartaManagerJefePanel } from './CartaManagerJefePanel.svelte';

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

// Re-export store JEFE (F7: RPC core/*/events + alta de producto + freño validar)
export {
  cinta as cintaJefe,
  sortedCartas as cartasJefe,
  cartaSeleccionada as cartaJefeSeleccionada,
  dictamen as dictamenValidacion,
  versiones as versionesCartaJefe,
  errorMutacion as errorMutacionCartaJefe,
  listarCartas,
  obtenerCarta,
  pedirVersiones,
  validarCarta,
  activarCarta,
  clonarCarta,
  archivarCarta,
  restaurarVersion,
  añadirProducto,
  editarProducto,
  guardarCarta,
  formatearEuros as formatearEurosCartaJefe,
  parsearEuros as parsearEurosCartaJefe,
  describeError as describeErrorCartaJefe,
  initCartaJefeSubscriptions,
  resetCartasJefe,
  type CartaJefe,
  type DictamenValidacion,
  type CartaVersionResumen as CartaVersionResumenJefe
} from './stores/carta-jefe';