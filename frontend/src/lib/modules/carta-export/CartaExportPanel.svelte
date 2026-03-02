<script lang="ts">
  /**
   * CartaExportPanel - Exportar carta digital como sitio estático
   *
   * Usa el backend real:
   *   mqttRequest('carta-digital', 'export-static', { project_id, carta_id? })
   *
   * El backend genera: index.html, sw.js, manifest.json + copia imágenes
   * en storage/pizzepos/carta-static/{slug}/
   */
  import { page } from '$app/stores';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let panelId: string = '';

  $: projectId = $page.params.project_id;

  let exporting = false;
  let result: any = null;
  let error = '';

  async function handleExport() {
    exporting = true;
    error = '';
    result = null;

    try {
      const res = await mqttRequest<any>('carta-digital', 'export-static', {
        project_id: projectId
      }, { timeout: 30000 });
      result = res.data || res;
    } catch (err: any) {
      error = err.message || 'Error al exportar';
    } finally {
      exporting = false;
    }
  }
</script>

<div class="panel-body">
  <p class="info-text">
    Genera un sitio estático auto-contenido (HTML + CSS + JS inline).
    Listo para GitHub Pages, Netlify, o cualquier hosting.
  </p>

  <button class="btn-action" on:click={handleExport} disabled={exporting}>
    {exporting ? 'Exportando...' : 'Exportar carta estática'}
  </button>

  {#if result}
    <div class="result">
      <span class="result-label">Exportación completada</span>
      <div class="result-detail">
        <span class="result-line">{result.productos} productos, {result.categorias} categorías</span>
        {#if result.images_copied > 0}
          <span class="result-line">{result.images_copied} imágenes copiadas</span>
        {/if}
        <span class="result-path">{result.output_dir}</span>
      </div>

      {#if result.deploy_instructions}
        <div class="deploy-section">
          <span class="section-title">GitHub Pages</span>
          {#each result.deploy_instructions.github_pages || [] as step}
            <span class="deploy-step">{step}</span>
          {/each}
        </div>
        <div class="deploy-section">
          <span class="section-title">Netlify</span>
          {#each result.deploy_instructions.netlify || [] as step}
            <span class="deploy-step">{step}</span>
          {/each}
        </div>
      {/if}
    </div>
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
  .info-text { font-size: 0.75rem; color: var(--color-text-muted, #888); line-height: 1.4; }
  .btn-action {
    padding: 0.6rem 0.75rem;
    background: var(--color-primary, #3b82f6);
    border: none; border-radius: 0.375rem;
    color: white; font-size: 0.8rem; font-weight: 600; cursor: pointer;
  }
  .btn-action:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
  .result { display: flex; flex-direction: column; gap: 0.5rem; }
  .result-label { font-size: 0.75rem; font-weight: 600; color: var(--color-success, #22c55e); }
  .result-detail { display: flex; flex-direction: column; gap: 0.15rem; }
  .result-line { font-size: 0.7rem; color: var(--color-text, #e5e5e5); }
  .result-path { font-size: 0.65rem; color: var(--color-text-muted, #888); font-family: monospace; word-break: break-all; }
  .deploy-section { display: flex; flex-direction: column; gap: 0.2rem; }
  .section-title {
    font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--color-text-muted, #888);
  }
  .deploy-step { font-size: 0.7rem; color: var(--color-text, #e5e5e5); padding-left: 0.5rem; }
  .error-msg {
    padding: 0.4rem 0.5rem;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 0.375rem;
    color: var(--color-error, #ef4444); font-size: 0.75rem;
  }
</style>
