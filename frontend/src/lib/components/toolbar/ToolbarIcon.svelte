<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';

  /**
   * ToolbarIcon - Icono con triple interacción
   *
   * FILOSOFÍA (CONTEXT_UI.md):
   * - Padre controla TODO (tamaño vía CSS variables)
   * - CERO hardcodeo
   * - Poco texto, tamaño reducido
   *
   * INTERACCIÓN:
   * - 1 toque: Acción primaria (ver/seleccionar)
   * - 2 toques: Acción secundaria (crear/añadir)
   * - Long-press: Acción terciaria (gestionar/config)
   *
   * CSS VARIABLES (padre las define):
   * --icon-size: tamaño del botón (default: 36px)
   * --icon-font-size: tamaño del emoji (default: 1rem)
   * --icon-radius: border-radius (default: 8px)
   * --icon-bg: fondo (default: transparent)
   * --icon-bg-hover: fondo hover (default: var(--color-bg-hover))
   * --icon-bg-active: fondo activo (default: var(--color-primary))
   */

  // Props básicos
  export let id: string;
  export let icon: string;
  export let label: string = '';

  // Props visuales (padre controla vía CSS vars, estos son fallbacks)
  export let badge: string | number | undefined = undefined;
  export let badgeColor: 'primary' | 'success' | 'warning' | 'danger' | 'info' = 'danger';
  export let displayValue: string = '';
  export let variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' = 'default';
  export let active: boolean = false;
  export let disabled: boolean = false;

  // Props de comportamiento
  export let longPressDuration: number = 500;
  export let doubleTapDelay: number = 250;

  const dispatch = createEventDispatcher<{
    tap: { id: string };
    doubleTap: { id: string };
    longPress: { id: string };
  }>();

  // Estado
  let tapCount = 0;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressProgress = 0;
  let longPressInterval: ReturnType<typeof setInterval> | null = null;
  let isLongPressing = false;

  onDestroy(() => clearAllTimers());

  function clearAllTimers() {
    if (tapTimer) clearTimeout(tapTimer);
    if (longPressTimer) clearTimeout(longPressTimer);
    if (longPressInterval) clearInterval(longPressInterval);
    tapTimer = null;
    longPressTimer = null;
    longPressInterval = null;
  }

  function vibrate(pattern: number | number[] = 10) {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }

  function startPress() {
    if (disabled) return;

    vibrate(5);
    const startTime = Date.now();
    longPressProgress = 0;
    isLongPressing = false;

    longPressInterval = setInterval(() => {
      longPressProgress = Math.min(100, ((Date.now() - startTime) / longPressDuration) * 100);
    }, 16);

    longPressTimer = setTimeout(() => {
      isLongPressing = true;
      clearAllTimers();
      longPressProgress = 0;
      vibrate([10, 30, 10]);
      dispatch('longPress', { id });
    }, longPressDuration);
  }

  function endPress() {
    if (disabled) return;

    if (isLongPressing) {
      isLongPressing = false;
      return;
    }

    clearAllTimers();
    longPressProgress = 0;
    tapCount++;

    if (tapCount === 1) {
      tapTimer = setTimeout(() => {
        vibrate(5);
        dispatch('tap', { id });
        tapCount = 0;
      }, doubleTapDelay);
    } else if (tapCount >= 2) {
      if (tapTimer) clearTimeout(tapTimer);
      tapTimer = null;
      vibrate([5, 20, 5]);
      dispatch('doubleTap', { id });
      tapCount = 0;
    }
  }

  function cancelPress() {
    clearAllTimers();
    tapCount = 0;
    longPressProgress = 0;
    isLongPressing = false;
  }

  // Pointer events (desktop + mobile)
  function handlePointerDown(e: PointerEvent) {
    // Solo para mouse, touch usa sus propios eventos
    if (e.pointerType === 'touch') return;
    startPress();
  }

  function handlePointerUp(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    endPress();
  }

  function handlePointerCancel() {
    cancelPress();
  }

  // Touch events (móvil - más fiables)
  function handleTouchStart(e: TouchEvent) {
    e.preventDefault(); // Evita scroll y zoom
    startPress();
  }

  function handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
    endPress();
  }

  function handleTouchCancel() {
    cancelPress();
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (!disabled) {
      vibrate([10, 30, 10]);
      dispatch('longPress', { id });
    }
  }
</script>

<button
  type="button"
  class="toolbar-icon"
  class:toolbar-icon--active={active}
  class:toolbar-icon--disabled={disabled}
  class:toolbar-icon--primary={variant === 'primary'}
  class:toolbar-icon--success={variant === 'success'}
  class:toolbar-icon--warning={variant === 'warning'}
  class:toolbar-icon--danger={variant === 'danger'}
  {disabled}
  aria-label={label || icon}
  aria-disabled={disabled}
  on:pointerdown={handlePointerDown}
  on:pointerup={handlePointerUp}
  on:pointercancel={handlePointerCancel}
  on:pointerleave={handlePointerCancel}
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchCancel}
  on:contextmenu={handleContextMenu}
>
  <!-- Progress ring (long-press) -->
  {#if longPressProgress > 0}
    <svg class="toolbar-icon__progress" viewBox="0 0 36 36">
      <circle
        cx="18" cy="18" r="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray="100"
        stroke-dashoffset={100 - longPressProgress}
        transform="rotate(-90 18 18)"
      />
    </svg>
  {/if}

  <!-- Emoji -->
  <span class="toolbar-icon__emoji">{icon}</span>

  <!-- Display value (ej: "GPT-4") -->
  {#if displayValue}
    <span class="toolbar-icon__value">{displayValue}</span>
  {/if}

  <!-- Badge -->
  {#if badge !== undefined}
    <span class="toolbar-icon__badge toolbar-icon__badge--{badgeColor}">{badge}</span>
  {/if}
</button>

<style>
  .toolbar-icon {
    /* Padre controla todo vía CSS variables */
    --_size: var(--icon-size, 36px);
    --_font-size: var(--icon-font-size, 1rem);
    --_radius: var(--icon-radius, 8px);
    --_bg: var(--icon-bg, transparent);
    --_bg-hover: var(--icon-bg-hover, var(--color-bg-hover, rgba(0,0,0,0.05)));
    --_bg-active: var(--icon-bg-active, var(--color-primary, #3b82f6));

    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;

    width: var(--_size);
    height: var(--_size);
    min-width: var(--_size);
    min-height: var(--_size);

    padding: 0;
    border: none;
    border-radius: var(--_radius);
    background: var(--_bg);
    color: var(--color-text, inherit);
    cursor: pointer;

    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    transition: transform 0.1s, background 0.15s;
  }

  .toolbar-icon:hover:not(.toolbar-icon--disabled) {
    background: var(--_bg-hover);
  }

  .toolbar-icon:active:not(.toolbar-icon--disabled) {
    transform: scale(0.92);
  }

  .toolbar-icon--active {
    background: color-mix(in srgb, var(--_bg-active) 15%, transparent);
    color: var(--_bg-active);
  }

  .toolbar-icon--disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Variants */
  .toolbar-icon--primary { --_bg: var(--color-primary); color: white; }
  .toolbar-icon--success { --_bg: var(--color-success); color: white; }
  .toolbar-icon--warning { --_bg: var(--color-warning); color: black; }
  .toolbar-icon--danger { --_bg: var(--color-danger); color: white; }

  /* Emoji */
  .toolbar-icon__emoji {
    font-size: var(--_font-size);
    line-height: 1;
  }

  /* Display value */
  .toolbar-icon__value {
    font-size: 0.5rem;
    font-family: var(--font-mono, monospace);
    max-width: calc(var(--_size) - 4px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.8;
  }

  /* Badge */
  .toolbar-icon__badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    font-size: 0.5rem;
    font-weight: 600;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toolbar-icon__badge--danger { background: var(--color-danger, #ef4444); color: white; }
  .toolbar-icon__badge--primary { background: var(--color-primary, #3b82f6); color: white; }
  .toolbar-icon__badge--success { background: var(--color-success, #22c55e); color: white; }
  .toolbar-icon__badge--warning { background: var(--color-warning, #f59e0b); color: black; }
  .toolbar-icon__badge--info { background: var(--color-info, #0ea5e9); color: white; }

  /* Progress ring */
  .toolbar-icon__progress {
    position: absolute;
    inset: -2px;
    width: calc(100% + 4px);
    height: calc(100% + 4px);
    pointer-events: none;
  }

  .toolbar-icon__progress circle {
    stroke: var(--_bg-active);
    opacity: 0.6;
    transition: stroke-dashoffset 0.05s linear;
  }

  /* Focus visible */
  .toolbar-icon:focus-visible {
    outline: 2px solid var(--_bg-active);
    outline-offset: 2px;
  }
</style>
