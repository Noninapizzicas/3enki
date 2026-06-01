<script lang="ts">
  /**
   * IngredienteDetail — datos completos de un ingrediente del catalogo
   * (solo lectura). "Actualizar precio" pre-rellena el chat (Postura B).
   * Se localiza por nombre dentro del catalogo ya cargado en el store.
   */

  import { recetasIngredientes } from '$lib/stores/recetas';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  export let selectedNombre: string | null = null;
  export let onBack: () => void;

  $: ingrediente = $recetasIngredientes.find(i => i.nombre === selectedNombre) ?? null;

  function handleActualizarPrecio() {
    if (!ingrediente) return;
    const unidad = ingrediente.unidad || 'unidad';
    prefillChatInput(`Actualiza el precio del ingrediente "${ingrediente.nombre}" a <precio>€/${unidad}.`);
  }
</script>

<div class="detail">
  <button class="back-btn" on:click={onBack}>← Volver</button>

  {#if !ingrediente}
    <div class="empty"><p>Ingrediente no encontrado.</p></div>
  {:else}
    <h3>{ingrediente.nombre}</h3>

    <div class="field">
      <span class="field-label">Precio de mercado</span>
      {#if typeof ingrediente.precio_mercado === 'number'}
        <span class="field-value price">{ingrediente.precio_mercado.toFixed(3)}€{ingrediente.unidad ? ' / ' + ingrediente.unidad : ''}</span>
      {:else}
        <span class="field-value muted">sin precio</span>
      {/if}
    </div>

    {#if ingrediente.alergenos && ingrediente.alergenos.length > 0}
      <div class="field">
        <span class="field-label">Alergenos</span>
        <span class="field-value">{ingrediente.alergenos.join(', ')}</span>
      </div>
    {/if}

    {#if ingrediente.proveedor}
      <div class="field">
        <span class="field-label">Proveedor</span>
        <span class="field-value">{ingrediente.proveedor}</span>
      </div>
    {/if}

    {#if ingrediente.updated_at}
      <div class="field">
        <span class="field-label">Actualizado</span>
        <span class="field-value muted">{new Date(ingrediente.updated_at).toLocaleString()}</span>
      </div>
    {/if}

    <div class="actions">
      <button class="action-btn" on:click={handleActualizarPrecio}>Actualizar precio</button>
    </div>

    <p class="hint chat-hint">
      "Actualizar precio" pre-rellena el chat — completa el importe, revisa y envía.
    </p>
  {/if}
</div>

<style>
  .detail { height: 100%; overflow-y: auto; padding: 12px; }
  .back-btn {
    background: none;
    border: none;
    color: var(--accent-color, rgba(96, 165, 250, 1));
    cursor: pointer;
    padding: 4px 0;
    font-size: 12px;
    margin-bottom: 8px;
  }
  .empty { text-align: center; padding: 32px 16px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }

  h3 { margin: 0 0 12px; font-size: 16px; }

  .field {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-color, #333);
    font-size: 13px;
  }
  .field-label { color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .field-value { color: var(--text-primary, rgba(228, 228, 231, 1)); }
  .field-value.price { font-family: monospace; font-weight: 600; color: var(--accent-color, rgba(96, 165, 250, 1)); }
  .field-value.muted { color: var(--text-secondary, rgba(113, 113, 122, 1)); }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 20px;
    padding-top: 12px;
  }
  .action-btn {
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }
  .action-btn:hover { background: rgba(255, 255, 255, 0.1); border-color: var(--accent-color, rgba(96, 165, 250, 1)); }

  .hint { font-size: 12px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .chat-hint {
    margin-top: 16px;
    padding: 8px 12px;
    background: rgba(96, 165, 250, 0.06);
    border-radius: 6px;
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-style: italic;
    text-align: center;
  }
</style>
