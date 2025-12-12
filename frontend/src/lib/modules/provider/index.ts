/**
 * Provider Module - Gestión de proveedores IA
 *
 * Permite seleccionar proveedor y modelo de IA.
 * Publica eventos MQTT cuando cambia la selección.
 */

import type { UIModule } from '$ui-core';
import ProviderPanel from './ProviderPanel.svelte';

// =============================================================================
// DATOS
// =============================================================================

export interface Provider {
  id: string;
  name: string;
  icon: string;
  models: string[];
}

export const providers: Provider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🔮',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner']
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo']
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🧠',
    models: ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101', 'claude-3-5-haiku-20241022']
  },
  {
    id: 'ollama',
    name: 'Ollama',
    icon: '🦙',
    models: ['llama3.2', 'mistral', 'codellama', 'phi3']
  }
];

// =============================================================================
// TOPICS MQTT
// =============================================================================

export const PROVIDER_TOPICS = {
  SELECTED: 'provider/selected',
  MODEL_SELECTED: 'provider/model/selected',
  REFRESH: 'provider/refresh',
  STATE: 'provider/state'
} as const;

// =============================================================================
// MÓDULO
// =============================================================================

export const providerModule: UIModule = {
  manifest: {
    id: 'provider',
    name: 'Provider Manager',
    version: '1.0.0',
    icon: '🔌',

    zones: {
      'chat-top': [
        {
          id: 'provider-btn',
          emoji: '🔌',
          label: 'Seleccionar proveedor',
          action: { type: 'panel', panelId: 'provider-selector' },
          order: 1
        },
        {
          id: 'model-btn',
          emoji: '🤖',
          label: 'Seleccionar modelo',
          action: { type: 'panel', panelId: 'model-selector' },
          order: 2
        }
      ]
    },

    panels: [
      { id: 'provider-selector', title: 'Seleccionar Proveedor', size: 'md' },
      { id: 'model-selector', title: 'Seleccionar Modelo', size: 'md' }
    ],

    mqtt: {
      publishes: [
        PROVIDER_TOPICS.SELECTED,
        PROVIDER_TOPICS.MODEL_SELECTED,
        PROVIDER_TOPICS.STATE
      ],
      subscribes: [
        PROVIDER_TOPICS.REFRESH,
        'credential/resolved'
      ]
    }
  },

  onMount(ctx) {
    console.log('[Provider] Module mounted');

    // Publicar estado inicial
    const defaultProvider = providers[0];
    ctx.publish(PROVIDER_TOPICS.STATE, {
      providerId: defaultProvider.id,
      providerName: defaultProvider.name,
      modelId: defaultProvider.models[0]
    });
  },

  onUnmount() {
    console.log('[Provider] Module unmounted');
  },

  onMessage: {
    [PROVIDER_TOPICS.REFRESH]: (_topic, _payload) => {
      console.log('[Provider] Refresh requested');
      // Aquí podríamos recargar proveedores desde el backend
    },

    'credential/resolved': (_topic, payload) => {
      console.log('[Provider] Credential resolved:', payload);
      // Aquí podríamos filtrar modelos según credenciales disponibles
    }
  },

  PanelComponent: ProviderPanel
};

export default providerModule;
