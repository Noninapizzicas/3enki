/**
 * Store ESP32 — Estado central para desarrollo, flash y monitor serial.
 *
 * Compone datos de 3 módulos backend:
 *   - firmware-builder  → drivers, builds
 *   - firmware-manager  → catálogo, OTA, rollback
 *   - esp32-flasher     → puertos, flash, monitor serial
 */

import { writable, derived } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe, onReconnect } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES
// =============================================================================

export interface Driver {
  id: string;
  name: string;
  description: string;
  board: string;
  has_binary: boolean;
  binary_size: number | null;
  last_build: string | null;
  is_building: boolean;
  source_files: string[];
}

export interface Board {
  id: string;
  name: string;
  platform: string;
  mcu: string;
  flash: string;
  psram: boolean;
}

export interface SerialPort {
  path: string;
  name: string;
  type: string;
  in_use_by: string | null;
}

export interface FlashStatus {
  flash_id: string;
  port: string;
  method: string;
  status: string;
  started_at?: string;
  elapsed_ms?: number;
  progress?: { stage: string; percent: number; message?: string };
  log_tail?: string[];
  log_lines?: number;
}

export interface FlashHistoryEntry {
  flash_id: string;
  port: string;
  method: string;
  binary_path: string;
  status: string;
  duration_ms?: number;
  error?: string;
  timestamp: string;
}

export interface BuildStatus {
  driver: string;
  status: string;
  started_at?: string;
  elapsed_ms?: number;
  log_lines?: number;
  log_tail?: string[];
  last_build?: string;
}

export interface FirmwareType {
  type: string;
  latest: string;
  releases_count: number;
  releases: string[];
  binary_path: string | null;
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

export interface RollbackDevice {
  device_id: string;
  type: string;
  current_version: string;
  previous_version: string | null;
  can_rollback: boolean;
}

export type TabId = 'drivers' | 'firmware' | 'flash';

export interface Esp32State {
  // UI
  activeTab: TabId;
  loading: boolean;
  error: string | null;

  // Drivers (firmware-builder)
  drivers: Driver[];
  boards: Board[];
  selectedDriver: string | null;
  buildStatus: BuildStatus | null;

  // Firmware (firmware-manager)
  firmwareTypes: FirmwareType[];
  otaPending: OtaPending[];
  otaLog: OtaLogEntry[];
  rollbackDevices: RollbackDevice[];

  // Flash (esp32-flasher)
  ports: SerialPort[];
  activeFlashes: FlashStatus[];
  flashHistory: FlashHistoryEntry[];
  lastBuild: { driver: string; binary_path: string; timestamp: string } | null;

  // Monitor
  serialLines: string[];
  monitorPort: string | null;
  monitorBaud: number;
}

// =============================================================================
// STORE
// =============================================================================

const initialState: Esp32State = {
  activeTab: 'drivers',
  loading: false,
  error: null,
  drivers: [],
  boards: [],
  selectedDriver: null,
  buildStatus: null,
  firmwareTypes: [],
  otaPending: [],
  otaLog: [],
  rollbackDevices: [],
  ports: [],
  activeFlashes: [],
  flashHistory: [],
  lastBuild: null,
  serialLines: [],
  monitorPort: null,
  monitorBaud: 115200
};

export const esp32Store = writable<Esp32State>(initialState);

// =============================================================================
// DERIVED STORES
// =============================================================================

export const activeTab = derived(esp32Store, $s => $s.activeTab);
export const drivers = derived(esp32Store, $s => $s.drivers);
export const ports = derived(esp32Store, $s => $s.ports);
export const serialLines = derived(esp32Store, $s => $s.serialLines);

// =============================================================================
// TAB NAVIGATION
// =============================================================================

export function setTab(tab: TabId): void {
  esp32Store.update(s => ({ ...s, activeTab: tab }));
}

export function selectDriver(id: string | null): void {
  esp32Store.update(s => ({ ...s, selectedDriver: id }));
}

// =============================================================================
// DRIVERS (firmware-builder)
// =============================================================================

export async function loadDrivers(): Promise<void> {
  try {
    const res = await mqttRequest<any>('builder', 'list-drivers', {});
    esp32Store.update(s => ({ ...s, drivers: res.data?.drivers || [], error: null }));
  } catch (err: any) {
    console.warn('[ESP32] loadDrivers failed:', err.message || err);
    esp32Store.update(s => ({ ...s, drivers: [], error: `Drivers: ${err.message || 'sin respuesta del backend'}` }));
  }
}

export async function loadBoards(): Promise<void> {
  try {
    const res = await mqttRequest<any>('builder', 'list-boards', {});
    esp32Store.update(s => ({ ...s, boards: res.data?.boards || [] }));
  } catch (err: any) {
    console.warn('[ESP32] loadBoards failed:', err.message || err);
  }
}

export async function buildDriver(driver: string, clean = false): Promise<boolean> {
  try {
    await mqttRequest<any>('builder', 'build', { driver, clean });
    pollBuildStatus(driver);
    return true;
  } catch {
    return false;
  }
}

export async function loadBuildStatus(driver: string): Promise<void> {
  try {
    const res = await mqttRequest<any>('builder', 'build-status', { driver });
    esp32Store.update(s => ({ ...s, buildStatus: res.data || null }));
  } catch {}
}

let buildPollTimer: ReturnType<typeof setTimeout> | null = null;

function pollBuildStatus(driver: string): void {
  if (buildPollTimer) clearTimeout(buildPollTimer);

  async function poll() {
    const res = await mqttRequest<any>('builder', 'build-status', { driver }).catch(() => null);
    if (!res) return;

    esp32Store.update(s => ({ ...s, buildStatus: res.data || null }));

    if (res.data?.status === 'building') {
      buildPollTimer = setTimeout(poll, 2000);
    } else {
      buildPollTimer = null;
      loadDrivers();
    }
  }

  poll();
}

// =============================================================================
// FIRMWARE (firmware-manager)
// =============================================================================

export async function loadFirmwareCatalog(): Promise<void> {
  try {
    const res = await mqttRequest<any>('firmware', 'list', {});
    esp32Store.update(s => ({ ...s, firmwareTypes: res.data?.types || [] }));
  } catch {}
}

export async function loadOtaStatus(): Promise<void> {
  try {
    const res = await mqttRequest<any>('firmware', 'status', { limit: 50 });
    esp32Store.update(s => ({
      ...s,
      otaPending: res.data?.pending || [],
      otaLog: res.data?.recent_log || []
    }));
  } catch {}
}

export async function triggerOta(deviceId: string, type: string, version?: string): Promise<boolean> {
  try {
    await mqttRequest<any>('firmware', 'trigger-ota', { device_id: deviceId, type, version });
    await loadOtaStatus();
    return true;
  } catch {
    return false;
  }
}

export async function loadRollbackDevices(): Promise<void> {
  try {
    const res = await mqttRequest<any>('firmware', 'device-versions', {});
    esp32Store.update(s => ({ ...s, rollbackDevices: res.data?.devices || [] }));
  } catch {}
}

export async function rollbackDevice(deviceId: string, type: string): Promise<boolean> {
  try {
    await mqttRequest<any>('firmware', 'rollback', { device_id: deviceId, type });
    await loadRollbackDevices();
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// FLASH (esp32-flasher)
// =============================================================================

export async function loadPorts(): Promise<void> {
  try {
    const res = await mqttRequest<any>('flash', 'list-ports', {});
    esp32Store.update(s => ({
      ...s,
      ports: res.data?.ports || [],
      lastBuild: res.data?.last_build || null
    }));
  } catch {}
}

export async function startFlash(data: {
  port: string;
  binary_path: string;
  method?: string;
  baud?: number;
  erase_before?: boolean;
}): Promise<{ success: boolean; flash_id?: string; error?: string }> {
  try {
    const res = await mqttRequest<any>('flash', 'start', data);
    if (res.data?.flash_id) pollFlashStatus(res.data.flash_id);
    return { success: true, flash_id: res.data?.flash_id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error iniciando flash' };
  }
}

export async function cancelFlash(flashId: string): Promise<boolean> {
  try {
    await mqttRequest<any>('flash', 'cancel', { flash_id: flashId });
    await loadFlashStatus();
    return true;
  } catch {
    return false;
  }
}

export async function loadFlashStatus(): Promise<void> {
  try {
    const res = await mqttRequest<any>('flash', 'status', {});
    esp32Store.update(s => ({ ...s, activeFlashes: res.data?.active || [] }));
  } catch {}
}

export async function loadFlashHistory(): Promise<void> {
  try {
    const res = await mqttRequest<any>('flash', 'history', { limit: 30 });
    esp32Store.update(s => ({ ...s, flashHistory: res.data?.history || [] }));
  } catch {}
}

let flashPollTimer: ReturnType<typeof setTimeout> | null = null;

function pollFlashStatus(flashId: string): void {
  if (flashPollTimer) clearTimeout(flashPollTimer);

  async function poll() {
    const res = await mqttRequest<any>('flash', 'status', { flash_id: flashId }).catch(() => null);
    if (!res) return;

    if (res.data?.status === 'flashing') {
      esp32Store.update(s => ({ ...s, activeFlashes: [res.data] }));
      flashPollTimer = setTimeout(poll, 1000);
    } else {
      flashPollTimer = null;
      await loadFlashStatus();
      await loadFlashHistory();
    }
  }

  poll();
}

// =============================================================================
// MONITOR
// =============================================================================

export async function startMonitor(port: string, baud = 115200): Promise<boolean> {
  try {
    await mqttRequest<any>('flash', 'monitor-start', { port, baud });
    esp32Store.update(s => ({ ...s, monitorPort: port, monitorBaud: baud, serialLines: [] }));
    return true;
  } catch {
    return false;
  }
}

export async function stopMonitor(port: string): Promise<boolean> {
  try {
    await mqttRequest<any>('flash', 'monitor-stop', { port });
    esp32Store.update(s => ({ ...s, monitorPort: null }));
    return true;
  } catch {
    return false;
  }
}

export async function sendToMonitor(port: string, data: string): Promise<boolean> {
  try {
    await mqttRequest<any>('flash', 'monitor-send', { port, data });
    return true;
  } catch {
    return false;
  }
}

function addSerialLine(line: string): void {
  esp32Store.update(s => {
    const lines = [...s.serialLines, line];
    if (lines.length > 2000) lines.splice(0, lines.length - 2000);
    return { ...s, serialLines: lines };
  });
}

// =============================================================================
// INIT / SUBSCRIPTIONS
// =============================================================================

export async function initEsp32(): Promise<void> {
  esp32Store.update(s => ({ ...s, loading: true }));
  await Promise.all([
    loadDrivers(),
    loadBoards(),
    loadPorts(),
    loadFlashStatus(),
    loadFlashHistory(),
    loadFirmwareCatalog(),
    loadOtaStatus(),
    loadRollbackDevices()
  ]);
  esp32Store.update(s => ({ ...s, loading: false }));
}

export function initEsp32Subscriptions(): () => void {
  const cleanups: (() => void)[] = [];

  // Build events
  cleanups.push(
    mqttSubscribe('firmware.build_completed', () => { loadDrivers(); loadFirmwareCatalog(); }),
    mqttSubscribe('firmware.build_failed', () => { loadDrivers(); })
  );

  // OTA events
  cleanups.push(
    mqttSubscribe('firmware.ota_completed', () => { loadOtaStatus(); }),
    mqttSubscribe('firmware.ota_failed', () => { loadOtaStatus(); })
  );

  // Flash events
  cleanups.push(
    mqttSubscribe('flash.completed', () => { loadFlashStatus(); loadFlashHistory(); }),
    mqttSubscribe('flash.failed', () => { loadFlashStatus(); loadFlashHistory(); })
  );

  // Serial monitor output
  cleanups.push(
    mqttSubscribe('flash.serial_output', (_topic, payload: any) => {
      if (payload?.line) addSerialLine(payload.line);
    })
  );

  // Reconnect
  cleanups.push(onReconnect(() => { initEsp32(); }));

  // Visibility
  function onVisibility() {
    if (document.visibilityState === 'visible') {
      loadPorts();
      loadFlashStatus();
    }
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

export function statusColor(status: string | null): string {
  switch (status) {
    case 'success':
    case 'completed': return '#22c55e';
    case 'failed': return '#ef4444';
    case 'building':
    case 'flashing': return '#3b82f6';
    default: return '#666';
  }
}
