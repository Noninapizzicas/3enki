<script lang="ts">
  /**
   * EditorPanel - Editor de código
   *
   * Features:
   * - Editor de texto con monospace
   * - Selección de lenguaje
   * - Adjuntar al chat
   * - Copiar contenido
   */

  import { addAttachment } from '$lib/stores';
  import { closePanel } from '$lib/stores/ui';

  export let panelId: string;

  let content = '';
  let language = 'javascript';
  let filename = 'code';

  const languages = [
    { id: 'javascript', name: 'JavaScript', ext: 'js' },
    { id: 'typescript', name: 'TypeScript', ext: 'ts' },
    { id: 'python', name: 'Python', ext: 'py' },
    { id: 'html', name: 'HTML', ext: 'html' },
    { id: 'css', name: 'CSS', ext: 'css' },
    { id: 'json', name: 'JSON', ext: 'json' },
    { id: 'markdown', name: 'Markdown', ext: 'md' },
    { id: 'sql', name: 'SQL', ext: 'sql' },
    { id: 'bash', name: 'Bash', ext: 'sh' },
    { id: 'plaintext', name: 'Texto plano', ext: 'txt' }
  ];

  function getExtension(): string {
    const lang = languages.find(l => l.id === language);
    return lang?.ext || 'txt';
  }

  function handleAttach() {
    if (!content.trim()) return;

    const ext = getExtension();
    const fullFilename = `${filename}.${ext}`;

    addAttachment({
      id: crypto.randomUUID(),
      name: fullFilename,
      type: `code/${language}`,
      path: `inline:${fullFilename}`,
      size: content.length
    });

    closePanel();
  }

  function handleCopy() {
    navigator.clipboard.writeText(content);
  }

  function handleClear() {
    content = '';
  }

  // Calcular estadísticas
  $: lines = content.split('\n').length;
  $: chars = content.length;
</script>

<div class="editor-panel">
  <div class="toolbar">
    <div class="toolbar-left">
      <input
        type="text"
        class="filename-input"
        bind:value={filename}
        placeholder="nombre"
      />
      <span class="ext">.{getExtension()}</span>
      <select class="language-select" bind:value={language}>
        {#each languages as lang (lang.id)}
          <option value={lang.id}>{lang.name}</option>
        {/each}
      </select>
    </div>
    <div class="toolbar-right">
      <span class="stats">{lines} líneas · {chars} chars</span>
      <button class="tool-btn" on:click={handleCopy} title="Copiar">
        📋
      </button>
      <button class="tool-btn" on:click={handleClear} title="Limpiar">
        🗑️
      </button>
    </div>
  </div>

  <textarea
    class="editor"
    bind:value={content}
    placeholder="Escribe o pega tu código aquí..."
    spellcheck="false"
  ></textarea>

  <div class="actions">
    <button class="attach-btn" on:click={handleAttach} disabled={!content.trim()}>
      📎 Adjuntar al chat
    </button>
  </div>
</div>

<style>
  .editor-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.5rem;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border-radius: 0.375rem;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filename-input {
    width: 120px;
    padding: 0.375rem 0.5rem;
    background: var(--color-bg, #121212);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.875rem;
    font-family: monospace;
  }

  .filename-input:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .ext {
    font-family: monospace;
    font-size: 0.875rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .language-select {
    padding: 0.375rem 0.5rem;
    background: var(--color-bg, #121212);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
    border-radius: 0.25rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .language-select:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .stats {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .tool-btn {
    padding: 0.375rem;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 1rem;
    opacity: 0.7;
    transition: opacity 0.15s, background-color 0.15s;
  }

  .tool-btn:hover {
    opacity: 1;
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .editor {
    flex: 1;
    padding: 1rem;
    background: var(--color-bg, #0a0a0a);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    resize: none;
    tab-size: 2;
  }

  .editor:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .editor::placeholder {
    color: var(--color-text-muted, #a3a3a3);
    opacity: 0.5;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .attach-btn {
    padding: 0.625rem 1rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
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
