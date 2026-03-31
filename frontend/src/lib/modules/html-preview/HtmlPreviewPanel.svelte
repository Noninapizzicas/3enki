<script lang="ts">
  /**
   * HtmlPreviewPanel - Previsualización de HTML generado por el backend
   *
   * Muestra cualquier HTML en un iframe srcdoc (sin servidor necesario).
   * Botones: Imprimir (Ctrl+P nativo del navegador) y Descargar.
   *
   * Uso genérico: cualquier módulo puede llamar a showHtmlPreview()
   * para mostrar HTML con este panel.
   */

  import { htmlPreviewStore } from '$lib/stores/html-preview';

  export let panelId: string = '';

  let iframeEl: HTMLIFrameElement;

  $: state = $htmlPreviewStore;

  function handlePrint() {
    if (iframeEl?.contentWindow) {
      iframeEl.contentWindow.focus();
      iframeEl.contentWindow.print();
    }
  }

  function handleDownload() {
    const blob = new Blob([state.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.filename || 'documento.html';
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="preview-panel">
  <!-- Barra de herramientas -->
  <div class="toolbar">
    <span class="title">{state.title || 'Vista previa'}</span>
    <div class="actions">
      <button class="btn btn-primary" on:click={handlePrint} title="Imprimir / Exportar PDF">
        🖨️ Imprimir
      </button>
      <button class="btn btn-secondary" on:click={handleDownload} title="Descargar HTML">
        ⬇️ Descargar
      </button>
    </div>
  </div>

  <!-- Vista previa -->
  <div class="iframe-wrapper">
    {#if state.html}
      <iframe
        bind:this={iframeEl}
        class="preview-iframe"
        title="Vista previa de carta"
        srcdoc={state.html}
        sandbox="allow-same-origin allow-modals allow-popups"
      ></iframe>
    {:else}
      <div class="empty-state">
        <span class="empty-icon">📄</span>
        <p>Usa <strong>design.save</strong> en el chat para generar una carta de impresión profesional.</p>
      </div>
    {/if}
  </div>

  <!-- Nota de ayuda -->
  {#if state.html}
    <div class="hint">
      Haz clic en <strong>Imprimir</strong> para exportar a PDF con Ctrl+P → Guardar como PDF.
    </div>
  {/if}
</div>

<style>
  .preview-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-surface, #1e1e1e);
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--color-border, #333);
    flex-shrink: 0;
    gap: 0.5rem;
  }

  .title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.75rem;
    border: none;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
  }

  .btn:hover {
    opacity: 0.85;
  }

  .btn-primary {
    background: var(--color-accent, #5b6af0);
    color: #fff;
  }

  .btn-secondary {
    background: var(--color-surface-2, #2a2a2a);
    color: var(--color-text, #e5e5e5);
    border: 1px solid var(--color-border, #444);
  }

  .iframe-wrapper {
    flex: 1;
    min-height: 0;
    background: #f0f0f0;
    overflow: hidden;
  }

  .preview-iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.75rem;
    color: var(--color-text-muted, #888);
    text-align: center;
    padding: 2rem;
  }

  .empty-icon {
    font-size: 2.5rem;
  }

  .empty-state p {
    font-size: 0.9rem;
    max-width: 24rem;
    line-height: 1.5;
  }

  .hint {
    padding: 0.4rem 0.75rem;
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
    border-top: 1px solid var(--color-border, #333);
    flex-shrink: 0;
    text-align: center;
  }
</style>
