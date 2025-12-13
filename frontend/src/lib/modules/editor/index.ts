/**
 * Editor Module - Editor de código
 *
 * Zona: chat-tools
 * Panel: code-editor
 *
 * Features:
 * - Editor de código básico
 * - Syntax highlighting (futuro con Monaco/CodeMirror)
 * - Adjuntar código al chat
 * - Selección de lenguaje
 */

import type { UIModule, AppState } from '$lib/ui-core';
import EditorPanel from './EditorPanel.svelte';

export const editorModule: UIModule = {
  manifest: {
    id: 'editor',
    name: 'Editor',
    version: '1.0.0',
    zone: 'chat-tools',
    button: {
      id: 'editor-btn',
      icon: '📄',
      dynamicIcon: false,
      label: 'Editor de código',
      action: { type: 'panel', panelId: 'code-editor' },
      order: 2
    },
    panels: [
      {
        id: 'code-editor',
        title: 'Editor de Código',
        size: 'lg',
        position: 'bottom'
      }
    ],
    mqtt: {
      publishes: ['editor/content', 'editor/attach'],
      subscribes: ['editor/load', 'editor/highlight']
    }
  },

  PanelComponent: EditorPanel
};

export default editorModule;
