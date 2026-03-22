/**
 * Store de Dispositivos — Estado central para la UI de gestión IoT.
 *
 * Compone datos de los 5 módulos backend:
 *   - device-registry  → fleet (lista de dispositivos)
 *   - device-shadow    → shadow state (desired/reported/delta)
 *   - firmware-manager → catálogo + OTAs pendientes
 *   - gateway-manager  → gateways activos
 *   - device-health    → alertas + uptime + dashboard
 */

import { writable, derived } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe, onReconnect } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES
// =============================================================================

export interface Device {
  device_id: string;
  project_id: string;
  name: string;
  type: string;
  capabilities: string[];
  protocol: string;
  gateway: string | null;
  state: 'online' | 'offline' | 'error';
  firmware: string | null;
  metadata: Record<string, any>;
  last_seen: string;
  registered_at: string;
}

export interface DeviceShadow {
  reported: Record<string, any>;
  desired: Record<string, any>;
  delta: Record<string, any>;
  synced: boolean;
  last_reported_at: string | null;
  last_desired_at: string | null;
}

export interface FirmwareType {
  type: string;
  latest: string;
  releases_count: number;
  releases: string[];
}

export interface OtaPending {
  device_id: string;
  requested_at: string;
  target_version: string;
  previous_version: string | null;
  type: string;
}

export interface OtaLogEntry {
  device_id: string;
  type: string;
  from: string | null;
  to: string;
  status: 'completed' | 'failed';
  timestamp: string;
}

export interface GatewayInfo {
  type: string;
  enabled: boolean;
  running: boolean;
  state?: string;
  started_at?: string;
  devices_count: number;
  devices?: Array<{
    device_id: string;
    type: string;
    state: string;
    capabilities: string[];
  }>;
  metrics?: Record<string, number>;
}

export interface HealthDevice {
  device_id: string;
  is_offline: boolean;
  uptime_pct_24h: number;
  reconnections_24h: number;
  last_online: string | null;
  last_offline: string | null;
  consecutive_offline_min: number;
}

export interface HealthAlert {
  type: string;
  device_id: string;
  message: string;
  timestamp: string;
  resolved: boolean;
}

export interface HealthSummary {
  total: number;
  online: number;
  offline: number;
  active_alerts: number;
  avg_uptime_pct: number;
}

export type TabId = 'fleet' | 'shadow' | 'firmware' | 'gateways' | 'health';

export interface DispositivosState {
  // UI
  activeTab: TabId;
  selectedDevice: string | null;
  loading: boolean;
  error: string | null;

  // Fleet (device-registry)
  devices: Device[];
  deviceStats: {
    total: number;
    by_type: Record<string, number>;
    by_protocol: Record<string, number>;
    by_state: Record<string, number>;
  } | null;

  // Shadow (device-shadow)
  shadow: DeviceShadow | null;

  // Firmware (firmware-manager)
  firmwareTypes: FirmwareType[];
  otaPending: OtaPending[];
  otaLog: OtaLogEntry[];

  // Gateways (gateway-manager)
  gateways: GatewayInfo[];

  // Health (device-health)
  healthSummary: HealthSummary | null;
  healthDevices: HealthDevice[];
  healthAlerts: HealthAlert[];
}

// =============================================================================
// STORE
// =============================================================================

const initialState: DispositivosState = {
  activeTab: 'fleet',
  selectedDevice: null,
  loading: false,
  error: null,
  devices: [],
  deviceStats: null,
  shadow: null,
  firmwareTypes: [],
  otaPending: [],
  otaLog: [],
  gateways: [],
  healthSummary: null,
  healthDevices: [],
  healthAlerts: []
};

export const dispositivosStore = writable<DispositivosState>(initialState);

// =============================================================================
// DERIVED STORES
// =============================================================================

export const devices = derived(dispositivosStore, $s => $s.devices);
export const selectedDevice = derived(dispositivosStore, $s =>
  $s.selectedDevice ? $s.devices.find(d => d.device_id === $s.selectedDevice) || null : null
);
export const activeTab = derived(dispositivosStore, $s => $s.activeTab);
export const devicesOnline = derived(dispositivosStore, $s => $s.devices.filter(d => d.state === 'online'));
export const devicesOffline = derived(dispositivosStore, $s => $s.devices.filter(d => d.state !== 'online'));
export const healthAlerts = derived(dispositivosStore, $s => $s.healthAlerts.filter(a => !a.resolved));

// =============================================================================
// TAB NAVIGATION
// =============================================================================

export function setTab(tab: TabId): void {
  dispositivosStore.update(s => ({ ...s, activeTab: tab }));
}

export function selectDevice(deviceId: string | null): void {
  dispositivosStore.update(s => ({ ...s, selectedDevice: deviceId, shadow: null }));
  if (deviceId) {
    loadShadow(deviceId);
  }
}

// =============================================================================
// FLEET (device-registry)
// =============================================================================

export async function loadDevices(): Promise<void> {
  dispositivosStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const res = await mqttRequest<any>('devices', 'list', {});
    dispositivosStore.update(s => ({
      ...s,
      devices: res.data?.devices || [],
      loading: false
    }));
  } catch (err: any) {
    dispositivosStore.update(s => ({ ...s, loading: false, error: err.message }));
  }
}

export async function loadDeviceStats(): Promise<void> {
  try {
    const res = await mqttRequest<any>('devices', 'stats', {});
    dispositivosStore.update(s => ({
      ...s,
      deviceStats: res.data || null
    }));
  } catch {}
}

export async function registerDevice(data: {
  device_id: string;
  name?: string;
  type?: string;
  capabilities?: string[];
  protocol?: string;
}): Promise<boolean> {
  try {
    await mqttRequest<any>('devices', 'register', data);
    await loadDevices();
    return true;
  } catch {
    return false;
  }
}

export async function unregisterDevice(deviceId: string): Promise<boolean> {
  try {
    await mqttRequest<any>('devices', 'unregister', { device_id: deviceId });
    dispositivosStore.update(s => ({
      ...s,
      devices: s.devices.filter(d => d.device_id !== deviceId),
      selectedDevice: s.selectedDevice === deviceId ? null : s.selectedDevice
    }));
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// SHADOW (device-shadow)
// =============================================================================

export async function loadShadow(deviceId: string): Promise<void> {
  try {
    const res = await mqttRequest<any>('shadow', 'get-full', { device_id: deviceId });
    dispositivosStore.update(s => ({
      ...s,
      shadow: res.data || null
    }));
  } catch {
    dispositivosStore.update(s => ({ ...s, shadow: null }));
  }
}

export async function setDesired(deviceId: string, state: Record<string, any>): Promise<boolean> {
  try {
    const res = await mqttRequest<any>('shadow', 'set-desired', {
      device_id: deviceId,
      state
    });
    if (res.data) {
      dispositivosStore.update(s => ({
        ...s,
        shadow: s.shadow ? {
          ...s.shadow,
          desired: res.data.desired,
          delta: res.data.delta,
          synced: Object.keys(res.data.delta || {}).length === 0
        } : null
      }));
    }
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// FIRMWARE (firmware-manager)
// =============================================================================

export async function loadFirmwareCatalog(): Promise<void> {
  try {
    const res = await mqttRequest<any>('firmware', 'list', {});
    dispositivosStore.update(s => ({
      ...s,
      firmwareTypes: res.data?.types || []
    }));
  } catch {}
}

export async function loadOtaStatus(): Promise<void> {
  try {
    const res = await mqttRequest<any>('firmware', 'status', { limit: 50 });
    dispositivosStore.update(s => ({
      ...s,
      otaPending: res.data?.pending || [],
      otaLog: res.data?.recent_log || []
    }));
  } catch {}
}

export async function triggerOta(deviceId: string, type: string, version?: string): Promise<boolean> {
  try {
    await mqttRequest<any>('firmware', 'trigger-ota', {
      device_id: deviceId,
      type,
      version
    });
    await loadOtaStatus();
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// GATEWAYS (gateway-manager)
// =============================================================================

export async function loadGateways(): Promise<void> {
  try {
    const res = await mqttRequest<any>('gateways', 'list', {});
    dispositivosStore.update(s => ({
      ...s,
      gateways: res.data?.gateways || []
    }));
  } catch {}
}

export async function restartGateway(type: string): Promise<boolean> {
  try {
    await mqttRequest<any>('gateways', 'restart', { type });
    await loadGateways();
    return true;
  } catch {
    return false;
  }
}

export async function discoverGateway(type: string): Promise<any[]> {
  try {
    const res = await mqttRequest<any>('gateways', 'discover', { type });
    return res.data?.discovered || [];
  } catch {
    return [];
  }
}

// =============================================================================
// HEALTH (device-health)
// =============================================================================

export async function loadHealthDashboard(): Promise<void> {
  try {
    const res = await mqttRequest<any>('health', 'dashboard', {});
    dispositivosStore.update(s => ({
      ...s,
      healthSummary: res.data?.summary || null,
      healthDevices: res.data?.devices || [],
      healthAlerts: res.data?.recent_alerts || []
    }));
  } catch {}
}

export async function loadAlerts(): Promise<void> {
  try {
    const res = await mqttRequest<any>('health', 'alerts', { limit: 50 });
    dispositivosStore.update(s => ({
      ...s,
      healthAlerts: res.data?.alerts || []
    }));
  } catch {}
}

// =============================================================================
// INIT / SUBSCRIPTIONS
// =============================================================================

export async function initDispositivos(): Promise<void> {
  dispositivosStore.update(s => ({ ...s, loading: true }));
  await Promise.all([
    loadDevices(),
    loadDeviceStats(),
    loadHealthDashboard(),
    loadGateways(),
    loadFirmwareCatalog(),
    loadOtaStatus()
  ]);
  dispositivosStore.update(s => ({ ...s, loading: false }));
}

export function initDispositivosSubscriptions(): () => void {
  const cleanups: (() => void)[] = [];

  // Device online/offline events
  cleanups.push(
    mqttSubscribe('device.online', () => { loadDevices(); loadHealthDashboard(); }),
    mqttSubscribe('device.offline', () => { loadDevices(); loadHealthDashboard(); }),
    mqttSubscribe('device.registered', () => { loadDevices(); loadDeviceStats(); }),
    mqttSubscribe('device.unregistered', () => { loadDevices(); loadDeviceStats(); })
  );

  // Shadow events
  cleanups.push(
    mqttSubscribe('shadow.synced', () => {
      let state: DispositivosState;
      dispositivosStore.subscribe(s => state = s)();
      if (state!.selectedDevice) loadShadow(state!.selectedDevice);
    })
  );

  // Firmware events
  cleanups.push(
    mqttSubscribe('firmware.ota_completed', () => { loadOtaStatus(); loadDevices(); }),
    mqttSubscribe('firmware.ota_failed', () => { loadOtaStatus(); loadAlerts(); })
  );

  // Gateway events
  cleanups.push(
    mqttSubscribe('gateway.started', () => loadGateways()),
    mqttSubscribe('gateway.stopped', () => loadGateways()),
    mqttSubscribe('gateway.device_found', () => { loadGateways(); loadDevices(); })
  );

  // Health alerts
  cleanups.push(
    mqttSubscribe('health.alert.offline', () => loadAlerts()),
    mqttSubscribe('health.alert.reconnect_loop', () => loadAlerts()),
    mqttSubscribe('health.report', () => loadHealthDashboard())
  );

  // Reconnect handler
  cleanups.push(onReconnect(() => { initDispositivos(); }));

  // Visibility handler
  function onVisibility() {
    if (document.visibilityState === 'visible') initDispositivos();
  }
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

  return () => cleanups.forEach(c => c());
}

// =============================================================================
// UTILS
// =============================================================================

export function elapsed(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

export function stateColor(state: string): string {
  switch (state) {
    case 'online': return '#22c55e';
    case 'offline': return '#ef4444';
    case 'error': return '#eab308';
    default: return '#666';
  }
}

export function typeIcon(type: string): string {
  switch (type) {
    case 'impresora-termica': return '🖨';
    case 'display': return '🖥';
    case 'sensor': return '🌡';
    case 'cajon': return '💰';
    case 'actuador': return '⚡';
    default: return '📟';
  }
}
