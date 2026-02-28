<script lang="ts">
  /**
   * /{project_id}/facturas — Facturas del proyecto
   *
   * Ruta project-scoped. El project_id viene de la URL.
   */
  import { getContext } from 'svelte';
  import { AppShell } from '$lib/components/layout';
  import { FacturasPanel } from '$lib/modules/facturas';

  const projectStore = getContext<any>('project');
</script>

<svelte:head>
  <title>Facturas</title>
</svelte:head>

<AppShell>
  <div slot="content" class="facturas-page">
    {#if $projectStore}
      <header class="page-header">
        <h1>
          <span class="project-name">{$projectStore.name}</span>
          <span class="separator">/</span>
          <span class="page-title">Facturas</span>
        </h1>
      </header>
      <div class="panel-container">
        <FacturasPanel panelId="facturas-main" />
      </div>
    {:else}
      <div class="loading">Cargando proyecto...</div>
    {/if}
  </div>
</AppShell>

<style>
  .facturas-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg, #121212);
  }

  .page-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .page-header h1 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
  }

  .separator {
    color: var(--color-text-muted, #888);
    font-weight: 400;
  }

  .page-title {
    color: var(--color-text-muted, #888);
    font-weight: 400;
  }

  .panel-container {
    flex: 1;
    overflow: hidden;
    padding: 1rem 1.5rem;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted, #888);
  }
</style>
