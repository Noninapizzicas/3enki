/**
 * Modulo Menu Generator — panel del JEFE del IMPORTADOR de catálogos (F7 ciclo v2)
 *
 * La carpeta era ARC H IVADA (panel vivo de la página era menu-generate/).
 * Ciclo v2 la REVIVIÓ como hogar del importador determinista (MenuImportadorPanel).
 * El panel de generación por IA sigue siendo menu-generate/ (sin tocar).
 *
 * Este index exporta el UIModule (autodescubrimiento via manifest.json) y,
 * por compatibilidad legacy, re-exporta el generation store (menu-generate).
 */

import type { UIModule } from '$lib/ui-core';
import MenuImportadorPanel from './MenuImportadorPanel.svelte';

export const menuGeneratorModule: UIModule = {
  manifest: {
    id: 'menu-generator',
    name: 'Importar carta',
    version: '3.0.0',
    zone: 'work-bar',
    button: {
      id: 'menu-generator-btn',
      icon: '📥',
      label: 'Importar',
      action: { type: 'panel', panelId: 'menu-generator-panel' },
      order: 40
    },
    panels: [{
      id: 'menu-generator-panel',
      title: 'Importar carta',
      size: 'lg'
    }]
  },
  PanelComponent: MenuImportadorPanel
};

export default menuGeneratorModule;

export { default as MenuImportadorPanel } from './MenuImportadorPanel.svelte';

// Generación store (legacy — re-export por compatibilidad con menu-generate)
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
