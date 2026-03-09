/**
 * Channels Store - MQTT Request/Response
 *
 * Gestiona canales externos (bindings channel-manager).
 * Integrado en el panel de credenciales como tercer service-tab.
 *
 * Comunicación via mqttRequest al dominio 'channel'.
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

export interface ChannelBinding {
  id?: number;
  channel_type: string;
  external_id: string;
  project_id: string;
  purpose: string;
  label: string | null;
  metadata: Record<string, any>;
  enabled: number;
  created_at?: string;
  updated_at?: string;
}

export interface ChannelsState {
  channels: ChannelBinding[];
  loading: boolean;
  error: string | null;
  selectedChannel: ChannelBinding | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const CHANNEL_TYPES = [
  { id: 'telegram', name: 'Telegram', icon: '📱' },
  { id: 'gmail', name: 'Gmail', icon: '📧' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬' },
  { id: 'glovo', name: 'Glovo', icon: '🛵' },
  { id: 'web', name: 'Web', icon: '🌐' }
];

export const CHANNEL_PURPOSES = [
  { id: 'facturas', name: 'Facturas', icon: '🧾' },
  { id: 'pedidos', name: 'Pedidos', icon: '🍕' },
  { id: 'notificaciones', name: 'Notificaciones', icon: '🔔' },
  { id: 'general', name: 'General', icon: '📋' }
];

// =============================================================================
// STORE
// =============================================================================

const initialState: ChannelsState = {
  channels: [],
  loading: false,
  error: null,
  selectedChannel: null
};

export const channelsStore = writable<ChannelsState>(initialState);

// =============================================================================
// ACTIONS
// =============================================================================

export async function loadChannels(): Promise<void> {
  channelsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<ChannelBinding[]>('channel', 'list', {});

    channelsStore.update(s => ({
      ...s,
      channels: response.data || [],
      loading: false,
      error: null
    }));

    console.log('[Channels] Loaded:', (response.data || []).length, 'channels');
  } catch (error) {
    const msg = getErrorMessage(error);
    channelsStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[Channels] Load failed:', msg);
  }
}

export async function registerChannel(
  channel_type: string,
  external_id: string,
  project_id: string,
  purpose: string,
  label?: string
): Promise<void> {
  channelsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest('channel', 'register', {
      channel_type,
      external_id,
      project_id,
      purpose,
      label: label || null
    });

    await loadChannels();
    console.log('[Channels] Registered:', channel_type, external_id);
  } catch (error) {
    const msg = getErrorMessage(error);
    channelsStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[Channels] Register failed:', msg);
    throw error;
  }
}

export async function updateChannel(
  channel_type: string,
  external_id: string,
  updates: Partial<Pick<ChannelBinding, 'project_id' | 'purpose' | 'label' | 'enabled'>>
): Promise<void> {
  channelsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest('channel', 'update', {
      channel_type,
      external_id,
      ...updates
    });

    await loadChannels();
    console.log('[Channels] Updated:', channel_type, external_id);
  } catch (error) {
    const msg = getErrorMessage(error);
    channelsStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[Channels] Update failed:', msg);
    throw error;
  }
}

export async function removeChannel(channel_type: string, external_id: string): Promise<void> {
  channelsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest('channel', 'remove', { channel_type, external_id });

    channelsStore.update(s => ({
      ...s,
      selectedChannel: s.selectedChannel?.external_id === external_id ? null : s.selectedChannel
    }));

    await loadChannels();
    console.log('[Channels] Removed:', channel_type, external_id);
  } catch (error) {
    const msg = getErrorMessage(error);
    channelsStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[Channels] Remove failed:', msg);
    throw error;
  }
}

// =============================================================================
// UI STATE
// =============================================================================

export function selectChannel(channel: ChannelBinding | null): void {
  channelsStore.update(s => ({ ...s, selectedChannel: channel }));
}

// =============================================================================
// DERIVED
// =============================================================================

export const channels = derived(channelsStore, $s => $s.channels);
export const channelCount = derived(channelsStore, $s => $s.channels.length);
export const channelsLoading = derived(channelsStore, $s => $s.loading);
export const channelsError = derived(channelsStore, $s => $s.error);
export const selectedChannel = derived(channelsStore, $s => $s.selectedChannel);

export const channelsByType = derived(channelsStore, $s => {
  const grouped: Record<string, ChannelBinding[]> = {};
  for (const ch of $s.channels) {
    if (!grouped[ch.channel_type]) grouped[ch.channel_type] = [];
    grouped[ch.channel_type].push(ch);
  }
  return grouped;
});

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) return 'Timeout - servidor no responde';
  if (error instanceof MqttRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}

export function getChannelTypeIcon(type: string): string {
  return CHANNEL_TYPES.find(t => t.id === type)?.icon || '📡';
}

export function getPurposeIcon(purpose: string): string {
  return CHANNEL_PURPOSES.find(p => p.id === purpose)?.icon || '📋';
}
