<script lang="ts">
  /**
   * IngredientesBrowser — catalogo de ingredientes con precios. Solo lectura.
   * Buscador visual client-side (Q1=A). El boton "Actualizar precios en
   * bloque" pre-rellena el chat con la lista actual como contexto (Postura B).
   */

  import { recetasIngredientes } from '$lib/stores/recetas';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';
  import IngredienteCard from './IngredienteCard.svelte';

  export let onSelectIngrediente: (nombre: string) => void;

  let filterText = '';

  $: ingredientes = $recetasIngredientes;
  $: filtered = filterText.trim()
    ? ingredientes.filter(i => i.nombre.toLowerCase().includes(filterText.trim().toLowerCase()))
    : ingredientes;

  function handleBulkPrecios() {
    const lista = ingredientes
      .map(i => {
        const precio = typeof i.precio_mercado === 'number'
          ? ` (${i.precio_mercado.toFixed(3)}€${i.unidad ? '/' + i.unidad : ''})`
          : '';
        return `${i.nombre}${precio}`;
      })
      .join(', ');
    prefillChatInput(`Actualiza estos precios: ${lista}.`);
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
    <button class="bulk-btn" on:click={handleBulkPrecios} title="Pre-rellena el chat para actualizar precios en bloque">
      Actualizar precios en bloque
    </button>
  </div>

  <div class="content">
    {#if ingredientes.length === 0}
      <div class="empty">
        <p>No hay ingredientes en el catalogo.</p>
        <p class="hint">Los ingredientes aparecen aqui cuando se añaden a recetas.</p>
      </div>
    {:else if filtered.length === 0}
      <div class="empty">
        <p>Ningun ingrediente coincide con "{filterText}".</p>
      </div>
    {:else}
      <div class="ing-list">
        {#each filtered as ing (ing.nombre)}
          <IngredienteCard ingrediente={ing} onClick={onSelectIngrediente} />
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
  .bulk-btn {
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
  .bulk-btn:hover { background: rgba(96, 165, 250, 0.25); }

  .content { flex: 1; overflow-y: auto; padding: 12px; }
  .empty { text-align: center; padding: 32px 16px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .empty .hint { font-size: 12px; margin-top: 8px; opacity: 0.7; }
  .ing-list { display: flex; flex-direction: column; gap: 4px; }
</style>
