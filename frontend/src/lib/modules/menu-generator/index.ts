/**
 * Modulo Menu Generator — ARCHIVADO
 *
 * Reemplazado por:
 *   menu-generate (panel de generación)
 *
 * Este archivo re-exporta stores actuales por si algún componente legacy lo importa.
 */

// Generation store
export {
  generationStore,
  generateFromText,
  generateFromFile,
  resetGeneration,
  initGenerationSubscriptions,
  generationStep,
  generationError,
  generationResult,
  isGenerating,
  type GenerationStep,
  type GenerationState,
  type GenerationResult
} from '$lib/stores/menu-generator';

// Carta manager store
export {
  cartaManagerStore,
  loadCartas,
  getCarta,
  selectCarta,
  clearError,
  initCartaManagerSubscriptions,
  sortedCartas,
  selectedCarta,
  cartaLoading,
  cartaError,
  cartaCount,
  type Carta,
  type CartaResumen,
  type Producto,
  type Categoria,
  type Ingrediente
} from '$lib/stores/carta-manager';
