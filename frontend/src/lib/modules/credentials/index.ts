/**
 * Credentials Module - Gestion completa de credenciales/API keys
 *
 * Zona: chat-config
 * Paneles:
 *   - credentials-list: Lista de credenciales (principal)
 *   - credentials-add: Agregar nueva credencial
 *   - credentials-edit: Editar credencial existente
 *
 * Features:
 * - CRUD completo de credenciales
 * - Soporte para niveles: GLOBAL, PROJECT, CLIENT, CUSTOM
 * - Test de API key antes de guardar
 * - Almacenamiento en .env del servidor
 */

import type { UIModule, AppState } from '$lib/ui-core';
import CredentialsPanelRouter from './CredentialsPanelRouter.svelte';

export const credentialsModule: UIModule = {
  manifest: {
    id: 'credentials',
    name: 'Credenciales',
    version: '2.0.0',
    zone: 'chat-config',
    button: {
      id: 'credentials-btn',
      icon: '🔐',
      dynamicIcon: true,
      label: 'Credenciales',
      action: { type: 'panel', panelId: 'credentials-list' },
      order: 4
    },
    panels: [
      {
        id: 'credentials-list',
        title: 'Credenciales',
        size: 'md'
      },
      {
        id: 'credentials-add',
        title: 'Nueva Credencial',
        size: 'md'
      },
      {
        id: 'credentials-edit',
        title: 'Editar Credencial',
        size: 'md'
      }
    ],
    mqtt: {
      publishes: ['credential/save', 'credential/update', 'credential/delete'],
      subscribes: ['credential/saved', 'credential/updated', 'credential/deleted']
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

  PanelComponent: CredentialsPanelRouter
};

export default credentialsModule;

// Re-export components for direct use if needed
export { default as CredentialsListPanel } from './CredentialsListPanel.svelte';
export { default as CredentialAddPanel } from './CredentialAddPanel.svelte';
export { default as CredentialEditPanel } from './CredentialEditPanel.svelte';
export { default as CredentialsPanelRouter } from './CredentialsPanelRouter.svelte';

// Keep old panel for backwards compatibility
export { default as CredentialsPanel } from './CredentialsPanel.svelte';
