/**
 * Telegram Bots Store - MQTT Request/Response
 *
 * Gestión de bots de Telegram por proyecto:
 * - Registrar bots
 * - Listar bots
 * - Eliminar bots
 * - Ver estado
 *
 * @see modules/telegram-service/module.json
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

export interface TelegramBot {
  projectId: string;
  botId: number;
  username: string;
  firstName: string;
  canJoinGroups?: boolean;
  canReadAllGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
  hasWebhook?: boolean;
  webhookUrl?: string;
}

export interface TelegramState {
  bots: TelegramBot[];
  loading: boolean;
  error: string | null;
  selectedProjectId: string | null;
  activeTab: 'lista' | 'nuevo' | 'config';
  testResult: { valid: boolean; message: string; botInfo?: TelegramBot } | null;
}

interface ListBotsResponse {
  bots: TelegramBot[];
  count: number;
}

interface RegisterBotResponse {
  success: boolean;
  projectId: string;
  botInfo: {
    id: number;
    username: string;
    first_name: string;
    can_join_groups?: boolean;
    can_read_all_group_messages?: boolean;
    supports_inline_queries?: boolean;
  };
}

interface RemoveBotResponse {
  success: boolean;
  projectId: string;
}

interface TestBotResponse {
  valid: boolean;
  message: string;
  botInfo?: {
    id: number;
    username: string;
    first_name: string;
  };
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: TelegramState = {
  bots: [],
  loading: false,
  error: null,
  selectedProjectId: null,
  activeTab: 'lista',
  testResult: null
};

// =============================================================================
// STORE
// =============================================================================

export const telegramStore = writable<TelegramState>(initialState);

// =============================================================================
// ACTIONS - Request/Response Pattern
// =============================================================================

/**
 * Carga la lista de bots registrados
 */
export async function loadBots(): Promise<void> {
  telegramStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<ListBotsResponse>('telegram', 'listBots');

    telegramStore.update(s => ({
      ...s,
      bots: response.data.bots || [],
      loading: false,
      error: null
    }));

    console.log('[Telegram] Loaded:', response.data.count || 0, 'bots');
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    telegramStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Telegram] Load failed:', errorMessage);
  }
}

/**
 * Registra un nuevo bot para un proyecto
 */
export async function registerBot(
  projectId: string,
  token: string,
  name?: string
): Promise<RegisterBotResponse> {
  telegramStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<RegisterBotResponse>('telegram', 'registerBot', {
      projectId,
      token,
      name
    });

    // Recargar lista para tener estado actualizado
    await loadBots();

    console.log('[Telegram] Registered bot for project:', projectId);
    return response.data;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    telegramStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Telegram] Register failed:', errorMessage);
    throw error;
  }
}

/**
 * Elimina un bot de un proyecto
 */
export async function removeBot(projectId: string): Promise<void> {
  telegramStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<RemoveBotResponse>('telegram', 'removeBot', { projectId });

    // Limpiar selección si era el bot eliminado
    telegramStore.update(s => ({
      ...s,
      selectedProjectId: s.selectedProjectId === projectId ? null : s.selectedProjectId
    }));

    // Recargar lista
    await loadBots();

    console.log('[Telegram] Removed bot from project:', projectId);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    telegramStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Telegram] Remove failed:', errorMessage);
    throw error;
  }
}

/**
 * Testea un token de bot
 */
export async function testBotToken(
  token: string
): Promise<{ valid: boolean; message: string; botInfo?: TelegramBot }> {
  try {
    const response = await mqttRequest<TestBotResponse>('telegram', 'testToken', { token });

    const result = {
      valid: response.data.valid,
      message: response.data.message,
      botInfo: response.data.botInfo ? {
        projectId: '',
        botId: response.data.botInfo.id,
        username: response.data.botInfo.username,
        firstName: response.data.botInfo.first_name
      } : undefined
    };

    telegramStore.update(s => ({ ...s, testResult: result }));
    return result;
  } catch (error) {
    const result = { valid: false, message: getErrorMessage(error) };
    telegramStore.update(s => ({ ...s, testResult: result }));
    return result;
  }
}

/**
 * Configura el webhook para un bot
 */
export async function setupWebhook(projectId: string, webhookUrl: string): Promise<void> {
  telegramStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest('telegram', 'setupWebhook', { projectId, webhookUrl });
    await loadBots();
    console.log('[Telegram] Webhook configured for project:', projectId);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    telegramStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Telegram] Webhook setup failed:', errorMessage);
    throw error;
  }
}

// =============================================================================
// UI STATE ACTIONS
// =============================================================================

/**
 * Selecciona un bot/proyecto
 */
export function selectBot(projectId: string | null): void {
  telegramStore.update(s => ({ ...s, selectedProjectId: projectId }));
}

/**
 * Cambia la tab activa
 */
export function setTelegramTab(tab: 'lista' | 'nuevo' | 'config'): void {
  telegramStore.update(s => ({ ...s, activeTab: tab, testResult: null }));
}

/**
 * Limpia el resultado del test
 */
export function clearTelegramTestResult(): void {
  telegramStore.update(s => ({ ...s, testResult: null }));
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
 * Inicializa el store de telegram
 */
export function initTelegram(): () => void {
  loadBots();
  return () => {};
}

// =============================================================================
// DERIVED STORES
// =============================================================================

/** Lista de bots */
export const telegramBots = derived(telegramStore, $s => $s.bots);

/** Bot seleccionado */
export const selectedBot = derived(
  telegramStore,
  $s => $s.bots.find(b => b.projectId === $s.selectedProjectId) || null
);

/** Estado de carga */
export const telegramLoading = derived(telegramStore, $s => $s.loading);

/** Error actual */
export const telegramError = derived(telegramStore, $s => $s.error);

/** Total de bots */
export const botCount = derived(telegramStore, $s => $s.bots.length);

/** Tab activa */
export const telegramActiveTab = derived(telegramStore, $s => $s.activeTab);

/** Resultado del test */
export const telegramTestResult = derived(telegramStore, $s => $s.testResult);
