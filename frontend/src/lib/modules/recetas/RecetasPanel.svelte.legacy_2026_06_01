<script lang="ts">
  /**
   * RecetasPanel — panel de gestion del catalogo de recetas (lecto-puro).
   *
   * Las lecturas (listar / obtener / ingredientes / estadisticas) van al modulo
   * backend `recetas-api`. Las operaciones complejas (crear, editar, eliminar)
   * NO viven en este panel — el usuario las pide al LLM via el chat.
   *
   * Tabs:
   *   - Recetas: lista con badges (estado, dificultad, incompleta).
   *   - Detalle: receta seleccionada con ingredientes.
   *   - Ingredientes: catalogo del proyecto.
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    recetasStore,
    sortedRecetas,
    selectedReceta,
    recetasStats,
    recetasLoading,
    recetasError,
    recetasIngredientes,
    initRecetasSubscriptions,
    setActiveTab,
    selectReceta,
    getReceta,
    loadIngredientes,
    clearError,
    type EstadoOperativo,
    type Dificultad
  } from '$lib/stores/recetas';

  export let panelId: string = '';

  let cleanup: (() => void) | null = null;

  $: tab = $recetasStore.activeTab;
  $: stats = $recetasStats;
  $: loading = $recetasLoading;
  $: error = $recetasError;
  $: selected = $selectedReceta;
  $: recetas = $sortedRecetas;
  $: ingredientes = $recetasIngredientes;

  onMount(() => {
    cleanup = initRecetasSubscriptions();
  });

  onDestroy(() => {
    cleanup?.();
  });

  function handleTabChange(newTab: typeof tab) {
    setActiveTab(newTab);
    if (newTab === 'ingredientes') loadIngredientes();
  }

  async function handleSelectReceta(id: string) {
    await getReceta(id);
  }

  function handleBack() {
    selectReceta(null);
    setActiveTab('recetas');
  }

  function estadoLabel(e: EstadoOperativo): string {
    if (e === 'en_servicio') return 'en servicio';
    if (e === 'borrador') return 'borrador';
    if (e === 'archivada') return 'archivada';
    return e;
  }

  function estadoColor(e: EstadoOperativo): string {
    if (e === 'en_servicio') return '#22c55e';
    if (e === 'borrador') return '#f59e0b';
    if (e === 'archivada') return '#71717a';
    return '#a1a1aa';
  }

  function dificultadColor(d: Dificultad): string {
    if (d === 'baja') return '#22c55e';
    if (d === 'media') return '#f59e0b';
    if (d === 'alta') return '#ef4444';
    return '#a1a1aa';
  }

  function formatUnidad(u: string | undefined): string {
    return u ? ` ${u}` : '';
  }
</script>

<div class="recetas-panel">
  <!-- TABS -->
  <div class="tabs">
    <button
      class="tab" class:active={tab === 'recetas'}
      on:click={() => handleTabChange('recetas')}
    >
      Recetas {stats?.total_recetas ? `(${stats.total_recetas})` : ''}
    </button>
    <button
      class="tab" class:active={tab === 'detalle'}
      on:click={() => handleTabChange('detalle')}
      disabled={!selected}
    >
      Detalle
    </button>
    <button
      class="tab" class:active={tab === 'ingredientes'}
      on:click={() => handleTabChange('ingredientes')}
    >
      Ingredientes {stats?.ingredientes_catalogo ? `(${stats.ingredientes_catalogo})` : ''}
    </button>
  </div>

  <!-- ERROR -->
  {#if error}
    <div class="error">
      <span>{error}</span>
      <button on:click={clearError}>×</button>
    </div>
  {/if}

  <!-- LOADING -->
  {#if loading}
    <div class="loading">Cargando...</div>
  {/if}

  <!-- TAB: RECETAS -->
  {#if tab === 'recetas'}
    <div class="content">
      {#if recetas.length === 0 && !loading}
        <div class="empty">
          <p>No hay recetas todavia.</p>
          <p class="hint">
            Usa el chat para crear recetas. Por ejemplo:<br>
            <em>"Investiga una receta de carbonara y guardala como borrador"</em>
          </p>
        </div>
      {:else}
        <!-- Stats summary del store canonico -->
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

        <div class="recetas-list">
          {#each recetas as receta (receta.id)}
            <button
              class="receta-card"
              class:incompleta={receta.incompleta}
              on:click={() => handleSelectReceta(receta.id)}
            >
              <div class="card-header">
                <span class="card-name">{receta.nombre}</span>
                <span class="card-version">v{receta.version}</span>
              </div>
              <div class="card-badges">
                <span class="badge" style="background-color: {estadoColor(receta.estado_operativo)}20; color: {estadoColor(receta.estado_operativo)}">
                  {estadoLabel(receta.estado_operativo)}
                </span>
                <span class="badge" style="background-color: {dificultadColor(receta.dificultad)}20; color: {dificultadColor(receta.dificultad)}">
                  dificultad {receta.dificultad}
                </span>
                {#if receta.incompleta}
                  <span class="badge warn">incompleta</span>
                {/if}
              </div>
              <div class="card-meta">
                <span>{receta.ingredientes_count} ingrediente{receta.ingredientes_count !== 1 ? 's' : ''}</span>
                <span>{receta.porciones} porci{receta.porciones === 1 ? 'on' : 'ones'}</span>
                {#if typeof receta.coste_porcion === 'number'}
                  <span class="card-coste">
                    {receta.coste_porcion.toFixed(2)}€/porc{#if receta.coste_incompleto}<span class="coste-asterisco" title="Coste parcial — hay ingredientes sin precio">*</span>{/if}
                  </span>
                {/if}
              </div>
              {#if receta.incompleta && receta.campos_pendientes.length > 0}
                <div class="card-pendientes">
                  Pendiente: {receta.campos_pendientes.slice(0, 3).join(', ')}
                  {#if receta.campos_pendientes.length > 3}…{/if}
                </div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- TAB: DETALLE -->
  {#if tab === 'detalle'}
    <div class="content">
      {#if selected}
        <button class="back-btn" on:click={handleBack}>← Volver</button>

        <h3>{selected.nombre}</h3>
        {#if selected.descripcion}
          <p class="desc">{selected.descripcion}</p>
        {/if}

        <div class="meta">
          <span class="badge" style="background-color: {estadoColor(selected.estado_operativo)}20; color: {estadoColor(selected.estado_operativo)}">
            {estadoLabel(selected.estado_operativo)}
          </span>
          <span class="badge" style="background-color: {dificultadColor(selected.dificultad)}20; color: {dificultadColor(selected.dificultad)}">
            dificultad {selected.dificultad}
          </span>
          <span class="badge">{selected.porciones} porci{selected.porciones === 1 ? 'on' : 'ones'}</span>
          <span class="badge">v{selected.version}</span>
          {#if selected.incompleta}
            <span class="badge warn">incompleta</span>
          {/if}
        </div>

        {#if selected.incompleta && selected.campos_pendientes && selected.campos_pendientes.length > 0}
          <div class="pendientes-box">
            <strong>Campos pendientes</strong>
            <ul>
              {#each selected.campos_pendientes as cp}
                <li>{cp}</li>
              {/each}
            </ul>
            <p class="hint">Usa el chat para completar lo que falte.</p>
          </div>
        {/if}

        {#if typeof selected.coste_total === 'number'}
          <div class="coste-box">
            <div class="coste-summary">
              <span class="coste-label">Coste total</span>
              <span class="coste-value">{selected.coste_total.toFixed(2)}€</span>
            </div>
            {#if typeof selected.coste_porcion === 'number'}
              <div class="coste-summary">
                <span class="coste-label">Coste/porción</span>
                <span class="coste-value">{selected.coste_porcion.toFixed(2)}€</span>
              </div>
            {/if}
            {#if selected.ingredientes_sin_precio && selected.ingredientes_sin_precio.length > 0}
              <div class="coste-warn">
                ⚠ Sin precio: {selected.ingredientes_sin_precio.join(', ')}
              </div>
            {/if}
            {#if selected.fuentes_precios && selected.fuentes_precios.length > 0}
              <div class="coste-fuentes">
                Fuentes: {selected.fuentes_precios.join(' + ')}
                {#if selected.postcode_usado} · CP {selected.postcode_usado}{/if}
                {#if selected.coste_actualizado_at} · {new Date(selected.coste_actualizado_at).toLocaleDateString()}{/if}
              </div>
            {/if}
          </div>

          {#if selected.ingredientes_detalle && selected.ingredientes_detalle.length > 0}
            <h4>Desglose</h4>
            <div class="ing-table">
              {#each selected.ingredientes_detalle as det}
                <div class="ing-row det">
                  <span class="ing-name">{det.nombre}</span>
                  <span class="ing-qty">{det.cantidad}{det.unidad ? ' ' + det.unidad : ''}</span>
                  <span class="ing-precio" class:est={det.fuente === 'estimado_llm'} class:nd={det.fuente === 'no_disponible'}>
                    {#if det.valor_calculado !== null && det.valor_calculado !== undefined}
                      {det.valor_calculado.toFixed(2)}€
                    {:else}
                      —
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <p class="hint chat-hint">
            Sin coste calculado todavía. Pídele al chat <em>"calcula el coste de esta receta"</em>.
          </p>
        {/if}

        <!-- INGREDIENTES -->
        <h4>Ingredientes</h4>
        {#if selected.ingredientes && selected.ingredientes.length > 0}
          <div class="ing-table">
            {#each selected.ingredientes as ing}
              <div class="ing-row">
                <span class="ing-name">{ing.nombre}</span>
                <span class="ing-qty">{ing.cantidad}{formatUnidad(ing.unidad)}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="hint">Sin ingredientes definidos.</p>
        {/if}

        <!-- ELABORACION (opcional) -->
        {#if selected.elaboracion && selected.elaboracion.length > 0}
          <h4>Elaboracion</h4>
          <ol class="elaboracion">
            {#each selected.elaboracion as paso}
              <li>{paso}</li>
            {/each}
          </ol>
        {/if}

        <!-- TAGS (opcional) -->
        {#if selected.tags && selected.tags.length > 0}
          <div class="tags">
            {#each selected.tags as tag}
              <span class="tag">{tag}</span>
            {/each}
          </div>
        {/if}

        {#if selected.notas}
          <p class="notas"><strong>Notas:</strong> {selected.notas}</p>
        {/if}

        <p class="hint chat-hint">
          ¿Falta info (coste, foto, descripcion)? Pidela al chat — el agente sabe completar recetas.
        </p>
      {:else}
        <div class="empty">
          <p>Selecciona una receta de la lista.</p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- TAB: INGREDIENTES -->
  {#if tab === 'ingredientes'}
    <div class="content">
      {#if ingredientes.length === 0 && !loading}
        <div class="empty">
          <p>No hay ingredientes en el catalogo.</p>
          <p class="hint">Los ingredientes aparecen aqui cuando se añaden a recetas.</p>
        </div>
      {:else}
        <div class="ing-catalog">
          {#each ingredientes as ing (ing.nombre)}
            <div class="ing-catalog-row">
              <div class="ing-catalog-main">
                <span class="ing-name">{ing.nombre}</span>
                {#if typeof ing.precio_mercado === 'number'}
                  <span class="ing-price">{ing.precio_mercado.toFixed(3)}€{formatUnidad(ing.unidad)}</span>
                {:else}
                  <span class="ing-price ing-no-price">sin precio</span>
                {/if}
              </div>
              {#if ing.alergenos && ing.alergenos.length > 0}
                <div class="ing-alergenos">
                  Alergenos: {ing.alergenos.join(', ')}
                </div>
              {/if}
              {#if ing.proveedor}
                <div class="ing-prov">Proveedor: {ing.proveedor}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .recetas-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-size: 13px;
    color: var(--text-primary, #e4e4e7);
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color, #333);
    padding: 0 8px;
    flex-shrink: 0;
  }

  .tab {
    padding: 8px 12px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary, #a1a1aa);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }
  .tab:hover:not(:disabled) { color: var(--text-primary, #e4e4e7); }
  .tab.active {
    color: var(--accent-color, #60a5fa);
    border-bottom-color: var(--accent-color, #60a5fa);
  }
  .tab:disabled { opacity: 0.4; cursor: default; }

  .content { flex: 1; overflow-y: auto; padding: 12px; }

  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
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

  .loading { padding: 12px; text-align: center; color: var(--text-secondary, #a1a1aa); font-size: 12px; }

  .empty { text-align: center; padding: 32px 16px; color: var(--text-secondary, #a1a1aa); }
  .empty .hint { font-size: 12px; margin-top: 8px; opacity: 0.7; }

  .stats-bar {
    display: flex;
    gap: 16px;
    padding: 8px 12px;
    background: rgba(96, 165, 250, 0.08);
    border-radius: 6px;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--text-secondary, #a1a1aa);
    flex-wrap: wrap;
  }
  .stats-bar strong { color: var(--text-primary, #e4e4e7); margin-left: 4px; }
  .stats-bar .warn strong { color: #f59e0b; }

  .recetas-list { display: flex; flex-direction: column; gap: 6px; }

  .receta-card {
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
  .receta-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--accent-color, #60a5fa);
  }
  .receta-card.incompleta { border-left: 3px solid #f59e0b; }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .card-name { font-weight: 600; }
  .card-version {
    font-size: 10px;
    color: var(--text-secondary, #71717a);
    font-family: monospace;
  }

  .card-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }

  .card-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-secondary, #a1a1aa);
    align-items: center;
  }
  .card-coste {
    margin-left: auto;
    font-family: monospace;
    font-weight: 600;
    color: var(--accent-color, #60a5fa);
  }
  .coste-asterisco {
    color: #f59e0b;
    margin-left: 1px;
  }
  .card-pendientes {
    margin-top: 6px;
    font-size: 11px;
    color: #f59e0b;
    font-style: italic;
  }
  .coste-box {
    margin: 12px 0;
    padding: 10px 12px;
    background: rgba(96, 165, 250, 0.06);
    border: 1px solid rgba(96, 165, 250, 0.2);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .coste-summary {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .coste-label { font-size: 12px; color: var(--text-secondary, #a1a1aa); }
  .coste-value { font-family: monospace; font-weight: 700; color: var(--accent-color, #60a5fa); font-size: 14px; }
  .coste-warn {
    margin-top: 4px;
    padding: 4px 6px;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 4px;
    font-size: 11px;
    color: #f59e0b;
  }
  .coste-fuentes {
    font-size: 10px;
    color: var(--text-secondary, #71717a);
    font-style: italic;
  }
  .ing-row.det .ing-precio {
    font-family: monospace;
    color: var(--accent-color, #60a5fa);
    font-weight: 600;
    min-width: 60px;
    text-align: right;
  }
  .ing-row.det .ing-precio.est { color: #f59e0b; }
  .ing-row.det .ing-precio.nd { color: var(--text-secondary, #71717a); font-style: italic; }

  .back-btn {
    background: none;
    border: none;
    color: var(--accent-color, #60a5fa);
    cursor: pointer;
    padding: 4px 0;
    font-size: 12px;
    margin-bottom: 8px;
  }

  h3 { margin: 0 0 4px; font-size: 16px; }
  h4 { margin: 16px 0 8px; font-size: 13px; color: var(--text-secondary, #a1a1aa); }

  .desc { font-size: 12px; color: var(--text-secondary, #a1a1aa); margin: 4px 0 12px; }

  .meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, #e4e4e7);
  }
  .badge.warn { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }

  .pendientes-box {
    margin: 8px 0 16px;
    padding: 10px 12px;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 6px;
    font-size: 12px;
  }
  .pendientes-box strong { color: #f59e0b; display: block; margin-bottom: 6px; }
  .pendientes-box ul { margin: 4px 0 6px; padding-left: 20px; }
  .pendientes-box .hint { font-style: italic; opacity: 0.8; margin: 0; }

  .ing-table { display: flex; flex-direction: column; gap: 2px; }
  .ing-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
  }
  .ing-row:hover { background: rgba(255, 255, 255, 0.05); }
  .ing-name { flex: 1; }
  .ing-qty { color: var(--text-secondary, #a1a1aa); font-family: monospace; }

  .elaboracion { padding-left: 20px; font-size: 12px; line-height: 1.6; }
  .elaboracion li { margin-bottom: 4px; }

  .tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 12px; }
  .tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(96, 165, 250, 0.15);
    color: var(--accent-color, #60a5fa);
  }

  .notas { font-size: 12px; margin-top: 12px; color: var(--text-secondary, #a1a1aa); }

  .chat-hint {
    margin-top: 16px;
    padding: 8px 12px;
    background: rgba(96, 165, 250, 0.06);
    border-radius: 6px;
    font-size: 11px;
    color: var(--text-secondary, #a1a1aa);
    font-style: italic;
    text-align: center;
  }

  /* Ingredientes catalog */
  .ing-catalog { display: flex; flex-direction: column; gap: 4px; }
  .ing-catalog-row {
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 6px;
    border: 1px solid var(--border-color, #333);
  }
  .ing-catalog-main {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .ing-price {
    font-family: monospace;
    color: var(--accent-color, #60a5fa);
    font-weight: 600;
  }
  .ing-price.ing-no-price {
    color: var(--text-secondary, #71717a);
    font-weight: normal;
    font-style: italic;
  }
  .ing-alergenos, .ing-prov {
    font-size: 11px;
    color: var(--text-secondary, #a1a1aa);
    margin-top: 4px;
  }
</style>
