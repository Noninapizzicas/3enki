<script lang="ts">
  /**
   * Panel - Contenedor deslizable para contenido de módulos
   *
   * Features:
   * - Aparece desde arriba
   * - Tamaños: sm (25vh), md (33vh), lg (50vh)
   * - Click fuera cierra
   * - Título y botón cerrar
   */

  import { createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { PANEL_SIZES } from '$lib/ui-core';

  export let title: string = '';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let open: boolean = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  function handleClose() {
    dispatch('close');
  }

  function handleBackdropClick() {
    dispatch('close');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      dispatch('close');
    }
  }

  $: panelHeight = PANEL_SIZES[size];
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div
    class="backdrop"
    on:click={handleBackdropClick}
    on:keydown={handleKeydown}
    role="button"
    tabindex="-1"
    transition:fade={{ duration: 150 }}
  ></div>

  <!-- Panel -->
  <div
    class="panel"
    style="--panel-height: {panelHeight}"
    transition:fly={{ y: -100, duration: 200 }}
  >
    <header class="panel-header">
      <h3 class="panel-title">{title}</h3>
      <button class="close-btn" on:click={handleClose} title="Cerrar">
        ✕
      </button>
    </header>

    <div class="panel-content">
      <slot />
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 40;
  }

  .panel {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--panel-height, 33vh);
    max-height: 80vh;
    background: var(--color-panel-bg, #1e1e1e);
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    z-index: 50;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .panel-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    color: var(--color-text, #e5e5e5);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-muted, #a3a3a3);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background-color 0.15s, color 0.15s;
  }

  .close-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
    color: var(--color-text, #e5e5e5);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }
</style>
