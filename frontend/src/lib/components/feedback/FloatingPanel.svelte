<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { scale } from 'svelte/transition';

  /**
   * FloatingPanel - Panel flotante centrado
   *
   * FILOSOFÍA (CONTEXT_UI.md):
   * - Padre controla TODO vía CSS variables
   * - SIEMPRE centrado
   * - SIN título (contenido define su propio header si necesita)
   * - Tap fuera = cerrar
   *
   * CSS VARIABLES (padre las define):
   * --panel-padding: padding interno (default: 1rem)
   * --panel-radius: border-radius (default: 12px)
   * --panel-bg: fondo (default: var(--color-bg-card))
   * --panel-shadow: sombra (default: 0 4px 24px rgba(0,0,0,0.2))
   * --panel-max-width: ancho máximo (default: 90vw)
   * --panel-max-height: alto máximo (default: 80vh)
   */

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  function handleClose() {
    open = false;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  function handleBackdropClick(e: MouseEvent | PointerEvent) {
    if (e.target === e.currentTarget) handleClose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="floating-panel__backdrop"
    on:click={handleBackdropClick}
    on:pointerup={handleBackdropClick}
  >
    <div
      class="floating-panel"
      transition:scale={{ duration: 150, start: 0.95 }}
      role="dialog"
      aria-modal="true"
    >
      <slot />
    </div>
  </div>
{/if}

<style>
  .floating-panel__backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 50);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.4);
  }

  .floating-panel {
    --_padding: var(--panel-padding, 0);
    --_radius: var(--panel-radius, 12px);
    --_bg: var(--panel-bg, var(--color-bg-card, #fff));
    --_shadow: var(--panel-shadow, 0 4px 24px rgba(0,0,0,0.2));
    --_max-width: var(--panel-max-width, 90vw);
    --_max-height: var(--panel-max-height, 80vh);
    --_border: var(--panel-border, 2px solid rgba(255,255,255,0.1));

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
