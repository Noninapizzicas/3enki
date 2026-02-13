<!--
  PdfViewerPanel.svelte
  =====================
  Panel de visualización de PDFs.

  Características:
  - Visualización de PDF mediante iframe/embed
  - Controles de navegación (página anterior/siguiente)
  - Control de zoom
  - Extracción de texto (para trabajar con la IA)

  Skinnable via CSS Variables:
  --pdf-viewer-bg, --pdf-viewer-color

  Uso:
    <PdfViewerPanel
      bind:open
      {file}
      {projectId}
      on:close={handleClose}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { FloatingPanel } from '$components/feedback';
  import { api } from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  export interface PdfFile {
    name: string;
    path: string;
    type?: 'file' | 'directory';
    size?: number;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel open state */
  export let open = false;

  /** PDF file to view */
  export let file: PdfFile | null = null;

  /** Project ID */
  export let projectId: string | null = null;

  // ============================================================================
  // STATE
  // ============================================================================

  let zoom = 100;
  let loading = true;
  let error = '';
  let pdfUrl = '';

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  // ============================================================================
  // COMPUTED
  // ============================================================================

  // Build PDF URL when file/project changes
  $: if (open && file && projectId) {
    buildPdfUrl();
  }

  // ============================================================================
  // METHODS
  // ============================================================================

  function buildPdfUrl(): void {
    if (!file || !projectId) {
      pdfUrl = '';
      return;
    }

    const params = new URLSearchParams({
      project_id: projectId,
      file_path: file.path
    });

    pdfUrl = api.moduleApi('pdf-viewer', `/pdf/view?${params}`);
    loading = true;
    error = '';
  }

  function handleIframeLoad(): void {
    loading = false;
  }

  function handleIframeError(): void {
    loading = false;
    error = 'Error al cargar el PDF';
  }

  function handleZoomIn(): void {
    zoom = Math.min(400, zoom + 25);
  }

  function handleZoomOut(): void {
    zoom = Math.max(25, zoom - 25);
  }

  function handleZoomReset(): void {
    zoom = 100;
  }

  function handleClose(): void {
    dispatch('close');
    open = false;
  }
</script>

<FloatingPanel bind:open on:close={handleClose} size="large">
  <div class="pdf-viewer">
    <!-- Header -->
    <header class="pdf-viewer__header">
      <div class="pdf-viewer__file-info">
        <span class="pdf-viewer__file-icon">📕</span>
        <span class="pdf-viewer__file-name">{file?.name || 'Sin archivo'}</span>
      </div>

      <div class="pdf-viewer__controls">
        <!-- Zoom controls -->
        <div class="pdf-viewer__zoom">
          <button
            type="button"
            class="pdf-viewer__zoom-btn"
            on:click={handleZoomOut}
            disabled={zoom <= 25}
            title="Reducir"
          >
            −
          </button>
          <button
            type="button"
            class="pdf-viewer__zoom-value"
            on:click={handleZoomReset}
            title="Restablecer zoom"
          >
            {zoom}%
          </button>
          <button
            type="button"
            class="pdf-viewer__zoom-btn"
            on:click={handleZoomIn}
            disabled={zoom >= 400}
            title="Ampliar"
          >
            +
          </button>
        </div>

        <button
          type="button"
          class="pdf-viewer__btn pdf-viewer__btn--close"
          on:click={handleClose}
          title="Cerrar"
        >
          ✕
        </button>
      </div>
    </header>

    <!-- PDF Content -->
    <div class="pdf-viewer__body">
      {#if !file || !projectId}
        <div class="pdf-viewer__state">
          <span class="pdf-viewer__state-icon">📕</span>
          <span>Selecciona un archivo PDF</span>
        </div>

      {:else if error}
        <div class="pdf-viewer__state pdf-viewer__state--error">
          <span class="pdf-viewer__state-icon">⚠️</span>
          <span>{error}</span>
          <button class="pdf-viewer__retry" on:click={buildPdfUrl}>
            Reintentar
          </button>
        </div>

      {:else}
        {#if loading}
          <div class="pdf-viewer__loading">
            <div class="spinner" />
            <span>Cargando PDF...</span>
          </div>
        {/if}

        <div
          class="pdf-viewer__container"
          style:transform="scale({zoom / 100})"
          style:transform-origin="top center"
        >
          <!--
            Using embed/object for PDF viewing.
            Note: For better PDF viewing, consider using pdf.js library
          -->
          <embed
            src={pdfUrl}
            type="application/pdf"
            class="pdf-viewer__embed"
            on:load={handleIframeLoad}
            on:error={handleIframeError}
          />
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <footer class="pdf-viewer__footer">
      <span class="pdf-viewer__path">{file?.path || ''}</span>
      <span class="pdf-viewer__hint">
        Usa los controles de zoom o desplázate
      </span>
    </footer>
  </div>
</FloatingPanel>

<style>
  .pdf-viewer {
    display: flex;
    flex-direction: column;
    width: 85vw;
    max-width: 1000px;
    height: 80vh;
    max-height: 700px;
    background: var(--pdf-viewer-bg, var(--color-bg-card, #1a1d24));
    color: var(--pdf-viewer-color, var(--color-text, #ffffff));
  }

  /* Header */
  .pdf-viewer__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--color-bg-elevated, #232830);
    border-bottom: 1px solid var(--color-border, #2e3440);
    flex-shrink: 0;
  }

  .pdf-viewer__file-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pdf-viewer__file-icon {
    font-size: 1.25rem;
  }

  .pdf-viewer__file-name {
    font-weight: 600;
    font-size: 0.9375rem;
  }

  .pdf-viewer__controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  /* Zoom controls */
  .pdf-viewer__zoom {
    display: flex;
    align-items: center;
    background: var(--color-bg-card, #1a1d24);
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
  }

  .pdf-viewer__zoom-btn,
  .pdf-viewer__zoom-value {
    padding: 0.375rem 0.625rem;
    background: transparent;
    color: var(--color-text, #ffffff);
    border: none;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .pdf-viewer__zoom-btn:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f3a);
  }

  .pdf-viewer__zoom-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pdf-viewer__zoom-value {
    min-width: 60px;
    text-align: center;
    font-weight: 500;
    border-left: 1px solid var(--color-border, #2e3440);
    border-right: 1px solid var(--color-border, #2e3440);
  }

  .pdf-viewer__zoom-value:hover {
    background: var(--color-bg-hover, #2a2f3a);
  }

  .pdf-viewer__btn {
    padding: 0.375rem 0.75rem;
    background: var(--color-bg-card, #1a1d24);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .pdf-viewer__btn:hover {
    background: var(--color-bg-hover, #2a2f3a);
  }

  .pdf-viewer__btn--close {
    width: 32px;
    padding: 0.375rem;
  }

  /* Body */
  .pdf-viewer__body {
    flex: 1;
    overflow: auto;
    position: relative;
    background: #4a4a4a;
  }

  .pdf-viewer__state,
  .pdf-viewer__loading {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: var(--color-bg-card, #1a1d24);
    color: var(--color-text-muted, #9ca3af);
  }

  .pdf-viewer__state--error {
    color: hsl(0 70% 65%);
  }

  .pdf-viewer__state-icon {
    font-size: 3rem;
    opacity: 0.5;
  }

  .pdf-viewer__retry {
    margin-top: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
  }

  /* PDF container */
  .pdf-viewer__container {
    min-height: 100%;
    display: flex;
    justify-content: center;
    padding: 1rem;
    transition: transform 150ms ease;
  }

  .pdf-viewer__embed {
    width: 100%;
    height: 100%;
    min-height: 500px;
    border: none;
    background: white;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  /* Footer */
  .pdf-viewer__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--color-bg-elevated, #232830);
    border-top: 1px solid var(--color-border, #2e3440);
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
    flex-shrink: 0;
  }

  .pdf-viewer__path {
    font-family: var(--font-mono, monospace);
    max-width: 50%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pdf-viewer__hint {
    opacity: 0.7;
  }

  /* Spinner */
  .spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid var(--color-border, #2e3440);
    border-top-color: hsl(0 70% 50%);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Responsive */
  @media (max-width: 640px) {
    .pdf-viewer {
      width: 95vw;
      height: 85vh;
    }

    .pdf-viewer__zoom {
      display: none;
    }
  }
</style>
