<!--
  FileBrowserConfigPanel.svelte
  =============================
  Panel de configuración para archivos y carpetas.

  Funcionalidades:
  - Ver información del archivo (tamaño, fecha, path)
  - Renombrar archivo/carpeta
  - Abrir en editor (si es archivo editable)
  - Eliminar archivo/carpeta

  Skinnable via CSS Variables:
  --filebrowser-config-bg, --filebrowser-config-color

  Uso:
    <FileBrowserConfigPanel
      bind:open
      {file}
      {projectId}
      on:update={handleUpdate}
      on:delete={handleDelete}
      on:openEditor={handleOpenEditor}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts" context="module">
  export interface FileItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: string;
    extension?: string;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { FloatingPanel } from '$components/feedback';
  import { api } from '$lib/config';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel open state */
  export let open = false;

  /** File/directory to configure */
  export let file: FileItem | null = null;

  /** Project ID */
  export let projectId: string | null = null;

  // ============================================================================
  // STATE
  // ============================================================================

  let editName = '';
  let loading = false;
  let error = '';
  let showDeleteConfirm = false;

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  const EDITABLE_EXTENSIONS = [
    'md', 'txt', 'json', 'js', 'ts', 'html', 'css', 'yaml', 'yml', 'xml', 'svg'
  ];

  const PDF_EXTENSIONS = ['pdf'];

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    update: { file: FileItem };
    delete: { path: string };
    openEditor: { file: FileItem };
    openPdf: { file: FileItem };
  }>();

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: extension = file?.name?.split('.').pop()?.toLowerCase() || '';
  $: isEditable = file?.type === 'file' && EDITABLE_EXTENSIONS.includes(extension);
  $: isPdf = file?.type === 'file' && PDF_EXTENSIONS.includes(extension);
  $: hasChanges = file && editName !== file.name;
  $: icon = file?.type === 'directory' ? '📁' : getFileIcon(extension);

  // Initialize editName when file changes
  $: if (file && open) {
    editName = file.name;
    showDeleteConfirm = false;
    error = '';
  }

  // ============================================================================
  // METHODS
  // ============================================================================

  function getFileIcon(ext: string): string {
    const icons: Record<string, string> = {
      md: '📝',
      txt: '📄',
      json: '📋',
      js: '🟨',
      ts: '🔷',
      html: '🌐',
      css: '🎨',
      pdf: '📕',
      png: '🖼️',
      jpg: '🖼️',
      jpeg: '🖼️',
      gif: '🖼️',
      svg: '🎨'
    };
    return icons[ext] || '📄';
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleString('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch {
      return dateStr;
    }
  }

  /** Rename file/directory */
  async function handleRename(): Promise<void> {
    if (!file || !hasChanges || loading || !projectId) return;

    loading = true;
    error = '';

    try {
      const res = await fetch(api.moduleApi('file-browser', '/files/rename'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          old_path: file.path,
          new_name: editName.trim()
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al renombrar');
      }

      const updatedFile = await res.json();
      dispatch('update', { file: updatedFile });
      open = false;

    } catch (e) {
      error = e instanceof Error ? e.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }

  /** Delete file/directory */
  async function handleDelete(): Promise<void> {
    if (!file || loading || !projectId) return;

    loading = true;
    error = '';

    try {
      const params = new URLSearchParams({
        project_id: projectId,
        file_path: file.path
      });

      const res = await fetch(
        api.moduleApi('file-browser', `/files?${params}`),
        { method: 'DELETE' }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al eliminar');
      }

      dispatch('delete', { path: file.path });
      open = false;

    } catch (e) {
      error = e instanceof Error ? e.message : 'Error desconocido';
    } finally {
      loading = false;
      showDeleteConfirm = false;
    }
  }

  /** Open in text editor */
  function handleOpenEditor(): void {
    if (!file || !isEditable) return;
    dispatch('openEditor', { file });
    open = false;
  }

  /** Open PDF viewer */
  function handleOpenPdf(): void {
    if (!file || !isPdf) return;
    dispatch('openPdf', { file });
    open = false;
  }

  function handleCancel(): void {
    showDeleteConfirm = false;
    open = false;
  }
</script>

<FloatingPanel bind:open title="⚙️ {file?.type === 'directory' ? 'Carpeta' : 'Archivo'}">
  {#if file}
    <div class="config-panel">

      <!-- File info header -->
      <div class="config-panel__header">
        <span class="config-panel__icon">{icon}</span>
        <div class="config-panel__info">
          <span class="config-panel__name">{file.name}</span>
          <span class="config-panel__path">{file.path}</span>
        </div>
      </div>

      <!-- Metadata -->
      <div class="config-panel__meta">
        {#if file.type === 'file'}
          <div class="meta-item">
            <span class="meta-label">Tamaño</span>
            <span class="meta-value">{formatSize(file.size)}</span>
          </div>
        {/if}
        <div class="meta-item">
          <span class="meta-label">Modificado</span>
          <span class="meta-value">{formatDate(file.modified)}</span>
        </div>
        {#if extension}
          <div class="meta-item">
            <span class="meta-label">Extensión</span>
            <span class="meta-value">.{extension}</span>
          </div>
        {/if}
      </div>

      <!-- Rename field -->
      <div class="config-panel__field">
        <label class="config-panel__label" for="rename-input">Nombre</label>
        <input
          id="rename-input"
          type="text"
          class="config-panel__input"
          bind:value={editName}
          disabled={loading}
        />
      </div>

      <!-- Quick actions -->
      {#if isEditable}
        <button
          type="button"
          class="config-panel__action-btn"
          on:click={handleOpenEditor}
          disabled={loading}
        >
          📝 Abrir en Editor
        </button>
      {/if}

      {#if isPdf}
        <button
          type="button"
          class="config-panel__action-btn config-panel__action-btn--pdf"
          on:click={handleOpenPdf}
          disabled={loading}
        >
          📕 Ver PDF
        </button>
      {/if}

      <!-- Error -->
      {#if error}
        <div class="config-panel__error">
          ⚠️ {error}
        </div>
      {/if}

      <!-- Delete confirmation -->
      {#if showDeleteConfirm}
        <div class="config-panel__confirm">
          <p class="config-panel__confirm-text">
            ¿Eliminar {file.type === 'directory' ? 'carpeta' : 'archivo'} <strong>{file.name}</strong>?
            {#if file.type === 'directory'}
              <br><span class="warning-text">Se eliminarán todos los contenidos.</span>
            {/if}
          </p>
          <div class="config-panel__confirm-actions">
            <button
              type="button"
              class="config-panel__btn config-panel__btn--ghost"
              on:click={() => showDeleteConfirm = false}
              disabled={loading}
            >
              No, cancelar
            </button>
            <button
              type="button"
              class="config-panel__btn config-panel__btn--danger"
              on:click={handleDelete}
              disabled={loading}
            >
              {loading ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </div>
      {:else}
        <!-- Actions -->
        <div class="config-panel__actions">
          <button
            type="button"
            class="config-panel__btn config-panel__btn--danger-outline"
            on:click={() => showDeleteConfirm = true}
            disabled={loading}
          >
            🗑️ Eliminar
          </button>
          <div class="config-panel__actions-right">
            <button
              type="button"
              class="config-panel__btn config-panel__btn--secondary"
              on:click={handleCancel}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              class="config-panel__btn config-panel__btn--primary"
              on:click={handleRename}
              disabled={!hasChanges || loading}
            >
              {loading ? 'Guardando...' : '💾 Guardar'}
            </button>
          </div>
        </div>
      {/if}

    </div>
  {:else}
    <div class="config-panel config-panel--empty">
      <p>Selecciona un archivo o carpeta primero</p>
    </div>
  {/if}
</FloatingPanel>

<style>
  .config-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    min-width: 340px;
    max-width: 420px;
  }

  .config-panel--empty {
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted, #9ca3af);
  }

  /* Header */
  .config-panel__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--color-bg-elevated, #232830);
    border-radius: var(--radius-md, 8px);
  }

  .config-panel__icon {
    font-size: 2rem;
  }

  .config-panel__info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    flex: 1;
  }

  .config-panel__name {
    font-weight: 600;
    color: var(--color-text, #ffffff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .config-panel__path {
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Metadata */
  .config-panel__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-bg-elevated, #232830);
    border-radius: var(--radius-sm, 6px);
    flex: 1;
    min-width: 80px;
  }

  .meta-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #9ca3af);
  }

  .meta-value {
    font-size: 0.8125rem;
    color: var(--color-text, #ffffff);
  }

  /* Field */
  .config-panel__field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .config-panel__label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-muted, #9ca3af);
  }

  .config-panel__input {
    padding: 0.625rem 0.875rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    transition: border-color 150ms ease;
  }

  .config-panel__input:focus {
    outline: none;
    border-color: hsl(142 71% 45%);
  }

  /* Action button (open editor/pdf) */
  .config-panel__action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: hsl(142 71% 45% / 0.1);
    color: hsl(142 71% 45%);
    border: 1px solid hsl(142 71% 45% / 0.2);
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .config-panel__action-btn:hover:not(:disabled) {
    background: hsl(142 71% 45% / 0.15);
    border-color: hsl(142 71% 45% / 0.3);
  }

  .config-panel__action-btn--pdf {
    background: hsl(0 70% 50% / 0.1);
    color: hsl(0 70% 65%);
    border-color: hsl(0 70% 50% / 0.2);
  }

  .config-panel__action-btn--pdf:hover:not(:disabled) {
    background: hsl(0 70% 50% / 0.15);
    border-color: hsl(0 70% 50% / 0.3);
  }

  /* Error */
  .config-panel__error {
    padding: 0.625rem 0.875rem;
    background: hsl(0 70% 50% / 0.1);
    color: hsl(0 70% 65%);
    border-radius: var(--radius-md, 8px);
    font-size: 0.8125rem;
  }

  /* Confirmation */
  .config-panel__confirm {
    padding: 1rem;
    background: hsl(0 70% 50% / 0.1);
    border: 1px solid hsl(0 70% 50% / 0.2);
    border-radius: var(--radius-md, 8px);
  }

  .config-panel__confirm-text {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    color: var(--color-text, #ffffff);
    line-height: 1.5;
  }

  .warning-text {
    color: hsl(0 70% 65%);
    font-size: 0.8125rem;
  }

  .config-panel__confirm-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  /* Actions */
  .config-panel__actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.5rem;
  }

  .config-panel__actions-right {
    display: flex;
    gap: 0.75rem;
  }

  /* Buttons */
  .config-panel__btn {
    padding: 0.625rem 1rem;
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .config-panel__btn--primary {
    background: hsl(142 71% 45%);
    color: white;
    border: none;
  }

  .config-panel__btn--primary:hover:not(:disabled) {
    background: hsl(142 71% 40%);
  }

  .config-panel__btn--secondary {
    background: transparent;
    color: var(--color-text-muted, #9ca3af);
    border: 1px solid var(--color-border, #2e3440);
  }

  .config-panel__btn--secondary:hover:not(:disabled) {
    background: var(--color-bg-elevated, #232830);
  }

  .config-panel__btn--danger {
    background: hsl(0 70% 50%);
    color: white;
    border: none;
  }

  .config-panel__btn--danger:hover:not(:disabled) {
    background: hsl(0 70% 45%);
  }

  .config-panel__btn--danger-outline {
    background: transparent;
    color: hsl(0 70% 65%);
    border: 1px solid hsl(0 70% 50% / 0.3);
  }

  .config-panel__btn--danger-outline:hover:not(:disabled) {
    background: hsl(0 70% 50% / 0.1);
  }

  .config-panel__btn--ghost {
    background: transparent;
    color: var(--color-text-muted, #9ca3af);
    border: none;
  }

  .config-panel__btn--ghost:hover:not(:disabled) {
    background: var(--color-bg-elevated, #232830);
  }

  .config-panel__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
