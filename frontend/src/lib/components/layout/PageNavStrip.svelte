<script lang="ts">
  /**
   * PageNavStrip — rail derecho de navegacion rapida entre paginas del proyecto.
   *
   * Tira vertical compacta pegada al borde derecho (solo icono). El page-set EMERGE
   * del proyecto activo (project-pages: config del proyecto → semilla por tipo), NO
   * de una lista clavada: un proyecto prisma nace con el rail VACÍO; un pizzepos trae
   * su set. La pagina activa se destaca; un tap en otra = goto directo, sin pasar por
   * el chat ni por chat.cambiar_foco. Sin seccion de sistema, sin hueco central.
   */
  import { getContext } from 'svelte';
  import { writable, type Writable } from 'svelte/store';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { pagesFromIds, seedFallback } from '$lib/ui-core/project-pages';

  // El proyecto activo lo aporta [project_id]/+layout via setContext('project').
  // Sin contexto (rutas planas sin proyecto) → fallback al set histórico pizzepos.
  const projectCtx = getContext<Writable<{ pages?: string[] } > | undefined>('project') ?? writable<{ pages?: string[] }>(null as any);

  // page-set del proyecto → PageDefs (icono+etiqueta del catálogo, en orden).
  $: pageIds = $projectCtx?.pages ?? seedFallback();
  $: PAGES = pagesFromIds(pageIds);

  $: segs = $page.url.pathname.split('/').filter(Boolean);
  $: project = segs[0] ?? '';
  $: currentPage = segs[1] ?? '';

  function navigate(pid: string) {
    if (!pid || pid === currentPage) return;
    goto(project ? `/${project}/${pid}` : `/${pid}`);
  }
</script>

<!-- rail VACÍO (page-set vacío, p.ej. proyecto prisma nuevo) → no se pinta la tira -->
{#if PAGES.length > 0}
<nav class="page-nav-strip" aria-label="Navegación de páginas">
  {#each PAGES as p (p.id)}
    <button
      class="pn-btn"
      class:current={p.id === currentPage}
      on:click={() => navigate(p.id)}
      disabled={p.id === currentPage}
      title={p.id === currentPage ? p.label : `Ir a ${p.label}`}
    >
      <span class="ic" aria-hidden="true">{p.icon}</span>
    </button>
  {/each}
</nav>
{/if}

<style>
  .page-nav-strip {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.45rem 0.3rem;
    background: var(--color-system-bar-bg, rgba(0, 0, 0, 0.55));
    border: 1px solid var(--color-border, #2a2a30);
    border-right: none;
    border-top-left-radius: 0.6rem;
    border-bottom-left-radius: 0.6rem;
    backdrop-filter: blur(8px);
    z-index: 100;
    max-height: 88vh;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }
  .page-nav-strip::-webkit-scrollbar { display: none; }

  .pn-btn {
    width: 2.2rem;
    height: 2.2rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-elevated, #1c1c21);
    border: 1px solid var(--color-border, #2a2a30);
    border-radius: 0.55rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    transition: background-color 0.12s, border-color 0.12s, transform 0.08s;
  }
  .pn-btn .ic { font-size: 1.05rem; line-height: 1; }

  .pn-btn:not(.current):hover {
    background: var(--color-hover, rgba(91, 157, 246, 0.16));
    border-color: var(--accent-color, #5b9df6);
  }
  .pn-btn:active { transform: scale(0.94); }

  .pn-btn.current {
    background: var(--accent-bg, rgba(91, 157, 246, 0.18));
    border-color: var(--accent-color, #5b9df6);
    cursor: default;
  }
</style>
