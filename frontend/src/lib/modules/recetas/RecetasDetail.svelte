<script lang="ts">
  /**
   * RecetasDetail — detalle completo de una receta (solo lectura). Las
   * acciones (Editar, Cambiar estado, Eliminar) NO mutan: pre-rellenan el
   * chat input con la frase canonica para que el usuario revise y envie
   * (Postura B). "Ver historial" navega dentro del Panel.
   *
   * Colores via rgb/rgba para respetar la paleta canonica del
   * frontend.contract (cero hex 6-digit fuera de paleta).
   */

  import { onMount } from 'svelte';
  import {
    getReceta,
    selectedReceta,
    recetasLoading,
    recetasError,
    type EstadoOperativo
  } from '$lib/stores/recetas';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  export let selectedRecetaId: string | null = null;
  export let onVerHistorial: () => void;
  export let onBack: () => void;

  let showEstadoMenu = false;

  const ESTADOS: EstadoOperativo[] = ['borrador', 'en_servicio', 'archivada'];

  onMount(() => {
    if (selectedRecetaId) getReceta(selectedRecetaId);
  });

  $: receta = $selectedReceta;
  $: loading = $recetasLoading;
  $: error = $recetasError;

  function estadoLabel(e: EstadoOperativo): string {
    if (e === 'en_servicio') return 'en servicio';
    return e;
  }
  function estadoRgb(e: EstadoOperativo): string {
    if (e === 'en_servicio') return '34, 197, 94';
    if (e === 'borrador') return '245, 158, 11';
    if (e === 'archivada') return '113, 113, 122';
    return '161, 161, 170';
  }
  function formatUnidad(u: string | null | undefined): string {
    return u ? ` ${u}` : '';
  }

  function handleEditar() {
    if (!receta) return;
    prefillChatInput(`Edita la receta "${receta.nombre}". Cambia [describe que].`);
  }

  function handleCambiarEstado(estadoTarget: EstadoOperativo) {
    showEstadoMenu = false;
    if (!receta) return;
    prefillChatInput(`Cambia el estado de la receta "${receta.nombre}" a ${estadoLabel(estadoTarget)}.`);
  }

  function handleEliminar() {
    if (!receta) return;
    prefillChatInput(`Elimina la receta "${receta.nombre}".`);
  }
</script>

<div class="detail">
  <button class="back-btn" on:click={onBack}>← Volver</button>

  {#if error}
    <div class="error"><span>{error}</span></div>
  {/if}

  {#if loading && !receta}
    <div class="loading">Cargando...</div>
  {:else if !receta}
    <div class="empty"><p>Receta no encontrada.</p></div>
  {:else}
    <h3>{receta.nombre}</h3>
    {#if receta.descripcion}
      <p class="desc">{receta.descripcion}</p>
    {/if}

    <div class="meta">
      <span class="badge" style="background-color: rgba({estadoRgb(receta.estado_operativo)}, 0.13); color: rgb({estadoRgb(receta.estado_operativo)})">
        {estadoLabel(receta.estado_operativo)}
      </span>
      <span class="badge">{receta.tipo}</span>
      {#if receta.rinde}<span class="badge">rinde {receta.rinde.cantidad} {receta.rinde.unidad}</span>{/if}
      <span class="badge">v{receta.version}</span>
      {#if receta.incompleta}
        <span class="badge warn">incompleta</span>
      {/if}
    </div>

    {#if receta.incompleta && receta.campos_pendientes && receta.campos_pendientes.length > 0}
      <div class="pendientes-box">
        <strong>Campos pendientes</strong>
        <ul>
          {#each receta.campos_pendientes as cp}
            <li>{cp}</li>
          {/each}
        </ul>
        <p class="hint">Usa el chat para completar lo que falte.</p>
      </div>
    {/if}

    {#if typeof receta.coste_total === 'number'}
      <div class="coste-box">
        <div class="coste-summary">
          <span class="coste-label">Coste total</span>
          <span class="coste-value">{receta.coste_total.toFixed(2)}€</span>
        </div>
        {#if typeof receta.coste_unidad === 'number'}
          <div class="coste-summary">
            <span class="coste-label">Coste/{receta.rinde?.unidad ?? 'ud'}</span>
            <span class="coste-value">{receta.coste_unidad.toFixed(2)}€</span>
          </div>
        {/if}
        {#if receta.lineas_sin_precio && receta.lineas_sin_precio.length > 0}
          <div class="coste-warn">⚠ Sin precio: {receta.lineas_sin_precio.join(', ')}</div>
        {/if}
        {#if receta.fuentes_precios && receta.fuentes_precios.length > 0}
          <div class="coste-fuentes">
            Fuentes: {receta.fuentes_precios.join(' + ')}
            {#if receta.coste_actualizado_at} · {new Date(receta.coste_actualizado_at).toLocaleDateString()}{/if}
          </div>
        {/if}
      </div>

      {#if receta.lineas_detalle && receta.lineas_detalle.length > 0}
        <h4>Desglose</h4>
        <div class="ing-table">
          {#each receta.lineas_detalle as det}
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

    <h4>Líneas</h4>
    {#if receta.lineas && receta.lineas.length > 0}
      <div class="ing-table">
        {#each receta.lineas as l}
          <div class="ing-row">
            <span class="ing-name">{l.nombre}{#if l.ref} <span class="ref-tag" title="ref: {l.ref}">↗</span>{/if}</span>
            <span class="ing-qty">{l.cantidad ?? ''}{formatUnidad(l.unidad)}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="hint">Sin líneas definidas.</p>
    {/if}

    {#if receta.instrucciones && receta.instrucciones.length > 0}
      <h4>Elaboracion</h4>
      <ol class="elaboracion">
        {#each receta.instrucciones as paso}
          <li>{paso}</li>
        {/each}
      </ol>
    {/if}

    {#if receta.tags && receta.tags.length > 0}
      <div class="tags">
        {#each receta.tags as tag}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    {/if}

    {#if receta.notas}
      <p class="notas"><strong>Notas:</strong> {receta.notas}</p>
    {/if}

    <!-- BARRA DE ACCIONES (Postura B: pre-rellenan el chat) -->
    <div class="actions">
      <button class="action-btn" on:click={handleEditar}>Editar</button>

      <div class="estado-wrap">
        <button class="action-btn" on:click={() => (showEstadoMenu = !showEstadoMenu)}>
          Cambiar estado ▾
        </button>
        {#if showEstadoMenu}
          <div class="estado-menu">
            {#each ESTADOS.filter(e => e !== receta.estado_operativo) as estadoTarget}
              <button class="estado-option" on:click={() => handleCambiarEstado(estadoTarget)}>
                {estadoLabel(estadoTarget)}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <button class="action-btn" on:click={onVerHistorial}>Ver historial</button>
      <button class="action-btn danger" on:click={handleEliminar}>Eliminar</button>
    </div>

    <p class="hint chat-hint">
      Las acciones pre-rellenan el chat — revisa el mensaje y envíalo para que el agente lo ejecute.
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

  .error {
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.15);
    color: rgba(248, 113, 113, 1);
    font-size: 12px;
    border-radius: 6px;
    margin-bottom: 8px;
  }
  .loading { padding: 12px; text-align: center; color: var(--text-secondary, rgba(161, 161, 170, 1)); font-size: 12px; }
  .empty { text-align: center; padding: 32px 16px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }

  h3 { margin: 0 0 4px; font-size: 16px; }
  h4 { margin: 16px 0 8px; font-size: 13px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .desc { font-size: 12px; color: var(--text-secondary, rgba(161, 161, 170, 1)); margin: 4px 0 12px; }

  .meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }
  .badge.warn { background: rgba(245, 158, 11, 0.15); color: rgba(245, 158, 11, 1); }

  .pendientes-box {
    margin: 8px 0 16px;
    padding: 10px 12px;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 6px;
    font-size: 12px;
  }
  .pendientes-box strong { color: rgba(245, 158, 11, 1); display: block; margin-bottom: 6px; }
  .pendientes-box ul { margin: 4px 0 6px; padding-left: 20px; }
  .pendientes-box .hint { font-style: italic; opacity: 0.8; margin: 0; }

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
  .coste-summary { display: flex; justify-content: space-between; align-items: baseline; }
  .coste-label { font-size: 12px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .coste-value { font-family: monospace; font-weight: 700; color: var(--accent-color, rgba(96, 165, 250, 1)); font-size: 14px; }
  .coste-warn {
    margin-top: 4px;
    padding: 4px 6px;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 4px;
    font-size: 11px;
    color: rgba(245, 158, 11, 1);
  }
  .coste-fuentes { font-size: 10px; color: var(--text-secondary, rgba(113, 113, 122, 1)); font-style: italic; }

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
  .ing-qty { color: var(--text-secondary, rgba(161, 161, 170, 1)); font-family: monospace; }
  .ing-row.det .ing-precio {
    font-family: monospace;
    color: var(--accent-color, rgba(96, 165, 250, 1));
    font-weight: 600;
    min-width: 60px;
    text-align: right;
  }
  .ing-row.det .ing-precio.est { color: rgba(245, 158, 11, 1); }
  .ing-row.det .ing-precio.nd { color: var(--text-secondary, rgba(113, 113, 122, 1)); font-style: italic; }

  .elaboracion { padding-left: 20px; font-size: 12px; line-height: 1.6; }
  .elaboracion li { margin-bottom: 4px; }

  .tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 12px; }
  .tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(96, 165, 250, 0.15);
    color: var(--accent-color, rgba(96, 165, 250, 1));
  }

  .notas { font-size: 12px; margin-top: 12px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color, #333);
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
  .action-btn.danger { color: rgba(248, 113, 113, 1); border-color: rgba(239, 68, 68, 0.4); }
  .action-btn.danger:hover { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 1); }

  .estado-wrap { position: relative; }
  .estado-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: var(--color-surface, rgba(31, 31, 35, 1));
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    overflow: hidden;
    z-index: 10;
    min-width: 140px;
  }
  .estado-option {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    background: none;
    border: none;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    cursor: pointer;
    font-size: 12px;
  }
  .estado-option:hover { background: rgba(96, 165, 250, 0.15); }

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
