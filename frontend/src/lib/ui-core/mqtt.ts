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
import { perfStart, perfEnd, logMsg } from '$lib/utils/perf';
import { _setMqttClient } from './mqtt-request';

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
 * - En desarrollo (Vite): usa el proxy ws://127.0.0.1:5173/mqtt
 * - En producción: usa ws://hostname:9001 directamente
 *
 * NOTA: Usamos 127.0.0.1 en lugar de localhost para evitar
 * problemas de resolución IPv6 (::1) en algunos sistemas
 */
function getMqttUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://127.0.0.1:9001';
  }

  const { protocol, hostname, port } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

  // Normalizar hostname: localhost → 127.0.0.1 (evita IPv6)
  const normalizedHost = hostname === 'localhost' ? '127.0.0.1' : hostname;

  // En desarrollo con Vite (puerto 5173), usar el proxy
  if (port === '5173') {
    return `${wsProtocol}//${normalizedHost}:${port}/mqtt`;
  }

  // En producción o con otro servidor, conectar directo al broker
  return `${wsProtocol}//${normalizedHost}:9001`;
}

const DEFAULT_CONFIG: MqttConfig = {
  url: getMqttUrl(),
  clientId: `ui-${Date.now().toString(36)}`,
  options: {
    keepalive: 30,           // Reducido a 30s para evitar keep alive timeout
    reconnectPeriod: 2000,   // Reconexión automática
    connectTimeout: 5000,    // Timeout de conexión
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
// PENDING MESSAGES QUEUE - Mensajes encolados antes de conexión
// =============================================================================

interface PendingMessage {
  topic: string;
  payload: unknown;
  retain: boolean;
}

const pendingMessages: PendingMessage[] = [];
const MAX_PENDING_MESSAGES = 100; // Límite para evitar memory leak

/**
 * Envía todos los mensajes pendientes cuando se conecta
 * @internal
 */
function flushPendingMessages(): void {
  if (pendingMessages.length === 0) return;

  console.log(`[MQTT] Flushing ${pendingMessages.length} pending messages`);

  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift()!;

    if (client?.connected) {
      const message = typeof msg.payload === 'string'
        ? msg.payload
        : JSON.stringify(msg.payload);

      client.publish(msg.topic, message, { qos: 1, retain: msg.retain });
      logMqttInteraction('publish', msg.topic, msg.payload);
    }
  }
}

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
  perfStart('MQTT.totalConnection');
  initMqttConnection(finalConfig).catch(err => {
    logMsg('❌ MQTT connection failed', { error: String(err) });
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
    perfStart('MQTT.importLibrary');
    const mqtt = await import('mqtt');
    perfEnd('MQTT.importLibrary');

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
      perfEnd('MQTT.totalConnection');
      logMsg('✅ MQTT connected', { url: config.url });

      // Registrar cliente para mqtt-request
      _setMqttClient({
        publish: (topic: string, message: string, options?: { qos?: number }) => {
          client?.publish(topic, message, { qos: options?.qos ?? 1 });
        }
      });

      // Re-suscribir a todos los topics activos
      for (const topic of topicSubscriptions.keys()) {
        client?.subscribe(topic);
      }

      // Enviar mensajes que estaban encolados esperando conexión
      flushPendingMessages();
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
    // Limpiar referencia para mqtt-request
    _setMqttClient(null);
  }
}

/**
 * Genera un UUID v4 simple
 */
function generateEventId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Extrae el event_type del topic MQTT
 * Ejemplo: core/star/events/project/state/request -> project.state.request
 */
function extractEventType(topic: string): string {
  // Si el topic tiene formato core/star/events/...
  const match = topic.match(/^core\/\*\/events\/(.+)$/);
  if (match) {
    // Convertir slashes a dots: project/state/request -> project.state.request
    return match[1].replace(/\//g, '.');
  }
  // Fallback: convertir slashes a dots
  return topic.replace(/\//g, '.');
}

/**
 * Crea un EventEnvelope válido para el backend
 */
function createEnvelope(topic: string, data: unknown): object {
  return {
    event_id: generateEventId(),
    event_type: extractEventType(topic),
    timestamp: new Date().toISOString(),
    source: {
      core_id: 'ui-frontend'
    },
    data: data,
    metadata: {}
  };
}

/**
 * Publicar mensaje a un topic
 * Si no está conectado, encola el mensaje para enviarlo cuando se conecte
 */
export function publish(topic: string, payload: unknown, retain = false): void {
  // Crear envelope válido para el backend
  const envelope = createEnvelope(topic, payload);

  // Si no está conectado, encolar mensaje
  if (!client || !client.connected) {
    if (pendingMessages.length < MAX_PENDING_MESSAGES) {
      pendingMessages.push({ topic, payload: envelope, retain });
      console.log(`[MQTT] Queued message for ${topic} (${pendingMessages.length} pending)`);
    } else {
      console.warn(`[MQTT] Pending queue full, dropping message for ${topic}`);
    }
    return;
  }

  const message = JSON.stringify(envelope);

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

// =============================================================================
// VISIBILITY CHANGE HANDLER - Para HyperOS/MIUI y tabs en background
// =============================================================================

let visibilityHandlerRegistered = false;
let lastVisibilityState: DocumentVisibilityState = 'visible';
let backgroundSince: number | null = null;

/**
 * Maneja cambios de visibilidad del tab
 * HyperOS/MIUI y otros sistemas agresivos pueden matar conexiones WebSocket
 * cuando el tab está en background
 */
function handleVisibilityChange(): void {
  if (typeof document === 'undefined') return;

  const isHidden = document.hidden;
  const currentState = document.visibilityState;

  if (isHidden && lastVisibilityState === 'visible') {
    // Tab va a background - guardar timestamp
    backgroundSince = Date.now();
    console.log('[MQTT] Tab going to background');
  } else if (!isHidden && lastVisibilityState === 'hidden') {
    // Tab vuelve a foreground - verificar conexión
    const wasBackgroundFor = backgroundSince ? Date.now() - backgroundSince : 0;
    backgroundSince = null;

    console.log(`[MQTT] Tab returning from background (was hidden for ${wasBackgroundFor}ms)`);

    // Si estuvo en background más de 30s, verificar conexión
    if (wasBackgroundFor > 30000) {
      checkAndReconnect();
    }
  }

  lastVisibilityState = currentState;
}

/**
 * Verifica el estado de la conexión y reconecta si es necesario
 */
function checkAndReconnect(): void {
  if (!client) {
    console.log('[MQTT] No client, nothing to reconnect');
    return;
  }

  if (client.disconnected || !client.connected) {
    console.log('[MQTT] Connection lost while in background, reconnecting...');
    statusStore.set('connecting');

    // Forzar reconexión
    try {
      client.end(true);
    } catch (e) {
      // Ignorar errores al cerrar
    }

    client = null;

    // Reconectar con un pequeño delay
    setTimeout(() => {
      connect().catch(err => {
        console.error('[MQTT] Reconnection failed:', err);
      });
    }, 500);
  } else {
    console.log('[MQTT] Connection still alive after background');
  }
}

/**
 * Registra el handler de visibilidad (llamar una vez al iniciar)
 */
export function setupVisibilityHandler(): void {
  if (visibilityHandlerRegistered || typeof document === 'undefined') return;

  document.addEventListener('visibilitychange', handleVisibilityChange);
  visibilityHandlerRegistered = true;
  lastVisibilityState = document.visibilityState;

  console.log('[MQTT] Visibility handler registered');
}

/**
 * Elimina el handler de visibilidad (para cleanup)
 */
export function removeVisibilityHandler(): void {
  if (!visibilityHandlerRegistered || typeof document === 'undefined') return;

  document.removeEventListener('visibilitychange', handleVisibilityChange);
  visibilityHandlerRegistered = false;

  console.log('[MQTT] Visibility handler removed');
}
