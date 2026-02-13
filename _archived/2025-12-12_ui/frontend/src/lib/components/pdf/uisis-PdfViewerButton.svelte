<!--
  PdfViewerButton.svelte
  ======================
  Botón unificado para visor de PDF con DOBLE interacción.
  Usa GestureButton como base para el manejo de gestos.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre el visor PDF con el archivo actual (si hay)
  - Long press / Click derecho: Abre PdfViewerConfigPanel (zoom, extraer)

  pdf-viewer usa enableAdd=false (PDFs son externos, no se crean).

  Skinnable via CSS Variables:
  --gesture-btn-bg, --gesture-btn-bg-hover, --gesture-btn-bg-active

  Uso:
    <PdfViewerButton
      size="md"
      {file}
      {projectId}
      on:openViewer={handleOpenViewer}
      on:config={handleConfig}
    />

  @version 2.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { GestureButton } from '$components/ui';
  import PdfViewerPanel from './uisis-PdfViewerPanel.svelte';
  import PdfViewerConfigPanel from './uisis-PdfViewerConfigPanel.svelte';
  import type { PdfFile } from './uisis-PdfViewerPanel.svelte';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón */
  export let size: Size = 'md';

  /** Archivo PDF actualmente abierto */
  export let file: PdfFile | null = null;

  /** Project ID */
  export let projectId: string | null = null;

  /** Mostrar label */
  export let showLabel = true;

  /** Deshabilitar */
  export let disabled = false;

  // ============================================================================
  // STATE
  // ============================================================================

  let viewerOpen = false;
  let configOpen = false;
  let zoom = 100;

  const currentIcon = '📕';
  const currentLabel = 'PDF';

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: hasFile = file !== null;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    openViewer: { file: PdfFile | null };
    config: void;
    extractText: { text: string };
  }>();

  // ============================================================================
  // GESTURE HANDLERS
  // ============================================================================

  function handleGestureSelect(): void {
    viewerOpen = true;
    dispatch('openViewer', { file });
  }

  function handleGestureConfig(): void {
    configOpen = true;
    dispatch('config');
  }

  // ============================================================================
  // PANEL HANDLERS
  // ============================================================================

  function handleZoomChange(e: CustomEvent<{ zoom: number }>): void {
    zoom = e.detail.zoom;
  }

  function handleExtractText(e: CustomEvent<{ text: string }>): void {
    dispatch('extractText', { text: e.detail.text });
  }

  // ============================================================================
  // PUBLIC METHOD
  // ============================================================================

  /** Open viewer with a specific file */
  export function openWithFile(fileToOpen: PdfFile): void {
    file = fileToOpen;
    viewerOpen = true;
  }
</script>

<!-- Button con GestureButton base -->
<div
  class="pdf-btn-wrapper"
  class:pdf-btn-wrapper--active={hasFile}
  style:--gesture-btn-bg="hsl(0 70% 50% / 0.15)"
  style:--gesture-btn-bg-hover="hsl(0 70% 50% / 0.25)"
  style:--gesture-btn-bg-active="hsl(0 70% 50% / 0.35)"
  style:--gesture-btn-border-focus="hsl(0 70% 50%)"
>
  <GestureButton
    {size}
    icon={currentIcon}
    label={currentLabel}
    {showLabel}
    {disabled}
    enableAdd={false}
    ariaLabel="Visor de PDF"
    on:select={handleGestureSelect}
    on:config={handleGestureConfig}
  />
  {#if hasFile}
    <span class="pdf-btn__indicator" />
  {/if}
</div>

<!-- Viewer Panel -->
<PdfViewerPanel
  bind:open={viewerOpen}
  {file}
  {projectId}
/>

<!-- Config Panel -->
<PdfViewerConfigPanel
  bind:open={configOpen}
  file={file ? { name: file.name, path: file.path, size: file.size } : null}
  {projectId}
  bind:zoom
  on:zoomChange={handleZoomChange}
  on:extractText={handleExtractText}
/>

<style>
  .pdf-btn-wrapper {
    position: relative;
    display: contents;
  }

  .pdf-btn-wrapper--active :global(.gesture-btn) {
    --gesture-btn-bg: hsl(0 70% 50% / 0.25);
    border-color: hsl(0 70% 50% / 0.3);
  }

  /* === FILE INDICATOR === */
  .pdf-btn__indicator {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    background: hsl(0 70% 50%);
    border-radius: 50%;
    pointer-events: none;
  }
</style>
