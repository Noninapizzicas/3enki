<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    colaImpresionStore,
    initColaImpresion,
    initColaImpresionSubscriptions,
    buscarModelos
  } from '$lib/stores/cola-impresion';

  let query = '';
  let cleanup: (() => void) | null = null;

  onMount(async () => {
    await initColaImpresion();
    cleanup = initColaImpresionSubscriptions();
  });

  onDestroy(() => {
    if (cleanup) cleanup();
  });

  async function onBuscar() {
    await buscarModelos(query);
  }
</script>

<div class="panel-buscador">
  <header class="cabecera">
    <h2>🔍 Buscador de Modelos 3D</h2>
    {#if $colaImpresionStore.loading}
      <span class="badge">cargando…</span>
    {/if}
  </header>

  {#if $colaImpresionStore.error}
    <div class="error">⚠ {$colaImpresionStore.error}</div>
  {/if}

  <!-- Búsqueda -->
  <section class="seccion">
    <h3>Buscar en la web</h3>
    <div class="fila">
      <input
        type="text"
        placeholder="conector 90 grados, soporte para estantería…"
        bind:value={query}
        on:keydown={(e) => { if (e.key === 'Enter') onBuscar(); }}
      />
      <button on:click={onBuscar} disabled={!query.trim() || $colaImpresionStore.buscando}>
        {$colaImpresionStore.buscando ? 'Buscando…' : 'Buscar'}
      </button>
    </div>
  </section>

  <!-- Resultados -->
  <section class="seccion">
    <h3>Resultados</h3>
    {#if $colaImpresionStore.buscando}
      <p class="vacio">Buscando en thingiverse y cults3d…</p>
    {:else if $colaImpresionStore.busqueda}
      <p class="meta">
        {$colaImpresionStore.busqueda.total} resultados para «{$colaImpresionStore.busqueda.query}»
      </p>
      {#if $colaImpresionStore.busqueda.resultados.length === 0}
        <p class="vacio">Sin resultados.</p>
      {:else}
        <ul class="lista">
          {#each $colaImpresionStore.busqueda.resultados as r (r.url)}
            <li class="resultado">
              <a href={r.url} target="_blank" rel="noopener">{r.titulo}</a>
              <span class="badge">{r.fuente}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <p class="vacio">Busca un modelo para empezar.</p>
    {/if}
  </section>
</div>

<style>
  .panel-buscador { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
  .cabecera { display: flex; align-items: center; justify-content: space-between; }
  .cabecera h2 { margin: 0; font-size: 1.1rem; }
  .seccion { border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.75rem; }
  .seccion h3 { margin: 0 0 0.5rem; font-size: 0.9rem; color: var(--color-text-muted, #aaa); }
  .fila { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .fila input { flex: 1; min-width: 200px; padding: 0.4rem; border-radius: 6px; border: 1px solid var(--color-border, #444); background: var(--color-bg-input, #1a1a1a); color: inherit; }
  button { padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid var(--color-border, #444); background: var(--color-accent, #2563eb); color: #fff; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .error { background: rgba(220,38,38,.15); border: 1px solid #dc2626; color: #fca5a5; padding: 0.5rem; border-radius: 6px; }
  .meta { color: var(--color-text-muted, #888); font-size: 0.8rem; }
  .badge { background: var(--color-badge, #333); border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.75rem; }
  .vacio { color: var(--color-text-muted, #888); font-style: italic; }
  .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .resultado { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem; border-radius: 6px; background: var(--color-bg-item, #1a1a1a); }
  .resultado a { flex: 1; color: var(--color-accent, #2563eb); text-decoration: none; }
  .resultado a:hover { text-decoration: underline; }
</style>
