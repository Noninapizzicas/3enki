<script lang="ts">
  /**
   * Message - Componente de mensaje de chat
   *
   * Features:
   * - Estilos diferenciados por rol (user, assistant, system)
   * - Timestamp formateado
   * - Adjuntos inline
   * - Indicador de streaming
   * - Checkbox de contexto (incluir/excluir del contexto AI)
   * - Estilos visuales para mensajes fuera del contexto
   */

  import { createEventDispatcher } from 'svelte';
  import type { Message, Attachment } from '$lib/ui-core';
  import { PROVIDER_ICONS } from '$lib/ui-core';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { idiomaVoz, vozActiva } from '$lib/stores/voz';
  import Chip from './Chip.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import RecipeInvestigationResult from '../recipes/RecipeInvestigationResult.svelte';

  export let message: Message;
  export let showContextToggle: boolean = true;

  const dispatch = createEventDispatcher<{
    toggleContext: { id: string; inContext: boolean };
  }>();

  let speakState: 'idle' | 'loading' | 'playing' = 'idle';
  let currentSource: AudioBufferSourceNode | null = null;
  let audioCtx: AudioContext | null = null;

  function stripMarkdown(md: string): string {
    return md
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/#{1,6}\s+/g, '')
      .replace(/[*_~]{1,3}/g, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/^\s*>\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function stopPlayback() {
    if (currentSource) {
      currentSource.onended = null;
      currentSource.stop();
      currentSource.disconnect();
      currentSource = null;
    }
    speakState = 'idle';
  }

  async function handleSpeak() {
    if (speakState === 'playing') {
      stopPlayback();
      return;
    }
    if (speakState === 'loading') return;

    const texto = stripMarkdown(message.content || '');
    if (!texto) return;

    speakState = 'loading';
    try {
      const res = await mqttRequest<{ audio_base64: string; sample_rate: number }>(
        'motor-voz', 'decir',
        { texto, idioma: $idiomaVoz, voz: $vozActiva },
        { timeout: 30000 }
      );
      const binary = atob(res.data.audio_base64);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);

      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const rawBuf = buf.buffer.slice(0);
      const audioBuf = await audioCtx.decodeAudioData(rawBuf);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(audioCtx.destination);
      source.onended = () => { stopPlayback(); };
      source.start();
      currentSource = source;
      speakState = 'playing';
    } catch (e) {
      console.error('[Message] speak failed:', e);
      speakState = 'idle';
    }
  }

  // Formatear timestamp
  function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Provider que escribió el mensaje (de la metadata; puede venir como string JSON).
  function providerOf(m: Message): string | null {
    let md: any = m.metadata;
    if (typeof md === 'string') { try { md = JSON.parse(md); } catch { md = null; } }
    return md?.provider || null;
  }

  // Icono por rol — para el asistente, el icono del MODELO que lo escribió (no un 🤖 fijo),
  // así de un vistazo sabes con qué modelo hablas. Fallback 🤖 si no hay provider o no mapea.
  function getRoleIcon(m: Message): string {
    if (m.role === 'assistant') {
      const prov = providerOf(m);
      if (!prov) return '🤖';
      // exacto -> por prefijo antes del primer '-' (deepseek-anthropic -> deepseek) -> fallback.
      // Así un id de provider variante no cae al 🤖 genérico por faltar una clave.
      return PROVIDER_ICONS[prov] || PROVIDER_ICONS[prov.split('-')[0]] || '🤖';
    }
    const icons: Record<string, string> = { user: '👤', system: '⚙️' };
    return icons[m.role] || '💬';
  }

  function handleToggleContext() {
    const newValue = !inContext;
    dispatch('toggleContext', { id: message.id, inContext: newValue });
  }

  $: roleIcon = getRoleIcon(message);
  $: formattedTime = formatTime(message.timestamp);
  $: hasAttachments = message.attachments && message.attachments.length > 0;
  $: inContext = message.in_context !== false; // Default true si undefined
  $: isManuallyToggled = message.manually_toggled === true;

  // Detectar si el mensaje contiene resultado de investigación de receta
  $: investigationData = (() => {
    // 1. Primero, intentar de metadata
    if (message.metadata?.investigation_result && typeof message.metadata.investigation_result === 'object') {
      return message.metadata.investigation_result;
    }

    // 2. Si el contenido es una string que empieza con JSON para investigación
    if (typeof message.content === 'string') {
      try {
        // Intentar parsear si parece JSON y contiene investigacion_id
        const match = message.content.match(/^\{[\s\S]*?"investigacion_id"/);
        if (match) {
          const jsonStr = message.content.substring(0, message.content.indexOf('\n') > 0 ? message.content.indexOf('\n') : undefined);
          const parsed = JSON.parse(jsonStr);
          if (parsed.investigacion_id) {
            return parsed;
          }
        }
      } catch (e) {
        // No es JSON o no es investigación
      }
    }

    return null;
  })();
</script>

<div
  class="message {message.role}"
  class:streaming={message.streaming}
  class:out-of-context={!inContext}
>
  <!-- Context toggle checkbox -->
  {#if showContextToggle && message.role !== 'system'}
    <label
      class="context-toggle"
      title={inContext ? 'En contexto (clic para excluir)' : 'Fuera de contexto (clic para incluir)'}
    >
      <input
        type="checkbox"
        checked={inContext}
        on:change={handleToggleContext}
      />
      <span class="checkmark" class:manual={isManuallyToggled}></span>
    </label>
  {/if}

  <div class="message-content">
    <div class="header">
      <span class="role-icon">{roleIcon}</span>
      <span class="time">{formattedTime}</span>
      {#if message.streaming}
        <span class="streaming-indicator">●</span>
      {/if}
      {#if !inContext}
        <span class="context-badge" title="Este mensaje no se incluirá en el contexto de la IA">⊘</span>
      {/if}
    </div>

    <div class="content" class:content-markdown={message.role === 'assistant' && !investigationData}>
      {#if investigationData}
        <!-- Mostrar resultado de investigación -->
        <RecipeInvestigationResult
          data={investigationData}
          on:save
          on:edit
          on:cancel
        />
      {:else if message.role === 'assistant' && message.content}
        <MarkdownRenderer content={message.content} />
      {:else}
        {message.content}
      {/if}
      {#if message.streaming && !message.content}
        <span class="typing">...</span>
      {/if}
    </div>

    {#if message.role === 'assistant' && !message.streaming && message.content}
      <div class="message-actions">
        <button
          class="action-btn speak-btn"
          class:loading={speakState === 'loading'}
          class:playing={speakState === 'playing'}
          on:click={handleSpeak}
          title={speakState === 'playing' ? 'Detener' : speakState === 'loading' ? 'Generando voz...' : 'Escuchar'}
        >
          {#if speakState === 'loading'}
            <span class="action-icon spin">&#9696;</span>
          {:else if speakState === 'playing'}
            <span class="action-icon">&#9724;</span>
          {:else}
            <span class="action-icon">&#9654;</span>
          {/if}
        </button>
      </div>
    {/if}

    {#if hasAttachments}
      <div class="attachments">
        {#each message.attachments as attachment (attachment.id)}
          <Chip
            id={attachment.id}
            name={attachment.name}
            type={attachment.type}
            size={attachment.size}
            removable={false}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .message {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    max-width: 85%;
    transition: opacity 0.2s ease, filter 0.2s ease;
  }

  .message-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Context toggle checkbox */
  .context-toggle {
    position: relative;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 0.25rem;
    cursor: pointer;
  }

  .context-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }

  .checkmark {
    position: absolute;
    top: 0;
    left: 0;
    width: 16px;
    height: 16px;
    background: transparent;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    transition: all 0.15s ease;
  }

  .context-toggle:hover .checkmark {
    border-color: rgba(255, 255, 255, 0.6);
  }

  .context-toggle input:checked ~ .checkmark {
    background: var(--color-success, #22c55e);
    border-color: var(--color-success, #22c55e);
  }

  .context-toggle input:checked ~ .checkmark::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 4px;
    height: 8px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  /* Indicator for manually toggled */
  .checkmark.manual {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2);
  }

  /* Out of context styles */
  .message.out-of-context {
    opacity: 0.5;
    filter: grayscale(30%);
  }

  .message.out-of-context .content {
    text-decoration: line-through;
    text-decoration-color: rgba(255, 255, 255, 0.3);
  }

  .context-badge {
    font-size: 0.75rem;
    opacity: 0.7;
    margin-left: auto;
  }

  /* Estilos por rol */
  .message.user {
    align-self: flex-end;
    background: var(--color-user-message, #3b82f6);
    color: white;
    border-bottom-right-radius: 0.125rem;
  }

  .message.assistant {
    align-self: flex-start;
    background: var(--color-surface, rgba(255, 255, 255, 0.1));
    color: var(--color-text, #e5e5e5);
    border-bottom-left-radius: 0.125rem;
  }

  .message.system {
    align-self: center;
    background: var(--color-system-message, rgba(255, 255, 255, 0.05));
    color: var(--color-text-muted, #a3a3a3);
    font-size: 0.875rem;
    max-width: 70%;
    text-align: center;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    opacity: 0.8;
  }

  .role-icon {
    font-size: 0.875rem;
  }

  .time {
    color: inherit;
    opacity: 0.7;
  }

  /* Streaming indicator */
  .streaming-indicator {
    animation: pulse 1s infinite;
    color: var(--color-success, #22c55e);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* Content */
  .content {
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Markdown content: let MarkdownRenderer handle whitespace */
  .content-markdown {
    white-space: normal;
  }

  .typing {
    animation: typing 1s infinite;
  }

  @keyframes typing {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* Attachments */
  .attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.25rem;
  }

  /* Message actions (speak button) */
  .message-actions {
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .message:hover .message-actions {
    opacity: 1;
  }

  .message-actions:has(.loading),
  .message-actions:has(.playing) {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 0.375rem;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s ease, background 0.15s ease;
  }

  .action-btn:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.15);
  }

  .action-btn.loading {
    opacity: 0.5;
    cursor: wait;
  }

  .action-btn.playing {
    opacity: 1;
    background: var(--color-success, #22c55e);
    color: white;
  }

  .action-icon {
    font-size: 0.75rem;
    line-height: 1;
  }

  .action-icon.spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Streaming state */
  .message.streaming {
    border: 1px solid var(--color-success, #22c55e);
  }
</style>
