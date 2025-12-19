/**
 * Credentials Store - MQTT Request/Response
 *
 * Comunicación via MQTT con patrón Request/Response:
 * - Requests garantizados con timeout y status codes
 * - Manejo de errores estructurado
 * - Async/await natural
 *
 * @see docs/architecture/mqtt-request-response.md
 */

import { writable, derived } from 'svelte/store';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';

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

interface ListResponse {
  providers: ProviderOption[];
  levels: LevelOption[];
  credentials: CredentialsState['credentials'];
  stats: CredentialsState['stats'];
}

interface CreateResponse {
  key: string;
  created: boolean;
  updated: boolean;
}

interface UpdateResponse {
  key: string;
  updated: boolean;
}

interface DeleteResponse {
  key: string;
  deleted: boolean;
}

interface TestResponse {
  valid: boolean;
  provider: string;
  message: string;
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
// ACTIONS - Request/Response Pattern
// =============================================================================

/**
 * Carga la lista de credenciales
 * Usa mqttRequest para garantizar respuesta
 */
export async function loadCredentials(): Promise<void> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<ListResponse>('credential', 'list');

    credentialsStore.update(s => ({
      ...s,
      providers: response.data.providers?.length > 0 ? response.data.providers : DEFAULT_PROVIDERS,
      levels: response.data.levels?.length > 0 ? response.data.levels : DEFAULT_LEVELS,
      credentials: response.data.credentials || { GLOBAL: [], PROJECT: [], CLIENT: [], CUSTOM: [] },
      stats: response.data.stats || { total: 0, byLevel: {} },
      loading: false,
      error: null
    }));

    console.log('[Credentials] Loaded:', response.data.stats?.total || 0, 'credentials');
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    credentialsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Credentials] Load failed:', errorMessage);
  }
}

/**
 * Crea una nueva credencial
 */
export async function createCredential(
  provider: string,
  level: string,
  identifier: string | null,
  apiKey: string
): Promise<CreateResponse> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<CreateResponse>('credential', 'create', {
      provider,
      level,
      identifier,
      api_key: apiKey
    });

    // Recargar lista para tener estado actualizado
    await loadCredentials();

    console.log('[Credentials] Created:', response.data.key);
    return response.data;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    credentialsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Credentials] Create failed:', errorMessage);
    throw error;
  }
}

/**
 * Actualiza una credencial existente
 */
export async function updateCredential(key: string, apiKey: string): Promise<void> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<UpdateResponse>('credential', 'update', {
      key,
      api_key: apiKey
    });

    // Recargar lista para tener estado actualizado
    await loadCredentials();

    console.log('[Credentials] Updated:', key);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    credentialsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Credentials] Update failed:', errorMessage);
    throw error;
  }
}

/**
 * Elimina una credencial
 */
export async function deleteCredential(key: string): Promise<void> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<DeleteResponse>('credential', 'delete', { key });

    // Limpiar selección si era la credencial eliminada
    credentialsStore.update(s => ({
      ...s,
      selectedKey: s.selectedKey === key ? null : s.selectedKey
    }));

    // Recargar lista para tener estado actualizado
    await loadCredentials();

    console.log('[Credentials] Deleted:', key);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    credentialsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Credentials] Delete failed:', errorMessage);
    throw error;
  }
}

/**
 * Testea una API key
 * Ahora usa MQTT Request/Response en lugar de REST
 */
export async function testCredential(
  provider: string,
  apiKey: string
): Promise<{ valid: boolean; message: string }> {
  try {
    const response = await mqttRequest<TestResponse>('credential', 'test', {
      provider,
      api_key: apiKey
    });

    const result = {
      valid: response.data.valid,
      message: response.data.message
    };

    credentialsStore.update(s => ({ ...s, testResult: result }));
    return result;
  } catch (error) {
    const result = { valid: false, message: getErrorMessage(error) };
    credentialsStore.update(s => ({ ...s, testResult: result }));
    return result;
  }
}

// =============================================================================
// UI STATE ACTIONS
// =============================================================================

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
// HELPER FUNCTIONS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) {
    return 'Request timeout - server did not respond';
  }
  if (error instanceof MqttRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Inicializa el store de credenciales
 * Carga la lista inicial
 */
export function initCredentials(): () => void {
  // Cargar credenciales al inicializar
  loadCredentials();

  // Retornar cleanup (no-op por ahora)
  return () => {};
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

// =============================================================================
// BACKWARD COMPATIBILITY
// =============================================================================

/**
 * @deprecated Use loadCredentials() instead
 */
export const requestState = loadCredentials;

/**
 * @deprecated Use initCredentials() instead
 */
export const initCredentialsSubscriptions = initCredentials;
