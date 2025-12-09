<!--
  PdfViewerConfigPanel.svelte
  ===========================
  Panel de configuración del visor PDF.

  Funcionalidades:
  - Control de zoom
  - Extraer texto del PDF
  - Ver metadata del PDF

  Skinnable via CSS Variables:
  --pdf-config-bg, --pdf-config-color

  Uso:
    <PdfViewerConfigPanel
      bind:open
      {file}
      {projectId}
      {zoom}
      on:zoomChange={handleZoomChange}
      on:extractText={handleExtractText}
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
    size?: number;
    pages?: number;
  }

  interface PdfMetadata {
    title?: string;
    author?: string;
    subject?: string;
    pages?: number;
    created?: string;
    modified?: string;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel open state */
  export let open = false;

  /** Current PDF file */
  export let file: PdfFile | null = null;

  /** Project ID */
  export let projectId: string | null = null;

  /** Current zoom level (percentage) */
  export let zoom = 100;

  // ============================================================================
  // STATE
  // ============================================================================

  let extracting = false;
  let extractedText = '';
  let showExtractedText = false;
  let loadingMetadata = false;
  let metadata: PdfMetadata | null = null;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    zoomChange: { zoom: number };
    extractText: { text: string; page?: number };
    close: void;
  }>();

  // ============================================================================
  // ZOOM PRESETS
  // ============================================================================

  const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];

  // ============================================================================
  // METHODS
  // ============================================================================

  /** Change zoom level */
  function setZoom(newZoom: number): void {
    zoom = Math.max(25, Math.min(400, newZoom));
    dispatch('zoomChange', { zoom });
  }

  /** Extract text from PDF */
  async function handleExtractText(page?: number): Promise<void> {
    if (!file || !projectId || extracting) return;

    extracting = true;
    extractedText = '';

    try {
      const params = new URLSearchParams({
        project_id: projectId,
        file_path: file.path
      });

      if (page !== undefined) {
        params.set('page', String(page));
      }

      const res = await fetch(api.moduleApi('pdf-viewer', `/pdf/extract-text?${params}`));

      if (!res.ok) {
        throw new Error('Error extrayendo texto');
      }

      const data = await res.json();
      extractedText = data.text || '';
      showExtractedText = true;

      dispatch('extractText', { text: extractedText, page });

    } catch (e) {
      extractedText = `Error: ${e instanceof Error ? e.message : 'desconocido'}`;
      showExtractedText = true;
    } finally {
      extracting = false;
    }
  }

  /** Load PDF metadata */
  async function loadMetadata(): Promise<void> {
    if (!file || !projectId || loadingMetadata) return;

    loadingMetadata = true;

    try {
      const params = new URLSearchParams({
        project_id: projectId,
        file_path: file.path
      });

      const res = await fetch(api.moduleApi('pdf-viewer', `/pdf/metadata?${params}`));

      if (!res.ok) throw new Error('Error cargando metadata');

      metadata = await res.json();

    } catch {
      metadata = null;
    } finally {
      loadingMetadata = false;
    }
  }

  /** Copy extracted text to clipboard */
  async function copyText(): Promise<void> {
    if (!extractedText) return;

    try {
      await navigator.clipboard.writeText(extractedText);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = extractedText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function handleClose(): void {
    dispatch('close');
    open = false;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  $: if (open && file && !metadata) {
    loadMetadata();
  }
</script>

<FloatingPanel bind:open title="📕 Visor PDF">
  <div class="config-panel">

    <!-- File info -->
    {#if file}
      <div class="config-panel__file">
        <span class="config-panel__file-icon">📕</span>
        <div class="config-panel__file-info">
          <span class="config-panel__file-name">{file.name}</span>
          <span class="config-panel__file-meta">
            {formatSize(file.size)}
            {#if metadata?.pages}
              • {metadata.pages} páginas
            {/if}
          </span>
        </div>
      </div>
    {/if}

    <!-- Zoom controls -->
    <div class="config-panel__section">
      <h4 class="config-panel__section-title">Zoom</h4>

      <div class="zoom-controls">
        <button
          type="button"
          class="zoom-btn"
          on:click={() => setZoom(zoom - 25)}
          disabled={zoom <= 25}
        >
          −
        </button>

        <div class="zoom-presets">
          {#each ZOOM_PRESETS as preset}
            <button
              type="button"
              class="zoom-preset"
              class:zoom-preset--active={zoom === preset}
              on:click={() => setZoom(preset)}
            >
              {preset}%
            </button>
          {/each}
        </div>

        <button
          type="button"
          class="zoom-btn"
          on:click={() => setZoom(zoom + 25)}
          disabled={zoom >= 400}
        >
          +
        </button>
      </div>

      <input
        type="range"
        class="zoom-slider"
        min="25"
        max="400"
        step="25"
        bind:value={zoom}
        on:change={() => dispatch('zoomChange', { zoom })}
      />
      <span class="zoom-value">{zoom}%</span>
    </div>

    <!-- Extract text -->
    <div class="config-panel__section">
      <h4 class="config-panel__section-title">Extraer Texto</h4>

      <button
        type="button"
        class="config-panel__action"
        on:click={() => handleExtractText()}
        disabled={extracting || !file}
      >
        {#if extracting}
          <span class="spinner-small" />
          Extrayendo...
        {:else}
          📋 Extraer todo el texto
        {/if}
      </button>

      {#if showExtractedText}
        <div class="extracted-text">
          <div class="extracted-text__header">
            <span>Texto extraído</span>
            <button
              type="button"
              class="extracted-text__copy"
              on:click={copyText}
              title="Copiar al portapapeles"
            >
              📋 Copiar
            </button>
          </div>
          <textarea
            class="extracted-text__content"
            readonly
            value={extractedText}
            rows="8"
          />
        </div>
      {/if}
    </div>

    <!-- Metadata -->
    {#if metadata}
      <div class="config-panel__section">
        <h4 class="config-panel__section-title">Información</h4>

        <div class="metadata-grid">
          {#if metadata.title}
            <div class="metadata-item">
              <span class="metadata-label">Título</span>
              <span class="metadata-value">{metadata.title}</span>
            </div>
          {/if}
          {#if metadata.author}
            <div class="metadata-item">
              <span class="metadata-label">Autor</span>
              <span class="metadata-value">{metadata.author}</span>
            </div>
          {/if}
          {#if metadata.pages}
            <div class="metadata-item">
              <span class="metadata-label">Páginas</span>
              <span class="metadata-value">{metadata.pages}</span>
            </div>
          {/if}
          {#if metadata.created}
            <div class="metadata-item">
              <span class="metadata-label">Creado</span>
              <span class="metadata-value">{new Date(metadata.created).toLocaleDateString()}</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Close -->
    <div class="config-panel__footer">
      <button
        type="button"
        class="config-panel__btn"
        on:click={handleClose}
      >
        Cerrar
      </button>
    </div>
  </div>
</FloatingPanel>

<style>
  .config-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    min-width: 320px;
    max-width: 400px;
  }

  /* File info */
  .config-panel__file {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--color-bg-elevated, #232830);
    border-radius: var(--radius-md, 8px);
  }

  .config-panel__file-icon {
    font-size: 2rem;
  }

  .config-panel__file-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    flex: 1;
  }

  .config-panel__file-name {
    font-weight: 600;
    color: var(--color-text, #ffffff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .config-panel__file-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
  }

  /* Section */
  .config-panel__section {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .config-panel__section-title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #9ca3af);
  }

  /* Zoom controls */
  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .zoom-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-sm, 6px);
    font-size: 1.25rem;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .zoom-btn:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f3a);
  }

  .zoom-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .zoom-presets {
    display: flex;
    gap: 0.25rem;
    flex: 1;
    justify-content: center;
  }

  .zoom-preset {
    padding: 0.25rem 0.5rem;
    background: transparent;
    color: var(--color-text-muted, #9ca3af);
    border: none;
    border-radius: var(--radius-sm, 6px);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .zoom-preset:hover {
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
  }

  .zoom-preset--active {
    background: hsl(0 70% 50% / 0.15);
    color: hsl(0 70% 65%);
  }

  .zoom-slider {
    width: 100%;
    accent-color: hsl(0 70% 50%);
  }

  .zoom-value {
    text-align: center;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text, #ffffff);
  }

  /* Action button */
  .config-panel__action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: hsl(0 70% 50% / 0.1);
    color: hsl(0 70% 65%);
    border: 1px solid hsl(0 70% 50% / 0.2);
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .config-panel__action:hover:not(:disabled) {
    background: hsl(0 70% 50% / 0.15);
  }

  .config-panel__action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Extracted text */
  .extracted-text {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .extracted-text__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8125rem;
    color: var(--color-text-muted, #9ca3af);
  }

  .extracted-text__copy {
    padding: 0.25rem 0.5rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-sm, 6px);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .extracted-text__copy:hover {
    background: var(--color-bg-hover, #2a2f3a);
  }

  .extracted-text__content {
    padding: 0.75rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    font-size: 0.8125rem;
    font-family: var(--font-mono, monospace);
    resize: vertical;
    min-height: 100px;
  }

  /* Metadata */
  .metadata-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .metadata-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem;
    background: var(--color-bg-elevated, #232830);
    border-radius: var(--radius-sm, 6px);
  }

  .metadata-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #9ca3af);
  }

  .metadata-value {
    font-size: 0.8125rem;
    color: var(--color-text, #ffffff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Footer */
  .config-panel__footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .config-panel__btn {
    padding: 0.5rem 1rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .config-panel__btn:hover {
    background: var(--color-bg-hover, #2a2f3a);
  }

  /* Spinner */
  .spinner-small {
    display: inline-block;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid var(--color-border, #2e3440);
    border-top-color: hsl(0 70% 50%);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
