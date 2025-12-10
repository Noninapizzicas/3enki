<!--
  ChatInputBar.svelte
  ====================
  Barra de chat completa con botones de módulos integrados.

  Estructura sandwich:
  - Fila superior: Módulos de preparación (AI, Creds, Prompts, Chats)
  - Input central: Textarea + botón enviar
  - Fila inferior: Módulos workspace (Files, Editor, PDF) + Project

  Todos los botones usan size="sm" para mantener compacto.

  Uso:
    <ChatInputBar
      {projectId}
      bind:message
      on:send={handleSend}
      on:selectFile={handleSelectFile}
      on:openEditor={handleOpenEditor}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  // Módulos de preparación (fila superior)
  import { AIButton } from '$components/ai';
  import { CredentialButton } from '$components/credentials';
  import { PromptButton } from '$components/prompts';
  import { ConversationButton } from '$components/conversations';
  import { ProjectButton } from '$components/projects';

  // Módulos workspace (fila inferior)
  import { FileBrowserButton } from '$components/files';
  import { TextEditorButton } from '$components/editor';
  import { PdfViewerButton } from '$components/pdf';

  // ============================================================================
  // TYPES
  // ============================================================================

  interface Attachment {
    id: string;
    name: string;
    path: string;
    type: 'file' | 'image' | 'pdf';
    size?: number;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** ID del proyecto actual */
  export let projectId: string | null = null;

  /** Mensaje a enviar */
  export let message = '';

  /** Placeholder del input */
  export let placeholder = 'Escribe tu mensaje...';

  /** Estado de envío */
  export let sending = false;

  /** Archivos adjuntos */
  export let attachments: Attachment[] = [];

  /** Modelo actual (para mostrar badge) */
  export let currentModel = '';

  /** Archivo abierto en editor */
  export let editorFile: any = null;

  /** Archivo PDF abierto */
  export let pdfFile: any = null;

  // ============================================================================
  // STATE
  // ============================================================================

  let textarea: HTMLTextAreaElement;
  let fileInput: HTMLInputElement;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    send: { message: string; attachments: Attachment[] };
    selectModel: { provider: string; model: string };
    selectCredential: { key: string };
    selectPrompt: { id: string; content: string };
    selectConversation: { id: string };
    selectProject: { id: string };
    selectFile: { file: any };
    openEditor: { file: any };
    openPdf: { file: any };
    attach: { files: File[] };
    removeAttachment: { id: string };
  }>();

  // ============================================================================
  // METHODS
  // ============================================================================

  function handleSend(): void {
    if (!message.trim() || sending) return;

    dispatch('send', {
      message: message.trim(),
      attachments: [...attachments]
    });

    message = '';
    attachments = [];
  }

  function handleKeydown(e: KeyboardEvent): void {
    // Ctrl/Cmd + Enter = enviar
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleAttachClick(): void {
    fileInput?.click();
  }

  function handleFileSelect(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      dispatch('attach', { files: Array.from(input.files) });
      input.value = ''; // Reset para permitir seleccionar el mismo archivo
    }
  }

  function removeAttachment(id: string): void {
    attachments = attachments.filter(a => a.id !== id);
    dispatch('removeAttachment', { id });
  }

  // Auto-resize textarea
  function autoResize(): void {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }

  $: if (message !== undefined) {
    // Trigger resize when message changes
    setTimeout(autoResize, 0);
  }

  // ============================================================================
  // MODULE EVENT HANDLERS
  // ============================================================================

  function handleModelSelect(e: CustomEvent): void {
    dispatch('selectModel', e.detail);
  }

  function handleCredentialSelect(e: CustomEvent): void {
    dispatch('selectCredential', e.detail);
  }

  function handlePromptSelect(e: CustomEvent): void {
    const prompt = e.detail.prompt;
    if (prompt?.content) {
      // Insertar contenido del prompt en el mensaje
      message = prompt.content + (message ? '\n\n' + message : '');
    }
    dispatch('selectPrompt', e.detail);
  }

  function handleConversationSelect(e: CustomEvent): void {
    dispatch('selectConversation', e.detail);
  }

  function handleProjectSelect(e: CustomEvent): void {
    dispatch('selectProject', e.detail);
  }

  function handleFileSelect2(e: CustomEvent): void {
    dispatch('selectFile', e.detail);
  }

  function handleOpenEditor(e: CustomEvent): void {
    dispatch('openEditor', e.detail);
  }

  function handleOpenPdf(e: CustomEvent): void {
    dispatch('openPdf', e.detail);
  }
</script>

<div class="chat-input-bar">
  <!-- Hidden file input -->
  <input
    bind:this={fileInput}
    type="file"
    multiple
    accept="*/*"
    class="hidden"
    on:change={handleFileSelect}
  />

  <!-- Fila superior: Módulos de preparación -->
  <div class="chat-input-bar__top">
    <div class="chat-input-bar__modules">
      <AIButton
        size="sm"
        showLabel={false}
        on:select={handleModelSelect}
      />

      <CredentialButton
        size="sm"
        showLabel={false}
        {projectId}
        on:select={handleCredentialSelect}
      />

      <PromptButton
        size="sm"
        showLabel={false}
        on:select={handlePromptSelect}
      />

      <ConversationButton
        size="sm"
        showLabel={false}
        {projectId}
        on:select={handleConversationSelect}
      />
    </div>

    <!-- Indicador de modelo actual -->
    {#if currentModel}
      <span class="chat-input-bar__model-badge">
        {currentModel}
      </span>
    {/if}
  </div>

  <!-- Attachments preview -->
  {#if attachments.length > 0}
    <div class="chat-input-bar__attachments">
      {#each attachments as attachment (attachment.id)}
        <div class="attachment-chip">
          <span class="attachment-chip__icon">
            {attachment.type === 'pdf' ? '📕' : attachment.type === 'image' ? '🖼️' : '📄'}
          </span>
          <span class="attachment-chip__name">{attachment.name}</span>
          <button
            type="button"
            class="attachment-chip__remove"
            on:click={() => removeAttachment(attachment.id)}
            aria-label="Eliminar adjunto"
          >
            ×
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Input central -->
  <div class="chat-input-bar__input">
    <button
      type="button"
      class="chat-input-bar__attach-btn"
      on:click={handleAttachClick}
      title="Adjuntar archivo"
    >
      📎
    </button>

    <textarea
      bind:this={textarea}
      bind:value={message}
      {placeholder}
      disabled={sending}
      rows="1"
      class="chat-input-bar__textarea"
      on:keydown={handleKeydown}
      on:input={autoResize}
    />

    <button
      type="button"
      class="chat-input-bar__send-btn"
      disabled={!message.trim() || sending}
      on:click={handleSend}
      aria-label="Enviar mensaje"
    >
      {#if sending}
        <span class="chat-input-bar__spinner" />
      {:else}
        ➤
      {/if}
    </button>
  </div>

  <!-- Fila inferior: Módulos workspace + Proyecto -->
  <div class="chat-input-bar__bottom">
    <div class="chat-input-bar__modules">
      <ProjectButton
        size="sm"
        showLabel={false}
        on:select={handleProjectSelect}
      />

      <FileBrowserButton
        size="sm"
        showLabel={false}
        {projectId}
        on:select={handleFileSelect2}
        on:openEditor={handleOpenEditor}
        on:openPdf={handleOpenPdf}
      />

      <TextEditorButton
        size="sm"
        showLabel={false}
        file={editorFile}
        {projectId}
        on:openEditor={handleOpenEditor}
      />

      <PdfViewerButton
        size="sm"
        showLabel={false}
        file={pdfFile}
        {projectId}
      />
    </div>

    <!-- Hint de envío -->
    <span class="chat-input-bar__hint">
      Ctrl+Enter para enviar
    </span>
  </div>

  <!-- Safe area para móviles -->
  <div class="chat-input-bar__safe-area" />
</div>

<style>
  .chat-input-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--color-bg-card, #1a1d24);
    border-top: 1px solid var(--color-border, #2e3440);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  }

  /* Top row */
  .chat-input-bar__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--color-border, #2e3440);
    background: var(--color-bg-elevated, #232830);
  }

  .chat-input-bar__modules {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .chat-input-bar__model-badge {
    font-size: 0.6875rem;
    padding: 0.125rem 0.5rem;
    background: hsl(217 91% 60% / 0.15);
    color: hsl(217 91% 60%);
    border-radius: 1rem;
    max-width: 120px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Attachments */
  .chat-input-bar__attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0.5rem;
    border-bottom: 1px solid var(--color-border, #2e3440);
    background: var(--color-bg-elevated, #232830);
  }

  .attachment-chip {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--color-bg-card, #1a1d24);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: 1rem;
    font-size: 0.75rem;
  }

  .attachment-chip__icon {
    font-size: 0.875rem;
  }

  .attachment-chip__name {
    max-width: 100px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text, #ffffff);
  }

  .attachment-chip__remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: var(--color-bg-hover, #2a2f3a);
    color: var(--color-text-muted, #9ca3af);
    border: none;
    border-radius: 50%;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .attachment-chip__remove:hover {
    background: hsl(0 70% 50%);
    color: white;
  }

  /* Input row */
  .chat-input-bar__input {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .chat-input-bar__attach-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: transparent;
    color: var(--color-text-muted, #9ca3af);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: 50%;
    font-size: 1rem;
    cursor: pointer;
    transition: all 150ms ease;
    flex-shrink: 0;
  }

  .chat-input-bar__attach-btn:hover {
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border-color: hsl(142 71% 45% / 0.3);
  }

  .chat-input-bar__textarea {
    flex: 1;
    min-height: 36px;
    max-height: 120px;
    padding: 0.5rem 0.75rem;
    background: var(--color-bg, #0d1117);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: 1.125rem;
    font-size: 0.9375rem;
    line-height: 1.4;
    resize: none;
    outline: none;
    transition: border-color 150ms ease;
  }

  .chat-input-bar__textarea:focus {
    border-color: hsl(217 91% 60%);
  }

  .chat-input-bar__textarea::placeholder {
    color: var(--color-text-muted, #9ca3af);
  }

  .chat-input-bar__textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .chat-input-bar__send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: hsl(217 91% 60%);
    color: white;
    border: none;
    border-radius: 50%;
    font-size: 1.125rem;
    cursor: pointer;
    transition: all 150ms ease;
    flex-shrink: 0;
  }

  .chat-input-bar__send-btn:hover:not(:disabled) {
    background: hsl(217 91% 55%);
    transform: scale(1.05);
  }

  .chat-input-bar__send-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .chat-input-bar__send-btn:disabled {
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text-muted, #9ca3af);
    cursor: not-allowed;
  }

  .chat-input-bar__spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Bottom row */
  .chat-input-bar__bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    border-top: 1px solid var(--color-border, #2e3440);
    background: var(--color-bg-elevated, #232830);
  }

  .chat-input-bar__hint {
    font-size: 0.625rem;
    color: var(--color-text-muted, #9ca3af);
    opacity: 0.7;
  }

  /* Safe area */
  .chat-input-bar__safe-area {
    height: env(safe-area-inset-bottom, 0);
  }

  /* Animations */
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Mobile adjustments */
  @media (max-width: 400px) {
    .chat-input-bar__hint {
      display: none;
    }

    .chat-input-bar__modules {
      gap: 0.125rem;
    }
  }
</style>
