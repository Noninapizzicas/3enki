<script lang="ts">
  /**
   * RelatedPagesBar — Barra lateral de paginas relacionadas (cajones Fase 5 bis).
   *
   * Llama a `mqttRequest('page', 'related', { page_id })` al ai-gateway y
   * renderiza una lista vertical de links a paginas vecinas en el grafo
   * (consumes + consumed_by, ya filtrado a paginas navegables).
   *
   * - `pageId` opcional: si no se pasa, se deduce del segundo segmento de
   *   `$page.url.pathname` (formato canonico `/<projectParam>/<pageId>/...`).
   * - `projectParam` opcional: usado para construir el href. Si no se pasa,
   *   se toma del primer segmento.
   *
   * Sin notificaciones, sin badges. Navegacion ambiental, no alerta. Si la
   * lista esta vacia, NO renderiza nada.
   *
   * Contrato: arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json
   * Backend: modules/conversacion/ai-gateway/index.js::_executeNavTool('page.related', ...)
   */
  import { onMount, onDestroy } from 'svelte';
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
  let error: string | null = null;
  let showAll = false;

  $: pathSegments = $page.url.pathname.split('/').filter(Boolean);
  $: resolvedProject = projectParam ?? pathSegments[0] ?? '';
  $: resolvedPageId = pageId ?? pathSegments[1] ?? '';

  $: visible = showAll ? related : related.slice(0, maxVisible);

  // Recargar cuando cambie el page activo.
  $: if (resolvedPageId) loadRelated(resolvedPageId);

  async function loadRelated(pid: string) {
    if (!pid) { related = []; return; }
    loading = true;
    error = null;
    try {
      const res = await mqttRequest<RelatedResponse>('page', 'related', { page_id: pid }, { timeoutMs: 5000 });
      related = res?.related ?? [];
      consumes = new Set(res?.consumes ?? []);
      consumedBy = new Set(res?.consumed_by ?? []);
    } catch (err: unknown) {
      // No hacer ruido si page.related no esta disponible (server viejo, page sin grafo).
      // Tampoco mostrar el error al usuario — la barra simplemente queda vacia.
      related = [];
      consumes = new Set();
      consumedBy = new Set();
      error = err instanceof Error ? err.message : String(err);
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
    if (isConsumes && isConsumed) return `relacion circular con ${target}`;
    if (isConsumes) return `consume ${target}`;
    if (isConsumed) return `alimentado por ${target}`;
    return target;
  }
</script>

{#if related.length > 0}
  <nav class="related-pages-bar" aria-label="Paginas relacionadas">
    <h3 class="title">Relacionadas</h3>
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
  </nav>
{/if}

<style>
  .related-pages-bar {
    padding: 0.5rem 0.75rem;
    background: var(--color-bar-bg, rgba(0, 0, 0, 0.2));
    border-left: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    min-width: 10rem;
    max-width: 14rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
  }

  .title {
    margin: 0 0 0.4rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    font-weight: 600;
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
    color: var(--color-text, rgba(255, 255, 255, 0.85));
    padding: 0.35rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    display: flex;
    gap: 0.4rem;
    align-items: center;
    transition: background-color 0.12s;
  }

  .link:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.08));
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
    font-size: 0.75rem;
    color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    font-style: italic;
  }
</style>
