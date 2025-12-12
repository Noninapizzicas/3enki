/**
 * Project Module - Gestión de proyectos
 *
 * Zona: chat-config
 * Panel: project-selector
 *
 * Features:
 * - Icono dinámico (color del proyecto activo)
 * - Selección de proyecto
 */

import type { UIModule, AppState } from '$lib/ui-core';
import { PROJECT_COLORS } from '$lib/ui-core';
import ProjectPanel from './ProjectPanel.svelte';

function getProjectEmoji(colorId: string | null): string {
  if (!colorId) return '📁';
  const color = PROJECT_COLORS.find(c => c.id === colorId);
  return color?.emoji || '📁';
}

export const projectModule: UIModule = {
  manifest: {
    id: 'project',
    name: 'Proyecto',
    version: '1.0.0',
    zone: 'chat-config',
    button: {
      id: 'project-btn',
      icon: '📁',
      dynamicIcon: true,
      label: 'Proyecto',
      action: { type: 'panel', panelId: 'project-selector' },
      order: 1
    },
    panels: [
      {
        id: 'project-selector',
        title: 'Seleccionar Proyecto',
        size: 'md'
      }
    ],
    mqtt: {
      publishes: ['project/activate'],
      subscribes: ['project/activated', 'project/list']
    }
  },

  getIcon(state: AppState): string {
    return getProjectEmoji(state.project?.color || null);
  },

  PanelComponent: ProjectPanel
};

export default projectModule;
