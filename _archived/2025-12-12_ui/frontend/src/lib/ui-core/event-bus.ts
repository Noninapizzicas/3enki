/**
 * UI Event Bus - Sistema de eventos para módulos UI
 *
 * Sigue el mismo patrón que el EventBus del backend:
 * - publish/emit para emitir eventos
 * - subscribe/on para escuchar eventos
 * - Retorna función de unsubscribe
 *
 * Implementado como Svelte store para reactividad.
 */

import { writable, derived, get } from 'svelte/store';
import type { UIEventEnvelope, UIEventHandler } from './types';

// ============================================================================
// TIPOS INTERNOS
// ============================================================================

interface EventSubscription {
  eventType: string;
  handler: UIEventHandler;
  moduleId?: string;
}

interface EventBusState {
  /** Historial de eventos (últimos N) */
  history: UIEventEnvelope[];
  /** Último evento emitido */
  lastEvent: UIEventEnvelope | null;
  /** Contadores por tipo de evento */
  counts: Record<string, number>;
}

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const MAX_HISTORY = 100;

// ============================================================================
// IMPLEMENTACIÓN
// ============================================================================

function createUIEventBus() {
  // Estado interno
  const state = writable<EventBusState>({
    history: [],
    lastEvent: null,
    counts: {}
  });

  // Suscriptores por tipo de evento
  const subscribers = new Map<string, Set<UIEventHandler>>();

  // Suscriptores wildcard (escuchan todos los eventos)
  const wildcardSubscribers = new Set<UIEventHandler>();

  /**
   * Genera un ID único para eventos
   */
  function generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Crea un envelope de evento
   */
  function createEnvelope(
    eventType: string,
    data: unknown,
    moduleId?: string
  ): UIEventEnvelope {
    return {
      event_id: generateEventId(),
      event_type: eventType,
      timestamp: new Date().toISOString(),
      source: {
        module_id: moduleId || 'shell'
      },
      data
    };
  }

  /**
   * Emite un evento a todos los suscriptores
   */
  function emit(eventType: string, data: unknown, moduleId?: string): void {
    const envelope = createEnvelope(eventType, data, moduleId);

    // Actualizar estado
    state.update(s => {
      const newHistory = [envelope, ...s.history].slice(0, MAX_HISTORY);
      const newCounts = { ...s.counts };
      newCounts[eventType] = (newCounts[eventType] || 0) + 1;

      return {
        history: newHistory,
        lastEvent: envelope,
        counts: newCounts
      };
    });

    // Notificar suscriptores específicos
    const handlers = subscribers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(envelope);
        } catch (error) {
          console.error(`[UIEventBus] Error in handler for ${eventType}:`, error);
        }
      });
    }

    // Notificar suscriptores wildcard
    wildcardSubscribers.forEach(handler => {
      try {
        handler(envelope);
      } catch (error) {
        console.error(`[UIEventBus] Error in wildcard handler:`, error);
      }
    });

    // Debug en desarrollo
    if (import.meta.env.DEV) {
      console.debug(`[UIEventBus] ${eventType}`, data);
    }
  }

  /**
   * Alias de emit (nomenclatura Pub/Sub)
   */
  function publish(eventType: string, data: unknown, moduleId?: string): void {
    emit(eventType, data, moduleId);
  }

  /**
   * Suscribe a un tipo de evento
   * @returns Función de desuscripción
   */
  function on(eventType: string, handler: UIEventHandler): () => void {
    if (!subscribers.has(eventType)) {
      subscribers.set(eventType, new Set());
    }
    subscribers.get(eventType)!.add(handler);

    // Retornar función de unsubscribe
    return () => {
      const handlers = subscribers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          subscribers.delete(eventType);
        }
      }
    };
  }

  /**
   * Alias de on (nomenclatura Pub/Sub)
   */
  function subscribe(eventType: string, handler: UIEventHandler): () => void {
    return on(eventType, handler);
  }

  /**
   * Suscribe a todos los eventos (wildcard)
   * @returns Función de desuscripción
   */
  function onAll(handler: UIEventHandler): () => void {
    wildcardSubscribers.add(handler);
    return () => {
      wildcardSubscribers.delete(handler);
    };
  }

  /**
   * Escucha un evento una sola vez
   */
  function once(eventType: string, handler?: UIEventHandler): Promise<UIEventEnvelope> | void {
    if (handler) {
      const unsubscribe = on(eventType, (envelope) => {
        unsubscribe();
        handler(envelope);
      });
    } else {
      // Sin handler, retornar Promise
      return new Promise((resolve) => {
        const unsubscribe = on(eventType, (envelope) => {
          unsubscribe();
          resolve(envelope);
        });
      });
    }
  }

  /**
   * Obtiene el estado actual
   */
  function getState(): EventBusState {
    return get(state);
  }

  /**
   * Obtiene estadísticas del event bus
   */
  function getStats() {
    const currentState = get(state);
    return {
      total_events: currentState.history.length,
      event_counts: currentState.counts,
      active_subscriptions: Array.from(subscribers.entries()).map(([type, handlers]) => ({
        event_type: type,
        handler_count: handlers.size
      })),
      wildcard_handlers: wildcardSubscribers.size
    };
  }

  /**
   * Limpia el historial de eventos
   */
  function clearHistory(): void {
    state.update(s => ({
      ...s,
      history: [],
      lastEvent: null
    }));
  }

  /**
   * Filtra eventos del historial por patrón
   */
  function filterHistory(pattern: RegExp): UIEventEnvelope[] {
    return get(state).history.filter(e => pattern.test(e.event_type));
  }

  // Store derivado para el último evento
  const lastEvent = derived(state, $state => $state.lastEvent);

  // Store derivado para el historial
  const history = derived(state, $state => $state.history);

  return {
    // Métodos principales
    emit,
    publish,
    on,
    subscribe,
    onAll,
    once,

    // Estado
    state,
    lastEvent,
    history,
    getState,
    getStats,

    // Utilidades
    clearHistory,
    filterHistory
  };
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Instancia singleton del UI Event Bus
 */
export const uiEventBus = createUIEventBus();

// Re-exportar tipos
export type { UIEventEnvelope, UIEventHandler };

// ============================================================================
// EVENTOS ESTÁNDAR UI
// ============================================================================

/**
 * Eventos estándar del sistema UI
 * Los módulos pueden emitir/escuchar estos eventos
 */
export const UI_EVENTS = {
  // Panel
  PANEL_OPEN: 'ui.panel.open',
  PANEL_CLOSE: 'ui.panel.close',

  // Navegación
  NAVIGATE: 'ui.navigate',

  // Módulos
  MODULE_LOADED: 'ui.module.loaded',
  MODULE_UNLOADED: 'ui.module.unloaded',
  MODULE_ACTIVATED: 'ui.module.activated',

  // Selección
  MODEL_SELECTED: 'ui.model.selected',
  CREDENTIAL_SELECTED: 'ui.credential.selected',
  PROMPT_SELECTED: 'ui.prompt.selected',
  TOOL_TOGGLED: 'ui.tool.toggled',
  PLUGIN_TOGGLED: 'ui.plugin.toggled',

  // Chat
  MESSAGE_SENT: 'ui.message.sent',
  MESSAGE_RECEIVED: 'ui.message.received',

  // Toast/Notificaciones
  TOAST_SHOW: 'ui.toast.show',

  // Tema
  THEME_CHANGED: 'ui.theme.changed'
} as const;

export type UIEventType = typeof UI_EVENTS[keyof typeof UI_EVENTS];
