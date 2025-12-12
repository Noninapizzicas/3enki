/**
 * Provider Module - Gestión de proveedores IA
 *
 * Módulo UI que sigue el patrón modular:
 * - Manifest declarativo
 * - Eventos que emite/escucha
 * - Panel para selección
 */

import type { UIModule, UIEvent } from '$ui-core';
import ProviderPanel from './ProviderPanel.svelte';

// Datos del módulo
export const providers = [
  { id: 'deepseek', name: 'DeepSeek', icon: '🔮', models: ['deepseek-chat', 'deepseek-coder'] },
  { id: 'openai', name: 'OpenAI', icon: '🤖', models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic', icon: '🧠', models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'] },
  { id: 'ollama', name: 'Ollama', icon: '🦙', models: ['llama2', 'mistral', 'codellama'] }
];

let currentProvider = providers[0];
let currentModel = providers[0].models[0];

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
          label: 'Provider',
          badge: undefined,
          primary: {
            type: 'panel',
            panel: 'provider-selector',
            label: 'Seleccionar proveedor'
          },
          secondary: {
            type: 'emit',
            event: 'provider.refresh',
            label: 'Refrescar proveedores'
          },
          order: 1
        },
        {
          id: 'model-btn',
          emoji: '🤖',
          label: 'Model',
          badge: undefined,
          primary: {
            type: 'panel',
            panel: 'model-selector',
            label: 'Seleccionar modelo'
          },
          order: 2
        }
      ]
    },

    panels: [
      { id: 'provider-selector', title: 'Seleccionar Proveedor', size: 'md' },
      { id: 'model-selector', title: 'Seleccionar Modelo', size: 'md' }
    ],

    events: {
      emits: ['provider.selected', 'model.selected', 'provider.refresh'],
      listens: ['credential.selected']
    }
  },

  onMount(ctx) {
    console.log('[Provider] Module mounted');

    // Emitir estado inicial
    ctx.emit('provider.selected', { provider: currentProvider });
    ctx.emit('model.selected', { model: currentModel, provider: currentProvider.id });
  },

  onUnmount() {
    console.log('[Provider] Module unmounted');
  },

  onEvent: {
    'credential.selected': (event: UIEvent) => {
      console.log('[Provider] Credential selected:', event.data);
      // Aquí podríamos filtrar modelos según credencial
    }
  },

  onAction: {
    'selectProvider': (payload) => {
      const p = payload as { providerId: string };
      const provider = providers.find(pr => pr.id === p.providerId);
      if (provider) {
        currentProvider = provider;
        currentModel = provider.models[0];
      }
    },
    'selectModel': (payload) => {
      const m = payload as { modelId: string };
      currentModel = m.modelId;
    }
  },

  PanelComponent: ProviderPanel
};

export default providerModule;
