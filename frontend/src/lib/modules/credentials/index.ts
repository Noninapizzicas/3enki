/**
 * Credentials Module - Gestión de credenciales/API keys
 *
 * Arquitectura:
 * - 1 panel único con tabs [Lista | Nuevo | Config]
 * - Datos via MQTT (no REST /ui/state)
 * - 1 clic = 1 panel
 *
 * Zona: chat-config
 * Icono dinámico: ✅ (ok) | ⚠️ (falta) | 🔐 (base)
 *
 * MQTT:
 * - Publica: credential/state/request, credential/create, credential/update, credential/delete
 * - Suscribe: credential/state, credential.saved, credential.updated, credential.deleted
 */

import type { UIModule, AppState } from '$lib/ui-core';
import CredentialsPanel from './CredentialsPanel.svelte';

export const credentialsModule: UIModule = {
  manifest: {
    id: 'credentials',
    name: 'Credenciales',
    version: '3.0.0',
    zone: 'chat-config',
    button: {
      id: 'credentials-btn',
      icon: '🔐',
      dynamicIcon: true,
      label: 'Credenciales',
      action: { type: 'panel', panelId: 'credentials' },
      order: 4
    },
    panels: [
      {
        id: 'credentials',
        title: 'Credenciales',
        size: 'md'
      }
    ],
    mqtt: {
      publishes: [
        'credential/state/request',
        'credential/create',
        'credential/update',
        'credential/delete'
      ],
      subscribes: [
        'credential/state',
        'credential.saved',
        'credential.updated',
        'credential.deleted'
      ]
    }
  },

  getIcon(state: AppState): string {
    if (state.credentials?.valid && state.credentials?.total > 0) {
      return '✅';
    }
    if (state.credentials?.total > 0) {
      return '⚠️';
    }
    return '🔐';
  },

  getBadge(state: AppState): string | number | null {
    const count = state.credentials?.total ?? 0;
    return count > 0 ? count : null;
  },

  PanelComponent: CredentialsPanel
};

export default credentialsModule;

// Export panel component
export { default as CredentialsPanel } from './CredentialsPanel.svelte';
