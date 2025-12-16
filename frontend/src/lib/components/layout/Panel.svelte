<script lang="ts">
  /**
   * Panel - Contenedor avanzado para módulos
   *
   * Features:
   * - Múltiples posiciones: top, bottom, left, right, center
   * - Animaciones suaves con spring
   * - Drag para mover (solo en mode center)
   * - Resize para cambiar tamaño
   * - ESC y click fuera para cerrar
   */

  import { createEventDispatcher, onMount } from 'svelte';
  import { fly, fade, scale } from 'svelte/transition';
  import { spring } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { PANEL_SIZES } from '$lib/ui-core';

  export let title: string = '';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let open: boolean = false;
  export let position: 'top' | 'bottom' | 'left' | 'right' | 'center' = 'top';
  export let resizable: boolean = true;
  export let draggable: boolean = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  // Estado para drag
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  const panelPosition = spring({ x: 0, y: 0 }, { stiffness: 0.2, damping: 0.8 });

  // Estado para resize
  let isResizing = false;
  let currentHeight = 0;
  let currentWidth = 0;
  let panelEl: HTMLDivElement;

  // Tamaños base según size prop (convertir vh a pixeles)
  function vhToPixels(vh: number): number {
    return (vh / 100) * window.innerHeight;
  }

  $: baseHeightVh = parseInt(PANEL_SIZES[size]) || 33;
  $: baseWidth = position === 'left' || position === 'right' ? 320 : 0;

  onMount(() => {
    currentHeight = vhToPixels(baseHeightVh);
    currentWidth = baseWidth || 400;
  });

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

  // ========== DRAG ==========
  function startDrag(event: MouseEvent) {
    if (!draggable || position !== 'center') return;
    isDragging = true;
    dragOffset = {
      x: event.clientX - $panelPosition.x,
      y: event.clientY - $panelPosition.y
    };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', stopDrag);
  }

  function onDrag(event: MouseEvent) {
    if (!isDragging) return;
    panelPosition.set({
      x: event.clientX - dragOffset.x,
      y: event.clientY - dragOffset.y
    });
  }

  function stopDrag() {
    isDragging = false;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
  }

  // ========== RESIZE ==========
  function startResize(event: MouseEvent) {
    if (!resizable) return;
    event.preventDefault();
    event.stopPropagation();
    isResizing = true;
    window.addEventListener('mousemove', onResize);
    window.addEventListener('mouseup', stopResize);
  }

  function onResize(event: MouseEvent) {
    if (!isResizing || !panelEl) return;

    const rect = panelEl.getBoundingClientRect();

    if (position === 'top') {
      const newHeight = event.clientY - rect.top;
      currentHeight = Math.max(150, Math.min(newHeight, window.innerHeight * 0.8));
    } else if (position === 'bottom') {
      const newHeight = rect.bottom - event.clientY;
      currentHeight = Math.max(150, Math.min(newHeight, window.innerHeight * 0.8));
    } else if (position === 'left') {
      const newWidth = event.clientX - rect.left;
      currentWidth = Math.max(200, Math.min(newWidth, window.innerWidth * 0.6));
    } else if (position === 'right') {
      const newWidth = rect.right - event.clientX;
      currentWidth = Math.max(200, Math.min(newWidth, window.innerWidth * 0.6));
    } else if (position === 'center') {
      // Resize desde esquina inferior derecha
      currentWidth = Math.max(300, Math.min(event.clientX - rect.left, window.innerWidth * 0.8));
      currentHeight = Math.max(200, Math.min(event.clientY - rect.top, window.innerHeight * 0.8));
    }
  }

  function stopResize() {
    isResizing = false;
    window.removeEventListener('mousemove', onResize);
    window.removeEventListener('mouseup', stopResize);
  }

  // Transiciones según posición
  function getTransition(pos: string) {
    switch (pos) {
      case 'top': return { y: -50, duration: 250, easing: cubicOut };
      case 'bottom': return { y: 50, duration: 250, easing: cubicOut };
      case 'left': return { x: -50, duration: 250, easing: cubicOut };
      case 'right': return { x: 50, duration: 250, easing: cubicOut };
      default: return { duration: 200 };
    }
  }

  $: transition = getTransition(position);
  $: panelStyle = position === 'center'
    ? `transform: translate(${$panelPosition.x}px, ${$panelPosition.y}px); width: ${currentWidth}px; height: ${currentHeight}px;`
    : (position === 'left' || position === 'right')
      ? `width: ${currentWidth}px;`
      : `height: ${currentHeight}px;`;
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
    bind:this={panelEl}
    class="panel position-{position}"
    class:dragging={isDragging}
    class:resizing={isResizing}
    style={panelStyle}
    transition:fly={transition}
  >
    <header
      class="panel-header"
      class:draggable={draggable && position === 'center'}
      on:mousedown={startDrag}
      role={draggable ? 'button' : undefined}
      tabindex={draggable ? 0 : undefined}
    >
      <h3 class="panel-title">{title}</h3>
      <button class="close-btn" on:click={handleClose} title="Cerrar (ESC)">
        ✕
      </button>
    </header>

    <div class="panel-content">
      <slot />
    </div>

    {#if resizable}
      <div
        class="resize-handle resize-{position}"
        on:mousedown={startResize}
        role="separator"
        aria-orientation={position === 'left' || position === 'right' ? 'vertical' : 'horizontal'}
        tabindex="0"
      ></div>
    {/if}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 200;
  }

  /* ========== BASE PANEL ========== */
  .panel {
    position: fixed;
    background: var(--color-panel-bg, #1e1e1e);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    z-index: 250;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
  }

  .panel.dragging,
  .panel.resizing {
    user-select: none;
    transition: none !important;
  }

  /* ========== POSICIONES ========== */
  .position-top {
    top: 0;
    left: 0;
    right: 0;
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  .position-bottom {
    bottom: 0;
    left: 0;
    right: 0;
    border-bottom: none;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .position-left {
    top: 0;
    bottom: 0;
    left: 0;
    border-left: none;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .position-right {
    top: 0;
    bottom: 0;
    right: 0;
    border-right: none;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .position-center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 90vw;
    max-height: 90vh;
    border-radius: 0.75rem;
  }

  /* ========== HEADER ========== */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .panel-header.draggable {
    cursor: grab;
  }

  .panel-header.draggable:active {
    cursor: grabbing;
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

  /* ========== CONTENT ========== */
  .panel-content {
    flex: 1;
    min-height: 0; /* Required for nested flex children to size properly */
    overflow-y: auto;
    padding: 1rem;
  }

  /* ========== RESIZE HANDLES ========== */
  .resize-handle {
    position: absolute;
    background: transparent;
    z-index: 10;
    transition: background-color 0.15s;
  }

  .resize-handle:hover {
    background: var(--color-primary, #3b82f6);
  }

  .resize-top {
    bottom: 0;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
  }

  .resize-bottom {
    top: 0;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
  }

  .resize-left {
    top: 0;
    bottom: 0;
    right: 0;
    width: 6px;
    cursor: ew-resize;
  }

  .resize-right {
    top: 0;
    bottom: 0;
    left: 0;
    width: 6px;
    cursor: ew-resize;
  }

  .resize-center {
    bottom: 0;
    right: 0;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
    border-radius: 0 0 0.5rem 0;
  }

  .resize-center::after {
    content: '';
    position: absolute;
    bottom: 3px;
    right: 3px;
    width: 8px;
    height: 8px;
    border-right: 2px solid var(--color-text-muted, #666);
    border-bottom: 2px solid var(--color-text-muted, #666);
  }
</style>
