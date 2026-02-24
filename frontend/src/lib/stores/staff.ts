/**
 * Staff Store — Estado y operaciones del módulo staff-manager
 *
 * Domain MQTT: 'staff-manager'
 * Actions: employee.list/create/update/delete, session.tap_in/tap_out/active/stale/history
 *
 * Patrón: writable con funciones de carga; sin reactividad automática (se refresca al montar).
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';

const DOMAIN = 'staff-manager';

// =============================================================================
// TYPES
// =============================================================================

export interface Employee {
  id: string;
  name: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShiftSession {
  id: string;
  employee_id: string;
  device_id?: string;
  tap_in_at: string;
  tap_out_at?: string;
  close_reason?: string;
  session_token: string;
  created_at: string;
  duration_minutes?: number;
  open_hours?: number;
  employee?: Employee;
}

export interface NfcCardPayload {
  v: number;
  type: string;
  emp_id?: string;
  name?: string;
  role?: string;
  core_id?: string;
  endpoint?: string;
  pub?: string;
  fp?: string;
  issued?: string;
}

export interface StaffState {
  employees: Employee[];
  activeSessions: ShiftSession[];
  staleSessions: ShiftSession[];
  loading: boolean;
  error: string | null;
}

// =============================================================================
// STORES
// =============================================================================

const _state = writable<StaffState>({
  employees:      [],
  activeSessions: [],
  staleSessions:  [],
  loading:        false,
  error:          null
});

export const staffState   = { subscribe: _state.subscribe };
export const employees    = derived(_state, s => s.employees);
export const activeSessions = derived(_state, s => s.activeSessions);
export const staleSessions  = derived(_state, s => s.staleSessions);
export const loading      = derived(_state, s => s.loading);
export const staffError   = derived(_state, s => s.error);

// =============================================================================
// HELPERS
// =============================================================================

function setLoading(v: boolean) {
  _state.update(s => ({ ...s, loading: v }));
}
function setError(msg: string | null) {
  _state.update(s => ({ ...s, error: msg }));
}

/** Tiempo de turno activo en texto legible: "3h 24m" */
export function formatDuration(tapInAt: string): string {
  const ms = Date.now() - new Date(tapInAt).getTime();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Rol en español con primera letra mayúscula */
export function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// =============================================================================
// EMPLOYEE ACTIONS
// =============================================================================

export async function loadEmployees(active_only = true): Promise<void> {
  setLoading(true);
  setError(null);
  try {
    const res = await mqttRequest<{ employees: Employee[] }>(
      DOMAIN, 'employee.list', { query: { active_only: String(active_only) } }
    );
    _state.update(s => ({ ...s, employees: res.data.employees ?? [] }));
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Error cargando empleados');
  } finally {
    setLoading(false);
  }
}

export async function createEmployee(data: { name: string; role: string; pin?: string }): Promise<Employee> {
  const res = await mqttRequest<Employee>(DOMAIN, 'employee.create', { body: data });
  await loadEmployees();
  return res.data;
}

export async function updateEmployee(id: string, data: Partial<Pick<Employee, 'name' | 'role' | 'active'> & { pin?: string }>): Promise<Employee> {
  const res = await mqttRequest<Employee>(DOMAIN, 'employee.update', { params: { id }, body: data });
  await loadEmployees();
  return res.data;
}

export async function deleteEmployee(id: string): Promise<void> {
  await mqttRequest(DOMAIN, 'employee.delete', { params: { id } });
  await loadEmployees();
}

// =============================================================================
// SESSION ACTIONS
// =============================================================================

export async function loadActiveSessions(): Promise<void> {
  try {
    const res = await mqttRequest<{ sessions: ShiftSession[] }>(DOMAIN, 'session.active');
    _state.update(s => ({ ...s, activeSessions: res.data.sessions ?? [] }));
  } catch {
    // silencioso — el board se actualiza sólo en las acciones
  }
}

export async function loadStaleSessions(): Promise<void> {
  try {
    const res = await mqttRequest<{ sessions: ShiftSession[]; max_shift_hours: number }>(
      DOMAIN, 'session.stale'
    );
    _state.update(s => ({ ...s, staleSessions: res.data.sessions ?? [] }));
  } catch {
    // silencioso
  }
}

/** Carga empleados + sesiones activas + sesiones irregulares en paralelo */
export async function loadAll(): Promise<void> {
  setLoading(true);
  setError(null);
  try {
    await Promise.all([loadEmployees(), loadActiveSessions(), loadStaleSessions()]);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Error de carga');
  } finally {
    setLoading(false);
  }
}

export async function tapIn(employee_id: string): Promise<{ already_active: boolean }> {
  const res = await mqttRequest<{ already_active: boolean }>(
    DOMAIN, 'session.tap_in', { body: { employee_id } }
  );
  await Promise.all([loadActiveSessions(), loadStaleSessions()]);
  return res.data;
}

export async function tapOut(employee_id: string): Promise<{ had_active: boolean; duration_minutes?: number }> {
  const res = await mqttRequest<{ had_active: boolean; duration_minutes?: number }>(
    DOMAIN, 'session.tap_out', { body: { employee_id } }
  );
  await Promise.all([loadActiveSessions(), loadStaleSessions()]);
  return res.data;
}

export async function managerClose(employee_id: string): Promise<void> {
  await mqttRequest(DOMAIN, 'session.manager_close', { body: { employee_id } });
  await Promise.all([loadActiveSessions(), loadStaleSessions()]);
}

export async function loadSessionHistory(params: { employee_id?: string; date?: string } = {}): Promise<ShiftSession[]> {
  const res = await mqttRequest<{ sessions: ShiftSession[] }>(
    DOMAIN, 'session.history', { query: params }
  );
  return res.data.sessions ?? [];
}

// =============================================================================
// NFC ACTIONS
// =============================================================================

export async function generateNfcEmployeeCard(employee_id: string): Promise<{
  payload: NfcCardPayload;
  json_string: string;
  byte_size: number;
  ntag215_capacity: number;
  fits: boolean;
}> {
  const res = await mqttRequest(DOMAIN, 'nfc.employee_card', { body: { employee_id } });
  return res.data as ReturnType<typeof generateNfcEmployeeCard> extends Promise<infer T> ? T : never;
}

// =============================================================================
// DERIVED: mapa employee_id → session activa
// =============================================================================

export const activeSessionMap = derived(activeSessions, (sessions) => {
  const map = new Map<string, ShiftSession>();
  for (const s of sessions) map.set(s.employee_id, s);
  return map;
});
