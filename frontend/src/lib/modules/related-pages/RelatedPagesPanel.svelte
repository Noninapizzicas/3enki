<script lang="ts">
  /**
   * RelatedPagesPanel — Panel de paginas relacionadas (cajones Fase 5 bis).
   *
   * Modulo UI canonico: registrado via manifest.json en system-bar. El usuario
   * lo abre con click en el icono 🧭; el wrapper Panel.svelte provee chrome,
   * drag y close ESC.
   *
   * Renderiza una lista vertical de links a paginas vecinas del page activo
   * en el grafo (consumes + consumed_by, filtrado a navegables por el backend).
   * Datos via `mqttRequest('page', 'related', { page_id })` → ai-gateway.
   *
   * - `pageId` opcional: si no se pasa, se deduce del segundo segmento de
   *   `$page.url.pathname` (formato canonico `/<projectParam>/<pageId>/...`).
   * - `projectParam` opcional: usado para construir el href. Si no se pasa,
   *   se toma del primer segmento.
   *
   * Si la lista esta vacia → mensaje informativo (el panel no se autocierra).
   *
   * Contrato: arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json
   * Backend: modules/conversacion/ai-gateway/index.js::_executeNavTool('page.related', ...)
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { mqttRequest } from '$lib/ui-core';

  export let pageId: string | undefined = undefined;
  export let projectParam: string | undefined = undefined;
  export let maxVisible = 7;

  type RelatedResponse = {
    page_id: string;
    consumes: string[];
    consumed_by: string[];
    related: string[];
  };

  let related: string[] = [];
  let consumes: Set<string> = new Set();
  let consumedBy: Set<string> = new Set();
  let loading = false;
  let showAll = false;
  let lastLoaded: string | null = null;

  $: pathSegments = $page.url.pathname.split('/').filter(Boolean);
  $: resolvedProject = projectParam ?? pathSegments[0] ?? '';
  $: resolvedPageId = pageId ?? pathSegments[1] ?? '';
  $: visible = showAll ? related : related.slice(0, maxVisible);

  // Recargar cuando cambie el page activo.
  $: if (resolvedPageId && resolvedPageId !== lastLoaded) loadRelated(resolvedPageId);

  async function loadRelated(pid: string) {
    if (!pid) { related = []; lastLoaded = null; return; }
    loading = true;
    lastLoaded = pid;
    try {
      const res = await mqttRequest<RelatedResponse>('page', 'related', { page_id: pid }, { timeoutMs: 5000 });
      related = res?.related ?? [];
      consumes = new Set(res?.consumes ?? []);
      consumedBy = new Set(res?.consumed_by ?? []);
    } catch {
      // page.related puede no estar disponible (server viejo, page sin grafo).
      // No mostrar error al usuario — la lista queda vacia y el mensaje
      // informativo cubre el caso.
      related = [];
      consumes = new Set();
      consumedBy = new Set();
    } finally {
      loading = false;
    }
  }

  function navigate(target: string) {
    const href = resolvedProject ? `/${resolvedProject}/${target}` : `/${target}`;
    goto(href);
  }

  function relationLabel(target: string): string {
    const isConsumes = consumes.has(target);
    const isConsumed = consumedBy.has(target);
    if (isConsumes && isConsumed) return `relación circular con ${target}`;
    if (isConsumes) return `consume ${target}`;
    if (isConsumed) return `alimentado por ${target}`;
    return target;
  }
</script>

<div class="related-pages-panel">
  {#if loading && related.length === 0}
    <p class="status">cargando…</p>
  {:else if related.length === 0}
    <p class="status empty">
      {#if resolvedPageId}
        Sin páginas relacionadas para <code>{resolvedPageId}</code>.
      {:else}
        Sin página activa.
      {/if}
    </p>
  {:else}
    <ul class="list">
      {#each visible as target (target)}
        <li>
          <button
            type="button"
            class="link"
            on:click={() => navigate(target)}
            title={relationLabel(target)}
          >
            <span class="icon" aria-hidden="true">→</span>
            <span class="label">{target}</span>
          </button>
        </li>
      {/each}
      {#if related.length > maxVisible}
        <li>
          <button type="button" class="link more" on:click={() => (showAll = !showAll)}>
            {showAll ? 'menos' : `ver todos (${related.length})`}
          </button>
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .related-pages-panel {
    padding: 0.5rem 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
    min-width: 11rem;
  }

  .status {
    margin: 0;
    padding: 0.5rem;
    color: var(--color-text-muted, rgba(255, 255, 255, 0.55));
    font-size: 0.8rem;
  }

  .status.empty code {
    background: var(--color-code-bg, rgba(255, 255, 255, 0.08));
    padding: 0.05rem 0.3rem;
    border-radius: 0.2rem;
    font-size: 0.78rem;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .link {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--color-text, rgba(255, 255, 255, 0.9));
    padding: 0.4rem 0.55rem;
    border-radius: 0.25rem;
    cursor: pointer;
    display: flex;
    gap: 0.45rem;
    align-items: center;
    font-size: 0.9rem;
    transition: background-color 0.12s;
  }

  .link:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .icon {
    opacity: 0.5;
    flex-shrink: 0;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .more {
    font-size: 0.78rem;
    color: var(--color-text-muted, rgba(255, 255, 255, 0.55));
    font-style: italic;
  }
</style>
