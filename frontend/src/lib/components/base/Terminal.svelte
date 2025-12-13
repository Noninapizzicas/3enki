<script lang="ts">
  /**
   * Terminal - Output de terminal
   *
   * Features:
   * - Output estilo terminal
   * - Auto-scroll
   * - Colores ANSI básicos
   * - Timestamps opcionales
   * - Clear button
   */

  import { createEventDispatcher, afterUpdate } from 'svelte';
  import { fade } from 'svelte/transition';

  interface TerminalLine {
    id: string;
    content: string;
    type: 'stdout' | 'stderr' | 'info' | 'success' | 'command';
    timestamp?: string;
  }

  export let lines: TerminalLine[] = [];
  export let showTimestamps: boolean = false;
  export let maxLines: number = 1000;
  export let title: string = 'Terminal';

  const dispatch = createEventDispatcher<{ clear: void; command: string }>();

  let containerEl: HTMLDivElement;
  let inputValue: string = '';
  let shouldAutoScroll = true;

  // Auto-scroll on new lines
  afterUpdate(() => {
    if (shouldAutoScroll && containerEl) {
      containerEl.scrollTop = containerEl.scrollHeight;
    }
  });

  // Trim old lines if exceeding maxLines
  $: if (lines.length > maxLines) {
    lines = lines.slice(-maxLines);
  }

  function handleScroll() {
    if (!containerEl) return;
    const { scrollTop, scrollHeight, clientHeight } = containerEl;
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 50;
  }

  function handleClear() {
    dispatch('clear');
  }

  function handleCommand(event: KeyboardEvent) {
    if (event.key === 'Enter' && inputValue.trim()) {
      dispatch('command', inputValue.trim());
      inputValue = '';
    }
  }

  function formatTimestamp(ts?: string): string {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function getLineClass(type: TerminalLine['type']): string {
    switch (type) {
      case 'stderr': return 'line-error';
      case 'success': return 'line-success';
      case 'info': return 'line-info';
      case 'command': return 'line-command';
      default: return '';
    }
  }
</script>

<div class="terminal">
  <header class="terminal-header">
    <div class="terminal-dots">
      <span class="dot red"></span>
      <span class="dot yellow"></span>
      <span class="dot green"></span>
    </div>
    <span class="terminal-title">{title}</span>
    <button class="clear-btn" on:click={handleClear} title="Limpiar">
      ⌫
    </button>
  </header>

  <div
    class="terminal-output"
    bind:this={containerEl}
    on:scroll={handleScroll}
  >
    {#if lines.length === 0}
      <div class="empty" transition:fade={{ duration: 150 }}>
        <span class="prompt">$</span>
        <span class="cursor"></span>
      </div>
    {:else}
      {#each lines as line (line.id)}
        <div class="line {getLineClass(line.type)}">
          {#if showTimestamps && line.timestamp}
            <span class="timestamp">[{formatTimestamp(line.timestamp)}]</span>
          {/if}
          {#if line.type === 'command'}
            <span class="prompt">$</span>
          {/if}
          <span class="content">{line.content}</span>
        </div>
      {/each}
    {/if}
  </div>

  <div class="terminal-input">
    <span class="prompt">$</span>
    <input
      type="text"
      bind:value={inputValue}
      on:keydown={handleCommand}
      placeholder="Escribe un comando..."
      spellcheck="false"
      autocomplete="off"
    />
  </div>
</div>

<style>
  .terminal {
    display: flex;
    flex-direction: column;
    background: var(--color-terminal-bg, #0d0d0d);
    border-radius: 0.5rem;
    overflow: hidden;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .terminal-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-terminal-header, #1a1a1a);
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .terminal-dots {
    display: flex;
    gap: 0.375rem;
  }

  .dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
  }

  .dot.red { background: #ff5f56; }
  .dot.yellow { background: #ffbd2e; }
  .dot.green { background: #27c93f; }

  .terminal-title {
    flex: 1;
    font-size: 0.75rem;
    color: var(--color-text-muted, #666);
    text-align: center;
  }

  .clear-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted, #666);
    cursor: pointer;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    transition: background-color 0.15s, color 0.15s;
  }

  .clear-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
    color: var(--color-text, #e5e5e5);
  }

  .terminal-output {
    flex: 1;
    padding: 0.75rem;
    overflow-y: auto;
    min-height: 150px;
    max-height: 400px;
  }

  .empty {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-text-muted, #666);
  }

  .cursor {
    width: 0.5rem;
    height: 1rem;
    background: var(--color-primary, #3b82f6);
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  .line {
    display: flex;
    gap: 0.5rem;
    padding: 0.125rem 0;
    color: var(--color-terminal-text, #e5e5e5);
  }

  .line-error {
    color: #ef4444;
  }

  .line-success {
    color: #22c55e;
  }

  .line-info {
    color: #3b82f6;
  }

  .line-command {
    color: #a855f7;
  }

  .timestamp {
    color: var(--color-text-muted, #666);
    flex-shrink: 0;
  }

  .prompt {
    color: #22c55e;
    flex-shrink: 0;
    font-weight: 600;
  }

  .content {
    white-space: pre-wrap;
    word-break: break-all;
  }

  .terminal-input {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-terminal-input, rgba(255, 255, 255, 0.05));
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .terminal-input input {
    flex: 1;
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--color-terminal-text, #e5e5e5);
    font-family: inherit;
    font-size: inherit;
    outline: none;
  }

  .terminal-input input::placeholder {
    color: var(--color-text-muted, #666);
  }

  /* Scrollbar */
  .terminal-output::-webkit-scrollbar {
    width: 6px;
  }

  .terminal-output::-webkit-scrollbar-track {
    background: transparent;
  }

  .terminal-output::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar, rgba(255, 255, 255, 0.2));
    border-radius: 3px;
  }
</style>
