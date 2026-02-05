/**
 * Modulo Menu Generator — ARCHIVADO
 *
 * Reemplazado por 5 micro-módulos:
 *   menu-pdf2img, menu-prepare, menu-ocr, menu-generate, menu-cartas
 *
 * Este archivo solo mantiene re-exports del store por compatibilidad.
 * El panel monolítico (MenuGeneratorPanel.svelte) se conserva como referencia.
 */

// Re-export store functions (backward compat)
export {
  menuGeneratorStore,
  sortedCartas,
  selectedCarta,
  activeTab,
  menuHealth,
  menuLoading,
  menuGenerating,
  menuError,
  initMenuGeneratorSubscriptions,
  generateMenu,
  loadCartas,
  getCarta,
  loadHealth,
  setActiveTab,
  selectCarta,
  clearError,
  type Carta,
  type CartaResumen,
  type CartaEstado,
  type Producto,
  type Categoria,
  type Ingrediente,
  type MenuGeneratorState
} from '$lib/stores/menu-generator';
