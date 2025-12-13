<script lang="ts">
  /**
   * FileViewer - Visor de archivos
   *
   * Features:
   * - Vista de árbol de archivos
   * - Expandir/colapsar carpetas
   * - Iconos por tipo de archivo
   * - Selección de archivo
   */

  import { createEventDispatcher } from 'svelte';
  import { slide } from 'svelte/transition';

  interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    size?: number;
    modified?: string;
  }

  export let files: FileNode[] = [];
  export let selectedPath: string | null = null;

  const dispatch = createEventDispatcher<{
    select: { path: string; type: 'file' | 'folder' };
    open: string;
  }>();

  let expandedFolders = new Set<string>();

  // Iconos por extensión
  const fileIcons: Record<string, string> = {
    js: '📜',
    ts: '📘',
    svelte: '🔶',
    json: '📋',
    md: '📝',
    css: '🎨',
    html: '🌐',
    png: '🖼️',
    jpg: '🖼️',
    svg: '🎯',
    pdf: '📕',
    default: '📄'
  };

  function getIcon(node: FileNode): string {
    if (node.type === 'folder') {
      return expandedFolders.has(node.path) ? '📂' : '📁';
    }
    const ext = node.name.split('.').pop()?.toLowerCase() || '';
    return fileIcons[ext] || fileIcons.default;
  }

  function toggleFolder(path: string) {
    if (expandedFolders.has(path)) {
      expandedFolders.delete(path);
    } else {
      expandedFolders.add(path);
    }
    expandedFolders = expandedFolders; // trigger reactivity
  }

  function handleClick(node: FileNode) {
    if (node.type === 'folder') {
      toggleFolder(node.path);
    }
    selectedPath = node.path;
    dispatch('select', { path: node.path, type: node.type });
  }

  function handleDoubleClick(node: FileNode) {
    if (node.type === 'file') {
      dispatch('open', node.path);
    }
  }

  function handleKeydown(event: KeyboardEvent, node: FileNode) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick(node);
    }
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="file-viewer">
  {#if files.length === 0}
    <div class="empty">
      <span class="empty-icon">📁</span>
      <p>No hay archivos</p>
    </div>
  {:else}
    <ul class="file-tree" role="tree">
      {#each files as node (node.path)}
        <li class="tree-item" role="treeitem" aria-expanded={node.type === 'folder' ? expandedFolders.has(node.path) : undefined}>
          <div
            class="tree-node"
            class:selected={selectedPath === node.path}
            class:folder={node.type === 'folder'}
            on:click={() => handleClick(node)}
            on:dblclick={() => handleDoubleClick(node)}
            on:keydown={(e) => handleKeydown(e, node)}
            tabindex="0"
            role="button"
          >
            <span class="icon">{getIcon(node)}</span>
            <span class="name">{node.name}</span>
            {#if node.size}
              <span class="size">{formatSize(node.size)}</span>
            {/if}
          </div>

          {#if node.type === 'folder' && node.children && expandedFolders.has(node.path)}
            <ul class="children" transition:slide={{ duration: 150 }} role="group">
              {#each node.children as child (child.path)}
                <li class="tree-item" role="treeitem">
                  <div
                    class="tree-node"
                    class:selected={selectedPath === child.path}
                    class:folder={child.type === 'folder'}
                    on:click={() => handleClick(child)}
                    on:dblclick={() => handleDoubleClick(child)}
                    on:keydown={(e) => handleKeydown(e, child)}
                    tabindex="0"
                    role="button"
                  >
                    <span class="icon">{getIcon(child)}</span>
                    <span class="name">{child.name}</span>
                    {#if child.size}
                      <span class="size">{formatSize(child.size)}</span>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .file-viewer {
    background: var(--color-surface, rgba(0, 0, 0, 0.2));
    border-radius: 0.5rem;
    overflow: auto;
    max-height: 400px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--color-text-muted, #a3a3a3);
    gap: 0.5rem;
  }

  .empty-icon {
    font-size: 2rem;
  }

  .empty p {
    margin: 0;
    font-size: 0.875rem;
  }

  .file-tree {
    list-style: none;
    margin: 0;
    padding: 0.5rem;
  }

  .tree-item {
    margin: 0;
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .tree-node:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .tree-node:focus {
    outline: none;
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .tree-node.selected {
    background: var(--color-primary-bg, rgba(59, 130, 246, 0.2));
  }

  .tree-node.folder {
    font-weight: 500;
  }

  .icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .name {
    flex: 1;
    font-size: 0.875rem;
    color: var(--color-text, #e5e5e5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .size {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    flex-shrink: 0;
  }

  .children {
    list-style: none;
    margin: 0;
    padding: 0;
    padding-left: 1.25rem;
  }
</style>
