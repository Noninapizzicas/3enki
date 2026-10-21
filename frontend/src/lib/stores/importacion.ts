/**
 * Store Importacion — CONVERSOR multi-formato del taller 3D (chat_tool).
 *
 * Refleja (acción puntual desde el chat):
 *   - importar        → sube/normaliza/entrega un archivo externo (STL/3MF/GCODE)
 *   - leer_metadatos  → previsualiza metadatos del archivo antes de importar
 * GCODE va a la cúpula (ArchivoPreparado); STL/3MF al catálogo como ficha.
 * CERO juicio: no decide qué pieza imprimir; solo normaliza y entrega.
 */
import { writable, derived } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES
// =============================================================================

export interface MetadatosArchivo {
  nombre?: string;
  unidades?: string;
  material?: string | null;
  formatos?: string[];
  dimensiones?: string;
  [key: string]: unknown;
}

export type ImportarFormato = 'STL' | '3MF' | 'GCODE';

interface ImportacionState {
  metadatos: MetadatosArchivo | null;
  loading: boolean;
  importando: boolean;
  error: string | null;
  resultado: { type: 'ok' | 'error' | 'info'; message: string } | null;
}

const initialState: ImportacionState = {
  metadatos: null,
  loading: false,
  importando: false,
  error: null,
  resultado: null
};

// =============================================================================
// STORE
// =============================================================================

export const importacionStore = writable<ImportacionState>(initialState);

// =============================================================================
// DERIVADOS
// =============================================================================

export const metadatosArchivo = derived(importacionStore, $s => $s.metadatos);
export const importacionImportando = derived(importacionStore, $s => $s.importando);
export const importacionError = derived(importacionStore, $s => $s.error);

// =============================================================================
// ACCIONES (reflejan, no calculan)
// =============================================================================

/** Lee metadatos de un archivo por formato antes de importar. */
export async function leerMetadatos(
  projectId: string,
  archivo: string,
  formato?: string
): Promise<MetadatosArchivo | null> {
  if (!projectId || !archivo) return null;
  importacionStore.update(s => ({ ...s, loading: true, error: null }));
  const payload: Record<string, unknown> = { project_id: projectId, archivo };
  if (formato) payload.formato = formato;
  try {
    const res = await mqttRequest<any>('importacion', 'leer_metadatos', payload, { timeout: 12000 });
    const data = res?.data;
    importacionStore.update(s => ({
      ...s,
      metadatos: (data && typeof data === 'object') ? data : (data?.metadatos ?? null),
      loading: false,
      resultado: null
    }));
    return (data && typeof data === 'object') ? data : (data?.metadatos ?? null);
  } catch (err: any) {
    importacionStore.update(s => ({
      ...s, loading: false, error: `leer_metadatos: ${err.message}`, metadatos: null
    }));
    return null;
  }
}

/** Importa un archivo externo (feedback por señal en_progreso → importada/fallida). */
export async function importarArchivo(
  projectId: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  if (!projectId) return { success: false, error: 'Selecciona un proyecto' };
  importacionStore.update(s => ({
    ...s, importando: true, error: null,
    resultado: { type: 'info', message: 'Importando… (señal en_progreso)' }
  }));
  try {
    const res = await mqttRequest<any>('importacion', 'importar', { project_id: projectId, ...data }, { timeout: 12000 });
    importacionStore.update(s => ({
      ...s, importando: false,
      resultado: { type: 'ok', message: '✅ Modelo importado' }
    }));
    return { success: true, data: res?.data };
  } catch (err: any) {
    importacionStore.update(s => ({
      ...s, importando: false,
      error: `importar: ${err.message}`,
      resultado: { type: 'error', message: `❌ Importación fallida: ${err.message}` }
    }));
    return { success: false, error: err.message };
  }
}

export function resetImportacionStore(): void {
  importacionStore.set(initialState);
}
