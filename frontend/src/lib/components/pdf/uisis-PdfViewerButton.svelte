<!--
  PdfViewerButton.svelte
  ======================
  Botón unificado para visor de PDF con DOBLE interacción.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre el visor PDF con el archivo actual (si hay)
  - Long press / Click derecho: Abre PdfViewerConfigPanel (zoom, extraer)

  pdf-viewer usa enableAdd=false (PDFs son externos, no se crean).

  Skinnable via CSS Variables:
  --pdf-btn-bg, --pdf-btn-color

  Uso:
    <PdfViewerButton
      size="md"
      {file}
      {projectId}
      on:openViewer={handleOpenViewer}
      on:config={handleConfig}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import PdfViewerPanel from './uisis-PdfViewerPanel.svelte';
  import PdfViewerConfigPanel from './uisis-PdfViewerConfigPanel.svelte';
  import type { PdfFile } from './uisis-PdfViewerPanel.svelte';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón */
  export let size: Size = 'md';

  /** Archivo PDF actualmente abierto */
  export let file: PdfFile | null = null;

  /** Project ID */
  export let projectId: string | null = null;

  /** Mostrar label */
  export let showLabel = true;

  /** Deshabilitar */
  export let disabled = false;

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const SIZES: Record<Size, { btn: number; icon: string; label: string }> = {
    sm: { btn: 44, icon: '1.125rem', label: '0.625rem' },
    md: { btn: 56, icon: '1.5rem', label: '0.6875rem' },
    lg: { btn: 72, icon: '2rem', label: '0.75rem' }
  };

  const TIMING = {
    longPressDuration: 500
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let viewerOpen = false;
  let configOpen = false;
  let zoom = 100;

  let currentIcon = '📕';
  let currentLabel = 'PDF';

  let longPressTimeout: ReturnType<typeof setTimeout> | null = null;
  let isLongPress = false;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: s = SIZES[size];
  $: hasFile = file !== null;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    openViewer: { file: PdfFile | null };
    config: void;
    extractText: { text: string };
  }>();

  // ============================================================================
  // TIMER MANAGEMENT
  // ============================================================================

  function clearTimers(): void {
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
  }

  function resetGestureState(): void {
    clearTimers();
    isLongPress = false;
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /** Tap/Click → Abrir visor */
  function doOpenViewer(): void {
    viewerOpen = true;
    dispatch('openViewer', { file });
  }

  /** Long press/Click derecho → Config */
  function doConfig(): void {
    configOpen = true;
    dispatch('config');
  }

  // ============================================================================
  // TOUCH HANDLERS
  // ============================================================================

  function handleTouchStart(e: TouchEvent): void {
    if (disabled) return;

    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      doConfig();
    }, TIMING.longPressDuration);
  }

  function handleTouchEnd(e: TouchEvent): void {
    if (disabled) return;

    clearTimeout(longPressTimeout!);

    if (isLongPress) {
      isLongPress = false;
      return;
    }

    doOpenViewer();
  }

  function handleTouchCancel(): void {
    resetGestureState();
  }

  // ============================================================================
  // MOUSE HANDLERS
  // ============================================================================

  function handleMouseDown(e: MouseEvent): void {
    if (disabled || e.button !== 0) return;

    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      doConfig();
    }, TIMING.longPressDuration);
  }

  function handleMouseUp(e: MouseEvent): void {
    if (disabled || e.button !== 0) return;

    clearTimeout(longPressTimeout!);

    if (isLongPress) {
      isLongPress = false;
      return;
    }

    doOpenViewer();
  }

  function handleMouseLeave(): void {
    clearTimers();
  }

  function handleContextMenu(e: MouseEvent): void {
    if (disabled) return;
    e.preventDefault();
    doConfig();
  }

  // ============================================================================
  // PANEL HANDLERS
  // ============================================================================

  function handleZoomChange(e: CustomEvent<{ zoom: number }>): void {
    zoom = e.detail.zoom;
  }

  function handleExtractText(e: CustomEvent<{ text: string }>): void {
    dispatch('extractText', { text: e.detail.text });
  }

  // ============================================================================
  // PUBLIC METHOD
  // ============================================================================

  /** Open viewer with a specific file */
  export function openWithFile(fileToOpen: PdfFile): void {
    file = fileToOpen;
    viewerOpen = true;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onDestroy(() => {
    resetGestureState();
  });
</script>

<!-- Button -->
<button
  type="button"
  class="pdf-btn"
  class:pdf-btn--disabled={disabled}
  class:pdf-btn--active={hasFile}
  style:--_size="{s.btn}px"
  style:--_icon-size={s.icon}
  style:--_label-size={s.label}
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchCancel}
  on:mousedown={handleMouseDown}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
  on:contextmenu={handleContextMenu}
  aria-label="Visor de PDF"
  aria-disabled={disabled}
  title="Tap: abrir visor | Long press: configuración"
>
  <span class="pdf-btn__icon">{currentIcon}</span>
  {#if showLabel}
    <span class="pdf-btn__label">{currentLabel}</span>
  {/if}
  {#if hasFile}
    <span class="pdf-btn__indicator" />
  {/if}
</button>

<!-- Viewer Panel -->
<PdfViewerPanel
  bind:open={viewerOpen}
  {file}
  {projectId}
/>

<!-- Config Panel -->
<PdfViewerConfigPanel
  bind:open={configOpen}
  file={file ? { name: file.name, path: file.path, size: file.size } : null}
  {projectId}
  bind:zoom
  on:zoomChange={handleZoomChange}
  on:extractText={handleExtractText}
/>

<style>
  .pdf-btn {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--pdf-btn-bg, hsl(0 70% 50% / 0.15));
    --_bg-hover: var(--pdf-btn-bg-hover, hsl(0 70% 50% / 0.25));
    --_bg-active: var(--pdf-btn-bg-active, hsl(0 70% 50% / 0.35));
    --_color: var(--pdf-btn-color, var(--color-text, #ffffff));
    --_color-muted: var(--pdf-btn-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--pdf-btn-border, transparent);
    --_border-focus: var(--pdf-btn-border-focus, hsl(0 70% 50%));
    --_radius: var(--pdf-btn-radius, var(--radius-lg, 12px));
    --_transition: var(--pdf-btn-transition, var(--transition-fast, 150ms));

    /* === LAYOUT === */
    position: relative;
    width: var(--_size);
    height: var(--_size);
    min-width: var(--_size);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;

    /* === APPEARANCE === */
    background: var(--_bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);

    /* === INTERACTION === */
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;

    /* === ANIMATION === */
    transition:
      background var(--_transition) ease,
      transform var(--_transition) ease,
      border-color var(--_transition) ease;
  }

  /* === STATES === */
  .pdf-btn:hover:not(.pdf-btn--disabled) {
    background: var(--_bg-hover);
  }

  .pdf-btn:active:not(.pdf-btn--disabled) {
    background: var(--_bg-active);
    transform: scale(0.95);
  }

  .pdf-btn:focus-visible {
    outline: none;
    border-color: var(--_border-focus);
    box-shadow: 0 0 0 3px hsl(0 70% 50% / 0.3);
  }

  .pdf-btn--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pdf-btn--active {
    --_bg: hsl(0 70% 50% / 0.25);
    border-color: hsl(0 70% 50% / 0.3);
  }

  /* === ICON === */
  .pdf-btn__icon {
    font-size: var(--_icon-size);
    line-height: 1;
  }

  /* === LABEL === */
  .pdf-btn__label {
    font-size: var(--_label-size);
    font-weight: var(--font-weight-medium, 500);
    color: var(--_color-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(var(--_size) - 8px);
  }

  /* === FILE INDICATOR === */
  .pdf-btn__indicator {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    background: hsl(0 70% 50%);
    border-radius: 50%;
  }

  /* === TOUCH DEVICES === */
  @media (hover: none) {
    .pdf-btn:active:not(.pdf-btn--disabled) {
      background: var(--_bg-active);
    }
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .pdf-btn {
      transition: none;
    }
  }
</style>
