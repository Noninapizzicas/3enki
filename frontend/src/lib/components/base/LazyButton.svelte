<script lang="ts">
  /**
   * LazyButton - Botón que carga módulo bajo demanda
   *
   * Muestra ícono/label de la definición.
   * Al hacer click, carga y monta el módulo.
   */
  import { createEventDispatcher } from 'svelte';
  import {
    loadModule,
    mountModule,
    isModuleLoaded,
    isModuleMounted,
    moduleLoadState,
    openPanel
  } from '$lib/ui-core/lazy-registry';
  import type { LazyModuleDefinition } from '$lib/ui-core/lazy-registry';

  export let definition: LazyModuleDefinition;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let showLabel = false;
  export let active = false;

  const dispatch = createEventDispatcher();

  let loading = false;

  $: state = $moduleLoadState[definition.id];
  $: isLoaded = state?.loaded ?? false;
  $: isMounted = state?.mounted ?? false;
  $: hasError = state?.error ?? null;

  async function handleClick() {
    if (loading) return;

    loading = true;
    dispatch('loading', { id: definition.id });

    try {
      // Cargar y montar el módulo
      const success = await mountModule(definition.id);

      if (success) {
        dispatch('loaded', { id: definition.id });

        // Abrir panel si el módulo tiene uno
        const module = await loadModule(definition.id);
        if (module?.manifest.panels?.[0]) {
          openPanel(module.manifest.panels[0].id);
        }
      } else {
        dispatch('error', { id: definition.id, error: 'Failed to load' });
      }
    } catch (err) {
      dispatch('error', { id: definition.id, error: err });
    } finally {
      loading = false;
    }
  }

  // Preload on hover (opcional)
  function handleMouseEnter() {
    if (!isLoaded && !loading) {
      // Precargar sin montar
      loadModule(definition.id);
    }
  }
</script>

<button
  class="lazy-btn size-{size}"
  class:active
  class:loading
  class:loaded={isLoaded}
  class:mounted={isMounted}
  class:error={hasError}
  on:click={handleClick}
  on:mouseenter={handleMouseEnter}
  title={definition.label}
  disabled={loading}
>
  <span class="icon">
    {#if loading}
      <span class="spinner"></span>
    {:else}
      {definition.icon}
    {/if}
  </span>
  {#if showLabel}
    <span class="label">{definition.label}</span>
  {/if}
  {#if !isLoaded}
    <span class="lazy-indicator">•</span>
  {/if}
</button>

<style>
  .lazy-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
    color: var(--color-text-muted, #888);
  }

  .lazy-btn:hover {
    background: var(--color-bg-hover, rgba(255,255,255,0.05));
    color: var(--color-text, #e5e5e5);
  }

  .lazy-btn.active,
  .lazy-btn.mounted {
    color: var(--color-primary, #00ff88);
    background: var(--color-bg-active, rgba(0,255,136,0.1));
  }

  .lazy-btn.loading {
    cursor: wait;
    opacity: 0.7;
  }

  .lazy-btn.error {
    border-color: var(--color-error, #ff4444);
  }

  .lazy-btn:disabled {
    cursor: not-allowed;
  }

  /* Sizes */
  .size-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
  }

  .size-md {
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
  }

  .size-lg {
    padding: 0.75rem 1rem;
    font-size: 1.25rem;
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .label {
    font-size: 0.75rem;
    white-space: nowrap;
  }

  /* Indicador de no cargado */
  .lazy-indicator {
    position: absolute;
    top: 2px;
    right: 2px;
    font-size: 0.5rem;
    color: var(--color-text-muted, #666);
    opacity: 0.5;
  }

  .mounted .lazy-indicator {
    display: none;
  }

  /* Spinner */
  .spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
