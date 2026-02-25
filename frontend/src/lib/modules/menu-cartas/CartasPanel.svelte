<script lang="ts">
  /**
   * CartasPanel - Lista y detalle de cartas generadas
   *
   * Vista principal: lista de cartas con estado.
   * Click en una carta: muestra detalle (categorias, productos, ingredientes).
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    menuGeneratorStore,
    sortedCartas,
    selectedCarta,
    menuHealth,
    menuLoading,
    initMenuGeneratorSubscriptions,
    getCarta,
    selectCarta,
    renderCartaHtml,
    type CartaEstado,
    type Producto
  } from '$lib/stores/menu-generator';
  import { updatePageStateBatch } from '$lib/stores/page-context';

  export let panelId: string = '';

  let cleanup: (() => void) | null = null;

  // Vista: 'list' o 'detail'
  let view: 'list' | 'detail' = 'list';
  let rendering: string | null = null;

  $: cartas = $sortedCartas;
  $: carta = $selectedCarta;
  $: health = $menuHealth;
  $: loading = $menuLoading;

  onMount(() => {
    cleanup = initMenuGeneratorSubscriptions();
  });

  onDestroy(() => {
    cleanup?.();
  });

  async function handleViewCarta(id: string) {
    await getCarta(id);
    view = 'detail';
    updatePageStateBatch({ activeCarta: id, pipelineStep: 'viewing_carta' });
  }

  function handleBack() {
    selectCarta(null);
    view = 'list';
  }

  async function handleRender(id: string) {
    rendering = id;
    try {
      await renderCartaHtml(id);
    } finally {
      rendering = null;
    }
  }

  function getEstadoIcon(estado: CartaEstado): string {
    return ({ generando: '⏳', generada: '✅', error: '❌' })[estado] || '📄';
  }

  function getEstadoColor(estado: CartaEstado): string {
    return ({
      generando: 'var(--color-warning, #f59e0b)',
      generada: 'var(--color-success, #22c55e)',
      error: 'var(--color-error, #ef4444)'
    })[estado] || 'var(--color-text)';
  }

  function formatDate(d: string): string {
    if (!d) return '-';
    return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
  }

  function getProductosByCategoria(productos: Producto[], catId: string): Producto[] {
    return productos.filter(p => p.categoria === catId);
  }
</script>

<div class="panel-body">
  <!-- HEADER -->
  <div class="panel-header">
    {#if view === 'detail'}
      <button class="btn-back" on:click={handleBack}>← Volver</button>
    {:else}
      <span class="header-title">Cartas generadas</span>
    {/if}
    <div class="health-badges">
      {#if health.generando > 0}
        <span class="badge generating">⏳ {health.generando}</span>
      {/if}
      <span class="badge">{health.generadas} cartas</span>
    </div>
  </div>

  <!-- CONTENT -->
  {#if view === 'list'}
    <!-- LISTA -->
    {#if loading && cartas.length === 0}
      <div class="empty">Cargando...</div>
    {:else if cartas.length === 0}
      <div class="empty">
        <span class="empty-icon">📋</span>
        <span>Sin cartas generadas</span>
      </div>
    {:else}
      <div class="cartas-list">
        {#each cartas as item (item.id)}
          <div class="carta-item" class:error={item.estado === 'error'}>
            <span class="carta-estado" style="color: {getEstadoColor(item.estado)}">
              {getEstadoIcon(item.estado)}
            </span>
            <div class="carta-info">
              <span class="carta-nombre">{item.nombre}</span>
              <span class="carta-meta">
                {#if item.estado === 'generada'}
                  {item.productos || 0} prod · {item.categorias || 0} cat
                {:else if item.estado === 'error'}
                  {item.error || 'Error'}
                {:else}
                  Generando...
                {/if}
              </span>
            </div>
            <div class="carta-actions">
              <span class="carta-fecha">{formatDate(item.created_at)}</span>
              {#if item.estado === 'generada'}
                <div class="action-buttons">
                  <button class="btn-view" on:click={() => handleViewCarta(item.id)} title="Ver detalle">
                    👁️
                  </button>
                  <button class="btn-view" on:click={() => handleRender(item.id)}
                    title="Ver HTML / Imprimir" disabled={rendering === item.id}>
                    {rendering === item.id ? '⏳' : '🖨️'}
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

  {:else if view === 'detail' && carta}
    <!-- DETALLE -->
    <div class="detalle">
      <div class="detalle-header">
        <h3 class="detalle-title">{carta.meta.nombre}</h3>
        <div class="detalle-meta">
          <span class="meta-badge">{carta.meta.generado_desde}</span>
          <span class="meta-date">{formatDate(carta.meta.created_at)}</span>
        </div>
      </div>

      <div class="detalle-stats">
        <div class="stat">
          <span class="stat-value">{carta.categorias.length}</span>
          <span class="stat-label">Categorias</span>
        </div>
        <div class="stat">
          <span class="stat-value">{carta.productos.length}</span>
          <span class="stat-label">Productos</span>
        </div>
        <div class="stat">
          <span class="stat-value">
            {carta.productos.reduce((acc, p) => {
              p.ingredientes.forEach(i => acc.add(i.nombre));
              return acc;
            }, new Set()).size}
          </span>
          <span class="stat-label">Ingredientes</span>
        </div>
      </div>

      <div class="categorias">
        {#each carta.categorias.sort((a, b) => a.orden - b.orden) as cat (cat.id)}
          {@const prods = getProductosByCategoria(carta.productos, cat.id)}
          <div class="cat-section">
            <div class="cat-header">
              <span class="cat-name">{cat.nombre}</span>
              <span class="cat-count">{prods.length}</span>
            </div>
            {#each prods as prod (prod.id)}
              <div class="prod-row">
                <div class="prod-main">
                  <span class="prod-name">{prod.nombre}</span>
                  <span class="prod-price">{prod.precio > 0 ? formatCurrency(prod.precio) : '-'}</span>
                </div>
                {#if prod.ingredientes.length > 0}
                  <div class="prod-ings">
                    {#each prod.ingredientes as ing}
                      <span class="ing-tag">{#if ing.emoji}{ing.emoji} {/if}{ing.nombre}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>

  {:else}
    <div class="empty">Selecciona una carta</div>
  {/if}
</div>

<style>
  .panel-body {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--color-text, #e5e5e5);
  }

  /* HEADER */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    flex-shrink: 0;
  }
  .header-title { font-size: 0.75rem; font-weight: 600; }
  .btn-back {
    padding: 0.2rem 0.5rem;
    background: rgba(255,255,255,0.08);
    border: none;
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.7rem;
    cursor: pointer;
  }
  .btn-back:hover { background: rgba(255,255,255,0.12); }
  .health-badges { display: flex; gap: 0.25rem; }
  .badge {
    font-size: 0.6rem;
    color: var(--color-text-muted, #888);
    padding: 0.1rem 0.3rem;
    background: rgba(255,255,255,0.05);
    border-radius: 0.25rem;
  }
  .badge.generating { color: var(--color-warning, #f59e0b); background: rgba(245,158,11,0.1); }

  /* LISTA */
  .cartas-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.375rem;
  }
  .carta-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.375rem;
  }
  .carta-item:hover { background: rgba(255,255,255,0.06); }
  .carta-item.error { border-color: rgba(239,68,68,0.3); }
  .carta-estado { font-size: 0.9rem; flex-shrink: 0; }
  .carta-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .carta-nombre { font-size: 0.8rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .carta-meta { font-size: 0.65rem; color: var(--color-text-muted, #888); }
  .carta-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem; flex-shrink: 0; }
  .carta-fecha { font-size: 0.6rem; color: var(--color-text-muted, #888); white-space: nowrap; }
  .btn-view {
    padding: 0.2rem 0.3rem;
    background: rgba(255,255,255,0.08);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .btn-view:hover { background: rgba(59,130,246,0.2); }
  .btn-view:disabled { opacity: 0.5; cursor: default; }
  .action-buttons { display: flex; gap: 0.2rem; }

  /* DETALLE */
  .detalle {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .detalle-header { padding-bottom: 0.375rem; border-bottom: 1px solid rgba(255,255,255,0.1); }
  .detalle-title { margin: 0 0 0.25rem 0; font-size: 0.95rem; font-weight: 600; }
  .detalle-meta { display: flex; gap: 0.375rem; align-items: center; }
  .meta-badge {
    padding: 0.1rem 0.3rem;
    background: rgba(59,130,246,0.15);
    border-radius: 0.25rem;
    font-size: 0.6rem;
    color: var(--color-primary, #3b82f6);
    text-transform: uppercase;
  }
  .meta-date { font-size: 0.65rem; color: var(--color-text-muted, #888); }

  .detalle-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.3rem; }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.375rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.375rem;
  }
  .stat-value { font-size: 1.1rem; font-weight: 700; color: var(--color-primary, #3b82f6); }
  .stat-label { font-size: 0.6rem; color: var(--color-text-muted, #888); text-transform: uppercase; }

  .categorias { display: flex; flex-direction: column; gap: 0.5rem; }
  .cat-section {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.375rem;
    overflow: hidden;
  }
  .cat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0.5rem;
    background: rgba(255,255,255,0.04);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .cat-name { font-size: 0.75rem; font-weight: 600; }
  .cat-count {
    font-size: 0.6rem;
    padding: 0.1rem 0.3rem;
    background: rgba(255,255,255,0.08);
    border-radius: 0.25rem;
    color: var(--color-text-muted, #888);
  }

  .prod-row {
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .prod-row:last-child { border-bottom: none; }
  .prod-main { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .prod-name { font-size: 0.75rem; font-weight: 500; }
  .prod-price { font-size: 0.75rem; font-weight: 600; color: var(--color-success, #22c55e); white-space: nowrap; }
  .prod-ings { display: flex; flex-wrap: wrap; gap: 0.2rem; margin-top: 0.2rem; }
  .ing-tag {
    padding: 0.05rem 0.3rem;
    background: rgba(255,255,255,0.05);
    border-radius: 0.2rem;
    font-size: 0.6rem;
    color: var(--color-text-muted, #999);
  }

  /* EMPTY */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 2rem;
    text-align: center;
    font-size: 0.8rem;
    color: var(--color-text-muted, #888);
  }
  .empty-icon { font-size: 1.5rem; opacity: 0.5; }
</style>
