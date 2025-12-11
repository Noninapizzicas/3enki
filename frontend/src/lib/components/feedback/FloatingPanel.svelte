<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { browser } from '$app/environment';

  /**
   * FloatingPanel - Panel flotante en la parte superior de la PANTALLA
   *
   * USA PORTAL: Se renderiza en document.body para escapar de stacking contexts
   * (ej: backdrop-blur en ChatToolbar crea un stacking context que atrapa z-index)
   *
   * z-index: 9999 para estar encima de cualquier otro elemento.
   */

  export let open = false;
  export let title = '';

  const dispatch = createEventDispatcher<{ close: void }>();

  // Portal: contenedor que se moverá al body
  let portalContainer: HTMLDivElement | null = null;
  let mounted = false;

  function handleClose() {
    open = false;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) handleClose();
  }

  function handleBackdropClick(e: MouseEvent | PointerEvent) {
    if (e.target === e.currentTarget) handleClose();
  }

  // Portal: mover al body cuando se monte
  onMount(() => {
    mounted = true;
  });

  onDestroy(() => {
    // Cleanup: remover del body
    if (browser && portalContainer && portalContainer.parentNode === document.body) {
      document.body.removeChild(portalContainer);
    }
  });

  // Mover al body cuando el contenedor exista y estemos montados
  async function moveToBody(node: HTMLDivElement) {
    if (browser && mounted) {
      await tick();
      document.body.appendChild(node);
    }
  }

  $: if (browser && portalContainer && mounted) {
    if (portalContainer.parentNode !== document.body) {
      document.body.appendChild(portalContainer);
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Portal container - se mueve al body -->
<div bind:this={portalContainer} class="floating-panel-portal" use:moveToBody>
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="floating-panel__backdrop"
      on:click={handleBackdropClick}
      on:pointerup={handleBackdropClick}
    >
      <div
        class="floating-panel"
        transition:fly={{ duration: 200, y: -20 }}
        role="dialog"
        aria-modal="true"
      >
        {#if title}
          <div class="floating-panel__header">
            <h3 class="floating-panel__title">{title}</h3>
            <button
              type="button"
              class="floating-panel__close"
              on:click={handleClose}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        {/if}
        <slot />
      </div>
    </div>
  {/if}
</div>

<style>
  /* Portal container: no afecta layout cuando está en posición original */
  .floating-panel-portal {
    display: contents;
  }

  .floating-panel__backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1rem;
    padding-top: max(env(safe-area-inset-top, 0px), 1rem);
    background: rgba(0, 0, 0, 0.4);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .floating-panel {
    --_padding: var(--panel-padding, 0);
    --_radius: var(--panel-radius, 12px);
    --_bg: var(--panel-bg, var(--color-bg-card, #1a1a2e));
    --_shadow: var(--panel-shadow, 0 4px 24px rgba(0,0,0,0.3));
    --_max-width: var(--panel-max-width, 90vw);
    --_max-height: var(--panel-max-height, 70vh);
    --_border: var(--panel-border, 1px solid rgba(255,255,255,0.1));

    margin-top: 0.5rem;
    padding: var(--_padding);
    border-radius: var(--_radius);
    background: var(--_bg);
    box-shadow: var(--_shadow);
    border: var(--_border);
    max-width: var(--_max-width);
    max-height: var(--_max-height);
    overflow: auto;
  }

  .floating-panel__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .floating-panel__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .floating-panel__close {
    background: none;
    border: none;
    color: var(--color-text-muted, #9ca3af);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
  }

  .floating-panel__close:hover {
    color: var(--color-text, #ffffff);
  }
</style>
