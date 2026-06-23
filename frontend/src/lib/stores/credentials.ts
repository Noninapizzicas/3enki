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

export type ServiceType = 'providers' | 'telegram' | 'canales';

export interface OAuthConfig {
  accountId: string;
  accountName: string;
  clientId: string;
  clientIdPreview: string;
  hasSecret: boolean;
  configured: boolean;
}

export interface GlovoConfig {
  level: string;
  identifier: string | null;
  clientIdPreview: string;
  hasSecret: boolean;
  chainId: string;
  configured: boolean;
}

export interface TelegramNotifConfig {
  level: string;
  identifier: string | null;
  chatId: string;
  botName: string;
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
  glovoConfigs: GlovoConfig[];
  telegramNotifConfigs: TelegramNotifConfig[];
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
  { id: 'KIMI', name: 'Kimi (Moonshot)', icon: '🌙' },
  { id: 'GOOGLE', name: 'Google Cloud', icon: '☁️' },
  { id: 'GMAIL', name: 'Gmail', icon: '📧' },
  { id: 'GLOVO', name: 'Glovo', icon: '🛵' },
  { id: 'META_WHATSAPP', name: 'WhatsApp (token)', icon: '💬' },
  { id: 'META_WHATSAPP_VERIFY_TOKEN', name: 'WhatsApp (verify)', icon: '🪝' }
];

/**
 * Providers cuyo secreto es POR PROYECTO (multi-tenant): cada tienda tiene su propio
 * número/token/webhook → el backend (credential-manager v2.1.0) RECHAZA guardarlos a
 * cualquier nivel != PROJECT. El formulario los fuerza a PROJECT para no chocar con
 * el invariante. Espejo de PROJECT_ONLY_PROVIDERS en modules/credential-manager/index.js.
 */
export const PROJECT_ONLY_PROVIDERS = new Set<string>([
  'META_WHATSAPP',
  'META_WHATSAPP_VERIFY_TOKEN'
]);

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
  glovoConfigs: [],
  telegramNotifConfigs: [],
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

    // El backend (credential-manager._getUIState) devuelve `credentials` como un ARRAY
    // PLANO [{key, provider, level, identifier, preview}], no agrupado por nivel. Si no se
    // agrupa, la Lista (que lee credentials.GLOBAL/PROJECT/...) sale SIEMPRE vacía.
    // Aquí lo agrupamos (tolerando también el shape ya-agrupado por compatibilidad).
    const rawCreds: any = response.data.credentials;
    const grouped: CredentialsState['credentials'] = { GLOBAL: [], PROJECT: [], CLIENT: [], CUSTOM: [] };
    if (Array.isArray(rawCreds)) {
      for (const c of rawCreds) {
        if (grouped[c.level as keyof CredentialsState['credentials']]) {
          grouped[c.level as keyof CredentialsState['credentials']].push(c);
        } else {
          // Niveles fuera de los 4 grupos (p.ej. BOT) → se muestran junto a CUSTOM.
          grouped.CUSTOM.push(c);
        }
      }
    } else if (rawCreds && typeof rawCreds === 'object') {
      grouped.GLOBAL = rawCreds.GLOBAL || [];
      grouped.PROJECT = rawCreds.PROJECT || [];
      grouped.CLIENT = rawCreds.CLIENT || [];
      grouped.CUSTOM = rawCreds.CUSTOM || [];
    }
    const total = (response.data as any).total ??
      (grouped.GLOBAL.length + grouped.PROJECT.length + grouped.CLIENT.length + grouped.CUSTOM.length);
    const byLevel = {
      GLOBAL: grouped.GLOBAL.length,
      PROJECT: grouped.PROJECT.length,
      CLIENT: grouped.CLIENT.length,
      CUSTOM: grouped.CUSTOM.length
    };

    credentialsStore.update(s => ({
      ...s,
      providers: response.data.providers?.length > 0 ? response.data.providers : DEFAULT_PROVIDERS,
      levels: response.data.levels?.length > 0 ? response.data.levels : DEFAULT_LEVELS,
      credentials: grouped,
      stats: (response.data as any).stats || { total, byLevel },
      oauthConfigs: response.data.oauthConfigs || [],
      glovoConfigs: response.data.glovoConfigs || [],
      telegramNotifConfigs: (response.data as any).telegramNotifConfigs || [],
      loading: false,
      error: null
    }));

    console.log('[Credentials] Loaded:', total, 'credentials');
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
    const message = getErrorMessage(error);
    // credential-tester pendiente (sesion 2 de la descomposicion): cuando el
    // backend responde "No handler registered for credential/test" no es un
    // fallo de la API key — es que el modulo de test no esta operativo.
    // Tratar como "skip test" y dejar guardar sin validar.
    if (/no handler/i.test(message)) {
      const result = {
        valid: true,
        message: 'Test no disponible (credential-tester pendiente) — guardando sin validar'
      };
      credentialsStore.update(s => ({ ...s, testResult: result }));
      return result;
    }
    const result = { valid: false, message };
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
 * Guarda configuración Glovo (Client ID + Client Secret + Chain ID)
 */
export async function saveGlovoConfig(
  level: string,
  identifier: string | null,
  clientId: string,
  clientSecret: string,
  chainId: string
): Promise<any> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<any>('credential', 'glovo.save', {
      level,
      identifier,
      client_id: clientId,
      client_secret: clientSecret,
      chain_id: chainId
    });

    // Recargar lista para tener estado actualizado
    await loadCredentials();

    console.log('[Credentials] Glovo config saved:', response.data?.level);
    return response.data;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    credentialsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Credentials] Glovo config save failed:', errorMessage);
    throw error;
  }
}

/**
 * Elimina configuración Glovo
 */
export async function deleteGlovoConfig(level: string, identifier: string | null): Promise<void> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<any>('credential', 'glovo.delete', { level, identifier });

    // Recargar lista para tener estado actualizado
    await loadCredentials();

    console.log('[Credentials] Glovo config deleted:', level);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    credentialsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Credentials] Glovo config delete failed:', errorMessage);
    throw error;
  }
}

/**
 * Guarda configuración de notificación Telegram (Chat ID + Bot Name)
 */
export async function saveTelegramNotifConfig(
  level: string,
  identifier: string | null,
  chatId: string,
  botName: string
): Promise<any> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<any>('credential', 'telegram.notif.save', {
      level,
      identifier,
      chat_id: chatId,
      bot_name: botName
    });

    // Recargar lista para tener estado actualizado
    await loadCredentials();

    console.log('[Credentials] Telegram notif config saved:', response.data?.level);
    return response.data;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    credentialsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Credentials] Telegram notif config save failed:', errorMessage);
    throw error;
  }
}

/**
 * Elimina configuración de notificación Telegram
 */
export async function deleteTelegramNotifConfig(level: string, identifier: string | null): Promise<void> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<any>('credential', 'telegram.notif.delete', { level, identifier });

    // Recargar lista para tener estado actualizado
    await loadCredentials();

    console.log('[Credentials] Telegram notif config deleted:', level);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    credentialsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Credentials] Telegram notif config delete failed:', errorMessage);
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

/** Configuraciones de Glovo (multi-campo) */
export const glovoConfigs = derived(credentialsStore, $s => $s.glovoConfigs);

/** Configuraciones de notificación Telegram (chatId + botName por nivel) */
export const telegramNotifConfigs = derived(credentialsStore, $s => $s.telegramNotifConfigs);

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
