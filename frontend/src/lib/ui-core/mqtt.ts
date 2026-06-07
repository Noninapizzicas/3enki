/**
 * MQTT Client — Fachada del singleton sobre la clase `MqttClient`.
 *
 * El frontend es un "core" más conectado al broker MQTT: toda la comunicación
 * pasa por aquí. La lógica vive en la clase OOP `./client` (única frontera con
 * el transporte, DIP); este módulo solo materializa el SINGLETON y reexpone la
 * API funcional histórica para no romper a los ~40 consumidores.
 *
 * OPTIMIZACIÓN: la librería `mqtt` se carga LAZY (primer `connect()`) para no
 * inflar el bundle inicial (~2MB → 0 en el chunk de entrada).
 *
 * @see ./client.ts — implementación OOP (estado encapsulado, resiliencia, batch-logging)
 */

import { MqttClient } from './client';
import { _setMqttClient } from './mqtt-request';

// Reexporto los tipos públicos desde su nueva sede para mantener los imports
// existentes (`import type { MqttConfig } from '$lib/ui-core/mqtt'`).
export type { MqttConfig, ConnectionStatus, MqttMessage, RawPublisher } from './client';
export type { MessageHandler } from './client';

// =============================================================================
// SINGLETON — instancia única del cliente del frontend
// =============================================================================

/**
 * Instancia única. Se inyecta `_setMqttClient` por constructor (DIP): la clase
 * entrega su publicador raw a `mqtt-request` sin importarlo, evitando el ciclo
 * de dependencias en tiempo de carga.
 */
const _client = new MqttClient({ registerRawPublisher: _setMqttClient });

/** Acceso directo al singleton para usos avanzados (tests, introspección). */
export { _client as mqttClient };

// =============================================================================
// STORES (READONLY) — mismas referencias que antes
// =============================================================================

export const status = _client.status;
export const error = _client.error;
export const lastMessage = _client.lastMessage;
export const connected = _client.connected;

// =============================================================================
// API FUNCIONAL (delega en el singleton) — compatibilidad hacia atrás
// =============================================================================

/** Conecta al broker (no bloquea: conecta en background, lib `mqtt` lazy). */
export function connect(config: Partial<import('./client').MqttConfig> = {}): Promise<void> {
  return _client.connect(config);
}

/** Desconecta y limpia handlers, subs, colas y estado de resiliencia. */
export function disconnect(): void {
  _client.disconnect();
}

/** Publica un evento (con envelope). Encola si aún no hay conexión (QoS 1). */
export function publish(topic: string, payload: unknown, retain = false): void {
  _client.publish(topic, payload, retain);
}

/** Suscribe a topic directo o evento (dot notation). Devuelve `unsubscribe`. */
export function subscribe(
  pattern: string,
  handler: import('./client').MessageHandler
): () => void {
  return _client.subscribe(pattern, handler);
}

/** Registra callback de reconexión (no en la primera conexión). */
export function onReconnect(callback: () => void): () => void {
  return _client.onReconnect(callback);
}

/** ¿Conexión activa? */
export function isConnected(): boolean {
  return _client.isConnected();
}

/** Registra el handler de visibilitychange (HyperOS/MIUI mata WS en background). */
export function setupVisibilityHandler(): void {
  _client.setupVisibilityHandler();
}

/** Elimina el handler de visibilitychange. */
export function removeVisibilityHandler(): void {
  _client.removeVisibilityHandler();
}
