<script lang="ts">
  /**
   * IngredienteCard — card resumen de un ingrediente del catalogo.
   * Identificador logico: nombre (CatalogoIngrediente no tiene id).
   * Colores via rgb/rgba (paleta canonica frontend.contract).
   */

  import type { CatalogoIngrediente } from '$lib/stores/recetas';

  export let ingrediente: CatalogoIngrediente;
  export let onClick: (nombre: string) => void;

  function formatUnidad(u: string | undefined): string {
    return u ? ` ${u}` : '';
  }
</script>

<button class="ing-card" on:click={() => onClick(ingrediente.nombre)}>
  <div class="ing-main">
    <span class="ing-name">{ingrediente.nombre}</span>
    {#if typeof ingrediente.precio_mercado === 'number'}
      <span class="ing-price">{ingrediente.precio_mercado.toFixed(3)}€{formatUnidad(ingrediente.unidad)}</span>
    {:else}
      <span class="ing-price no-price">sin precio</span>
    {/if}
  </div>
  {#if ingrediente.alergenos && ingrediente.alergenos.length > 0}
    <div class="ing-alergenos">Alergenos: {ingrediente.alergenos.join(', ')}</div>
  {/if}
  {#if ingrediente.proveedor}
    <div class="ing-prov">Proveedor: {ingrediente.proveedor}</div>
  {/if}
</button>

<style>
  .ing-card {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    color: inherit;
  }
  .ing-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--accent-color, rgba(96, 165, 250, 1));
  }
  .ing-main {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .ing-name { font-weight: 600; }
  .ing-price {
    font-family: monospace;
    color: var(--accent-color, rgba(96, 165, 250, 1));
    font-weight: 600;
  }
  .ing-price.no-price {
    color: var(--text-secondary, rgba(113, 113, 122, 1));
    font-weight: normal;
    font-style: italic;
  }
  .ing-alergenos, .ing-prov {
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    margin-top: 4px;
  }
</style>
