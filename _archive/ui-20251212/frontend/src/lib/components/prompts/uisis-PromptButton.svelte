<!--
  PromptButton.svelte
  ===================
  Botón unificado para prompts con TRIPLE interacción.
  Usa GestureButton como base para el manejo de gestos.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre SelectorPanel (elegir prompt)
  - Doble tap/Doble click: Abre PromptAddPanel (nuevo prompt)
  - Long press / Click derecho: Abre PromptConfigPanel (editar/eliminar)

  prompt-manager usa enableAdd=true (se pueden crear desde UI).

  Skinnable via CSS Variables (desde tokens.json):
  --gesture-btn-bg, --gesture-btn-bg-hover, --gesture-btn-bg-active

  Uso:
    <PromptButton
      size="md"
      on:select={handleSelect}
      on:add={handleAdd}
      on:config={handleConfig}
    />

  @version 2.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { GestureButton } from '$components/ui';
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
  // STATE
  // ============================================================================

  // Panel states
  let selectorOpen = false;
  let addOpen = false;
  let configOpen = false;

  // Selected prompt for config panel
  let selectedPrompt: Prompt | null = null;

  // Display
  const currentIcon = '📝';
  const currentLabel = 'Prompts';

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    select: { prompt: Prompt };
    add: void;
    config: { prompt: Prompt };
  }>();

  // ============================================================================
  // GESTURE HANDLERS
  // ============================================================================

  function handleGestureSelect(): void {
    selectorOpen = true;
  }

  function handleGestureAdd(): void {
    addOpen = true;
    dispatch('add');
  }

  function handleGestureConfig(): void {
    configOpen = true;
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
</script>

<!-- Button con GestureButton base -->
<div
  class="prompt-btn-wrapper"
  style:--gesture-btn-bg="hsl(45 93% 47% / 0.15)"
  style:--gesture-btn-bg-hover="hsl(45 93% 47% / 0.25)"
  style:--gesture-btn-bg-active="hsl(45 93% 47% / 0.35)"
  style:--gesture-btn-border-focus="var(--color-warning, #f59e0b)"
>
  <GestureButton
    {size}
    icon={currentIcon}
    label={currentLabel}
    {showLabel}
    {disabled}
    enableAdd={true}
    ariaLabel="Gestión de prompts"
    on:select={handleGestureSelect}
    on:add={handleGestureAdd}
    on:config={handleGestureConfig}
  />
</div>

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
  .prompt-btn-wrapper {
    display: contents;
  }
</style>
