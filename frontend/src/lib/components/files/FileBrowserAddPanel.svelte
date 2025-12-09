<!--
  FileBrowserAddPanel.svelte
  ==========================
  Panel para crear nuevos archivos o carpetas.

  Funcionalidades:
  - Seleccionar tipo: archivo o carpeta
  - Nombre con extensión
  - Selector de ubicación (path dentro del proyecto)

  Skinnable via CSS Variables:
  --filebrowser-add-bg, --filebrowser-add-color, --filebrowser-add-radius

  Uso:
    <FileBrowserAddPanel
      bind:open
      {projectId}
      currentPath="/"
      on:save={handleSave}
      on:cancel={handleCancel}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { FloatingPanel } from '$components/feedback';
  import { api } from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  export interface FileItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: string;
  }

  type ItemType = 'file' | 'directory';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel open state */
  export let open = false;

  /** Proyecto actual */
  export let projectId: string | null = null;

  /** Path actual (donde crear el archivo) */
  export let currentPath = '/';

  // ============================================================================
  // STATE
  // ============================================================================

  // Form
  let itemType: ItemType = 'file';
  let name = '';
  let selectedPath = '/';

  // UI
  let loading = false;
  let error = '';
  let directories: { path: string; name: string }[] = [];
  let loadingDirs = false;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    save: { item: FileItem };
    cancel: void;
  }>();

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: isValid = name.trim().length > 0 && projectId;
  $: fullPath = selectedPath === '/'
    ? `/${name.trim()}`
    : `${selectedPath}/${name.trim()}`;

  // ============================================================================
  // METHODS
  // ============================================================================

  /** Load directories for location selector */
  async function loadDirectories(): Promise<void> {
    if (!projectId) return;

    loadingDirs = true;
    try {
      const res = await fetch(
        api.moduleApi('file-browser', `/files?project_id=${projectId}&path=/`)
      );

      if (!res.ok) throw new Error('Error cargando directorios');

      const data = await res.json();

      // Filter only directories and flatten
      directories = [
        { path: '/', name: 'Raíz (/)' },
        ...(data.files || [])
          .filter((f: FileItem) => f.type === 'directory')
          .map((f: FileItem) => ({ path: f.path, name: f.name }))
      ];
    } catch (e) {
      directories = [{ path: '/', name: 'Raíz (/)' }];
    } finally {
      loadingDirs = false;
    }
  }

  /** Create file or directory */
  async function handleSubmit(): Promise<void> {
    if (!isValid || loading) return;

    loading = true;
    error = '';

    try {
      const res = await fetch(api.moduleApi('file-browser', '/files'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: name.trim(),
          path: selectedPath,
          type: itemType
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al crear');
      }

      const item = await res.json();

      dispatch('save', { item });
      resetForm();
      open = false;

    } catch (e) {
      error = e instanceof Error ? e.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }

  function handleCancel(): void {
    dispatch('cancel');
    resetForm();
    open = false;
  }

  function resetForm(): void {
    itemType = 'file';
    name = '';
    selectedPath = currentPath || '/';
    error = '';
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  $: if (open) {
    selectedPath = currentPath || '/';
    loadDirectories();
  }
</script>

<FloatingPanel bind:open title={itemType === 'file' ? '📄 Nuevo Archivo' : '📁 Nueva Carpeta'}>
  <form class="add-form" on:submit|preventDefault={handleSubmit}>

    <!-- Type selector -->
    <div class="add-form__field">
      <label class="add-form__label">Tipo</label>
      <div class="add-form__type-selector">
        <button
          type="button"
          class="type-btn"
          class:type-btn--active={itemType === 'file'}
          on:click={() => itemType = 'file'}
        >
          📄 Archivo
        </button>
        <button
          type="button"
          class="type-btn"
          class:type-btn--active={itemType === 'directory'}
          on:click={() => itemType = 'directory'}
        >
          📁 Carpeta
        </button>
      </div>
    </div>

    <!-- Name input -->
    <div class="add-form__field">
      <label class="add-form__label" for="file-name">
        Nombre
        {#if itemType === 'file'}
          <span class="add-form__hint">(incluir extensión: .md, .json, etc.)</span>
        {/if}
      </label>
      <input
        id="file-name"
        type="text"
        class="add-form__input"
        placeholder={itemType === 'file' ? 'documento.md' : 'nueva-carpeta'}
        bind:value={name}
        disabled={loading}
      />
    </div>

    <!-- Location selector -->
    <div class="add-form__field">
      <label class="add-form__label" for="file-path">Ubicación</label>
      <select
        id="file-path"
        class="add-form__select"
        bind:value={selectedPath}
        disabled={loading || loadingDirs}
      >
        {#if loadingDirs}
          <option value="/">Cargando...</option>
        {:else}
          {#each directories as dir}
            <option value={dir.path}>{dir.name}</option>
          {/each}
        {/if}
      </select>
    </div>

    <!-- Preview -->
    {#if name.trim()}
      <div class="add-form__preview">
        <span class="add-form__preview-label">Se creará:</span>
        <code class="add-form__preview-path">{fullPath}</code>
      </div>
    {/if}

    <!-- Error message -->
    {#if error}
      <div class="add-form__error">
        ⚠️ {error}
      </div>
    {/if}

    <!-- Actions -->
    <div class="add-form__actions">
      <button
        type="button"
        class="add-form__btn add-form__btn--secondary"
        on:click={handleCancel}
        disabled={loading}
      >
        Cancelar
      </button>
      <button
        type="submit"
        class="add-form__btn add-form__btn--primary"
        disabled={!isValid || loading}
      >
        {#if loading}
          Creando...
        {:else}
          ✓ Crear {itemType === 'file' ? 'Archivo' : 'Carpeta'}
        {/if}
      </button>
    </div>
  </form>
</FloatingPanel>

<style>
  .add-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    min-width: 320px;
    max-width: 400px;
  }

  .add-form__field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .add-form__label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-muted, #9ca3af);
  }

  .add-form__hint {
    font-weight: 400;
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .add-form__type-selector {
    display: flex;
    gap: 0.5rem;
  }

  .type-btn {
    flex: 1;
    padding: 0.625rem 1rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text-muted, #9ca3af);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 150ms ease;
  }

  .type-btn:hover {
    background: var(--color-bg-hover, #2a2f3a);
  }

  .type-btn--active {
    background: hsl(142 71% 45% / 0.15);
    color: hsl(142 71% 45%);
    border-color: hsl(142 71% 45% / 0.3);
  }

  .add-form__input,
  .add-form__select {
    padding: 0.625rem 0.875rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    transition: border-color 150ms ease;
  }

  .add-form__input:focus,
  .add-form__select:focus {
    outline: none;
    border-color: hsl(142 71% 45%);
  }

  .add-form__input::placeholder {
    color: var(--color-text-muted, #9ca3af);
    opacity: 0.6;
  }

  .add-form__preview {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    background: var(--color-bg-elevated, #232830);
    border-radius: var(--radius-md, 8px);
    font-size: 0.8125rem;
  }

  .add-form__preview-label {
    color: var(--color-text-muted, #9ca3af);
  }

  .add-form__preview-path {
    color: hsl(142 71% 45%);
    font-family: var(--font-mono, monospace);
    word-break: break-all;
  }

  .add-form__error {
    padding: 0.625rem 0.875rem;
    background: hsl(0 70% 50% / 0.1);
    color: hsl(0 70% 65%);
    border-radius: var(--radius-md, 8px);
    font-size: 0.8125rem;
  }

  .add-form__actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .add-form__btn {
    padding: 0.625rem 1.25rem;
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .add-form__btn--secondary {
    background: transparent;
    color: var(--color-text-muted, #9ca3af);
    border: 1px solid var(--color-border, #2e3440);
  }

  .add-form__btn--secondary:hover:not(:disabled) {
    background: var(--color-bg-elevated, #232830);
  }

  .add-form__btn--primary {
    background: hsl(142 71% 45%);
    color: white;
    border: none;
  }

  .add-form__btn--primary:hover:not(:disabled) {
    background: hsl(142 71% 40%);
  }

  .add-form__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
