<script lang="ts">
  /**
   * ConversationPanel - Gestión de Conversaciones por Proyecto
   *
   * Gestos:
   * - Tap: Ver conversaciones (30% panel)
   * - Doble tap: Nueva conversación (50% modal)
   * - Long press: Config conversación activa (80% modal)
   *
   * Conecta con: /api/modules/conversation-manager/ui/state?project_id=X
   */
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { FloatingPanel } from '$components/feedback';

  // Props
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let projectId: string;
  export let apiBase: string = '/api/modules/conversation-manager';

  // Config tiempos
  const TAP_DELAY = 300;
  const LONG_PRESS_TIME = 500;

  // Estado panel
  let panelOpen = false;
  let panelMode: 'list' | 'chat' | 'create' | 'settings' = 'list';
  let loading = false;
  let error: string | null = null;

  // Estado para confirmación de eliminación
  let deleteConfirm: { id: string; title: string } | null = null;

  // Datos UI-ready desde backend
  let sections: Array<{
    id: string;
    label: string;
    conversations: Array<ConversationItem>;
  }> = [];
  let conversations: ConversationItem[] = [];
  let stats = { total_conversations: 0, total_messages: 0, active_today: 0 };

  // Tipos
  interface ConversationItem {
    id: string;
    title: string;
    displayTitle: string;
    subtitle?: string;
    icon?: string;
    message_count: number;
    model?: string;
    provider?: string;
    updated_at: string;
    created_at: string;
    isRecent?: boolean;
  }

  interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokens?: number;
    cost?: number;
    created_at: string;
  }

  // Conversación activa
  let activeConversation: ConversationItem | null = null;
  let messages: Message[] = [];
  let newMessage = '';
  let sending = false;

  // Formulario nueva conversación
  let newConversation = {
    title: '',
    system_prompt: '',
    model: '',
    provider: '',
    temperature: 0.7,
    max_tokens: 2000,
    context_window: 20
  };

  // Timers
  let tapTimeout: number | null = null;
  let longPressTimeout: number | null = null;
  let tapCount = 0;
  let isLongPress = false;

  // Scroll ref para mensajes
  let messagesContainer: HTMLElement;

  const dispatch = createEventDispatcher<{
    select: { conversation: ConversationItem };
    message: { conversationId: string; content: string };
    create: { conversation: typeof newConversation };
    delete: { conversationId: string };
    error: { message: string };
  }>();

  // Contador
  $: totalConversations = stats.total_conversations;
  $: totalMessages = stats.total_messages;

  // ==========================================
  // API Functions
  // ==========================================

  async function loadUIState() {
    if (!projectId) {
      error = 'project_id es requerido';
      return;
    }

    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/ui/state?project_id=${projectId}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();

      if (data.success) {
        sections = data.sections || [];
        conversations = data.conversations || [];
        stats = data.stats || { total_conversations: 0, total_messages: 0, active_today: 0 };
      } else {
        error = data.message || data.error || 'Error al cargar';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'No se pudo conectar con el servidor';
      dispatch('error', { message: error });
      console.error('ConversationPanel: Error loading UI state', err);
    } finally {
      loading = false;
    }
  }

  async function loadMessages(conversationId: string) {
    loading = true;
    try {
      const res = await fetch(`${apiBase}/conversations/${conversationId}/messages?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        messages = data.messages || [];
        scrollToBottom();
      }
    } catch (err) {
      console.error('Error loading messages:', err);
      error = 'Error al cargar mensajes';
    } finally {
      loading = false;
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !activeConversation || sending) return;

    const content = newMessage.trim();
    newMessage = '';
    sending = true;
    error = null;

    // Añadir mensaje del usuario optimisticamente
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      created_at: new Date().toISOString()
    };
    messages = [...messages, tempUserMsg];
    scrollToBottom();

    try {
      const res = await fetch(`${apiBase}/conversations/${activeConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        // Reemplazar mensaje temporal con el real
        messages = messages.filter(m => m.id !== tempUserMsg.id);
        messages = [...messages, data.user_message, data.assistant_message];

        dispatch('message', { conversationId: activeConversation.id, content });
        scrollToBottom();

        // Actualizar stats
        await loadUIState();
      } else {
        throw new Error(data.error || 'Error al enviar');
      }
    } catch (err: any) {
      error = err.message || 'Error al enviar mensaje';
      // Remover mensaje optimista en error
      messages = messages.filter(m => m.id !== tempUserMsg.id);
    } finally {
      sending = false;
    }
  }

  async function createConversation() {
    if (!newConversation.title) {
      error = 'El título es requerido';
      return;
    }

    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          title: newConversation.title,
          system_prompt: newConversation.system_prompt || undefined,
          model: newConversation.model || undefined,
          provider: newConversation.provider || undefined,
          temperature: newConversation.temperature,
          max_tokens: newConversation.max_tokens,
          context_window: newConversation.context_window
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        dispatch('create', { conversation: newConversation });
        resetNewConversationForm();
        await loadUIState();

        // Abrir la conversación recién creada
        selectConversation(data.conversation);
      } else {
        error = data.error || 'Error al crear conversación';
      }
    } catch (err) {
      error = 'Error de conexión al crear';
    } finally {
      loading = false;
    }
  }

  async function deleteConversation(id: string) {
    loading = true;
    try {
      const res = await fetch(`${apiBase}/conversations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        dispatch('delete', { conversationId: id });
        deleteConfirm = null;

        if (activeConversation?.id === id) {
          activeConversation = null;
          messages = [];
          panelMode = 'list';
        }

        await loadUIState();
      } else {
        error = data.error || 'Error al eliminar';
      }
    } catch (err) {
      error = 'Error de conexión al eliminar';
    } finally {
      loading = false;
    }
  }

  async function updateConversation(updates: Partial<typeof newConversation>) {
    if (!activeConversation) return;

    loading = true;
    try {
      const res = await fetch(`${apiBase}/conversations/${activeConversation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        activeConversation = { ...activeConversation, ...data.conversation };
        await loadUIState();
        panelMode = 'chat';
      }
    } catch (err) {
      error = 'Error al actualizar';
    } finally {
      loading = false;
    }
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  function selectConversation(conv: ConversationItem | any) {
    activeConversation = conv;
    panelMode = 'chat';
    loadMessages(conv.id);
    dispatch('select', { conversation: conv });
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }, 50);
  }

  function resetNewConversationForm() {
    newConversation = {
      title: '',
      system_prompt: '',
      model: '',
      provider: '',
      temperature: 0.7,
      max_tokens: 2000,
      context_window: 20
    };
  }

  function closePanel() {
    panelOpen = false;
    error = null;
    // No resetear conversación activa para mantener contexto
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }

  // ==========================================
  // Gesture Handlers
  // ==========================================

  function handleTouchStart() {
    isLongPress = false;

    longPressTimeout = window.setTimeout(() => {
      isLongPress = true;
      panelMode = activeConversation ? 'settings' : 'list';
      panelOpen = true;
      loadUIState();
    }, LONG_PRESS_TIME);
  }

  function handleTouchEnd() {
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }

    if (isLongPress) {
      isLongPress = false;
      return;
    }

    tapCount++;

    if (tapCount === 1) {
      tapTimeout = window.setTimeout(() => {
        // Single tap: abrir lista
        panelMode = activeConversation ? 'chat' : 'list';
        panelOpen = true;
        loadUIState();
        tapCount = 0;
      }, TAP_DELAY);
    } else if (tapCount === 2) {
      // Double tap: nueva conversación
      if (tapTimeout) clearTimeout(tapTimeout);
      panelMode = 'create';
      panelOpen = true;
      loadUIState();
      tapCount = 0;
    }
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  onMount(() => {
    if (projectId) {
      loadUIState();
    }
  });

  onDestroy(() => {
    if (tapTimeout) clearTimeout(tapTimeout);
    if (longPressTimeout) clearTimeout(longPressTimeout);
  });

  // ==========================================
  // Reactive
  // ==========================================

  $: if (projectId) {
    loadUIState();
  }

  // Tamaños
  const sizes = {
    sm: { button: 'w-8 h-8', icon: 'text-sm', badge: 'text-[10px] min-w-[14px] h-[14px]' },
    md: { button: 'w-10 h-10', icon: 'text-base', badge: 'text-[11px] min-w-[16px] h-[16px]' },
    lg: { button: 'w-12 h-12', icon: 'text-lg', badge: 'text-xs min-w-[18px] h-[18px]' }
  };

  $: sizeClasses = sizes[size];
</script>

<!-- Botón principal -->
<button
  class="conversation-btn {sizeClasses.button}"
  on:touchstart|preventDefault={handleTouchStart}
  on:touchend|preventDefault={handleTouchEnd}
  on:mousedown={handleTouchStart}
  on:mouseup={handleTouchEnd}
  on:mouseleave={() => longPressTimeout && clearTimeout(longPressTimeout)}
  title="Tap: Chat | 2x Tap: Nueva | Mantener: Config"
>
  <span class={sizeClasses.icon}>{activeConversation ? '💬' : '🗨️'}</span>
  {#if totalConversations > 0}
    <span class="badge {sizeClasses.badge}">{totalConversations}</span>
  {/if}
</button>

<!-- Panel flotante -->
<FloatingPanel bind:open={panelOpen} on:close={closePanel}>
  <div class="conversation-panel" class:panel-large={panelMode === 'settings' || panelMode === 'chat'}>
    <!-- Header -->
    <div class="panel-header">
      {#if panelMode === 'list'}
        <h3>🗨️ Conversaciones</h3>
        <button class="refresh-btn" on:click={loadUIState} disabled={loading}>
          {loading ? '⏳' : '🔄'}
        </button>
      {:else if panelMode === 'chat'}
        <button class="back-btn" on:click={() => panelMode = 'list'}>←</button>
        <h3 class="chat-title">{activeConversation?.displayTitle || 'Chat'}</h3>
        <button class="settings-btn" on:click={() => panelMode = 'settings'}>⚙️</button>
      {:else if panelMode === 'create'}
        <h3>➕ Nueva Conversación</h3>
      {:else if panelMode === 'settings'}
        <button class="back-btn" on:click={() => panelMode = 'chat'}>←</button>
        <h3>⚙️ Configuración</h3>
      {/if}
    </div>

    {#if error}
      <div class="panel-error">{error}</div>
    {/if}

    {#if loading && panelMode === 'list'}
      <div class="loading">Cargando...</div>
    {:else if panelMode === 'list'}
      <!-- Stats -->
      <div class="stats-row">
        <span class="stat">💬 {stats.total_conversations}</span>
        <span class="stat">📝 {stats.total_messages}</span>
        <span class="stat">🔥 {stats.active_today} hoy</span>
      </div>

      <!-- Lista de conversaciones por secciones -->
      <div class="conversations-list">
        {#each sections as section}
          <div class="section">
            <div class="section-header">{section.label}</div>
            {#each section.conversations as conv}
              <div
                class="conversation-item"
                class:active={activeConversation?.id === conv.id}
                class:recent={conv.isRecent}
                on:click={() => selectConversation(conv)}
                on:keydown={(e) => e.key === 'Enter' && selectConversation(conv)}
                role="button"
                tabindex="0"
              >
                <div class="conv-icon">{conv.icon || '💬'}</div>
                <div class="conv-info">
                  <span class="conv-title">{conv.displayTitle}</span>
                  <span class="conv-subtitle">{conv.subtitle}</span>
                </div>
                <div class="conv-meta">
                  <span class="conv-time">{formatDate(conv.updated_at)}</span>
                  <button
                    class="delete-btn"
                    on:click|stopPropagation={() => deleteConfirm = { id: conv.id, title: conv.displayTitle }}
                  >🗑️</button>
                </div>
              </div>
            {/each}
          </div>
        {/each}

        {#if sections.length === 0}
          <div class="empty-state">
            No hay conversaciones.<br>
            <button on:click={() => panelMode = 'create'}>➕ Crear primera</button>
          </div>
        {/if}
      </div>

      <!-- Botón nueva conversación -->
      <button class="new-conversation-btn" on:click={() => panelMode = 'create'}>
        ➕ Nueva conversación
      </button>

    {:else if panelMode === 'chat'}
      <!-- Chat Interface -->
      <div class="chat-container">
        <div class="messages" bind:this={messagesContainer}>
          {#each messages as msg}
            <div class="message {msg.role}">
              <div class="message-content">{msg.content}</div>
              <div class="message-meta">
                {formatTime(msg.created_at)}
                {#if msg.tokens}
                  <span class="tokens">· {msg.tokens} tokens</span>
                {/if}
              </div>
            </div>
          {/each}

          {#if sending}
            <div class="message assistant typing">
              <div class="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          {/if}

          {#if messages.length === 0 && !loading}
            <div class="empty-chat">
              Inicia la conversación enviando un mensaje
            </div>
          {/if}
        </div>

        <div class="chat-input">
          <textarea
            bind:value={newMessage}
            placeholder="Escribe un mensaje..."
            rows="2"
            on:keydown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={sending}
          ></textarea>
          <button
            class="send-btn"
            on:click={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? '⏳' : '📤'}
          </button>
        </div>
      </div>

    {:else if panelMode === 'create'}
      <!-- Formulario nueva conversación -->
      <div class="form-container">
        <div class="form-group">
          <label>Título *</label>
          <input type="text" bind:value={newConversation.title} placeholder="Nueva conversación" />
        </div>

        <div class="form-group">
          <label>System Prompt</label>
          <textarea
            bind:value={newConversation.system_prompt}
            placeholder="Eres un asistente que..."
            rows="3"
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Proveedor</label>
            <input type="text" bind:value={newConversation.provider} placeholder="auto" />
          </div>
          <div class="form-group">
            <label>Modelo</label>
            <input type="text" bind:value={newConversation.model} placeholder="default" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Temperatura ({newConversation.temperature})</label>
            <input type="range" bind:value={newConversation.temperature} min="0" max="2" step="0.1" />
          </div>
          <div class="form-group">
            <label>Context Window</label>
            <input type="number" bind:value={newConversation.context_window} min="1" max="100" />
          </div>
        </div>

        <div class="form-actions">
          <button class="cancel-btn" on:click={() => { panelMode = 'list'; resetNewConversationForm(); }}>
            Cancelar
          </button>
          <button
            class="save-btn"
            on:click={createConversation}
            disabled={loading || !newConversation.title}
          >
            {loading ? '⏳ Creando...' : '✨ Crear'}
          </button>
        </div>
      </div>

    {:else if panelMode === 'settings' && activeConversation}
      <!-- Configuración de conversación activa -->
      <div class="settings-container">
        <div class="settings-info">
          <div class="info-item">
            <span class="label">ID:</span>
            <span class="value">{activeConversation.id.slice(0, 8)}...</span>
          </div>
          <div class="info-item">
            <span class="label">Mensajes:</span>
            <span class="value">{activeConversation.message_count}</span>
          </div>
          <div class="info-item">
            <span class="label">Modelo:</span>
            <span class="value">{activeConversation.model || 'auto'}</span>
          </div>
          <div class="info-item">
            <span class="label">Proveedor:</span>
            <span class="value">{activeConversation.provider || 'auto'}</span>
          </div>
          <div class="info-item">
            <span class="label">Creada:</span>
            <span class="value">{new Date(activeConversation.created_at).toLocaleString('es')}</span>
          </div>
          <div class="info-item">
            <span class="label">Actualizada:</span>
            <span class="value">{new Date(activeConversation.updated_at).toLocaleString('es')}</span>
          </div>
        </div>

        <div class="form-group">
          <label>Título</label>
          <input
            type="text"
            value={activeConversation.title}
            on:change={(e) => updateConversation({ title: e.currentTarget.value })}
          />
        </div>

        <div class="danger-zone">
          <h4>Zona de peligro</h4>
          <button
            class="danger-btn"
            on:click={() => deleteConfirm = { id: activeConversation!.id, title: activeConversation!.displayTitle }}
          >
            🗑️ Eliminar conversación
          </button>
        </div>
      </div>
    {/if}

    <!-- Modal de confirmación de eliminación -->
    {#if deleteConfirm}
      <div
        class="delete-confirm-overlay"
        on:click={() => deleteConfirm = null}
        on:keydown={(e) => e.key === 'Escape' && (deleteConfirm = null)}
        role="button"
        tabindex="0"
      >
        <div class="delete-confirm-modal" on:click|stopPropagation role="dialog" aria-modal="true">
          <div class="delete-confirm-icon">⚠️</div>
          <h4>¿Eliminar conversación?</h4>
          <p class="delete-confirm-name">"{deleteConfirm.title}"</p>
          <p class="delete-confirm-warning">Se eliminarán todos los mensajes. Esta acción no se puede deshacer.</p>
          <div class="delete-confirm-actions">
            <button class="cancel-btn" on:click={() => deleteConfirm = null}>Cancelar</button>
            <button
              class="confirm-delete-btn"
              on:click={() => deleteConversation(deleteConfirm!.id)}
              disabled={loading}
            >
              {loading ? '⏳ Eliminando...' : '🗑️ Eliminar'}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</FloatingPanel>

<style>
  /* Botón principal */
  .conversation-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-secondary, #f3f4f6);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .conversation-btn:hover {
    background: var(--color-bg-tertiary, #e5e7eb);
  }

  .conversation-btn:active {
    transform: scale(0.95);
  }

  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: var(--color-primary, #3b82f6);
    color: white;
    border-radius: 999px;
    padding: 0 4px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Panel */
  .conversation-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 60vh;
    overflow: hidden;
  }

  .panel-large {
    max-height: 80vh;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-bg-secondary, #f9fafb);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    flex: 1;
  }

  .chat-title {
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .back-btn, .settings-btn, .refresh-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 14px;
  }

  .back-btn:hover, .settings-btn:hover, .refresh-btn:hover {
    background: var(--color-bg-tertiary, #e5e7eb);
  }

  .panel-error {
    background: #fef2f2;
    color: #dc2626;
    padding: 8px 12px;
    font-size: 12px;
    border-bottom: 1px solid #fecaca;
  }

  .loading {
    padding: 24px;
    text-align: center;
    color: var(--color-text-secondary, #6b7280);
  }

  /* Stats */
  .stats-row {
    display: flex;
    gap: 12px;
    padding: 8px 16px;
    background: var(--color-bg-tertiary, #f3f4f6);
    font-size: 12px;
  }

  .stat {
    color: var(--color-text-secondary, #6b7280);
  }

  /* Lista de conversaciones */
  .conversations-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .section {
    margin-bottom: 12px;
  }

  .section-header {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-secondary, #6b7280);
    text-transform: uppercase;
    padding: 4px 8px;
  }

  .conversation-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    background: var(--color-bg-primary, white);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    margin-bottom: 4px;
  }

  .conversation-item:hover {
    background: var(--color-bg-secondary, #f9fafb);
    border-color: var(--color-primary, #3b82f6);
  }

  .conversation-item.active {
    background: var(--color-primary-light, #eff6ff);
    border-color: var(--color-primary, #3b82f6);
  }

  .conversation-item.recent {
    border-left: 3px solid var(--color-success, #22c55e);
  }

  .conv-icon {
    font-size: 18px;
  }

  .conv-info {
    flex: 1;
    min-width: 0;
  }

  .conv-title {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary, #111827);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conv-subtitle {
    display: block;
    font-size: 11px;
    color: var(--color-text-secondary, #6b7280);
  }

  .conv-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .conv-time {
    font-size: 11px;
    color: var(--color-text-tertiary, #9ca3af);
  }

  .delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.5;
    font-size: 12px;
    padding: 2px;
  }

  .delete-btn:hover {
    opacity: 1;
  }

  .empty-state {
    text-align: center;
    padding: 32px;
    color: var(--color-text-secondary, #6b7280);
    font-size: 13px;
  }

  .empty-state button {
    margin-top: 12px;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
  }

  .new-conversation-btn {
    margin: 8px 16px 16px;
    padding: 10px;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }

  .new-conversation-btn:hover {
    background: var(--color-primary-dark, #2563eb);
  }

  /* Chat */
  .chat-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .message {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 16px;
    font-size: 13px;
    line-height: 1.4;
  }

  .message.user {
    align-self: flex-end;
    background: var(--color-primary, #3b82f6);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .message.assistant {
    align-self: flex-start;
    background: var(--color-bg-secondary, #f3f4f6);
    color: var(--color-text-primary, #111827);
    border-bottom-left-radius: 4px;
  }

  .message.system {
    align-self: center;
    background: #fef3c7;
    color: #92400e;
    font-size: 11px;
    max-width: 90%;
  }

  .message-content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .message-meta {
    font-size: 10px;
    margin-top: 4px;
    opacity: 0.7;
  }

  .tokens {
    font-size: 9px;
  }

  .typing-indicator {
    display: flex;
    gap: 4px;
    padding: 4px 0;
  }

  .typing-indicator span {
    width: 6px;
    height: 6px;
    background: var(--color-text-secondary, #6b7280);
    border-radius: 50%;
    animation: typing 1s infinite;
  }

  .typing-indicator span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .typing-indicator span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes typing {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
  }

  .empty-chat {
    text-align: center;
    padding: 32px;
    color: var(--color-text-tertiary, #9ca3af);
    font-size: 13px;
  }

  .chat-input {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-bg-secondary, #f9fafb);
  }

  .chat-input textarea {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 8px;
    resize: none;
    font-size: 13px;
    font-family: inherit;
  }

  .chat-input textarea:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .send-btn {
    padding: 10px 16px;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
  }

  .send-btn:disabled {
    background: var(--color-bg-tertiary, #e5e7eb);
    cursor: not-allowed;
  }

  /* Formularios */
  .form-container, .settings-container {
    padding: 16px;
    overflow-y: auto;
  }

  .form-group {
    margin-bottom: 12px;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-secondary, #6b7280);
    margin-bottom: 4px;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border, #e5e7eb);
  }

  .cancel-btn {
    padding: 8px 16px;
    background: var(--color-bg-secondary, #f3f4f6);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }

  .save-btn {
    padding: 8px 16px;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }

  .save-btn:disabled {
    background: var(--color-bg-tertiary, #e5e7eb);
    color: var(--color-text-secondary, #6b7280);
    cursor: not-allowed;
  }

  /* Settings */
  .settings-info {
    background: var(--color-bg-secondary, #f9fafb);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 4px 0;
  }

  .info-item .label {
    color: var(--color-text-secondary, #6b7280);
  }

  .info-item .value {
    color: var(--color-text-primary, #111827);
    font-weight: 500;
  }

  .danger-zone {
    margin-top: 24px;
    padding: 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
  }

  .danger-zone h4 {
    margin: 0 0 12px;
    color: #dc2626;
    font-size: 13px;
  }

  .danger-btn {
    width: 100%;
    padding: 10px;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }

  .danger-btn:hover {
    background: #b91c1c;
  }

  /* Modal confirmación */
  .delete-confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .delete-confirm-modal {
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 320px;
    text-align: center;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }

  .delete-confirm-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  .delete-confirm-modal h4 {
    margin: 0 0 8px;
    font-size: 16px;
  }

  .delete-confirm-name {
    color: var(--color-text-primary, #111827);
    font-weight: 500;
    margin: 0 0 8px;
  }

  .delete-confirm-warning {
    color: var(--color-text-secondary, #6b7280);
    font-size: 12px;
    margin: 0 0 16px;
  }

  .delete-confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  .confirm-delete-btn {
    padding: 8px 16px;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }

  .confirm-delete-btn:disabled {
    background: #fca5a5;
    cursor: not-allowed;
  }
</style>
