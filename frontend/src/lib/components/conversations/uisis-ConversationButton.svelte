<!--
  ConversationButton.svelte
  =========================
  Botón unificado para conversaciones con TRIPLE interacción.
  Usa GestureButton como base para el manejo de gestos.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre SelectorPanel (elegir conversación)
  - Doble tap/Doble click: Abre ConversationAddPanel (nueva conversación)
  - Long press / Click derecho: Abre ConversationConfigPanel (editar/eliminar)

  conversation-manager usa enableAdd=true (se pueden crear desde UI).

  Skinnable via CSS Variables (desde tokens.json):
  --gesture-btn-bg, --gesture-btn-bg-hover, --gesture-btn-bg-active

  Uso:
    <ConversationButton
      size="md"
      {projectId}
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
  // STATE
  // ============================================================================

  // Panel states
  let selectorOpen = false;
  let addOpen = false;
  let configOpen = false;

  // Selected conversation for config panel
  let selectedConversation: Conversation | null = null;

  // Display
  const currentIcon = '💬';
  const currentLabel = 'Chats';

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    select: { conversation: Conversation };
    add: { projectId: string | null };
    config: { conversation: Conversation };
  }>();

  // ============================================================================
  // GESTURE HANDLERS
  // ============================================================================

  function handleGestureSelect(): void {
    selectorOpen = true;
  }

  function handleGestureAdd(): void {
    addOpen = true;
    dispatch('add', { projectId });
  }

  function handleGestureConfig(): void {
    configOpen = true;
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
</script>

<!-- Button con GestureButton base -->
<div
  class="conv-btn-wrapper"
  style:--gesture-btn-bg="hsl(262 83% 58% / 0.15)"
  style:--gesture-btn-bg-hover="hsl(262 83% 58% / 0.25)"
  style:--gesture-btn-bg-active="hsl(262 83% 58% / 0.35)"
  style:--gesture-btn-border-focus="hsl(262 83% 58%)"
>
  <GestureButton
    {size}
    icon={currentIcon}
    label={currentLabel}
    {showLabel}
    {disabled}
    enableAdd={true}
    ariaLabel="Gestión de conversaciones"
    on:select={handleGestureSelect}
    on:add={handleGestureAdd}
    on:config={handleGestureConfig}
  />
</div>

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
  .conv-btn-wrapper {
    display: contents;
  }
</style>
