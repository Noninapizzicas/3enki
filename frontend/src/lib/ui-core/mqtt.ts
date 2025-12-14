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

/**
 * Detecta la URL de MQTT automáticamente basada en el entorno
 * - En desarrollo (Vite): usa el proxy ws://localhost:5173/mqtt
 * - En producción: usa ws://hostname:9001 directamente
 */
function getMqttUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:9001';
  }

  const { protocol, hostname, port } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

  // En desarrollo con Vite (puerto 5173), usar el proxy
  if (port === '5173') {
    return `${wsProtocol}//${hostname}:${port}/mqtt`;
  }

  // En producción o con otro servidor, conectar directo al broker
  return `${wsProtocol}//${hostname}:9001`;
}

const DEFAULT_CONFIG: MqttConfig = {
  url: getMqttUrl(),
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

// Log collector configuration
let logCollectorEnabled = true;
const LOG_ENDPOINT = '/modules/log-manager/logs';

// =============================================================================
// BATCH LOGGING - Reduce requests durante startup
// =============================================================================

interface LogEntry {
  action: string;
  topic: string;
  payloadType: string;
  payloadSize: number;
  timestamp: number;
}

let pendingLogs: LogEntry[] = [];
let logFlushTimeout: ReturnType<typeof setTimeout> | null = null;
const LOG_BATCH_DELAY = 500; // Esperar 500ms antes de enviar batch
const LOG_BATCH_MAX_SIZE = 50; // Enviar si hay más de 50 logs pendientes

/**
 * Envía batch de logs al log-manager
 * @internal
 */
async function flushLogs(): Promise<void> {
  if (pendingLogs.length === 0) return;

  const batch = [...pendingLogs];
  pendingLogs = [];
  logFlushTimeout = null;

  try {
    await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'debug',
        source: 'frontend',
        module: 'mqtt-client',
        message: `mqtt.batch (${batch.length} interactions)`,
        context: {
          interactions: batch,
          batchSize: batch.length
        }
      })
    });
  } catch {
    // Silenciar errores de logging
  }
}

/**
 * Encola log de interacción MQTT (batch para reducir requests)
 * @internal
 */
function logMqttInteraction(action: string, topic: string, payload?: unknown): void {
  // No loguear topics de log (evitar loop infinito)
  if (!logCollectorEnabled) return;
  if (topic.startsWith('log/') || topic.startsWith('log.')) return;

  // Añadir a batch
  pendingLogs.push({
    action,
    topic,
    payloadType: typeof payload,
    payloadSize: typeof payload === 'string' ? payload.length : JSON.stringify(payload || {}).length,
    timestamp: Date.now()
  });

  // Flush inmediato si el batch es muy grande
  if (pendingLogs.length >= LOG_BATCH_MAX_SIZE) {
    if (logFlushTimeout) {
      clearTimeout(logFlushTimeout);
      logFlushTimeout = null;
    }
    flushLogs();
    return;
  }

  // Programar flush con debounce
  if (!logFlushTimeout) {
    logFlushTimeout = setTimeout(flushLogs, LOG_BATCH_DELAY);
  }
}

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
 * OPTIMIZACIÓN: No bloquea la UI - resuelve inmediatamente y conecta en background
 */
export async function connect(config: Partial<MqttConfig> = {}): Promise<void> {
  if (client) {
    console.warn('[MQTT] Already connected or connecting');
    return;
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  statusStore.set('connecting');
  errorStore.set(null);

  // No bloquear - iniciar conexión en background
  initMqttConnection(finalConfig).catch(err => {
    console.error('[MQTT] Background connection failed:', err);
  });

  // Resolver inmediatamente para no bloquear la UI
  return Promise.resolve();
}

/**
 * Inicializa la conexión MQTT en background
 * @internal
 */
async function initMqttConnection(config: MqttConfig): Promise<void> {
  try {
    // Lazy load de la librería mqtt (~2MB)
    console.log('[MQTT] Loading mqtt library...');
    const mqtt = await import('mqtt');
    console.log('[MQTT] Library loaded');

    client = mqtt.default.connect(config.url, {
      ...config.options,
      clientId: config.clientId
    }) as MqttClientLike;

    // Timeout de seguridad - si no conecta en 5s, continuar sin MQTT
    const connectionTimeout = setTimeout(() => {
      if (!client?.connected) {
        console.warn('[MQTT] Connection timeout - UI will work without real-time updates');
        statusStore.set('error');
        errorStore.set('Connection timeout - working offline');
      }
    }, 5000);

    client.on('connect', () => {
      clearTimeout(connectionTimeout);
      statusStore.set('connected');
      errorStore.set(null);
      console.log('[MQTT] Connected to', config.url);

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

      // Log received message
      logMqttInteraction('receive', topic, payload);
    });

    client.on('error', (err: Error) => {
      clearTimeout(connectionTimeout);
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

  // Log interaction
  logMqttInteraction('publish', topic, payload);
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
    // Log subscription
    logMqttInteraction('subscribe', pattern);
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
        // Log unsubscription
        logMqttInteraction('unsubscribe', pattern);
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
