/**
 * Provider Module - Gestión de proveedores IA
 *
 * Zona: chat-config
 * Panel: provider-selector
 *
 * Features:
 * - Icono dinámico (icono del provider activo)
 * - Selección de provider y modelo
 */

import type { UIModule, AppState } from '$lib/ui-core';
import { PROVIDER_ICONS } from '$lib/ui-core';
import ProviderPanel from './ProviderPanel.svelte';

export const providerModule: UIModule = {
  manifest: {
    id: 'provider',
    name: 'Provider',
    version: '1.0.0',
    zone: 'chat-config',
    button: {
      id: 'provider-btn',
      icon: '🔌',
      dynamicIcon: true,
      label: 'Provider',
      action: { type: 'panel', panelId: 'provider-selector' },
      order: 2
    },
    panels: [
      {
        id: 'provider-selector',
        title: 'Seleccionar Provider y Modelo',
        size: 'md'
      }
    ],
    mqtt: {
      publishes: ['provider/selected'],
      subscribes: ['provider/state', 'credential/resolved']
    }
  },

  getIcon(state: AppState): string {
    if (state.provider) {
      return PROVIDER_ICONS[state.provider.id] || '🔌';
    }
    return '🔌';
  },

  getBadge(state: AppState): string | null {
    // Mostrar el nombre del modelo si hay uno seleccionado
    if (state.model) {
      // Acortar el nombre del modelo para el badge
      const short = state.model.split('-').slice(0, 2).join('-');
      return short.length > 10 ? short.slice(0, 10) : null;
    }
    return null;
  },

  PanelComponent: ProviderPanel
};

export default providerModule;
