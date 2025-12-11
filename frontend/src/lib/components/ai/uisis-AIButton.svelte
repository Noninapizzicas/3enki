<!--
  AIButton.svelte
  ================
  Botón unificado para AI con interacción dual/triple.
  Usa GestureButton como base para el manejo de gestos.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre SelectorPanel (elegir modelo)
  - Doble tap/Doble click: Abre panel Add (OPCIONAL - solo si enableAdd=true)
  - Long press / Click derecho: Abre AIConfigPanel (configuración LLM)

  Para ai-gateway: enableAdd=false (default) → Solo 2 interacciones
  Para credential-manager: enableAdd=true → 3 interacciones completas

  Skinnable via CSS Variables (desde tokens.json):
  --gesture-btn-bg, --gesture-btn-bg-hover, --gesture-btn-bg-active

  Uso:
    <AIButton
      size="md"
      enableAdd={false}
      on:select={handleSelect}
      on:config={handleConfig}
    />

  @version 3.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { GestureButton } from '$components/ui';
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
  // STATE
  // ============================================================================

  // Panel states
  let selectorOpen = false;
  let configOpen = false;

  // Model display
  let selectedValue: string | null = null;
  let currentIcon = '🤖';
  let currentLabel = 'Auto';

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    select: { provider: string; model: string; itemId: string };
    add: { projectId: string | null };
    config: { config: Record<string, unknown> };
  }>();

  // ============================================================================
  // GESTURE HANDLERS
  // ============================================================================

  function handleGestureSelect(): void {
    selectorOpen = true;
  }

  function handleGestureAdd(): void {
    dispatch('add', { projectId });
  }

  function handleGestureConfig(): void {
    configOpen = true;
  }

  // ============================================================================
  // PANEL HANDLERS
  // ============================================================================

  function handleSelectorSelect(e: CustomEvent): void {
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
</script>

<!-- Button con GestureButton base -->
<div
  class="ai-btn-wrapper"
  style:--gesture-btn-bg="hsl(235 85% 65% / 0.15)"
  style:--gesture-btn-bg-hover="hsl(235 85% 65% / 0.25)"
  style:--gesture-btn-bg-active="hsl(235 85% 65% / 0.35)"
  style:--gesture-btn-border-focus="var(--color-primary, #3b82f6)"
>
  <GestureButton
    {size}
    icon={currentIcon}
    label={currentLabel}
    {showLabel}
    {disabled}
    {enableAdd}
    ariaLabel="Selector de modelo IA"
    on:select={handleGestureSelect}
    on:add={handleGestureAdd}
    on:config={handleGestureConfig}
  />
</div>

<!-- Panel Select (tap/click) -->
<SelectorPanel
  module="ai-gateway"
  panelMode="quick"
  {projectId}
  bind:open={selectorOpen}
  bind:selectedValue
  on:select={handleSelectorSelect}
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
  .ai-btn-wrapper {
    display: contents;
  }
</style>
