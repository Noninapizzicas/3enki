/**
 * Modulo Menu Generator
 *
 * Genera cartas estructuradas desde texto usando IA.
 * Responsabilidad unica: generar. No almacena ni gestiona.
 */

import type { UIModule } from '$lib/ui-core';
import MenuGeneratorPanel from './MenuGeneratorPanel.svelte';

export const menuGeneratorModule: UIModule = {
  manifest: {
    id: 'menu-generator',
    name: 'Menu Generator',
    version: '3.0.0',
    zone: 'work-bar',
    button: {
      id: 'menu-generator-btn',
      icon: '📋',
      dynamicIcon: false,
      label: 'Carta',
      action: { type: 'panel', panelId: 'menu-generator-panel' },
      order: 4
    },
    panels: [
      {
        id: 'menu-generator-panel',
        title: 'Generador de Cartas',
        size: 'lg'
      }
    ],
    mqtt: {
      publishes: [
        'ui/request/menu/generate',
        'ui/request/menu/list',
        'ui/request/menu/get',
        'ui/request/menu/health'
      ],
      subscribes: [
        'carta.generada',
        'menu.error',
        'ui/response/+'
      ]
    }
  },

  PanelComponent: MenuGeneratorPanel
};

export default menuGeneratorModule;

// Re-export store functions
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
