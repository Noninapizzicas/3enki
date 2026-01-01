/**
 * Chat Store - Estado de conversación
 *
 * Gestiona:
 * - Mensajes de la conversación
 * - ID de conversación activa
 * - Estado de streaming
 * - Envío de mensajes
 */

import { writable, derived, get } from 'svelte/store';
import { publish, subscribe, mqttRequest } from '$lib/ui-core';
import type { Message, Attachment } from '$lib/ui-core';
import { attachments, clearAttachments } from './attachments';

// ============================================================================
// STORES
// ============================================================================

export const messages = writable<Message[]>([]);
export const conversationId = writable<string | null>(null);
export const isStreaming = writable<boolean>(false);
export const streamingMessageId = writable<string | null>(null);

// ============================================================================
// STORES DERIVADOS
// ============================================================================

/**
 * Número de mensajes
 */
export const messageCount = derived(messages, ($messages) => $messages.length);

/**
 * ¿Hay conversación activa?
 */
export const hasConversation = derived(conversationId, ($id) => $id !== null);

/**
 * Último mensaje
 */
export const lastMessage = derived(messages, ($messages) => {
  return $messages.length > 0 ? $messages[$messages.length - 1] : null;
});

/**
 * Mensajes del usuario
 */
export const userMessages = derived(messages, ($messages) => {
  return $messages.filter(m => m.role === 'user');
});

/**
 * Mensajes del asistente
 */
export const assistantMessages = derived(messages, ($messages) => {
  return $messages.filter(m => m.role === 'assistant');
});

// ============================================================================
// ACCIONES
// ============================================================================

/**
 * Enviar mensaje
 */
export async function sendMessage(content: string): Promise<void> {
  const convId = get(conversationId);
  const currentAttachments = get(attachments);

  if (!content.trim() && currentAttachments.length === 0) {
    return;
  }

  // Crear mensaje del usuario
  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: 'user',
    content: content.trim(),
    timestamp: new Date().toISOString(),
    attachments: currentAttachments.length > 0 ? [...currentAttachments] : undefined
  };

  // Añadir mensaje inmediatamente
  messages.update(msgs => [...msgs, userMessage]);

  // Limpiar adjuntos
  clearAttachments();

  // Marcar como streaming
  isStreaming.set(true);

  // Enviar via mqttRequest (patrón ui/request/conversation/send)
  try {
    const response = await mqttRequest<{
      conversationId: string;
      user_message: Message;
      assistant_message: Message;
      tokens_used?: number;
      cost?: number;
    }>('conversation', 'send', {
      conversationId: convId,
      content: userMessage.content,
      attachments: currentAttachments.map(a => ({
        type: a.type,
        path: a.path,
        name: a.name
      }))
    }, { timeout: 60000 }); // 60s para respuestas de IA

    // Añadir mensaje del asistente si existe (está en response.data)
    const data = response?.data;
    if (data?.assistant_message) {
      const assistantMsg: Message = {
        id: data.assistant_message.id || crypto.randomUUID(),
        role: 'assistant',
        content: data.assistant_message.content,
        timestamp: data.assistant_message.created_at || new Date().toISOString(),
        metadata: data.assistant_message.metadata
      };
      messages.update(msgs => [...msgs, assistantMsg]);
    }

    // Actualizar conversationId si se creó una nueva
    if (data?.conversationId && data.conversationId !== convId) {
      conversationId.set(data.conversationId);
    }

    isStreaming.set(false);
  } catch (error) {
    console.error('[chat] Error sending message:', error);
    isStreaming.set(false);
  }
}

/**
 * Añadir mensaje (usado por suscripciones MQTT)
 */
export function addMessage(message: Message): void {
  messages.update(msgs => {
    // Si es streaming y es del asistente, actualizar el último
    if (message.streaming && message.role === 'assistant') {
      const lastIdx = msgs.length - 1;
      const lastMsg = msgs[lastIdx];

      if (lastMsg?.role === 'assistant' && lastMsg.streaming) {
        // Actualizar contenido del mensaje existente
        return [
          ...msgs.slice(0, lastIdx),
          { ...lastMsg, content: message.content }
        ];
      }
    }

    return [...msgs, message];
  });

  if (message.streaming) {
    streamingMessageId.set(message.id);
  }
}

/**
 * Finalizar streaming
 */
export function endStreaming(): void {
  isStreaming.set(false);

  // Marcar último mensaje como no-streaming
  messages.update(msgs => {
    if (msgs.length === 0) return msgs;

    const lastIdx = msgs.length - 1;
    const lastMsg = msgs[lastIdx];

    if (lastMsg.streaming) {
      return [
        ...msgs.slice(0, lastIdx),
        { ...lastMsg, streaming: false }
      ];
    }

    return msgs;
  });

  streamingMessageId.set(null);
}

/**
 * Cargar conversación
 */
export async function loadConversation(id: string): Promise<void> {
  conversationId.set(id);
  messages.set([]);

  try {
    const response = await mqttRequest<{ messages: Message[] }>('conversation', 'load', {
      conversationId: id
    });
    if (response?.data?.messages) {
      messages.set(response.data.messages);
    }
  } catch (error) {
    console.error('[chat] Error loading conversation:', error);
  }
}

/**
 * Nueva conversación
 */
export function newConversation(): void {
  const newId = crypto.randomUUID();
  conversationId.set(newId);
  messages.set([]);
}

/**
 * Limpiar mensajes
 */
export function clearMessages(): void {
  messages.set([]);
}

/**
 * Limpiar todo (conversación + mensajes)
 */
export function clearConversation(): void {
  conversationId.set(null);
  messages.set([]);
  isStreaming.set(false);
  streamingMessageId.set(null);
}

// ============================================================================
// SUSCRIPCIONES MQTT
// ============================================================================

/**
 * Inicializar suscripciones MQTT
 * Llamar al montar la app
 */
export function initChatSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  // Mensaje recibido
  unsubs.push(subscribe('conversation/+/message', (topic, payload) => {
    const data = payload as Message;
    addMessage({
      id: data.id || crypto.randomUUID(),
      role: data.role,
      content: data.content,
      timestamp: data.timestamp || new Date().toISOString(),
      streaming: data.streaming,
      attachments: data.attachments
    });
  }));

  // Fin de streaming
  unsubs.push(subscribe('conversation/stream/end', () => {
    endStreaming();
  }));

  // Conversación cargada
  unsubs.push(subscribe('conversation/loaded', (_, payload) => {
    const data = payload as { messages: Message[] };
    messages.set(data.messages || []);
  }));

  // Retornar cleanup
  return () => {
    unsubs.forEach(fn => fn());
  };
}

// ============================================================================
// GETTERS
// ============================================================================

export function getMessages(): Message[] {
  return get(messages);
}

export function getConversationId(): string | null {
  return get(conversationId);
}

export function getIsStreaming(): boolean {
  return get(isStreaming);
}
