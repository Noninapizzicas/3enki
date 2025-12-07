<script lang="ts">
  /**
   * Página de Pruebas
   * Solo para probar componentes en desarrollo
   */
  import { ModelProviderSelector } from '$components/ai';

  let lastSelection: { provider: string; model: string } | null = null;

  function handleSelect(e: CustomEvent<{ provider: string; model: string }>) {
    lastSelection = e.detail;
    console.log('Selección:', lastSelection);
  }
</script>

<svelte:head>
  <title>Pruebas | Event Core</title>
</svelte:head>

<div class="pruebas">
  <header class="pruebas__header">
    <h1>Pruebas de Componentes</h1>
  </header>

  <main class="pruebas__content">
    <!-- ModelProviderSelector -->
    <section class="pruebas__section">
      <h2>ModelProviderSelector</h2>
      <p class="pruebas__desc">Selector de provider/modelo de IA</p>

      <div class="pruebas__component">
        <ModelProviderSelector on:select={handleSelect} />
      </div>

      {#if lastSelection}
        <div class="pruebas__output">
          <strong>Última selección:</strong>
          <code>{JSON.stringify(lastSelection)}</code>
        </div>
      {/if}
    </section>
  </main>
</div>

<style>
  .pruebas {
    min-height: 100vh;
    background: var(--color-bg, #f3f4f6);
  }

  .pruebas__header {
    padding: 1rem;
    background: var(--color-bg-surface, #fff);
    border-bottom: 1px solid var(--color-border, #e5e7eb);
  }

  .pruebas__header h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  .pruebas__content {
    padding: 1rem;
  }

  .pruebas__section {
    background: var(--color-bg-surface, #fff);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .pruebas__section h2 {
    margin: 0 0 0.25rem 0;
    font-size: 1rem;
  }

  .pruebas__desc {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    color: var(--color-text-muted, #6b7280);
  }

  .pruebas__component {
    border: 2px dashed var(--color-border, #e5e7eb);
    border-radius: 8px;
    padding: 1rem;
    background: var(--color-bg, #f9fafb);
  }

  .pruebas__output {
    margin-top: 1rem;
    padding: 0.75rem;
    background: var(--color-bg-muted, #f3f4f6);
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .pruebas__output code {
    display: block;
    margin-top: 0.25rem;
    font-family: monospace;
    color: var(--color-primary, #3b82f6);
  }
</style>
