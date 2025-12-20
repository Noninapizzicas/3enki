/**
 * Files Module - Unified File Management
 *
 * Zona: chat-tools
 * Panel: files-browser
 *
 * Combines 3 backend modules:
 * - file-browser: Navigation, CRUD, search
 * - text-editor: Edit text files
 * - pdf-viewer: View PDFs
 *
 * Features:
 * - File explorer with navigation
 * - Text editor with syntax support
 * - PDF viewer
 * - Image viewer
 * - Search by name or content
 * - Create/delete files and folders
 */

import type { UIModule } from '$lib/ui-core';
import FilesPanel from './FilesPanel.svelte';

export const filesModule: UIModule = {
  manifest: {
    id: 'files',
    name: 'Archivos',
    version: '2.0.0',
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
      publishes: [
        // file-browser
        'ui/request/files/list',
        'ui/request/files/read',
        'ui/request/files/create',
        'ui/request/files/delete',
        'ui/request/files/search',
        // text-editor
        'ui/request/editor/open',
        'ui/request/editor/save',
        'ui/request/editor/validate',
        'ui/request/editor/format',
        // pdf-viewer
        'ui/request/pdf/view',
        'ui/request/pdf/metadata',
        'ui/request/pdf/list'
      ],
      subscribes: [
        'ui/response/+'
      ]
    }
  },

  PanelComponent: FilesPanel
};

export default filesModule;
