/**
 * Carta Design Store
 *
 * Estado del módulo de diseño de cartas impresas.
 * Consumidor READ-ONLY de datos de carta (vía design.load_carta).
 * Gestiona diseños generados, perfiles de estilo y galería.
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { getActiveProject } from '$lib/stores/workspace';

// =============================================================================
// TYPES
// =============================================================================

export interface DesignProfile {
  id: string;
  nombre: string;
  description: string;
  color_palette?: Record<string, string>;
  fonts?: Record<string, string>;
  layout_type?: string;
  style_notes?: string;
  builtin?: boolean;
}

export interface DesignMeta {
  carta_id: string;
  nombre: string;
  profile_id: string | null;
  filename: string;
  size_bytes: number;
  created_at: string;
}

export interface CartaResumen {
  total_productos: number;
  total_categorias: number;
  precio_min: number;
  precio_max: number;
  categorias_stats: Array<{
    id: string;
    nombre: string;
    productos_count: number;
    precio_min: number;
    precio_max: number;
  }>;
}

export interface CartaDesignState {
  // Carta cargada para diseño
  cartaId: string | null;
  cartaNombre: string | null;
  resumen: CartaResumen | null;
  cartaLoaded: boolean;
  // Perfiles
  profiles: DesignProfile[];
  // Galería
  designs: DesignMeta[];
  // UI
  loading: boolean;
  error: string | null;
}

const initialState: CartaDesignState = {
  cartaId: null,
  cartaNombre: null,
  resumen: null,
  cartaLoaded: false,
  profiles: [],
  designs: [],
  loading: false,
  error: null
};

// =============================================================================
// STORE
// =============================================================================

export const cartaDesignStore = writable<CartaDesignState>(initialState);

// =============================================================================
// ACTIONS
// =============================================================================

export async function loadCartaForDesign(cartaId: string): Promise<boolean> {
  cartaDesignStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const project = getActiveProject();
    const res = await mqttRequest<any>('design', 'load-carta', { carta_id: cartaId, project_id: project?.id });
    const data = res.data;

    cartaDesignStore.update(s => ({
      ...s,
      cartaId: data.carta_id,
      cartaNombre: data.nombre,
      resumen: data.resumen || null,
      cartaLoaded: true,
      loading: false
    }));

    return true;
  } catch (error: any) {
    cartaDesignStore.update(s => ({
      ...s,
      loading: false,
      error: error?.message || 'Error al cargar carta'
    }));
    return false;
  }
}

export async function loadProfiles(): Promise<void> {
  try {
    const project = getActiveProject();
    const res = await mqttRequest<any>('design', 'profiles', { project_id: project?.id });
    const data = res.data;
    const all = [...(data.builtin || []), ...(data.custom || [])];
    cartaDesignStore.update(s => ({ ...s, profiles: all }));
  } catch {}
}

export async function loadGallery(cartaId: string): Promise<void> {
  try {
    const project = getActiveProject();
    const res = await mqttRequest<any>('design', 'gallery', { carta_id: cartaId, project_id: project?.id });
    cartaDesignStore.update(s => ({ ...s, designs: res.data.designs || [] }));
  } catch {}
}

export async function saveProfile(profile: Partial<DesignProfile>): Promise<boolean> {
  try {
    const project = getActiveProject();
    await mqttRequest('design', 'save-profile', { ...profile, project_id: project?.id });
    await loadProfiles();
    return true;
  } catch {
    return false;
  }
}

export async function deleteProfile(profileId: string): Promise<boolean> {
  try {
    const project = getActiveProject();
    await mqttRequest('design', 'delete-profile', { profile_id: profileId, project_id: project?.id });
    await loadProfiles();
    return true;
  } catch {
    return false;
  }
}

export function clearDesignError(): void {
  cartaDesignStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// SUBSCRIPTIONS
// =============================================================================

let cleanupFn: (() => void) | null = null;
let initialized = false;

export function initCartaDesignSubscriptions(): () => void {
  // Si ya está inicializado, solo devolver cleanup sin reinicializar
  if (initialized && cleanupFn) {
    return cleanupFn;
  }

  initialized = true;

  // Escuchar cuando menu-generator actualiza la carta
  const unsubscribe = mqttSubscribe('carta.generada', (_topic, payload: any) => {
    const cartaId = payload?.meta?.id || payload?.carta_id;
    cartaDesignStore.update(s => {
      if (s.cartaId === cartaId) {
        // La carta que estamos diseñando cambió → marcar como stale
        return { ...s, cartaLoaded: false };
      }
      return s;
    });
  });

  // Cargar perfiles
  loadProfiles();

  // Guardar cleanup function para cuando se desmonte
  cleanupFn = () => {
    initialized = false;
    unsubscribe();
  };

  return cleanupFn;
}

// =============================================================================
// DERIVED
// =============================================================================

export const designProfiles = derived(cartaDesignStore, $s => $s.profiles);
export const designGallery = derived(cartaDesignStore, $s => $s.designs);
export const designLoading = derived(cartaDesignStore, $s => $s.loading);
export const designError = derived(cartaDesignStore, $s => $s.error);
export const cartaLoaded = derived(cartaDesignStore, $s => $s.cartaLoaded);
export const cartaResumen = derived(cartaDesignStore, $s => $s.resumen);
