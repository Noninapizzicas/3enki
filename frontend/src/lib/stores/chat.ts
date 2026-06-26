/**
 * Chat Store - Estado de conversación
 *
 * Gestiona:
 * - Mensajes de la conversación
 * - ID de conversación activa
 * - Estado de streaming
 * - Envío de mensajes
 * - Toggle de contexto por mensaje
 */

import { writable, derived, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { publish, subscribe, mqttRequest } from '$lib/ui-core';
import type { Message, Attachment } from '$lib/ui-core';
import { openPanel } from '$lib/ui-core/registry';
import { attachments, clearAttachments } from './attachments';
import { activeProjectId } from './projects';
import { activeProvider, activeModel, selectProvider } from './workspace';
import { providers } from './credentials';
import { notifyError, notifyInfo } from './ui';
import { getVista } from './vista-actual';
import { generateUUID } from '$lib/utils';

/**
 * Deriva la ruta de página desde la URL, sin el prefijo /[project_id].
 * Ej: /pixel-bosch/recetas → /recetas
 * El backend resuelve esta ruta al módulo correspondiente.
 */
function getPageRoute(): string {
  if (typeof window === 'undefined') return 'chat';
  const segments = window.location.pathname.split('/').filter(Boolean);
  // segments[0] = project_id, segments[1+] = página activa (recetas, menu-generator, etc.)
  if (segments.length < 2) return 'chat';
  return segments.slice(1).join('/');
}

// ============================================================================
// STORES
// ============================================================================

export const messages = writable<Message[]>([]);
export const conversationId = writable<string | null>(null);
export const isStreaming = writable<boolean>(false);
export const streamingMessageId = writable<string | null>(null);
export const toolStatus = writable<{ name: string; status: string } | null>(null);
export const agentWorking = writable<boolean>(false);
export const agentWorkingName = writable<string | null>(null);
export const agentWorkingStep = writable<string | null>(null);

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

  // Sin proyecto activo → abrir el selector de proyecto
  const currentProjectId = get(activeProjectId);
  if (!currentProjectId) {
    notifyInfo('Selecciona un proyecto para chatear');
    openPanel('project');
    return;
  }

  // Sin conversación activa → abrir el panel de conversaciones
  if (!convId) {
    notifyInfo('Selecciona o crea una conversación');
    openPanel('conversations');
    return;
  }

  // Crear mensaje del usuario
  const userMessage: Message = {
    id: generateUUID(),
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

  // Provider+model activos del workspace. Si el usuario no eligio nada
  // explicito, settings va vacio y el backend cae al fallback por priority.
  const provider = get(activeProvider);
  const model = get(activeModel);
  const settings: Record<string, unknown> = {};
  if (provider?.id) settings.provider = provider.id;
  if (model) settings.model = model;

  // Enviar via mqttRequest (patrón ui/request/conversation/send)
  // currentProjectId y convId ya validados arriba
  try {
    const response = await mqttRequest<{
      conversation_id: string;
      message_id: string;
    }>('conversation', 'send', {
      // Contrato fijo: 9 campos, en este orden.
      project_id: currentProjectId,
      page_id: getPageRoute(),
      conversation_id: convId,
      // Nervio del frontend: lo que el usuario ESTÁ VIENDO ahora. El backend lo
      // inyecta en el system prompt (prompt-builder → "CONTEXTO ACTIVO"). Vacío si
      // la página no reporta vista. Bajo `vista_frontend` para que el LLM lo reconozca.
      context: ((v) => (Object.keys(v).length > 0 ? { vista_frontend: v } : {}))(getVista()),
      settings,
      prompt: null,
      attachments: currentAttachments.map(a => a.path),
      intencion: null,
      message: userMessage.content
    }, { timeout: 180000 }); // 180s para respuestas de IA con herramientas

    // El backend devuelve solo { conversation_id, message_id } como ack.
    // El mensaje del asistente llega vía MQTT push en conversation/{id}/message
    // (procesado por el subscribe global más abajo).
    const data = response?.data;

    // Actualizar conversationId si se creó una nueva (lazy-create)
    if (data?.conversation_id && data.conversation_id !== convId) {
      conversationId.set(data.conversation_id);
    }

    // NO ponemos isStreaming = false aquí. El ack del request vuelve en ~50ms
    // pero la respuesta del LLM tarda 5-30s y llega por MQTT push. El indicador
    // de "asistente escribiendo" se mantiene hasta que llega el push (handler
    // del subscribe a conversation/+/message).

    // Failsafe: si el push del asistente nunca llega (LLM crasheado,
    // ai-gateway down, etc.), cerrar el indicador tras 3 minutos.
    setTimeout(() => {
      if (get(isStreaming)) {
        isStreaming.set(false);
        streamingMessageId.set(null);
        notifyError('La respuesta tardó demasiado. Inténtalo de nuevo.');
      }
    }, 180000);
  } catch (error: any) {
    console.error('[chat] Error sending message:', error);
    isStreaming.set(false);
    streamingMessageId.set(null);

    // Códigos del backend que disparan UX específica (modales)
    const code = error?.response?.error?.code || error?.code;
    if (code === 'PROJECT_REQUIRED') {
      notifyInfo('Selecciona un proyecto');
      openPanel('project');
      return;
    }
    if (code === 'CONVERSATION_REQUIRED') {
      // Conversación obsoleta o borrada — limpiar estado y abrir panel
      conversationId.set(null);
      notifyInfo('Selecciona o crea una conversación');
      openPanel('conversations');
      return;
    }

    // Mostrar error al usuario
    const errorMsg = error?.response?.error?.message
      || error?.message
      || 'Error al enviar mensaje';
    notifyError(errorMsg);
  }
}

/**
 * Añadir mensaje (usado por suscripciones MQTT)
 */
export function addMessage(message: Message): void {
  messages.update(msgs => {
    const lastIdx = msgs.length - 1;
    const lastMsg = msgs[lastIdx];

    if (message.role === 'assistant' && lastMsg?.role === 'assistant') {
      if (message.streaming) {
        // Chunk de streaming: actualizar contenido del mensaje existente
        return [
          ...msgs.slice(0, lastIdx),
          { ...lastMsg, content: message.content, streaming: true }
        ];
      } else {
        // Mensaje final (sin streaming): finalizar el mensaje existente con datos completos.
        // El push final trae la metadata (provider/model) que los chunks de streaming
        // no llevaban -> la fijamos aqui para que el icono refleje el modelo en vivo.
        return [
          ...msgs.slice(0, lastIdx),
          {
            ...lastMsg,
            id: message.id || lastMsg.id,
            content: message.content || lastMsg.content,
            timestamp: message.timestamp || lastMsg.timestamp,
            metadata: message.metadata || lastMsg.metadata,
            streaming: false
          }
        ];
      }
    }

    return [...msgs, message];
  });

  if (message.streaming) {
    streamingMessageId.set(message.id);
  } else if (message.role === 'assistant') {
    // Mensaje final recibido - limpiar streaming
    streamingMessageId.set(null);
  }
}

/**
 * Finalizar streaming
 */
export function endStreaming(): void {
  isStreaming.set(false);
  toolStatus.set(null);

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
 * Stop generation - detiene la recepcion de streaming
 * Mantiene el contenido parcial que ya se recibio
 */
export function stopGeneration(): void {
  endStreaming();
}

/**
 * Cargar conversación - usa conversation.get para obtener TODOS los mensajes
 */
export async function loadConversation(id: string): Promise<void> {
  conversationId.set(id);
  messages.set([]);

  try {
    const projId = get(activeProjectId);
    if (!projId) throw new Error('No active project');
    const response = await mqttRequest<{
      conversation: any;
      messages: any[];
    }>('conversation', 'load', {
      project_id: projId,
      conversation_id: id
    });
    if (response?.data?.messages) {
      // Map backend fields (created_at) to frontend fields (timestamp)
      const mapped = response.data.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.created_at || m.timestamp || new Date().toISOString(),
        attachments: m.attachments,
        metadata: m.metadata,
        in_context: m.in_context !== false && m.in_context !== 0,
        manually_toggled: m.manually_toggled === true || m.manually_toggled === 1
      }));
      messages.set(mapped);
    }
    // Per-chat sticky model: si la conversacion tiene provider/model guardado,
    // hidratamos el selector del workspace para que al abrir ESTE chat se use SU
    // modelo (no el global). Las conversaciones sin modelo persistido no tocan el
    // selector → siguen con el default por priority. Reconstruye el Provider
    // (objeto) desde la lista disponible; si no esta, usa un objeto minimo.
    const conv = response?.data?.conversation;
    if (conv?.provider) {
      const opt = get(providers).find((p) => p.id === conv.provider);
      selectProvider(
        opt ? { ...opt, models: [] } : { id: conv.provider, name: conv.provider, icon: '', models: [] },
        conv.model || ''
      );
    } else {
      // Auto (sin provider explícito): el icono dice la VERDAD leyendo el modelo que
      // REALMENTE corrió en el último turno (metadata del último mensaje del asistente).
      const raw = response?.data?.messages || [];
      const lastAsst = [...raw].reverse().find((m: any) => m.role === 'assistant');
      let md: any = lastAsst?.metadata;
      if (typeof md === 'string') { try { md = JSON.parse(md); } catch { md = null; } }
      if (md?.provider) {
        const opt = get(providers).find((p) => p.id === md.provider);
        selectProvider(
          opt ? { ...opt, models: [] } : { id: md.provider, name: md.provider, icon: '', models: [] },
          md.model || ''
        );
      }
    }
  } catch (error) {
    console.error('[chat] Error loading conversation:', error);
  }
}

/**
 * Nueva conversación
 */
export function newConversation(): void {
  const newId = generateUUID();
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
  agentWorking.set(false);
  agentWorkingName.set(null);
  agentWorkingStep.set(null);
}

/**
 * Toggle de contexto de un mensaje
 * Actualiza el store local y envía al backend
 */
export async function toggleMessageContext(messageId: string, inContext: boolean): Promise<void> {
  const projId = get(activeProjectId);

  // Optimistic update en el store de mensajes visibles
  messages.update(msgs =>
    msgs.map(m =>
      m.id === messageId
        ? { ...m, in_context: inContext, manually_toggled: true }
        : m
    )
  );

  try {
    await mqttRequest('conversation', 'toggle_context', {
      project_id: projId,
      message_id: messageId,
      in_context: inContext
    });
  } catch (error) {
    // Rollback on error
    messages.update(msgs =>
      msgs.map(m =>
        m.id === messageId
          ? { ...m, in_context: !inContext, manually_toggled: true }
          : m
      )
    );
    console.error('[chat] Toggle context failed:', error);
    throw error;
  }
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

  /**
   * Extraer conversation_id del topic MQTT.
   * Topic: conversation/{conv_id}/message → conv_id
   */
  function getConvIdFromTopic(topic: string): string | null {
    const parts = topic.split('/');
    return parts.length >= 2 ? parts[1] : null;
  }

  /**
   * Verificar si un mensaje pertenece a la conversación activa.
   * Si no hay conversación activa, aceptar todos (para nuevas conversaciones).
   */
  function isActiveConversation(topic: string): boolean {
    const convId = get(conversationId);
    if (!convId) return true; // Sin conversación activa = aceptar todo
    const topicConvId = getConvIdFromTopic(topic);
    if (!topicConvId || topicConvId === '+') return true; // Topic sin conv_id
    return topicConvId === convId;
  }

  // Mensaje recibido — filtrar por conversación activa
  unsubs.push(subscribe('conversation/+/message', (topic, payload) => {
    if (!isActiveConversation(topic)) return; // Ignorar mensajes de otras conversaciones

    const data = payload as Message;
    addMessage({
      id: data.id || generateUUID(),
      role: data.role,
      content: data.content,
      timestamp: data.timestamp || new Date().toISOString(),
      streaming: data.streaming,
      attachments: data.attachments,
      // El push del backend trae metadata.provider (modelo que respondio): la
      // pasamos para que el icono del mensaje sea el del modelo en VIVO, sin
      // esperar a refrescar la pagina (que es lo unico que re-leia metadata).
      metadata: data.metadata
    });

    // El push del assistant marca el final del turno: el indicador de
    // "asistente escribiendo" se apaga cuando llega su respuesta.
    if (data.role === 'assistant' && !data.streaming) {
      isStreaming.set(false);
      streamingMessageId.set(null);
    }
  }));

  // Tool status — filtrar por conversación activa
  unsubs.push(subscribe('conversation/+/tool-status', (topic, payload) => {
    if (!isActiveConversation(topic)) return;

    const data = payload as { tool: { name: string; status: string } };
    if (data.tool) {
      toolStatus.set(data.tool);
    }
  }));

  // Fin de streaming (solo finaliza el mensaje, NO desbloquea envío)
  unsubs.push(subscribe('conversation/stream/end', () => {
    toolStatus.set(null);

    // Solo finalizar el último mensaje de streaming (quitar flag streaming)
    // NO tocar isStreaming - eso lo controla sendMessage/stopGeneration
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
  }));

  // Estado del agente — working/idle + paso actual
  unsubs.push(subscribe('conversation/+/agent_status', (topic, payload) => {
    if (!isActiveConversation(topic)) return;
    const data = payload as { status: string; agent?: string; message?: string };
    if (data.status === 'working') {
      agentWorking.set(true);
      if (data.agent) agentWorkingName.set(data.agent);
      if (data.message) agentWorkingStep.set(data.message);
    } else {
      agentWorking.set(false);
      agentWorkingName.set(null);
      agentWorkingStep.set(null);
    }
  }));

  // Conversación cargada
  unsubs.push(subscribe('conversation/loaded', (_, payload) => {
    const data = payload as { messages: Message[] };
    messages.set(data.messages || []);
  }));

  // cajones Fase 5 bis: el LLM movio el foco a otro page_id (chat.foco.cambiado
  // publicado por ai-gateway tras una tool call chat.cambiar_foco). Filtramos
  // por conversation_id activa y hacemos goto a la ruta del nuevo page,
  // manteniendo el segmento de proyecto de la URL actual.
  unsubs.push(subscribe('chat.foco.cambiado', (envelope: unknown) => {
    const data = (envelope as { data?: { conversation_id?: string; nuevo?: string; motivo?: string | null } })?.data;
    if (!data?.nuevo) return;
    const activeConv = get(conversationId);
    if (!activeConv || data.conversation_id !== activeConv) return; // No es nuestra conversacion
    // Conservar el primer segmento de la URL (project param) y reemplazar el segundo (page_id).
    if (typeof window === 'undefined') return;
    const segments = window.location.pathname.split('/').filter(Boolean);
    const projectParam = segments[0] || '';
    const href = projectParam ? `/${projectParam}/${data.nuevo}` : `/${data.nuevo}`;
    if (data.motivo) notifyInfo(`moviendo a ${data.nuevo}: ${data.motivo}`);
    goto(href);
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
