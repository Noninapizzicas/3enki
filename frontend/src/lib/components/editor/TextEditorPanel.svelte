<!--
  TextEditorPanel.svelte
  ======================
  Panel de edición de texto flotante.

  Características:
  - Edición de MD, JSON, TXT, JS, etc.
  - Números de línea opcionales
  - Indicador de cambios sin guardar
  - Atajos de teclado (Ctrl+S guardar)

  Skinnable via CSS Variables:
  --editor-bg, --editor-color, --editor-line-number-color

  Uso:
    <TextEditorPanel
      bind:open
      {file}
      {projectId}
      on:save={handleSave}
      on:close={handleClose}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { FloatingPanel } from '$components/feedback';
  import { api } from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  export interface FileInfo {
    name: string;
    path: string;
    type: 'file' | 'directory';
    extension?: string;
    size?: number;
    modified?: string;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel open state */
  export let open = false;

  /** File to edit */
  export let file: FileInfo | null = null;

  /** Project ID */
  export let projectId: string | null = null;

  /** Show line numbers */
  export let showLineNumbers = true;

  /** Word wrap */
  export let wordWrap = true;

  /** Tab size */
  export let tabSize = 2;

  // ============================================================================
  // STATE
  // ============================================================================

  let content = '';
  let originalContent = '';
  let loading = false;
  let saving = false;
  let error = '';
  let textarea: HTMLTextAreaElement;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    save: { file: FileInfo; content: string };
    close: void;
    contentChange: { content: string; hasChanges: boolean };
  }>();

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: hasChanges = content !== originalContent;
  $: lineCount = content.split('\n').length;
  $: extension = file?.name?.split('.').pop()?.toLowerCase() || '';
  $: fileIcon = getFileIcon(extension);

  // Load file when opened
  $: if (open && file && projectId) {
    loadFile();
  }

  // ============================================================================
  // METHODS
  // ============================================================================

  function getFileIcon(ext: string): string {
    const icons: Record<string, string> = {
      md: '📝', txt: '📄', json: '📋', js: '🟨', ts: '🔷',
      html: '🌐', css: '🎨', yaml: '⚙️', yml: '⚙️', xml: '📰'
    };
    return icons[ext] || '📄';
  }

  /** Load file content */
  async function loadFile(): Promise<void> {
    if (!file || !projectId) return;

    loading = true;
    error = '';

    try {
      const params = new URLSearchParams({
        project_id: projectId,
        file_path: file.path
      });

      const res = await fetch(api.moduleApi('text-editor', `/editor/open?${params}`));

      if (!res.ok) {
        throw new Error('Error al cargar archivo');
      }

      const data = await res.json();
      content = data.content || '';
      originalContent = content;

    } catch (e) {
      error = e instanceof Error ? e.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }

  /** Save file content */
  async function saveFile(): Promise<void> {
    if (!file || !projectId || saving) return;

    saving = true;
    error = '';

    try {
      const res = await fetch(api.moduleApi('text-editor', '/editor/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          file_path: file.path,
          content
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al guardar');
      }

      originalContent = content;
      dispatch('save', { file, content });

    } catch (e) {
      error = e instanceof Error ? e.message : 'Error desconocido';
    } finally {
      saving = false;
    }
  }

  /** Handle keyboard shortcuts */
  function handleKeydown(e: KeyboardEvent): void {
    // Ctrl/Cmd + S = Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
  }

  /** Handle tab key for indentation */
  function handleTab(e: KeyboardEvent): void {
    if (e.key === 'Tab') {
      e.preventDefault();

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = ' '.repeat(tabSize);

      content = content.substring(0, start) + spaces + content.substring(end);

      // Set cursor position after the inserted tabs
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + tabSize;
      });
    }
  }

  function handleContentChange(): void {
    dispatch('contentChange', { content, hasChanges });
  }

  function handleClose(): void {
    if (hasChanges) {
      // Could show confirmation dialog here
    }
    dispatch('close');
    open = false;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onMount(() => {
    // Global keyboard listener for save (only in browser)
    if (browser) {
      window.addEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    if (browser) {
      window.removeEventListener('keydown', handleKeydown);
    }
  });
</script>

<FloatingPanel bind:open on:close={handleClose} size="large">
  <div class="editor-panel">
    <!-- Header -->
    <header class="editor-panel__header">
      <div class="editor-panel__file-info">
        <span class="editor-panel__file-icon">{fileIcon}</span>
        <span class="editor-panel__file-name">{file?.name || 'Sin archivo'}</span>
        {#if hasChanges}
          <span class="editor-panel__unsaved">●</span>
        {/if}
      </div>

      <div class="editor-panel__actions">
        <button
          type="button"
          class="editor-panel__btn editor-panel__btn--save"
          on:click={saveFile}
          disabled={!hasChanges || saving}
        >
          {#if saving}
            Guardando...
          {:else}
            💾 Guardar
          {/if}
        </button>
        <button
          type="button"
          class="editor-panel__btn editor-panel__btn--close"
          on:click={handleClose}
        >
          ✕
        </button>
      </div>
    </header>

    <!-- Editor -->
    <div class="editor-panel__body">
      {#if loading}
        <div class="editor-panel__loading">
          <div class="spinner" />
          <span>Cargando archivo...</span>
        </div>

      {:else if error}
        <div class="editor-panel__error">
          <span>⚠️ {error}</span>
          <button class="editor-panel__retry" on:click={loadFile}>
            Reintentar
          </button>
        </div>

      {:else}
        <div class="editor-panel__editor" class:word-wrap={wordWrap}>
          {#if showLineNumbers}
            <div class="editor-panel__line-numbers" aria-hidden="true">
              {#each Array(lineCount) as _, i}
                <span class="line-number">{i + 1}</span>
              {/each}
            </div>
          {/if}

          <textarea
            bind:this={textarea}
            bind:value={content}
            class="editor-panel__textarea"
            class:with-line-numbers={showLineNumbers}
            on:input={handleContentChange}
            on:keydown={handleTab}
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            placeholder="Archivo vacío..."
          />
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <footer class="editor-panel__footer">
      <span class="editor-panel__path">{file?.path || ''}</span>
      <span class="editor-panel__stats">
        Líneas: {lineCount} | {content.length} caracteres
      </span>
      <span class="editor-panel__hint">
        Ctrl+S para guardar
      </span>
    </footer>
  </div>
</FloatingPanel>

<style>
  .editor-panel {
    display: flex;
    flex-direction: column;
    width: 80vw;
    max-width: 900px;
    height: 70vh;
    max-height: 600px;
    background: var(--editor-bg, var(--color-bg-card, #1a1d24));
    color: var(--editor-color, var(--color-text, #ffffff));
  }

  /* Header */
  .editor-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--color-bg-elevated, #232830);
    border-bottom: 1px solid var(--color-border, #2e3440);
  }

  .editor-panel__file-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .editor-panel__file-icon {
    font-size: 1.25rem;
  }

  .editor-panel__file-name {
    font-weight: 600;
    font-size: 0.9375rem;
  }

  .editor-panel__unsaved {
    color: hsl(45 93% 47%);
    font-size: 0.75rem;
    margin-left: 0.25rem;
  }

  .editor-panel__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .editor-panel__btn {
    padding: 0.375rem 0.75rem;
    background: var(--color-bg-card, #1a1d24);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .editor-panel__btn:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f3a);
  }

  .editor-panel__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .editor-panel__btn--save {
    background: hsl(217 91% 60% / 0.15);
    border-color: hsl(217 91% 60% / 0.3);
    color: hsl(217 91% 60%);
  }

  .editor-panel__btn--save:hover:not(:disabled) {
    background: hsl(217 91% 60% / 0.25);
  }

  .editor-panel__btn--close {
    width: 32px;
    padding: 0.375rem;
  }

  /* Body */
  .editor-panel__body {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .editor-panel__loading,
  .editor-panel__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: var(--color-text-muted, #9ca3af);
  }

  .editor-panel__error {
    color: hsl(0 70% 65%);
  }

  .editor-panel__retry {
    padding: 0.375rem 0.75rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
  }

  /* Editor */
  .editor-panel__editor {
    display: flex;
    height: 100%;
    font-family: var(--font-mono, 'Fira Code', 'Consolas', monospace);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .editor-panel__line-numbers {
    display: flex;
    flex-direction: column;
    padding: 0.75rem 0.75rem 0.75rem 0.5rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--editor-line-number-color, var(--color-text-muted, #9ca3af));
    text-align: right;
    user-select: none;
    border-right: 1px solid var(--color-border, #2e3440);
    overflow: hidden;
  }

  .line-number {
    font-size: 0.75rem;
    line-height: 1.6;
    min-width: 2.5em;
  }

  .editor-panel__textarea {
    flex: 1;
    padding: 0.75rem 1rem;
    background: transparent;
    color: var(--color-text, #ffffff);
    border: none;
    outline: none;
    resize: none;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    tab-size: v-bind(tabSize);
  }

  .editor-panel__textarea.with-line-numbers {
    padding-left: 0.75rem;
  }

  .editor-panel__textarea::placeholder {
    color: var(--color-text-muted, #9ca3af);
    opacity: 0.5;
  }

  .editor-panel__editor.word-wrap .editor-panel__textarea {
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .editor-panel__editor:not(.word-wrap) .editor-panel__textarea {
    white-space: pre;
    overflow-x: auto;
  }

  /* Footer */
  .editor-panel__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--color-bg-elevated, #232830);
    border-top: 1px solid var(--color-border, #2e3440);
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
  }

  .editor-panel__path {
    font-family: var(--font-mono, monospace);
    max-width: 40%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-panel__hint {
    opacity: 0.7;
  }

  /* Spinner */
  .spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid var(--color-border, #2e3440);
    border-top-color: hsl(217 91% 60%);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Responsive */
  @media (max-width: 640px) {
    .editor-panel {
      width: 95vw;
      height: 80vh;
    }

    .editor-panel__line-numbers {
      display: none;
    }

    .editor-panel__textarea.with-line-numbers {
      padding-left: 1rem;
    }
  }
</style>
