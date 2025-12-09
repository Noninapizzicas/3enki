<!--
  AIButton.svelte
  ================
  Botón unificado para AI con triple interacción.

  Gestos:
  - Tap/Click: Abre SelectorPanel (elegir modelo)
  - Long press / Click derecho: Abre AIConfigPanel (configuración LLM)

  Uso:
    <AIButton size="md" on:modelSelect={handle} on:configSave={handle} />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import { SelectorPanel } from '$components/feedback';
  import AIConfigPanel from './AIConfigPanel.svelte';
  import config from '$lib/config';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón */
  export let size: 'sm' | 'md' | 'lg' = 'md';

  /** Proyecto actual (para filtrar datos) */
  export let projectId: string | null = null;

  /** Mostrar label debajo del icono */
  export let showLabel = true;

  // ============================================================================
  // CONFIG
  // ============================================================================

  const SIZES = {
    sm: { btn: 44, icon: '1.125rem', label: '0.6rem' },
    md: { btn: 56, icon: '1.5rem', label: '0.7rem' },
    lg: { btn: 72, icon: '2rem', label: '0.75rem' }
  };

  const GESTURE_CONFIG = {
    tapDelay: 250,
    longPressDuration: 500
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let selectorOpen = false;
  let configOpen = false;
  let selectedValue: string | null = null;

  // Current model display
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
    modelSelect: { provider: string; model: string; itemId: string };
    configSave: { config: Record<string, unknown> };
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
  // GESTURE HANDLERS
  // ============================================================================

  function handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    isLongPress = false;

    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      clearTimers();
      openConfig();
    }, GESTURE_CONFIG.longPressDuration);
  }

  function handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();

    if (isLongPress) {
      isLongPress = false;
      return;
    }

    clearTimers();
    tapCount++;

    if (tapCount === 1) {
      tapTimeout = setTimeout(() => {
        if (tapCount === 1) {
          openSelector();
        }
        tapCount = 0;
      }, GESTURE_CONFIG.tapDelay);
    } else if (tapCount >= 2) {
      clearTimers();
      openSelector();
      tapCount = 0;
    }
  }

  function handleTouchCancel(): void {
    resetGestureState();
  }

  function handleMouseDown(): void {
    isLongPress = false;

    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      clearTimers();
      openConfig();
    }, GESTURE_CONFIG.longPressDuration);
  }

  function handleMouseUp(): void {
    if (isLongPress) {
      isLongPress = false;
      return;
    }

    clearTimers();
    tapCount++;

    if (tapCount === 1) {
      tapTimeout = setTimeout(() => {
        if (tapCount === 1) {
          openSelector();
        }
        tapCount = 0;
      }, GESTURE_CONFIG.tapDelay);
    } else if (tapCount >= 2) {
      clearTimers();
      openSelector();
      tapCount = 0;
    }
  }

  function handleMouseLeave(): void {
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
  }

  function handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    openConfig();
  }

  // ============================================================================
  // PANEL ACTIONS
  // ============================================================================

  function openSelector(): void {
    selectorOpen = true;
  }

  function openConfig(): void {
    configOpen = true;
  }

  function handleSelect(e: CustomEvent): void {
    const { itemId, metadata } = e.detail;

    if (metadata) {
      const { provider, model } = metadata;

      // Update display
      currentIcon = getProviderIcon(provider);
      currentLabel = getShortLabel(provider, model);
      selectedValue = itemId;

      dispatch('modelSelect', { provider, model, itemId });
    }
  }

  function handleConfigSave(e: CustomEvent): void {
    dispatch('configSave', e.detail);
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
    return icons[provider] || '🤖';
  }

  function getShortLabel(provider: string, model: string): string {
    // Shorten model names for display
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
    return labels[provider] || 'Auto';
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
  class="ai-button"
  style="--btn-size: {s.btn}px; --icon-size: {s.icon}; --label-size: {s.label};"
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchCancel}
  on:mousedown={handleMouseDown}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
  on:contextmenu={handleContextMenu}
  aria-label="Selector de modelo IA"
  title="Tap: seleccionar modelo | Long press: configuración"
>
  <span class="ai-button__icon">{currentIcon}</span>
  {#if showLabel}
    <span class="ai-button__label">{currentLabel}</span>
  {/if}
</button>

<!-- Selector Panel -->
<SelectorPanel
  module="ai-gateway"
  panelMode="quick"
  {projectId}
  bind:open={selectorOpen}
  bind:selectedValue
  on:select={handleSelect}
/>

<!-- Config Panel -->
<AIConfigPanel
  bind:open={configOpen}
  on:save={handleConfigSave}
/>

<style>
  .ai-button {
    width: var(--btn-size);
    height: var(--btn-size);
    border: none;
    border-radius: 14px;
    background: var(--ai-button-bg, rgba(99, 102, 241, 0.15));
    color: var(--ai-button-color, #e0e0e0);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    transition: transform 0.1s, background 0.15s;
  }

  .ai-button:hover {
    background: var(--ai-button-hover, rgba(99, 102, 241, 0.25));
  }

  .ai-button:active {
    background: var(--ai-button-active, rgba(99, 102, 241, 0.35));
    transform: scale(0.95);
  }

  .ai-button__icon {
    font-size: var(--icon-size);
    line-height: 1;
  }

  .ai-button__label {
    font-size: var(--label-size);
    font-weight: 500;
    opacity: 0.85;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(var(--btn-size) - 8px);
  }

  /* Touch feedback */
  @media (hover: none) {
    .ai-button:active {
      background: var(--ai-button-active, rgba(99, 102, 241, 0.4));
    }
  }
</style>
