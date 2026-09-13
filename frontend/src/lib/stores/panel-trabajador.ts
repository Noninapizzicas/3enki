/**
 * Store PanelTrabajador — cara OPERATIVA / rol HOY del taller 3D.
 *
 * Refleja el estado del backend (módulo backend `panel-trabajador`):
 *   - estado_vivo → qué imprime ahora (pieza, progreso, fase del ciclo)
 *   - proximo_encadenar → la siguiente cabecera lista
 *   - eventos → cinta de eventos reciente del taller
 *   - pendientes → confirmaciones que aguardan al dueño
 *   - control → comandos HOY que DELEGAN (pausar/abortar/reanudar/reintentar/
 *               saltar/cambio_bobina/confirmar)
 * Refresco en vivo por refresh_on: cola.actualizada | impresion.* | material.actualizado.
 * El trabajador opera HOY; sus botones son de CONTROL (delegan), NO de decisión futura.
 */
import { writable, derived } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES
// =============================================================================

export interface EstadoVivo {
  fase?: string;
  pieza?: string;
  progreso?: number;
  filamento?: string;
  [key: string]: unknown;
}

export interface ProximaEncadenar {
  tarea_id?: string;
  nombre?: string;
  [key: string]: unknown;
}

export interface EventoTaller {
  id?: string;
  tipo?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface PendienteConfirmacion {
  confirmacion_id?: string;
  tipo?: string;
  [key: string]: unknown;
}

export type ControlAccion =
  | 'pausar' | 'abortar' | 'reanudar'
  | 'reintentar' | 'saltar'
  | 'cambio_bobina' | 'confirmar';

interface PanelTrabajadorState {
  estado: EstadoVivo | null;
  proxima: ProximaEncadenar | null;
  eventos: EventoTaller[];
  pendientes: PendienteConfirmacion[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  resultado: { type: 'ok' | 'error' | 'info'; message: string } | null;
}

const initialState: PanelTrabajadorState = {
  estado: null,
  proxima: null,
  eventos: [],
  pendientes: [],
  loading: false,
  saving: false,
  error: null,
  resultado: null
};

// =============================================================================
// STORE
// =============================================================================

export const panelTrabajadorStore = writable<PanelTrabajadorState>(initialState);

// =============================================================================
// DERIVADOS
// =============================================================================

export const estadoVivo = derived(panelTrabajadorStore, $s => $s.estado);
export const proximaEncadenar = derived(panelTrabajadorStore, $s => $s.proxima);
export const eventosTaller = derived(panelTrabajadorStore, $s => $s.eventos);
export const pendientesConfirmacion = derived(panelTrabajadorStore, $s => $s.pendientes);

// =============================================================================
// ACCIONES (reflejan, delegan)
// =============================================================================

export async function loadEstadoVivo(projectId: string): Promise<void> {
  if (!projectId) return;
  try {
    const res = await mqttRequest<any>('panel-trabajador', 'estado_vivo', { project_id: projectId });
    panelTrabajadorStore.update(s => ({
      ...s, estado: (res?.data && typeof res.data === 'object') ? res.data : null, error: null
    }));
  } catch (err: any) {
    panelTrabajadorStore.update(s => ({ ...s, error: `estado_vivo: ${err.message}` }));
  }
}

export async function loadProximaEncadenar(projectId: string): Promise<void> {
  if (!projectId) return;
  try {
    const res = await mqttRequest<any>('panel-trabajador', 'proximo_encadenar', { project_id: projectId });
    panelTrabajadorStore.update(s => ({
      ...s, proxima: (res?.data && typeof res.data === 'object') ? res.data : null
    }));
  } catch { /* best-effort: hueco -> 'desconocido' */ }
}

export async function loadEventos(projectId: string, n = 10): Promise<void> {
  if (!projectId) return;
  try {
    const res = await mqttRequest<any>('panel-trabajador', 'eventos', { project_id: projectId, n });
    const eventos = (res?.data as any)?.eventos || res?.data?.recientes || [];
    panelTrabajadorStore.update(s => ({ ...s, eventos: Array.isArray(eventos) ? eventos : [] }));
  } catch { /* best-effort */ }
}

export async function loadPendientes(projectId: string): Promise<void> {
  if (!projectId) return;
  try {
    const res = await mqttRequest<any>('panel-trabajador', 'pendientes', { project_id: projectId });
    const pend = (res?.data as any)?.pendientes || res?.data || [];
    panelTrabajadorStore.update(s => ({ ...s, pendientes: Array.isArray(pend) ? pend : [] }));
  } catch { /* best-effort */ }
}

/** Comando operativo HOY. DELEGA por RPC y espera la voz del dueño. */
export async function enviarControl(
  projectId: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  if (!projectId) return { success: false, error: 'Selecciona un proyecto' };
  panelTrabajadorStore.update(s => ({ ...s, saving: true, error: null }));
  try {
    await mqttRequest<any>('panel-trabajador', 'control', { project_id: projectId, ...data });
    panelTrabajadorStore.update(s => ({
      ...s, saving: false,
      resultado: { type: 'ok', message: `Comando ${data.accion ?? ''} enviado` }
    }));
    // refresco en vivo tras operar
    void loadEstadoVivo(projectId);
    void loadPendientes(projectId);
    return { success: true };
  } catch (err: any) {
    panelTrabajadorStore.update(s => ({
      ...s, saving: false, error: `control: ${err.message}`,
      resultado: { type: 'error', message: err.message || 'fallo en el comando' }
    }));
    return { success: false, error: err.message };
  }
}

export async function initPanelTrabajador(projectId: string): Promise<void> {
  if (!projectId) { panelTrabajadorStore.update(s => ({ ...s, loading: true })); return; }
  panelTrabajadorStore.update(s => ({ ...s, loading: true }));
  await Promise.all([
    loadEstadoVivo(projectId),
    loadProximaEncadenar(projectId),
    loadEventos(projectId, 10),
    loadPendientes(projectId)
  ]);
  panelTrabajadorStore.update(s => ({ ...s, loading: false }));
}

/** refresh_on: cola.actualizada | impresion.* | material.actualizado (fire-and-forget). */
export function initPanelTrabajadorSubscriptions(projectId: string): () => void {
  const cleanups: (() => void)[] = [];
  const refreshEvents = [
    'cola.actualizada',
    'impresion.iniciada',
    'impresion.finalizada',
    'impresion.fallida',
    'material.actualizado'
  ];
  for (const ev of refreshEvents) {
    cleanups.push(mqttSubscribe(ev, () => {
      void loadEstadoVivo(projectId);
      void loadPendientes(projectId);
      void loadEventos(projectId, 10);
    }));
  }
  return () => cleanups.forEach(fn => fn());
}

export function resetPanelTrabajadorStore(): void {
  panelTrabajadorStore.set(initialState);
}
