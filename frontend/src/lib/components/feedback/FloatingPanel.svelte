<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import { browser } from '$app/environment';

  /**
   * FloatingPanel - Panel flotante en la parte superior de la PANTALLA
   *
   * FILOSOFÍA (CONTEXT_UI.md):
   * - Padre controla TODO vía CSS variables
   * - Posicionado en la parte SUPERIOR de la pantalla (viewport)
   * - SIN título (contenido define su propio header si necesita)
   * - Tap fuera = cerrar
   * - Scroll interno cuando el contenido excede max-height
   * - USA PORTAL: Se renderiza en document.body para evitar problemas con transform
   *
   * CSS VARIABLES (padre las define):
   * --panel-padding: padding interno (default: 0)
   * --panel-radius: border-radius (default: 12px)
   * --panel-bg: fondo (default: var(--color-bg-card))
   * --panel-shadow: sombra (default: 0 4px 24px rgba(0,0,0,0.2))
   * --panel-max-width: ancho máximo (default: 90vw)
   * --panel-max-height: alto máximo (default: 70vh)
   */

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  // Portal container
  let portalTarget: HTMLElement | null = null;
  let panelContainer: HTMLDivElement;

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

  // Portal: mover el contenido a document.body
  onMount(() => {
    if (browser) {
      portalTarget = document.body;
    }
  });

  onDestroy(() => {
    // Cleanup: remover del body si existe
    if (panelContainer && panelContainer.parentNode) {
      panelContainer.parentNode.removeChild(panelContainer);
    }
  });

  // Mover al portal cuando cambie open o portalTarget
  $: if (browser && portalTarget && panelContainer) {
    portalTarget.appendChild(panelContainer);
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Container que se moverá al body via portal -->
<div bind:this={panelContainer} class="floating-panel-portal">
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
        <slot />
      </div>
    </div>
  {/if}
</div>

<style>
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
</style>
