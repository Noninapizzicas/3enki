<script lang="ts">
  /**
   * CartaPreviewPanel - Vista previa de la carta digital
   *
   * Muestra la carta tal como la ve el cliente, en un iframe
   * o renderizado directo. Permite cambiar entre vista móvil/desktop.
   */
  import { page } from '$app/stores';

  export let panelId: string = '';

  $: projectId = $page.params.project_id;
  $: previewUrl = `/${projectId}/carta`;

  let viewMode: 'mobile' | 'desktop' = 'mobile';
  let refreshKey = 0;

  function refresh() {
    refreshKey++;
  }
</script>

<div class="panel-body">
  <div class="toolbar">
    <div class="view-toggle">
      <button
        class="toggle-btn"
        class:active={viewMode === 'mobile'}
        on:click={() => viewMode = 'mobile'}
      >📱 Móvil</button>
      <button
        class="toggle-btn"
        class:active={viewMode === 'desktop'}
        on:click={() => viewMode = 'desktop'}
      >🖥️ Desktop</button>
    </div>
    <button class="btn-sm" on:click={refresh}>🔄 Refrescar</button>
  </div>

  <div class="preview-container" class:mobile={viewMode === 'mobile'}>
    {#key refreshKey}
      <iframe
        title="Vista previa carta digital"
        src={previewUrl}
        class="preview-frame"
        sandbox="allow-scripts allow-same-origin"
      ></iframe>
    {/key}
  </div>
</div>

<style>
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    height: 100%;
  }
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .view-toggle { display: flex; gap: 0.25rem; }
  .toggle-btn {
    padding: 0.3rem 0.5rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text-muted, #888);
    font-size: 0.7rem;
    cursor: pointer;
  }
  .toggle-btn.active {
    background: rgba(255,255,255,0.12);
    color: var(--color-text, #e5e5e5);
    border-color: var(--color-primary, #3b82f6);
  }
  .btn-sm {
    padding: 0.3rem 0.5rem;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.7rem;
    cursor: pointer;
  }
  .btn-sm:hover { background: rgba(255,255,255,0.12); }
  .preview-container {
    flex: 1;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 0.5rem;
    overflow: hidden;
    display: flex;
    justify-content: center;
    background: #1a1a1a;
  }
  .preview-container.mobile {
    max-width: 390px;
    margin: 0 auto;
    width: 100%;
  }
  .preview-frame {
    width: 100%;
    height: 100%;
    border: none;
    min-height: 400px;
  }
</style>
