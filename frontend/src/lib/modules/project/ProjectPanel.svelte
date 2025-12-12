<script lang="ts">
  /**
   * ProjectPanel - Panel de selección de proyecto
   *
   * Features:
   * - Lista de proyectos disponibles
   * - Colores distintivos
   * - Crear nuevo proyecto (futuro)
   */

  import { publish } from '$lib/ui-core';
  import { activeProject, selectProject } from '$lib/stores';
  import { closePanel } from '$lib/stores/ui';
  import type { Project } from '$lib/ui-core';
  import { PROJECT_COLORS } from '$lib/ui-core';

  export let panelId: string;

  // Demo projects - en producción vendrían del backend
  const demoProjects: Project[] = [
    { id: '1', name: 'POS Pizzería', color: 'orange', icon: '🍕', workspaceType: 'pos-pizzeria' },
    { id: '2', name: 'Desarrollo', color: 'blue', icon: '💻', workspaceType: 'desarrollo' },
    { id: '3', name: 'General', color: 'green', icon: '📋', workspaceType: 'general' },
  ];

  function getColorHex(colorId: string): string {
    const color = PROJECT_COLORS.find(c => c.id === colorId);
    return color?.hex || '#3b82f6';
  }

  function handleSelect(project: Project) {
    selectProject(project);
    closePanel();
  }
</script>

<div class="project-panel">
  <div class="projects-list">
    {#each demoProjects as project (project.id)}
      <button
        class="project-item"
        class:active={$activeProject?.id === project.id}
        style="--project-color: {getColorHex(project.color)}"
        on:click={() => handleSelect(project)}
      >
        <span class="project-icon">{project.icon}</span>
        <span class="project-name">{project.name}</span>
        <span class="project-color" style="background: {getColorHex(project.color)}"></span>
      </button>
    {/each}
  </div>

  <div class="actions">
    <button class="new-project" disabled>
      ➕ Nuevo proyecto
    </button>
  </div>
</div>

<style>
  .project-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
  }

  .projects-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .project-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-left: 3px solid var(--project-color, #3b82f6);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
    text-align: left;
    font-size: 0.9375rem;
  }

  .project-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .project-item.active {
    background: var(--color-active, rgba(255, 255, 255, 0.15));
    border-color: var(--project-color, #3b82f6);
  }

  .project-icon {
    font-size: 1.25rem;
  }

  .project-name {
    flex: 1;
  }

  .project-color {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
  }

  .actions {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .new-project {
    width: 100%;
    padding: 0.625rem 1rem;
    background: transparent;
    border: 1px dashed var(--color-border, rgba(255, 255, 255, 0.2));
    border-radius: 0.375rem;
    color: var(--color-text-muted, #a3a3a3);
    cursor: pointer;
    font-size: 0.875rem;
    transition: background-color 0.15s, border-color 0.15s;
  }

  .new-project:hover:not(:disabled) {
    background: var(--color-hover, rgba(255, 255, 255, 0.05));
    border-color: var(--color-text-muted, #a3a3a3);
  }

  .new-project:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
