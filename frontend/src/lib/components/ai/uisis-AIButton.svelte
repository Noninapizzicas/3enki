<!--
  AIButton.svelte
  ================
  Botón unificado para AI con interacción dual/triple.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre SelectorPanel (elegir modelo)
  - Doble tap/Doble click: Abre panel Add (OPCIONAL - solo si enableAdd=true)
  - Long press / Click derecho: Abre AIConfigPanel (configuración LLM)

  Para ai-gateway: enableAdd=false (default) → Solo 2 interacciones
  Para credential-manager: enableAdd=true → 3 interacciones completas

  Skinnable via CSS Variables (desde tokens.json):
  --ai-btn-bg, --ai-btn-bg-hover, --ai-btn-bg-active
  --ai-btn-color, --ai-btn-radius, --ai-btn-border

  Uso:
    <AIButton
      size="md"
      enableAdd={false}
      on:select={handleSelect}
      on:config={handleConfig}
    />

  @version 2.1.0
  @author Event Core Team
-->
<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import { SelectorPanel } from '$components/feedback';
  import AIConfigPanel from './uisis-AIConfigPanel.svelte';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón (sm: 44px, md: 56px, lg: 72px) */
  export let size: Size = 'md';

  /** Proyecto actual (para filtrar datos) */
  export let projectId: string | null = null;

  /** Mostrar label debajo del icono */
  export let showLabel = true;

  /** Deshabilitar interacciones */
  export let disabled = false;

  /** Habilitar doble tap → Add (default false para ai-gateway) */
  export let enableAdd = false;

  // ============================================================================
  // CONFIGURATION (siguiendo tokens.json)
  // ============================================================================

  const SIZES: Record<Size, { btn: number; icon: string; label: string }> = {
    sm: { btn: 44, icon: '1.125rem', label: '0.625rem' },
    md: { btn: 56, icon: '1.5rem', label: '0.6875rem' },
    lg: { btn: 72, icon: '2rem', label: '0.75rem' }
  };

  const TIMING = {
    tapDelay: 250,        // ms para distinguir tap de doble tap
    doubleTapMax: 300,    // ms máximo entre taps para doble tap
    longPressDuration: 500 // ms para activar long press
  };

  // ============================================================================
  // STATE
  // ============================================================================

  // Panel states
  let selectorOpen = false;
  let configOpen = false;
  let addOpen = false;

  // Model display
  let selectedValue: string | null = null;
  let currentIcon = '🤖';
  let currentLabel = 'Auto';

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
    select: { provider: string; model: string; itemId: string };
    add: { projectId: string | null };
    config: { config: Record<string, unknown> };
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

  /** Tap/Click → Panel Select (elegir modelo) */
  function doSelect(): void {
    selectorOpen = true;
  }

  /** Doble tap/Doble click → Panel Add (solo si enableAdd=true) */
  function doAdd(): void {
    if (!enableAdd) return; // No hacer nada si Add está deshabilitado
    addOpen = true;
    dispatch('add', { projectId });
  }

  /** Long press/Click derecho → Panel Config (configuración LLM) */
  function doConfig(): void {
    configOpen = true;
  }

  // ============================================================================
  // GESTURE HANDLERS - TOUCH (Mobile)
  // ============================================================================

  function handleTouchStart(e: TouchEvent): void {
    if (disabled) return;
    e.preventDefault();
    isLongPress = false;

    // Iniciar timer para long press
    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      clearTimers();
      doConfig();
    }, TIMING.longPressDuration);
  }

  function handleTouchEnd(e: TouchEvent): void {
    if (disabled) return;
    e.preventDefault();

    // Si fue long press, ignorar
    if (isLongPress) {
      isLongPress = false;
      return;
    }

    clearTimers();
    tapCount++;

    if (tapCount === 1) {
      // Esperar posible segundo tap
      tapTimeout = setTimeout(() => {
        if (tapCount === 1) {
          doSelect(); // Single tap → Select
        }
        tapCount = 0;
      }, TIMING.tapDelay);
    } else if (tapCount >= 2) {
      // Doble tap detectado
      clearTimers();
      tapCount = 0;
      doAdd(); // Double tap → Add
    }
  }

  function handleTouchCancel(): void {
    resetGestureState();
  }

  // ============================================================================
  // GESTURE HANDLERS - MOUSE (Desktop)
  // ============================================================================

  function handleMouseDown(): void {
    if (disabled) return;
    isLongPress = false;

    // Iniciar timer para long press
    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      clearTimers();
      doConfig();
    }, TIMING.longPressDuration);
  }

  function handleMouseUp(): void {
    if (disabled) return;

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
          doSelect(); // Single click → Select
        }
        tapCount = 0;
      }, TIMING.tapDelay);
    } else if (tapCount >= 2) {
      // Doble click detectado
      clearTimers();
      tapCount = 0;
      doAdd(); // Double click → Add
    }
  }

  function handleMouseLeave(): void {
    // Cancelar long press si sale del botón
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
  }

  function handleContextMenu(e: MouseEvent): void {
    if (disabled) return;
    e.preventDefault();
    doConfig(); // Click derecho → Config
  }

  // ============================================================================
  // PANEL HANDLERS
  // ============================================================================

  function handleSelect(e: CustomEvent): void {
    const { itemId, metadata } = e.detail;

    if (metadata) {
      const { provider, model } = metadata;

      // Actualizar display
      currentIcon = getProviderIcon(provider);
      currentLabel = getShortLabel(provider, model);
      selectedValue = itemId;

      dispatch('select', { provider, model, itemId });
    }
  }

  function handleConfigSave(e: CustomEvent): void {
    dispatch('config', e.detail);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  function getProviderIcon(provider: string): string {
    const icons: Record<string, string> = {
      deepseek: '🔮',
      anthropic: '🧠',
      openai: '🤖',
      ollama: '🦙',
      auto: '⚡'
    };
    return icons[provider?.toLowerCase()] || '🤖';
  }

  function getShortLabel(provider: string, model: string): string {
    if (model?.includes('deepseek')) return 'DeepSeek';
    if (model?.includes('claude')) return 'Claude';
    if (model?.includes('gpt-4')) return 'GPT-4';
    if (model?.includes('gpt-3')) return 'GPT-3.5';
    if (model?.includes('llama')) return 'Llama';
    if (model?.includes('mistral')) return 'Mistral';

    const labels: Record<string, string> = {
      deepseek: 'DeepSeek',
      anthropic: 'Claude',
      openai: 'OpenAI',
      ollama: 'Ollama'
    };
    return labels[provider?.toLowerCase()] || 'Auto';
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onDestroy(() => {
    clearTimers();
  });
</script>

<!-- Button -->
<button
  class="ai-btn"
  class:ai-btn--disabled={disabled}
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
  aria-label="Selector de modelo IA"
  aria-disabled={disabled}
  title={enableAdd
    ? "Tap: seleccionar | Doble tap: añadir | Long press: config"
    : "Tap: seleccionar | Long press: config"}
>
  <span class="ai-btn__icon">{currentIcon}</span>
  {#if showLabel}
    <span class="ai-btn__label">{currentLabel}</span>
  {/if}
</button>

<!-- Panel Select (tap/click) -->
<SelectorPanel
  module="ai-gateway"
  panelMode="quick"
  {projectId}
  bind:open={selectorOpen}
  bind:selectedValue
  on:select={handleSelect}
/>

<!-- Panel Config (long press/click derecho) -->
<AIConfigPanel
  bind:open={configOpen}
  on:save={handleConfigSave}
/>

<!--
  Panel Add: Se delega al padre via evento on:add
  El padre decide qué hacer (abrir credential-manager, modal, etc.)
-->

<style>
  /*
   * CSS Variables - Skinnable desde el padre
   * =========================================
   * Todos los valores por defecto referencian tokens.json
   *
   * Uso desde el padre:
   * <div style="--ai-btn-bg: var(--color-success);">
   *   <AIButton />
   * </div>
   */
  .ai-btn {
    /* === SKINNABLE VARIABLES (override desde padre) === */
    --_bg: var(--ai-btn-bg, hsl(235 85% 65% / 0.15));
    --_bg-hover: var(--ai-btn-bg-hover, hsl(235 85% 65% / 0.25));
    --_bg-active: var(--ai-btn-bg-active, hsl(235 85% 65% / 0.35));
    --_color: var(--ai-btn-color, var(--color-text, #ffffff));
    --_color-muted: var(--ai-btn-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--ai-btn-border, transparent);
    --_border-focus: var(--ai-btn-border-focus, var(--color-primary, #3b82f6));
    --_radius: var(--ai-btn-radius, var(--radius-lg, 12px));
    --_shadow: var(--ai-btn-shadow, none);
    --_transition: var(--ai-btn-transition, var(--transition-fast, 150ms));

    /* === LAYOUT === */
    width: var(--_size);
    height: var(--_size);
    min-width: var(--_size); /* Evita shrink en flex */
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
  .ai-btn:hover:not(.ai-btn--disabled) {
    background: var(--_bg-hover);
  }

  .ai-btn:active:not(.ai-btn--disabled) {
    background: var(--_bg-active);
    transform: scale(0.95);
  }

  .ai-btn:focus-visible {
    outline: none;
    border-color: var(--_border-focus);
    box-shadow: 0 0 0 3px hsl(235 85% 65% / 0.3);
  }

  .ai-btn--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* === ICON === */
  .ai-btn__icon {
    font-size: var(--_icon-size);
    line-height: 1;
  }

  /* === LABEL === */
  .ai-btn__label {
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
    .ai-btn:active:not(.ai-btn--disabled) {
      background: var(--_bg-active);
    }
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .ai-btn {
      transition: none;
    }
  }
</style>
