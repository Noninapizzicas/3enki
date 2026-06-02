<script lang="ts">
  /**
   * CartasBrowser — catalogo de cartas + stats + buscador visual (Q2=A: filtro
   * client-side por substring del nombre). Solo lectura. El boton "Nueva carta"
   * pre-rellena el chat (Q4=A prompt abierto: el LLM decide ruta menu-generator
   * vs carta-manager; Q5=A frase canonica). Postura B.
   */

  import {
    sortedCartas,
    cartasStats,
    cartasLoading,
    cartasError
  } from '$lib/stores/carta-manager';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';
  import CartaCard from './CartaCard.svelte';

  export let onSelectCarta: (id: string) => void;

  let filterText = '';

  $: cartas = $sortedCartas;
  $: stats = $cartasStats;
  $: loading = $cartasLoading;
  $: error = $cartasError;

  $: filtered = filterText.trim()
    ? cartas.filter((c) => c.nombre.toLowerCase().includes(filterText.trim().toLowerCase()))
    : cartas;

  // por_estado es un Record dinamico (shape abierto): renderiza las entradas
  // que existan, ordenadas para estabilidad visual.
  $: estadoEntries = stats
    ? Object.entries(stats.por_estado).sort((a, b) => a[0].localeCompare(b[0]))
    : [];

  function handleNuevaCarta() {
    prefillChatInput('Crea una carta nueva: [describe nombre, productos, categorias].');
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
    <button class="nueva-btn" on:click={handleNuevaCarta} title="Pre-rellena el chat para crear una carta">
      + Nueva carta
    </button>
  </div>

  {#if error}
    <div class="error"><span>{error}</span></div>
  {/if}

  {#if loading}
    <div class="loading">Cargando...</div>
  {/if}

  {#if stats && stats.total > 0}
    <div class="stats-bar">
      <span>Total: <strong>{stats.total}</strong></span>
      {#each estadoEntries as [estado, n]}
        {#if estado !== 'sin_estado'}
          <span>{estado}: <strong>{n}</strong></span>
        {/if}
      {/each}
    </div>
  {/if}

  <div class="content">
    {#if cartas.length === 0 && !loading}
      <div class="empty">
        <p>No hay cartas todavia.</p>
        <button class="cta-btn" on:click={handleNuevaCarta}>Crea tu primera carta</button>
        <p class="hint">El boton pre-rellena el chat — describe la carta y el agente la crea.</p>
      </div>
    {:else if filtered.length === 0}
      <div class="empty">
        <p>Ninguna carta coincide con "{filterText}".</p>
      </div>
    {:else}
      <div class="cartas-list">
        {#each filtered as carta (carta.id)}
          <CartaCard {carta} onClick={onSelectCarta} />
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
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.15);
    color: rgba(248, 113, 113, 1);
    font-size: 12px;
    border-bottom: 1px solid rgba(239, 68, 68, 0.3);
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

  .content { flex: 1; overflow-y: auto; padding: 12px; }

  .empty { text-align: center; padding: 32px 16px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .empty .hint { font-size: 12px; margin-top: 8px; opacity: 0.7; }
  .cta-btn {
    margin-top: 12px;
    padding: 8px 16px;
    background: rgba(96, 165, 250, 0.15);
    border: 1px solid rgba(96, 165, 250, 0.4);
    border-radius: 6px;
    color: var(--accent-color, rgba(96, 165, 250, 1));
    cursor: pointer;
    font-size: 13px;
  }
  .cta-btn:hover { background: rgba(96, 165, 250, 0.25); }

  .cartas-list { display: flex; flex-direction: column; gap: 6px; }
</style>
