/**
 * Carta Marketing Store — Perfil de marca + actividad
 *
 * El perfil se construye conversando con el agente onboarding.
 * Este store expone vistas de lectura y ediciones puntuales.
 */

import { writable, derived } from 'svelte/store';
import { mqttRequest, MqttTimeoutError, MqttRequestError } from '$lib/ui-core/mqtt-request';
import { getActiveProject } from '$lib/stores/workspace';

// =============================================================================
// TYPES
// =============================================================================

export interface PerfilMarca {
  nombre: string | null;
  tono: string | null;
  idioma: string;
  publico: string | null;
  valores: string | null;
  colores: Record<string, string>;
  prohibido: string | null;
  referencia_visual: string | null;
  notas: string[];
  onboarding_completado: boolean;
  created_at: string;
  updated_at: string;
}

export interface MarketingActividad {
  project_id: string;
  cartas_procesadas: number;
  perfil_completado: boolean;
}

export interface MarketingState {
  perfil: PerfilMarca | null;
  actividad: MarketingActividad | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

// =============================================================================
// STORE
// =============================================================================

const initial: MarketingState = {
  perfil: null,
  actividad: null,
  loading: false,
  saving: false,
  error: null
};

export const marketingStore = writable<MarketingState>(initial);

// =============================================================================
// ACTIONS
// =============================================================================

export async function loadPerfil(): Promise<void> {
  marketingStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const project = getActiveProject();
    const res = await mqttRequest<PerfilMarca>('carta-marketing', 'perfil', {
      project_id: project?.id
    });
    marketingStore.update(s => ({ ...s, perfil: res.data, loading: false }));
  } catch (error) {
    marketingStore.update(s => ({
      ...s, loading: false, error: getErrorMessage(error)
    }));
  }
}

export async function loadActividad(): Promise<void> {
  try {
    const project = getActiveProject();
    const res = await mqttRequest<MarketingActividad>('carta-marketing', 'actividad', {
      project_id: project?.id
    });
    marketingStore.update(s => ({ ...s, actividad: res.data }));
  } catch (error) {
    console.error('[Marketing] Actividad failed:', getErrorMessage(error));
  }
}

export async function updatePerfil(campos: Partial<PerfilMarca>): Promise<boolean> {
  marketingStore.update(s => ({ ...s, saving: true, error: null }));
  try {
    const project = getActiveProject();
    // La tool del backend es via agente, pero aquí actualizamos vía request directo
    // El backend expone marketing.update_perfil como tool; tampoco hay UI handler directo.
    // Usamos el handler genérico invocando el tool a través del bus.
    await mqttRequest('carta-marketing', 'update-perfil', {
      project_id: project?.id,
      ...campos
    });
    await loadPerfil();
    marketingStore.update(s => ({ ...s, saving: false }));
    return true;
  } catch (error) {
    marketingStore.update(s => ({
      ...s, saving: false, error: getErrorMessage(error)
    }));
    return false;
  }
}

export function clearError(): void {
  marketingStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// DERIVED
// =============================================================================

export const perfil = derived(marketingStore, $s => $s.perfil);
export const actividad = derived(marketingStore, $s => $s.actividad);
export const marketingLoading = derived(marketingStore, $s => $s.loading);
export const marketingSaving = derived(marketingStore, $s => $s.saving);
export const marketingError = derived(marketingStore, $s => $s.error);

export const onboardingCompletado = derived(marketingStore, $s =>
  $s.perfil?.onboarding_completado ?? false
);

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) return 'Timeout';
  if (error instanceof MqttRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}
