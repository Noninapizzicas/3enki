<!--
  PromptButton.svelte
  ===================
  Botón unificado para prompts con TRIPLE interacción.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre SelectorPanel (elegir prompt)
  - Doble tap/Doble click: Abre PromptAddPanel (nuevo prompt)
  - Long press / Click derecho: Abre PromptConfigPanel (editar/eliminar)

  prompt-manager usa enableAdd=true (se pueden crear desde UI).

  Skinnable via CSS Variables (desde tokens.json):
  --prompt-btn-bg, --prompt-btn-bg-hover, --prompt-btn-bg-active
  --prompt-btn-color, --prompt-btn-radius, --prompt-btn-border

  Uso:
    <PromptButton
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
  import PromptAddPanel from './uisis-PromptAddPanel.svelte';
  import PromptConfigPanel from './uisis-PromptConfigPanel.svelte';
  import type { Prompt } from './uisis-PromptConfigPanel.svelte';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón (sm: 44px, md: 56px, lg: 72px) */
  export let size: Size = 'md';

  /** Proyecto actual (para filtrar prompts) */
  export let projectId: string | null = null;

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

  // Selected prompt for config panel
  let selectedPrompt: Prompt | null = null;

  // Display
  let currentIcon = '📝';
  let currentLabel = 'Prompts';

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
    select: { prompt: Prompt };
    add: void;
    config: { prompt: Prompt };
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

  /** Tap/Click → Panel Select (elegir prompt) */
  function doSelect(): void {
    selectorOpen = true;
  }

  /** Doble tap/Doble click → Panel Add (nuevo prompt) */
  function doAdd(): void {
    addOpen = true;
    dispatch('add');
  }

  /** Long press/Click derecho → Panel Config (editar prompt) */
  function doConfig(): void {
    configOpen = true;
  }

  // ============================================================================
  // TOUCH HANDLERS (Mobile)
  // ============================================================================

  function handleTouchStart(e: TouchEvent): void {
    if (disabled) return;
    e.preventDefault(); // Prevenir eventos mouse duplicados

    clearTimers();
    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      doConfig();
    }, TIMING.longPressDuration);
  }

  function handleTouchEnd(e: TouchEvent): void {
    if (disabled) return;
    e.preventDefault();

    clearTimeout(longPressTimeout!);
    longPressTimeout = null;

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
    } else if (tapCount >= 2) {
      clearTimeout(tapTimeout!);
      tapTimeout = null;
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

    clearTimers();
    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      doConfig();
    }, TIMING.longPressDuration);
  }

  function handleMouseUp(e: MouseEvent): void {
    if (disabled || e.button !== 0) return;

    clearTimeout(longPressTimeout!);
    longPressTimeout = null;

    if (isLongPress) {
      isLongPress = false;
      return;
    }

    // Usar e.detail para detectar doble click nativo
    if (e.detail >= 2) {
      clearTimeout(tapTimeout!);
      tapTimeout = null;
      doAdd();
    } else if (e.detail === 1) {
      // Esperar para ver si viene segundo click
      clearTimeout(tapTimeout!);
      tapTimeout = setTimeout(() => {
        doSelect();
      }, TIMING.doubleTapMax);
    }
  }

  function handleMouseLeave(): void {
    clearTimeout(longPressTimeout!);
    longPressTimeout = null;
    isLongPress = false;
  }

  function handleContextMenu(e: MouseEvent): void {
    if (disabled) return;
    e.preventDefault();
    resetGestureState();
    doConfig();
  }

  // ============================================================================
  // PANEL HANDLERS
  // ============================================================================

  function handleSelectorSelect(e: CustomEvent<{ item: Prompt }>): void {
    const prompt = e.detail.item;
    selectedPrompt = prompt;
    dispatch('select', { prompt });
    selectorOpen = false;
  }

  function handleAddSave(e: CustomEvent<{ prompt: Prompt }>): void {
    addOpen = false;
  }

  function handleConfigUpdate(e: CustomEvent<{ prompt: Prompt }>): void {
    configOpen = false;
  }

  function handleConfigDelete(e: CustomEvent<{ id: string }>): void {
    configOpen = false;
    selectedPrompt = null;
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
  class="prompt-btn"
  class:prompt-btn--disabled={disabled}
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
  aria-label="Gestión de prompts"
  aria-disabled={disabled}
  title="Tap: seleccionar | Doble tap: nuevo | Long press: config"
>
  <span class="prompt-btn__icon">{currentIcon}</span>
  {#if showLabel}
    <span class="prompt-btn__label">{currentLabel}</span>
  {/if}
</button>

<!-- Panel Select (tap/click) -->
<SelectorPanel
  bind:open={selectorOpen}
  module="prompt-manager"
  {projectId}
  on:select={handleSelectorSelect}
/>

<!-- Panel Add (doble tap/doble click) -->
<PromptAddPanel
  bind:open={addOpen}
  on:save={handleAddSave}
/>

<!-- Panel Config (long press/click derecho) -->
<PromptConfigPanel
  bind:open={configOpen}
  prompt={selectedPrompt}
  on:update={handleConfigUpdate}
  on:delete={handleConfigDelete}
/>

<style>
  .prompt-btn {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--prompt-btn-bg, hsl(45 93% 47% / 0.15));
    --_bg-hover: var(--prompt-btn-bg-hover, hsl(45 93% 47% / 0.25));
    --_bg-active: var(--prompt-btn-bg-active, hsl(45 93% 47% / 0.35));
    --_color: var(--prompt-btn-color, var(--color-text, #ffffff));
    --_color-muted: var(--prompt-btn-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--prompt-btn-border, transparent);
    --_border-focus: var(--prompt-btn-border-focus, var(--color-warning, #f59e0b));
    --_radius: var(--prompt-btn-radius, var(--radius-lg, 12px));
    --_shadow: var(--prompt-btn-shadow, none);
    --_transition: var(--prompt-btn-transition, var(--transition-fast, 150ms));

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
  .prompt-btn:hover:not(.prompt-btn--disabled) {
    background: var(--_bg-hover);
  }

  .prompt-btn:active:not(.prompt-btn--disabled) {
    background: var(--_bg-active);
    transform: scale(0.95);
  }

  .prompt-btn:focus-visible {
    outline: none;
    border-color: var(--_border-focus);
    box-shadow: 0 0 0 3px hsl(45 93% 47% / 0.3);
  }

  .prompt-btn--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* === ICON === */
  .prompt-btn__icon {
    font-size: var(--_icon-size);
    line-height: 1;
  }

  /* === LABEL === */
  .prompt-btn__label {
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
    .prompt-btn:active:not(.prompt-btn--disabled) {
      background: var(--_bg-active);
    }
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .prompt-btn {
      transition: none;
    }
  }
</style>
