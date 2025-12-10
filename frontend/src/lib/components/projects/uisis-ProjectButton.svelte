<!--
  ProjectButton.svelte
  ====================
  Botón unificado para proyectos con TRIPLE interacción.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre SelectorPanel (elegir proyecto)
  - Doble tap/Doble click: Abre ProjectAddPanel (nuevo proyecto)
  - Long press / Click derecho: Abre ProjectConfigPanel (editar/eliminar)

  project-manager usa enableAdd=true (se pueden crear desde UI).

  Skinnable via CSS Variables (desde tokens.json):
  --proj-btn-bg, --proj-btn-bg-hover, --proj-btn-bg-active
  --proj-btn-color, --proj-btn-radius, --proj-btn-border

  Uso:
    <ProjectButton
      size="md"
      on:select={handleSelect}
      on:add={handleAdd}
      on:config={handleConfig}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import { SelectorPanel } from '$components/feedback';
  import ProjectAddPanel from './uisis-ProjectAddPanel.svelte';
  import ProjectConfigPanel from './uisis-ProjectConfigPanel.svelte';
  import type { Project } from './uisis-ProjectConfigPanel.svelte';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón (sm: 44px, md: 56px, lg: 72px) */
  export let size: Size = 'md';

  /** Mostrar label debajo del icono */
  export let showLabel = true;

  /** Deshabilitar interacciones */
  export let disabled = false;

  // ============================================================================
  // CONFIGURATION (siguiendo tokens.json)
  // ============================================================================

  const SIZES: Record<Size, { btn: number; icon: string; label: string }> = {
    sm: { btn: 44, icon: '1.125rem', label: '0.625rem' },
    md: { btn: 56, icon: '1.5rem', label: '0.6875rem' },
    lg: { btn: 72, icon: '2rem', label: '0.75rem' }
  };

  const TIMING = {
    tapDelay: 250,
    doubleTapMax: 300,
    longPressDuration: 500
  };

  // ============================================================================
  // STATE
  // ============================================================================

  // Panel states
  let selectorOpen = false;
  let addOpen = false;
  let configOpen = false;

  // Selected project for config panel
  let selectedProject: Project | null = null;

  // Display
  let currentIcon = '📁';
  let currentLabel = 'Projects';

  // Gesture state
  let tapTimeout: ReturnType<typeof setTimeout> | null = null;
  let longPressTimeout: ReturnType<typeof setTimeout> | null = null;
  let tapCount = 0;
  let isLongPress = false;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: s = SIZES[size];

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    select: { project: Project };
    add: void;
    config: { project: Project };
  }>();

  // ============================================================================
  // TIMER MANAGEMENT
  // ============================================================================

  function clearTimers(): void {
    if (tapTimeout) {
      clearTimeout(tapTimeout);
      tapTimeout = null;
    }
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
  }

  function resetGestureState(): void {
    clearTimers();
    tapCount = 0;
    isLongPress = false;
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /** Tap/Click → Panel Select (elegir proyecto) */
  function doSelect(): void {
    selectorOpen = true;
  }

  /** Doble tap/Doble click → Panel Add (nuevo proyecto) */
  function doAdd(): void {
    addOpen = true;
    dispatch('add');
  }

  /** Long press/Click derecho → Panel Config (editar proyecto) */
  function doConfig(): void {
    configOpen = true;
  }

  // ============================================================================
  // TOUCH HANDLERS (Mobile)
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

    tapCount++;

    if (tapCount === 1) {
      tapTimeout = setTimeout(() => {
        if (tapCount === 1) {
          doSelect();
        }
        tapCount = 0;
      }, TIMING.tapDelay);
    } else if (tapCount === 2) {
      clearTimeout(tapTimeout!);
      tapCount = 0;
      doAdd();
    }
  }

  function handleTouchCancel(): void {
    resetGestureState();
  }

  // ============================================================================
  // MOUSE HANDLERS (Desktop)
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

    if (e.detail === 2) {
      doAdd();
    } else if (e.detail === 1) {
      tapTimeout = setTimeout(() => {
        doSelect();
      }, TIMING.doubleTapMax);
    }
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

  function handleSelectorSelect(e: CustomEvent<{ item: Project }>): void {
    const project = e.detail.item;
    selectedProject = project;
    dispatch('select', { project });
    selectorOpen = false;
  }

  function handleAddSave(e: CustomEvent<{ project: Project }>): void {
    // Could auto-select the new project
    addOpen = false;
  }

  function handleConfigUpdate(e: CustomEvent<{ project: Project }>): void {
    configOpen = false;
  }

  function handleConfigActivate(e: CustomEvent<{ project: Project }>): void {
    configOpen = false;
  }

  function handleConfigDelete(e: CustomEvent<{ id: string }>): void {
    configOpen = false;
    selectedProject = null;
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
  class="proj-btn"
  class:proj-btn--disabled={disabled}
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
  aria-label="Gestión de proyectos"
  aria-disabled={disabled}
  title="Tap: seleccionar | Doble tap: nuevo | Long press: config"
>
  <span class="proj-btn__icon">{currentIcon}</span>
  {#if showLabel}
    <span class="proj-btn__label">{currentLabel}</span>
  {/if}
</button>

<!-- Panel Select (tap/click) -->
<SelectorPanel
  bind:open={selectorOpen}
  module="project-manager"
  on:select={handleSelectorSelect}
/>

<!-- Panel Add (doble tap/doble click) -->
<ProjectAddPanel
  bind:open={addOpen}
  on:save={handleAddSave}
/>

<!-- Panel Config (long press/click derecho) -->
<ProjectConfigPanel
  bind:open={configOpen}
  project={selectedProject}
  on:update={handleConfigUpdate}
  on:activate={handleConfigActivate}
  on:delete={handleConfigDelete}
/>

<style>
  /*
   * CSS Variables - Skinnable desde el padre
   * =========================================
   * Todos los valores por defecto referencian tokens.json
   */
  .proj-btn {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--proj-btn-bg, hsl(217 91% 60% / 0.15));
    --_bg-hover: var(--proj-btn-bg-hover, hsl(217 91% 60% / 0.25));
    --_bg-active: var(--proj-btn-bg-active, hsl(217 91% 60% / 0.35));
    --_color: var(--proj-btn-color, var(--color-text, #ffffff));
    --_color-muted: var(--proj-btn-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--proj-btn-border, transparent);
    --_border-focus: var(--proj-btn-border-focus, var(--color-primary, #3b82f6));
    --_radius: var(--proj-btn-radius, var(--radius-lg, 12px));
    --_shadow: var(--proj-btn-shadow, none);
    --_transition: var(--proj-btn-transition, var(--transition-fast, 150ms));

    /* === LAYOUT === */
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
    box-shadow: var(--_shadow);

    /* === INTERACTION === */
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;

    /* === ANIMATION === */
    transition:
      background var(--_transition) ease,
      transform var(--_transition) ease,
      border-color var(--_transition) ease,
      box-shadow var(--_transition) ease;
  }

  /* === STATES === */
  .proj-btn:hover:not(.proj-btn--disabled) {
    background: var(--_bg-hover);
  }

  .proj-btn:active:not(.proj-btn--disabled) {
    background: var(--_bg-active);
    transform: scale(0.95);
  }

  .proj-btn:focus-visible {
    outline: none;
    border-color: var(--_border-focus);
    box-shadow: 0 0 0 3px hsl(217 91% 60% / 0.3);
  }

  .proj-btn--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* === ICON === */
  .proj-btn__icon {
    font-size: var(--_icon-size);
    line-height: 1;
  }

  /* === LABEL === */
  .proj-btn__label {
    font-size: var(--_label-size);
    font-weight: var(--font-weight-medium, 500);
    color: var(--_color-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(var(--_size) - 8px);
  }

  /* === TOUCH DEVICES === */
  @media (hover: none) {
    .proj-btn:active:not(.proj-btn--disabled) {
      background: var(--_bg-active);
    }
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .proj-btn {
      transition: none;
    }
  }
</style>
