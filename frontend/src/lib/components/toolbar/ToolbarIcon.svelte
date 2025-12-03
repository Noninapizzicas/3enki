<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';

  /**
   * ToolbarIcon - Icono con triple interacción
   *
   * Siguiendo CONTEXT_UI.md:
   * - 1 toque: Panel rápido (lo más frecuente)
   * - 2 toques: Crear nuevo
   * - Long-press: Gestión completa
   */

  // Props
  export let id: string;
  export let icon: string;
  export let label: string;
  export let badge: string | number | undefined = undefined;
  export let disabled = false;
  export let showLabel = false;
  export let orientation: 'horizontal' | 'vertical' = 'horizontal';
  export let longPressDuration = 500; // ms
  export let doubleTapDelay = 300; // ms

  const dispatch = createEventDispatcher<{
    tap: { id: string };
    doubleTap: { id: string };
    longPress: { id: string };
  }>();

  // Estado de interacción
  let tapCount = 0;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressProgress = 0;
  let longPressInterval: ReturnType<typeof setInterval> | null = null;
  let isLongPressing = false;

  // Limpieza al destruir
  onDestroy(() => {
    clearAllTimers();
  });

  function clearAllTimers() {
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = null;
    }
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (longPressInterval) {
      clearInterval(longPressInterval);
      longPressInterval = null;
    }
  }

  function handleTouchStart(e: TouchEvent | MouseEvent) {
    if (disabled) return;
    e.preventDefault();

    // Iniciar long-press timer
    const startTime = Date.now();
    longPressProgress = 0;
    isLongPressing = false;

    // Actualizar progreso visual
    longPressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      longPressProgress = Math.min(100, (elapsed / longPressDuration) * 100);
    }, 16); // ~60fps

    longPressTimer = setTimeout(() => {
      isLongPressing = true;
      clearAllTimers();
      longPressProgress = 0;
      dispatch('longPress', { id });
    }, longPressDuration);
  }

  function handleTouchEnd(e: TouchEvent | MouseEvent) {
    if (disabled) return;

    // Si fue long-press, ya se disparó
    if (isLongPressing) {
      isLongPressing = false;
      return;
    }

    // Cancelar long-press
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (longPressInterval) {
      clearInterval(longPressInterval);
      longPressInterval = null;
    }
    longPressProgress = 0;

    // Lógica de tap/doubleTap
    tapCount++;

    if (tapCount === 1) {
      tapTimer = setTimeout(() => {
        // Single tap
        dispatch('tap', { id });
        tapCount = 0;
      }, doubleTapDelay);
    } else if (tapCount === 2) {
      // Double tap
      if (tapTimer) {
        clearTimeout(tapTimer);
        tapTimer = null;
      }
      dispatch('doubleTap', { id });
      tapCount = 0;
    }
  }

  function handleTouchCancel() {
    clearAllTimers();
    tapCount = 0;
    longPressProgress = 0;
    isLongPressing = false;
  }

  // Clases dinámicas
  $: containerClasses = [
    'toolbar-icon',
    'relative flex items-center justify-center',
    'select-none cursor-pointer',
    'transition-all duration-150',
    orientation === 'vertical' ? 'flex-col' : 'flex-row',
    showLabel ? 'gap-2 px-3 py-2' : 'p-2',
    disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-bg-hover active:scale-95',
    'rounded-lg'
  ].filter(Boolean).join(' ');
</script>

<button
  type="button"
  class={containerClasses}
  {disabled}
  aria-label={label}
  aria-disabled={disabled}
  on:mousedown={handleTouchStart}
  on:mouseup={handleTouchEnd}
  on:mouseleave={handleTouchCancel}
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchCancel}
>
  <!-- Indicador de progreso long-press -->
  {#if longPressProgress > 0}
    <div
      class="absolute inset-0 rounded-lg overflow-hidden pointer-events-none"
    >
      <div
        class="absolute bottom-0 left-0 right-0 bg-primary/30 transition-all"
        style="height: {longPressProgress}%"
      ></div>
    </div>
  {/if}

  <!-- Icono -->
  <span class="icon text-xl leading-none z-10" role="img" aria-hidden="true">
    {icon}
  </span>

  <!-- Badge -->
  {#if badge !== undefined}
    <span
      class="badge absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-xs font-bold bg-danger text-white rounded-full z-20"
    >
      {badge}
    </span>
  {/if}

  <!-- Label (solo cuando expandido) -->
  {#if showLabel}
    <span class="label text-sm text-text truncate z-10">
      {label}
    </span>
  {/if}
</button>

<style>
  .toolbar-icon {
    min-width: 40px;
    min-height: 40px;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .toolbar-icon:focus {
    outline: 2px solid var(--color-primary, #3b82f6);
    outline-offset: 2px;
  }

  .toolbar-icon:focus:not(:focus-visible) {
    outline: none;
  }

  /* Animación suave del icono al presionar */
  .toolbar-icon:active .icon {
    transform: scale(0.9);
  }
</style>
