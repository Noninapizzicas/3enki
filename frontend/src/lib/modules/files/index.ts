/**
 * Files Module - Explorador de archivos
 *
 * Zona: chat-tools
 * Panel: files-browser
 *
 * Features:
 * - Navegación por directorios
 * - Adjuntar archivos al chat
 */

import type { UIModule, AppState } from '$lib/ui-core';
import FilesPanel from './FilesPanel.svelte';

export const filesModule: UIModule = {
  manifest: {
    id: 'files',
    name: 'Archivos',
    version: '1.0.0',
    zone: 'chat-tools',
    button: {
      id: 'files-btn',
      icon: '📂',
      dynamicIcon: false,
      label: 'Archivos',
      action: { type: 'panel', panelId: 'files-browser' },
      order: 1
    },
    panels: [
      {
        id: 'files-browser',
        title: 'Explorador de Archivos',
        size: 'lg'
      }
    ],
    mqtt: {
      publishes: ['file/list', 'file/read'],
      subscribes: ['file/list/response', 'file/read/response']
    }
  },

  PanelComponent: FilesPanel
};

export default filesModule;
