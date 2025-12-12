/**
 * UI Event Bus - Comunicación entre módulos
 * Patrón 1:1 con backend EventBus
 */

import { writable, get } from 'svelte/store';
import type { UIEvent, UIEventHandler } from './types';

function createEventBus() {
  const subscribers = new Map<string, Set<UIEventHandler>>();
  const history = writable<UIEvent[]>([]);
  const lastEvent = writable<UIEvent | null>(null);

  function emit(type: string, data: unknown, source = 'shell'): void {
    const event: UIEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      timestamp: Date.now(),
      source,
      data
    };

    // Guardar en historial
    history.update(h => [event, ...h].slice(0, 50));
    lastEvent.set(event);

    // Notificar suscriptores
    const handlers = subscribers.get(type);
    if (handlers) {
      handlers.forEach(h => {
        try { h(event); } catch (e) { console.error(`[EventBus] ${type}:`, e); }
      });
    }

    // Debug
    if (import.meta.env?.DEV) {
      console.debug(`[UI] ${type}`, data);
    }
  }

  function on(type: string, handler: UIEventHandler): () => void {
    if (!subscribers.has(type)) {
      subscribers.set(type, new Set());
    }
    subscribers.get(type)!.add(handler);

    return () => {
      subscribers.get(type)?.delete(handler);
    };
  }

  function once(type: string): Promise<UIEvent> {
    return new Promise(resolve => {
      const unsub = on(type, (event) => {
        unsub();
        resolve(event);
      });
    });
  }

  return {
    emit,
    on,
    once,
    history,
    lastEvent,
    // Aliases
    publish: emit,
    subscribe: on
  };
}

export const eventBus = createEventBus();
