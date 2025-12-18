/**
 * Credentials Store - MQTT Event-Driven
 *
 * Comunicación 100% via MQTT:
 * - Solicita estado: publish('credential/state/request')
 * - Recibe estado: subscribe('credential/state')
 * - Acciones: publish('credential/create|update|delete|test')
 *
 * NO usa endpoints REST para datos UI.
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe, publish } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES
// =============================================================================

export interface Credential {
  key: string;
  provider: string;
  providerName: string;
  providerIcon: string;
  level: 'GLOBAL' | 'PROJECT' | 'CLIENT' | 'CUSTOM';
  identifier: string | null;
  preview: string;
}

export interface ProviderOption {
  id: string;
  name: string;
  icon: string;
}

export interface LevelOption {
  id: string;
  name: string;
  icon: string;
  requiresIdentifier: boolean;
}

export interface CredentialsState {
  providers: ProviderOption[];
  levels: LevelOption[];
  credentials: {
    GLOBAL: Credential[];
    PROJECT: Credential[];
    CLIENT: Credential[];
    CUSTOM: Credential[];
  };
  stats: {
    total: number;
    byLevel: Record<string, number>;
  };
  loading: boolean;
  error: string | null;
  selectedKey: string | null;
  activeTab: 'lista' | 'nuevo' | 'config';
  testResult: { valid: boolean; message: string } | null;
}

// =============================================================================
// DEFAULT DATA (fallback si MQTT no responde)
// =============================================================================

const DEFAULT_PROVIDERS: ProviderOption[] = [
  { id: 'DEEPSEEK', name: 'DeepSeek', icon: '🔮' },
  { id: 'ANTHROPIC', name: 'Anthropic', icon: '🧠' },
  { id: 'OPENAI', name: 'OpenAI', icon: '🤖' },
  { id: 'OLLAMA', name: 'Ollama', icon: '🦙' }
];

const DEFAULT_LEVELS: LevelOption[] = [
  { id: 'GLOBAL', name: 'Global', icon: '🟢', requiresIdentifier: false },
  { id: 'PROJECT', name: 'Proyecto', icon: '🔵', requiresIdentifier: true },
  { id: 'CLIENT', name: 'Cliente', icon: '🟡', requiresIdentifier: true },
  { id: 'CUSTOM', name: 'Custom', icon: '🔴', requiresIdentifier: true }
];

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: CredentialsState = {
  providers: DEFAULT_PROVIDERS,
  levels: DEFAULT_LEVELS,
  credentials: {
    GLOBAL: [],
    PROJECT: [],
    CLIENT: [],
    CUSTOM: []
  },
  stats: { total: 0, byLevel: {} },
  loading: false,
  error: null,
  selectedKey: null,
  activeTab: 'lista',
  testResult: null
};

// =============================================================================
// STORE
// =============================================================================

export const credentialsStore = writable<CredentialsState>(initialState);

// =============================================================================
// MQTT SUBSCRIPTIONS
// =============================================================================

let unsubscribeState: (() => void) | null = null;
let unsubscribeSaved: (() => void) | null = null;
let unsubscribeUpdated: (() => void) | null = null;
let unsubscribeDeleted: (() => void) | null = null;

/**
 * Inicializa suscripciones MQTT para credenciales
 * Llamar una vez al montar el componente principal
 *
 * NOTA: No necesita esperar conexión MQTT porque mqtt.ts
 * encola mensajes automáticamente y los envía al conectar.
 */
export function initCredentialsSubscriptions(): () => void {
  // Recibir estado completo
  unsubscribeState = mqttSubscribe('credential/state', (_topic, payload) => {
    const data = payload as {
      providers: ProviderOption[];
      levels: LevelOption[];
      credentials: CredentialsState['credentials'];
      stats: CredentialsState['stats'];
    };

    console.log('[Credentials] State received:', data.stats?.total || 0, 'credentials');

    credentialsStore.update(s => ({
      ...s,
      // Usar datos de MQTT o mantener defaults
      providers: data.providers?.length > 0 ? data.providers : DEFAULT_PROVIDERS,
      levels: data.levels?.length > 0 ? data.levels : DEFAULT_LEVELS,
      credentials: data.credentials || { GLOBAL: [], PROJECT: [], CLIENT: [], CUSTOM: [] },
      stats: data.stats || { total: 0, byLevel: {} },
      loading: false,
      error: null
    }));
  });

  // Notificación de credencial guardada
  unsubscribeSaved = mqttSubscribe('credential.saved', (_topic, payload) => {
    const data = payload as { key: string; created: boolean };
    console.log('[Credentials] Saved:', data.key, data.created ? '(new)' : '(updated)');
  });

  // Notificación de credencial actualizada
  unsubscribeUpdated = mqttSubscribe('credential.updated', (_topic, payload) => {
    const data = payload as { key: string };
    console.log('[Credentials] Updated:', data.key);
  });

  // Notificación de credencial eliminada
  unsubscribeDeleted = mqttSubscribe('credential.deleted', (_topic, payload) => {
    const data = payload as { key: string };
    console.log('[Credentials] Deleted:', data.key);

    // Limpiar selección si era la credencial eliminada
    credentialsStore.update(s => ({
      ...s,
      selectedKey: s.selectedKey === data.key ? null : s.selectedKey
    }));
  });

  // Solicitar estado inicial
  // (si MQTT no está conectado, el mensaje se encola automáticamente)
  requestState();

  // Retornar cleanup
  return () => {
    unsubscribeState?.();
    unsubscribeSaved?.();
    unsubscribeUpdated?.();
    unsubscribeDeleted?.();
  };
}

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Solicita el estado actual via MQTT
 */
export function requestState(): void {
  credentialsStore.update(s => ({ ...s, loading: true }));
  publish('credential/state/request', {});
}

/**
 * Crea una nueva credencial
 */
export function createCredential(
  provider: string,
  level: string,
  identifier: string | null,
  apiKey: string
): void {
  publish('credential/create', {
    provider,
    level,
    identifier,
    api_key: apiKey
  });
}

/**
 * Actualiza una credencial existente
 */
export function updateCredential(key: string, apiKey: string): void {
  publish('credential/update', {
    key,
    api_key: apiKey
  });
}

/**
 * Elimina una credencial
 */
export function deleteCredential(key: string): void {
  publish('credential/delete', { key });
}

/**
 * Testea una API key antes de guardar
 * Nota: Test usa REST porque necesita respuesta síncrona
 */
export async function testCredential(
  provider: string,
  apiKey: string
): Promise<{ valid: boolean; message: string }> {
  try {
    const res = await fetch('/modules/credential-manager/ui/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key: apiKey })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const result = {
      valid: data.valid || false,
      message: data.message || (data.valid ? 'Valid' : 'Invalid')
    };

    credentialsStore.update(s => ({ ...s, testResult: result }));
    return result;
  } catch (err) {
    const result = { valid: false, message: 'Connection error' };
    credentialsStore.update(s => ({ ...s, testResult: result }));
    return result;
  }
}

/**
 * Selecciona una credencial
 */
export function selectCredential(key: string | null): void {
  credentialsStore.update(s => ({ ...s, selectedKey: key }));
}

/**
 * Cambia la tab activa
 */
export function setActiveTab(tab: 'lista' | 'nuevo' | 'config'): void {
  credentialsStore.update(s => ({ ...s, activeTab: tab, testResult: null }));
}

/**
 * Limpia el resultado del test
 */
export function clearTestResult(): void {
  credentialsStore.update(s => ({ ...s, testResult: null }));
}

// =============================================================================
// DERIVED STORES
// =============================================================================

/** Todas las credenciales en lista plana */
export const allCredentials = derived(credentialsStore, $s => [
  ...$s.credentials.GLOBAL,
  ...$s.credentials.PROJECT,
  ...$s.credentials.CLIENT,
  ...$s.credentials.CUSTOM
]);

/** Credenciales globales */
export const globalCredentials = derived(credentialsStore, $s => $s.credentials.GLOBAL);

/** Credenciales de proyecto */
export const projectCredentials = derived(credentialsStore, $s => $s.credentials.PROJECT);

/** Credenciales de cliente */
export const clientCredentials = derived(credentialsStore, $s => $s.credentials.CLIENT);

/** Credenciales custom */
export const customCredentials = derived(credentialsStore, $s => $s.credentials.CUSTOM);

/** Credencial seleccionada actual */
export const selectedCredential = derived(
  [credentialsStore, allCredentials],
  ([$store, $all]) => $all.find(c => c.key === $store.selectedKey) || null
);

/** Providers disponibles */
export const providers = derived(credentialsStore, $s => $s.providers);

/** Levels disponibles */
export const levels = derived(credentialsStore, $s => $s.levels);

/** Estado de carga */
export const isLoading = derived(credentialsStore, $s => $s.loading);

/** Error actual */
export const credentialError = derived(credentialsStore, $s => $s.error);

/** Tiene error */
export const hasError = derived(credentialsStore, $s => $s.error !== null);

/** Total de credenciales */
export const credentialCount = derived(credentialsStore, $s => $s.stats.total);

/** Tab activa */
export const activeTab = derived(credentialsStore, $s => $s.activeTab);

/** Resultado del test */
export const testResult = derived(credentialsStore, $s => $s.testResult);
