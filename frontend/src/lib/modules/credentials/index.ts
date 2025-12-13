/**
 * Credentials Module - Estado de credenciales/API keys
 *
 * Zona: chat-config
 * Panel: credentials-status
 *
 * Features:
 * - Ver estado de API keys por provider
 * - Icono dinámico (✓ válidas, ⚠️ inválidas)
 * - Badge con número de providers válidos
 */

import type { UIModule, AppState } from '$lib/ui-core';
import CredentialsPanel from './CredentialsPanel.svelte';

export const credentialsModule: UIModule = {
  manifest: {
    id: 'credentials',
    name: 'Credenciales',
    version: '1.0.0',
    zone: 'chat-config',
    button: {
      id: 'credentials-btn',
      icon: '🔐',
      dynamicIcon: true,
      label: 'Credenciales',
      action: { type: 'panel', panelId: 'credentials-status' },
      order: 4
    },
    panels: [
      {
        id: 'credentials-status',
        title: 'Estado de Credenciales',
        size: 'md'
      }
    ],
    mqtt: {
      publishes: ['credential/validate', 'credential/save'],
      subscribes: ['credential/resolved', 'credential/status']
    }
  },

  getIcon(state: AppState): string {
    if (state.credentials.valid && state.credentials.providers.length > 0) {
      return '✅';
    }
    if (state.credentials.providers.length > 0) {
      return '⚠️';
    }
    return '🔐';
  },

  getBadge(state: AppState): string | number | null {
    const count = state.credentials.providers.length;
    return count > 0 ? count : null;
  },

  PanelComponent: CredentialsPanel
};

export default credentialsModule;
