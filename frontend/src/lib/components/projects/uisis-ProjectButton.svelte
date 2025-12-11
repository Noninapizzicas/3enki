<!--
  ProjectButton.svelte
  ====================
  Botón unificado para proyectos con TRIPLE interacción.
  Usa GestureButton como base para el manejo de gestos.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre SelectorPanel (elegir proyecto)
  - Doble tap/Doble click: Abre ProjectAddPanel (nuevo proyecto)
  - Long press / Click derecho: Abre ProjectConfigPanel (editar/eliminar)

  project-manager usa enableAdd=true (se pueden crear desde UI).

  Skinnable via CSS Variables (desde tokens.json):
  --gesture-btn-bg, --gesture-btn-bg-hover, --gesture-btn-bg-active

  Uso:
    <ProjectButton
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
  import ProjectAddPanel from './uisis-ProjectAddPanel.svelte';
  import ProjectConfigPanel from './uisis-ProjectConfigPanel.svelte';
  import type { Project } from './uisis-ProjectConfigPanel.svelte';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón (sm: 44px, md: 56px, lg: 72px) */
  export let size: Size = 'md';

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

  // Selected project for config panel
  let selectedProject: Project | null = null;

  // Display
  const currentIcon = '📁';
  const currentLabel = 'Projects';

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    select: { project: Project };
    add: void;
    config: { project: Project };
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

  function handleSelectorSelect(e: CustomEvent<{ item: Project }>): void {
    const project = e.detail.item;
    selectedProject = project;
    dispatch('select', { project });
    selectorOpen = false;
  }

  function handleAddSave(e: CustomEvent<{ project: Project }>): void {
    addOpen = false;
  }

  function handleConfigUpdate(e: CustomEvent<{ project: Project }>): void {
    configOpen = false;
  }

  function handleConfigActivate(e: CustomEvent<{ project: Project }>): void {
    configOpen = false;
  }

  function handleConfigDelete(e: CustomEvent<{ id: string }>): void {
    configOpen = false;
    selectedProject = null;
  }
</script>

<!-- Button con GestureButton base -->
<div
  class="proj-btn-wrapper"
  style:--gesture-btn-bg="hsl(217 91% 60% / 0.15)"
  style:--gesture-btn-bg-hover="hsl(217 91% 60% / 0.25)"
  style:--gesture-btn-bg-active="hsl(217 91% 60% / 0.35)"
  style:--gesture-btn-border-focus="var(--color-primary, #3b82f6)"
>
  <GestureButton
    {size}
    icon={currentIcon}
    label={currentLabel}
    {showLabel}
    {disabled}
    enableAdd={true}
    ariaLabel="Gestión de proyectos"
    on:select={handleGestureSelect}
    on:add={handleGestureAdd}
    on:config={handleGestureConfig}
  />
</div>

<!-- Panel Select (tap/click) -->
<SelectorPanel
  bind:open={selectorOpen}
  module="project-manager"
  on:select={handleSelectorSelect}
/>

<!-- Panel Add (doble tap/doble click) -->
<ProjectAddPanel
  bind:open={addOpen}
  on:save={handleAddSave}
/>

<!-- Panel Config (long press/click derecho) -->
<ProjectConfigPanel
  bind:open={configOpen}
  project={selectedProject}
  on:update={handleConfigUpdate}
  on:activate={handleConfigActivate}
  on:delete={handleConfigDelete}
/>

<style>
  .proj-btn-wrapper {
    display: contents;
  }
</style>
