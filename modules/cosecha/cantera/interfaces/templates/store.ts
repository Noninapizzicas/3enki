// ─────────────────────────────────────────────
// TEMPLATE: Store MQTT para POS
// Copia este archivo a stores/<midominio>.ts
// y busca/reemplaza "Midominio" / "midominio"
// ─────────────────────────────────────────────
import { writable, derived, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core';

// ── Tipos ──
export interface MidominioItem {
  id: string;
  nombre: string;
  // AÑADE tus campos aquí
}

interface MidominioState {
  items: MidominioItem[];
  selected: MidominioItem | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

const initialState: MidominioState = {
  items: [],
  selected: null,
  loading: false,
  saving: false,
  error: null
};

// ── Store ──
export const midominioStore = writable<MidominioState>(initialState);

// ── Derivados (solo lectura para componentes) ──
export const midominioItems    = derived(midominioStore, $s => $s.items);
export const midominioSelected = derived(midominioStore, $s => $s.selected);
export const midominioLoading  = derived(midominioStore, $s => $s.loading);
export const midominioSaving   = derived(midominioStore, $s => $s.saving);
export const midominioError    = derived(midominioStore, $s => $s.error);
export const midominioCount    = derived(midominioStore, $s => $s.items.length);

// ── Acciones ──
export async function loadMidominio(projectId: string): Promise<void> {
  midominioStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const res = await mqttRequest('midominio', 'list', { project_id: projectId });
    const data = (res?.data as any)?.items || (res?.data as any) || [];
    const items = Array.isArray(data) ? data : (data?.items || []);
    midominioStore.update(s => ({ ...s, items, loading: false }));
  } catch (err: any) {
    midominioStore.update(s => ({
      ...s, loading: false,
      error: err?.message || 'Error al cargar'
    }));
  }
}

export async function createMidominio(
  projectId: string,
  nombre: string,
  extras: Record<string, any> = {}
): Promise<{ success: boolean; error?: string }> {
  midominioStore.update(s => ({ ...s, saving: true, error: null }));
  try {
    const res = await mqttRequest('midominio', 'create', {
      project_id: projectId, nombre, ...extras
    });
    if (res?.status === 201 || res?.status === 200) {
      // Refrescar lista
      await loadMidominio(projectId);
      midominioStore.update(s => ({ ...s, saving: false }));
      return { success: true };
    }
    throw new Error(res?.error || 'Error al crear');
  } catch (err: any) {
    midominioStore.update(s => ({
      ...s, saving: false,
      error: err?.message || 'Error al crear'
    }));
    return { success: false, error: err?.message };
  }
}

export async function deleteMidominio(
  projectId: string, itemId: string
): Promise<boolean> {
  try {
    await mqttRequest('midominio', 'delete', {
      project_id: projectId, id: itemId
    });
    await loadMidominio(projectId);
    return true;
  } catch {
    return false;
  }
}

// ── Suscripciones tiempo real ──
export function initMidominioSubscriptions(projectId: string): () => void {
  const cleanups: (() => void)[] = [];

  // Reaccionar a eventos externos
  for (const ev of ['midominio.creado', 'midominio.eliminado', 'midominio.actualizado']) {
    cleanups.push(
      mqttSubscribe(ev, (event: any) => {
        const data = event?.data || event?.payload || event;
        if (data?.project_id && data.project_id !== projectId) return;
        loadMidominio(projectId);
      })
    );
  }

  // Carga inicial
  loadMidominio(projectId);

  return () => cleanups.forEach(fn => fn());
}

// ── Reset ──
export function resetMidominio(): void {
  midominioStore.set(initialState);
}
