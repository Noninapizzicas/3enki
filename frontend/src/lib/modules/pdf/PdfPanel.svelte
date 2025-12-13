<script lang="ts">
  /**
   * PdfPanel - Visor de PDF
   *
   * Features:
   * - Cargar PDF desde archivo
   * - Vista previa básica
   * - Adjuntar al chat
   */

  import { addAttachment } from '$lib/stores';
  import { closePanel } from '$lib/stores/ui';

  export let panelId: string;

  interface PdfFile {
    name: string;
    size: number;
    url: string;
    pageCount?: number;
  }

  let currentPdf: PdfFile | null = null;
  let fileInput: HTMLInputElement;
  let loading = false;
  let error: string | null = null;

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    if (file.type !== 'application/pdf') {
      error = 'Solo se permiten archivos PDF';
      return;
    }

    error = null;
    loading = true;

    // Crear URL para el PDF
    const url = URL.createObjectURL(file);

    currentPdf = {
      name: file.name,
      size: file.size,
      url
    };

    loading = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];

    if (file?.type === 'application/pdf') {
      const url = URL.createObjectURL(file);
      currentPdf = {
        name: file.name,
        size: file.size,
        url
      };
      error = null;
    } else {
      error = 'Solo se permiten archivos PDF';
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  function handleAttach() {
    if (!currentPdf) return;

    addAttachment({
      id: crypto.randomUUID(),
      name: currentPdf.name,
      type: 'application/pdf',
      path: currentPdf.url,
      size: currentPdf.size
    });

    closePanel();
  }

  function handleClear() {
    if (currentPdf?.url) {
      URL.revokeObjectURL(currentPdf.url);
    }
    currentPdf = null;
    error = null;
  }

  function triggerFileInput() {
    fileInput.click();
  }
</script>

<div class="pdf-panel">
  <input
    type="file"
    accept="application/pdf"
    bind:this={fileInput}
    on:change={handleFileSelect}
    hidden
  />

  {#if !currentPdf}
    <button
      class="drop-zone"
      on:click={triggerFileInput}
      on:drop={handleDrop}
      on:dragover={handleDragOver}
    >
      <span class="drop-icon">📕</span>
      <span class="drop-text">Arrastra un PDF aquí</span>
      <span class="drop-hint">o haz clic para seleccionar</span>
    </button>
  {:else}
    <div class="pdf-preview">
      <div class="pdf-header">
        <span class="pdf-icon">📕</span>
        <div class="pdf-info">
          <span class="pdf-name">{currentPdf.name}</span>
          <span class="pdf-size">{formatSize(currentPdf.size)}</span>
        </div>
        <button class="clear-btn" on:click={handleClear} title="Quitar">
          ✕
        </button>
      </div>

      <div class="pdf-viewer">
        <iframe
          src={currentPdf.url}
          title={currentPdf.name}
          class="pdf-iframe"
        ></iframe>
      </div>
    </div>
  {/if}

  {#if error}
    <div class="error">{error}</div>
  {/if}

  <div class="actions">
    <button
      class="attach-btn"
      on:click={handleAttach}
      disabled={!currentPdf}
    >
      📎 Adjuntar al chat
    </button>
  </div>
</div>

<style>
  .pdf-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.75rem;
  }

  .drop-zone {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.03));
    border: 2px dashed var(--color-border, rgba(255, 255, 255, 0.2));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .drop-zone:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.05));
    border-color: var(--color-primary, #3b82f6);
  }

  .drop-icon {
    font-size: 3rem;
    opacity: 0.5;
  }

  .drop-text {
    font-size: 1rem;
    color: var(--color-text, #e5e5e5);
  }

  .drop-hint {
    font-size: 0.875rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .pdf-preview {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
  }

  .pdf-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border-radius: 0.375rem;
  }

  .pdf-icon {
    font-size: 1.5rem;
  }

  .pdf-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .pdf-name {
    font-weight: 500;
    color: var(--color-text, #e5e5e5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pdf-size {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .clear-btn {
    padding: 0.375rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    color: var(--color-text-muted, #a3a3a3);
    cursor: pointer;
    transition: all 0.15s;
  }

  .clear-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
    color: var(--color-text, #e5e5e5);
  }

  .pdf-viewer {
    flex: 1;
    border-radius: 0.375rem;
    overflow: hidden;
    background: var(--color-bg, #0a0a0a);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .pdf-iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  .error {
    padding: 0.5rem 0.75rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.375rem;
    color: #ef4444;
    font-size: 0.875rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .attach-btn {
    padding: 0.625rem 1rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .attach-btn:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .attach-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
