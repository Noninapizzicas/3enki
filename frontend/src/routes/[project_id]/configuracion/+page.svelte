<script lang="ts">
  /**
   * /{project_id}/configuracion — Configuración de interfaz por proyecto.
   *
   * El dueño elige qué paneles/módulos de interfaz se ven en ESTE proyecto
   * (workbar configurable). La selección se persiste en metadata.pages del
   * proyecto; resolvePages la lee y LazyWorkBar la filtra.
   *
   * "De todo lo usable por el proyecto": lista los módulos con interfaz
   * registrados en el sistema (allModuleDefinitions). Cada uno con su nombre.
   * Los universales del sistema SIEMPRE se muestran (no se configuran aquí).
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { allModuleDefinitions } from '$lib/ui-core/lazy-registry';
  import { updateProject, getProject } from '$lib/stores/projects';
  import type { Project } from '$lib/stores/projects';

  let selected = new Set<string>();
  let saving = false;
  let resultado: { type: 'ok' | 'error' | 'info'; message: string } | null = null;
  let project: Project | null = null;

  $: projectSlug = $page.params.project_id;

  // Todos los módulos con interfaz (no universales) que el dueño puede activar.
  $: definibles = $allModuleDefinitions.filter(d => !d.universal);

  async function load() {
    try {
      const p = await getProject(projectSlug);
      project = p;
      selected = new Set<string>(p.pages || p.metadata?.pages || []);
    } catch (err: any) {
      resultado = { type: 'error', message: `No se pudo cargar el proyecto: ${err.message || 'error'}` };
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    selected = next;
  }

  async function guardar() {
    saving = true;
    resultado = { type: 'info', message: 'Guardando…' };
    try {
      // Respetar el orden: el orden de selección (Set) se preserva en la lista.
      await updateProject(projectSlug, { pages: [...selected] });
      resultado = { type: 'ok', message: 'Interfaz guardada para este proyecto' };
    } catch (err: any) {
      resultado = { type: 'error', message: `Guardar: ${err.message || 'fallo'}` };
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Configuración de interfaz</title>
</svelte:head>

<div class="cfg">
  <header class="cfg-head">
    <span class="cfg-title">⚙ Configuración de interfaz</span>
    <span class="cfg-sub">Elige qué paneles ves en este proyecto</span>
  </header>

  {#if resultado}
    <div class="resultado {resultado.type}">
      {resultado.type === 'ok' ? '✓' : resultado.type === 'error' ? '✗' : 'ℹ'} {resultado.message}
    </div>
  {/if}

  <div class="cfg-body">
    <p class="hint">
      Marca los paneles que quieres visibles en la workbar de este proyecto.
      Los módulos universales del sistema (interruptores/control del dueño) siempre
      se muestran y no se configuran aquí.
    </p>

    {#if definibles.length === 0}
      <div class="empty-state"><span>No hay módulos con interfaz disponibles</span></div>
    {:else}
      <div class="grid">
        {#each [...definibles].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)) as d (d.id)}
          <button
            class="card"
            class:cata={selected.has(d.id)}
            on:click={() => toggle(d.id)}
            aria-pressed={selected.has(d.id)}
          >
            <span class="card-ic">{d.icon}</span>
            <span class="card-label">{d.label}</span>
            <span class="card-check">{selected.has(d.id) ? '✓' : ''}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <footer class="cfg-foot">
    <button class="btn primary" on:click={guardar} disabled={saving}>
      {saving ? 'Guardando…' : 'Guardar interfaz'}
    </button>
  </footer>
</div>

<style>
  .cfg { display: flex; flex-direction: column; height: 100%; background: var(--color-bg, #0a0a0f); color: var(--color-text, #e5e5e5); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .cfg-head { padding: 1rem 1.25rem; background: var(--color-bg-elevated, #121218); border-bottom: 1px solid var(--color-border, #2a2a30); display: flex; flex-direction: column; gap: 0.2rem; }
  .cfg-title { font-weight: 600; font-size: 1.05rem; }
  .cfg-sub { font-size: 0.78rem; color: var(--color-text-dim, #888); }
  .resultado { padding: 0.5rem 1.25rem; font-size: 0.8rem; border-bottom: 1px solid var(--color-border, #2a2a30); }
  .resultado.ok { color: #22c55e; background: rgba(34,197,94,.08); }
  .resultado.error { color: #ef4444; background: rgba(239,68,68,.08); }
  .resultado.info { color: #3b82f6; background: rgba(59,130,246,.08); }
  .cfg-body { flex: 1; overflow-y: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
  .hint { font-size: 0.8rem; color: var(--color-text-dim, #888); margin: 0; max-width: 620px; line-height: 1.5; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 0.6rem; }
  .card { background: var(--color-bg-elevated, #14141a); border: 1px solid var(--color-border, #26262e); border-radius: 0.6rem; padding: 0.8rem; display: flex; align-items: center; gap: 0.6rem; cursor: pointer; transition: border-color .12s, background .12s; text-align: left; }
  .card:hover { border-color: var(--accent-color, #5b9df6); }
  .card.cata { background: var(--accent-bg, rgba(91,157,246,.14)); border-color: var(--accent-color, #5b9df6); }
  .card-ic { font-size: 1.1rem; }
  .card-label { flex: 1; font-size: 0.85rem; color: var(--color-text, #e5e5e5); }
  .card-check { color: var(--accent-color, #5b9df6); font-weight: 700; width: 1rem; text-align: center; }
  .empty-state { display: flex; align-items: center; justify-content: center; height: 120px; color: var(--color-text-dim, #666); font-size: 0.85rem; }
  .cfg-foot { padding: 0.8rem 1.25rem; background: var(--color-bg-elevated, #121218); border-top: 1px solid var(--color-border, #2a2a30); }
  .btn { background: var(--color-bg-elevated, #1a1a20); border: 1px solid var(--color-border, #2a2a30); color: var(--color-text, #ddd); border-radius: 0.5rem; padding: 0.5rem 1rem; font-size: 0.85rem; cursor: pointer; }
  .btn.primary { background: var(--accent-color, #5b9df6); border-color: var(--accent-color, #5b9df6); color: #111; font-weight: 600; }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
