/**
 * Store Catalogo — CUSTODIO de la biblioteca de piezas del taller 3D.
 *
 * Refleja el estado del backend (módulo backend `catalogo`):
 *   - listar   → biblioteca de fichas (multiformato: STL/3MF/GCODE)
 *   - por_id   → detalle de una ficha
 *   - registrar→ alta de ficha (reconcilia antes de crear; NO duplica)
 *   - actualizar→ edición/merge de ficha existente
 * Se suscribe a `modelo.registrado` (refresh_on) para mantenerse coherente.
 * Reflejo puro: no calcula, no persiste — solo refleja el estado del backend.
 */
import { writable, derived } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES (reflejan el contrato del backend)
// =============================================================================

export interface ModeloFicha {
  id: string;
  nombre: string;
  uso?: string;
  filamento_sug?: string;
  fuente?: string;
  origenUrl?: string;
  archivo_stl?: string;
  archivo_3mf?: string;
  archivo_gcode?: string;
  formato_dispon?: string;
  creado_en?: string;
  [key: string]: unknown;
}

interface CatalogoState {
  fichas: ModeloFicha[];
  selected: ModeloFicha | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  resultado: { type: 'ok' | 'error' | 'info'; message: string } | null;
}

const initialState: CatalogoState = {
  fichas: [],
  selected: null,
  loading: false,
  saving: false,
  error: null,
  resultado: null
};

// =============================================================================
// STORE (writable) — sólo este archivo escribe
// =============================================================================

export const catalogoStore = writable<CatalogoState>(initialState);

// =============================================================================
// DERIVADOS (readonly para componentes)
// =============================================================================

export const fichasCatalogo = derived(catalogoStore, $s => $s.fichas);
export const catalogoLoading = derived(catalogoStore, $s => $s.loading);
export const catalogoSaving = derived(catalogoStore, $s => $s.saving);
export const catalogoError = derived(catalogoStore, $s => $s.error);
export const catalogoCount = derived(catalogoStore, $s => $s.fichas.length);
export const fichaSeleccionada = derived(catalogoStore, $s => $s.selected);

// =============================================================================
// ACCIONES (reflejan, no calculan)
// =============================================================================

/** Lista la biblioteca completa del proyecto (una fuente de verdad por ficha). */
export async function listarBiblioteca(projectId: string): Promise<void> {
  if (!projectId) return;
  catalogoStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const res = await mqttRequest<any>('catalogo', 'listar', { project_id: projectId });
    const fichas = res?.data?.modelos || res?.data?.fichas || res?.data || [];
    catalogoStore.update(s => ({
      ...s,
      fichas: Array.isArray(fichas) ? fichas : [],
      loading: false
    }));
  } catch (err: any) {
    catalogoStore.update(s => ({
      ...s,
      loading: false,
      fichas: [],
      error: `Listar biblioteca: ${err.message || 'sin respuesta del backend'}`
    }));
  }
}

/** Detalle de una ficha por id. */
export async function porId(projectId: string, modelo_id: string): Promise<ModeloFicha | null> {
  if (!projectId || !modelo_id) return null;
  catalogoStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const res = await mqttRequest<any>('catalogo', 'por_id', { project_id: projectId, modelo_id });
    const ficha = res?.data;
    catalogoStore.update(s => ({
      ...s,
      selected: (ficha && typeof ficha === 'object') ? ficha : null,
      loading: false
    }));
    return (ficha && typeof ficha === 'object') ? ficha : null;
  } catch (err: any) {
    catalogoStore.update(s => ({ ...s, loading: false, error: `Ver ficha: ${err.message}` }));
    return null;
  }
}

/** Registra una ficha nueva (reconcilia antes de crear; NO duplica). */
export async function registrarModelo(
  projectId: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  if (!projectId) return { success: false, error: 'Selecciona un proyecto' };
  catalogoStore.update(s => ({ ...s, saving: true, error: null, resultado: { type: 'info', message: 'Registrando…' } }));
  try {
    const res = await mqttRequest<any>('catalogo', 'registrar', { project_id: projectId, ...data });
    catalogoStore.update(s => ({
      ...s,
      saving: false,
      resultado: { type: 'ok', message: 'Modelo registrado' }
    }));
    void listarBiblioteca(projectId);
    return { success: true };
  } catch (err: any) {
    catalogoStore.update(s => ({
      ...s,
      saving: false,
      error: `Registrar: ${err.message || 'fallo'}`,
      resultado: { type: 'error', message: err.message || 'fallo al registrar' }
    }));
    return { success: false, error: err.message };
  }
}

/** Actualiza/mergea una ficha existente (no re-crea). */
export async function actualizarFicha(
  projectId: string,
  modelo_id: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  if (!projectId || !modelo_id) return { success: false, error: 'Selecciona ficha y proyecto' };
  catalogoStore.update(s => ({ ...s, saving: true, error: null, resultado: { type: 'info', message: 'Actualizando…' } }));
  try {
    await mqttRequest<any>('catalogo', 'actualizar', { project_id: projectId, modelo_id, ...data });
    catalogoStore.update(s => ({
      ...s,
      saving: false,
      resultado: { type: 'ok', message: 'Ficha actualizada' }
    }));
    void listarBiblioteca(projectId);
    return { success: true };
  } catch (err: any) {
    catalogoStore.update(s => ({
      ...s,
      saving: false,
      error: `Actualizar: ${err.message || 'fallo'}`,
      resultado: { type: 'error', message: err.message || 'fallo al actualizar' }
    }));
    return { success: false, error: err.message };
  }
}

// =============================================================================
// SUSCRIPCIONES TIEMPO REAL (refresh_on: modelo.registrado)
// =============================================================================

export function initCatalogoSubscriptions(projectId: string): () => void {
  return () => { void listarBiblioteca(projectId); };
}

// =============================================================================
// RESET
// =============================================================================

export function resetCatalogoStore(): void {
  catalogoStore.set(initialState);
}
