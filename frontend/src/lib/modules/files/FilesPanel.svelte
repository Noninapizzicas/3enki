<script lang="ts">
  /**
   * FilesPanel - Panel de explorador de archivos
   *
   * Features:
   * - Navegación por directorios
   * - Selección de archivos para adjuntar
   * - Vista de lista
   */

  import { addAttachment, getFileType } from '$lib/stores/attachments';
  import { closePanel } from '$lib/stores/ui';
  import { publish } from '$lib/ui-core';

  export let panelId: string;

  interface FileItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    extension?: string;
  }

  // Demo files - en producción vendrían del backend via MQTT
  let currentPath = '/proyecto';
  let files: FileItem[] = [
    { name: 'src', path: '/proyecto/src', type: 'directory' },
    { name: 'docs', path: '/proyecto/docs', type: 'directory' },
    { name: 'README.md', path: '/proyecto/README.md', type: 'file', size: 2048, extension: 'md' },
    { name: 'package.json', path: '/proyecto/package.json', type: 'file', size: 1024, extension: 'json' },
    { name: 'config.ts', path: '/proyecto/config.ts', type: 'file', size: 512, extension: 'ts' },
  ];

  let selectedFiles = new Set<string>();

  function getIcon(item: FileItem): string {
    if (item.type === 'directory') return '📁';

    const icons: Record<string, string> = {
      md: '📝',
      json: '📋',
      ts: '💻',
      js: '💻',
      svelte: '🔥',
      pdf: '📕',
      png: '🖼️',
      jpg: '🖼️',
      txt: '📄',
    };

    return icons[item.extension || ''] || '📎';
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleItemClick(item: FileItem) {
    if (item.type === 'directory') {
      // Navegar al directorio
      currentPath = item.path;
      // En producción: publish('file/list', { path: item.path })
    } else {
      // Toggle selección
      if (selectedFiles.has(item.path)) {
        selectedFiles.delete(item.path);
      } else {
        selectedFiles.add(item.path);
      }
      selectedFiles = selectedFiles; // Trigger reactivity
    }
  }

  function handleGoUp() {
    const parts = currentPath.split('/');
    parts.pop();
    currentPath = parts.join('/') || '/';
    // En producción: publish('file/list', { path: currentPath })
  }

  function handleAttach() {
    const filesToAttach = files.filter(f => selectedFiles.has(f.path) && f.type === 'file');

    for (const file of filesToAttach) {
      addAttachment({
        name: file.name,
        path: file.path,
        type: getFileType(file.name),
        size: file.size
      });
    }

    selectedFiles.clear();
    closePanel();
  }
</script>

<div class="files-panel">
  <div class="header">
    <button class="up-btn" on:click={handleGoUp} disabled={currentPath === '/'}>
      ⬆️
    </button>
    <span class="path">{currentPath}</span>
  </div>

  <div class="file-list">
    {#each files as item (item.path)}
      <button
        class="file-item"
        class:selected={selectedFiles.has(item.path)}
        class:directory={item.type === 'directory'}
        on:click={() => handleItemClick(item)}
      >
        <span class="file-icon">{getIcon(item)}</span>
        <span class="file-name">{item.name}</span>
        {#if item.type === 'file'}
          <span class="file-size">{formatSize(item.size)}</span>
        {/if}
        {#if selectedFiles.has(item.path)}
          <span class="check">✓</span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="actions">
    <span class="selected-count">
      {selectedFiles.size} seleccionado{selectedFiles.size !== 1 ? 's' : ''}
    </span>
    <button
      class="attach-btn"
      disabled={selectedFiles.size === 0}
      on:click={handleAttach}
    >
      Adjuntar
    </button>
  </div>
</div>

<style>
  .files-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    margin-bottom: 0.75rem;
  }

  .up-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .up-btn:hover:not(:disabled) {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .up-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .path {
    flex: 1;
    font-size: 0.75rem;
    font-family: ui-monospace, monospace;
    color: var(--color-text-muted, #a3a3a3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
    text-align: left;
    font-size: 0.875rem;
  }

  .file-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.05));
  }

  .file-item.selected {
    background: var(--color-active, rgba(59, 130, 246, 0.15));
    border-color: var(--color-primary, #3b82f6);
  }

  .file-item.directory {
    color: var(--color-primary, #3b82f6);
  }

  .file-icon {
    font-size: 1rem;
    width: 1.25rem;
    text-align: center;
  }

  .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    font-family: ui-monospace, monospace;
  }

  .check {
    color: var(--color-primary, #3b82f6);
    font-weight: bold;
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    margin-top: 0.75rem;
  }

  .selected-count {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .attach-btn {
    padding: 0.5rem 1rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: background-color 0.15s;
  }

  .attach-btn:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .attach-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
