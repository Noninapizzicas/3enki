<script lang="ts">
  /**
   * CartaExportPanel - Exportar carta digital como sitio estático
   *
   * Genera un build estático para deploy en GitHub Pages, Netlify, etc.
   * TODO: conectar con backend de export.
   */
  import { page } from '$app/stores';

  export let panelId: string = '';

  $: projectId = $page.params.project_id;

  let target: 'github-pages' | 'netlify' | 'static-zip' = 'static-zip';
  let exporting = false;
  let exportResult = '';
  let error = '';

  async function handleExport() {
    exporting = true;
    error = '';
    exportResult = '';

    try {
      // TODO: mqttRequest para generar export
      await new Promise(r => setTimeout(r, 1000));
      exportResult = `Exportación completada para ${projectId} → ${target}`;
    } catch (err: any) {
      error = err.message || 'Error al exportar';
    } finally {
      exporting = false;
    }
  }
</script>

<div class="panel-body">
  <div class="form-group">
    <label class="form-label">Destino de exportación</label>
    <div class="target-options">
      <label class="radio-option" class:selected={target === 'static-zip'}>
        <input type="radio" bind:group={target} value="static-zip" />
        <span class="radio-icon">📦</span>
        <div class="radio-text">
          <span class="radio-label">ZIP estático</span>
          <span class="radio-desc">Descarga como archivo ZIP</span>
        </div>
      </label>
      <label class="radio-option" class:selected={target === 'github-pages'}>
        <input type="radio" bind:group={target} value="github-pages" />
        <span class="radio-icon">🐙</span>
        <div class="radio-text">
          <span class="radio-label">GitHub Pages</span>
          <span class="radio-desc">Deploy automático via GitHub Actions</span>
        </div>
      </label>
      <label class="radio-option" class:selected={target === 'netlify'}>
        <input type="radio" bind:group={target} value="netlify" />
        <span class="radio-icon">🌐</span>
        <div class="radio-text">
          <span class="radio-label">Netlify</span>
          <span class="radio-desc">Deploy con Netlify Drop</span>
        </div>
      </label>
    </div>
  </div>

  <button class="btn-action" on:click={handleExport} disabled={exporting}>
    {exporting ? 'Exportando...' : '📤 Exportar carta'}
  </button>

  {#if exportResult}
    <div class="success-msg">{exportResult}</div>
  {/if}

  {#if error}
    <div class="error-msg">{error}</div>
  {/if}
</div>

<style>
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.5rem;
  }
  .form-group { display: flex; flex-direction: column; gap: 0.3rem; }
  .form-label { font-size: 0.7rem; color: var(--color-text-muted, #888); font-weight: 500; }
  .target-options { display: flex; flex-direction: column; gap: 0.375rem; }
  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .radio-option:hover { background: rgba(255,255,255,0.06); }
  .radio-option.selected {
    background: rgba(59,130,246,0.08);
    border-color: var(--color-primary, #3b82f6);
  }
  .radio-option input[type="radio"] { display: none; }
  .radio-icon { font-size: 1.2rem; }
  .radio-text { display: flex; flex-direction: column; }
  .radio-label { font-size: 0.8rem; color: var(--color-text, #e5e5e5); font-weight: 500; }
  .radio-desc { font-size: 0.65rem; color: var(--color-text-muted, #888); }
  .btn-action {
    padding: 0.6rem 0.75rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-action:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
  .success-msg {
    padding: 0.4rem 0.5rem;
    background: rgba(34,197,94,0.1);
    border: 1px solid rgba(34,197,94,0.3);
    border-radius: 0.375rem;
    color: var(--color-success, #22c55e);
    font-size: 0.75rem;
  }
  .error-msg {
    padding: 0.4rem 0.5rem;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 0.375rem;
    color: var(--color-error, #ef4444);
    font-size: 0.75rem;
  }
</style>
