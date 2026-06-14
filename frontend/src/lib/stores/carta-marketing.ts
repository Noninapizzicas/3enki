/**
 * Carta Marketing Store — perfil de marca + actividad, lecturas+escrituras directas.
 *
 * El blueprint del modulo carta-marketing (modules/pizzepos/carta-marketing/)
 * persiste el perfil en /config/marca.json del proyecto activo.
 * Operaciones simples (get/update/actividad) van directo via fs.read/fs.write.
 * Operaciones que requieren razonamiento del LLM (completar_onboarding) las
 * pide el usuario al chat — el blueprint sigue siendo el runtime para eso.
 *
 * Patron documentado en arquitectura/decisiones/propuestas/
 * lecturas-frontend-via-fs-read.md (con extension para escrituras triviales
 * sin listeners del evento canonico).
 */

import { writable, derived, get } from 'svelte/store';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';
import { getActiveProject } from '$lib/stores/workspace';

// =============================================================================
// TYPES — shape canonico del blueprint carta-marketing
// =============================================================================

export interface PerfilMarca {
  _version?: string;
  _updated_at?: string;
  nombre_marca: string;
  lema?: string;
  tono_voz: string;
  valores: string[];
  publico_objetivo: string;
  diferenciacion?: string;
  restricciones?: string;
  idiomas: string[];
  onboarding_completado: boolean;
}

export interface MarketingActividad {
  ventana_dias: number;
  invocaciones: unknown[];
  nota?: string;
}

export interface MarketingState {
  perfil: PerfilMarca | null;
  actividad: MarketingActividad | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}


const DEFAULT_PERFIL: PerfilMarca = {
  _version: '1.0',
  nombre_marca: '',
  tono_voz: '',
  valores: [],
  publico_objetivo: '',
  idiomas: ['es'],
  onboarding_completado: false
};

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
// PRIMITIVAS — fs.read / fs.write directos
// =============================================================================

// El perfil de marca lo sirve carta-marketing (dueño de /pizzepos/marca.json). Entramos por
// SU PUERTA (ui/request/carta-marketing/<op>), no por fs directo al path viejo /config/marca.json:
// get_perfil devuelve el canónico; update_perfil hace deep-merge (no pisa secciones).
function projectId(): string | undefined {
  return getActiveProject()?.id;
}

async function readPerfil(): Promise<PerfilMarca | null> {
  try {
    const res = await mqttRequest<PerfilMarca>('carta-marketing', 'get_perfil', { project_id: projectId() });
    return (res.data as PerfilMarca) ?? null;
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') return null;
    throw err;
  }
}

// =============================================================================
// ACTIONS
// =============================================================================

export async function loadPerfil(): Promise<void> {
  marketingStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const perfil = await readPerfil();
    marketingStore.update(s => ({
      ...s,
      perfil: perfil ?? { ...DEFAULT_PERFIL, _updated_at: new Date().toISOString() },
      loading: false
    }));
  } catch (error) {
    marketingStore.update(s => ({
      ...s, loading: false, error: getErrorMessage(error)
    }));
  }
}

export async function loadActividad(): Promise<void> {
  // El blueprint hoy devuelve placeholder fijo (TRABAJO_PENDIENTE — agent-
  // observer integration). Lo sintetizamos local para evitar un round-trip
  // a backend que devuelve constante. Cuando agent-observer tenga endpoint
  // de consulta filtrado por scope='marketing', sustituimos por una lectura
  // real (probablemente fs.read de un log o mqttRequest a una tool nueva).
  marketingStore.update(s => ({
    ...s,
    actividad: {
      ventana_dias: 7,
      invocaciones: [],
      nota: 'agent-observer integracion pendiente — actividad temporalmente vacia'
    }
  }));
}

export async function updatePerfil(campos: Partial<PerfilMarca>): Promise<boolean> {
  marketingStore.update(s => ({ ...s, saving: true, error: null }));
  try {
    // Por la puerta del dueño: update_perfil hace deep-merge sobre /pizzepos/marca.json
    // (no pisa las secciones esencia/voz/... que rellena el onboarding). Devuelve el perfil ya fusionado.
    const res = await mqttRequest<PerfilMarca>('carta-marketing', 'update_perfil', {
      project_id: projectId(), campos
    });
    const next = (res.data as PerfilMarca) ?? null;

    marketingStore.update(s => ({
      ...s,
      perfil: next ?? s.perfil,
      saving: false
    }));
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
