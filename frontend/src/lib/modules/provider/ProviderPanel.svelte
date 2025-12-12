<script lang="ts">
  /**
   * ProviderPanel - Panel para seleccionar proveedor y modelo
   *
   * Renderiza contenido diferente según panelId:
   * - provider-selector: Lista de proveedores
   * - model-selector: Lista de modelos del proveedor actual
   */

  import { writable } from 'svelte/store';
  import { publish } from '$ui-core';
  import { providers, PROVIDER_TOPICS, type Provider } from './index';

  // ===========================================================================
  // PROPS
  // ===========================================================================

  export let panelId: string;

  // ===========================================================================
  // ESTADO (store local compartido entre instancias)
  // ===========================================================================

  // Usamos un store para que el estado persista entre aperturas del panel
  const selectedProvider = writable<Provider>(providers[0]);
  const selectedModel = writable<string>(providers[0].models[0]);

  // Reactivos para el template
  $: currentProvider = $selectedProvider;
  $: currentModel = $selectedModel;
  $: availableModels = currentProvider.models;

  // ===========================================================================
  // ACCIONES
  // ===========================================================================

  function selectProvider(provider: Provider): void {
    selectedProvider.set(provider);
    selectedModel.set(provider.models[0]);

    publish(PROVIDER_TOPICS.SELECTED, {
      providerId: provider.id,
      providerName: provider.name
    });

    publish(PROVIDER_TOPICS.STATE, {
      providerId: provider.id,
      providerName: provider.name,
      modelId: provider.models[0]
    });
  }

  function selectModel(model: string): void {
    selectedModel.set(model);

    publish(PROVIDER_TOPICS.MODEL_SELECTED, {
      modelId: model,
      providerId: currentProvider.id,
      providerName: currentProvider.name
    });

    publish(PROVIDER_TOPICS.STATE, {
      providerId: currentProvider.id,
      providerName: currentProvider.name,
      modelId: model
    });

    // Cerrar panel después de seleccionar modelo
    publish('ui/panel/close', {});
  }
</script>

<div class="panel">
  {#if panelId === 'provider-selector'}
    <!-- SELECTOR DE PROVEEDOR -->
    <ul class="list" role="listbox" aria-label="Proveedores disponibles">
      {#each providers as provider (provider.id)}
        <li>
          <button
            class="list-item"
            class:active={provider.id === currentProvider.id}
            on:click={() => selectProvider(provider)}
            role="option"
            aria-selected={provider.id === currentProvider.id}
          >
            <span class="list-item__icon" aria-hidden="true">{provider.icon}</span>
            <span class="list-item__content">
              <span class="list-item__name">{provider.name}</span>
              <span class="list-item__meta">{provider.models.length} modelos</span>
            </span>
            {#if provider.id === currentProvider.id}
              <span class="list-item__check" aria-hidden="true">✓</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>

  {:else if panelId === 'model-selector'}
    <!-- SELECTOR DE MODELO -->
    <header class="header">
      <span class="header__icon" aria-hidden="true">{currentProvider.icon}</span>
      <span class="header__name">{currentProvider.name}</span>
    </header>

    <ul class="list" role="listbox" aria-label="Modelos disponibles">
      {#each availableModels as model (model)}
        <li>
          <button
            class="list-item"
            class:active={model === currentModel}
            on:click={() => selectModel(model)}
            role="option"
            aria-selected={model === currentModel}
          >
            <span class="list-item__name">{model}</span>
            {#if model === currentModel}
              <span class="list-item__check" aria-hidden="true">✓</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>

  {:else}
    <p class="error">Panel desconocido: {panelId}</p>
  {/if}
</div>

<style>
  .panel {
    padding: 0.75rem;
  }

  /* Header (para model selector) */
  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid var(--shell-border, #333);
  }

  .header__icon {
    font-size: 1.25rem;
  }

  .header__name {
    font-weight: 500;
  }

  /* Lista */
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Items */
  .list-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid var(--shell-btn-border, #333);
    border-radius: 8px;
    background: var(--shell-btn-bg, #1a1a1a);
    color: var(--shell-text, #fff);
    font-size: 0.9rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .list-item:hover {
    background: var(--shell-btn-hover, #2a2a2a);
    border-color: var(--shell-btn-border-hover, #444);
  }

  .list-item:focus-visible {
    outline: 2px solid var(--shell-focus, #3b82f6);
    outline-offset: 2px;
  }

  .list-item.active {
    border-color: var(--shell-primary, #3b82f6);
    background: rgba(59, 130, 246, 0.1);
  }

  .list-item__icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .list-item__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .list-item__name {
    font-weight: 500;
  }

  .list-item__meta {
    font-size: 0.75rem;
    color: var(--shell-text-secondary, #888);
  }

  .list-item__check {
    color: var(--shell-primary, #3b82f6);
    font-weight: bold;
  }

  /* Error */
  .error {
    padding: 1rem;
    color: var(--shell-badge, #ef4444);
    text-align: center;
  }
</style>
