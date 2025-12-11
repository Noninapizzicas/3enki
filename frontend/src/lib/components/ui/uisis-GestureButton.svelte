<!--
  GestureButton.svelte
  ====================
  Componente base para botones con TRIPLE interacción.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Dispara evento 'select'
  - Doble tap/Doble click: Dispara evento 'add' (si enableAdd=true)
  - Long press / Click derecho: Dispara evento 'config'

  Este componente solo maneja gestos y eventos.
  Los paneles específicos se implementan en los componentes que lo usan.

  Skinnable via CSS Variables:
  --gesture-btn-bg, --gesture-btn-bg-hover, --gesture-btn-bg-active
  --gesture-btn-color, --gesture-btn-radius, --gesture-btn-border

  Uso:
    <GestureButton
      size="md"
      icon="🤖"
      label="AI"
      enableAdd={true}
      on:select={handleSelect}
      on:add={handleAdd}
      on:config={handleConfig}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón (sm: 44px, md: 56px, lg: 72px) */
  export let size: Size = 'md';

  /** Icono a mostrar */
  export let icon = '📦';

  /** Label debajo del icono */
  export let label = 'Button';

  /** Mostrar label debajo del icono */
  export let showLabel = true;

  /** Deshabilitar interacciones */
  export let disabled = false;

  /** Habilitar doble tap → Add (default true) */
  export let enableAdd = true;

  /** Aria label para accesibilidad */
  export let ariaLabel = 'Botón con gestos';

  /** Clase CSS adicional */
  let className = '';
  export { className as class };

  // ============================================================================
  // CONFIGURATION (siguiendo tokens.json)
  // ============================================================================

  const SIZES: Record<Size, { btn: number; icon: string; label: string }> = {
    sm: { btn: 44, icon: '1.125rem', label: '0.625rem' },
    md: { btn: 56, icon: '1.5rem', label: '0.6875rem' },
    lg: { btn: 72, icon: '2rem', label: '0.75rem' }
  };

  const TIMING = {
    tapDelay: 350,         // ms para distinguir tap de doble tap
    doubleTapMax: 400,     // ms máximo entre taps para doble tap
    longPressDuration: 500 // ms para activar long press
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let tapTimeout: ReturnType<typeof setTimeout> | null = null;
  let longPressTimeout: ReturnType<typeof setTimeout> | null = null;
  let tapCount = 0;
  let isLongPress = false;
  let isProcessing = false; // Evita acciones duplicadas

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: s = SIZES[size];

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    select: void;
    add: void;
    config: void;
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
    isProcessing = false;
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /** Tap/Click → Select */
  function doSelect(): void {
    if (isProcessing) return;
    isProcessing = true;
    dispatch('select');
    // Reset después de un breve delay para permitir nueva interacción
    setTimeout(() => { isProcessing = false; }, 100);
  }

  /** Doble tap/Doble click → Add (solo si enableAdd=true) */
  function doAdd(): void {
    if (!enableAdd || isProcessing) return;
    isProcessing = true;
    dispatch('add');
    setTimeout(() => { isProcessing = false; }, 100);
  }

  /** Long press/Click derecho → Config */
  function doConfig(): void {
    if (isProcessing) return;
    isProcessing = true;
    dispatch('config');
    setTimeout(() => { isProcessing = false; }, 100);
  }

  // ============================================================================
  // TOUCH HANDLERS (Mobile)
  // ============================================================================

  function handleTouchStart(e: TouchEvent): void {
    if (disabled || isProcessing) return;
    e.preventDefault();

    clearTimers();
    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      doConfig();
    }, TIMING.longPressDuration);
  }

  function handleTouchEnd(e: TouchEvent): void {
    if (disabled || isProcessing) return;
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
        if (tapCount === 1 && !isProcessing) {
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
    if (disabled || isProcessing || e.button !== 0) return;

    clearTimers();
    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      doConfig();
    }, TIMING.longPressDuration);
  }

  function handleMouseUp(e: MouseEvent): void {
    if (disabled || isProcessing || e.button !== 0) return;

    if (isLongPress) {
      isLongPress = false;
      return;
    }

    clearTimers();
    tapCount++;

    if (tapCount === 1) {
      tapTimeout = setTimeout(() => {
        if (tapCount === 1 && !isProcessing) {
          doSelect();
        }
        tapCount = 0;
      }, TIMING.tapDelay);
    } else if (tapCount >= 2) {
      clearTimers();
      tapCount = 0;
      doAdd();
    }
  }

  function handleMouseLeave(): void {
    clearTimeout(longPressTimeout!);
    longPressTimeout = null;
    isLongPress = false;
  }

  function handleContextMenu(e: MouseEvent): void {
    if (disabled || isProcessing) return;
    e.preventDefault();
    resetGestureState();
    doConfig();
  }

  /** Handler nativo para doble click (fallback más fiable) */
  function handleDblClick(e: MouseEvent): void {
    if (disabled || isProcessing) return;
    e.preventDefault();
    clearTimers();
    tapCount = 0; // Reset para evitar conflicto con manual tap counting
    doAdd();
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onDestroy(() => {
    resetGestureState();
  });
</script>

<button
  type="button"
  class="gesture-btn {className}"
  class:gesture-btn--disabled={disabled}
  style:--_size="{s.btn}px"
  style:--_icon-size={s.icon}
  style:--_label-size={s.label}
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchCancel}
  on:mousedown={handleMouseDown}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
  on:dblclick={handleDblClick}
  on:contextmenu={handleContextMenu}
  aria-label={ariaLabel}
  aria-disabled={disabled}
  title={enableAdd
    ? "Tap: seleccionar | Doble tap: añadir | Long press: config"
    : "Tap: seleccionar | Long press: config"}
>
  <span class="gesture-btn__icon">{icon}</span>
  {#if showLabel}
    <span class="gesture-btn__label">{label}</span>
  {/if}
</button>

<style>
  /*
   * CSS Variables - Skinnable desde el padre
   * =========================================
   * Permite personalizar colores desde el componente que usa GestureButton
   */
  .gesture-btn {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--gesture-btn-bg, hsl(220 15% 25% / 0.5));
    --_bg-hover: var(--gesture-btn-bg-hover, hsl(220 15% 30% / 0.6));
    --_bg-active: var(--gesture-btn-bg-active, hsl(220 15% 35% / 0.7));
    --_color: var(--gesture-btn-color, var(--color-text, #ffffff));
    --_color-muted: var(--gesture-btn-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--gesture-btn-border, transparent);
    --_border-focus: var(--gesture-btn-border-focus, var(--color-primary, #3b82f6));
    --_radius: var(--gesture-btn-radius, var(--radius-lg, 12px));
    --_shadow: var(--gesture-btn-shadow, none);
    --_transition: var(--gesture-btn-transition, var(--transition-fast, 150ms));

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
  .gesture-btn:hover:not(.gesture-btn--disabled) {
    background: var(--_bg-hover);
  }

  .gesture-btn:active:not(.gesture-btn--disabled) {
    background: var(--_bg-active);
    transform: scale(0.95);
  }

  .gesture-btn:focus-visible {
    outline: none;
    border-color: var(--_border-focus);
    box-shadow: 0 0 0 3px hsl(220 70% 50% / 0.3);
  }

  .gesture-btn--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* === ICON === */
  .gesture-btn__icon {
    font-size: var(--_icon-size);
    line-height: 1;
  }

  /* === LABEL === */
  .gesture-btn__label {
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
    .gesture-btn:active:not(.gesture-btn--disabled) {
      background: var(--_bg-active);
    }
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .gesture-btn {
      transition: none;
    }
  }
</style>
