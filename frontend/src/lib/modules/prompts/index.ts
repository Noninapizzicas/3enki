/**
 * Prompts Module - Sistema avanzado de gestión de prompts
 *
 * Zona: chat-config
 * Icono: 🧘
 *
 * Features:
 * - Composer: Armar prompt final desde slots
 * - Librería: Ver/buscar todos los prompts
 * - Editor: Crear/editar prompts
 * - Presets: Guardar/aplicar combinaciones
 * - Versionado automático
 * - Variables con templates {{var}}
 *
 * MQTT:
 * - Publica: prompt/list, prompt/get, prompt/create, prompt/update, prompt/delete
 * - Suscribe: prompt/state, preset/state
 */

import type { UIModule, AppState } from '$lib/ui-core';
import PromptsPanel from './PromptsPanel.svelte';

export const promptsModule: UIModule = {
  manifest: {
    id: 'prompts',
    name: 'Prompts',
    version: '2.0.0',
    zone: 'chat-config',
    button: {
      id: 'prompts-btn',
      icon: '🧘',
      dynamicIcon: true,
      label: 'Prompts',
      action: { type: 'panel', panelId: 'prompts' },
      order: 2
    },
    panels: [
      {
        id: 'prompts',
        title: 'Prompts',
        size: 'lg'
      }
    ],
    mqtt: {
      publishes: [
        'prompt/list',
        'prompt/get',
        'prompt/create',
        'prompt/update',
        'prompt/delete',
        'preset/list',
        'preset/create',
        'preset/apply',
        'preset/delete',
        'composer/render'
      ],
      subscribes: [
        'prompt.created',
        'prompt.updated',
        'prompt.deleted',
        'preset.created',
        'preset.deleted'
      ]
    }
  },

  getIcon(state: AppState): string {
    // Icono dinámico basado en si hay prompts en el composer
    if (state.prompts?.composerActive) {
      return '✨';
    }
    return '🧘';
  },

  getBadge(state: AppState): string | number | null {
    // Mostrar total de prompts
    const count = state.prompts?.total ?? 0;
    return count > 0 ? count : null;
  },

  PanelComponent: PromptsPanel
};

export default promptsModule;

// Export panel component
export { default as PromptsPanel } from './PromptsPanel.svelte';
