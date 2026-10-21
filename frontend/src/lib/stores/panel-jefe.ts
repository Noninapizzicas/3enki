/**
 * Store PanelJefe — cara AGREGADA / rol FUTURO del taller 3D.
 *
 * Refleja el estado del backend (módulo backend `panel-jefe`):
 *   - resumen → visión de conjunto (impresión actual + cola + filamento +
 *               consumo/eficiencia + historial, best-effort)
 *   - propuestas → orden propuesto por el motor (PROPUESTA ≠ DECISIÓN)
 *   - aprobar_propuesta → el jefe aprueba → cola.reordenar (delega)
 *   - marcar_prioridad → marcar urgencia → cola.marcar_urgente (delega)
 *   - pedir_reposicion → pedir filamento (delega)
 *   - ver_detalle → detalle de un modelo
 * El jefe ve FUTURO y DECIDE; cada acción de decisión DELEGA por RPC y espera la
 * voz del dueño. CERO control de máquina (eso es panel-trabajador). CERO juicio:
 * el sistema proyecta y transporta, nunca decide.
 */
import { writable, derived } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES
// =============================================================================

export interface ResumenTaller {
  impresion_actual?: Record<string, unknown> | null;
  cola?: unknown[] | null;
  filamento?: Record<string, unknown> | null;
  consumo?: unknown[] | null;
  historial?: unknown[] | null;
  [key: string]: unknown;
}

export interface PropuestaOrdenItem {
  id?: string;
  tarea_id?: string;
  nombre?: string;
  [key: string]: unknown;
}

interface PanelJefeState {
  resumen: ResumenTaller | null;
  propuestas: PropuestaOrdenItem[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  resultado: { type: 'ok' | 'error' | 'info'; message: string } | null;
}

const initialState: PanelJefeState = {
  resumen: null,
  propuestas: [],
  loading: false,
  saving: false,
  error: null,
  resultado: null
};

// =============================================================================
// STORE
// =============================================================================

export const panelJefeStore = writable<PanelJefeState>(initialState);

// =============================================================================
// DERIVADOS
// =============================================================================

export const resumenTaller = derived(panelJefeStore, $s => $s.resumen);
export const propuestasOrden = derived(panelJefeStore, $s => $s.propuestas);

// =============================================================================
// ACCIONES (reflejan / delegan)
// =============================================================================

export async function loadResumen(projectId: string, n = 10): Promise<void> {
  if (!projectId) return;
  try {
    const res = await mqttRequest<any>('panel-jefe', 'resumen', { project_id: projectId, n });
    panelJefeStore.update(s => ({
      ...s, resumen: (res?.data && typeof res.data === 'object') ? res.data : null, error: null
    }));
  } catch (err: any) {
    panelJefeStore.update(s => ({ ...s, error: `resumen: ${err.message}` }));
  }
}

export async function loadPropuestas(projectId: string): Promise<void> {
  if (!projectId) return;
  try {
    const res = await mqttRequest<any>('panel-jefe', 'propuestas', { project_id: projectId });
    const data = res?.data as any;
    const lista = data?.propuestas || data?.reorden || data?.orden || [];
    panelJefeStore.update(s => ({ ...s, propuestas: Array.isArray(lista) ? lista : [] }));
  } catch { /* best-effort */ }
}

/** Aprueba una propuesta → cola.reordenar. SOLO con decisión humana. */
export async function aprobarPropuesta(
  projectId: string,
  orden: unknown,
  jefe = 'panel-jefe'
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!projectId) return { success: false, error: 'Selecciona un proyecto' };
  panelJefeStore.update(s => ({ ...s, saving: true, error: null }));
  try {
    const res = await mqttRequest<any>('panel-jefe', 'aprobar_propuesta', { project_id: projectId, orden, jefe });
    panelJefeStore.update(s => ({
      ...s, saving: false,
      resultado: { type: 'ok', message: 'Propuesta aprobada → cola reordenada' }
    }));
    void loadPropuestas(projectId);
    return { success: true, message: res?.data?.message };
  } catch (err: any) {
    panelJefeStore.update(s => ({
      ...s, saving: false,
      error: `aprobar_propuesta: ${err.message}`,
      resultado: { type: 'error', message: err.message || 'fallo al aprobar' }
    }));
    return { success: false, error: err.message };
  }
}

/** Marca urgencia/prioridad de una tarea → cola.marcar_urgente. */
export async function marcarPrioridad(
  projectId: string,
  id: string,
  urgente: 'true' | 'false' = 'true'
): Promise<{ success: boolean; error?: string }> {
  if (!projectId || !id) return { success: false, error: 'Tarea y proyecto requeridos' };
  panelJefeStore.update(s => ({ ...s, saving: true, error: null }));
  try {
    await mqttRequest<any>('panel-jefe', 'marcar_prioridad', { project_id: projectId, id, urgente });
    panelJefeStore.update(s => ({
      ...s, saving: false,
      resultado: { type: 'ok', message: urgente === 'true' ? 'Tarea marcada como urgente' : 'Prioridad normalizada' }
    }));
    void loadPropuestas(projectId);
    return { success: true };
  } catch (err: any) {
    panelJefeStore.update(s => ({
      ...s, saving: false,
      error: `marcar_prioridad: ${err.message}`,
      resultado: { type: 'error', message: err.message || 'fallo al marcar' }
    }));
    return { success: false, error: err.message };
  }
}

/** Pide reposición de filamento → adaptador-confirmacion.confirmar. */
export async function pedirReposicion(
  projectId: string,
  data: { confirmacion_id?: string; bobina_id?: string }
): Promise<{ success: boolean; error?: string }> {
  if (!projectId) return { success: false, error: 'Selecciona un proyecto' };
  panelJefeStore.update(s => ({ ...s, saving: true, error: null }));
  try {
    await mqttRequest<any>('panel-jefe', 'pedir_reposicion', { project_id: projectId, ...data });
    panelJefeStore.update(s => ({
      ...s, saving: false,
      resultado: { type: 'ok', message: 'Reposición solicitada' }
    }));
    return { success: true };
  } catch (err: any) {
    panelJefeStore.update(s => ({
      ...s, saving: false,
      error: `pedir_reposicion: ${err.message}`,
      resultado: { type: 'error', message: err.message || 'fallo al pedir reposición' }
    }));
    return { success: false, error: err.message };
  }
}

export async function initPanelJefe(projectId: string): Promise<void> {
  if (!projectId) { panelJefeStore.update(s => ({ ...s, loading: true })); return; }
  panelJefeStore.update(s => ({ ...s, loading: true }));
  await Promise.all([loadResumen(projectId, 10), loadPropuestas(projectId)]);
  panelJefeStore.update(s => ({ ...s, loading: false }));
}

/** refresh_on: cola.actualizada | pieza.imprimida | impresion.registrada | material.actualizado. */
export function initPanelJefeSubscriptions(projectId: string): () => void {
  const cleanups: (() => void)[] = [];
  const refreshEvents = [
    'cola.actualizada',
    'pieza.imprimida',
    'impresion.registrada',
    'material.actualizado'
  ];
  for (const ev of refreshEvents) {
    cleanups.push(mqttSubscribe(ev, () => {
      void loadResumen(projectId, 10);
      void loadPropuestas(projectId);
    }));
  }
  return () => cleanups.forEach(fn => fn());
}

export function resetPanelJefeStore(): void {
  panelJefeStore.set(initialState);
}
