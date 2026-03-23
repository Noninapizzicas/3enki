/**
 * Store ESP32 — Estado central para desarrollo, flash y monitor serial.
 *
 * Compone datos de 2 módulos backend:
 *   - esp32-dev     → templates, proyectos, builds
 *   - esp32-flasher → puertos, flash, monitor serial
 */

import { writable, derived } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe, onReconnect } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES
// =============================================================================

export interface Template {
  id: string;
  name: string;
  description: string;
  framework: string;
  boards: string[];
  category: string;
}

export interface Project {
  name: string;
  template: string;
  board: string;
  framework: string;
  created_at: string;
  last_build: string | null;
  last_build_status: string | null;
}

export interface ProjectDetail extends Project {
  path: string;
  files: string[];
  binary: { path: string; size: number; modified: string } | null;
  is_building: boolean;
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
  project_name: string;
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

export interface RollbackEntry {
  device_id: string;
  current_version: string;
  previous_version: string | null;
  type: string;
  can_rollback: boolean;
}

export type TabId = 'dev' | 'firmware' | 'flash';

export interface Esp32State {
  // UI
  activeTab: TabId;
  loading: boolean;
  error: string | null;

  // Dev (esp32-dev)
  templates: Template[];
  projects: Project[];
  selectedProject: string | null;
  projectDetail: ProjectDetail | null;
  boards: Board[];
  buildStatus: BuildStatus | null;

  // Firmware (firmware-manager — reutilizado)
  firmwareTypes: FirmwareType[];
  otaPending: OtaPending[];
  otaLog: OtaLogEntry[];
  rollbackDevices: RollbackEntry[];

  // Flash (esp32-flasher)
  ports: SerialPort[];
  activeFlashes: FlashStatus[];
  flashHistory: FlashHistoryEntry[];
  lastBuild: { project_name: string; binary_path: string; timestamp: string } | null;

  // Monitor (parte de Flash)
  serialLines: string[];
  monitorPort: string | null;
  monitorBaud: number;
}

// =============================================================================
// STORE
// =============================================================================

const initialState: Esp32State = {
  activeTab: 'dev',
  loading: false,
  error: null,
  templates: [],
  projects: [],
  selectedProject: null,
  projectDetail: null,
  boards: [],
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
export const projects = derived(esp32Store, $s => $s.projects);
export const templates = derived(esp32Store, $s => $s.templates);
export const ports = derived(esp32Store, $s => $s.ports);
export const serialLines = derived(esp32Store, $s => $s.serialLines);

// =============================================================================
// TAB NAVIGATION
// =============================================================================

export function setTab(tab: TabId): void {
  esp32Store.update(s => ({ ...s, activeTab: tab }));
}

export function selectProject(name: string | null): void {
  esp32Store.update(s => ({ ...s, selectedProject: name, projectDetail: null }));
  if (name) loadProjectDetail(name);
}

// =============================================================================
// DEV (esp32-dev)
// =============================================================================

export async function loadTemplates(): Promise<void> {
  try {
    const res = await mqttRequest<any>('esp32', 'list-templates', {});
    esp32Store.update(s => ({ ...s, templates: res.data?.templates || [], error: null }));
  } catch (err: any) {
    console.warn('[ESP32] loadTemplates failed:', err.message || err);
    esp32Store.update(s => ({ ...s, templates: [], error: `Templates: ${err.message || 'sin respuesta del backend'}` }));
  }
}

export async function loadProjects(): Promise<void> {
  try {
    const res = await mqttRequest<any>('esp32', 'list-projects', {});
    esp32Store.update(s => ({ ...s, projects: res.data?.projects || [] }));
  } catch (err: any) {
    console.warn('[ESP32] loadProjects failed:', err.message || err);
  }
}

export async function loadProjectDetail(name: string): Promise<void> {
  try {
    const res = await mqttRequest<any>('esp32', 'get-project', { project_name: name });
    esp32Store.update(s => ({ ...s, projectDetail: res.data || null }));
  } catch {
    esp32Store.update(s => ({ ...s, projectDetail: null }));
  }
}

export async function loadBoards(): Promise<void> {
  try {
    const res = await mqttRequest<any>('esp32', 'list-boards', {});
    esp32Store.update(s => ({ ...s, boards: res.data?.boards || [] }));
  } catch (err: any) {
    console.warn('[ESP32] loadBoards failed:', err.message || err);
  }
}

export async function createProject(data: {
  project_name: string;
  template: string;
  board?: string;
  framework?: string;
  vars?: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await mqttRequest<any>('esp32', 'create-project', data);
    await loadProjects();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error creando proyecto' };
  }
}

export async function deleteProject(name: string): Promise<boolean> {
  try {
    await mqttRequest<any>('esp32', 'delete-project', { project_name: name, confirm: true });
    esp32Store.update(s => ({
      ...s,
      projects: s.projects.filter(p => p.name !== name),
      selectedProject: s.selectedProject === name ? null : s.selectedProject,
      projectDetail: s.selectedProject === name ? null : s.projectDetail
    }));
    return true;
  } catch {
    return false;
  }
}

export async function buildProject(name: string, clean = false): Promise<boolean> {
  try {
    await mqttRequest<any>('esp32', 'build', { project_name: name, clean });
    // El build es async (202), ahora polleamos status
    pollBuildStatus(name);
    return true;
  } catch {
    return false;
  }
}

export async function loadBuildStatus(name: string): Promise<void> {
  try {
    const res = await mqttRequest<any>('esp32', 'build-status', { project_name: name });
    esp32Store.update(s => ({ ...s, buildStatus: res.data || null }));
  } catch {}
}

let buildPollTimer: ReturnType<typeof setTimeout> | null = null;

function pollBuildStatus(name: string): void {
  if (buildPollTimer) clearTimeout(buildPollTimer);

  async function poll() {
    const res = await mqttRequest<any>('esp32', 'build-status', { project_name: name }).catch(() => null);
    if (!res) return;

    esp32Store.update(s => ({ ...s, buildStatus: res.data || null }));

    if (res.data?.status === 'building') {
      buildPollTimer = setTimeout(poll, 2000);
    } else {
      buildPollTimer = null;
      // Reload project detail to get binary info
      loadProjectDetail(name);
      loadProjects();
    }
  }

  poll();
}

// =============================================================================
// FIRMWARE (firmware-manager — reutilizado)
// =============================================================================

export async function loadFirmwareCatalog(): Promise<void> {
  try {
    const res = await mqttRequest<any>('firmware', 'list', {});
    esp32Store.update(s => ({
      ...s,
      firmwareTypes: res.data?.types || []
    }));
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

export async function loadRollbackDevices(): Promise<void> {
  try {
    const res = await mqttRequest<any>('firmware', 'rollback-list', {});
    esp32Store.update(s => ({
      ...s,
      rollbackDevices: res.data?.devices || []
    }));
  } catch {}
}

export async function rollbackDevice(deviceId: string, type: string): Promise<boolean> {
  try {
    await mqttRequest<any>('firmware', 'rollback', { device_id: deviceId, type });
    await Promise.all([loadOtaStatus(), loadRollbackDevices()]);
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
    if (res.data?.flash_id) {
      pollFlashStatus(res.data.flash_id);
    }
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
      esp32Store.update(s => ({
        ...s,
        activeFlashes: [res.data]
      }));
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
    loadTemplates(),
    loadProjects(),
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
    mqttSubscribe('esp32.build_completed', () => { loadProjects(); }),
    mqttSubscribe('esp32.build_failed', () => { loadProjects(); }),
    mqttSubscribe('esp32.project_created', () => { loadProjects(); })
  );

  // Firmware/OTA events
  cleanups.push(
    mqttSubscribe('firmware.ota_completed', () => { loadOtaStatus(); loadRollbackDevices(); }),
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

export function boardIcon(board: string): string {
  if (board.includes('p4')) return '🖥';
  if (board.includes('s3')) return '🚀';
  if (board.includes('c3') || board.includes('c6')) return '📡';
  return '⚡';
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
