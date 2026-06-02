<script lang="ts">
  /**
   * OpcionesZone - opciones de visualizacion, ligera y colapsable. Solo lectura + prefill.
   */
  import { cartaDigitalConfig } from '$lib/stores/carta-digital';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  let expanded = false;

  $: opciones = $cartaDigitalConfig?.opciones_visualizacion || {};
  $: hayOpciones = Object.keys(opciones).length > 0;

  function editarOpciones() {
    prefillChatInput('Cambia las opciones de visualizacion de la carta digital: [describe cambios].');
  }
</script>

<section class="zona-opciones">
  <button class="header-colapsable" on:click={() => (expanded = !expanded)}>
    <span class="caret">{expanded ? '▾' : '▸'}</span>
    <span class="titulo">Opciones de visualización</span>
    {#if !expanded && hayOpciones}
      <span class="resumen">({Object.keys(opciones).length} opciones configuradas)</span>
    {/if}
  </button>

  {#if expanded}
    {#if hayOpciones}
      <dl>
        {#each Object.entries(opciones) as [k, v]}
          <dt>{k}</dt>
          <dd>{typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}</dd>
        {/each}
      </dl>
    {:else}
      <p class="vacio">Sin opciones de visualización configuradas.</p>
    {/if}
    <button on:click={editarOpciones}>Editar opciones</button>
  {/if}
</section>

<style>
  .zona-opciones {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 0.75rem 1.25rem;
  }
  .header-colapsable {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
    width: 100%;
    text-align: left;
  }
  .titulo {
    font-weight: 600;
  }
  .resumen {
    color: #888;
    font-size: 0.85rem;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0.75rem 0 0.5rem;
  }
  dt {
    font-weight: 600;
    color: #555;
  }
  dd {
    margin: 0;
    white-space: pre-wrap;
    font-size: 0.85rem;
  }
  .vacio {
    color: #888;
    font-size: 0.85rem;
  }
  button {
    cursor: pointer;
  }
</style>
