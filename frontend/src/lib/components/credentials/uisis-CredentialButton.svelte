<!--
  CredentialButton.svelte
  =======================
  Botón unificado para credenciales con TRIPLE interacción.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre SelectorPanel (elegir credencial)
  - Doble tap/Doble click: Abre CredentialAddPanel (nueva credencial)
  - Long press / Click derecho: Abre CredentialConfigPanel (editar/eliminar)

  credential-manager usa enableAdd=true por defecto (se pueden crear desde UI).

  Skinnable via CSS Variables (desde tokens.json):
  --cred-btn-bg, --cred-btn-bg-hover, --cred-btn-bg-active
  --cred-btn-color, --cred-btn-radius, --cred-btn-border

  Uso:
    <CredentialButton
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
  import CredentialAddPanel from './CredentialAddPanel.svelte';
  import CredentialConfigPanel from './CredentialConfigPanel.svelte';
  import type { Credential } from './CredentialConfigPanel.svelte';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón (sm: 44px, md: 56px, lg: 72px) */
  export let size: Size = 'md';

  /** Proyecto actual (para filtrar credenciales) */
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

  // Selected credential for config panel
  let selectedCredential: Credential | null = null;

  // Display
  let currentIcon = '🔐';
  let currentLabel = 'Creds';
  let credentialCount = 0;

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
    select: { credential: Credential };
    add: { projectId: string | null };
    config: { credential: Credential };
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

  /** Tap/Click → Panel Select (elegir credencial) */
  function doSelect(): void {
    selectorOpen = true;
  }

  /** Doble tap/Doble click → Panel Add (nueva credencial) */
  function doAdd(): void {
    addOpen = true;
    dispatch('add', { projectId });
  }

  /** Long press/Click derecho → Panel Config (editar credencial) */
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

  function handleSelectorSelect(e: CustomEvent<{ item: Credential }>): void {
    const credential = e.detail.item;
    dispatch('select', { credential });
    selectorOpen = false;
  }

  function handleAddSave(e: CustomEvent): void {
    // Refresh después de añadir
    addOpen = false;
  }

  function handleConfigUpdate(e: CustomEvent): void {
    configOpen = false;
  }

  function handleConfigDelete(e: CustomEvent): void {
    configOpen = false;
    selectedCredential = null;
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
  class="cred-btn"
  class:cred-btn--disabled={disabled}
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
  aria-label="Gestión de credenciales"
  aria-disabled={disabled}
  title="Tap: seleccionar | Doble tap: añadir | Long press: config"
>
  <span class="cred-btn__icon">{currentIcon}</span>
  {#if showLabel}
    <span class="cred-btn__label">{currentLabel}</span>
  {/if}
</button>

<!-- Panel Select (tap/click) -->
<SelectorPanel
  bind:open={selectorOpen}
  module="credential-manager"
  {projectId}
  on:select={handleSelectorSelect}
/>

<!-- Panel Add (doble tap/doble click) -->
<CredentialAddPanel
  bind:open={addOpen}
  {projectId}
  on:save={handleAddSave}
/>

<!-- Panel Config (long press/click derecho) -->
<CredentialConfigPanel
  bind:open={configOpen}
  credential={selectedCredential}
  on:update={handleConfigUpdate}
  on:delete={handleConfigDelete}
/>

<style>
  /*
   * CSS Variables - Skinnable desde el padre
   * =========================================
   * Todos los valores por defecto referencian tokens.json
   */
  .cred-btn {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--cred-btn-bg, hsl(142 71% 45% / 0.15));
    --_bg-hover: var(--cred-btn-bg-hover, hsl(142 71% 45% / 0.25));
    --_bg-active: var(--cred-btn-bg-active, hsl(142 71% 45% / 0.35));
    --_color: var(--cred-btn-color, var(--color-text, #ffffff));
    --_color-muted: var(--cred-btn-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--cred-btn-border, transparent);
    --_border-focus: var(--cred-btn-border-focus, var(--color-success, #22c55e));
    --_radius: var(--cred-btn-radius, var(--radius-lg, 12px));
    --_shadow: var(--cred-btn-shadow, none);
    --_transition: var(--cred-btn-transition, var(--transition-fast, 150ms));

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
  .cred-btn:hover:not(.cred-btn--disabled) {
    background: var(--_bg-hover);
  }

  .cred-btn:active:not(.cred-btn--disabled) {
    background: var(--_bg-active);
    transform: scale(0.95);
  }

  .cred-btn:focus-visible {
    outline: none;
    border-color: var(--_border-focus);
    box-shadow: 0 0 0 3px hsl(142 71% 45% / 0.3);
  }

  .cred-btn--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* === ICON === */
  .cred-btn__icon {
    font-size: var(--_icon-size);
    line-height: 1;
  }

  /* === LABEL === */
  .cred-btn__label {
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
    .cred-btn:active:not(.cred-btn--disabled) {
      background: var(--_bg-active);
    }
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .cred-btn {
      transition: none;
    }
  }
</style>
