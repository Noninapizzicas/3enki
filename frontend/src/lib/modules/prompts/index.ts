/**
 * Prompts Module - Gestión de prompts/presets
 *
 * Zona: chat-config
 * Panel: prompts-selector
 *
 * Features:
 * - Selección de prompt del sistema
 * - Icono dinámico (✨ cuando hay prompt activo)
 * - Diferentes tipos de prompts por contexto
 */

import type { UIModule, AppState } from '$lib/ui-core';
import PromptsPanel from './PromptsPanel.svelte';

export const promptsModule: UIModule = {
  manifest: {
    id: 'prompts',
    name: 'Prompts',
    version: '1.0.0',
    zone: 'chat-config',
    button: {
      id: 'prompts-btn',
      icon: '📝',
      dynamicIcon: true,
      label: 'Prompts',
      action: { type: 'panel', panelId: 'prompts-selector' },
      order: 3
    },
    panels: [
      {
        id: 'prompts-selector',
        title: 'Seleccionar Prompt',
        size: 'md'
      }
    ],
    mqtt: {
      publishes: ['prompt/selected'],
      subscribes: ['prompt/list', 'prompt/state']
    }
  },

  getIcon(state: AppState): string {
    return state.prompt ? '✨' : '📝';
  },

  getBadge(state: AppState): string | null {
    // Mostrar nombre corto del prompt activo
    if (state.prompt) {
      const name = state.prompt.name;
      return name.length > 8 ? name.slice(0, 8) + '…' : name;
    }
    return null;
  },

  PanelComponent: PromptsPanel
};

export default promptsModule;
