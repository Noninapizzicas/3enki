<script lang="ts">
  /**
   * Pagina Menu Generator
   *
   * Misma base (AppShell con chat), pero la work-bar
   * muestra las herramientas de generacion de cartas.
   */
  import { onMount } from 'svelte';
  import { AppShell } from '$lib/components/layout';
  import { activeProject } from '$lib/stores/workspace';
  import { initProjects } from '$lib/stores/projects';

  let projectsCleanup: (() => void) | null = null;

  onMount(() => {
    projectsCleanup = initProjects();

    return () => {
      projectsCleanup?.();
    };
  });

  $: project = $activeProject;
</script>

<AppShell>
  <div slot="content" class="menu-generator-page">
    {#if !project}
      <div class="no-project">
        <span class="icon">📋</span>
        <h2>Selecciona un proyecto</h2>
        <p>Para generar cartas, primero debes seleccionar un proyecto activo.</p>
      </div>
    {/if}
  </div>
</AppShell>

<style>
  .menu-generator-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg, #121212);
  }

  .no-project {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    text-align: center;
    color: var(--color-text-muted, #888);
  }

  .no-project .icon {
    font-size: 3rem;
    opacity: 0.5;
  }

  .no-project h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
  }

  .no-project p {
    margin: 0;
    font-size: 0.875rem;
    max-width: 300px;
  }
</style>
