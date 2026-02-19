/**
 * MQTT Request/Response Pattern
 *
 * Implementa semántica REST sobre MQTT:
 * - Request con timeout y garantía de respuesta
 * - Status codes HTTP-like (200, 400, 404, 500)
 * - Manejo de errores estructurado
 *
 * @see docs/architecture/mqtt-request-response.md
 */

import { subscribe, isConnected, status } from './mqtt';
import { get } from 'svelte/store';

// =============================================================================
// TYPES
// =============================================================================

export interface UIRequest {
  request_id: string;
  action: string;
  data: unknown;
  timestamp: string;
  source: {
    client_id: string;
  };
}

export interface UIResponse<T = unknown> {
  request_id: string;
  status: number;
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}

export interface RequestOptions {
  timeout?: number;  // ms, default 10000
}

// =============================================================================
// ERRORS
// =============================================================================

export class MqttTimeoutError extends Error {
  readonly requestId: string;
  readonly domain: string;
  readonly action: string;

  constructor(requestId: string, domain: string, action: string, timeoutMs: number) {
    super(`Request timeout after ${timeoutMs}ms: ${domain}/${action}`);
    this.name = 'MqttTimeoutError';
    this.requestId = requestId;
    this.domain = domain;
    this.action = action;
  }
}

export class MqttRequestError extends Error {
  readonly requestId: string;
  readonly status: number;
  readonly code: string;
  readonly response: UIResponse;

  constructor(response: UIResponse) {
    super(response.error?.message || `Request failed with status ${response.status}`);
    this.name = 'MqttRequestError';
    this.requestId = response.request_id;
    this.status = response.status;
    this.code = response.error?.code || 'UNKNOWN_ERROR';
    this.response = response;
  }
}

export class MqttNotConnectedError extends Error {
  constructor() {
    super('MQTT not connected');
    this.name = 'MqttNotConnectedError';
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_TIMEOUT = 10000; // 10 segundos
const CLIENT_ID = `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// Almacén de requests pendientes
const pendingRequests = new Map<string, {
  resolve: (response: UIResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  unsubscribe: () => void;
}>();

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Genera un request ID único
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Obtiene el cliente MQTT y su método publish
 * Se hace de forma lazy para evitar imports circulares
 */
async function getMqttClient(): Promise<{
  publish: (topic: string, message: string, options?: { qos?: number }) => void;
}> {
  // Import dinámico para evitar problemas de inicialización
  const mqtt = await import('mqtt');

  // Esperar hasta que esté conectado (máximo 5s)
  const startTime = Date.now();
  while (!isConnected() && Date.now() - startTime < 5000) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!isConnected()) {
    throw new MqttNotConnectedError();
  }

  // Acceder al cliente interno (necesitamos exponer esto)
  // Por ahora usamos una aproximación con el publish existente
  return {
    publish: (topic: string, message: string, options?: { qos?: number }) => {
      // Usaremos publishRaw que crearemos
    }
  };
}

// =============================================================================
// INTERNAL: Publish sin envelope (raw)
// =============================================================================

let mqttClientRef: {
  publish: (topic: string, message: string, options?: { qos?: number }) => void;
} | null = null;

/**
 * Registra referencia al cliente MQTT para publish raw
 * Llamado desde mqtt.ts cuando se conecta
 * @internal
 */
export function _setMqttClient(client: {
  publish: (topic: string, message: string, options?: { qos?: number }) => void;
} | null): void {
  mqttClientRef = client;
}

/**
 * Publica un mensaje raw (sin envelope adicional)
 * @internal
 */
function publishRaw(topic: string, payload: unknown): void {
  if (!mqttClientRef) {
    throw new MqttNotConnectedError();
  }

  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  mqttClientRef.publish(topic, message, { qos: 1 });
}

// =============================================================================
// MAIN API
// =============================================================================

/**
 * Hace una request al backend via MQTT con respuesta garantizada
 *
 * @param domain - Dominio del recurso (ej: 'project', 'credential')
 * @param action - Acción a ejecutar (ej: 'list', 'create', 'update', 'delete')
 * @param data - Datos del request (opcional)
 * @param options - Opciones (timeout, etc.)
 * @returns Promise con la respuesta del backend
 * @throws MqttTimeoutError si no hay respuesta en el tiempo límite
 * @throws MqttRequestError si el backend responde con error
 * @throws MqttNotConnectedError si no hay conexión MQTT
 *
 * @example
 * // Listar proyectos
 * const response = await mqttRequest('project', 'list');
 * console.log(response.data.projects);
 *
 * @example
 * // Crear proyecto con manejo de errores
 * try {
 *   const response = await mqttRequest('project', 'create', { name: 'Mi Proyecto' });
 *   console.log('Created:', response.data);
 * } catch (error) {
 *   if (error instanceof MqttTimeoutError) {
 *     console.error('Backend did not respond');
 *   } else if (error instanceof MqttRequestError) {
 *     console.error('Error:', error.code, error.message);
 *   }
 * }
 */
export async function mqttRequest<T = unknown>(
  domain: string,
  action: string,
  data?: unknown,
  options: RequestOptions = {}
): Promise<UIResponse<T>> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const requestId = generateRequestId();

  // Verificar conexión — esperar hasta 8s (la librería MQTT pesa ~2MB)
  const currentStatus = get(status);
  if (currentStatus !== 'connected') {
    await waitForConnection(8000);
  }

  return new Promise<UIResponse<T>>((resolve, reject) => {
    // Topic para recibir respuesta
    const responseTopic = `ui/response/${requestId}`;

    // Timeout timer
    const timer = setTimeout(() => {
      cleanup();
      reject(new MqttTimeoutError(requestId, domain, action, timeout));
    }, timeout);

    // Suscribirse a la respuesta
    const unsubscribe = subscribe(responseTopic, (_topic, payload) => {
      const response = payload as UIResponse<T>;

      // Verificar que es nuestra respuesta
      if (response.request_id !== requestId) return;

      cleanup();

      // Resolver o rechazar según success
      if (response.success) {
        resolve(response);
      } else {
        reject(new MqttRequestError(response as UIResponse));
      }
    });

    // Cleanup function
    const cleanup = () => {
      clearTimeout(timer);
      unsubscribe();
      pendingRequests.delete(requestId);
    };

    // Guardar request pendiente
    pendingRequests.set(requestId, { resolve, reject, timer, unsubscribe });

    // Construir request
    const request: UIRequest = {
      request_id: requestId,
      action,
      data: data ?? {},
      timestamp: new Date().toISOString(),
      source: {
        client_id: CLIENT_ID
      }
    };

    // Publicar request
    const requestTopic = `ui/request/${domain}/${action}`;

    try {
      publishRaw(requestTopic, request);
      console.log(`[MQTT-Request] ${requestTopic}`, { requestId, action, data });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

/**
 * Espera a que MQTT esté conectado.
 * Usa suscripción al store para reaccionar inmediatamente cuando conecte,
 * en vez de polling cada 100ms.
 */
async function waitForConnection(timeoutMs: number): Promise<void> {
  // Ya conectado — salir rápido
  if (isConnected()) return;

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new MqttNotConnectedError());
    }, timeoutMs);

    const unsub = status.subscribe((s) => {
      if (s === 'connected') {
        clearTimeout(timer);
        // Unsubscribe en el siguiente tick para evitar errores de Svelte
        setTimeout(() => unsub(), 0);
        resolve();
      }
    });
  });
}

/**
 * Cancela un request pendiente
 */
export function cancelRequest(requestId: string): boolean {
  const pending = pendingRequests.get(requestId);
  if (!pending) return false;

  clearTimeout(pending.timer);
  pending.unsubscribe();
  pending.reject(new Error('Request cancelled'));
  pendingRequests.delete(requestId);

  return true;
}

/**
 * Obtiene el número de requests pendientes
 */
export function getPendingCount(): number {
  return pendingRequests.size;
}

/**
 * Cancela todos los requests pendientes
 */
export function cancelAllRequests(): void {
  for (const [requestId, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.unsubscribe();
    pending.reject(new Error('All requests cancelled'));
  }
  pendingRequests.clear();
}

// =============================================================================
// CONVENIENCE WRAPPERS
// =============================================================================

/**
 * Request para listar recursos
 */
export function listRequest<T>(domain: string, options?: RequestOptions): Promise<UIResponse<T>> {
  return mqttRequest<T>(domain, 'list', undefined, options);
}

/**
 * Request para obtener un recurso
 */
export function getRequest<T>(domain: string, id: string, options?: RequestOptions): Promise<UIResponse<T>> {
  return mqttRequest<T>(domain, 'get', { id }, options);
}

/**
 * Request para crear un recurso
 */
export function createRequest<T>(domain: string, data: unknown, options?: RequestOptions): Promise<UIResponse<T>> {
  return mqttRequest<T>(domain, 'create', data, options);
}

/**
 * Request para actualizar un recurso
 */
export function updateRequest<T>(domain: string, id: string, data: unknown, options?: RequestOptions): Promise<UIResponse<T>> {
  return mqttRequest<T>(domain, 'update', { id, ...data as object }, options);
}

/**
 * Request para eliminar un recurso
 */
export function deleteRequest<T>(domain: string, id: string, options?: RequestOptions): Promise<UIResponse<T>> {
  return mqttRequest<T>(domain, 'delete', { id }, options);
}
