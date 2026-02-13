import { writable, derived, get } from 'svelte/store';
import mqtt from 'mqtt';

// Types
export interface EventEnvelope {
  id: string;
  type: string;
  version: string;
  source: {
    core_id: string;
    module: string;
    timestamp: number;
  };
  correlation_id?: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export interface MqttState {
  connected: boolean;
  coreId: string | null;
  error: string | null;
}

// Stores
export const mqttState = writable<MqttState>({
  connected: false,
  coreId: null,
  error: null
});

export const events = writable<EventEnvelope[]>([]);
export const lastEvent = derived(events, ($events) => $events[$events.length - 1] || null);

// MQTT Client
let client: mqtt.MqttClient | null = null;

/**
 * Connect to Event-Core MQTT broker
 */
export function connect(brokerUrl: string = 'ws://localhost:1883', coreId: string = 'core-a') {
  if (client?.connected) {
    console.warn('[MQTT] Already connected');
    return;
  }

  mqttState.update(s => ({ ...s, coreId, error: null }));

  try {
    client = mqtt.connect(brokerUrl, {
      clientId: `svelte-frontend-${Date.now()}`,
      clean: true,
      reconnectPeriod: 5000,
      keepalive: 60
    });

    client.on('connect', () => {
      console.log('[MQTT] Connected to broker');
      mqttState.update(s => ({ ...s, connected: true, error: null }));

      // Subscribe to core events
      client?.subscribe([
        `core/${coreId}/events/#`,
        `core/${coreId}/status`,
        `core/*/status` // Discovery
      ]);
    });

    client.on('message', (topic: string, message: Buffer) => {
      try {
        const payload = JSON.parse(message.toString());
        const envelope: EventEnvelope = {
          id: payload.id || `evt_${Date.now()}`,
          type: payload.type || topic.split('/').slice(-2).join('.'),
          version: payload.version || '1.0',
          source: payload.source || {
            core_id: coreId,
            module: 'unknown',
            timestamp: Date.now()
          },
          correlation_id: payload.correlation_id,
          data: payload.data || payload,
          metadata: payload.metadata
        };

        events.update(e => [...e.slice(-99), envelope]); // Keep last 100 events
      } catch (err) {
        console.error('[MQTT] Failed to parse message:', err);
      }
    });

    client.on('error', (err: Error) => {
      console.error('[MQTT] Error:', err);
      mqttState.update(s => ({ ...s, error: err.message }));
    });

    client.on('close', () => {
      console.log('[MQTT] Connection closed');
      mqttState.update(s => ({ ...s, connected: false }));
    });

    client.on('reconnect', () => {
      console.log('[MQTT] Reconnecting...');
    });

  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    mqttState.update(s => ({ ...s, error }));
  }
}

/**
 * Disconnect from MQTT broker
 */
export function disconnect() {
  if (client) {
    client.end();
    client = null;
    mqttState.set({ connected: false, coreId: null, error: null });
  }
}

/**
 * Subscribe to additional topics
 */
export function subscribe(topics: string | string[]) {
  if (client?.connected) {
    client.subscribe(topics);
  }
}

/**
 * Unsubscribe from topics
 */
export function unsubscribe(topics: string | string[]) {
  if (client?.connected) {
    client.unsubscribe(topics);
  }
}

/**
 * Publish a message to a topic
 */
export function publish(topic: string, data: unknown, options?: mqtt.IClientPublishOptions) {
  if (client?.connected) {
    const { coreId } = get(mqttState);
    const fullTopic = topic.startsWith('core/') ? topic : `core/${coreId}/${topic}`;
    client.publish(fullTopic, JSON.stringify(data), options);
  } else {
    console.warn('[MQTT] Cannot publish: not connected');
  }
}

/**
 * Filter events by type pattern
 */
export function filterEvents(pattern: string | RegExp) {
  return derived(events, ($events) => {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return $events.filter(e => regex.test(e.type));
  });
}
