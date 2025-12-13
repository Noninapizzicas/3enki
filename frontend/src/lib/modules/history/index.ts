/**
 * History Module - Historial de conversaciones
 *
 * Zona: chat-config
 * Panel: history-list
 *
 * Features:
 * - Lista de conversaciones anteriores
 * - Cargar conversación
 * - Nueva conversación
 * - Badge con número de conversaciones
 */

import type { UIModule, AppState } from '$lib/ui-core';
import HistoryPanel from './HistoryPanel.svelte';

export const historyModule: UIModule = {
  manifest: {
    id: 'history',
    name: 'Historial',
    version: '1.0.0',
    zone: 'chat-config',
    button: {
      id: 'history-btn',
      icon: '💬',
      dynamicIcon: true,
      label: 'Historial',
      action: { type: 'panel', panelId: 'history-list' },
      order: 5
    },
    panels: [
      {
        id: 'history-list',
        title: 'Historial de Conversaciones',
        size: 'md'
      }
    ],
    mqtt: {
      publishes: ['conversation/load', 'conversation/delete'],
      subscribes: ['conversation/list', 'conversation/loaded']
    }
  },

  getIcon(state: AppState): string {
    return state.conversationCount > 0 ? '💬' : '🗨️';
  },

  getBadge(state: AppState): string | number | null {
    return state.conversationCount > 0 ? state.conversationCount : null;
  },

  PanelComponent: HistoryPanel
};

export default historyModule;
