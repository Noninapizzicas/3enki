/**
 * MQTT Client - Conexión única al broker
 *
 * El frontend es un "core" más conectado al broker MQTT.
 * Toda comunicación pasa por aquí.
 *
 * OPTIMIZACIÓN: La librería mqtt se carga de forma LAZY para no
 * bloquear la carga inicial de la página (~2MB -> 0 en bundle inicial).
 */

import { writable, readonly, derived } from 'svelte/store';

// =============================================================================
// TIPOS
// =============================================================================

// Tipos mínimos para evitar importar mqtt en tiempo de compilación
interface MqttClientLike {
  connected: boolean;
  disconnected: boolean;
  on(event: string, callback: (...args: unknown[]) => void): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  publish(topic: string, message: string, options?: { qos?: number; retain?: boolean }): void;
  end(force?: boolean): void;
}

export interface MqttConfig {
  url: string;
  clientId: string;
  options?: {
    keepalive?: number;
    reconnectPeriod?: number;
    connectTimeout?: number;
    clean?: boolean;
  };
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MqttMessage {
  topic: string;
  payload: unknown;
  timestamp: number;
}

type MessageHandler = (topic: string, payload: unknown) => void;

// =============================================================================
// CONFIGURACIÓN POR DEFECTO
// =============================================================================

const DEFAULT_CONFIG: MqttConfig = {
  url: 'ws://localhost:9001',
  clientId: `ui-${Date.now().toString(36)}`,
  options: {
    keepalive: 30,
    reconnectPeriod: 1000,
    connectTimeout: 2000,
    clean: true
  }
};

// =============================================================================
// ESTADO
// =============================================================================

const statusStore = writable<ConnectionStatus>('disconnected');
const errorStore = writable<string | null>(null);
const lastMessageStore = writable<MqttMessage | null>(null);

let client: MqttClientLike | null = null;
const handlers = new Map<string, Set<MessageHandler>>();
const topicSubscriptions = new Map<string, number>(); // topic -> refcount

// =============================================================================
// FUNCIONES INTERNAS
// =============================================================================

function parsePayload(buffer: { toString(encoding: string): string }): unknown {
  try {
    const str = buffer.toString('utf-8');
    return JSON.parse(str);
  } catch {
    return buffer.toString('utf-8');
  }
}

function matchTopic(pattern: string, topic: string): boolean {
  const patternParts = pattern.split('/');
  const topicParts = topic.split('/');

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];

    if (p === '#') return true;
    if (p === '+') continue;
    if (p !== topicParts[i]) return false;
  }

  return patternParts.length === topicParts.length;
}

function notifyHandlers(topic: string, payload: unknown): void {
  for (const [pattern, handlerSet] of handlers.entries()) {
    if (matchTopic(pattern, topic)) {
      for (const handler of handlerSet) {
        try {
          handler(topic, payload);
        } catch (err) {
          console.error(`[MQTT] Handler error for ${pattern}:`, err);
        }
      }
    }
  }
}

// =============================================================================
// API PÚBLICA
// =============================================================================

/**
 * Conectar al broker MQTT
 * NOTA: Carga la librería mqtt de forma lazy (primer uso)
 */
export async function connect(config: Partial<MqttConfig> = {}): Promise<void> {
  if (client) {
    console.warn('[MQTT] Already connected or connecting');
    return;
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  statusStore.set('connecting');
  errorStore.set(null);

  try {
    // Lazy load de la librería mqtt (~2MB)
    console.log('[MQTT] Loading mqtt library...');
    const mqtt = await import('mqtt');
    console.log('[MQTT] Library loaded');

    client = mqtt.default.connect(finalConfig.url, {
      ...finalConfig.options,
      clientId: finalConfig.clientId
    }) as MqttClientLike;

    client.on('connect', () => {
      statusStore.set('connected');
      errorStore.set(null);
      console.log('[MQTT] Connected to', finalConfig.url);

      // Re-suscribir a todos los topics activos
      for (const topic of topicSubscriptions.keys()) {
        client?.subscribe(topic);
      }
    });

    client.on('message', (topic: string, buffer: { toString(encoding: string): string }) => {
      const payload = parsePayload(buffer);
      const message: MqttMessage = { topic, payload, timestamp: Date.now() };

      lastMessageStore.set(message);
      notifyHandlers(topic, payload);
    });

    client.on('error', (err: Error) => {
      statusStore.set('error');
      errorStore.set(err.message);
      console.error('[MQTT] Error:', err.message);
    });

    client.on('close', () => {
      statusStore.set('disconnected');
    });

    client.on('reconnect', () => {
      statusStore.set('connecting');
    });
  } catch (err) {
    console.error('[MQTT] Failed to load library:', err);
    statusStore.set('error');
    errorStore.set('Failed to load MQTT library');
  }
}

/**
 * Desconectar del broker
 */
export function disconnect(): void {
  if (client) {
    client.end(true);
    client = null;
    statusStore.set('disconnected');
    handlers.clear();
    topicSubscriptions.clear();
  }
}

/**
 * Publicar mensaje a un topic
 */
export function publish(topic: string, payload: unknown, retain = false): void {
  if (!client || client.disconnected) {
    console.warn('[MQTT] Not connected, cannot publish to', topic);
    return;
  }

  const message = typeof payload === 'string'
    ? payload
    : JSON.stringify(payload);

  client.publish(topic, message, { qos: 1, retain });
}

/**
 * Suscribirse a un topic
 * Retorna función para desuscribirse
 */
export function subscribe(pattern: string, handler: MessageHandler): () => void {
  // Añadir handler
  if (!handlers.has(pattern)) {
    handlers.set(pattern, new Set());
  }
  handlers.get(pattern)!.add(handler);

  // Suscribir al broker si es primera vez
  const refcount = topicSubscriptions.get(pattern) ?? 0;
  if (refcount === 0 && client?.connected) {
    client.subscribe(pattern);
  }
  topicSubscriptions.set(pattern, refcount + 1);

  // Retornar función de limpieza
  return () => {
    handlers.get(pattern)?.delete(handler);

    const newRefcount = (topicSubscriptions.get(pattern) ?? 1) - 1;
    if (newRefcount <= 0) {
      topicSubscriptions.delete(pattern);
      if (client?.connected) {
        client.unsubscribe(pattern);
      }
    } else {
      topicSubscriptions.set(pattern, newRefcount);
    }
  };
}

/**
 * Verificar si está conectado
 */
export function isConnected(): boolean {
  return client?.connected ?? false;
}

// =============================================================================
// STORES (READONLY)
// =============================================================================

export const status = readonly(statusStore);
export const error = readonly(errorStore);
export const lastMessage = readonly(lastMessageStore);
export const connected = derived(status, ($status) => $status === 'connected');
