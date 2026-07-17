<script lang="ts">
  /**
   * ProviderPanel - Panel de selección de provider y modelo
   *
   * Features:
   * - Lista de providers disponibles
   * - Modelos por provider
   * - Integración con stores
   */

  import { PROVIDER_ICONS } from '$lib/ui-core';
  import { activeProvider, activeModel, selectProvider } from '$lib/stores';
  import { closePanel } from '$lib/stores/ui';
  import type { Provider } from '$lib/ui-core';

  export let panelId: string;

  // Espejo de ai-gateway/module.json providers (ORDEN = prioridad; el 1º es el default).
  // Fuente de verdad: modules/conversacion/ai-gateway/module.json config.providers
  const providers: Provider[] = [
    { id: 'deepseek-anthropic', name: 'DeepSeek', icon: '🔮', models: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
    { id: 'kimi', name: 'Kimi (Moonshot)', icon: '🌙', models: ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2-thinking', 'moonshot-v1-128k'] },
    { id: 'anthropic', name: 'Anthropic (API)', icon: '🧠', models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-3-5-haiku-20241022'] },
    { id: 'openai', name: 'OpenAI', icon: '🤖', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] },
    { id: 'groq', name: 'Groq', icon: '⚡', models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'] },
    { id: 'gemini', name: 'Google Gemini', icon: '💎', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
    { id: 'ollama', name: 'Ollama (Local)', icon: '🦙', models: ['llama2', 'codellama', 'mistral', 'mixtral'] },
    { id: 'claude-cli', name: 'Claude Code (1M)', icon: '🟣', models: ['sonnet', 'opus', 'haiku'] },
    // Hermes NO es un LLM crudo: es el AGENTE trabajador (NousResearch, local :8642) con su
    // arsenal (browser, código, subagentes) y memoria por proyecto. Enki le DELEGA. Último en la
    // lista (priority 90: nunca auto-fallback). Gobernado por el interruptor 'hermes-agente'.
    { id: 'hermes', name: 'Hermes (agente trabajador)', icon: '🪽', models: ['hermes-agent'] },
  ];

  let selectedProvider: Provider | null = $activeProvider || providers[0];
  let selectedModel: string | null = $activeModel || providers[0].models[0];

  function handleProviderSelect(provider: Provider) {
    selectedProvider = provider;
    selectedModel = provider.models[0];
  }

  function handleModelSelect(model: string) {
    selectedModel = model;
  }

  function handleConfirm() {
    if (selectedProvider && selectedModel) {
      selectProvider(selectedProvider, selectedModel);
      closePanel();
    }
  }
</script>

<div class="provider-panel">
  <div class="section">
    <h4>Provider</h4>
    <div class="provider-list">
      {#each providers as provider (provider.id)}
        <button
          class="provider-item"
          class:active={selectedProvider?.id === provider.id}
          on:click={() => handleProviderSelect(provider)}
        >
          <span class="icon">{provider.icon}</span>
          <span class="info">
            <span class="name">{provider.name}</span>
            <span class="meta">{provider.models.length} modelos</span>
          </span>
          {#if selectedProvider?.id === provider.id}
            <span class="check">✓</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  {#if selectedProvider}
    <div class="section">
      <h4>Modelo</h4>
      <div class="model-list">
        {#each selectedProvider.models as model (model)}
          <button
            class="model-item"
            class:active={selectedModel === model}
            on:click={() => handleModelSelect(model)}
          >
            {model}
            {#if selectedModel === model}
              <span class="check">✓</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="actions">
    <button
      class="confirm-btn"
      disabled={!selectedProvider || !selectedModel}
      on:click={handleConfirm}
    >
      Confirmar
    </button>
  </div>
</div>

<style>
  .provider-panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    height: 100%;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  h4 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted, #a3a3a3);
  }

  .provider-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .provider-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
    text-align: left;
  }

  .provider-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .provider-item.active {
    background: var(--color-active, rgba(59, 130, 246, 0.15));
    border-color: var(--color-primary, #3b82f6);
  }

  .icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .name {
    font-weight: 500;
  }

  .meta {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .check {
    color: var(--color-primary, #3b82f6);
    font-weight: bold;
  }

  .model-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .model-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 9999px;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
    font-size: 0.8125rem;
    font-family: ui-monospace, monospace;
  }

  .model-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .model-item.active {
    background: var(--color-primary, #3b82f6);
    border-color: var(--color-primary, #3b82f6);
    color: white;
  }

  .model-item .check {
    color: white;
    font-size: 0.75rem;
  }

  .actions {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .confirm-btn {
    width: 100%;
    padding: 0.625rem 1rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: background-color 0.15s;
  }

  .confirm-btn:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
