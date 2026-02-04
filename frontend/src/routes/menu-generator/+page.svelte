<script lang="ts">
  /**
   * Pagina Menu Generator
   *
   * Vista dedicada para generar cartas desde texto usando IA.
   * Usa el MenuGeneratorPanel como contenido principal.
   */
  import { onMount } from 'svelte';
  import { AppShell } from '$lib/components/layout';
  import { MenuGeneratorPanel } from '$lib/modules/menu-generator';
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
    {#if project}
      <header class="page-header">
        <h1>
          <span class="project-color" style="background: {project.color}"></span>
          {project.name}
          <span class="separator">/</span>
          <span class="page-title">Menu Generator</span>
        </h1>
      </header>
      <div class="panel-container">
        <MenuGeneratorPanel panelId="menu-generator-main" />
      </div>
    {:else}
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

  .page-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .page-header h1 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
  }

  .project-color {
    width: 4px;
    height: 1.25rem;
    border-radius: 2px;
  }

  .separator {
    color: var(--color-text-muted, #888);
    font-weight: 400;
  }

  .page-title {
    color: var(--color-text-muted, #888);
    font-weight: 400;
  }

  .panel-container {
    flex: 1;
    overflow: hidden;
    padding: 1rem 1.5rem;
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
