<script lang="ts">
  /**
   * RecetasBrowser — lista de recetas + stats + buscador visual (Q1=A: filtro
   * client-side por substring del nombre). Solo lectura. El boton "Nueva
   * receta" pre-rellena el chat input (Postura B: la mutacion la hace el chat).
   */

  import {
    sortedRecetas,
    recetasStats,
    recetasLoading,
    recetasError,
    clearError
  } from '$lib/stores/recetas';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';
  import RecetasCard from './RecetasCard.svelte';

  export let onSelectReceta: (id: string) => void;

  let filterText = '';

  $: recetas = $sortedRecetas;
  $: stats = $recetasStats;
  $: loading = $recetasLoading;
  $: error = $recetasError;

  $: filtered = filterText.trim()
    ? recetas.filter(r => r.nombre.toLowerCase().includes(filterText.trim().toLowerCase()))
    : recetas;

  function handleNuevaReceta() {
    prefillChatInput('Crea una receta nueva: [describe nombre, ingredientes, pasos].');
  }
</script>

<div class="browser">
  <div class="browser-header">
    <div class="search-wrap">
      <input
        type="text"
        class="search-input"
        placeholder="Filtrar por nombre..."
        bind:value={filterText}
      />
    </div>
    <button class="nueva-btn" on:click={handleNuevaReceta} title="Pre-rellena el chat para crear una receta">
      + Nueva receta
    </button>
  </div>

  {#if error}
    <div class="error">
      <span>{error}</span>
      <button on:click={clearError}>×</button>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Cargando...</div>
  {/if}

  {#if stats}
    <div class="stats-bar">
      <span>En servicio: <strong>{stats.por_estado.en_servicio}</strong></span>
      <span>Borrador: <strong>{stats.por_estado.borrador}</strong></span>
      <span>Archivadas: <strong>{stats.por_estado.archivada}</strong></span>
      {#if stats.incompletas > 0}
        <span class="warn">Incompletas: <strong>{stats.incompletas}</strong></span>
      {/if}
    </div>
  {/if}

  <div class="content">
    {#if recetas.length === 0 && !loading}
      <div class="empty">
        <p>No hay recetas todavia.</p>
        <p class="hint">
          Usa el chat para crear recetas. Por ejemplo:<br>
          <em>"Investiga una receta de carbonara y guardala como borrador"</em>
        </p>
      </div>
    {:else if filtered.length === 0}
      <div class="empty">
        <p>Ninguna receta coincide con "{filterText}".</p>
      </div>
    {:else}
      <div class="recetas-list">
        {#each filtered as receta (receta.id)}
          <RecetasCard {receta} onClick={onSelectReceta} />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .browser {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .browser-header {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color, #333);
    flex-shrink: 0;
  }
  .search-wrap { flex: 1; }
  .search-input {
    width: 100%;
    padding: 6px 10px;
    background: var(--color-surface, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    font-size: 12px;
  }
  .search-input:focus {
    outline: none;
    border-color: var(--accent-color, rgba(96, 165, 250, 1));
  }
  .nueva-btn {
    padding: 6px 12px;
    background: rgba(96, 165, 250, 0.15);
    border: 1px solid rgba(96, 165, 250, 0.4);
    border-radius: 6px;
    color: var(--accent-color, rgba(96, 165, 250, 1));
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
    transition: all 0.15s;
  }
  .nueva-btn:hover { background: rgba(96, 165, 250, 0.25); }

  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.15);
    color: rgba(248, 113, 113, 1);
    font-size: 12px;
    border-bottom: 1px solid rgba(239, 68, 68, 0.3);
  }
  .error button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 16px;
  }

  .loading { padding: 12px; text-align: center; color: var(--text-secondary, rgba(161, 161, 170, 1)); font-size: 12px; }

  .stats-bar {
    display: flex;
    gap: 16px;
    padding: 8px 12px;
    background: rgba(96, 165, 250, 0.08);
    font-size: 12px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    flex-wrap: wrap;
    flex-shrink: 0;
  }
  .stats-bar strong { color: var(--text-primary, rgba(228, 228, 231, 1)); margin-left: 4px; }
  .stats-bar .warn strong { color: rgba(245, 158, 11, 1); }

  .content { flex: 1; overflow-y: auto; padding: 12px; }

  .empty { text-align: center; padding: 32px 16px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .empty .hint { font-size: 12px; margin-top: 8px; opacity: 0.7; }

  .recetas-list { display: flex; flex-direction: column; gap: 6px; }
</style>
