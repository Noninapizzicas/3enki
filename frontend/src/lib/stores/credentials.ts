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

export type ServiceType = 'providers' | 'telegram';

export interface OAuthConfig {
  accountId: string;
  accountName: string;
  clientId: string;
  clientIdPreview: string;
  hasSecret: boolean;
  configured: boolean;
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
  oauthConfigs: OAuthConfig[];
  loading: boolean;
  error: string | null;
  selectedKey: string | null;
  activeTab: 'lista' | 'nuevo' | 'config' | 'oauth';
  activeService: ServiceType;
  testResult: { valid: boolean; message: string } | null;
}

interface ListResponse {
  providers: ProviderOption[];
  levels: LevelOption[];
  credentials: CredentialsState['credentials'];
  stats: CredentialsState['stats'];
  oauthConfigs: OAuthConfig[];
}

interface OAuthConfigSaveResponse {
  accountId: string;
  accountName: string;
  created: boolean;
  updated: boolean;
  message: string;
}

interface OAuthConfigDeleteResponse {
  accountId: string;
  deleted: boolean;
}

interface OAuthStartResponse {
  auth_url: string;
  state_id: string;
  expires_in: number;
  instructions: string;
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
// DEFAULTS — Espejo de credential-manager.getUIState()
// Se usan como estado inicial antes de que MQTT responda.
// Fuente de verdad: modules/credential-manager/index.js getUIState()
// =============================================================================

const DEFAULT_PROVIDERS: ProviderOption[] = [
  { id: 'DEEPSEEK', name: 'DeepSeek', icon: '🔮' },
  { id: 'ANTHROPIC', name: 'Anthropic', icon: '🧠' },
  { id: 'OPENAI', name: 'OpenAI', icon: '🤖' },
  { id: 'GROQ', name: 'Groq', icon: '⚡' },
  { id: 'GEMINI', name: 'Google Gemini', icon: '💎' },
  { id: 'OLLAMA', name: 'Ollama', icon: '🦙' },
  { id: 'GOOGLE', name: 'Google Cloud', icon: '☁️' },
  { id: 'GMAIL', name: 'Gmail', icon: '📧' }
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
  oauthConfigs: [],
  loading: false,
  error: null,
  selectedKey: null,
  activeTab: 'lista',
  activeService: 'providers',
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
      credentials: {
        GLOBAL: response.data.credentials?.GLOBAL || [],
        PROJECT: response.data.credentials?.PROJECT || [],
        CLIENT: response.data.credentials?.CLIENT || [],
        CUSTOM: response.data.credentials?.CUSTOM || []
      },
      stats: response.data.stats || { total: 0, byLevel: {} },
      oauthConfigs: response.data.oauthConfigs || [],
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
export function setActiveTab(tab: 'lista' | 'nuevo' | 'config' | 'oauth'): void {
  credentialsStore.update(s => ({ ...s, activeTab: tab, testResult: null }));
}

/**
 * Cambia el servicio activo (providers o telegram)
 */
export function setActiveService(service: ServiceType): void {
  credentialsStore.update(s => ({
    ...s,
    activeService: service,
    activeTab: 'lista',
    selectedKey: null,
    testResult: null
  }));
}

/**
 * Limpia el resultado del test
 */
export function clearTestResult(): void {
  credentialsStore.update(s => ({ ...s, testResult: null }));
}

// =============================================================================
// OAUTH CONFIG ACTIONS
// =============================================================================

/**
 * Guarda una configuración OAuth (Client ID + Secret)
 */
export async function saveOAuthConfig(
  accountId: string,
  accountName: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthConfigSaveResponse> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<OAuthConfigSaveResponse>('credential', 'oauth.config.save', {
      accountId,
      accountName,
      clientId,
      clientSecret
    });

    // Recargar lista para tener estado actualizado
    await loadCredentials();

    console.log('[Credentials] OAuth config saved:', response.data.accountId);
    return response.data;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    credentialsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Credentials] OAuth config save failed:', errorMessage);
    throw error;
  }
}

/**
 * Elimina una configuración OAuth
 */
export async function deleteOAuthConfig(accountId: string): Promise<void> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<OAuthConfigDeleteResponse>('credential', 'oauth.config.delete', { accountId });

    // Recargar lista para tener estado actualizado
    await loadCredentials();

    console.log('[Credentials] OAuth config deleted:', accountId);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    credentialsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Credentials] OAuth config delete failed:', errorMessage);
    throw error;
  }
}

/**
 * Inicia flujo OAuth2 para Gmail/Google
 * Retorna URL de autorización para abrir en popup/redirect
 */
export async function startOAuth(
  provider: string,
  level: string,
  identifier: string | null,
  oauthAccountId?: string,
  scopes: string[] = ['gmail']
): Promise<OAuthStartResponse> {
  try {
    const response = await mqttRequest<OAuthStartResponse>('credential', 'oauth.start', {
      provider,
      level,
      identifier,
      oauthAccountId,
      scopes
    });

    console.log('[Credentials] OAuth started, auth_url:', response.data.auth_url);
    return response.data;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error('[Credentials] OAuth start failed:', errorMessage);
    throw error;
  }
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

/** Credenciales custom (excluyendo Telegram bots) */
export const customCredentials = derived(credentialsStore, $s =>
  $s.credentials.CUSTOM.filter(c => c.provider !== 'TELEGRAM')
);

/** Credenciales de bots (Telegram = CUSTOM con provider TELEGRAM) */
export const botCredentials = derived(credentialsStore, $s =>
  $s.credentials.CUSTOM.filter(c => c.provider === 'TELEGRAM')
);

/** Servicio activo */
export const activeService = derived(credentialsStore, $s => $s.activeService);

/** Configuraciones OAuth */
export const oauthConfigs = derived(credentialsStore, $s => $s.oauthConfigs);

/** Tiene configuración OAuth */
export const hasOAuthConfig = derived(credentialsStore, $s => $s.oauthConfigs.length > 0);

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
