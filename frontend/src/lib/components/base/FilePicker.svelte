<script lang="ts">
  /**
   * FilePicker - Navegador de archivos reutilizable
   *
   * Navega directorios del proyecto activo via MQTT (fs.list).
   * Emite evento 'select' con la ruta completa del archivo elegido.
   *
   * Props:
   *   extensions - Filtrar por extensiones (ej: ['.pdf', '.png'])
   *   placeholder - Texto cuando no hay archivo seleccionado
   *
   * Eventos:
   *   select - { detail: string } ruta del archivo seleccionado
   */

  import { createEventDispatcher } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { activeProjectId } from '$lib/stores/projects';

  export let extensions: string[] = [];
  export let placeholder: string = 'Seleccionar archivo...';
  export let value: string = '';

  const dispatch = createEventDispatcher<{ select: string }>();

  interface FsItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    extension?: string | null;
    size: number;
    modified: string;
  }

  let open = false;
  let currentPath = '/';
  let items: FsItem[] = [];
  let loading = false;
  let error = '';

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function getIcon(item: FsItem): string {
    if (item.type === 'directory') return '\uD83D\uDCC1';
    const ext = item.extension?.toLowerCase() || '';
    if (['.pdf'].includes(ext)) return '\uD83D\uDCC4';
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) return '\uD83D\uDDBC\uFE0F';
    if (['.json'].includes(ext)) return '\uD83D\uDCCB';
    if (['.txt', '.md', '.csv'].includes(ext)) return '\uD83D\uDCC3';
    return '\uD83D\uDCC4';
  }

  function matchesFilter(item: FsItem): boolean {
    if (item.type === 'directory') return true;
    if (extensions.length === 0) return true;
    const ext = item.extension?.toLowerCase() || '';
    return extensions.some(e => e.toLowerCase() === ext);
  }

  async function browse(path: string) {
    loading = true;
    error = '';
    try {
      const res = await mqttRequest<any>('fs', 'list', {
        project_id: $activeProjectId,
        path
      }, { timeout: 10000 });
      items = (res.data?.files || []).filter(matchesFilter);
      currentPath = path;
    } catch (err: any) {
      error = err.message || 'Error listando archivos';
    } finally {
      loading = false;
    }
  }

  function toggle() {
    open = !open;
    if (open) browse(currentPath);
  }

  function navigateUp() {
    if (currentPath === '/') return;
    const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
    browse(parent);
  }

  function handleClick(item: FsItem) {
    if (item.type === 'directory') {
      browse(item.path);
    } else {
      value = item.path;
      dispatch('select', item.path);
      open = false;
    }
  }

  function handleClear() {
    value = '';
    dispatch('select', '');
  }

  // Breadcrumb segments
  $: segments = currentPath === '/'
    ? []
    : currentPath.split('/').filter(Boolean);
</script>

<div class="file-picker">
  <button class="picker-trigger" on:click={toggle} type="button">
    <span class="trigger-text" class:has-value={!!value}>
      {value || placeholder}
    </span>
    {#if value}
      <button class="btn-clear" on:click|stopPropagation={handleClear} type="button">&times;</button>
    {/if}
    <span class="trigger-icon">{open ? '\u25B2' : '\u25BC'}</span>
  </button>

  {#if open}
    <div class="browser">
      <!-- Breadcrumb -->
      <div class="breadcrumb">
        <button class="crumb" on:click={() => browse('/')} type="button">/</button>
        {#each segments as seg, i}
          <span class="crumb-sep">/</span>
          <button
            class="crumb"
            on:click={() => browse('/' + segments.slice(0, i + 1).join('/'))}
            type="button"
          >{seg}</button>
        {/each}
        {#if currentPath !== '/'}
          <button class="btn-up" on:click={navigateUp} type="button">\u2191</button>
        {/if}
      </div>

      <!-- List -->
      <div class="file-list">
        {#if loading}
          <div class="status-msg">Cargando...</div>
        {:else if error}
          <div class="status-msg error">{error}</div>
        {:else if items.length === 0}
          <div class="status-msg">Sin archivos{extensions.length ? ` (${extensions.join(', ')})` : ''}</div>
        {:else}
          {#each items as item}
            <button
              class="file-item"
              class:is-dir={item.type === 'directory'}
              on:click={() => handleClick(item)}
              type="button"
            >
              <span class="item-icon">{getIcon(item)}</span>
              <span class="item-name">{item.name}</span>
              {#if item.type === 'file'}
                <span class="item-size">{formatSize(item.size)}</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .file-picker {
    position: relative;
    width: 100%;
  }

  .picker-trigger {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
  }
  .picker-trigger:hover { border-color: rgba(255,255,255,0.2); }

  .trigger-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-muted, #888);
  }
  .trigger-text.has-value { color: var(--color-text, #e5e5e5); }

  .trigger-icon {
    font-size: 0.55rem;
    color: var(--color-text-muted, #888);
  }

  .btn-clear {
    background: none;
    border: none;
    color: var(--color-text-muted, #888);
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0 0.15rem;
    line-height: 1;
  }
  .btn-clear:hover { color: var(--color-error, #ef4444); }

  .browser {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 50;
    margin-top: 0.25rem;
    background: var(--color-bg, #1a1a1a);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 0.375rem;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    overflow: hidden;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    padding: 0.35rem 0.5rem;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    font-size: 0.7rem;
    flex-wrap: wrap;
  }

  .crumb {
    background: none;
    border: none;
    color: var(--color-primary, #3b82f6);
    cursor: pointer;
    padding: 0.1rem 0.15rem;
    font-size: 0.7rem;
    border-radius: 0.2rem;
  }
  .crumb:hover { background: rgba(59,130,246,0.15); }
  .crumb-sep { color: var(--color-text-muted, #555); }

  .btn-up {
    margin-left: auto;
    background: none;
    border: 1px solid rgba(255,255,255,0.1);
    color: var(--color-text-muted, #888);
    font-size: 0.7rem;
    padding: 0.1rem 0.35rem;
    border-radius: 0.2rem;
    cursor: pointer;
  }
  .btn-up:hover { background: rgba(255,255,255,0.05); }

  .file-list {
    max-height: 14rem;
    overflow-y: auto;
    padding: 0.25rem;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    padding: 0.3rem 0.4rem;
    background: none;
    border: none;
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.75rem;
    cursor: pointer;
    text-align: left;
  }
  .file-item:hover { background: rgba(255,255,255,0.06); }
  .file-item.is-dir { color: var(--color-primary, #3b82f6); }

  .item-icon { font-size: 0.85rem; flex-shrink: 0; }
  .item-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-size {
    flex-shrink: 0;
    font-size: 0.6rem;
    color: var(--color-text-muted, #666);
  }

  .status-msg {
    padding: 0.75rem;
    text-align: center;
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
  }
  .status-msg.error { color: var(--color-error, #ef4444); }
</style>
