<script lang="ts">
  /**
   * PageNavStrip — rail derecho de navegacion rapida + paneles de sistema.
   *
   * Sustituye a SystemBar. Dos secciones en una tira vertical pegada al borde
   * derecho (diseno elegido por el usuario, variante B: solo icono):
   *
   *   1. PAGINAS  — la pagina activa (destacada) + sus vecinas en el grafo
   *      (page.related). Un tap = goto directo a esa pagina, sin pasar por el
   *      chat ni por chat.cambiar_foco. Contextual: cambia segun donde estes.
   *
   *   2. SISTEMA  — los paneles de zona 'system-bar' (history, credentials...)
   *      que ya vivian en SystemBar. Se excluye related-pages-panel: ahora la
   *      navegacion es el rail, ese panel es redundante.
   *
   * Datos de paginas: mqttRequest('page','related',{page_id}) -> ai-gateway.
   * Iconos: del manifest de cada modulo-pagina (getDefinition). Fallback '→'.
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { mqttRequest, openPanel } from '$lib/ui-core';
  import { getDefinition } from '$lib/modules/definitions';
  import { getPanelsByZone } from '$lib/modules/panels';

  type RelatedResponse = { page_id: string; consumes: string[]; consumed_by: string[]; related: string[] };

  let related: string[] = [];
  let lastLoaded: string | null = null;

  $: segs = $page.url.pathname.split('/').filter(Boolean);
  $: project = segs[0] ?? '';
  $: currentPage = segs[1] ?? '';

  // paneles de sistema (sin el de paginas relacionadas: ya es el rail)
  $: systemPanels = getPanelsByZone('system-bar').filter(
    (p) => p.id !== 'related-pages-panel' && p.id !== 'related-pages'
  );

  $: if (currentPage && currentPage !== lastLoaded) loadRelated(currentPage);

  async function loadRelated(pid: string) {
    if (!pid) { related = []; lastLoaded = null; return; }
    lastLoaded = pid;
    try {
      const res = await mqttRequest<RelatedResponse>('page', 'related', { page_id: pid }, { timeoutMs: 5000 });
      related = res?.related ?? [];
    } catch {
      related = [];
    }
  }

  function iconFor(pid: string): string {
    return getDefinition(pid)?.icon ?? '→';
  }
  function labelFor(pid: string): string {
    return getDefinition(pid)?.label ?? pid;
  }
  function navigate(pid: string) {
    if (!pid || pid === currentPage) return;
    goto(project ? `/${project}/${pid}` : `/${pid}`);
  }
</script>

<nav class="page-nav-strip" aria-label="Navegación de páginas">
  {#if currentPage}
    <button class="pn-btn current" title={labelFor(currentPage)} disabled>
      <span class="ic" aria-hidden="true">{iconFor(currentPage)}</span>
    </button>
  {/if}

  {#each related as pid (pid)}
    <button class="pn-btn" on:click={() => navigate(pid)} title={`Ir a ${labelFor(pid)}`}>
      <span class="ic" aria-hidden="true">{iconFor(pid)}</span>
    </button>
  {/each}

  {#if systemPanels.length > 0}
    <div class="divider" aria-hidden="true"></div>
    {#each systemPanels as panel (panel.id)}
      <button class="pn-btn sys" on:click={() => openPanel(panel.id)} title={panel.title}>
        <span class="ic" aria-hidden="true">{panel.icon}</span>
      </button>
    {/each}
  {/if}
</nav>

<style>
  .page-nav-strip {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem 0.3rem;
    max-height: 84vh;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--color-system-bar-bg, rgba(0, 0, 0, 0.55));
    border-left: 1px solid var(--color-border, #2a2a30);
    border-top-left-radius: 0.6rem;
    border-bottom-left-radius: 0.6rem;
    backdrop-filter: blur(8px);
    z-index: 100;
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

  .pn-btn.sys { opacity: 0.72; }
  .pn-btn.sys:hover { opacity: 1; }

  .divider {
    width: 1.4rem;
    height: 1px;
    background: var(--color-border, #2a2a30);
    margin: 0.15rem 0;
    flex-shrink: 0;
  }
</style>
