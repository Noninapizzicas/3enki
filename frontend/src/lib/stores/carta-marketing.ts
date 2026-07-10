/**
 * Carta Marketing Store — perfil de marca + actividad.
 *
 * El perfil de marca lo sirve carta-marketing (dueño de /pizzepos/marca.json).
 * Entramos por SU PUERTA (ui/request/carta-marketing/<op>): get_perfil devuelve
 * el shape CANÓNICO de marca.schema.json (secciones esencia/voz/publico/visual/
 * negocio); update_perfil hace deep-merge por sección (no pisa lo que rellena
 * el onboarding) y devuelve el perfil ya fusionado.
 *
 * Operaciones que requieren razonamiento del LLM (completar_onboarding) las
 * pide el usuario al chat — el blueprint sigue siendo el runtime para eso.
 */

import { writable, derived } from 'svelte/store';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';
import { getActiveProject } from '$lib/stores/workspace';

// =============================================================================
// TYPES — shape canónico de marca.schema.json (arquitectura/decisiones/_schemas/marca)
// =============================================================================

export interface PerfilEsencia {
  nombre: string;
  lema?: string;
  proposito?: string;
  valores: string[];
}

export interface PerfilVoz {
  tono: string[];
  registro?: string;
  referencias?: string[];
  si?: string[];
  no?: string[];
}

export interface PerfilPublico {
  quien?: string;
  actitud?: string;
}

export interface PerfilVisual {
  colores?: Record<string, string>;
  tipografias?: Record<string, string>;
  estilo?: string;
  logo?: string;
  detalle_adicional?: string;
}

export interface PerfilNegocio {
  tipo_cocina?: string;
  local?: Record<string, unknown>;
  redes?: Record<string, string>;
}

export interface PerfilManifiesto {
  titulo?: string;
  texto: string;
  cierre?: string;
}

export interface PerfilMarca {
  _version?: string;
  _updated_at?: string;
  onboarding_completado: boolean;
  esencia: PerfilEsencia;
  voz: PerfilVoz;
  publico: PerfilPublico;
  visual: PerfilVisual;
  negocio: PerfilNegocio;
  arquetipo?: string;
  manifiesto?: PerfilManifiesto;
}

/** Parche parcial por secciones — lo que acepta update_perfil como `campos` (deep-merge). */
export interface PerfilCampos {
  onboarding_completado?: boolean;
  esencia?: Partial<PerfilEsencia>;
  voz?: Partial<PerfilVoz>;
  publico?: Partial<PerfilPublico>;
  visual?: Partial<PerfilVisual>;
  negocio?: Partial<PerfilNegocio>;
  arquetipo?: string;
  manifiesto?: Partial<PerfilManifiesto>;
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
  onboarding_completado: false,
  esencia: { nombre: '', lema: '', proposito: '', valores: [] },
  voz: { tono: [], registro: '', referencias: [], si: [], no: [] },
  publico: { quien: '', actitud: '' },
  visual: { colores: {}, tipografias: {}, estilo: '', logo: '' },
  negocio: { tipo_cocina: '', local: {}, redes: {} }
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
// PRIMITIVAS — por la puerta del dueño (ui/request/carta-marketing/<op>)
// =============================================================================

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

export async function updatePerfil(campos: PerfilCampos): Promise<boolean> {
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
