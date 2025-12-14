<script lang="ts">
  /**
   * ProjectPanel - Panel de gestión de proyectos
   *
   * Patrón UI:
   * - 1 clic = 1 panel (sin tabs)
   * - Acciones inline (editar, eliminar)
   * - Form expandible para crear nuevo
   * - Conectado a backend via HTTP
   */

  import { onMount } from 'svelte';
  import { activeProject, selectProject } from '$lib/stores';
  import { closePanel } from '$lib/stores/ui';
  import type { Project } from '$lib/ui-core';
  import { PROJECT_COLORS } from '$lib/ui-core';

  export let panelId: string;

  // Estado
  let projects: Project[] = [];
  let loading = true;
  let error: string | null = null;
  let searchQuery = '';
  let showAddForm = false;
  let editingId: string | null = null;

  // Form nuevo proyecto
  let newProject = { name: '', description: '', color: 'blue' };

  // Form editar
  let editForm = { name: '', description: '' };

  // API base URL - usa el proxy de Vite
  const API_BASE = '/modules/project-manager';

  // Logger helper
  async function logAction(action: string, context: Record<string, unknown> = {}) {
    try {
      await fetch('/modules/log-manager/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'info',
          source: 'frontend',
          module: 'project-panel',
          message: `project.${action}`,
          context
        })
      });
    } catch {
      // Silenciar errores de logging
    }
  }

  // Cargar proyectos al montar
  onMount(async () => {
    logAction('panel.opened');
    await loadProjects();
  });

  async function loadProjects() {
    loading = true;
    error = null;

    try {
      const res = await fetch(`${API_BASE}/projects`);
      const data = await res.json();

      if (data.success) {
        projects = data.projects.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          color: p.metadata?.color || 'blue',
          icon: p.metadata?.icon || '📁',
          workspaceType: p.metadata?.workspaceType || 'general',
          isActive: p.is_active
        }));
        logAction('list.loaded', { count: projects.length });
      } else {
        error = data.error || 'Error al cargar proyectos';
        logAction('list.error', { error });
      }
    } catch (e) {
      error = 'No se pudo conectar con el servidor';
      console.error('[ProjectPanel] Error:', e);
      logAction('list.error', { error: 'connection_failed' });
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    if (!newProject.name.trim()) return;

    logAction('create.started', { name: newProject.name });

    try {
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProject.name,
          description: newProject.description,
          metadata: { color: newProject.color, icon: '📁', workspaceType: 'general' }
        })
      });

      const data = await res.json();

      if (data.success) {
        logAction('create.success', { projectId: data.project?.id, name: newProject.name });
        await loadProjects();
        newProject = { name: '', description: '', color: 'blue' };
        showAddForm = false;
      } else {
        error = data.error || 'Error al crear proyecto';
        logAction('create.error', { error });
      }
    } catch (e) {
      error = 'No se pudo crear el proyecto';
      logAction('create.error', { error: 'connection_failed' });
    }
  }

  async function handleSelect(project: Project) {
    logAction('select', { projectId: project.id, name: project.name });

    // Activar en backend
    try {
      await fetch(`${API_BASE}/projects/${project.id}/activate`, { method: 'POST' });
      logAction('activate.success', { projectId: project.id, name: project.name });
    } catch (e) {
      console.error('[ProjectPanel] Error activating:', e);
      logAction('activate.error', { projectId: project.id, error: 'connection_failed' });
    }

    selectProject(project);
    closePanel();
  }

  function startEdit(project: Project, event: MouseEvent) {
    event.stopPropagation();
    editingId = project.id;
    editForm = { name: project.name, description: project.description || '' };
  }

  async function handleUpdate(projectId: string) {
    if (!editForm.name.trim()) return;

    logAction('update.started', { projectId, name: editForm.name });

    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description
        })
      });

      const data = await res.json();

      if (data.success) {
        logAction('update.success', { projectId, name: editForm.name });
        await loadProjects();
        editingId = null;
      } else {
        error = data.error || 'Error al actualizar';
        logAction('update.error', { projectId, error });
      }
    } catch (e) {
      error = 'No se pudo actualizar el proyecto';
      logAction('update.error', { projectId, error: 'connection_failed' });
    }
  }

  async function handleDelete(projectId: string, event: MouseEvent) {
    event.stopPropagation();

    if (!confirm('¿Eliminar este proyecto?')) return;

    logAction('delete.started', { projectId });

    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        logAction('delete.success', { projectId });
        await loadProjects();
      } else {
        error = data.error || 'Error al eliminar';
        logAction('delete.error', { projectId, error });
      }
    } catch (e) {
      error = 'No se pudo eliminar el proyecto';
      logAction('delete.error', { projectId, error: 'connection_failed' });
    }
  }

  function cancelEdit() {
    editingId = null;
  }

  function getColorHex(colorId: string): string {
    const color = PROJECT_COLORS.find(c => c.id === colorId);
    return color?.hex || '#3b82f6';
  }

  // Filtrar por búsqueda
  $: filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
</script>

<div class="project-panel">
  <!-- Header: Búsqueda + Añadir -->
  <div class="header">
    <input
      type="text"
      class="search"
      placeholder="🔍 Buscar proyecto..."
      bind:value={searchQuery}
    />
    <button
      class="add-btn"
      class:active={showAddForm}
      on:click={() => showAddForm = !showAddForm}
      title="Nuevo proyecto"
    >
      {showAddForm ? '✕' : '+'}
    </button>
  </div>

  <!-- Form crear (expandible) -->
  {#if showAddForm}
    <div class="add-form">
      <input
        type="text"
        placeholder="Nombre del proyecto"
        bind:value={newProject.name}
        on:keydown={(e) => e.key === 'Enter' && handleCreate()}
      />
      <input
        type="text"
        placeholder="Descripción (opcional)"
        bind:value={newProject.description}
      />
      <div class="color-picker">
        {#each PROJECT_COLORS as color (color.id)}
          <button
            class="color-option"
            class:selected={newProject.color === color.id}
            style="background: {color.hex}"
            on:click={() => newProject.color = color.id}
            title={color.id}
          />
        {/each}
      </div>
      <button class="create-btn" on:click={handleCreate} disabled={!newProject.name.trim()}>
        Crear proyecto
      </button>
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="error">
      ⚠️ {error}
      <button class="retry" on:click={loadProjects}>Reintentar</button>
    </div>
  {/if}

  <!-- Lista -->
  <div class="projects-list">
    {#if loading}
      <div class="loading">Cargando proyectos...</div>
    {:else if filteredProjects.length === 0}
      <div class="empty">
        {searchQuery ? 'No hay resultados' : 'Sin proyectos'}
      </div>
    {:else}
      {#each filteredProjects as project (project.id)}
        {#if editingId === project.id}
          <!-- Modo edición inline -->
          <div class="project-item editing">
            <input
              type="text"
              class="edit-input"
              bind:value={editForm.name}
              on:keydown={(e) => e.key === 'Enter' && handleUpdate(project.id)}
              on:keydown={(e) => e.key === 'Escape' && cancelEdit()}
            />
            <button class="action-btn save" on:click={() => handleUpdate(project.id)}>✓</button>
            <button class="action-btn cancel" on:click={cancelEdit}>✕</button>
          </div>
        {:else}
          <!-- Item normal -->
          <button
            class="project-item"
            class:active={$activeProject?.id === project.id}
            style="--project-color: {getColorHex(project.color)}"
            on:click={() => handleSelect(project)}
          >
            <span class="project-indicator" style="background: {getColorHex(project.color)}"></span>
            <span class="project-icon">{project.icon}</span>
            <span class="project-name">{project.name}</span>
            {#if project.isActive}
              <span class="active-badge">activo</span>
            {/if}
            <button class="action-btn edit" on:click={(e) => startEdit(project, e)} title="Editar">✏️</button>
            <button class="action-btn delete" on:click={(e) => handleDelete(project.id, e)} title="Eliminar">🗑️</button>
          </button>
        {/if}
      {/each}
    {/if}
  </div>
</div>

<style>
  .project-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
  }

  /* Header */
  .header {
    display: flex;
    gap: 0.5rem;
  }

  .search {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: var(--color-bg, #0a0a0a);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.875rem;
  }

  .search:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .add-btn {
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    font-size: 1.25rem;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .add-btn:hover {
    background: var(--color-primary-hover, #2563eb);
  }

  .add-btn.active {
    background: var(--color-error, #ef4444);
  }

  /* Form crear */
  .add-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
  }

  .add-form input {
    padding: 0.5rem 0.75rem;
    background: var(--color-bg, #0a0a0a);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.875rem;
  }

  .add-form input:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .color-picker {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
  }

  .color-option {
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid transparent;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.15s;
  }

  .color-option:hover {
    transform: scale(1.1);
  }

  .color-option.selected {
    border-color: white;
  }

  .create-btn {
    padding: 0.5rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.25rem;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .create-btn:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .create-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Error */
  .error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.375rem;
    color: #ef4444;
    font-size: 0.875rem;
  }

  .retry {
    margin-left: auto;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 0.25rem;
    color: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  /* Lista */
  .projects-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    flex: 1;
    overflow-y: auto;
  }

  .loading, .empty {
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted, #a3a3a3);
    font-size: 0.875rem;
  }

  /* Item */
  .project-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    font-size: 0.9375rem;
    width: 100%;
  }

  .project-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .project-item.active {
    background: var(--color-active, rgba(59, 130, 246, 0.15));
    border-color: var(--color-primary, #3b82f6);
  }

  .project-item.editing {
    cursor: default;
  }

  .project-indicator {
    width: 4px;
    height: 1.5rem;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .project-icon {
    font-size: 1.125rem;
    flex-shrink: 0;
  }

  .project-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .active-badge {
    padding: 0.125rem 0.375rem;
    background: var(--color-success, #22c55e);
    border-radius: 0.25rem;
    color: white;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  /* Acciones inline */
  .action-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    opacity: 0;
    transition: opacity 0.15s, background-color 0.15s;
  }

  .project-item:hover .action-btn {
    opacity: 0.7;
  }

  .action-btn:hover {
    opacity: 1 !important;
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .action-btn.delete:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .action-btn.save {
    opacity: 1;
    color: var(--color-success, #22c55e);
  }

  .action-btn.cancel {
    opacity: 1;
    color: var(--color-text-muted, #a3a3a3);
  }

  /* Edit input */
  .edit-input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    background: var(--color-bg, #0a0a0a);
    border: 1px solid var(--color-primary, #3b82f6);
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.875rem;
  }

  .edit-input:focus {
    outline: none;
  }
</style>
