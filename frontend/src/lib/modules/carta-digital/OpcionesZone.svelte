<script lang="ts">
  /**
   * OpcionesZone - opciones de visualizacion, ligera y colapsable. Solo lectura + prefill.
   */
  import { cartaDigitalConfig } from '$lib/stores/carta-digital';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  let expanded = false;

  $: opciones = $cartaDigitalConfig?.opciones_visualizacion || {};
  $: entradas = Object.entries(opciones);
  $: hayOpciones = entradas.length > 0;

  // Etiqueta legible a partir de la clave (snake/camel → Capitalizado con espacios).
  function etiqueta(k: string): string {
    return k.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase());
  }
  function esBooleano(v: unknown): v is boolean {
    return typeof v === 'boolean';
  }
  function valorTexto(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${etiqueta(k)}: ${x}`).join(' · ');
    return String(v);
  }

  function editarOpciones() {
    prefillChatInput('Cambia las opciones de visualizacion de la carta digital: [describe cambios].');
  }
</script>

<section class="zona-opciones">
  <button class="header-colapsable" on:click={() => (expanded = !expanded)} aria-expanded={expanded}>
    <span class="caret">{expanded ? '▾' : '▸'}</span>
    <span class="titulo">Opciones de visualización</span>
    {#if !expanded && hayOpciones}
      <span class="resumen">{entradas.length} configuradas</span>
    {/if}
  </button>

  {#if expanded}
    {#if hayOpciones}
      <ul class="opciones-list">
        {#each entradas as [k, v]}
          <li class="opcion">
            <span class="op-label">{etiqueta(k)}</span>
            {#if esBooleano(v)}
              <span class="op-badge" class:on={v}>{v ? '✓ Sí' : '✗ No'}</span>
            {:else}
              <span class="op-valor">{valorTexto(v)}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="vacio">Sin opciones de visualización configuradas.</p>
    {/if}
    <button class="btn-editar" on:click={editarOpciones}>Editar opciones</button>
  {/if}
</section>

<style>
  .zona-opciones {
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    background: var(--color-surface, #1a1a1a);
  }
  .header-colapsable {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0;
    width: 100%;
    text-align: left;
    color: var(--color-text, #e5e5e5);
  }
  .caret { color: var(--color-text-muted, #888); }
  .titulo { font-weight: 600; }
  .resumen {
    margin-left: auto;
    color: var(--color-text-muted, #888);
    font-size: 0.8rem;
  }
  .opciones-list {
    list-style: none;
    margin: 0.75rem 0 0.5rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .opcion {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 6px 8px;
    background: var(--color-surface-2, #222);
    border-radius: 6px;
    font-size: 0.8rem;
  }
  .op-label { color: var(--color-text-muted, #888); }
  .op-valor { color: var(--color-text, #e5e5e5); font-weight: 500; }
  .op-badge {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 20px;
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }
  .op-badge.on {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
  }
  .vacio {
    color: var(--color-text-muted, #888);
    font-size: 0.8rem;
    margin: 0.75rem 0;
  }
  .btn-editar {
    margin-top: 0.5rem;
    padding: 6px 12px;
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    background: var(--color-surface-2, #222);
    color: var(--color-text, #e5e5e5);
    font-size: 0.78rem;
    cursor: pointer;
  }
  .btn-editar:hover { border-color: var(--color-primary, #f59e0b); }
</style>
