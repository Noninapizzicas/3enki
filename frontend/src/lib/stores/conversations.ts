/**
 * Conversations Store - MQTT Request/Response
 *
 * Gestiona conversaciones AI vinculadas a proyectos
 * - Lista de conversaciones del proyecto activo
 * - Conversación activa con mensajes
 * - Configuración por conversación
 *
 * @see modules/conversation-manager
 */

import { writable, derived, get } from 'svelte/store';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';
import { activeProjectId } from './projects';
import { saveConversation, getState } from './persistence';

// =============================================================================
// TYPES
// =============================================================================

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: Attachment[];
  tokens: number | null;
  cost: number | null;
  created_at: string;
  metadata: {
    model?: string;
    provider?: string;
    tool_calls?: ToolCallHistory[];
  };
  // Context management
  in_context: boolean;
  manually_toggled: boolean;
}

export interface ContextStats {
  active: number;
  total: number;
  maxContext: number;
  remaining: number;
}

export interface Attachment {
  file_id: string;
  filename: string;
  type: string;
}

export interface ToolCallHistory {
  iteration: number;
  calls: {
    name: string;
    success: boolean;
    error: string | null;
  }[];
}

export interface Conversation {
  id: string;
  project_id: string;
  title: string;
  system_prompt: string;
  model: string | null;
  provider: string | null;
  temperature: number;
  max_tokens: number;
  context_window: number;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationSection {
  id: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'older';
  label: string;
  conversations: Conversation[];
}

export interface ConversationsState {
  // Lista de conversaciones
  conversations: Conversation[];
  sections: ConversationSection[];

  // Conversacion activa
  activeConversationId: string | null;
  activeConversation: Conversation | null;

  // Mensajes de conversacion activa
  messages: Message[];

  // Estado UI
  loading: boolean;
  sending: boolean;
  error: string | null;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: ConversationsState = {
  conversations: [],
  sections: [],
  activeConversationId: null,
  activeConversation: null,
  messages: [],
  loading: false,
  sending: false,
  error: null
};

// =============================================================================
// STORE
// =============================================================================

export const conversationsStore = writable<ConversationsState>(initialState);

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Carga la lista de conversaciones del proyecto activo
 */
export async function loadConversations(projectId?: string): Promise<void> {
  const projId = projectId || get(activeProjectId);

  if (!projId) {
    console.log('[Conversations] No active project, skipping load');
    conversationsStore.update(s => ({
      ...s,
      conversations: [],
      sections: [],
      loading: false
    }));
    return;
  }

  conversationsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<{
      conversations: Conversation[];
      total: number;
    }>('conversation', 'list', { projectId: projId });

    const conversations = response.data.conversations || [];
    const sections = groupByDate(conversations);

    conversationsStore.update(s => ({
      ...s,
      conversations,
      sections,
      loading: false,
      error: null
    }));

    console.log('[Conversations] Loaded:', conversations.length, 'for project', projId);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    conversationsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Conversations] Load failed:', errorMessage);
  }
}

/**
 * Carga una conversacion con sus mensajes
 */
export async function loadConversation(conversationId: string): Promise<void> {
  conversationsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<{
      conversation: Conversation;
      messages: Message[];
    }>('conversation', 'get', { conversationId });

    conversationsStore.update(s => ({
      ...s,
      activeConversationId: conversationId,
      activeConversation: response.data.conversation,
      messages: response.data.messages || [],
      loading: false,
      error: null
    }));

    console.log('[Conversations] Loaded conversation:', conversationId);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    conversationsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Conversations] Load conversation failed:', errorMessage);
  }
}

/**
 * Crea una nueva conversacion con configuración opcional
 */
export async function createConversation(
  config?: Partial<Pick<Conversation, 'title' | 'system_prompt' | 'model' | 'provider' | 'temperature' | 'max_tokens' | 'context_window'>> | string
): Promise<Conversation> {
  const projId = get(activeProjectId);

  if (!projId) {
    throw new Error('No active project');
  }

  conversationsStore.update(s => ({ ...s, loading: true, error: null }));

  // Support both old signature (just title string) and new signature (config object)
  const createData = typeof config === 'string'
    ? { projectId: projId, title: config }
    : {
        projectId: projId,
        title: config?.title || 'Nueva conversación',
        system_prompt: config?.system_prompt,
        model: config?.model,
        provider: config?.provider,
        temperature: config?.temperature,
        max_tokens: config?.max_tokens,
        context_window: config?.context_window
      };

  try {
    const response = await mqttRequest<{
      conversation: Conversation;
    }>('conversation', 'create', createData);

    const conversation = response.data.conversation;

    conversationsStore.update(s => ({
      ...s,
      conversations: [conversation, ...s.conversations],
      sections: groupByDate([conversation, ...s.conversations]),
      activeConversationId: conversation.id,
      activeConversation: conversation,
      messages: [],
      loading: false
    }));

    console.log('[Conversations] Created:', conversation.id);
    return conversation;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    conversationsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Conversations] Create failed:', errorMessage);
    throw error;
  }
}

/**
 * Actualiza una conversacion
 */
export async function updateConversation(
  conversationId: string,
  updates: Partial<Pick<Conversation, 'title' | 'system_prompt' | 'model' | 'provider' | 'temperature' | 'max_tokens' | 'context_window'>>
): Promise<Conversation> {
  try {
    const response = await mqttRequest<{
      conversation: Conversation;
    }>('conversation', 'update', {
      conversationId,
      ...updates
    });

    const conversation = response.data.conversation;

    conversationsStore.update(s => ({
      ...s,
      conversations: s.conversations.map(c =>
        c.id === conversationId ? conversation : c
      ),
      activeConversation: s.activeConversationId === conversationId
        ? conversation
        : s.activeConversation
    }));

    console.log('[Conversations] Updated:', conversationId);
    return conversation;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    conversationsStore.update(s => ({ ...s, error: errorMessage }));
    console.error('[Conversations] Update failed:', errorMessage);
    throw error;
  }
}

/**
 * Elimina una conversacion
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  try {
    await mqttRequest('conversation', 'delete', { conversationId });

    conversationsStore.update(s => {
      const newConversations = s.conversations.filter(c => c.id !== conversationId);
      const isActive = s.activeConversationId === conversationId;

      return {
        ...s,
        conversations: newConversations,
        sections: groupByDate(newConversations),
        activeConversationId: isActive ? null : s.activeConversationId,
        activeConversation: isActive ? null : s.activeConversation,
        messages: isActive ? [] : s.messages
      };
    });

    console.log('[Conversations] Deleted:', conversationId);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    conversationsStore.update(s => ({ ...s, error: errorMessage }));
    console.error('[Conversations] Delete failed:', errorMessage);
    throw error;
  }
}

/**
 * Envia un mensaje y obtiene respuesta de IA
 */
export async function sendMessage(
  content: string,
  attachments: Attachment[] = []
): Promise<{
  user_message: Message;
  assistant_message: Message;
  tokens_used: number;
  cost: number;
}> {
  const state = get(conversationsStore);

  conversationsStore.update(s => ({ ...s, sending: true, error: null }));

  // Optimistic update - agregar mensaje del usuario inmediatamente
  const tempUserMessage: Message = {
    id: `temp-${Date.now()}`,
    conversation_id: state.activeConversationId || '',
    role: 'user',
    content,
    attachments,
    tokens: null,
    cost: null,
    created_at: new Date().toISOString(),
    metadata: {}
  };

  conversationsStore.update(s => ({
    ...s,
    messages: [...s.messages, tempUserMessage]
  }));

  try {
    const response = await mqttRequest<{
      conversationId: string;
      user_message: Message;
      assistant_message: Message;
      tokens_used: number;
      cost: number;
      duration: number;
    }>('conversation', 'send', {
      conversationId: state.activeConversationId,
      projectId: state.activeConversation?.project_id || get(activeProjectId),
      content,
      attachments
    });

    const { user_message, assistant_message, conversationId } = response.data;

    // Si era una conversacion nueva, cargar los datos completos
    const isNewConversation = !state.activeConversationId || state.activeConversationId !== conversationId;

    if (isNewConversation) {
      // Cargar datos completos de la nueva conversacion
      try {
        const convResponse = await mqttRequest<{
          conversation: Conversation;
          messages: Message[];
        }>('conversation', 'get', { conversationId });

        conversationsStore.update(s => {
          // Evitar duplicados en la lista
          const existsInList = s.conversations.some(c => c.id === conversationId);
          const newConversations = existsInList
            ? s.conversations.map(c => c.id === conversationId ? convResponse.data.conversation : c)
            : [convResponse.data.conversation, ...s.conversations];

          return {
            ...s,
            messages: [
              ...s.messages.filter(m => m.id !== tempUserMessage.id),
              user_message,
              assistant_message
            ],
            activeConversationId: conversationId,
            activeConversation: convResponse.data.conversation,
            conversations: newConversations,
            sections: groupByDate(newConversations),
            sending: false
          };
        });
      } catch (err) {
        // Si falla cargar la conversacion, al menos actualizar mensajes
        console.warn('[Conversations] Failed to load new conversation details:', err);
        conversationsStore.update(s => ({
          ...s,
          messages: [
            ...s.messages.filter(m => m.id !== tempUserMessage.id),
            user_message,
            assistant_message
          ],
          activeConversationId: conversationId,
          sending: false
        }));
        loadConversations(); // Intentar recargar lista
      }
    } else {
      // Actualizar conversacion existente con nuevo message_count
      conversationsStore.update(s => {
        const newMessageCount = s.messages.filter(m => m.id !== tempUserMessage.id).length + 2;
        const updatedConversation = s.activeConversation
          ? { ...s.activeConversation, message_count: newMessageCount, updated_at: new Date().toISOString() }
          : null;

        return {
          ...s,
          messages: [
            ...s.messages.filter(m => m.id !== tempUserMessage.id),
            user_message,
            assistant_message
          ],
          activeConversation: updatedConversation,
          conversations: s.conversations.map(c =>
            c.id === conversationId && updatedConversation
              ? updatedConversation
              : c
          ),
          activeConversationId: conversationId,
          sending: false
        };
      });
    }

    console.log('[Conversations] Message sent, tokens:', response.data.tokens_used);
    return response.data;
  } catch (error) {
    // Rollback optimistic update
    conversationsStore.update(s => ({
      ...s,
      messages: s.messages.filter(m => m.id !== tempUserMessage.id),
      sending: false,
      error: getErrorMessage(error)
    }));
    console.error('[Conversations] Send failed:', getErrorMessage(error));
    throw error;
  }
}

/**
 * Selecciona una conversacion como activa
 * Sincroniza con el store de chat para que ChatArea muestre los mensajes
 */
export async function selectConversation(convId: string): Promise<void> {
  // Cargar conversación en el store de conversations
  await loadConversation(convId);

  // Sincronizar con el store de chat (para ChatArea y ChatInput)
  const { loadConversation: loadChatConversation } = await import('./chat');
  await loadChatConversation(convId);

  // Guardar en localStorage para persistir entre sesiones
  saveConversation(convId);
  console.log('[Conversations] Selected and saved:', convId);
}

/**
 * Deselecciona la conversacion activa
 */
export function clearActiveConversation(): void {
  conversationsStore.update(s => ({
    ...s,
    activeConversationId: null,
    activeConversation: null,
    messages: []
  }));
}

/**
 * Limpia el error actual
 */
export function clearError(): void {
  conversationsStore.update(s => ({ ...s, error: null }));
}

/**
 * Toggle de inclusión de mensaje en contexto
 * @param messageId - ID del mensaje
 * @param inContext - true para incluir, false para excluir
 */
export async function toggleMessageContext(
  messageId: string,
  inContext: boolean
): Promise<void> {
  const state = get(conversationsStore);
  const projId = get(activeProjectId);

  if (!projId) {
    throw new Error('No active project');
  }

  // Optimistic update
  conversationsStore.update(s => ({
    ...s,
    messages: s.messages.map(m =>
      m.id === messageId
        ? { ...m, in_context: inContext, manually_toggled: true }
        : m
    )
  }));

  try {
    await mqttRequest('conversation', 'toggleContext', {
      projectId: projId,
      messageId,
      inContext
    });

    console.log('[Conversations] Toggled context:', messageId, inContext);
  } catch (error) {
    // Rollback on error
    conversationsStore.update(s => ({
      ...s,
      messages: s.messages.map(m =>
        m.id === messageId
          ? { ...m, in_context: !inContext, manually_toggled: true }
          : m
      ),
      error: getErrorMessage(error)
    }));
    console.error('[Conversations] Toggle context failed:', getErrorMessage(error));
    throw error;
  }
}

/**
 * Obtiene estadísticas de contexto de la conversación activa
 */
export async function loadContextStats(): Promise<ContextStats | null> {
  const state = get(conversationsStore);
  const projId = get(activeProjectId);

  if (!projId || !state.activeConversationId) {
    return null;
  }

  try {
    const response = await mqttRequest<ContextStats>('conversation', 'contextStats', {
      projectId: projId,
      conversationId: state.activeConversationId
    });

    return response.data;
  } catch (error) {
    console.error('[Conversations] Load context stats failed:', getErrorMessage(error));
    return null;
  }
}

/**
 * Resetea el store
 */
export function resetConversations(): void {
  conversationsStore.set(initialState);
}

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) {
    return 'Request timeout - servidor no responde';
  }
  if (error instanceof MqttRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Error desconocido';
}

function groupByDate(conversations: Conversation[]): ConversationSection[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();

  const groups: Record<string, Conversation[]> = {
    today: [],
    yesterday: [],
    this_week: [],
    this_month: [],
    older: []
  };

  const labels: Record<string, string> = {
    today: 'Hoy',
    yesterday: 'Ayer',
    this_week: 'Esta semana',
    this_month: 'Este mes',
    older: 'Anteriores'
  };

  for (const conv of conversations) {
    const updated = new Date(conv.updated_at);
    const dateStr = updated.toDateString();
    const diff = now.getTime() - updated.getTime();

    if (dateStr === todayStr) {
      groups.today.push(conv);
    } else if (dateStr === yesterdayStr) {
      groups.yesterday.push(conv);
    } else if (diff < 7 * 86400000) {
      groups.this_week.push(conv);
    } else if (diff < 30 * 86400000) {
      groups.this_month.push(conv);
    } else {
      groups.older.push(conv);
    }
  }

  return Object.entries(groups)
    .filter(([, convs]) => convs.length > 0)
    .map(([id, conversations]) => ({
      id: id as ConversationSection['id'],
      label: labels[id],
      conversations
    }));
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Inicializa el store y suscribe a cambios de proyecto
 * Restaura la conversación guardada en localStorage
 */
export function initConversations(): () => void {
  // Leer conversación guardada en localStorage
  const savedState = getState();
  const savedConversationId = savedState.chat?.conversationId;

  // Suscribirse a cambios de proyecto activo
  const unsubscribe = activeProjectId.subscribe(async (projectId) => {
    if (projectId) {
      await loadConversations(projectId);

      // Restaurar conversación guardada si existe
      if (savedConversationId) {
        const state = get(conversationsStore);
        const exists = state.conversations.some(c => c.id === savedConversationId);
        if (exists) {
          console.log('[Conversations] Restoring from localStorage:', savedConversationId);
          selectConversation(savedConversationId).catch(err => {
            console.warn('[Conversations] Failed to restore:', err);
          });
        }
      }
    } else {
      resetConversations();
    }
  });

  return unsubscribe;
}

// =============================================================================
// DERIVED STORES
// =============================================================================

/** Lista de conversaciones */
export const conversationsList = derived(conversationsStore, $s => $s.conversations);

/** Secciones agrupadas por fecha */
export const conversationSections = derived(conversationsStore, $s => $s.sections);

/** ID de conversacion activa */
export const activeConversationId = derived(conversationsStore, $s => $s.activeConversationId);

/** Conversacion activa */
export const activeConversation = derived(conversationsStore, $s => $s.activeConversation);

/** Mensajes de conversacion activa */
export const conversationMessages = derived(conversationsStore, $s => $s.messages);

/** Estado de carga */
export const conversationsLoading = derived(conversationsStore, $s => $s.loading);

/** Estado de envio */
export const conversationsSending = derived(conversationsStore, $s => $s.sending);

/** Error actual */
export const conversationsError = derived(conversationsStore, $s => $s.error);

/** Tiene conversaciones */
export const hasConversations = derived(conversationsStore, $s => $s.conversations.length > 0);

/** Tiene conversacion activa */
export const hasActiveConversation = derived(conversationsStore, $s => $s.activeConversationId !== null);

/** Mensajes en contexto (in_context = true) */
export const messagesInContext = derived(conversationsStore, $s =>
  $s.messages.filter(m => m.in_context)
);

/** Contador de mensajes en contexto */
export const contextCount = derived(conversationsStore, $s =>
  $s.messages.filter(m => m.in_context).length
);

/** Context window de la conversación activa */
export const contextWindow = derived(conversationsStore, $s =>
  $s.activeConversation?.context_window || 20
);

/** Estadísticas de contexto calculadas localmente */
export const contextStats = derived(conversationsStore, $s => {
  const maxContext = $s.activeConversation?.context_window || 20;
  const active = $s.messages.filter(m => m.in_context).length;
  const total = $s.messages.length;
  return {
    active,
    total,
    maxContext,
    remaining: Math.max(0, maxContext - active)
  };
});
