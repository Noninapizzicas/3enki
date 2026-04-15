<script lang="ts">
  /**
   * CartaExportPanel — Exportar carta como PWA
   *
   * Dispara el agente cartadigital-pwa-builder publicando agent.execute.request.
   * El agente genera el paquete PWA (HTML + SW + manifest) y lo guarda.
   */
  import { page } from '$app/stores';
  import { publish } from '$lib/ui-core/mqtt';

  export let panelId: string = '';

  $: projectId = $page.params.project_id;

  let exporting = false;
  let error = '';
  let dispatched = false;

  async function handleExport() {
    exporting = true;
    error = '';
    dispatched = false;

    try {
      // Disparar agente pwa-builder
      await publish('agent.execute.request', {
        agentName: 'cartadigital-pwa-builder',
        context: { project_id: projectId },
        task: `Genera el paquete PWA exportable de la carta pública del proyecto "${projectId}".`
      });
      dispatched = true;
    } catch (err: any) {
      error = err.message || 'Error al iniciar exportación';
    } finally {
      exporting = false;
    }
  }
</script>

<div class="panel-body">
  <p class="info-text">
    El agente <strong>pwa-builder</strong> genera un paquete autónomo (HTML + service worker + manifest)
    desplegable en GitHub Pages, Netlify o cualquier hosting estático.
  </p>

  <button class="btn-action" on:click={handleExport} disabled={exporting}>
    {exporting ? 'Iniciando...' : 'Generar PWA'}
  </button>

  {#if dispatched}
    <div class="result">
      <span class="result-label">✓ Agente pwa-builder en marcha</span>
      <p class="result-text">
        El agente está trabajando. Cuando termine, el paquete estará disponible
        en <code>storage/pizzepos/pwa-export/</code> del proyecto.
      </p>
      <p class="result-text small">
        Consulta el chat para ver el progreso del agente.
      </p>
    </div>
  {/if}

  {#if error}
    <div class="error-msg">{error}</div>
  {/if}

  <div class="deploy-info">
    <span class="section-title">Cómo desplegar</span>
    <div class="deploy-section">
      <strong>GitHub Pages:</strong>
      <span class="deploy-step">1. Crea un repo público</span>
      <span class="deploy-step">2. Sube el contenido de <code>pwa-export/</code></span>
      <span class="deploy-step">3. Settings → Pages → branch main</span>
    </div>
    <div class="deploy-section">
      <strong>Netlify:</strong>
      <span class="deploy-step">1. Drag & drop de la carpeta <code>pwa-export/</code></span>
      <span class="deploy-step">2. Configura dominio si quieres</span>
    </div>
  </div>
</div>

<style>
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
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

  .result {
    display: flex; flex-direction: column; gap: 0.4rem;
    padding: 0.6rem;
    background: rgba(34,197,94,0.08);
    border: 1px solid rgba(34,197,94,0.25);
    border-radius: 0.375rem;
  }
  .result-label { font-size: 0.75rem; font-weight: 600; color: var(--color-success, #22c55e); }
  .result-text { margin: 0; font-size: 0.7rem; color: var(--color-text, #e5e5e5); line-height: 1.4; }
  .result-text.small { font-size: 0.65rem; color: var(--color-text-muted, #888); }
  .result-text code {
    padding: 0.05rem 0.25rem;
    background: rgba(255,255,255,0.05);
    border-radius: 0.15rem;
    font-size: 0.65rem;
  }

  .deploy-info {
    margin-top: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(255,255,255,0.08);
    display: flex; flex-direction: column; gap: 0.5rem;
  }
  .section-title {
    font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--color-text-muted, #888);
  }
  .deploy-section { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.7rem; }
  .deploy-section strong { color: var(--color-text, #e5e5e5); font-size: 0.7rem; }
  .deploy-step { color: var(--color-text-muted, #aaa); padding-left: 0.75rem; }
  .deploy-step code {
    padding: 0.05rem 0.25rem;
    background: rgba(255,255,255,0.05);
    border-radius: 0.15rem;
    font-size: 0.65rem;
  }

  .error-msg {
    padding: 0.4rem 0.5rem;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 0.375rem;
    color: var(--color-error, #ef4444); font-size: 0.75rem;
  }
</style>
