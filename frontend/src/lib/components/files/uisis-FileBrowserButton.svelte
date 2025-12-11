<!--
  FileBrowserButton.svelte
  ========================
  Botón unificado para navegación de archivos con TRIPLE interacción.
  Usa GestureButton como base para el manejo de gestos.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre selector de archivos (árbol navegable)
  - Doble tap/Doble click: Abre FileBrowserAddPanel (crear archivo/carpeta)
  - Long press / Click derecho: Abre FileBrowserConfigPanel (gestionar archivo)

  file-browser usa enableAdd=true (se pueden crear desde UI).

  Skinnable via CSS Variables (desde tokens.json):
  --gesture-btn-bg, --gesture-btn-bg-hover, --gesture-btn-bg-active

  Uso:
    <FileBrowserButton
      size="md"
      {projectId}
      on:select={handleSelect}
      on:add={handleAdd}
      on:config={handleConfig}
      on:openEditor={handleOpenEditor}
      on:openPdf={handleOpenPdf}
    />

  @version 2.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { slide } from 'svelte/transition';
  import { GestureButton } from '$components/ui';
  import { FloatingPanel } from '$components/feedback';
  import FileBrowserAddPanel from './uisis-FileBrowserAddPanel.svelte';
  import FileBrowserConfigPanel from './uisis-FileBrowserConfigPanel.svelte';
  import type { FileItem } from './uisis-FileBrowserConfigPanel.svelte';
  import { api } from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  interface TreeNode extends FileItem {
    children?: TreeNode[];
    expanded?: boolean;
    loading?: boolean;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón (sm: 44px, md: 56px, lg: 72px) */
  export let size: Size = 'md';

  /** Proyecto actual (requerido para navegar archivos) */
  export let projectId: string | null = null;

  /** Mostrar label debajo del icono */
  export let showLabel = true;

  /** Deshabilitar interacciones */
  export let disabled = false;

  // ============================================================================
  // STATE
  // ============================================================================

  // Panel states
  let selectorOpen = false;
  let addOpen = false;
  let configOpen = false;

  // File tree state
  let tree: TreeNode[] = [];
  let loading = false;
  let error = '';
  let searchQuery = '';
  let currentPath = '/';

  // Selected file for config panel
  let selectedFile: FileItem | null = null;

  // Display
  const currentIcon = '📁';
  const currentLabel = 'Archivos';

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: filteredTree = searchQuery ? filterTree(tree, searchQuery.toLowerCase()) : tree;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    select: { file: FileItem };
    add: { path: string };
    config: { file: FileItem };
    openEditor: { file: FileItem };
    openPdf: { file: FileItem };
  }>();

  // ============================================================================
  // FILE TREE OPERATIONS
  // ============================================================================

  /** Load files for a given path */
  async function loadFiles(path: string = '/'): Promise<FileItem[]> {
    if (!projectId) return [];

    const params = new URLSearchParams({
      project_id: projectId,
      path
    });

    const res = await fetch(api.moduleApi('file-browser', `/files?${params}`));

    if (!res.ok) {
      throw new Error('Error cargando archivos');
    }

    const data = await res.json();
    return data.files || [];
  }

  /** Load root directory */
  async function loadRootTree(): Promise<void> {
    if (!projectId) {
      error = 'Selecciona un proyecto primero';
      return;
    }

    loading = true;
    error = '';

    try {
      const files = await loadFiles('/');
      tree = files.map(f => ({
        ...f,
        expanded: false,
        children: f.type === 'directory' ? undefined : undefined
      }));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }

  /** Toggle directory expansion */
  async function toggleDirectory(node: TreeNode): Promise<void> {
    if (node.type !== 'directory') return;

    // If already expanded, just collapse
    if (node.expanded) {
      node.expanded = false;
      tree = tree;
      return;
    }

    // Load children if not loaded
    if (!node.children) {
      node.loading = true;
      tree = tree;

      try {
        const files = await loadFiles(node.path);
        node.children = files.map(f => ({
          ...f,
          expanded: false,
          children: f.type === 'directory' ? undefined : undefined
        }));
      } catch {
        node.children = [];
      } finally {
        node.loading = false;
      }
    }

    node.expanded = true;
    tree = tree;
  }

  /** Filter tree by search query */
  function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
    const result: TreeNode[] = [];

    for (const node of nodes) {
      const nameMatches = node.name.toLowerCase().includes(query);

      if (node.type === 'directory' && node.children) {
        const filteredChildren = filterTree(node.children, query);
        if (filteredChildren.length > 0 || nameMatches) {
          result.push({
            ...node,
            expanded: true,
            children: filteredChildren.length > 0 ? filteredChildren : node.children
          });
        }
      } else if (nameMatches) {
        result.push(node);
      }
    }

    return result;
  }

  /** Get file icon based on extension */
  function getFileIcon(node: TreeNode): string {
    if (node.type === 'directory') {
      return node.expanded ? '📂' : '📁';
    }

    const ext = node.name.split('.').pop()?.toLowerCase() || '';
    const icons: Record<string, string> = {
      md: '📝', txt: '📄', json: '📋', js: '🟨', ts: '🔷',
      html: '🌐', css: '🎨', pdf: '📕', png: '🖼️', jpg: '🖼️',
      jpeg: '🖼️', gif: '🖼️', svg: '🎨', yaml: '⚙️', yml: '⚙️'
    };
    return icons[ext] || '📄';
  }

  // ============================================================================
  // GESTURE HANDLERS
  // ============================================================================

  function handleGestureSelect(): void {
    selectorOpen = true;
    loadRootTree();
  }

  function handleGestureAdd(): void {
    addOpen = true;
    dispatch('add', { path: currentPath });
  }

  function handleGestureConfig(): void {
    if (selectedFile) {
      configOpen = true;
    }
  }

  // ============================================================================
  // FILE TREE HANDLERS
  // ============================================================================

  function handleFileClick(node: TreeNode): void {
    if (node.type === 'directory') {
      toggleDirectory(node);
      currentPath = node.path;
    } else {
      selectedFile = node;
      dispatch('select', { file: node });
      selectorOpen = false;
    }
  }

  function handleFileDoubleClick(node: TreeNode): void {
    if (node.type === 'file') {
      selectedFile = node;
      const ext = node.name.split('.').pop()?.toLowerCase() || '';

      if (ext === 'pdf') {
        dispatch('openPdf', { file: node });
      } else {
        dispatch('openEditor', { file: node });
      }
      selectorOpen = false;
    }
  }

  function handleFileContextMenu(e: MouseEvent, node: TreeNode): void {
    e.preventDefault();
    e.stopPropagation();
    selectedFile = node;
    configOpen = true;
  }

  // ============================================================================
  // PANEL HANDLERS
  // ============================================================================

  function handleAddSave(e: CustomEvent<{ item: FileItem }>): void {
    addOpen = false;
    loadRootTree(); // Refresh tree
  }

  function handleConfigUpdate(e: CustomEvent<{ file: FileItem }>): void {
    configOpen = false;
    loadRootTree(); // Refresh tree
  }

  function handleConfigDelete(e: CustomEvent<{ path: string }>): void {
    configOpen = false;
    selectedFile = null;
    loadRootTree(); // Refresh tree
  }

  function handleConfigOpenEditor(e: CustomEvent<{ file: FileItem }>): void {
    dispatch('openEditor', { file: e.detail.file });
    configOpen = false;
  }

  function handleConfigOpenPdf(e: CustomEvent<{ file: FileItem }>): void {
    dispatch('openPdf', { file: e.detail.file });
    configOpen = false;
  }
</script>

<!-- Button con GestureButton base -->
<div
  class="filebrowser-btn-wrapper"
  style:--gesture-btn-bg="hsl(142 71% 45% / 0.15)"
  style:--gesture-btn-bg-hover="hsl(142 71% 45% / 0.25)"
  style:--gesture-btn-bg-active="hsl(142 71% 45% / 0.35)"
  style:--gesture-btn-border-focus="hsl(142 71% 45%)"
>
  <GestureButton
    {size}
    icon={currentIcon}
    label={currentLabel}
    {showLabel}
    {disabled}
    enableAdd={true}
    ariaLabel="Navegador de archivos"
    on:select={handleGestureSelect}
    on:add={handleGestureAdd}
    on:config={handleGestureConfig}
  />
</div>

<!-- Panel Select (tap/click) - File Tree -->
<FloatingPanel bind:open={selectorOpen} title="📁 Archivos">
  <div class="file-selector">
    <!-- Search -->
    <div class="file-selector__search">
      <input
        type="text"
        placeholder="🔍 Buscar archivos..."
        bind:value={searchQuery}
        class="file-selector__input"
      />
    </div>

    <!-- Tree content -->
    <div class="file-selector__content">
      {#if loading}
        <div class="file-selector__state">
          <div class="spinner" />
          <span>Cargando...</span>
        </div>
      {:else if error}
        <div class="file-selector__state file-selector__state--error">
          <span>⚠️</span>
          <span>{error}</span>
          <button class="file-selector__retry" on:click={loadRootTree}>
            Reintentar
          </button>
        </div>
      {:else if filteredTree.length === 0}
        <div class="file-selector__state">
          <span>📂</span>
          <span>{searchQuery ? 'Sin resultados' : 'Carpeta vacía'}</span>
        </div>
      {:else}
        <ul class="file-tree">
          {#each filteredTree as node (node.path)}
            <li class="file-tree__item">
              <button
                type="button"
                class="file-tree__node"
                class:file-tree__node--directory={node.type === 'directory'}
                class:file-tree__node--expanded={node.expanded}
                on:click={() => handleFileClick(node)}
                on:dblclick={() => handleFileDoubleClick(node)}
                on:contextmenu={(e) => handleFileContextMenu(e, node)}
              >
                <span class="file-tree__icon">
                  {#if node.loading}
                    <span class="spinner-small" />
                  {:else}
                    {getFileIcon(node)}
                  {/if}
                </span>
                <span class="file-tree__name">{node.name}</span>
              </button>

              {#if node.type === 'directory' && node.expanded && node.children}
                <ul class="file-tree file-tree--nested" transition:slide={{ duration: 150 }}>
                  {#each node.children as child (child.path)}
                    <li class="file-tree__item">
                      <button
                        type="button"
                        class="file-tree__node"
                        class:file-tree__node--directory={child.type === 'directory'}
                        class:file-tree__node--expanded={child.expanded}
                        on:click={() => handleFileClick(child)}
                        on:dblclick={() => handleFileDoubleClick(child)}
                        on:contextmenu={(e) => handleFileContextMenu(e, child)}
                      >
                        <span class="file-tree__icon">
                          {#if child.loading}
                            <span class="spinner-small" />
                          {:else}
                            {getFileIcon(child)}
                          {/if}
                        </span>
                        <span class="file-tree__name">{child.name}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Footer -->
    {#if projectId}
      <div class="file-selector__footer">
        <span class="file-selector__path">{currentPath}</span>
      </div>
    {/if}
  </div>
</FloatingPanel>

<!-- Panel Add (doble tap/doble click) -->
<FileBrowserAddPanel
  bind:open={addOpen}
  {projectId}
  {currentPath}
  on:save={handleAddSave}
/>

<!-- Panel Config (long press/click derecho) -->
<FileBrowserConfigPanel
  bind:open={configOpen}
  file={selectedFile}
  {projectId}
  on:update={handleConfigUpdate}
  on:delete={handleConfigDelete}
  on:openEditor={handleConfigOpenEditor}
  on:openPdf={handleConfigOpenPdf}
/>

<style>
  .filebrowser-btn-wrapper {
    display: contents;
  }

  /* === FILE SELECTOR === */
  .file-selector {
    display: flex;
    flex-direction: column;
    width: 340px;
    max-height: 60vh;
  }

  .file-selector__search {
    padding: 0.75rem;
    border-bottom: 1px solid var(--color-border, #2e3440);
  }

  .file-selector__input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
  }

  .file-selector__input:focus {
    outline: none;
    border-color: hsl(142 71% 45%);
  }

  .file-selector__content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .file-selector__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--color-text-muted, #9ca3af);
    font-size: 0.875rem;
  }

  .file-selector__state--error {
    color: hsl(0 70% 65%);
  }

  .file-selector__retry {
    margin-top: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
  }

  .file-selector__footer {
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--color-border, #2e3440);
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
    font-family: var(--font-mono, monospace);
  }

  /* === FILE TREE === */
  .file-tree {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .file-tree--nested {
    padding-left: 1.25rem;
  }

  .file-tree__item {
    margin: 0;
  }

  .file-tree__node {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm, 6px);
    color: var(--color-text, #ffffff);
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .file-tree__node:hover {
    background: var(--color-bg-hover, #2a2f3a);
  }

  .file-tree__node--directory {
    font-weight: 500;
  }

  .file-tree__icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .file-tree__name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* === SPINNERS === */
  .spinner {
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid var(--color-border, #2e3440);
    border-top-color: hsl(142 71% 45%);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner-small {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--color-border, #2e3440);
    border-top-color: hsl(142 71% 45%);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* === TOUCH DEVICES === */
  @media (hover: none) {
    .file-tree__node:active {
      background: var(--color-bg-active, #3a3f4a);
    }
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .file-tree__node {
      transition: none;
    }

    .spinner,
    .spinner-small {
      animation: none;
    }
  }
</style>
