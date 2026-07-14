/**
 * MqttClient — Cliente MQTT del frontend como clase OOP.
 *
 * El frontend es "un core más" conectado al broker. Esta clase es la
 * ÚNICA frontera con el transporte (DIP): encapsula la conexión WebSocket,
 * el ruteo de mensajes por patrón, la cola de pendientes, el batch-logging,
 * la resiliencia (reconexión + visibilitychange) y los stores reactivos.
 *
 * Patrones aplicados:
 *  · Observer        → stores Svelte (status/error/lastMessage) + handlers por patrón.
 *  · Strategy/DI     → `registerRawPublisher` se inyecta por constructor; la clase
 *                      NO conoce a `mqtt-request` (inversión de dependencia).
 *  · Singleton       → lo materializa la fachada `mqtt.ts` (no esta clase).
 *  · Lazy loading    → la librería `mqtt` (~2MB) se importa en el primer connect.
 *
 * Espejo en el browser del backend `core/mqtt/client.js`.
 */

import { writable, readonly, derived, type Readable } from 'svelte/store';
import { perfStart, perfEnd, logMsg } from '$lib/utils/perf';

// =============================================================================
// TIPOS / CONTRATOS
// =============================================================================

/** Subconjunto mínimo de la API de `mqtt` que usamos (evita acoplar el tipo pesado). */
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
    username?: string;
    password?: string;
  };
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MqttMessage {
  topic: string;
  payload: unknown;
  timestamp: number;
}

export type MessageHandler = (topic: string, payload: unknown) => void;

/** Publicador "raw" (sin envelope) que la clase entrega a quien lo inyecte (mqtt-request). */
export interface RawPublisher {
  publish: (topic: string, message: string, options?: { qos?: number }) => void;
}

export interface MqttClientOptions {
  /**
   * Hook de inversión de dependencia: se invoca con un publicador raw cuando
   * la conexión queda lista, y con `null` al desconectar. Permite que
   * `mqtt-request` publique sin que esta clase lo importe (DIP).
   */
  registerRawPublisher?: (publisher: RawPublisher | null) => void;
  /** Sobrescribe la config por defecto (url/clientId/options). */
  defaultConfig?: Partial<MqttConfig>;
  /** Endpoint del log-manager para el batch de telemetría. */
  logEndpoint?: string;
}

interface PendingMessage {
  topic: string;
  payload: unknown;
  retain: boolean;
}

interface LogEntry {
  action: string;
  topic: string;
  payloadType: string;
  payloadSize: number;
  timestamp: number;
}

// =============================================================================
// CONSTANTES
// =============================================================================

const MAX_PENDING_MESSAGES = 100;   // límite de cola pre-conexión (anti memory-leak)
const LOG_BATCH_DELAY = 500;        // debounce del batch de logs (ms)
const LOG_BATCH_MAX_SIZE = 50;      // flush inmediato si la cola supera esto
const CONNECT_TIMEOUT_MS = 5000;    // si no conecta en 5s, modo offline
const BACKGROUND_RECHECK_MS = 30000;// re-verificar conexión tras background largo

/**
 * Detecta la URL del broker según el entorno (Vite dev / HTTPS proxy / HTTP directo).
 * Usa 127.0.0.1 en vez de localhost para evitar resolución IPv6 (::1).
 */
function detectMqttUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:9001';

  const { protocol, hostname, port } = window.location;
  const normalizedHost = hostname === 'localhost' ? '127.0.0.1' : hostname;

  // Vite dev (5173): proxy /mqtt
  if (port === '5173') {
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${normalizedHost}:${port}/mqtt`;
  }
  // HTTPS: detrás de reverse proxy (Caddy/nginx) → /mqtt
  if (protocol === 'https:') return `wss://${hostname}/mqtt`;
  // HTTP directo (Termux/LAN): puerto WS del broker
  return `ws://${normalizedHost}:9001`;
}

function buildDefaultConfig(override: Partial<MqttConfig> = {}): MqttConfig {
  return {
    url: detectMqttUrl(),
    clientId: `ui-${Date.now().toString(36)}`,
    options: {
      keepalive: 60,
      reconnectPeriod: 2000,
      connectTimeout: 5000,
      clean: true,
      ...override.options
    },
    ...('url' in override ? { url: override.url! } : {}),
    ...('clientId' in override ? { clientId: override.clientId! } : {})
  };
}

// =============================================================================
// CLASE
// =============================================================================

export class MqttClient {
  // — Stores reactivos (Observer) —
  readonly #statusStore = writable<ConnectionStatus>('disconnected');
  readonly #errorStore = writable<string | null>(null);
  readonly #lastMessageStore = writable<MqttMessage | null>(null);

  readonly status: Readable<ConnectionStatus> = readonly(this.#statusStore);
  readonly error: Readable<string | null> = readonly(this.#errorStore);
  readonly lastMessage: Readable<MqttMessage | null> = readonly(this.#lastMessageStore);
  readonly connected: Readable<boolean> = derived(this.#statusStore, (s) => s === 'connected');

  // — Estado de transporte —
  #client: MqttClientLike | null = null;
  #connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  // — Ruteo de mensajes —
  readonly #handlers = new Map<string, Set<MessageHandler>>();
  readonly #topicSubscriptions = new Map<string, number>(); // topic -> refcount

  // — Resiliencia / reconexión —
  #hasConnectedOnce = false;
  #reconnectCallbacks: Array<() => void> = [];

  // — Cola de mensajes pre-conexión —
  readonly #pendingMessages: PendingMessage[] = [];

  // — Batch logging —
  #pendingLogs: LogEntry[] = [];
  #logFlushTimeout: ReturnType<typeof setTimeout> | null = null;
  #logCollectorEnabled = true;

  // — Visibility handler (HyperOS/MIUI mata WS en background) —
  #visibilityHandlerRegistered = false;
  #lastVisibilityState: 'visible' | 'hidden' = 'visible';
  #backgroundSince: number | null = null;

  // — Configuración inyectada —
  readonly #defaultConfig: MqttConfig;
  readonly #registerRawPublisher: (p: RawPublisher | null) => void;
  readonly #logEndpoint: string;

  constructor(options: MqttClientOptions = {}) {
    this.#defaultConfig = buildDefaultConfig(options.defaultConfig);
    this.#registerRawPublisher = options.registerRawPublisher ?? (() => {});
    this.#logEndpoint = options.logEndpoint ?? '/modules/log-manager/logs';
  }

  // ===========================================================================
  // API PÚBLICA — CONEXIÓN
  // ===========================================================================

  /**
   * Conecta al broker. No bloquea la UI: resuelve de inmediato y conecta en
   * background (la librería `mqtt` se importa lazy, ~2MB).
   */
  async connect(config: Partial<MqttConfig> = {}): Promise<void> {
    if (this.#client) {
      console.warn('[MQTT] Already connected or connecting');
      return;
    }

    const finalConfig: MqttConfig = {
      ...this.#defaultConfig,
      ...config,
      options: { ...this.#defaultConfig.options, ...config.options }
    };

    this.#statusStore.set('connecting');
    this.#errorStore.set(null);

    perfStart('MQTT.totalConnection');
    this.#initConnection(finalConfig).catch((err) => {
      logMsg('❌ MQTT connection failed', { error: String(err) });
    });

    return Promise.resolve();
  }

  /** Desconecta y limpia todo el estado (handlers, subs, colas, resiliencia). */
  disconnect(): void {
    if (!this.#client) return;

    this.#client.end(true);
    this.#client = null;
    this.#statusStore.set('disconnected');
    this.#handlers.clear();
    this.#topicSubscriptions.clear();
    this.#hasConnectedOnce = false;
    this.#reconnectCallbacks = [];
    this.#registerRawPublisher(null);
  }

  /** ¿Conexión activa? */
  isConnected(): boolean {
    return this.#client?.connected ?? false;
  }

  // ===========================================================================
  // API PÚBLICA — PUB/SUB
  // ===========================================================================

  /**
   * Publica un evento (con envelope canónico). Si no hay conexión, encola
   * hasta MAX_PENDING_MESSAGES y lo envía al reconectar (QoS 1).
   */
  publish(topic: string, payload: unknown, retain = false): void {
    const envelope = this.#createEnvelope(topic, payload);

    if (!this.#client || !this.#client.connected) {
      if (this.#pendingMessages.length < MAX_PENDING_MESSAGES) {
        this.#pendingMessages.push({ topic, payload: envelope, retain });
        console.log(`[MQTT] Queued message for ${topic} (${this.#pendingMessages.length} pending)`);
      } else {
        console.warn(`[MQTT] Pending queue full, dropping message for ${topic}`);
      }
      return;
    }

    this.#client.publish(topic, JSON.stringify(envelope), { qos: 1, retain });
    this.#logInteraction('publish', topic, payload);
  }

  /**
   * Suscribe a un topic MQTT directo (`ui/response/x`) o a un evento en dot
   * notation (`cocina.item_preparando` → `core/*​/events/cocina/item_preparando`).
   * Refcount por topic: solo (de)suscribe al broker en el primer/último handler.
   * @returns función de limpieza (unsubscribe).
   */
  subscribe(pattern: string, handler: MessageHandler): () => void {
    const { topic: mqttTopic, isEvent } = this.#normalizeEventPattern(pattern);

    // Para eventos, el handler recibe (envelope, envelope) en vez de (topic, payload):
    // los stores leen el primer arg como envelope.
    const effectiveHandler: MessageHandler = isEvent
      ? (_topic, payload) => handler(payload as never, payload)
      : handler;

    if (!this.#handlers.has(mqttTopic)) this.#handlers.set(mqttTopic, new Set());
    this.#handlers.get(mqttTopic)!.add(effectiveHandler);

    const refcount = this.#topicSubscriptions.get(mqttTopic) ?? 0;
    if (refcount === 0 && this.#client?.connected) {
      this.#client.subscribe(mqttTopic);
      this.#logInteraction('subscribe', mqttTopic);
    }
    this.#topicSubscriptions.set(mqttTopic, refcount + 1);

    return () => {
      this.#handlers.get(mqttTopic)?.delete(effectiveHandler);
      const newRefcount = (this.#topicSubscriptions.get(mqttTopic) ?? 1) - 1;
      if (newRefcount <= 0) {
        this.#topicSubscriptions.delete(mqttTopic);
        if (this.#client?.connected) {
          this.#client.unsubscribe(mqttTopic);
          this.#logInteraction('unsubscribe', mqttTopic);
        }
      } else {
        this.#topicSubscriptions.set(mqttTopic, newRefcount);
      }
    };
  }

  /**
   * Registra un callback que corre SOLO en reconexión (no en la primera
   * conexión). Útil para que los stores recarguen datos perdidos en la caída.
   * @returns función para des-registrar.
   */
  onReconnect(callback: () => void): () => void {
    this.#reconnectCallbacks.push(callback);
    return () => {
      this.#reconnectCallbacks = this.#reconnectCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ===========================================================================
  // API PÚBLICA — VISIBILITY
  // ===========================================================================

  /** Registra el handler de visibilitychange (idempotente). */
  setupVisibilityHandler(): void {
    if (this.#visibilityHandlerRegistered || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this.#handleVisibilityChange);
    this.#visibilityHandlerRegistered = true;
    this.#lastVisibilityState = document.visibilityState as 'visible' | 'hidden';
    console.log('[MQTT] Visibility handler registered');
  }

  /** Elimina el handler de visibilitychange. */
  removeVisibilityHandler(): void {
    if (!this.#visibilityHandlerRegistered || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', this.#handleVisibilityChange);
    this.#visibilityHandlerRegistered = false;
    console.log('[MQTT] Visibility handler removed');
  }

  // ===========================================================================
  // INTERNO — CONEXIÓN Y HANDLERS DE TRANSPORTE
  // ===========================================================================

  async #initConnection(config: MqttConfig): Promise<void> {
    try {
      perfStart('MQTT.importLibrary');
      const mqtt = await import('mqtt');
      perfEnd('MQTT.importLibrary');

      // Paso 2c: si el navegador ya está enrolado, mintea un token firmado (enki:token:) y lo
      // presenta como password del CONNECT. Sin cert enrolado → null → conecta anónimo (funciona
      // en 'off'/'observe'). Inerte hasta que exista un cert; nunca bloquea la conexión.
      let password = config.options?.password;
      try {
        const { credentialForConnect } = await import('./enki-identity');
        const token = await credentialForConnect();
        if (token) password = token;
      } catch (e) {
        console.warn('[MQTT] identidad enki no disponible, conectando anónimo', e);
      }

      this.#client = mqtt.default.connect(config.url, {
        ...config.options,
        ...(password ? { password, username: 'enki' } : {}),
        clientId: config.clientId
      }) as unknown as MqttClientLike;

      // Timeout de seguridad: si no conecta en 5s, seguir sin tiempo real.
      this.#connectionTimeout = setTimeout(() => {
        if (!this.#client?.connected) {
          console.warn('[MQTT] Connection timeout - UI will work without real-time updates');
          this.#statusStore.set('error');
          this.#errorStore.set('Connection timeout - working offline');
        }
      }, CONNECT_TIMEOUT_MS);

      this.#client.on('connect', () => this.#onConnect(config));
      this.#client.on('message', (topic, buffer) =>
        this.#onMessage(topic as string, buffer as { toString(enc: string): string })
      );
      this.#client.on('error', (err) => this.#onError(err as Error));
      this.#client.on('close', () => this.#statusStore.set('disconnected'));
      this.#client.on('reconnect', () => this.#statusStore.set('connecting'));
    } catch (err) {
      console.error('[MQTT] Failed to load library:', err);
      this.#statusStore.set('error');
      this.#errorStore.set('Failed to load MQTT library');
    }
  }

  #onConnect(config: MqttConfig): void {
    if (this.#connectionTimeout) clearTimeout(this.#connectionTimeout);
    this.#statusStore.set('connected');
    this.#errorStore.set(null);
    perfEnd('MQTT.totalConnection');
    logMsg('✅ MQTT connected', { url: config.url });

    // DI: entregar el publicador raw a quien lo inyectó (mqtt-request).
    this.#registerRawPublisher({
      publish: (topic, message, options) => {
        this.#client?.publish(topic, message, { qos: options?.qos ?? 1 });
      }
    });

    // Re-suscribir a todos los topics activos (idempotente).
    for (const topic of this.#topicSubscriptions.keys()) {
      this.#client?.subscribe(topic);
    }

    this.#flushPendingMessages();

    // Notificar reload SOLO en reconexión (no en la primera conexión).
    if (this.#hasConnectedOnce) {
      console.log('[MQTT] Reconnected — notifying stores to reload data');
      for (const cb of this.#reconnectCallbacks) {
        try { cb(); } catch (e) { console.error('[MQTT] Reconnect callback error:', e); }
      }
    }
    this.#hasConnectedOnce = true;
  }

  #onMessage(topic: string, buffer: { toString(enc: string): string }): void {
    const payload = this.#parsePayload(buffer);
    this.#lastMessageStore.set({ topic, payload, timestamp: Date.now() });
    this.#notifyHandlers(topic, payload);
    this.#logInteraction('receive', topic, payload);
  }

  #onError(err: Error): void {
    if (this.#connectionTimeout) clearTimeout(this.#connectionTimeout);
    this.#statusStore.set('error');
    this.#errorStore.set(err.message);
    console.error('[MQTT] Error:', err.message);
  }

  // ===========================================================================
  // INTERNO — RUTEO
  // ===========================================================================

  #parsePayload(buffer: { toString(enc: string): string }): unknown {
    try {
      return JSON.parse(buffer.toString('utf-8'));
    } catch {
      return buffer.toString('utf-8');
    }
  }

  /** Match de topic con wildcards MQTT (`+` un nivel, `#` resto). */
  #matchTopic(pattern: string, topic: string): boolean {
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

  #notifyHandlers(topic: string, payload: unknown): void {
    for (const [pattern, handlerSet] of this.#handlers.entries()) {
      if (!this.#matchTopic(pattern, topic)) continue;
      for (const handler of handlerSet) {
        try {
          handler(topic, payload);
        } catch (err) {
          console.error(`[MQTT] Handler error for ${pattern}:`, err);
        }
      }
    }
  }

  /**
   * Normaliza un patrón: dot notation → topic del EventBus.
   * `cocina.item_preparando` → `core/*​/events/cocina/item_preparando`.
   */
  #normalizeEventPattern(pattern: string): { topic: string; isEvent: boolean } {
    if (pattern.includes('/')) return { topic: pattern, isEvent: false }; // topic directo
    if (pattern.includes('.')) {
      const parts = pattern.split('.');
      const domain = parts[0];
      const action = parts.slice(1).join('/');
      return { topic: `core/*/events/${domain}/${action}`, isEvent: true };
    }
    return { topic: pattern, isEvent: false };
  }

  // ===========================================================================
  // INTERNO — ENVELOPE
  // ===========================================================================

  #generateEventId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** core/*​/events/project/state/request → project.state.request */
  #extractEventType(topic: string): string {
    const match = topic.match(/^core\/\*\/events\/(.+)$/);
    if (match) return match[1].replace(/\//g, '.');
    return topic.replace(/\//g, '.');
  }

  #createEnvelope(topic: string, data: unknown): object {
    return {
      event_id: this.#generateEventId(),
      event_type: this.#extractEventType(topic),
      timestamp: new Date().toISOString(),
      source: { core_id: 'ui-frontend' },
      data,
      metadata: {}
    };
  }

  // ===========================================================================
  // INTERNO — COLA PRE-CONEXIÓN
  // ===========================================================================

  #flushPendingMessages(): void {
    if (this.#pendingMessages.length === 0) return;
    console.log(`[MQTT] Flushing ${this.#pendingMessages.length} pending messages`);

    while (this.#pendingMessages.length > 0) {
      const msg = this.#pendingMessages.shift()!;
      if (this.#client?.connected) {
        const message = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload);
        this.#client.publish(msg.topic, message, { qos: 1, retain: msg.retain });
        this.#logInteraction('publish', msg.topic, msg.payload);
      }
    }
  }

  // ===========================================================================
  // INTERNO — BATCH LOGGING
  // ===========================================================================

  #logInteraction(action: string, topic: string, payload?: unknown): void {
    if (!this.#logCollectorEnabled) return;
    if (topic.startsWith('log/') || topic.startsWith('log.')) return; // evita loop

    this.#pendingLogs.push({
      action,
      topic,
      payloadType: typeof payload,
      payloadSize: typeof payload === 'string' ? payload.length : JSON.stringify(payload || {}).length,
      timestamp: Date.now()
    });

    if (this.#pendingLogs.length >= LOG_BATCH_MAX_SIZE) {
      if (this.#logFlushTimeout) { clearTimeout(this.#logFlushTimeout); this.#logFlushTimeout = null; }
      void this.#flushLogs();
      return;
    }
    if (!this.#logFlushTimeout) {
      this.#logFlushTimeout = setTimeout(() => void this.#flushLogs(), LOG_BATCH_DELAY);
    }
  }

  async #flushLogs(): Promise<void> {
    if (!this.#logCollectorEnabled || this.#pendingLogs.length === 0) return;

    const batch = [...this.#pendingLogs];
    this.#pendingLogs = [];
    this.#logFlushTimeout = null;

    try {
      const res = await fetch(this.#logEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'debug',
          source: 'frontend',
          module: 'mqtt-client',
          message: `mqtt.batch (${batch.length} interactions)`,
          context: { interactions: batch, batchSize: batch.length }
        })
      });
      if (!res.ok) this.#logCollectorEnabled = false;
    } catch {
      this.#logCollectorEnabled = false;
    }
  }

  // ===========================================================================
  // INTERNO — VISIBILITY / RESILIENCIA
  // ===========================================================================

  // Arrow field → preserva `this` al usarse como event listener del DOM.
  #handleVisibilityChange = (): void => {
    if (typeof document === 'undefined') return;

    const isHidden = document.hidden;
    const currentState = document.visibilityState as 'visible' | 'hidden';

    if (isHidden && this.#lastVisibilityState === 'visible') {
      this.#backgroundSince = Date.now();
      console.log('[MQTT] Tab going to background');
    } else if (!isHidden && this.#lastVisibilityState === 'hidden') {
      const wasBackgroundFor = this.#backgroundSince ? Date.now() - this.#backgroundSince : 0;
      this.#backgroundSince = null;
      console.log(`[MQTT] Tab returning from background (was hidden for ${wasBackgroundFor}ms)`);
      if (wasBackgroundFor > BACKGROUND_RECHECK_MS) this.#checkAndReconnect();
    }

    this.#lastVisibilityState = currentState;
  };

  #checkAndReconnect(): void {
    if (!this.#client) {
      console.log('[MQTT] No client, nothing to reconnect');
      return;
    }

    if (this.#client.disconnected || !this.#client.connected) {
      console.log('[MQTT] Connection lost while in background, reconnecting...');
      this.#statusStore.set('connecting');
      try { this.#client.end(true); } catch { /* ignore */ }
      this.#client = null;
      setTimeout(() => {
        this.connect().catch((err) => console.error('[MQTT] Reconnection failed:', err));
      }, 500);
    } else {
      console.log('[MQTT] Connection still alive after background');
    }
  }
}
