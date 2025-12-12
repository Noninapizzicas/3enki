<!--
  CredentialButton.svelte
  =======================
  Botón unificado para credenciales con TRIPLE interacción.
  Usa GestureButton como base para el manejo de gestos.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre SelectorPanel (elegir credencial)
  - Doble tap/Doble click: Abre CredentialAddPanel (nueva credencial)
  - Long press / Click derecho: Abre CredentialConfigPanel (editar/eliminar)

  credential-manager usa enableAdd=true por defecto (se pueden crear desde UI).

  Skinnable via CSS Variables (desde tokens.json):
  --gesture-btn-bg, --gesture-btn-bg-hover, --gesture-btn-bg-active

  Uso:
    <CredentialButton
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
  import CredentialAddPanel from './uisis-CredentialAddPanel.svelte';
  import CredentialConfigPanel from './uisis-CredentialConfigPanel.svelte';
  import type { Credential } from './uisis-CredentialConfigPanel.svelte';

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
  // STATE
  // ============================================================================

  // Panel states
  let selectorOpen = false;
  let addOpen = false;
  let configOpen = false;

  // Selected credential for config panel
  let selectedCredential: Credential | null = null;

  // Display
  const currentIcon = '🔐';
  const currentLabel = 'Creds';

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    select: { credential: Credential };
    add: { projectId: string | null };
    config: { credential: Credential };
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

  function handleSelectorSelect(e: CustomEvent<{ item: Credential }>): void {
    const credential = e.detail.item;
    dispatch('select', { credential });
    selectorOpen = false;
  }

  function handleAddSave(e: CustomEvent): void {
    addOpen = false;
  }

  function handleConfigUpdate(e: CustomEvent): void {
    configOpen = false;
  }

  function handleConfigDelete(e: CustomEvent): void {
    configOpen = false;
    selectedCredential = null;
  }
</script>

<!-- Button con GestureButton base -->
<div
  class="cred-btn-wrapper"
  style:--gesture-btn-bg="hsl(142 71% 45% / 0.15)"
  style:--gesture-btn-bg-hover="hsl(142 71% 45% / 0.25)"
  style:--gesture-btn-bg-active="hsl(142 71% 45% / 0.35)"
  style:--gesture-btn-border-focus="var(--color-success, #22c55e)"
>
  <GestureButton
    {size}
    icon={currentIcon}
    label={currentLabel}
    {showLabel}
    {disabled}
    enableAdd={true}
    ariaLabel="Gestión de credenciales"
    on:select={handleGestureSelect}
    on:add={handleGestureAdd}
    on:config={handleGestureConfig}
  />
</div>

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
  .cred-btn-wrapper {
    display: contents;
  }
</style>
