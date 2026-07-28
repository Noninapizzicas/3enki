<script lang="ts">
  import { hasAttachments, canAddMore, uploadAndAttachMultiple } from '$lib/stores/attachments';
  import { sendMessage, isStreaming, stopGeneration, agentWorking, agentWorkingName, agentWorkingStep } from '$lib/stores';
  import { setupRequired } from '$lib/stores/contextStore';
  import { chatInputDraft } from '$lib/stores/chatInputDraft';

  let textareaEl: HTMLTextAreaElement;
  let fileInputEl: HTMLInputElement;
  let dragging = false;
  let uploading = false;

  $: needsSetup = $setupRequired !== null;
  $: isBlocked = $isStreaming || $agentWorking || needsSetup;
  $: canSend = ($chatInputDraft.trim().length > 0 || $hasAttachments) && !isBlocked;

  async function handleSend() {
    if (!canSend) return;

    const content = $chatInputDraft.trim();
    chatInputDraft.set('');

    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }

    await sendMessage(content);
  }

  function handleStop() {
    stopGeneration();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 150) + 'px';
    }
  }

  function openFilePicker() {
    if (!$canAddMore || needsSetup) return;
    fileInputEl?.click();
  }

  async function handleFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    await processFiles(input.files);
    input.value = '';
  }

  async function processFiles(files: FileList | File[]) {
    if (uploading) return;
    uploading = true;
    try {
      await uploadAndAttachMultiple(files);
    } finally {
      uploading = false;
    }
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    if (needsSetup || !$canAddMore) return;
    dragging = true;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (needsSetup || !$canAddMore) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(e: DragEvent) {
    const wrapper = (e.currentTarget as HTMLElement);
    const related = e.relatedTarget as Node | null;
    if (related && wrapper.contains(related)) return;
    dragging = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (needsSetup || !$canAddMore) return;
    const files = e.dataTransfer?.files;
    if (files?.length) processFiles(files);
  }
</script>

<div
  class="chat-input-wrapper"
  class:dragging
  on:dragenter={handleDragEnter}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
  role="region"
>
{#if dragging}
  <div class="drop-overlay">
    <span class="drop-icon">📎</span>
    <span class="drop-text">Suelta archivos para adjuntar</span>
  </div>
{/if}

{#if $agentWorking}
  <div class="agent-banner">
    <span class="agent-banner-dot"></span>
    <span class="agent-banner-text">
      {#if $agentWorkingStep}
        {$agentWorkingStep}
      {:else}
        Agente{$agentWorkingName ? ` (${$agentWorkingName})` : ''} trabajando…
      {/if}
    </span>
    <span class="agent-banner-hint">La respuesta aparecerá aquí</span>
  </div>
{/if}

<div class="chat-input">
  <input
    bind:this={fileInputEl}
    type="file"
    multiple
    accept="image/*,audio/*,text/*,.pdf,.doc,.docx,.json,.csv,.xlsx,.xls,.md,.js,.ts,.py,.html,.css,.yaml,.yml,.xml,.svelte"
    class="file-input-hidden"
    on:change={handleFilesSelected}
  />

  <button
    class="attach-btn"
    on:click={openFilePicker}
    disabled={needsSetup || !$canAddMore || uploading}
    title={uploading ? 'Subiendo...' : 'Adjuntar archivo'}
    class:uploading
  >
    {#if uploading}
      <span class="attach-spinner"></span>
    {:else}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
      </svg>
    {/if}
  </button>

  <textarea
    bind:this={textareaEl}
    bind:value={$chatInputDraft}
    on:keydown={handleKeydown}
    on:input={handleInput}
    placeholder={needsSetup ? 'Necesitas un proyecto y conversación activos' : 'Escribe un mensaje...'}
    disabled={needsSetup}
    rows="1"
  ></textarea>

  {#if $isStreaming}
    <button
      class="stop-btn"
      on:click={handleStop}
      title="Detener generación"
    >
      <span class="stop-icon"></span>
    </button>
  {:else if $agentWorking}
    <button class="agent-btn" disabled title="Agente trabajando...">
      <span class="agent-spinner"></span>
    </button>
  {:else}
    <button
      class="send-btn"
      on:click={handleSend}
      disabled={!canSend}
      title="Enviar (Enter)"
    >
      ➤
    </button>
  {/if}
</div>
</div>

<style>
  .chat-input-wrapper {
    display: flex;
    flex-direction: column;
    position: relative;
    transition: outline 0.15s ease;
  }

  .chat-input-wrapper.dragging {
    outline: 2px dashed var(--color-primary, #3b82f6);
    outline-offset: -2px;
    border-radius: 0.5rem;
  }

  .drop-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: rgba(59, 130, 246, 0.12);
    z-index: 10;
    border-radius: 0.5rem;
    pointer-events: none;
  }

  .drop-icon {
    font-size: 1.5rem;
  }

  .drop-text {
    font-size: 0.875rem;
    color: var(--color-primary, #3b82f6);
    font-weight: 500;
  }

  .agent-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 1rem;
    background: rgba(251, 191, 36, 0.08);
    border-top: 1px solid rgba(251, 191, 36, 0.25);
    font-size: 0.75rem;
    color: #fbbf24;
  }

  .agent-banner-text {
    flex: 1;
  }

  .agent-banner-hint {
    font-size: 0.7rem;
    opacity: 0.6;
    white-space: nowrap;
  }

  .agent-banner-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: #fbbf24;
    border-radius: 50%;
    flex-shrink: 0;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .chat-input {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--color-input-bg, rgba(0, 0, 0, 0.2));
  }

  .file-input-hidden {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  .attach-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-muted, #a3a3a3);
    border-radius: 50%;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.15s, background-color 0.15s;
  }

  .attach-btn:hover:not(:disabled) {
    color: var(--color-text, #e5e5e5);
    background: rgba(255, 255, 255, 0.08);
  }

  .attach-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .attach-btn.uploading {
    color: var(--color-primary, #3b82f6);
  }

  .attach-spinner {
    display: block;
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(59, 130, 246, 0.3);
    border-top-color: var(--color-primary, #3b82f6);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  textarea {
    flex: 1;
    padding: 0.625rem 0.875rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 1rem;
    color: var(--color-text, #e5e5e5);
    font-family: inherit;
    font-size: 0.9375rem;
    line-height: 1.4;
    resize: none;
    min-height: 2.5rem;
    max-height: 150px;
    overflow-y: auto;
  }

  textarea::placeholder {
    color: var(--color-text-muted, #a3a3a3);
  }

  textarea:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: none;
    background: var(--color-primary, #3b82f6);
    color: white;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.125rem;
    transition: background-color 0.15s, transform 0.1s;
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  .send-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .send-btn:disabled {
    background: var(--color-disabled, #4b5563);
    cursor: not-allowed;
  }

  .stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 2px solid rgba(239, 68, 68, 0.7);
    background: transparent;
    border-radius: 50%;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .stop-btn:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: #ef4444;
  }

  .stop-icon {
    display: block;
    width: 0.75rem;
    height: 0.75rem;
    background: #ef4444;
    border-radius: 2px;
  }

  .agent-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 2px solid rgba(251, 191, 36, 0.7);
    background: transparent;
    border-radius: 50%;
    cursor: not-allowed;
    flex-shrink: 0;
  }

  .agent-spinner {
    display: block;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid rgba(251, 191, 36, 0.3);
    border-top-color: #fbbf24;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
