<script lang="ts">
  /**
   * CartaCard — card resumen de una carta para el catalogo del Browser.
   * Shape ABIERTO (D3): renderiza solo los campos PRESENTES. nombre siempre;
   * estado/version/conteos/updated_at solo si existen. Sin warnings de campos
   * faltantes (el shape abierto es feature, no bug). Click delega en onClick.
   *
   * Colores via rgb/rgba para respetar la paleta canonica del frontend.contract.
   */

  import type { Carta } from '$lib/stores/carta-manager';

  export let carta: Carta;
  export let onClick: (id: string) => void;

  $: nombre = carta.nombre;
  $: estado = typeof carta.estado === 'string' ? (carta.estado as string) : null;
  $: version = typeof carta.version === 'number' ? (carta.version as number) : null;
  $: productosCount = Array.isArray(carta.productos) ? (carta.productos as unknown[]).length : null;
  $: categoriasCount = Array.isArray(carta.categorias) ? (carta.categorias as unknown[]).length : null;
  $: updatedAt = typeof carta.updated_at === 'string' ? (carta.updated_at as string) : null;

  function estadoRgb(e: string): string {
    if (e === 'activa') return '34, 197, 94';
    if (e === 'borrador') return '245, 158, 11';
    if (e === 'archivada') return '113, 113, 122';
    return '161, 161, 170';
  }

  function humanizeFecha(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  }
</script>

<button class="carta-card" on:click={() => onClick(carta.id)}>
  <div class="card-header">
    <span class="card-name">{nombre}</span>
    {#if version !== null}<span class="card-version">v{version}</span>{/if}
  </div>
  <div class="card-badges">
    {#if estado}
      <span class="badge" style="background-color: rgba({estadoRgb(estado)}, 0.13); color: rgb({estadoRgb(estado)})">
        {estado}
      </span>
    {/if}
  </div>
  <div class="card-meta">
    {#if productosCount !== null}
      <span>{productosCount} producto{productosCount === 1 ? '' : 's'}</span>
    {/if}
    {#if categoriasCount !== null}
      <span>{categoriasCount} categor{categoriasCount === 1 ? 'ia' : 'ias'}</span>
    {/if}
    {#if updatedAt}
      <span class="card-fecha">{humanizeFecha(updatedAt)}</span>
    {/if}
  </div>
</button>

<style>
  .carta-card {
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
  .carta-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--accent-color, rgba(96, 165, 250, 1));
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .card-name { font-weight: 600; }
  .card-version {
    font-size: 10px;
    color: var(--text-secondary, rgba(113, 113, 122, 1));
    font-family: monospace;
  }

  .card-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 6px;
    min-height: 0;
  }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }

  .card-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    align-items: center;
  }
  .card-fecha { margin-left: auto; font-family: monospace; }
</style>
