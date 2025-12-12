<script lang="ts">
  import { eventBus } from '$ui-core';
  import { providers } from './index';

  export let panelId: string;
  export let currentProviderId: string = 'deepseek';
  export let currentModelId: string = 'deepseek-chat';

  $: currentProvider = providers.find(p => p.id === currentProviderId) || providers[0];
  $: availableModels = currentProvider.models;

  function selectProvider(providerId: string) {
    currentProviderId = providerId;
    const provider = providers.find(p => p.id === providerId)!;
    currentModelId = provider.models[0];

    eventBus.emit('provider.selected', {
      providerId,
      providerName: provider.name
    }, 'provider');
  }

  function selectModel(modelId: string) {
    currentModelId = modelId;

    eventBus.emit('model.selected', {
      modelId,
      providerId: currentProviderId
    }, 'provider');

    // Cerrar panel
    eventBus.emit('ui.panel.close', {});
  }
</script>

<div class="provider-panel">
  {#if panelId === 'provider-selector'}
    <div class="provider-list">
      {#each providers as provider}
        <button
          class="provider-item"
          class:active={provider.id === currentProviderId}
          on:click={() => selectProvider(provider.id)}
        >
          <span class="provider-icon">{provider.icon}</span>
          <span class="provider-name">{provider.name}</span>
          <span class="provider-models">{provider.models.length} modelos</span>
        </button>
      {/each}
    </div>

  {:else if panelId === 'model-selector'}
    <div class="model-header">
      <span class="provider-icon">{currentProvider.icon}</span>
      <span>{currentProvider.name}</span>
    </div>
    <div class="model-list">
      {#each availableModels as model}
        <button
          class="model-item"
          class:active={model === currentModelId}
          on:click={() => selectModel(model)}
        >
          <span class="model-name">{model}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .provider-panel {
    padding: 1rem;
  }

  .provider-list, .model-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .provider-item, .model-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid #333;
    border-radius: 8px;
    background: #1a1a1a;
    color: #fff;
    cursor: pointer;
    transition: all 0.15s;
  }

  .provider-item:hover, .model-item:hover {
    background: #2a2a2a;
    border-color: #444;
  }

  .provider-item.active, .model-item.active {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.1);
  }

  .provider-icon {
    font-size: 1.5rem;
  }

  .provider-name, .model-name {
    flex: 1;
    text-align: left;
  }

  .provider-models {
    font-size: 0.75rem;
    color: #888;
  }

  .model-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.75rem;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid #333;
    font-weight: 500;
  }
</style>
