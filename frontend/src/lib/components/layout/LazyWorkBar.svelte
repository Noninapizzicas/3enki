<script lang="ts">
  /**
   * LazyWorkBar - Barra de trabajo con carga bajo demanda
   *
   * Solo muestra íconos de las definiciones.
   * Al hacer click, carga el módulo correspondiente.
   */
  import { getContext } from 'svelte';
  import { writable, type Writable } from 'svelte/store';
  import { workBarDefinitions, moduleLoadState } from '$lib/ui-core/lazy-registry';
  import LazyButton from '$lib/components/base/LazyButton.svelte';

  let expanded = true;

  function toggleExpand() {
    expanded = !expanded;
  }

  // El proyecto activo (via [project_id]/+layout). Un proyecto con page-set VACÍO (p.ej. prisma
  // nuevo) → work-bar sin sus botones de DOMINIO (módulos pizzepos que no le pertenecen), PERO
  // conserva los módulos UNIVERSALES del sistema (interruptores: el on/off del dueño, kill-switches
  // y features). El gate esconde páginas de dominio, NO el control soberano. Sin contexto (rutas
  // planas) o con page-set no vacío → comportamiento previo (filtra por zona+ruta).
  const projectCtx = getContext<Writable<{ pages?: string[] }> | undefined>('project') ?? writable<{ pages?: string[] }>(null as any);
  $: emptyPageSet = Array.isArray($projectCtx?.pages) && $projectCtx.pages.length === 0;
  $: defs = emptyPageSet ? $workBarDefinitions.filter(d => d.universal) : $workBarDefinitions;
</script>

<div class="workbar" class:collapsed={!expanded}>
  <div class="workbar-content">
    {#each defs as def (def.id)}
      <LazyButton
        definition={def}
        size="md"
        showLabel={expanded}
        on:loaded={(e) => console.log('[WorkBar] Loaded:', e.detail.id)}
      />
    {/each}
  </div>

  <button class="toggle-btn" on:click={toggleExpand} title={expanded ? 'Colapsar' : 'Expandir'}>
    {expanded ? '▲' : '▼'}
  </button>
</div>

<style>
  .workbar {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    background: var(--color-bg-elevated, #1a1a1a);
    border-bottom: 1px solid var(--color-border, #333);
    gap: 0.5rem;
    transition: padding 0.2s ease;
  }

  .workbar.collapsed {
    padding: 0.25rem 1rem;
  }

  .workbar-content {
    display: flex;
    flex: 1;
    gap: 0.5rem;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;           /* Firefox */
  }
  .workbar-content::-webkit-scrollbar { display: none; }  /* Chrome/Safari */

  .collapsed .workbar-content {
    gap: 0.25rem;
  }

  .toggle-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted, #666);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border-radius: 0.25rem;
    transition: color 0.15s;
  }

  .toggle-btn:hover {
    color: var(--color-text, #e5e5e5);
    background: var(--color-bg-hover, rgba(255,255,255,0.05));
  }
</style>
