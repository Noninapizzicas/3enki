<!--
  ConversationButton.svelte
  =========================
  Botón unificado para conversaciones con TRIPLE interacción.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre SelectorPanel (elegir conversación)
  - Doble tap/Doble click: Abre ConversationAddPanel (nueva conversación)
  - Long press / Click derecho: Abre ConversationConfigPanel (editar/eliminar)

  conversation-manager usa enableAdd=true (se pueden crear desde UI).

  Skinnable via CSS Variables (desde tokens.json):
  --conv-btn-bg, --conv-btn-bg-hover, --conv-btn-bg-active
  --conv-btn-color, --conv-btn-radius, --conv-btn-border

  Uso:
    <ConversationButton
      size="md"
      {projectId}
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
  import ConversationAddPanel from './uisis-ConversationAddPanel.svelte';
  import ConversationConfigPanel from './uisis-ConversationConfigPanel.svelte';
  import type { Conversation } from './uisis-ConversationConfigPanel.svelte';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón (sm: 44px, md: 56px, lg: 72px) */
  export let size: Size = 'md';

  /** Proyecto actual (para filtrar conversaciones) */
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
    tapDelay: 350,      // Aumentado para dar más tiempo al doble tap
    doubleTapMax: 400,  // Aumentado para mejor detección
    longPressDuration: 500
  };

  // ============================================================================
  // STATE
  // ============================================================================

  // Panel states
  let selectorOpen = false;
  let addOpen = false;
  let configOpen = false;

  // Selected conversation for config panel
  let selectedConversation: Conversation | null = null;

  // Display
  let currentIcon = '💬';
  let currentLabel = 'Chats';

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
    select: { conversation: Conversation };
    add: { projectId: string | null };
    config: { conversation: Conversation };
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

  /** Tap/Click → Panel Select (elegir conversación) */
  function doSelect(): void {
    selectorOpen = true;
  }

  /** Doble tap/Doble click → Panel Add (nueva conversación) */
  function doAdd(): void {
    addOpen = true;
    dispatch('add', { projectId });
  }

  /** Long press/Click derecho → Panel Config (editar conversación) */
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

    // Si fue long press, ignorar
    if (isLongPress) {
      isLongPress = false;
      return;
    }

    clearTimers();
    tapCount++;

    if (tapCount === 1) {
      // Esperar posible segundo click
      tapTimeout = setTimeout(() => {
        if (tapCount === 1) {
          doSelect();
        }
        tapCount = 0;
      }, TIMING.tapDelay);
    } else if (tapCount >= 2) {
      // Doble click detectado
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
    if (disabled) return;
    e.preventDefault();
    resetGestureState();
    doConfig();
  }

  /** Handler nativo para doble click (fallback más fiable) */
  function handleDblClick(e: MouseEvent): void {
    if (disabled) return;
    e.preventDefault();
    clearTimers();
    doAdd();
  }

  // ============================================================================
  // PANEL HANDLERS
  // ============================================================================

  function handleSelectorSelect(e: CustomEvent<{ item: Conversation }>): void {
    const conversation = e.detail.item;
    selectedConversation = conversation;
    dispatch('select', { conversation });
    selectorOpen = false;
  }

  function handleAddSave(e: CustomEvent<{ conversation: Conversation }>): void {
    addOpen = false;
  }

  function handleConfigUpdate(e: CustomEvent<{ conversation: Conversation }>): void {
    configOpen = false;
  }

  function handleConfigDelete(e: CustomEvent<{ id: string }>): void {
    configOpen = false;
    selectedConversation = null;
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
  class="conv-btn"
  class:conv-btn--disabled={disabled}
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
  aria-label="Gestión de conversaciones"
  aria-disabled={disabled}
  title="Tap: seleccionar | Doble tap: nueva | Long press: config"
>
  <span class="conv-btn__icon">{currentIcon}</span>
  {#if showLabel}
    <span class="conv-btn__label">{currentLabel}</span>
  {/if}
</button>

<!-- Panel Select (tap/click) -->
<SelectorPanel
  bind:open={selectorOpen}
  module="conversation-manager"
  {projectId}
  on:select={handleSelectorSelect}
/>

<!-- Panel Add (doble tap/doble click) -->
<ConversationAddPanel
  bind:open={addOpen}
  {projectId}
  on:save={handleAddSave}
/>

<!-- Panel Config (long press/click derecho) -->
<ConversationConfigPanel
  bind:open={configOpen}
  conversation={selectedConversation}
  on:update={handleConfigUpdate}
  on:delete={handleConfigDelete}
/>

<style>
  .conv-btn {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--conv-btn-bg, hsl(262 83% 58% / 0.15));
    --_bg-hover: var(--conv-btn-bg-hover, hsl(262 83% 58% / 0.25));
    --_bg-active: var(--conv-btn-bg-active, hsl(262 83% 58% / 0.35));
    --_color: var(--conv-btn-color, var(--color-text, #ffffff));
    --_color-muted: var(--conv-btn-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--conv-btn-border, transparent);
    --_border-focus: var(--conv-btn-border-focus, hsl(262 83% 58%));
    --_radius: var(--conv-btn-radius, var(--radius-lg, 12px));
    --_shadow: var(--conv-btn-shadow, none);
    --_transition: var(--conv-btn-transition, var(--transition-fast, 150ms));

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
  .conv-btn:hover:not(.conv-btn--disabled) {
    background: var(--_bg-hover);
  }

  .conv-btn:active:not(.conv-btn--disabled) {
    background: var(--_bg-active);
    transform: scale(0.95);
  }

  .conv-btn:focus-visible {
    outline: none;
    border-color: var(--_border-focus);
    box-shadow: 0 0 0 3px hsl(262 83% 58% / 0.3);
  }

  .conv-btn--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* === ICON === */
  .conv-btn__icon {
    font-size: var(--_icon-size);
    line-height: 1;
  }

  /* === LABEL === */
  .conv-btn__label {
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
    .conv-btn:active:not(.conv-btn--disabled) {
      background: var(--_bg-active);
    }
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .conv-btn {
      transition: none;
    }
  }
</style>
