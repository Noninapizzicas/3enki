<script lang="ts">
  /**
   * BuscadorRepositoriosPanel — PUENTE de búsqueda externa 3D (chat_tool).
   *
   * Input de búsqueda bajo demanda desde el chat + resultados como tarjetas
   * (fuente / título / url / autor / formatos). NO inventa resultados: devuelve lo
   * que el puerto obtiene. La importación posterior vive en importacion, no aquí.
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    buscadorStore, resultadosBusqueda, buscadorLoading,
    buscarModelos, resetBuscadorStore
  } from '$lib/stores/buscador-repositorios';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  let proyectoId = '';
  let query = '';
  let limit = 10;

  $: resultados = $resultadosBusqueda;
  $: loading = $buscadorLoading;
  $: error = $buscadorStore.error;
  $: resultado = $buscadorStore.resultado;

  function proyectoActual(): string {
    return proyectoId || '';
  }

  async function handleBuscar() {
    const pid = proyectoActual();
    if (!pid || !query.trim()) return;
    await buscarModelos(pid, query.trim(), limit || 10);
  }

  function formatosDe(r: { formatos?: string[] }): string {
    return (r.formatos || []).join(', ') || '—';
  }

  onMount(() => {
    const unsub = sessionProjectId.subscribe(v => { proyectoId = v || ''; });
    return unsub;
  });

  onDestroy(() => {
    resetBuscadorStore();
  });
</script>

<div class="panel-buscador">
  <header class="panel-header">
    <div class="header-left">
      <span class="panel-title">🔎 Buscador de repositorios</span>
      <span class="panel-sub">Printables · MakerWorld · Cults3D · Thingiverse …</span>
    </div>
  </header>

  {#if error}<div class="error">⚠ {error}</div>{/if}
  {#if resultado}
    <div class="resultado {resultado.type}">
      {resultado.type === 'ok' ? '✓' : resultado.type === 'error' ? '❌' : '⏳'} {resultado.message}
    </div>
  {/if}

  <div class="content">
    <!-- ===== FORMULARIO DE BÚSQUEDA ===== -->
    <div class="busqueda">
      <label class="form-label">
        <span>Términos de búsqueda *</span>
        <input
          class="input"
          bind:value={query}
          placeholder="ej: soporte ventilador ender 3"
          on:keydown={(e) => { if (e.key === 'Enter') handleBuscar(); }}
        />
      </label>
      <div class="busqueda-row">
        <label class="form-label">
          <span>Límite</span>
          <input class="input num" type="number" bind:value={limit} min="1" max="50" />
        </label>
        <button class="btn primary" on:click={handleBuscar} disabled={!query.trim() || loading}>
          {loading ? 'Buscando…' : '🔎 Buscar'}
        </button>
      </div>
    </div>

    <!-- ===== RESULTADOS COMO TARJETAS ===== -->
    {#if loading && resultados.length === 0}
      <div class="empty-state"><span class="empty-icon">⏳</span><span>Buscando en repositorios externos…</span></div>
    {:else if resultados.length === 0 && !loading}
      <div class="empty-state"><span class="empty-icon">🔎</span><span>Sin resultados todavía</span></div>
    {:else}
      <div class="grid">
        {#each resultados as r, i}
          <div class="card">
            <div class="card-head">
              <span class="card-fuente">{r.fuente || '—'}</span>
            </div>
            <div class="card-titulo">{r.titulo || '—'}</div>
            <div class="card-autor">
              {#if r.autor}<span class="autor">por {r.autor}</span>{/if}
              <span class="formatos">{formatosDe(r)}</span>
            </div>
            {#if r.url}
              <a class="card-url" href={r.url} target="_blank" rel="noopener noreferrer">abrir ↗</a>
            {/if}
            {#if i === 0}<p class="hint-import">→ La importación posterior la hace el módulo «importación».</p>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .panel-buscador { display: flex; flex-direction: column; height: 100%; background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }
  .panel-header { padding: 10px 12px; background: #111; border-bottom: 1px solid #222; flex-shrink: 0; }
  .header-left { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .panel-title { font-weight: 600; color: #22c55e; }
  .panel-sub { font-size: 0.7rem; color: #777; }
  .error, .resultado { padding: 6px 12px; font-size: 0.75rem; border-bottom: 1px solid #222; }
  .error { color: #ef4444; }
  .resultado.ok { color: #22c55e; } .resultado.error { color: #ef4444; } .resultado.info { color: #22c55e; }
  .content { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
  .busqueda { display: flex; flex-direction: column; gap: 8px; max-width: 560px; }
  .busqueda-row { display: flex; gap: 10px; align-items: end; }
  .form-label { display: flex; flex-direction: column; gap: 4px; font-size: 0.72rem; color: #aaa; }
  .input { background: #151515; border: 1px solid #2a2a2a; border-radius: 6px; color: #e5e5e5; padding: 7px 9px; font-size: 0.8rem; }
  .input.num { width: 90px; }
  .btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: #ddd; border-radius: 6px; padding: 8px 14px; font-size: 0.8rem; cursor: pointer; }
  .btn.primary { background: #22c55e; border-color: #22c55e; color: #081; font-weight: 600; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 160px; gap: 8px; color: #666; font-size: .8rem; }
  .empty-icon { font-size: 1.8rem; opacity: .4; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  .card { background: #141414; border: 1px solid #242424; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
  .card-head { display: flex; justify-content: space-between; align-items: center; }
  .card-fuente { font-size: 0.6rem; padding: 2px 7px; border-radius: 10px; background: rgba(34,197,94,.15); color: #22c55e; }
  .card-titulo { font-size: 0.85rem; font-weight: 600; color: #ddd; }
  .card-autor { display: flex; flex-direction: column; gap: 2px; font-size: 0.7rem; color: #999; }
  .formatos { color: #f59e0b; font-size: 0.65rem; }
  .card-url { font-size: 0.72rem; color: #3b82f6; text-decoration: none; }
  .card-url:hover { text-decoration: underline; }
  .hint-import { font-size: 0.65rem; color: #666; margin: 4px 0 0; }
</style>
